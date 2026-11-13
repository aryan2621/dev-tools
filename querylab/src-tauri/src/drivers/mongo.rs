use super::Driver;
use crate::error::{DriverError, DriverResult};
use crate::model::{QueryResult, SchemaInfo};
use crate::parsers::{json_result, objects_result};
use crate::profile::ConnectionProfile;
use async_trait::async_trait;
use mongodb::bson::{doc, Bson, Document};
use mongodb::{Client, Database};
use serde_json::{Map, Value};
use tokio::sync::RwLock;

const FALLBACK_DATABASE: &str = "admin";

pub struct MongoDriver {
    profile: ConnectionProfile,
    client: RwLock<Option<Client>>,
}

impl MongoDriver {
    pub fn new(profile: ConnectionProfile) -> Self {
        Self { profile, client: RwLock::new(None) }
    }

    async fn database(&self, override_name: Option<String>) -> DriverResult<Database> {
        let guard = self.client.read().await;
        let client = guard.as_ref().ok_or(DriverError::NotConnected)?;
        let name = override_name
            .filter(|name| !name.is_empty())
            .or_else(|| Some(self.profile.database.clone()).filter(|name| !name.is_empty()))
            .or_else(|| client.default_database().map(|database| database.name().to_string()))
            .unwrap_or_else(|| FALLBACK_DATABASE.to_string());
        Ok(client.database(&name))
    }
}

fn command_document(input: &str) -> DriverResult<(Document, Option<String>)> {
    let value: Value = serde_json::from_str(input).map_err(|e| DriverError::message(format!("Command is not valid JSON: {e}")))?;
    let Bson::Document(mut command) = Bson::try_from(value).map_err(|e| DriverError::message(e.to_string()))? else {
        return Err(DriverError::message("A MongoDB command must be a JSON object."));
    };
    let database = match command.remove("$db") {
        Some(Bson::String(name)) => Some(name),
        _ => None,
    };
    Ok((command, database))
}

fn batch(cursor: &Value, key: &str) -> Vec<Value> {
    cursor.get(key).and_then(Value::as_array).cloned().unwrap_or_default()
}

async fn drain_cursor(database: &Database, first: &Value, limit: usize) -> DriverResult<Vec<Value>> {
    let mut documents = batch(first, "firstBatch");
    let mut id = first.get("id").and_then(Value::as_i64).unwrap_or(0);
    let namespace = first.get("ns").and_then(Value::as_str).unwrap_or("").to_string();
    let collection = namespace.split_once('.').map(|(_, name)| name.to_string()).unwrap_or_default();
    while id != 0 && documents.len() <= limit {
        let next = database.run_command(doc! { "getMore": id, "collection": &collection }).await?;
        let cursor = Bson::Document(next).into_relaxed_extjson();
        let cursor = cursor.get("cursor").cloned().unwrap_or(Value::Null);
        documents.extend(batch(&cursor, "nextBatch"));
        id = cursor.get("id").and_then(Value::as_i64).unwrap_or(0);
    }
    if id != 0 {
        let _ = database.run_command(doc! { "killCursors": &collection, "cursors": [id] }).await;
    }
    Ok(documents)
}

#[async_trait]
impl Driver for MongoDriver {
    async fn connect(&self) -> DriverResult<()> {
        let client = Client::with_uri_str(&self.profile.uri).await?;
        client.database(FALLBACK_DATABASE).run_command(doc! { "ping": 1 }).await?;
        *self.client.write().await = Some(client);
        Ok(())
    }

    async fn disconnect(&self) {
        *self.client.write().await = None;
    }

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        let (command, database_name) = command_document(input)?;
        let database = self.database(database_name).await?;
        let reply = Bson::Document(database.run_command(command).await?).into_relaxed_extjson();
        match reply.get("cursor") {
            Some(cursor) => {
                let documents = drain_cursor(&database, cursor, row_limit).await?;
                let objects: Vec<&Map<String, Value>> = documents.iter().filter_map(Value::as_object).collect();
                if objects.is_empty() {
                    Ok(QueryResult::message("0 documents"))
                } else {
                    Ok(objects_result(&objects, row_limit))
                }
            }
            None => Ok(json_result(&reply, row_limit)),
        }
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let names = self.database(None).await?.list_collection_names().await?;
        Ok(SchemaInfo::names("collection", names))
    }
}
