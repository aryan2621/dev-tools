use super::Driver;
use crate::error::{DriverError, DriverResult};
use crate::http::parse_json_input;
use crate::model::{QueryResult, SchemaInfo};
use crate::parsers::{json_result, objects_result};
use crate::process::{self, ProcessSpec};
use crate::profile::ConnectionProfile;
use async_trait::async_trait;
use serde_json::{Map, Value};

const DEFAULT_OPERATION: &str = "list-tables";

pub struct DynamoDbDriver {
    profile: ConnectionProfile,
}

impl DynamoDbDriver {
    pub fn new(profile: ConnectionProfile) -> Self {
        Self { profile }
    }

    async fn call(&self, operation: &str, input: &Value) -> DriverResult<Value> {
        let profile = &self.profile;
        let mut args: Vec<String> = vec![
            "dynamodb".into(),
            operation.into(),
            "--cli-input-json".into(),
            input.to_string(),
            "--output".into(),
            "json".into(),
            "--no-cli-pager".into(),
        ];
        for (flag, value) in [("--region", &profile.region), ("--profile", &profile.aws_profile), ("--endpoint-url", &profile.endpoint_url)] {
            if !value.is_empty() {
                args.extend([flag.into(), value.clone()]);
            }
        }
        let program = process::require_for(profile.engine.spec())?;
        let output = process::run_checked(ProcessSpec::new(program, args)).await?;
        if output.stdout.trim().is_empty() {
            return Ok(Value::Null);
        }
        Ok(serde_json::from_str(&output.stdout)?)
    }
}

fn unwrap_attribute(value: &Value) -> Value {
    let Some((tag, inner)) = value.as_object().and_then(|object| object.iter().next()) else {
        return value.clone();
    };
    match tag.as_str() {
        "S" | "BOOL" | "SS" | "B" | "BS" => inner.clone(),
        "N" => inner.as_str().and_then(|text| serde_json::from_str(text).ok()).unwrap_or_else(|| inner.clone()),
        "NS" => Value::Array(inner.as_array().into_iter().flatten().map(|n| n.as_str().and_then(|t| serde_json::from_str(t).ok()).unwrap_or_else(|| n.clone())).collect()),
        "NULL" => Value::Null,
        "L" => Value::Array(inner.as_array().into_iter().flatten().map(unwrap_attribute).collect()),
        "M" => Value::Object(flatten_item(inner)),
        _ => value.clone(),
    }
}

fn flatten_item(item: &Value) -> Map<String, Value> {
    item.as_object()
        .map(|object| object.iter().map(|(key, value)| (key.clone(), unwrap_attribute(value))).collect())
        .unwrap_or_default()
}

fn present(reply: &Value, limit: usize) -> QueryResult {
    if let Some(names) = reply["TableNames"].as_array() {
        let items: Vec<Map<String, Value>> = names.iter().map(|name| Map::from_iter([("TableName".to_string(), name.clone())])).collect();
        return objects_result(&items.iter().collect::<Vec<_>>(), limit);
    }
    let items: Vec<Map<String, Value>> = match (reply["Items"].as_array(), reply.get("Item")) {
        (Some(items), _) => items.iter().map(flatten_item).collect(),
        (None, Some(item)) => vec![flatten_item(item)],
        _ => return json_result(reply, limit),
    };
    objects_result(&items.iter().collect::<Vec<_>>(), limit)
}

#[async_trait]
impl Driver for DynamoDbDriver {
    async fn connect(&self) -> DriverResult<()> {
        self.call(DEFAULT_OPERATION, &serde_json::json!({ "Limit": 1 })).await.map(|_| ())
    }

    async fn disconnect(&self) {}

    async fn run(&self, input: &str, operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        let reply = self.call(operation.unwrap_or(DEFAULT_OPERATION), &parse_json_input(input)?).await?;
        if reply.is_null() {
            return Ok(QueryResult::message("OK"));
        }
        Ok(present(&reply, row_limit))
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let reply = self.call(DEFAULT_OPERATION, &Value::Object(Default::default())).await?;
        let names = reply["TableNames"]
            .as_array()
            .ok_or_else(|| DriverError::message("Unexpected list-tables response."))?
            .iter()
            .filter_map(|name| name.as_str().map(String::from))
            .collect::<Vec<_>>();
        Ok(SchemaInfo::names("table", names))
    }
}
