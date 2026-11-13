use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineKind {
    Sqlite,
    Postgresql,
    Cockroachdb,
    Redshift,
    Mysql,
    Mariadb,
    Sqlserver,
    Oracle,
    Mongodb,
    Dynamodb,
    Redis,
    Cassandra,
    Elasticsearch,
    Opensearch,
    Clickhouse,
    Snowflake,
    Bigquery,
    Databricks,
    Influxdb,
    Neo4j,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InputStyle {
    Sql,
    Json,
    Command,
    Cypher,
    Cql,
    Text,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DriverKind {
    Native,
    Http,
    Cli,
}

#[derive(Clone, Copy)]
pub struct CliTool {
    pub binaries: &'static [&'static str],
    pub install_hint: &'static str,
}

#[derive(Clone, Copy, Serialize)]
pub struct OptionField {
    pub key: &'static str,
    pub label: &'static str,
}

pub struct EngineSpec {
    pub kind: EngineKind,
    pub display_name: &'static str,
    pub category: &'static str,
    pub summary: &'static str,
    pub default_port: u16,
    pub input_style: InputStyle,
    pub driver_kind: DriverKind,
    pub operations: &'static [&'static str],
    pub console_hint: Option<&'static str>,
    pub credential_label: &'static str,
    pub database_label: &'static str,
    pub fields: &'static [&'static str],
    pub option_fields: &'static [OptionField],
    pub ssl_modes: &'static [&'static str],
    pub default_ssl_mode: &'static str,
    pub cli_tool: Option<CliTool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineMeta {
    pub kind: EngineKind,
    pub display_name: &'static str,
    pub category: &'static str,
    pub summary: &'static str,
    pub default_port: u16,
    pub input_style: InputStyle,
    pub is_sql: bool,
    pub driver_kind: DriverKind,
    pub operations: &'static [&'static str],
    pub default_operation: Option<&'static str>,
    pub console_hint: Option<&'static str>,
    pub credential_label: &'static str,
    pub database_label: &'static str,
    pub fields: &'static [&'static str],
    pub option_fields: &'static [OptionField],
    pub ssl_modes: &'static [&'static str],
    pub default_ssl_mode: &'static str,
    pub install_hint: Option<&'static str>,
}

const NETWORK: &[&str] = &["host", "port", "user", "password", "database"];
const NETWORK_SSL: &[&str] = &["host", "port", "user", "password", "database", "sslMode"];
const SQL_SSL: &[&str] = &["disable", "prefer", "require"];
const MYSQL_SSL: &[&str] = &["disable", "require"];
const HTTP_SSL: &[&str] = &["http", "https"];
const DYNAMO_OPS: &[&str] = &[
    "list-tables", "describe-table", "get-item", "put-item", "delete-item", "query", "scan",
    "update-item", "batch-get-item", "batch-write-item", "create-table", "update-table", "delete-table",
];
const SEARCH_OPS: &[&str] = &[
    "_search", "_count", "_explain", "_mapping", "_cat/indices", "_cluster/health", "_cat/nodes", "_sql",
];
const INFLUX_OPS: &[&str] = &["influxql", "flux", "buckets", "ping"];

const fn tool(binaries: &'static [&'static str], install_hint: &'static str) -> Option<CliTool> {
    Some(CliTool { binaries, install_hint })
}

const BASE: EngineSpec = EngineSpec {
    kind: EngineKind::Sqlite,
    display_name: "",
    category: "Relational",
    summary: "",
    default_port: 0,
    input_style: InputStyle::Sql,
    driver_kind: DriverKind::Native,
    operations: &[],
    console_hint: None,
    credential_label: "Password",
    database_label: "Database",
    fields: NETWORK,
    option_fields: &[],
    ssl_modes: &[],
    default_ssl_mode: "disable",
    cli_tool: None,
};

