use super::Driver;
use crate::error::DriverResult;
use crate::http::{send_text, with_basic_auth, Http};
use crate::model::{QueryResult, Row, SchemaInfo};
use crate::parsers::stringify;
use crate::profile::ConnectionProfile;
use async_trait::async_trait;
use serde_json::Value;

const SCHEMA_SQL: &str = "SELECT table, 'table', name, type, if(startsWith(type, 'Nullable'), 'YES', 'NO'), if(is_in_primary_key, 'YES', 'NO') \
FROM system.columns WHERE database = currentDatabase() ORDER BY table, position";

pub struct ClickHouseDriver {
    profile: ConnectionProfile,
    http: Http,
}

impl ClickHouseDriver {
    pub fn new(profile: ConnectionProfile) -> DriverResult<Self> {
        Ok(Self { http: Http::new(&profile)?, profile })
    }

    fn query(&self, sql: &str, limit: usize) -> reqwest::RequestBuilder {
        let profile = &self.profile;
        let mut parameters = vec![
            ("default_format", "JSONCompact".to_string()),
            ("max_result_rows", (limit.saturating_add(1)).to_string()),
            ("result_overflow_mode", "break".to_string()),
        ];
        if !profile.database.is_empty() {
            parameters.push(("database", profile.database.clone()));
        }
        let user = if profile.user.is_empty() { "default" } else { &profile.user };
        with_basic_auth(self.http.post("/").query(&parameters).body(sql.to_string()), user, &profile.password)
    }
}

fn present(body: &str, limit: usize) -> DriverResult<QueryResult> {
    if body.trim().is_empty() {
        return Ok(QueryResult::message("OK"));
    }
    let reply: Value = serde_json::from_str(body)?;
    let columns: Vec<String> = reply["meta"]
        .as_array()
        .map(|meta| meta.iter().map(|column| column["name"].as_str().unwrap_or("").to_string()).collect())
        .unwrap_or_default();
    let types = reply["meta"]
        .as_array()
        .map(|meta| meta.iter().map(|column| column["type"].as_str().unwrap_or("").to_string()).collect())
        .unwrap_or_default();
    let rows = reply["data"].as_array().cloned().unwrap_or_default().into_iter().map(|row| -> Row {
        row.as_array().map(|cells| cells.iter().map(stringify).collect()).unwrap_or_default()
    });
    Ok(QueryResult::table(columns, rows, limit).with_types(types))
}

#[async_trait]
impl Driver for ClickHouseDriver {
    async fn connect(&self) -> DriverResult<()> {
        send_text(self.query("SELECT 1", 1)).await.map(|_| ())
    }

    async fn disconnect(&self) {}

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        present(&send_text(self.query(input, row_limit)).await?, row_limit)
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let result = self.run(SCHEMA_SQL, None, usize::MAX / 2).await?;
        Ok(SchemaInfo::from_column_rows(&result.rows))
    }
}
