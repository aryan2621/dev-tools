use super::Driver;
use crate::error::{DriverError, DriverResult};
use crate::http::{send_json, with_basic_auth, Http};
use crate::model::{QueryResult, Row, SchemaInfo};
use crate::parsers::stringify;
use crate::profile::ConnectionProfile;
use async_trait::async_trait;
use serde_json::{json, Value};

const DEFAULT_DATABASE: &str = "neo4j";

pub struct Neo4jDriver {
    profile: ConnectionProfile,
    http: Http,
}

impl Neo4jDriver {
    pub fn new(profile: ConnectionProfile) -> DriverResult<Self> {
        Ok(Self { http: Http::new(&profile)?, profile })
    }

    async fn commit(&self, statement: &str) -> DriverResult<Value> {
        let database = if self.profile.database.is_empty() { DEFAULT_DATABASE } else { &self.profile.database };
        let body = json!({ "statements": [{ "statement": statement, "resultDataContents": ["row"] }] });
        let request = with_basic_auth(
            self.http.post(&format!("/db/{database}/tx/commit")).json(&body),
            &self.profile.user,
            &self.profile.password,
        );
        let reply = send_json(request).await?;
        match reply["errors"].as_array().and_then(|errors| errors.first()) {
            Some(error) => Err(DriverError::message(format!(
                "{}\n{}",
                error["code"].as_str().unwrap_or(""),
                error["message"].as_str().unwrap_or("")
            ))),
            None => Ok(reply),
        }
    }
}

#[async_trait]
impl Driver for Neo4jDriver {
    async fn connect(&self) -> DriverResult<()> {
        self.commit("RETURN 1").await.map(|_| ())
    }

    async fn disconnect(&self) {}

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        let reply = self.commit(input).await?;
        let result = &reply["results"][0];
        let columns: Vec<String> = result["columns"]
            .as_array()
            .map(|columns| columns.iter().filter_map(|c| c.as_str().map(String::from)).collect())
            .unwrap_or_default();
        if columns.is_empty() {
            return Ok(QueryResult::message("OK"));
        }
        let rows = result["data"].as_array().cloned().unwrap_or_default().into_iter().map(|entry| -> Row {
            entry["row"].as_array().map(|cells| cells.iter().map(stringify).collect()).unwrap_or_default()
        });
        Ok(QueryResult::table(columns, rows, row_limit))
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let result = self.run("CALL db.labels() YIELD label RETURN label ORDER BY label", None, usize::MAX / 2).await?;
        let labels = result.rows.into_iter().filter_map(|row| row.into_iter().next().flatten()).collect::<Vec<_>>();
        Ok(SchemaInfo::names("label", labels))
    }
}
