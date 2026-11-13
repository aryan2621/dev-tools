use super::Driver;
use crate::engine::EngineKind;
use crate::error::{DriverError, DriverResult};
use crate::http::{parse_json_input, send_json, with_basic_auth, Http};
use crate::model::{QueryResult, Row, SchemaInfo};
use crate::parsers::{json_result, objects_result, stringify};
use crate::profile::ConnectionProfile;
use async_trait::async_trait;
use reqwest::RequestBuilder;
use serde_json::{Map, Value};

const DEFAULT_OPERATION: &str = "_search";

pub struct ElasticDriver {
    profile: ConnectionProfile,
    http: Http,
}

impl ElasticDriver {
    pub fn new(profile: ConnectionProfile) -> DriverResult<Self> {
        Ok(Self { http: Http::new(&profile)?, profile })
    }

    fn authorize(&self, request: RequestBuilder) -> RequestBuilder {
        let profile = &self.profile;
        if profile.user.is_empty() && !profile.password.is_empty() {
            request.header("Authorization", format!("ApiKey {}", profile.password))
        } else {
            with_basic_auth(request, &profile.user, &profile.password)
        }
    }

    fn sql_path(&self) -> &'static str {
        if self.profile.engine == EngineKind::Opensearch {
            "/_plugins/_sql"
        } else {
            "/_sql?format=json"
        }
    }
}

fn is_read_only(operation: &str) -> bool {
    operation == "_mapping" || operation == "_cluster/health" || operation.starts_with("_cat/")
}

fn hits_result(hits: &[Value], limit: usize) -> QueryResult {
    let sources: Vec<Map<String, Value>> = hits
        .iter()
        .map(|hit| {
            let mut row = Map::new();
            for key in ["_index", "_id", "_score"] {
                row.insert(key.into(), hit.get(key).cloned().unwrap_or(Value::Null));
            }
            if let Some(source) = hit.get("_source").and_then(Value::as_object) {
                row.extend(source.clone());
            }
            row
        })
        .collect();
    objects_result(&sources.iter().collect::<Vec<_>>(), limit)
}

fn sql_result(reply: &Value, limit: usize) -> Option<QueryResult> {
    let (names, rows) = match (reply.get("columns"), reply.get("rows"), reply.get("schema"), reply.get("datarows")) {
        (Some(columns), Some(rows), _, _) => (columns, rows),
        (_, _, Some(schema), Some(rows)) => (schema, rows),
        _ => return None,
    };
    let columns = names
        .as_array()?
        .iter()
        .map(|column| column.get("name").and_then(Value::as_str).unwrap_or("").to_string())
        .collect();
    let rows = rows.as_array()?.iter().map(|row| -> Row {
        row.as_array().map(|cells| cells.iter().map(stringify).collect()).unwrap_or_default()
    });
    Some(QueryResult::table(columns, rows, limit))
}

fn present(reply: &Value, limit: usize) -> QueryResult {
    if let Some(hits) = reply.pointer("/hits/hits").and_then(Value::as_array) {
        return hits_result(hits, limit);
    }
    sql_result(reply, limit).unwrap_or_else(|| json_result(reply, limit))
}

#[async_trait]
impl Driver for ElasticDriver {
    async fn connect(&self) -> DriverResult<()> {
        send_json(self.authorize(self.http.get("/"))).await.map(|_| ())
    }

    async fn disconnect(&self) {}

    async fn run(&self, input: &str, operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        let operation = operation.unwrap_or(DEFAULT_OPERATION);
        let mut body = parse_json_input(input)?;
        let index = body
            .as_object_mut()
            .and_then(|object| object.remove("_index"))
            .and_then(|value| value.as_str().map(String::from));
        let request = if operation == "_sql" {
            self.http.post(self.sql_path())
        } else {
            let prefix = match (&index, operation.starts_with("_cat/") || operation == "_cluster/health") {
                (Some(index), false) => format!("/{index}"),
                _ => String::new(),
            };
            let suffix = if operation.starts_with("_cat/") { "?format=json" } else { "" };
            let path = format!("{prefix}/{operation}{suffix}");
            if is_read_only(operation) {
                self.http.get(&path)
            } else {
                self.http.post(&path)
            }
        };
        let request = if is_read_only(operation) { request } else { request.json(&body) };
        let reply = send_json(self.authorize(request)).await?;
        Ok(present(&reply, row_limit))
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let reply = send_json(self.authorize(self.http.get("/_cat/indices?format=json"))).await?;
        let mut names: Vec<String> = reply
            .as_array()
            .ok_or_else(|| DriverError::message("Unexpected index listing."))?
            .iter()
            .filter_map(|index| index.get("index").and_then(Value::as_str).map(String::from))
            .filter(|name| !name.starts_with('.'))
            .collect();
        names.sort();
        Ok(SchemaInfo::names("index", names))
    }
}
