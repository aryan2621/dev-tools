# QueryLab user guide

## Connections

Click **+** in the sidebar. The form shows only the fields the chosen engine needs: a file for
SQLite, a URI for MongoDB, host and port for network databases, region and profile for DynamoDB,
plus engine-specific options such as the Snowflake warehouse or the Databricks HTTP path.

Right-click a connection to **Connect**, **Disconnect**, **Edit** or **Delete**. Double-click
connects. A filled dot means connected. Passwords, and credentials embedded in URIs, are stored in
the OS keychain.

QueryLab does not test a connection when you save it. Connecting reports any error at the top of
the window.

## Schema

The second column lists the connected database's tables, views, collections, indexes or keys.
Click an object to expand its columns and types. Right-click for **Select Rows** (opens a new tab
with a starter query) or **Insert Name** (types the name into the editor). Double-click also
inserts the name.

## Querying

Each connection has its own tabs. Write a query and press **Run**. If text is selected, only the
selection runs. Engines that take several operations (Elasticsearch, DynamoDB, InfluxDB) show an
**Operation** menu, and the hint on the right of the toolbar shows the expected input format.

Results stop at 100,000 rows and the status bar shows **Row limit reached**. **Cancel** stops a
running query. **History** lists the connection's recent queries; pick one to load it into the tab.

## Export

**Export CSV** and **Export JSON** in the status bar save the current result through a file dialog.

## Shortcuts

| Action | Shortcut |
| --- | --- |
| Run | Cmd/Ctrl+Enter |
| New tab | Cmd/Ctrl+T |
| Close tab | Cmd/Ctrl+W |
| Command palette | Cmd/Ctrl+K |

## Engines that need a tool

SQL Server (`sqlcmd`), Oracle (`sqlplus`), DynamoDB (`aws`), Cassandra (`cqlsh`), Snowflake
(`snowsql`) and BigQuery (`bq`) need their command-line tool installed. The connection form shows
the install command, and connecting without it shows the same message.
