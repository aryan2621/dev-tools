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
    Mongodb,
    Redis,
    Elasticsearch,
    Opensearch,
    Clickhouse,
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
    Text,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DriverKind {
    Native,
    Http,
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
}

const NETWORK: &[&str] = &["host", "port", "user", "password", "database"];
const NETWORK_SSL: &[&str] = &["host", "port", "user", "password", "database", "sslMode"];
const SQL_SSL: &[&str] = &["disable", "prefer", "require"];
const MYSQL_SSL: &[&str] = &["disable", "require"];
const HTTP_SSL: &[&str] = &["http", "https"];
const SEARCH_OPS: &[&str] = &[
    "_search", "_count", "_explain", "_mapping", "_cat/indices", "_cluster/health", "_cat/nodes", "_sql",
];
const INFLUX_OPS: &[&str] = &["influxql", "flux", "buckets", "ping"];

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
};

pub static ENGINES: [EngineSpec; 14] = [
    EngineSpec { kind: EngineKind::Sqlite, display_name: "SQLite", summary: "Embedded file database", fields: &["file"], ..BASE },
    EngineSpec { kind: EngineKind::Postgresql, display_name: "PostgreSQL", summary: "Advanced open-source RDBMS", default_port: 5432, fields: NETWORK_SSL, ssl_modes: SQL_SSL, default_ssl_mode: "prefer", ..BASE },
    EngineSpec { kind: EngineKind::Cockroachdb, display_name: "CockroachDB", summary: "Distributed SQL (PostgreSQL wire)", default_port: 26257, fields: NETWORK_SSL, ssl_modes: SQL_SSL, default_ssl_mode: "prefer", ..BASE },
    EngineSpec { kind: EngineKind::Redshift, display_name: "Amazon Redshift", category: "Cloud Managed", summary: "AWS data warehouse (PostgreSQL wire)", default_port: 5439, fields: NETWORK_SSL, ssl_modes: SQL_SSL, default_ssl_mode: "prefer", ..BASE },
    EngineSpec { kind: EngineKind::Mysql, display_name: "MySQL", summary: "World's most popular open-source RDBMS", default_port: 3306, fields: NETWORK_SSL, ssl_modes: MYSQL_SSL, ..BASE },
    EngineSpec { kind: EngineKind::Mariadb, display_name: "MariaDB", summary: "MySQL-compatible community fork", default_port: 3306, fields: NETWORK_SSL, ssl_modes: MYSQL_SSL, ..BASE },
    EngineSpec {
        kind: EngineKind::Mongodb, display_name: "MongoDB", category: "Document", summary: "Document database", default_port: 27017,
        input_style: InputStyle::Json, fields: &["uri", "database"], database_label: "Default database",
        console_hint: Some(r#"{"find": "users", "filter": {"age": {"$gt": 21}}, "limit": 50}  - the $db field is added automatically"#),
        ..BASE
    },
    EngineSpec {
        kind: EngineKind::Redis, display_name: "Redis", category: "Key-Value", summary: "In-memory key-value / cache", default_port: 6379,
        input_style: InputStyle::Command, credential_label: "Password (optional)", database_label: "DB index",
        console_hint: Some(r#"Commands like: GET user:1  |  HGETALL session:9  |  JSON array form also works: ["SET","k","v"]"#),
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
        }
    }
}
