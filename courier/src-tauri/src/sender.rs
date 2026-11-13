use crate::{
    jsonpath,
    models::{
        ApiResponse, AuthType, BodyType, Capture, CookieRow, Header, Method, Request, RequestSettings,
    },
    substitution::{resolve, Variables},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{
    header::{CONTENT_TYPE, SET_COOKIE},
    multipart::{Form, Part},
    redirect::Policy,
    RequestBuilder,
};
use std::{error::Error, path::Path, time::{Duration, Instant}};
use url::Url;

pub enum FormField {
    Text { name: String, value: String },
    File { name: String, path: String },
}

pub enum PreparedBody {
    None,
    Text(String),
    Multipart(Vec<FormField>),
    File(String),
}

pub struct Prepared {
    pub method: Method,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: PreparedBody,
}

fn set_header(headers: &mut Vec<(String, String)>, name: String, value: String) {
    match headers.iter_mut().find(|(existing, _)| existing.eq_ignore_ascii_case(&name)) {
        Some(slot) => slot.1 = value,
        None => headers.push((name, value)),
    }
}

fn set_header_default(headers: &mut Vec<(String, String)>, name: &str, value: &str) {
    if !headers.iter().any(|(existing, _)| existing.eq_ignore_ascii_case(name)) {
        headers.push((name.into(), value.into()));
    }
}

fn build_url(request: &Request, variables: &Variables) -> Result<String, String> {
    let resolve = |text: &str| resolve(text, variables);
    let raw = resolve(&request.url).trim().to_string();
    if raw.is_empty() {
        return Err("Enter a request URL.".into());
    }
    let with_scheme = if raw.contains("://") { raw.clone() } else { format!("https://{raw}") };
    let mut url = Url::parse(&with_scheme).map_err(|_| format!("Invalid URL: {raw}"))?;
    let auth = &request.auth;
    if auth.kind == AuthType::ApiKey && auth.key_in_query && !auth.key_name.is_empty() {
        url.query_pairs_mut()
            .append_pair(&resolve(&auth.key_name), &resolve(&auth.key_value));
    }
    Ok(url.to_string())
}

fn apply_auth(request: &Request, variables: &Variables, headers: &mut Vec<(String, String)>) {
    let resolve = |text: &str| resolve(text, variables);
    let auth = &request.auth;
    match auth.kind {
        AuthType::None => {}
        AuthType::Bearer => set_header(
            headers,
            "Authorization".into(),
            format!("Bearer {}", resolve(&auth.token)),
        ),
        AuthType::Basic => {
            let credentials = format!("{}:{}", resolve(&auth.username), resolve(&auth.password));
            set_header(
                headers,
                "Authorization".into(),
                format!("Basic {}", STANDARD.encode(credentials)),
            );
        }
        AuthType::ApiKey => {
            if !auth.key_in_query && !auth.key_name.is_empty() {
                set_header(headers, resolve(&auth.key_name), resolve(&auth.key_value));
            }
        }
    }
}

fn build_body(request: &Request, variables: &Variables, headers: &mut Vec<(String, String)>) -> PreparedBody {
    let resolve = |text: &str| resolve(text, variables);
    let body = &request.body;
    let kind = if request.method.allows_body() { body.kind } else { BodyType::None };
    match kind {
        BodyType::None => PreparedBody::None,
        BodyType::Json | BodyType::Text => {
            let content_type = if kind == BodyType::Json { "application/json" } else { "text/plain" };
            set_header_default(headers, "Content-Type", content_type);
            PreparedBody::Text(resolve(&body.raw))
        }
        BodyType::FormUrlEncoded => {
            set_header_default(headers, "Content-Type", "application/x-www-form-urlencoded");
            let pairs = body
                .form_items
                .iter()
                .filter(|item| item.is_active())
                .map(|item| (resolve(&item.key), resolve(&item.value)));
            PreparedBody::Text(url::form_urlencoded::Serializer::new(String::new()).extend_pairs(pairs).finish())
        }
        BodyType::Graphql => {
            set_header_default(headers, "Content-Type", "application/json");
            let mut payload = serde_json::json!({ "query": resolve(&body.raw) });
            if let Ok(variables) = serde_json::from_str::<serde_json::Value>(&resolve(&body.graphql_variables)) {
                payload["variables"] = variables;
            }
            PreparedBody::Text(payload.to_string())
        }
        BodyType::Multipart => PreparedBody::Multipart(
            body.form_items
                .iter()
                .filter(|item| item.is_active())
                .map(|item| {
                    let name = resolve(&item.key);
                    if item.is_file {
                        FormField::File { name, path: resolve(&item.file_path) }
                    } else {
                        FormField::Text { name, value: resolve(&item.value) }
                    }
                })
                .collect(),
        ),
        BodyType::Binary => {
            set_header_default(headers, "Content-Type", "application/octet-stream");
            PreparedBody::File(resolve(&body.file_path))
        }
    }
}

pub fn missing_file(request: &Request) -> Option<String> {
    let body = &request.body;
    if !request.method.allows_body() {
        return None;
    }
    match body.kind {
        BodyType::Binary if body.file_path.trim().is_empty() => Some("Choose a file for the binary body.".into()),
        BodyType::Multipart => body
            .form_items
            .iter()
            .find(|item| item.is_active() && item.is_file && item.file_path.trim().is_empty())
            .map(|item| format!("Choose a file for form field \"{}\".", item.key.trim())),
        _ => None,
    }
}

pub fn prepare(request: &Request, variables: &Variables) -> Result<Prepared, String> {
    if let Some(message) = missing_file(request) {
        return Err(message);
    }
    let url = build_url(request, variables)?;
    let mut headers: Vec<(String, String)> = Vec::new();
    for header in request.headers.iter().filter(|header| header.is_active()) {
        set_header(&mut headers, resolve(&header.key, variables), resolve(&header.value, variables));
    }
    apply_auth(request, variables, &mut headers);
    let body = build_body(request, variables, &mut headers);
    Ok(Prepared { method: request.method, url, headers, body })
}

fn error_chain(error: &dyn Error) -> String {
    let mut message = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        message.push_str(": ");
        message.push_str(&cause.to_string());
        source = cause.source();
    }
    message
}

