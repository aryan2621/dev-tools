use serde_json::Value;

pub fn value(bytes: &[u8], path: &str) -> Option<String> {
    let root: Value = serde_json::from_slice(bytes).ok()?;
    let mut node = &root;
    for step in path.split('.').filter(|step| !step.is_empty()) {
        node = match node {
            Value::Object(map) => map.get(step)?,
            Value::Array(items) => items.get(step.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(match node {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::value;

    #[test]
    fn walks_objects_and_arrays() {
        let body = br#"{"data":{"items":[{"id":7}]}}"#;
        assert_eq!(value(body, "data.items.0.id").as_deref(), Some("7"));
    }

    #[test]
    fn strings_are_unquoted_and_misses_are_none() {
        assert_eq!(value(br#"{"a":"x"}"#, "a").as_deref(), Some("x"));
        assert_eq!(value(br#"{"a":1}"#, "b"), None);
        assert_eq!(value(b"not json", "a"), None);
    }
}
