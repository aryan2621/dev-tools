# QueryLab

**One workbench for 20 databases. Connect, browse the schema, run queries and export results.**

- **Connect** to SQL, document, key-value, search, time-series and cloud warehouses from one window.
  Passwords are kept in the OS keychain, never in the profile file.
- **Browse** each connection's tables, views and keys, expand columns with their types, and
  right-click an object to select its rows or insert its name.
- **Query** in tabs with a resizable editor over a virtualised results grid. Run the whole editor
  or just the selected text, cancel a running query, and recall earlier queries from history.
- **Export** any result to CSV or JSON.

## Engines

| Engine | Driver | External tool |
| --- | --- | --- |
| SQLite | Native | none |
| PostgreSQL, CockroachDB, Amazon Redshift | Native (PostgreSQL wire) | none |
| MySQL, MariaDB | Native | none |
| MongoDB | Native | none |
| Redis | Native | none |
| Elasticsearch, OpenSearch | HTTP | none |
| ClickHouse | HTTP | none |
| Databricks | HTTP (SQL Statement API) | none |
| InfluxDB | HTTP | none |
| Neo4j | HTTP (transaction endpoint) | none |
| SQL Server | CLI | `sqlcmd` |
| Oracle | CLI | `sqlplus` |
| DynamoDB | CLI | `aws` |
| Cassandra | CLI | `cqlsh` |
| Snowflake | CLI | `snowsql` |
| BigQuery | CLI | `bq` |

CLI engines run the vendor tool as a subprocess. If it is missing, QueryLab tells you which tool
to install and how. Set `QL_<TOOL>_PATH` (for example `QL_SQLCMD_PATH`) to point at a custom
location.

## Status

Only SQLite has been exercised end to end. The other engines compile and follow their vendor
protocols, but have not been tested against live servers. Expect rough edges and please report
them.

## Quick start

1. Click **+** in the sidebar, pick an engine and fill in the connection.
2. Double-click the connection to connect. A query tab opens.
3. Press **Cmd+Enter** (Ctrl+Enter) to run. **Cmd+K** (Ctrl+K) opens every command.

## Build from source

```bash
cd querylab && pnpm install && pnpm tauri build
```

Needs Node 22, pnpm and Rust. Details in the [developer guide](docs/dev.md), usage in the
[user guide](docs/user.md).