pub static ENGINES: [EngineSpec; 20] = [
    EngineSpec { kind: EngineKind::Sqlite, display_name: "SQLite", summary: "Embedded file database", fields: &["file"], ..BASE },
    EngineSpec { kind: EngineKind::Postgresql, display_name: "PostgreSQL", summary: "Advanced open-source RDBMS", default_port: 5432, fields: NETWORK_SSL, ssl_modes: SQL_SSL, default_ssl_mode: "prefer", ..BASE },
    EngineSpec { kind: EngineKind::Cockroachdb, display_name: "CockroachDB", summary: "Distributed SQL (PostgreSQL wire)", default_port: 26257, fields: NETWORK_SSL, ssl_modes: SQL_SSL, default_ssl_mode: "prefer", ..BASE },
    EngineSpec { kind: EngineKind::Redshift, display_name: "Amazon Redshift", category: "Cloud Managed", summary: "AWS data warehouse (PostgreSQL wire)", default_port: 5439, fields: NETWORK_SSL, ssl_modes: SQL_SSL, default_ssl_mode: "prefer", ..BASE },
    EngineSpec { kind: EngineKind::Mysql, display_name: "MySQL", summary: "World's most popular open-source RDBMS", default_port: 3306, fields: NETWORK_SSL, ssl_modes: MYSQL_SSL, ..BASE },
    EngineSpec { kind: EngineKind::Mariadb, display_name: "MariaDB", summary: "MySQL-compatible community fork", default_port: 3306, fields: NETWORK_SSL, ssl_modes: MYSQL_SSL, ..BASE },
    EngineSpec {
        kind: EngineKind::Sqlserver, display_name: "SQL Server", summary: "Microsoft relational database", default_port: 1433,
        driver_kind: DriverKind::Cli, console_hint: Some("Enter a query"),
        cli_tool: tool(&["sqlcmd"], "macOS: brew install sqlcmd\n    Windows: winget install Microsoft.Sqlcmd\n    Linux: https://learn.microsoft.com/sql/tools/sqlcmd/sqlcmd-utility"),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Oracle, display_name: "Oracle", summary: "Enterprise relational database", default_port: 1521,
        driver_kind: DriverKind::Cli, console_hint: Some("Enter a query"), database_label: "Service name",
        cli_tool: tool(&["sqlplus"], "Install Oracle Instant Client with the SQL*Plus package\n    https://www.oracle.com/database/technologies/instant-client.html"),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Mongodb, display_name: "MongoDB", category: "Document", summary: "Document database", default_port: 27017,
        input_style: InputStyle::Json, fields: &["uri", "database"], database_label: "Default database",
        console_hint: Some(r#"{"find": "users", "filter": {"age": {"$gt": 21}}, "limit": 50}  - the $db field is added automatically"#),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Dynamodb, display_name: "DynamoDB", category: "Cloud Managed", summary: "AWS fully managed key-value store", default_port: 443,
        input_style: InputStyle::Json, driver_kind: DriverKind::Cli, operations: DYNAMO_OPS,
        fields: &["region", "awsProfile", "endpointUrl"],
        console_hint: Some(r#"Request parameters as JSON, e.g. {"TableName": "users", "Limit": 50}"#),
        cli_tool: tool(&["aws"], "macOS: brew install awscli\n    Windows: winget install Amazon.AWSCLI\n    Linux: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Redis, display_name: "Redis", category: "Key-Value", summary: "In-memory key-value / cache", default_port: 6379,
        input_style: InputStyle::Command, credential_label: "Password (optional)", database_label: "DB index",
        console_hint: Some(r#"Commands like: GET user:1  |  HGETALL session:9  |  JSON array form also works: ["SET","k","v"]"#),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Cassandra, display_name: "Cassandra", category: "Wide-Column", summary: "Distributed wide-column store", default_port: 9042,
        input_style: InputStyle::Cql, driver_kind: DriverKind::Cli, database_label: "Keyspace",
        console_hint: Some("CQL, e.g. SELECT * FROM ks.users LIMIT 25"),
        cli_tool: tool(&["cqlsh"], "pipx install cqlsh\n    or: brew install cassandra (macOS)\n    Windows: pip install cqlsh"),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Elasticsearch, display_name: "Elasticsearch", category: "Search", summary: "Search & analytics engine", default_port: 9200,
        input_style: InputStyle::Json, driver_kind: DriverKind::Http, operations: SEARCH_OPS, fields: NETWORK_SSL,
        credential_label: "Password / API key", ssl_modes: HTTP_SSL, default_ssl_mode: "https",
        console_hint: Some(r#"Request body as JSON, e.g. {"query": {"match_all": {}}} - used by _search / _count"#),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Opensearch, display_name: "OpenSearch", category: "Search", summary: "Open-source search fork", default_port: 9200,
        input_style: InputStyle::Json, driver_kind: DriverKind::Http, operations: SEARCH_OPS, fields: NETWORK_SSL,
        credential_label: "Password / API key", ssl_modes: HTTP_SSL, default_ssl_mode: "https",
        console_hint: Some(r#"Request body as JSON, e.g. {"query": {"match_all": {}}} - used by _search / _count"#),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Clickhouse, display_name: "ClickHouse", category: "Analytics / OLAP", summary: "Columnar OLAP database", default_port: 8123,
        driver_kind: DriverKind::Http, fields: NETWORK_SSL, ssl_modes: HTTP_SSL, default_ssl_mode: "http", ..BASE
    },
    EngineSpec {
        kind: EngineKind::Snowflake, display_name: "Snowflake", category: "Analytics / OLAP", summary: "Cloud data warehouse", default_port: 443,
        driver_kind: DriverKind::Cli, console_hint: Some("Enter a query"),
        fields: &["host", "user", "password", "database"],
        option_fields: &[OptionField { key: "warehouse", label: "Warehouse" }, OptionField { key: "role", label: "Role" }, OptionField { key: "schema", label: "Schema" }],
        cli_tool: tool(&["snowsql"], "Download SnowSQL from https://developers.snowflake.com/snowsql/\n    macOS: brew install --cask snowflake-snowsql"),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Bigquery, display_name: "BigQuery", category: "Analytics / OLAP", summary: "Google serverless data warehouse", default_port: 443,
        driver_kind: DriverKind::Cli, console_hint: Some("Enter a query"), fields: &["database"], database_label: "Project ID",
        option_fields: &[OptionField { key: "location", label: "Location" }],
        cli_tool: tool(&["bq"], "macOS: brew install --cask google-cloud-sdk\n    Windows: winget install Google.CloudSDK\n    Linux: https://cloud.google.com/sdk/docs/install"),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Databricks, display_name: "Databricks", category: "Analytics / OLAP", summary: "Lakehouse SQL warehouses", default_port: 443,
        driver_kind: DriverKind::Http, console_hint: Some("Enter a query"), credential_label: "Personal access token", database_label: "Catalog",
        fields: &["host", "password", "database", "sslMode"], ssl_modes: HTTP_SSL, default_ssl_mode: "https",
        option_fields: &[OptionField { key: "httpPath", label: "SQL warehouse HTTP path" }, OptionField { key: "schema", label: "Schema" }],
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Influxdb, display_name: "InfluxDB", category: "Time Series", summary: "Time-series database", default_port: 8086,
        input_style: InputStyle::Text, driver_kind: DriverKind::Http, operations: INFLUX_OPS, credential_label: "API token", database_label: "Bucket",
        fields: &["host", "port", "password", "database", "sslMode"], ssl_modes: HTTP_SSL, default_ssl_mode: "http",
        option_fields: &[OptionField { key: "org", label: "Organization" }],
        console_hint: Some("InfluxQL (SELECT * FROM cpu LIMIT 25) or Flux, depending on the selected operation"),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Neo4j, display_name: "Neo4j", category: "Graph", summary: "Graph database", default_port: 7474,
        input_style: InputStyle::Cypher, driver_kind: DriverKind::Http, fields: NETWORK_SSL, ssl_modes: HTTP_SSL, default_ssl_mode: "http",
        console_hint: Some("Cypher, e.g. MATCH (n:Person) RETURN n LIMIT 25"),
        ..BASE
    },
];

impl EngineKind {
    pub fn spec(self) -> &'static EngineSpec {
        ENGINES.iter().find(|spec| spec.kind == self).expect("every engine has a spec")
    }
}

impl EngineSpec {
    pub fn meta(&self) -> EngineMeta {
        EngineMeta {
            kind: self.kind,
            display_name: self.display_name,
            category: self.category,
            summary: self.summary,
            default_port: self.default_port,
            input_style: self.input_style,
            is_sql: matches!(self.input_style, InputStyle::Sql),
            driver_kind: self.driver_kind,
            operations: self.operations,
            default_operation: self.operations.first().copied(),
            console_hint: self.console_hint,
            credential_label: self.credential_label,
            database_label: self.database_label,
            fields: self.fields,
            option_fields: self.option_fields,
            ssl_modes: self.ssl_modes,
            default_ssl_mode: self.default_ssl_mode,
            install_hint: self.cli_tool.map(|tool| tool.install_hint),
        }
    }
}
