use super::Driver;
use crate::error::{DriverError, DriverResult};
use crate::model::{QueryResult, SchemaInfo};
use crate::parsers::csv_result;
use crate::process::{self, ProcessSpec};
use crate::profile::ConnectionProfile;
use async_trait::async_trait;

const SCHEMA_SQL: &str = "SELECT c.table_name, CASE WHEN v.view_name IS NULL THEN 'TABLE' ELSE 'VIEW' END, c.column_name, c.data_type, \
CASE c.nullable WHEN 'Y' THEN 'YES' ELSE 'NO' END, 'NO' \
FROM user_tab_columns c LEFT JOIN user_views v ON v.view_name = c.table_name ORDER BY c.table_name, c.column_id";

pub struct OracleDriver {
    profile: ConnectionProfile,
}

impl OracleDriver {
    pub fn new(profile: ConnectionProfile) -> Self {
        Self { profile }
    }

    async fn query(&self, sql: &str) -> DriverResult<String> {
        let profile = &self.profile;
        let target = format!("//{}:{}/{}", profile.host, profile.port, profile.database);
        let statement = sql.trim().trim_end_matches([';', '/']).trim_end();
        let script = format!(
            "WHENEVER SQLERROR CONTINUE\nCONNECT {}/\"{}\"@{}\nSET MARKUP CSV ON QUOTE ON\nSET FEEDBACK OFF\nSET PAGESIZE 0\nSET HEADING ON\n{};\nEXIT\n",
            profile.user, profile.password, target, statement
        );
        let program = process::require_for(profile.engine.spec())?;
        let spec = ProcessSpec::new(program, vec!["-L".into(), "-S".into(), "/nolog".into()]).stdin(script);
        let output = process::run(spec, process::DEFAULT_TIMEOUT).await?;
        let failure = output
            .stdout
            .lines()
            .find(|line| ["ORA-", "SP2-", "ERROR"].iter().any(|prefix| line.trim_start().starts_with(prefix)));
        match failure {
            Some(line) => Err(DriverError::message(line.trim())),
            None => Ok(output.stdout),
        }
    }
}

#[async_trait]
impl Driver for OracleDriver {
    async fn connect(&self) -> DriverResult<()> {
        self.query("SELECT 1 FROM dual").await.map(|_| ())
    }

    async fn disconnect(&self) {}

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        csv_result(self.query(input).await?.trim(), row_limit)
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let result = csv_result(self.query(SCHEMA_SQL).await?.trim(), usize::MAX / 2)?;
        Ok(SchemaInfo::from_column_rows(&result.rows))
    }
}
