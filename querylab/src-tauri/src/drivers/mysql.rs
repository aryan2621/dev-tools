use super::Driver;
use crate::parsers::{ALL_ROWS};
use crate::error::{DriverError, DriverResult};
use crate::model::{QueryResult, Row, SchemaInfo};
use crate::profile::ConnectionProfile;
use crate::sql_split::{self, Dialect};
use async_trait::async_trait;
use mysql_async::{prelude::Queryable, Conn, OptsBuilder, SslOpts, Value};
use std::sync::Mutex;
use tokio::sync::Mutex as AsyncMutex;

const SCHEMA_SQL: &str = "
SELECT c.table_name, t.table_type, c.column_name, c.column_type, c.is_nullable, c.column_key
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema = DATABASE()
ORDER BY c.table_name, c.ordinal_position";

pub struct MySqlDriver {
    profile: ConnectionProfile,
    connection: AsyncMutex<Option<Conn>>,
    connection_id: Mutex<Option<u32>>,
}

impl MySqlDriver {
    pub fn new(profile: ConnectionProfile) -> Self {
        Self { profile, connection: AsyncMutex::new(None), connection_id: Mutex::new(None) }
    }

    fn options(&self) -> OptsBuilder {
        let profile = &self.profile;
        let mut options = OptsBuilder::default()
            .ip_or_hostname(profile.host.clone())
            .tcp_port(profile.port)
            .user(Some(if profile.user.is_empty() { "root" } else { &profile.user }))
            .pass((!profile.password.is_empty()).then(|| profile.password.clone()));
        if !profile.database.is_empty() {
            options = options.db_name(Some(profile.database.clone()));
        }
        if profile.ssl_mode == "require" {
            options = options.ssl_opts(SslOpts::default().with_danger_accept_invalid_certs(profile.trust_server_cert()));
        }
        options
    }
}

fn cell(value: Value) -> Option<String> {
    match value {
        Value::NULL => None,
        Value::Bytes(bytes) => Some(String::from_utf8_lossy(&bytes).into_owned()),
        other => Some(other.as_sql(true)),
    }
}

async fn run_statement(connection: &mut Conn, sql: &str, limit: usize) -> DriverResult<QueryResult> {
    let mut result = connection.query_iter(sql).await?;
    let columns: Vec<String> = result.columns_ref().iter().map(|column| column.name_str().into_owned()).collect();
    if columns.is_empty() {
        let affected = result.affected_rows();
        let info = result.info().into_owned();
        result.drop_result().await?;
        let text = if info.is_empty() { format!("{affected} row(s) affected") } else { info };
        return Ok(QueryResult::affected(text, affected));
    }
    let mut rows: Vec<Row> = Vec::new();
    while let Some(row) = result.next().await? {
        rows.push(row.unwrap().into_iter().map(cell).collect());
        if rows.len() > limit {
            break;
        }
    }
    result.drop_result().await?;
    Ok(QueryResult::table(columns, rows, limit))
}

#[async_trait]
impl Driver for MySqlDriver {
    async fn connect(&self) -> DriverResult<()> {
        let mut connection = Conn::new(self.options()).await?;
        connection.query_drop("SELECT 1").await?;
        *self.connection_id.lock().unwrap() = Some(connection.id());
        *self.connection.lock().await = Some(connection);
        Ok(())
    }

    async fn disconnect(&self) {
        if let Some(connection) = self.connection.lock().await.take() {
            let _ = connection.disconnect().await;
        }
        *self.connection_id.lock().unwrap() = None;
    }

    async fn cancel(&self) {
        let Some(id) = *self.connection_id.lock().unwrap() else { return };
        if let Ok(mut killer) = Conn::new(self.options()).await {
            let _ = killer.query_drop(format!("KILL QUERY {id}")).await;
            let _ = killer.disconnect().await;
        }
    }

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        let mut guard = self.connection.lock().await;
        let connection = guard.as_mut().ok_or(DriverError::NotConnected)?;
        let mut last = QueryResult::message("OK");
        for statement in sql_split::statements(input, Dialect::Mysql) {
            last = run_statement(connection, &statement, row_limit).await?;
        }
        Ok(last)
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let result = self.run(SCHEMA_SQL, None, ALL_ROWS).await?;
        if result.rows.is_empty() && self.profile.database.is_empty() {
            return Ok(SchemaInfo::note("Set a database on the connection to browse its tables."));
        }
        Ok(SchemaInfo::from_column_rows(&result.rows))
    }
}
