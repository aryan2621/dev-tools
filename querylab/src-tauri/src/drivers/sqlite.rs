use super::Driver;
use crate::error::{DriverError, DriverResult};
use crate::model::{QueryResult, Row, SchemaColumn, SchemaInfo, SchemaObject};
use crate::profile::ConnectionProfile;
use crate::sql_split;
use async_trait::async_trait;
use rusqlite::{types::ValueRef, Connection, InterruptHandle};
use std::sync::{Arc, Mutex};

pub struct SqliteDriver {
    profile: ConnectionProfile,
    connection: Arc<Mutex<Option<Connection>>>,
    interrupt: Mutex<Option<InterruptHandle>>,
}

impl SqliteDriver {
    pub fn new(profile: ConnectionProfile) -> Self {
        Self { profile, connection: Arc::default(), interrupt: Mutex::new(None) }
    }

    async fn with_connection<T: Send + 'static>(
        &self,
        work: impl FnOnce(&Connection) -> DriverResult<T> + Send + 'static,
    ) -> DriverResult<T> {
        let connection = self.connection.clone();
        tokio::task::spawn_blocking(move || {
            let guard = connection.lock().unwrap();
            work(guard.as_ref().ok_or(DriverError::NotConnected)?)
        })
        .await
        .map_err(|e| DriverError::message(e.to_string()))?
    }
}

fn cell(value: ValueRef) -> Option<String> {
    match value {
        ValueRef::Null => None,
        ValueRef::Integer(n) => Some(n.to_string()),
        ValueRef::Real(f) => Some(f.to_string()),
        ValueRef::Text(bytes) => Some(String::from_utf8_lossy(bytes).into_owned()),
        ValueRef::Blob(bytes) => Some(format!("<blob {} bytes>", bytes.len())),
    }
}

fn run_statement(connection: &Connection, sql: &str, limit: usize) -> DriverResult<QueryResult> {
    let mut statement = connection.prepare(sql)?;
    if statement.column_count() == 0 {
        let affected = statement.execute([])?;
        return Ok(QueryResult::affected(format!("{affected} row(s) affected"), affected as u64));
    }
    let columns: Vec<String> = statement.column_names().iter().map(|name| name.to_string()).collect();
    let types: Vec<String> = statement
        .columns()
        .iter()
        .map(|column| column.decl_type().unwrap_or("").to_string())
        .collect();
    let width = columns.len();
    let mut rows: Vec<Row> = Vec::new();
    let mut cursor = statement.query([])?;
    while let Some(row) = cursor.next()? {
        rows.push((0..width).map(|i| row.get_ref(i).map(cell)).collect::<Result<_, _>>()?);
        if rows.len() > limit {
            break;
        }
    }
    Ok(QueryResult::table(columns, rows, limit).with_types(types))
}

#[async_trait]
impl Driver for SqliteDriver {
    async fn connect(&self) -> DriverResult<()> {
        let path = self.profile.file_path.trim().to_string();
        if path.is_empty() {
            return Err(DriverError::message("Choose a SQLite database file."));
        }
        let connection = tokio::task::spawn_blocking(move || -> DriverResult<Connection> {
            let connection = Connection::open(&path)?;
            connection.query_row("SELECT 1", [], |_| Ok(()))?;
            Ok(connection)
        })
        .await
        .map_err(|e| DriverError::message(e.to_string()))??;
        *self.interrupt.lock().unwrap() = Some(connection.get_interrupt_handle());
        *self.connection.lock().unwrap() = Some(connection);
        Ok(())
    }

    async fn disconnect(&self) {
        *self.interrupt.lock().unwrap() = None;
        *self.connection.lock().unwrap() = None;
    }

    async fn cancel(&self) {
        if let Some(handle) = self.interrupt.lock().unwrap().as_ref() {
            handle.interrupt();
        }
    }

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        let statements = sql_split::statements(input);
        self.with_connection(move |connection| {
            let mut last = QueryResult::message("OK");
            for statement in &statements {
                last = run_statement(connection, statement, row_limit)?;
            }
            Ok(last)
        })
        .await
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        self.with_connection(|connection| {
            let mut listing = connection.prepare(
                "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )?;
            let tables: Vec<(String, String)> = listing
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<_, _>>()?;
            let mut objects = Vec::new();
            for (name, kind) in tables {
                let mut object = SchemaObject::new(name.clone(), kind);
                let mut info = connection.prepare(&format!("PRAGMA table_info(\"{}\")", name.replace('"', "\"\"")))?;
                object.columns = info
                    .query_map([], |row| {
                        Ok(SchemaColumn {
                            name: row.get(1)?,
                            type_name: row.get(2)?,
                            nullable: row.get::<_, i64>(3)? == 0,
                            primary_key: row.get::<_, i64>(5)? > 0,
                        })
                    })?
                    .collect::<Result<_, _>>()?;
                objects.push(object);
            }
            Ok(SchemaInfo { objects, note: None })
        })
        .await
    }
}
