use crate::error::{DriverError, DriverResult};
use crate::profile::ConnectionProfile;
use reqwest::{Client, RequestBuilder};
use serde_json::Value;
use std::time::Duration;

pub struct Http {
    client: Client,
    base: String,
}

impl Http {
    pub fn new(profile: &ConnectionProfile) -> DriverResult<Self> {
        let client = Client::builder()
            .danger_accept_invalid_certs(profile.trust_server_cert())
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(600))
            .build()?;
        Ok(Self { client, base: profile.http_base_url() })
    }

    pub fn get(&self, path: &str) -> RequestBuilder {
        self.client.get(format!("{}{}", self.base, path))
    }

    pub fn post(&self, path: &str) -> RequestBuilder {
        self.client.post(format!("{}{}", self.base, path))
    }
}

pub async fn send_text(request: RequestBuilder) -> DriverResult<String> {
    let response = request.send().await?;
    let status = response.status();
    let body = response.text().await?;
    if status.is_success() {
        Ok(body)
    } else {
        let detail = body.trim();
        Err(DriverError::message(if detail.is_empty() { status.to_string() } else { format!("{status}\n{detail}") }))
    }
}

pub async fn send_json(request: RequestBuilder) -> DriverResult<Value> {
    let body = send_text(request).await?;
    Ok(serde_json::from_str(&body)?)
}

pub fn parse_json_input(input: &str) -> DriverResult<Value> {
    if input.trim().is_empty() {
        return Ok(Value::Object(Default::default()));
    }
    serde_json::from_str(input).map_err(|e| DriverError::message(format!("Input is not valid JSON: {e}")))
}

pub fn with_basic_auth(request: RequestBuilder, user: &str, password: &str) -> RequestBuilder {
    if user.is_empty() {
        request
    } else {
        request.basic_auth(user, Some(password))
    }
}
