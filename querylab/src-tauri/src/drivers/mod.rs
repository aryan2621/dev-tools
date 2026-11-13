mod bigquery;
mod cassandra;
mod clickhouse;
mod databricks;
mod dynamodb;
mod elastic;
mod influx;
mod mongo;
mod mysql;
mod neo4j;
mod oracle;
mod postgres;
mod redis_driver;
mod snowflake;
mod sqlite;
mod sqlserver;

use crate::engine::EngineKind;
use crate::error::DriverResult;
use crate::model::{QueryResult, SchemaInfo};
use crate::profile::ConnectionProfile;
use async_trait::async_trait;
use std::sync::Arc;

#[async_trait]
pub trait Driver: Send + Sync {
    async fn connect(&self) -> DriverResult<()>;

    async fn disconnect(&self);

    async fn run(&self, input: &str, operation: Option<&str>, row_limit: usize) -> DriverResult<QueryResult>;

    async fn schema(&self) -> DriverResult<SchemaInfo>;

    async fn cancel(&self) {}
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
        Sqlserver => Arc::new(sqlserver::SqlServerDriver::new(profile)),
        Oracle => Arc::new(oracle::OracleDriver::new(profile)),
        Dynamodb => Arc::new(dynamodb::DynamoDbDriver::new(profile)),
        Cassandra => Arc::new(cassandra::CassandraDriver::new(profile)),
        Snowflake => Arc::new(snowflake::SnowflakeDriver::new(profile)),
        Bigquery => Arc::new(bigquery::BigQueryDriver::new(profile)),
    })
}
