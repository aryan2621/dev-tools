use super::Driver;
use crate::error::DriverResult;
use crate::model::{QueryResult, Row, SchemaInfo};
use crate::parsers::aligned_table_result;
use crate::process::{self, ProcessSpec, SecretFile};
use crate::profile::ConnectionProfile;
use async_trait::async_trait;

pub struct CassandraDriver {
    profile: ConnectionProfile,
}

impl CassandraDriver {
    pub fn new(profile: ConnectionProfile) -> Self {
        Self { profile }
    }

    async fn query(&self, cql: &str) -> DriverResult<String> {
        let profile = &self.profile;
        let mut args: Vec<String> = vec!["--no-color".into(), profile.host.clone(), profile.port.to_string()];
        let credentials = (!profile.user.is_empty())
            .then(|| SecretFile::create(&format!("[authentication]\nusername = {}\npassword = {}\n", profile.user.replace('%', "%%"), profile.password.replace('%', "%%"))))
            .transpose()?;
        if let Some(file) = &credentials {
            args.extend(["--cqlshrc".into(), file.path().to_string_lossy().into_owned()]);
        }
        if !profile.database.is_empty() {
            args.extend(["-k".into(), profile.database.clone()]);
        }
        args.extend(["-e".into(), cql.to_string()]);
        let program = process::require_for(profile.engine.spec())?;
        Ok(process::run_checked(ProcessSpec::new(program, args)).await?.stdout)
    }
}

#[async_trait]
impl Driver for CassandraDriver {
    async fn connect(&self) -> DriverResult<()> {
        self.query("SELECT release_version FROM system.local").await.map(|_| ())
    }

    async fn disconnect(&self) {}

    async fn run(&self, input: &str, _operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult> {
        Ok(aligned_table_result(&self.query(input).await?, row_limit))
    }

    async fn schema(&self) -> DriverResult<SchemaInfo> {
        let keyspace = &self.profile.database;
        if keyspace.is_empty() {
            let result = aligned_table_result(&self.query("SELECT keyspace_name FROM system_schema.keyspaces").await?, usize::MAX / 2);
            let names = result.rows.into_iter().filter_map(|row| row.into_iter().next().flatten()).collect::<Vec<_>>();
            return Ok(SchemaInfo::names("keyspace", names));
        }
        let cql = format!("SELECT table_name, column_name, type, kind FROM system_schema.columns WHERE keyspace_name = '{keyspace}'");
        let result = aligned_table_result(&self.query(&cql).await?, usize::MAX / 2);
        let rows: Vec<Row> = result
            .rows
            .into_iter()
            .map(|row| {
                let cell = |index: usize| row.get(index).cloned().flatten();
                let key = matches!(cell(3).as_deref(), Some("partition_key" | "clustering"));
                vec![cell(0), Some("table".into()), cell(1), cell(2), Some("YES".into()), Some(if key { "YES" } else { "NO" }.into())]
            })
            .collect();
        Ok(SchemaInfo::from_column_rows(&rows))
    }
}
