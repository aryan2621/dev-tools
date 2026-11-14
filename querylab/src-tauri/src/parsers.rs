use crate::error::DriverResult;
use crate::model::{QueryResult, Row};
use serde_json::{Map, Value};

/// Row limit meaning "everything" for internal schema queries.
pub const ALL_ROWS: usize = usize::MAX / 2;

pub fn json_row(value: &Value) -> Vec<Option<String>> {
    value.as_array().map(|cells| cells.iter().map(stringify).collect()).unwrap_or_default()
}

pub fn stringify(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(text) => Some(text.clone()),
        other => Some(other.to_string()),
    }
}

pub fn pretty(value: &Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

pub fn table_from_objects(objects: &[&Map<String, Value>]) -> (Vec<String>, Vec<Row>) {
    let mut columns: Vec<String> = Vec::new();
    for object in objects {
        for key in object.keys() {
            if !columns.contains(key) {
                columns.push(key.clone());
            }
        }
    }
    let rows = objects
        .iter()
        .map(|object| columns.iter().map(|key| object.get(key).and_then(stringify)).collect())
        .collect();
    (columns, rows)
}

pub fn objects_result(objects: &[&Map<String, Value>], limit: usize) -> QueryResult {
    let (columns, rows) = table_from_objects(objects);
    QueryResult::table(columns, rows, limit)
}

pub fn json_result(value: &Value, limit: usize) -> QueryResult {
    match value {
        Value::Array(items) if items.iter().all(Value::is_object) && !items.is_empty() => {
            let objects: Vec<&Map<String, Value>> = items.iter().filter_map(Value::as_object).collect();
            objects_result(&objects, limit)
        }
        Value::Array(items) if !items.is_empty() => {
            QueryResult::table(vec!["value".into()], items.iter().map(|item| vec![stringify(item)]), limit)
        }
        Value::Object(object) => objects_result(&[object], limit),
        Value::Array(_) => QueryResult::message("[]"),
        other => QueryResult::message(pretty(other)),
    }
}

pub fn parse_csv(text: &str) -> DriverResult<Vec<Vec<String>>> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(text.trim_start_matches('\u{feff}').as_bytes());
    let mut records = Vec::new();
    for record in reader.records() {
        records.push(record?.iter().map(String::from).collect());
    }
    Ok(records)
}