fn describe(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "The request timed out.".into()
    } else if error.is_connect() {
        format!("Could not connect to the server. {}", error_chain(&error))
    } else {
        error_chain(&error)
    }
}

async fn read_file(path: &str) -> Result<Vec<u8>, String> {
    tokio::fs::read(path).await.map_err(|_| format!("Cannot read file: {path}"))
}

pub fn file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

async fn attach_body(builder: RequestBuilder, body: &PreparedBody) -> Result<RequestBuilder, String> {
    Ok(match body {
        PreparedBody::None => builder,
        PreparedBody::Text(text) => builder.body(text.clone()),
        PreparedBody::File(path) => builder.body(read_file(path).await?),
        PreparedBody::Multipart(fields) => {
            let mut form = Form::new();
            for field in fields {
                form = match field {
                    FormField::Text { name, value } => form.text(name.clone(), value.clone()),
                    FormField::File { name, path } => {
                        let part = Part::bytes(read_file(path).await?).file_name(file_name(path));
                        form.part(name.clone(), part)
                    }
                };
            }
            builder.multipart(form)
        }
    })
}

fn parse_cookie(raw: &str) -> Option<CookieRow> {
    let mut parts = raw.split(';').map(str::trim);
    let (name, value) = parts.next()?.split_once('=')?;
    Some(CookieRow {
        name: name.trim().into(),
        value: value.trim().into(),
        detail: parts.filter(|part| !part.is_empty()).collect::<Vec<_>>().join("; "),
    })
}

fn pretty_json(text: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    serde_json::to_string_pretty(&value).ok()
}

async fn transfer(prepared: &Prepared, settings: &RequestSettings) -> Result<ApiResponse, String> {
    let client = reqwest::Client::builder()
        .redirect(if settings.follow_redirects { Policy::limited(10) } else { Policy::none() })
        .danger_accept_invalid_certs(settings.allow_insecure_tls)
        .timeout(Duration::from_secs_f64(settings.timeout.max(1.0)))
        .build()
        .map_err(describe)?;
    let method = reqwest::Method::from_bytes(prepared.method.as_str().as_bytes()).map_err(|error| error.to_string())?;
    let mut builder = client.request(method, &prepared.url);
    for (name, value) in &prepared.headers {
        builder = builder.header(name, value);
    }
    let reply = attach_body(builder, &prepared.body).await?.send().await.map_err(describe)?;

    let status = reply.status();
    let resolved_url = reply.url().to_string();
    let mut headers: Vec<Header> = reply
        .headers()
        .iter()
        .map(|(name, value)| Header {
            name: name.to_string(),
            value: String::from_utf8_lossy(value.as_bytes()).into_owned(),
        })
        .collect();
    headers.sort_by_key(|header| header.name.to_lowercase());
    let cookies = reply
        .headers()
        .get_all(SET_COOKIE)
        .iter()
        .filter_map(|value| parse_cookie(&String::from_utf8_lossy(value.as_bytes())))
        .collect();
    let mime_type = reply
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(|value| value.trim().to_lowercase());
    let bytes = reply.bytes().await.map_err(describe)?.to_vec();

    let text = std::str::from_utf8(&bytes).ok();
    let image_data_url = mime_type
        .as_deref()
        .filter(|mime| mime.starts_with("image/") && !bytes.is_empty())
        .map(|mime| format!("data:{mime};base64,{}", STANDARD.encode(&bytes)));
    Ok(ApiResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").into(),
        headers,
        cookies,
        body: text.unwrap_or_default().into(),
        pretty_body: text.filter(|text| !text.is_empty()).and_then(pretty_json),
        binary: text.is_none(),
        image_data_url,
        size: bytes.len(),
        resolved_url,
        mime_type,
        bytes,
        ..Default::default()
    })
}

fn captures(request: &Request, bytes: &[u8]) -> Vec<Capture> {
    request
        .captures
        .iter()
        .filter(|capture| capture.is_active())
        .filter_map(|capture| {
            Some(Capture {
                name: capture.key.trim().into(),
                value: jsonpath::value(bytes, capture.value.trim())?,
            })
        })
        .collect()
}

pub async fn send(request: &Request, variables: &Variables) -> ApiResponse {
    let prepared = match prepare(request, variables) {
        Ok(prepared) => prepared,
        Err(message) => return ApiResponse::failure(message, String::new(), 0.0),
    };
    let started = Instant::now();
    let outcome = transfer(&prepared, &request.settings).await;
    let duration_ms = started.elapsed().as_secs_f64() * 1000.0;
    match outcome {
        Ok(mut response) => {
            response.duration_ms = duration_ms;
            response.captured = captures(request, &response.bytes);
            response
        }
        Err(message) => ApiResponse::failure(message, prepared.url, duration_ms),
    }
}
