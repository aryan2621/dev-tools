use crate::models::{KvItem, Request};
use regex::{Captures, Regex};
use std::{collections::HashMap, sync::LazyLock};

pub type Variables = HashMap<String, String>;

static PLACEHOLDER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}").expect("valid placeholder pattern"));

pub fn variable_map(items: &[KvItem]) -> Variables {
    items
        .iter()
        .filter(|item| item.is_active())
        .map(|item| (item.key.trim().to_string(), item.value.clone()))
        .collect()
}

pub fn resolve(text: &str, variables: &Variables) -> String {
    PLACEHOLDER
        .replace_all(text, |caps: &Captures| {
            variables
                .get(&caps[1])
                .cloned()
                .unwrap_or_else(|| caps[0].to_string())
        })
        .into_owned()
}

fn unresolved_in(text: &str, variables: &Variables, found: &mut Vec<String>) {
    for caps in PLACEHOLDER.captures_iter(text) {
        let name = caps[1].to_string();
        if !variables.contains_key(&name) && !found.contains(&name) {
            found.push(name);
        }
    }
}

pub fn unresolved_names(request: &Request, variables: &Variables) -> Vec<String> {
    let mut found = Vec::new();
    let texts = [&request.url, &request.body.raw, &request.body.graphql_variables]
        .into_iter()
        .map(String::as_str)
        .chain(
            request
                .params
                .iter()
                .chain(&request.headers)
                .chain(&request.body.form_items)
                .flat_map(|item| [item.key.as_str(), item.value.as_str()]),
        );
    for text in texts {
        unresolved_in(text, variables, &mut found);
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(pairs: &[(&str, &str)]) -> Variables {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn resolves_known_and_keeps_unknown_placeholders() {
        let variables = vars(&[("host", "api.test")]);
        assert_eq!(resolve("https://{{ host }}/{{missing}}", &variables), "https://api.test/{{missing}}");
    }

    #[test]
    fn lists_each_unresolved_name_once() {
        let mut request = Request::default();
        request.url = "{{a}}/{{b}}/{{a}}".into();
        assert_eq!(unresolved_names(&request, &vars(&[("b", "1")])), vec!["a"]);
    }
}
