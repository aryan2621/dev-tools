use super::Driver;
use crate::parsers::{json_row};
use crate::error::{DriverError, DriverResult};
use crate::http::{send_json, send_text, Http};
use crate::model::{QueryResult, Row, SchemaInfo};
use crate::parsers::{json_result, objects_result, parse_csv};
use crate::profile::ConnectionProfile;
use async_trait::async_trait;
use reqwest::RequestBuilder;
use serde_json::Value;

const DEFAULT_OPERATION: &str = "influxql";

pub struct InfluxDriver {
    profile: ConnectionProfile,
    http: Http,
}

impl InfluxDriver {
    pub fn new(profile: ConnectionProfile) -> DriverResult<Self> {
        Ok(Self { http: Http::new(&profile)?, profile })
    }

    fn authorize(&self, request: RequestBuilder) -> RequestBuilder {
        match self.profile.password.as_str() {
            "" => request,
            token => request.header("Authorization", format!("Token {token}")),
        }
    }

    async fn influxql(&self, query: &str, limit: usize) -> DriverResult<QueryResult> {
        let request = self
            .http
            .get("/query")
            .query(&[("db", self.profile.database.as_str()), ("q", query)]);
        let reply = send_json(self.authorize(request)).await?;
        if let Some(error) = reply["results"][0]["error"].as_str() {
            return Err(DriverError::message(error));
        }
        let series = reply["results"][0]["series"].as_array().cloned().unwrap_or_default();
        let Some(first) = series.first() else {
            return Ok(QueryResult::message("OK"));
        };
        let columns = first["columns"].as_array().map(|c| c.iter().filter_map(|n| n.as_str().map(String::from)).collect()).unwrap_or_default();
        let rows = series.iter().flat_map(|s| s["values"].as_array().cloned().unwrap_or_default()).map(|row| -> Row {
            json_row(&row)
        });
        Ok(QueryResult::table(columns, rows, limit))
    }

    async fn flux(&self, query: &str, limit: usize) -> DriverResult<QueryResult> {
        let request = self
            .http
            .post("/api/v2/query")
            .query(&[("org", self.profile.option("org"))])
            .header("Content-Type", "application/vnd.flux")
            .header("Accept", "application/csv")
            .body(query.to_string());
        let records: Vec<Vec<String>> = parse_csv(&send_text(self.authorize(request)).await?)?
            .into_iter()
            .filter(|record| !record.iter().all(String::is_empty) && !record[0].starts_with('#'))
            .collect();
        let Some(header) = records.first().cloned() else {
            return Ok(QueryResult::message("OK"));
        };
        let columns: Vec<String> = header.iter().skip(1).cloned().collect();
        let rows = records.into_iter().skip(1).filter(|record| *record != header).map(|record| record.into_iter().skip(1).map(Some).collect::<Row>());
        Ok(QueryResult::table(columns, rows, limit))
    }

    async fn buckets(&self) -> DriverResult<Value> {
        send_json(self.authorize(self.http.get("/api/v2/buckets"))).await
    }
}

#[async_trait]
impl Driver for InfluxDriver {
    async fn connect(&self) -> DriverResult<()> {
        send_text(self.http.get("/ping")).await.map(|_| ())
    }

    async fn run(&self, input: &str, operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        match operation.unwrap_or(DEFAULT_OPERATION) {
            "influxql" => self.influxql(input, row_limit).await,
            "flux" => self.flux(input, row_limit).await,
            "buckets" => {
                let reply = self.buckets().await?;
                let objects: Vec<_> = reply["buckets"].as_array().map(|b| b.iter().filter_map(Value::as_object).collect()).unwrap_or_default();
                Ok(objects_result(&objects, row_limit))
            }
            "ping" => {
                send_text(self.http.get("/ping")).await?;
                Ok(json_result(&Value::String("pong".into()), row_limit))
            }
            other => Err(DriverError::Unsupported(format!("Unknown InfluxDB operation: {other}"))),
        }
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let reply = self.buckets().await?;
        let names = reply["buckets"]
            .as_array()
            .map(|buckets| buckets.iter().filter_map(|b| b["name"].as_str().map(String::from)).collect::<Vec<_>>())
            .unwrap_or_default();
        Ok(SchemaInfo::names("bucket", names))
    }
}
