# QueryLab user guide

## Connections

Click **+** in the sidebar. The form shows only the fields the chosen engine needs: a file for
SQLite, a URI for MongoDB, host and port for network databases, region and profile for DynamoDB,
plus engine-specific options such as the Snowflake warehouse or the Databricks HTTP path.

Right-click a connection to **Connect**, **Disconnect**, **Edit** or **Delete**. Double-click
connects. A filled dot means connected. Passwords, and credentials embedded in URIs, are stored in
the OS keychain.

**Test connection** in the form connects and disconnects without saving. Name is optional. Saving
a connected profile reconnects it.

TLS certificates are verified by default. For servers with self-signed certificates tick **Trust
server certificate** (PostgreSQL, SQL Server, MySQL/MariaDB with SSL, and the HTTP engines).

## Schema

The second column lists the connected database's tables, views, collections, indexes or keys.
Click an object to expand its columns and types. Right-click for **Select Rows** (opens a new tab
with a starter query) or **Insert Name** (types the name into the editor). Double-click also
inserts the name.

## Querying

Each connection has its own tabs. Write a query and press **Run**. If text is selected, only the
selection runs. Engines that take several operations (Elasticsearch, DynamoDB, InfluxDB) show an
**Operation** menu, and the hint on the right of the toolbar shows the expected input format.

The **Row limit** menu in the toolbar (100 to 100,000, default 100,000) caps results; the status bar
shows **Row limit reached**. **Cancel** stops a running query. The **History** panel in the left
rail lists the connection's recent queries; search and pick one to load it into the tab. Open tabs
and their text are restored on restart. Running DDL refreshes the schema.

## AI assistant

**Cmd/Ctrl+J** opens the assistant. Open its settings (sliders icon) and pick Claude, OpenAI,
Gemini, Ollama or any OpenAI-compatible endpoint. API keys live in the OS keychain. For a local
model, run Ollama (or any compatible server) and use its URL.

The assistant reads freely: connections, schema, the open query, its last result (first 20 rows)
and history. Changing the editor, opening a tab and running a query each ask for approval first
and show the exact text, with the old text struck through for edits. **Always allow** skips the
prompt for that action until you clear the chat. Queries that change data are flagged in the
preview. Rows it reads are sent to the model provider. AI can make mistakes: check its answers and
edits. The sparkle button in the toolbar asks it to explain the open query or its error.

## Export

**Export CSV** and **Export JSON** in the status bar save the current result through a file dialog.

## Shortcuts

| Action | Shortcut |
| --- | --- |
| Run | Cmd/Ctrl+Enter |
| New tab | Cmd/Ctrl+T |
| Close tab | Cmd/Ctrl+W |
| Command palette | Cmd/Ctrl+K |
| AI assistant | Cmd/Ctrl+J |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab |
| Focus schema filter | Cmd/Ctrl+Shift+F |

## Engines that need a tool

SQL Server (`sqlcmd`), Oracle (`sqlplus`), DynamoDB (`aws`), Cassandra (`cqlsh`), Snowflake
(`snowsql`) and BigQuery (`bq`) need their command-line tool installed. The connection form shows
the install command, and connecting without it shows the same message.
