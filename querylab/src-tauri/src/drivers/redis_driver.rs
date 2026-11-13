use super::Driver;
use crate::error::{DriverError, DriverResult};
use crate::model::{QueryResult, SchemaInfo, SchemaObject};
use crate::parsers::stringify;
use crate::profile::ConnectionProfile;
use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::{ConnectionAddr, ConnectionInfo, RedisConnectionInfo, Value as RedisValue};
use serde_json::{Map, Value};
use tokio::sync::Mutex;

const SCHEMA_KEY_LIMIT: usize = 500;

pub struct RedisDriver {
    profile: ConnectionProfile,
    connection: Mutex<Option<MultiplexedConnection>>,
}

impl RedisDriver {
    pub fn new(profile: ConnectionProfile) -> Self {
        Self { profile, connection: Mutex::new(None) }
    }

    fn connection_info(&self) -> ConnectionInfo {
        let profile = &self.profile;
        ConnectionInfo {
            addr: ConnectionAddr::Tcp(profile.host.clone(), profile.port),
            redis: RedisConnectionInfo {
                db: profile.database.trim().parse().unwrap_or(0),
                username: Some(profile.user.clone()).filter(|user| !user.is_empty()),
                password: Some(profile.password.clone()).filter(|password| !password.is_empty()),
                ..Default::default()
            },
        }
    }

    async fn connection(&self) -> DriverResult<MultiplexedConnection> {
        self.connection.lock().await.clone().ok_or(DriverError::NotConnected)
    }
}

fn split_command(input: &str) -> DriverResult<Vec<String>> {
    let trimmed = input.trim();
    if trimmed.starts_with('[') {
        let items: Vec<Value> = serde_json::from_str(trimmed)?;
        return Ok(items.iter().map(|item| stringify(item).unwrap_or_default()).collect());
    }
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;
    let mut chars = trimmed.chars();
    while let Some(c) = chars.next() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some(_), '\\') => current.extend(chars.next()),
            (Some(_), c) => current.push(c),
            (None, '"' | '\'') => {
                quote = Some(c);
                started = true;
            }
            (None, c) if c.is_whitespace() => {
                if started || !current.is_empty() {
                    parts.push(std::mem::take(&mut current));
                    started = false;
                }
            }
            (None, c) => current.push(c),
        }
    }
    if quote.is_some() {
        return Err(DriverError::message("Unbalanced quote in command."));
    }
    if started || !current.is_empty() {
        parts.push(current);
    }
    Ok(parts)
}

fn to_json(value: RedisValue) -> Value {
    match value {
        RedisValue::Nil => Value::Null,
        RedisValue::Int(n) => Value::from(n),
        RedisValue::BulkString(bytes) => Value::String(String::from_utf8_lossy(&bytes).into_owned()),
        RedisValue::SimpleString(text) => Value::String(text),
        RedisValue::Okay => Value::String("OK".into()),
        RedisValue::Double(f) => Value::from(f),
        RedisValue::Boolean(b) => Value::Bool(b),
        RedisValue::VerbatimString { text, .. } => Value::String(text),
        RedisValue::BigNumber(n) => Value::String(n.to_string()),
        RedisValue::Array(items) | RedisValue::Set(items) => Value::Array(items.into_iter().map(to_json).collect()),
        RedisValue::Map(pairs) => Value::Object(
            pairs
                .into_iter()
                .map(|(key, value)| (stringify(&to_json(key)).unwrap_or_default(), to_json(value)))
                .collect::<Map<_, _>>(),
        ),
        other => Value::String(format!("{other:?}")),
    }
}

fn present(value: Value, limit: usize) -> QueryResult {
    match value {
        Value::Null => QueryResult::message("(nil)"),
        Value::Array(items) if items.is_empty() => QueryResult::message("(empty list)"),
        Value::Array(items) => QueryResult::table(
            vec!["#".into(), "value".into()],
            items.iter().enumerate().map(|(i, item)| vec![Some((i + 1).to_string()), stringify(item)]),
            limit,
        ),
        Value::Object(map) => QueryResult::table(
            vec!["key".into(), "value".into()],
            map.iter().map(|(key, item)| vec![Some(key.clone()), stringify(item)]),
            limit,
        ),
        scalar => QueryResult::message(stringify(&scalar).unwrap_or_default()),
    }
}

#[async_trait]
impl Driver for RedisDriver {
    async fn connect(&self) -> DriverResult<()> {
        let client = redis::Client::open(self.connection_info())?;
        let mut connection = client.get_multiplexed_async_connection().await?;
        redis::cmd("PING").query_async::<RedisValue>(&mut connection).await?;
        *self.connection.lock().await = Some(connection);
        Ok(())
    }

    async fn disconnect(&self) {
        *self.connection.lock().await = None;
    }

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        let parts = split_command(input)?;
        let (name, args) = parts.split_first().ok_or_else(|| DriverError::message("Enter a Redis command."))?;
        let mut connection = self.connection().await?;
        let mut command = redis::cmd(name);
        args.iter().for_each(|arg| {
            command.arg(arg);
        });
        let value = command.query_async::<RedisValue>(&mut connection).await?;
        Ok(present(to_json(value), row_limit))
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let mut connection = self.connection().await?;
        let mut keys: Vec<String> = Vec::new();
        let mut cursor: u64 = 0;
        loop {
            let (next, batch): (u64, Vec<String>) =
                redis::cmd("SCAN").arg(cursor).arg("COUNT").arg(200).query_async(&mut connection).await?;
            keys.extend(batch);
            cursor = next;
            if cursor == 0 || keys.len() >= SCHEMA_KEY_LIMIT {
                break;
            }
        }
        keys.truncate(SCHEMA_KEY_LIMIT);
        keys.sort();
        let mut pipeline = redis::pipe();
        keys.iter().for_each(|key| {
            pipeline.cmd("TYPE").arg(key);
        });
        let kinds: Vec<String> = pipeline.query_async(&mut connection).await?;
        let objects = keys.into_iter().zip(kinds).map(|(key, kind)| SchemaObject::new(key, kind)).collect();
        Ok(SchemaInfo { objects, note: None })
    }
}
