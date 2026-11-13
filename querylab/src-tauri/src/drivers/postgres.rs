use super::Driver;
use crate::error::{DriverError, DriverResult};
use crate::model::{QueryResult, Row, SchemaInfo};
use crate::profile::ConnectionProfile;
use crate::sql_split;
use async_trait::async_trait;
use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use std::{
    future::Future,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio_postgres::{Client, Config, NoTls, SimpleQueryMessage};

const SCHEMA_SQL: &str = "
SELECT CASE WHEN c.table_schema = 'public' THEN c.table_name ELSE c.table_schema || '.' || c.table_name END,
       t.table_type, c.column_name, c.data_type, c.is_nullable,
       EXISTS (SELECT 1 FROM information_schema.key_column_usage k
               JOIN information_schema.table_constraints tc
                 ON tc.constraint_name = k.constraint_name AND tc.table_schema = k.table_schema
               WHERE tc.constraint_type = 'PRIMARY KEY' AND k.table_schema = c.table_schema
                 AND k.table_name = c.table_name AND k.column_name = c.column_name)
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema', 'crdb_internal', 'pg_extension')
ORDER BY c.table_schema, c.table_name, c.ordinal_position";

struct Connected {
    client: Client,
    tls: Option<MakeTlsConnector>,
    cursor_open: AtomicBool,
    in_transaction: AtomicBool,
}

impl Connected {
    fn new(client: Client, tls: Option<MakeTlsConnector>) -> Self {
        Self { client, tls, cursor_open: AtomicBool::new(false), in_transaction: AtomicBool::new(false) }
    }

    fn track_transaction(&self, statements: &[String]) {
        for statement in statements {
            let mut words = statement.split_whitespace().map(str::to_lowercase);
            match (words.next().as_deref(), words.next().as_deref()) {
                (Some("begin" | "start"), _) => self.in_transaction.store(true, Ordering::Relaxed),
                (Some("rollback"), Some("to")) => {}
                (Some("commit" | "end" | "rollback" | "abort"), _) => self.in_transaction.store(false, Ordering::Relaxed),
                _ => {}
            }
        }
    }

    async fn simple(&self, sql: &str, limit: usize) -> DriverResult<QueryResult> {
        Ok(collect(self.client.simple_query(sql).await?, limit))
    }

    async fn fetch(&self, sql: &str, limit: usize) -> DriverResult<QueryResult> {
        if self.cursor_open.swap(false, Ordering::Relaxed) {
            self.client.simple_query("ROLLBACK").await?;
        }
        self.client.simple_query("BEGIN").await?;
        self.cursor_open.store(true, Ordering::Relaxed);
        let outcome = self.declare_and_fetch(sql, limit).await;
        self.client.simple_query(if outcome.is_ok() { "COMMIT" } else { "ROLLBACK" }).await?;
        self.cursor_open.store(false, Ordering::Relaxed);
        match outcome {
            Ok(Some(result)) => Ok(result),
            Ok(None) => self.simple(sql, limit).await,
            Err(error) => Err(error),
        }
    }

    async fn declare_and_fetch(&self, sql: &str, limit: usize) -> DriverResult<Option<QueryResult>> {
        if self.client.simple_query(&format!("DECLARE ql_cursor NO SCROLL CURSOR FOR {sql}")).await.is_err() {
            return Ok(None);
        }
        let count = limit.saturating_add(1).min(i64::MAX as usize);
        Ok(Some(self.simple(&format!("FETCH FORWARD {count} FROM ql_cursor"), limit).await?))
    }
}

fn returns_rows(sql: &str) -> bool {
    let keyword = sql.split_whitespace().next().unwrap_or("").to_lowercase();
    matches!(keyword.as_str(), "select" | "with" | "values" | "table")
}

pub struct PostgresDriver {
    profile: ConnectionProfile,
    connected: Mutex<Option<Arc<Connected>>>,
}

impl PostgresDriver {
    pub fn new(profile: ConnectionProfile) -> Self {
        Self { profile, connected: Mutex::new(None) }
    }

    fn config(&self) -> Config {
        let profile = &self.profile;
        let mut config = Config::new();
        config
            .host(&profile.host)
            .port(profile.port)
            .user(if profile.user.is_empty() { "postgres" } else { &profile.user })
            .dbname(if profile.database.is_empty() { "postgres" } else { &profile.database })
            .connect_timeout(Duration::from_secs(15));
        if !profile.password.is_empty() {
            config.password(&profile.password);
        }
        config
    }

    fn current(&self) -> DriverResult<Arc<Connected>> {
        self.connected.lock().unwrap().clone().ok_or(DriverError::NotConnected)
    }

    async fn open_tls(config: &Config) -> DriverResult<Connected> {
        let connector = MakeTlsConnector::new(TlsConnector::builder().danger_accept_invalid_certs(true).build()?);
        let (client, connection) = config.connect(connector.clone()).await?;
        Self::drive(connection);
        Ok(Connected::new(client, Some(connector)))
    }

    async fn open_plain(config: &Config) -> DriverResult<Connected> {
        let (client, connection) = config.connect(NoTls).await?;
        Self::drive(connection);
        Ok(Connected::new(client, None))
    }

    fn drive(connection: impl Future<Output = Result<(), tokio_postgres::Error>> + Send + 'static) {
        tokio::spawn(async move {
            let _ = connection.await;
        });
    }
}

fn collect(messages: Vec<SimpleQueryMessage>, limit: usize) -> QueryResult {
    let mut last = QueryResult::message("OK");
    let mut columns: Vec<String> = Vec::new();
    let mut rows: Vec<Row> = Vec::new();
    for message in messages {
        match message {
            SimpleQueryMessage::RowDescription(description) => {
                columns = description.iter().map(|column| column.name().to_string()).collect();
            }
            SimpleQueryMessage::Row(row) => {
                if columns.is_empty() {
                    columns = row.columns().iter().map(|column| column.name().to_string()).collect();
                }
                rows.push((0..row.len()).map(|i| row.get(i).map(String::from)).collect());
            }
            SimpleQueryMessage::CommandComplete(count) => {
                last = if columns.is_empty() {
                    match count {
                        0 => QueryResult::message("OK"),
                        n => QueryResult::affected(format!("{n} row(s) affected"), n),
                    }
                } else {
                    QueryResult::table(std::mem::take(&mut columns), std::mem::take(&mut rows), limit)
                };
                columns.clear();
                rows.clear();
            }
            _ => {}
        }
    }
    last
}

#[async_trait]
impl Driver for PostgresDriver {
    async fn connect(&self) -> DriverResult<()> {
        let config = self.config();
        let connected = match self.profile.ssl_mode.as_str() {
            "disable" => Self::open_plain(&config).await?,
            "require" => Self::open_tls(&config).await?,
            _ => match Self::open_tls(&config).await {
                Ok(connected) => connected,
                Err(_) => Self::open_plain(&config).await?,
            },
        };
        connected.client.simple_query("SELECT 1").await?;
        *self.connected.lock().unwrap() = Some(Arc::new(connected));
        Ok(())
    }

    async fn disconnect(&self) {
        *self.connected.lock().unwrap() = None;
    }

    async fn cancel(&self) {
        let Ok(connected) = self.current() else { return };
        let token = connected.client.cancel_token();
        let _ = match &connected.tls {
            Some(tls) => token.cancel_query(tls.clone()).await,
            None => token.cancel_query(NoTls).await,
        };
    }

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        let connected = self.current()?;
        let statements = sql_split::statements(input);
        match statements.as_slice() {
            [statement] if returns_rows(statement) && !connected.in_transaction.load(Ordering::Relaxed) => {
                connected.fetch(statement, row_limit).await
            }
            _ => {
                connected.track_transaction(&statements);
                connected.simple(input, row_limit).await
            }
        }
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let result = self.current()?.simple(SCHEMA_SQL, usize::MAX - 1).await?;
        Ok(SchemaInfo::from_column_rows(&result.rows))
    }
}
