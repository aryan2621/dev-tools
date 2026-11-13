use super::Driver;
use crate::error::DriverResult;
use crate::model::{QueryResult, Row, SchemaInfo};
use crate::process::{self, ProcessSpec};
use crate::profile::ConnectionProfile;
use async_trait::async_trait;

const SCHEMA_SQL: &str = "SELECT c.TABLE_NAME, t.TABLE_TYPE, c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, 'NO' \
FROM INFORMATION_SCHEMA.COLUMNS c JOIN INFORMATION_SCHEMA.TABLES t \
ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME \
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION";

pub struct SqlServerDriver {
    profile: ConnectionProfile,
}

impl SqlServerDriver {
    pub fn new(profile: ConnectionProfile) -> Self {
        Self { profile }
    }

    async fn query(&self, sql: &str) -> DriverResult<String> {
        let profile = &self.profile;
        let mut args: Vec<String> = vec![
            "-S".into(),
            format!("{},{}", profile.host, profile.port),
            "-s".into(),
            "\t".into(),
            "-W".into(),
            "-w".into(),
            "65535".into(),
            "-b".into(),
        ];
        if profile.trust_server_cert() {
            args.push("-C".into());
        }
        if profile.user.is_empty() {
            args.push("-E".into());
        } else {
            args.extend(["-U".into(), profile.user.clone()]);
        }
        if !profile.database.is_empty() {
            args.extend(["-d".into(), profile.database.clone()]);
        }
        args.extend(["-Q".into(), format!("SET NOCOUNT ON; {sql}")]);
        let program = process::require_for(profile.engine.spec())?;
        let spec = ProcessSpec::new(program, args).env("SQLCMDPASSWORD", profile.password.clone());
        Ok(process::run_checked(spec).await?.stdout)
    }
}

fn present(output: &str, limit: usize) -> QueryResult {
    let lines: Vec<&str> = output.lines().filter(|line| !line.trim().is_empty()).collect();
    let is_rule = |line: &str| line.split('\t').all(|part| !part.is_empty() && part.chars().all(|c| c == '-'));
    let Some(rule) = lines.iter().position(|line| is_rule(line)).filter(|index| *index > 0) else {
        return QueryResult::message(if output.trim().is_empty() { "OK" } else { output.trim() });
    };
    let columns = lines[rule - 1].split('\t').map(String::from).collect();
    let rows = lines[rule + 1..]
        .iter()
        .take_while(|line| !(line.starts_with('(') && line.contains("affected")))
        .map(|line| line.split('\t').map(|cell| if cell == "NULL" { None } else { Some(cell.to_string()) }).collect::<Row>());
    QueryResult::table(columns, rows, limit)
}

#[async_trait]
impl Driver for SqlServerDriver {
    async fn connect(&self) -> DriverResult<()> {
        self.query("SELECT 1").await.map(|_| ())
    }

    async fn disconnect(&self) {}

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        Ok(present(&self.query(input).await?, row_limit))
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let result = present(&self.query(SCHEMA_SQL).await?, usize::MAX / 2);
        Ok(SchemaInfo::from_column_rows(&result.rows))
    }
}
