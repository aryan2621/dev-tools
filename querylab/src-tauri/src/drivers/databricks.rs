use super::Driver;
use crate::error::{DriverError, DriverResult};
use crate::http::{send_json, Http};
use crate::model::{QueryResult, Row, SchemaInfo};
use crate::parsers::stringify;
use crate::profile::ConnectionProfile;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::{sync::Mutex, time::Duration};

const POLL_INTERVAL: Duration = Duration::from_secs(1);
const STATEMENTS: &str = "/api/2.0/sql/statements";

pub struct DatabricksDriver {
    profile: ConnectionProfile,
    http: Http,
    statement_id: Mutex<Option<String>>,
}

impl DatabricksDriver {
    pub fn new(profile: ConnectionProfile) -> DriverResult<Self> {
        Ok(Self { http: Http::new(&profile)?, profile, statement_id: Mutex::new(None) })
    }

    fn warehouse_id(&self) -> DriverResult<String> {
        self.profile
            .option("httpPath")
            .rsplit('/')
            .next()
            .filter(|id| !id.is_empty())
            .map(String::from)
            .ok_or_else(|| DriverError::message("Set the SQL warehouse HTTP path (for example /sql/1.0/warehouses/abc123)."))
    }

    fn token(&self) -> &str {
        &self.profile.password
    }

    async fn execute(&self, sql: &str, limit: usize) -> DriverResult<Value> {
        let profile = &self.profile;
        let mut body = json!({
            "statement": sql,
            "warehouse_id": self.warehouse_id()?,
            "wait_timeout": "30s",
            "on_wait_timeout": "CONTINUE",
            "row_limit": limit.saturating_add(1).min(i64::MAX as usize),
            "disposition": "INLINE",
            "format": "JSON_ARRAY",
        });
        if !profile.database.is_empty() {
            body["catalog"] = profile.database.clone().into();
        }
        if !profile.option("schema").is_empty() {
            body["schema"] = profile.option("schema").into();
        }
        let mut reply = send_json(self.http.post(STATEMENTS).bearer_auth(self.token()).json(&body)).await?;
        let id = reply["statement_id"].as_str().unwrap_or("").to_string();
        *self.statement_id.lock().unwrap() = Some(id.clone());
        while matches!(reply["status"]["state"].as_str(), Some("PENDING" | "RUNNING")) {
            tokio::time::sleep(POLL_INTERVAL).await;
            reply = send_json(self.http.get(&format!("{STATEMENTS}/{id}")).bearer_auth(self.token())).await?;
        }
        *self.statement_id.lock().unwrap() = None;
        match reply["status"]["state"].as_str() {
            Some("SUCCEEDED") => Ok(reply),
            Some("CANCELED") => Err(DriverError::Cancelled),
            _ => Err(DriverError::message(reply["status"]["error"]["message"].as_str().unwrap_or("Statement failed."))),
        }
    }
}

fn present(reply: &Value, limit: usize) -> QueryResult {
    let columns = reply["manifest"]["schema"]["columns"].as_array();
    let Some(columns) = columns.filter(|columns| !columns.is_empty()) else {
        return QueryResult::message("OK");
    };
    let names = columns.iter().map(|column| column["name"].as_str().unwrap_or("").to_string()).collect();
    let types = columns.iter().map(|column| column["type_text"].as_str().unwrap_or("").to_string()).collect();
    let rows = reply["result"]["data_array"].as_array().cloned().unwrap_or_default().into_iter().map(|row| -> Row {
        row.as_array().map(|cells| cells.iter().map(stringify).collect()).unwrap_or_default()
    });
    QueryResult::table(names, rows, limit).with_types(types)
}

#[async_trait]
impl Driver for DatabricksDriver {
    async fn connect(&self) -> DriverResult<()> {
        self.execute("SELECT 1", 1).await.map(|_| ())
    }

    async fn disconnect(&self) {}

    async fn cancel(&self) {
        let id = self.statement_id.lock().unwrap().clone();
        if let Some(id) = id {
            let _ = self.http.post(&format!("{STATEMENTS}/{id}/cancel")).bearer_auth(self.token()).send().await;
        }
    }

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        Ok(present(&self.execute(input, row_limit).await?, row_limit))
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let catalog = &self.profile.database;
        if catalog.is_empty() {
            return Ok(SchemaInfo::note("Set a catalog on the connection to browse its tables."));
        }
        let schema = if self.profile.option("schema").is_empty() { "default" } else { self.profile.option("schema") };
        let sql = format!(
            "SELECT c.table_name, t.table_type, c.column_name, c.data_type, c.is_nullable, 'NO' \
             FROM `{catalog}`.information_schema.columns c \
             JOIN `{catalog}`.information_schema.tables t \
               ON t.table_schema = c.table_schema AND t.table_name = c.table_name \
             WHERE c.table_schema = '{schema}' ORDER BY c.table_name, c.ordinal_position"
        );
        let result = self.run(&sql, None, usize::MAX / 2).await?;
        Ok(SchemaInfo::from_column_rows(&result.rows))
    }
}
