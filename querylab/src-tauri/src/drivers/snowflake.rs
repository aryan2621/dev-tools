use super::Driver;
use crate::error::DriverResult;
use crate::model::{QueryResult, SchemaInfo};
use crate::parsers::csv_result;
use crate::process::{self, ProcessSpec};
use crate::profile::ConnectionProfile;
use async_trait::async_trait;

const ACCOUNT_SUFFIX: &str = ".snowflakecomputing.com";
const SCHEMA_SQL: &str = "SELECT c.table_name, t.table_type, c.column_name, c.data_type, c.is_nullable, 'NO' \
FROM information_schema.columns c JOIN information_schema.tables t \
ON t.table_schema = c.table_schema AND t.table_name = c.table_name \
WHERE c.table_schema = CURRENT_SCHEMA() ORDER BY c.table_name, c.ordinal_position";

pub struct SnowflakeDriver {
    profile: ConnectionProfile,
}

impl SnowflakeDriver {
    pub fn new(profile: ConnectionProfile) -> Self {
        Self { profile }
    }

    async fn query(&self, sql: &str) -> DriverResult<String> {
        let profile = &self.profile;
        let account = profile.host.trim_end_matches(ACCOUNT_SUFFIX).to_string();
        let mut args: Vec<String> = ["-a", &account, "-u", &profile.user].map(String::from).to_vec();
        for (flag, value) in [
            ("-d", profile.database.as_str()),
            ("-w", profile.option("warehouse")),
            ("-r", profile.option("role")),
            ("-s", profile.option("schema")),
        ] {
            if !value.is_empty() {
                args.extend([flag.to_string(), value.to_string()]);
            }
        }
        for option in ["output_format=csv", "header=true", "timing=false", "friendly=false", "quiet=true", "variable_substitution=false"] {
            args.extend(["-o".into(), option.into()]);
        }
        args.extend(["-q".into(), sql.to_string()]);
        let program = process::require_for(profile.engine.spec())?;
        let spec = ProcessSpec::new(program, args).env("SNOWSQL_PWD", profile.password.clone());
        Ok(process::run_checked(spec).await?.stdout)
    }
}

#[async_trait]
impl Driver for SnowflakeDriver {
    async fn connect(&self) -> DriverResult<()> {
        self.query("SELECT 1").await.map(|_| ())
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
