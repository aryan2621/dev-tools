mod clickhouse;
mod databricks;
mod elastic;
mod influx;
mod mongo;
mod mysql;
mod neo4j;
mod postgres;
mod redis_driver;
mod sqlite;

use crate::engine::EngineKind;
use crate::error::DriverResult;
use crate::model::{QueryResult, SchemaInfo};
use crate::profile::ConnectionProfile;
use async_trait::async_trait;
use std::sync::Arc;

#[async_trait]
pub trait Driver: Send + Sync {
    async fn connect(&self) -> DriverResult<()>;

    async fn disconnect(&self) {}

    async fn run(&self, input: &str, operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult>;

    async fn schema(&self) -> DriverResult<SchemaInfo>;

    async fn cancel(&self) {}

    /// Runs all statements in one transaction. Needs a driver that keeps a single session (sqlite, postgres, mysql).
    async fn apply(&self, statements: &[String]) -> DriverResult<()> {
        self.run("BEGIN", None, 1).await?;
        for statement in statements {
            if let Err(error) = self.run(statement, None, 1).await {
                let _ = self.run("ROLLBACK", None, 1).await;
                return Err(error);
            }
        }
        self.run("COMMIT", None, 1).await.map(|_| ())
    }
}

pub fn make(profile: ConnectionProfile) -> DriverResult<Arc<dyn Driver>> {
    use EngineKind::*;
    Ok(match profile.engine {
        Sqlite => Arc::new(sqlite::SqliteDriver::new(profile)),
        Postgresql | Cockroachdb | Redshift => Arc::new(postgres::PostgresDriver::new(profile)),
        Mysql | Mariadb => Arc::new(mysql::MySqlDriver::new(profile)),
        Mongodb => Arc::new(mongo::MongoDriver::new(profile)),
        Redis => Arc::new(redis_driver::RedisDriver::new(profile)),
        Elasticsearch | Opensearch => Arc::new(elastic::ElasticDriver::new(profile)?),
        Clickhouse => Arc::new(clickhouse::ClickHouseDriver::new(profile)?),
        Databricks => Arc::new(databricks::DatabricksDriver::new(profile)?),
        Influxdb => Arc::new(influx::InfluxDriver::new(profile)?),
        Neo4j => Arc::new(neo4j::Neo4jDriver::new(profile)?),
    })
}
