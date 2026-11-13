use crate::error::DriverResult;
use crate::model::{QueryResult, Row};
use serde_json::{Map, Value};

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

pub fn csv_result(text: &str, limit: usize) -> DriverResult<QueryResult> {
    let mut records = parse_csv(text)?;
    if records.is_empty() || (records.len() == 1 && records[0].iter().all(String::is_empty)) {
        return Ok(QueryResult::message("OK"));
    }
    let columns = records.remove(0);
    let rows = records.into_iter().map(|record| record.into_iter().map(Some).collect::<Row>());
    Ok(QueryResult::table(columns, rows, limit))
}

pub fn aligned_table_result(text: &str, limit: usize) -> QueryResult {
    let lines: Vec<&str> = text.lines().map(str::trim_end).filter(|line| !line.trim().is_empty()).collect();
    let separator = lines.iter().position(|line| {
        let compact = line.trim();
        !compact.is_empty() && compact.chars().all(|c| matches!(c, '-' | '+' | '|' | ' '))
    });
    let Some(separator) = separator.filter(|index| *index > 0) else {
        return QueryResult::message(if text.trim().is_empty() { "OK" } else { text.trim() });
    };
    let split = |line: &str| -> Vec<String> { line.split('|').map(|cell| cell.trim().to_string()).collect() };
    let columns = split(lines[separator - 1]);
    let rows = lines[separator + 1..]
        .iter()
        .take_while(|line| !(line.starts_with('(') && line.ends_with(')')))
        .map(|line| split(line).into_iter().map(|cell| if cell == "null" { None } else { Some(cell) }).collect::<Row>());
    QueryResult::table(columns, rows, limit)
}
