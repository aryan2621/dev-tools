use crate::sender::{file_name, FormField, Prepared, PreparedBody};
use serde::Deserialize;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CodeTarget {
    Curl,
    Javascript,
    Python,
}

struct BodyCode {
    setup: Vec<String>,
    option: Option<String>,
}

impl BodyCode {
    fn none() -> Self {
        BodyCode { setup: vec![], option: None }
    }

    fn option(text: String) -> Self {
        BodyCode { setup: vec![], option: Some(text) }
    }
}

fn literal(text: &str) -> String {
    serde_json::to_string(text).unwrap_or_else(|_| "\"\"".into())
}

fn shell_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', "'\\''"))
}

fn sorted_headers(prepared: &Prepared) -> Vec<&(String, String)> {
    let mut headers: Vec<_> = prepared.headers.iter().collect();
    headers.sort_by_key(|(name, _)| name.to_lowercase());
    headers
}

fn has_files(body: &PreparedBody) -> bool {
    match body {
        PreparedBody::File(_) => true,
        PreparedBody::Multipart(fields) => fields.iter().any(|field| matches!(field, FormField::File { .. })),
        _ => false,
    }
}

fn header_rows(headers: &[&(String, String)]) -> String {
    headers
        .iter()
        .map(|(name, value)| format!("    {}: {}", literal(name), literal(value)))
        .collect::<Vec<_>>()
        .join(",\n")
}

fn curl(prepared: &Prepared) -> String {
    let mut lines = vec![format!("curl -X {} {}", prepared.method.as_str(), shell_quote(&prepared.url))];
    for (name, value) in sorted_headers(prepared) {
        lines.push(format!("-H {}", shell_quote(&format!("{name}: {value}"))));
    }
    match &prepared.body {
        PreparedBody::None => {}
        PreparedBody::Text(text) => lines.push(format!("--data-raw {}", shell_quote(text))),
        PreparedBody::File(path) => lines.push(format!("--data-binary {}", shell_quote(&format!("@{path}")))),
        PreparedBody::Multipart(fields) => {
            for field in fields {
                let part = match field {
                    FormField::Text { name, value } => format!("{name}={value}"),
                    FormField::File { name, path } => format!("{name}=@{path}"),
                };
                lines.push(format!("-F {}", shell_quote(&part)));
            }
        }
    }
    lines.join(" \\\n  ")
}

fn javascript_body(body: &PreparedBody) -> BodyCode {
    match body {
        PreparedBody::None => BodyCode::none(),
        PreparedBody::Text(text) => BodyCode::option(format!("  body: {}", literal(text))),
        PreparedBody::File(path) => BodyCode::option(format!("  body: await openAsBlob({})", literal(path))),
        PreparedBody::Multipart(fields) => {
            let mut setup = vec!["const form = new FormData();".to_string()];
            for field in fields {
                setup.push(match field {
                    FormField::Text { name, value } => format!("form.append({}, {});", literal(name), literal(value)),
                    FormField::File { name, path } => format!(
                        "form.append({}, await openAsBlob({}), {});",
                        literal(name),
                        literal(path),
                        literal(&file_name(path))
                    ),
                });
            }
            BodyCode { setup, option: Some("  body: form".into()) }
        }
    }
}

fn javascript(prepared: &Prepared) -> String {
    let mut lines = Vec::new();
    if has_files(&prepared.body) {
        lines.push(r#"import { openAsBlob } from "node:fs";"#.to_string());
        lines.push(String::new());
    }
    let body = javascript_body(&prepared.body);
    lines.extend(body.setup);
    let mut options = vec![format!("  method: {}", literal(prepared.method.as_str()))];
    let headers = sorted_headers(prepared);
    if !headers.is_empty() {
        options.push(format!("  headers: {{\n{}\n  }}", header_rows(&headers)));
    }
    options.extend(body.option);
    lines.push(format!(
        "const response = await fetch({}, {{\n{}\n}});",
        literal(&prepared.url),
        options.join(",\n")
    ));
    lines.push("const data = await response.text();".into());
    lines.join("\n")
}

fn python_body(body: &PreparedBody) -> BodyCode {
    match body {
        PreparedBody::None => BodyCode::none(),
        PreparedBody::Text(text) => BodyCode::option(format!("data={}", literal(text))),
        PreparedBody::File(path) => BodyCode::option(format!(r#"data=open({}, "rb")"#, literal(path))),
        PreparedBody::Multipart(fields) => {
            let rows: Vec<String> = fields
                .iter()
                .map(|field| match field {
                    FormField::Text { name, value } => format!("    ({}, (None, {}))", literal(name), literal(value)),
                    FormField::File { name, path } => format!(
                        r#"    ({}, ({}, open({}, "rb")))"#,
                        literal(name),
                        literal(&file_name(path)),
                        literal(path)
                    ),
                })
                .collect();
            BodyCode {
                setup: vec![format!("files = [\n{}\n]", rows.join(",\n"))],
                option: Some("files=files".into()),
            }
        }
    }
}

fn python(prepared: &Prepared) -> String {
    let mut arguments = vec![literal(prepared.method.as_str()), literal(&prepared.url)];
    let mut lines = vec!["import requests".to_string(), String::new()];
    let headers = sorted_headers(prepared);
    if !headers.is_empty() {
        lines.push(format!("headers = {{\n{}\n}}", header_rows(&headers)));
        arguments.push("headers=headers".into());
    }
    let body = python_body(&prepared.body);
    lines.extend(body.setup);
    arguments.extend(body.option);
    lines.push(format!("response = requests.request({})", arguments.join(", ")));
    lines.push("print(response.text)".into());
    lines.join("\n")
}

pub fn generate(target: CodeTarget, prepared: &Prepared) -> String {
    match target {
        CodeTarget::Curl => curl(prepared),
        CodeTarget::Javascript => javascript(prepared),
        CodeTarget::Python => python(prepared),
    }
}
