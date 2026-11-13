use serde::Serialize;

pub type Row = Vec<Option<String>>;

pub const DEFAULT_ROW_LIMIT: usize = 100_000;

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub column_types: Vec<String>,
    pub rows: Vec<Row>,
    pub affected_rows: Option<u64>,
    pub message: Option<String>,
    pub duration_ms: f64,
    pub truncated: bool,
}

impl QueryResult {
    pub fn message(text: impl Into<String>) -> Self {
        Self {
            message: Some(text.into()),
            ..Self::default()
        }
    }

    pub fn affected(text: impl Into<String>, rows: u64) -> Self {
        Self {
            affected_rows: Some(rows),
            ..Self::message(text)
        }
    }

    pub fn table(columns: Vec<String>, rows: impl IntoIterator<Item = Row>, limit: usize) -> Self {
        let mut rows: Vec<Row> = rows.into_iter().take(limit + 1).collect();
        let truncated = rows.len() > limit;
        rows.truncate(limit);
        Self {
            columns,
            rows,
            truncated,
            ..Self::default()
        }
    }

    pub fn with_types(mut self, types: Vec<String>) -> Self {
        self.column_types = types;
        self
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaColumn {
    pub name: String,
    pub type_name: String,
    pub nullable: bool,
    pub primary_key: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaObject {
    pub name: String,
    pub kind: String,
    pub columns: Vec<SchemaColumn>,
}

impl SchemaObject {
    pub fn new(name: impl Into<String>, kind: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            kind: kind.into(),
            columns: Vec::new(),
        }
    }
}

#[derive(Default, Serialize)]
pub struct SchemaInfo {
    pub objects: Vec<SchemaObject>,
    pub note: Option<String>,
}

impl SchemaInfo {
    pub fn note(text: impl Into<String>) -> Self {
        Self {
            objects: Vec::new(),
            note: Some(text.into()),
        }
    }

    pub fn names(kind: &str, names: impl IntoIterator<Item = String>) -> Self {
        Self {
            objects: names.into_iter().map(|name| SchemaObject::new(name, kind)).collect(),
            note: None,
        }
    }

    pub fn from_column_rows(rows: &[Row]) -> Self {
        let mut objects: Vec<SchemaObject> = Vec::new();
        for row in rows {
            let cell = |index: usize| row.get(index).cloned().flatten().unwrap_or_default();
            let name = cell(0);
            let kind = if cell(1).to_uppercase().contains("VIEW") { "view" } else { "table" };
            let position = objects.iter().position(|object| object.name == name).unwrap_or_else(|| {
                objects.push(SchemaObject::new(name.clone(), kind));
                objects.len() - 1
            });
            if !cell(2).is_empty() {
                objects[position].columns.push(SchemaColumn {
                    name: cell(2),
                    type_name: cell(3),
                    nullable: matches!(cell(4).to_uppercase().as_str(), "YES" | "Y" | "TRUE" | "T" | "1"),
                    primary_key: matches!(cell(5).to_uppercase().as_str(), "YES" | "Y" | "TRUE" | "T" | "1" | "PRI"),
                });
            }
        }
        Self { objects, note: None }
    }
}
