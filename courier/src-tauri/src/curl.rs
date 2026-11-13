use crate::models::{AuthType, BodyType, KvItem, Method, Request};
use url::Url;

fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut has_token = false;
    let mut quote: Option<char> = None;
    let mut chars = text.chars();
    while let Some(ch) = chars.next() {
        if let Some(open) = quote {
            if ch == open {
                quote = None;
            } else if ch == '\\' && open == '"' {
                match chars.next() {
                    Some(next) if "\"\\$`".contains(next) => current.push(next),
                    Some(next) => {
                        current.push(ch);
                        current.push(next);
                    }
                    None => current.push(ch),
                }
            } else {
                current.push(ch);
            }
            continue;
        }
        match ch {
            '\'' | '"' => {
                quote = Some(ch);
                has_token = true;
            }
            '\\' => match chars.next() {
                Some('\n') | None => {}
                Some(next) => {
                    current.push(next);
                    has_token = true;
                }
            },
            ' ' | '\t' | '\n' => {
                if has_token {
                    tokens.push(std::mem::take(&mut current));
                }
                has_token = false;
            }
            _ => {
                current.push(ch);
                has_token = true;
            }
        }
    }
    if has_token {
        tokens.push(current);
    }
    tokens
}

fn add_header(header: &str, request: &mut Request) {
    if let Some((key, value)) = header.split_once(':') {
        request.headers.push(KvItem::pair(key.trim(), value.trim()));
    }
}

fn header_value(request: &Request, name: &str) -> Option<String> {
    request
        .headers
        .iter()
        .find(|header| header.key.eq_ignore_ascii_case(name))
        .map(|header| header.value.to_lowercase())
}

fn form_item(field: &str) -> KvItem {
    let (name, value) = field.split_once('=').unwrap_or((field, ""));
    let mut item = KvItem::pair(name.trim(), value);
    if let Some(path) = value.strip_prefix('@') {
        item.is_file = true;
        item.value.clear();
        item.file_path = path.split(";type=").next().unwrap_or(path).into();
    }
    item
}

fn apply_body(parts: &[String], request: &mut Request) {
    if parts.is_empty() {
        return;
    }
    let raw = parts.join("&");
    let content_type = header_value(request, "content-type").unwrap_or_default();
    if content_type.contains("x-www-form-urlencoded") {
        request.body.kind = BodyType::FormUrlEncoded;
        request.body.form_items = url::form_urlencoded::parse(raw.as_bytes())
            .map(|(key, value)| KvItem::pair(&key, &value))
            .collect();
        request.headers.retain(|header| !header.key.eq_ignore_ascii_case("content-type"));
        return;
    }
    let looks_like_json = content_type.contains("json") || raw.starts_with('{') || raw.starts_with('[');
    request.body.kind = if looks_like_json { BodyType::Json } else { BodyType::Text };
    request.body.raw = raw;
}

fn display_name(url: &str) -> String {
    let with_scheme = if url.contains("://") { url.to_string() } else { format!("https://{url}") };
    Url::parse(&with_scheme)
        .ok()
        .and_then(|parsed| {
            parsed
                .path_segments()
                .and_then(|mut segments| segments.rfind(|segment| !segment.is_empty()).map(String::from))
        })
        .unwrap_or_else(|| url.to_string())
}

pub fn parse(command: &str) -> Option<Request> {
    let trimmed = command.trim();
    if !(trimmed.starts_with("curl ") || trimmed.starts_with("curl\n")) {
        return None;
    }
    let mut tokens = tokenize(trimmed).into_iter().skip(1);
    let mut request = Request::default();
    let mut explicit_method = None;
    let mut body_parts = Vec::new();
    let mut form_items = Vec::new();
    while let Some(token) = tokens.next() {
        match token.as_str() {
            "-X" | "--request" => explicit_method = tokens.next().and_then(|name| Method::parse(&name)),
            "-H" | "--header" => {
                if let Some(header) = tokens.next() {
                    add_header(&header, &mut request);
                }
            }
            "-d" | "--data" | "--data-raw" | "--data-binary" | "--data-ascii" | "--data-urlencode" => {
                body_parts.extend(tokens.next());
            }
            "-F" | "--form" => form_items.extend(tokens.next().map(|field| form_item(&field))),
            "-I" | "--head" => explicit_method = Some(Method::Head),
            "-u" | "--user" => {
                if let Some(credentials) = tokens.next() {
                    let (username, password) = credentials.split_once(':').unwrap_or((&credentials, ""));
                    request.auth.kind = AuthType::Basic;
                    request.auth.username = username.into();
                    request.auth.password = password.into();
                }
            }
            "-A" | "--user-agent" => {
                if let Some(agent) = tokens.next() {
                    request.headers.push(KvItem::pair("User-Agent", &agent));
                }
            }
            "-b" | "--cookie" => {
                if let Some(cookie) = tokens.next() {
                    request.headers.push(KvItem::pair("Cookie", &cookie));
                }
            }
            "--url" => request.url = tokens.next().unwrap_or_default(),
            "-o" | "--output" | "-m" | "--max-time" | "--connect-timeout" | "-e" | "--referer" | "-w"
            | "--write-out" => {
                tokens.next();
            }
            other => {
                if !other.starts_with('-') && request.url.is_empty() {
                    request.url = other.into();
                }
            }
        }
    }
    if request.url.is_empty() {
        return None;
    }
    if form_items.is_empty() {
        apply_body(&body_parts, &mut request);
    } else {
        request.body.kind = BodyType::Multipart;
        request.body.form_items = form_items;
    }
    let has_body = !body_parts.is_empty() || request.body.kind == BodyType::Multipart;
    request.method = explicit_method.unwrap_or(if has_body { Method::Post } else { Method::Get });
    request.name = display_name(&request.url);
    Some(request)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_method_headers_and_body() {
        let request = parse(r#"curl -X PUT https://api.test/users/1 -H 'Accept: application/json' -d '{"a":1}'"#).unwrap();
        assert_eq!(request.method, Method::Put);
        assert_eq!(request.url, "https://api.test/users/1");
        assert_eq!(request.headers.len(), 1);
        assert_eq!(request.body.raw, r#"{"a":1}"#);
    }

    #[test]
    fn data_without_method_defaults_to_post() {
        assert_eq!(parse("curl https://api.test -d x=1").unwrap().method, Method::Post);
    }

    #[test]
    fn rejects_non_curl_and_urlless_input() {
        assert!(parse("wget https://api.test").is_none());
        assert!(parse("curl -X GET").is_none());
    }
}
