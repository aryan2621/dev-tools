use super::Driver;
use crate::error::DriverResult;
use crate::model::{QueryResult, SchemaInfo};
use crate::parsers::{json_result, objects_result};
use crate::process::{self, ProcessSpec};
use crate::profile::ConnectionProfile;
use async_trait::async_trait;
use serde_json::Value;

pub struct BigQueryDriver {
    profile: ConnectionProfile,
}

impl BigQueryDriver {
    pub fn new(profile: ConnectionProfile) -> Self {
        Self { profile }
    }

    async fn bq(&self, command: &[String]) -> DriverResult<String> {
        let profile = &self.profile;
        let mut args: Vec<String> = vec!["--format=json".into()];
        if !profile.database.is_empty() {
            args.push(format!("--project_id={}", profile.database));
        }
        if !profile.option("location").is_empty() {
            args.push(format!("--location={}", profile.option("location")));
        }
        args.extend_from_slice(command);
        let program = process::require_for(profile.engine.spec())?;
        Ok(process::run_checked(ProcessSpec::new(program, args)).await?.stdout)
    }

    async fn query(&self, sql: &str, limit: usize) -> DriverResult<String> {
        let command = ["query", "--use_legacy_sql=false", &format!("--max_rows={}", limit.saturating_add(1)), sql];
        self.bq(&command.map(String::from)).await
    }
}

fn present(output: &str, limit: usize) -> DriverResult<QueryResult> {
    let text = output.trim();
    let start = text.find(['[', '{']);
    let Some(start) = start else {
        return Ok(QueryResult::message(if text.is_empty() { "OK" } else { text }));
    };
    let reply: Value = serde_json::from_str(&text[start..])?;
    Ok(match reply.as_array() {
        Some(items) => objects_result(&items.iter().filter_map(Value::as_object).collect::<Vec<_>>(), limit),
        None => json_result(&reply, limit),
    })
}

#[async_trait]
impl Driver for BigQueryDriver {
    async fn connect(&self) -> DriverResult<()> {
        self.query("SELECT 1", 1).await.map(|_| ())
    }

    async fn disconnect(&self) {}

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        present(&self.query(input, row_limit).await?, row_limit)
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let output = self.bq(&["ls".to_string()]).await?;
        let reply: Value = serde_json::from_str(output.trim()).unwrap_or(Value::Null);
        let names = reply
            .as_array()
            .map(|datasets| datasets.iter().filter_map(|d| d["datasetReference"]["datasetId"].as_str().map(String::from)).collect::<Vec<_>>())
            .unwrap_or_default();
        Ok(SchemaInfo::names("dataset", names))
    }
}
