#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    Mysql,
    Postgres,
    Sqlite,
}

fn dollar_tag(chars: &[char], at: usize) -> Option<String> {
    let mut end = at + 1;
    while end < chars.len() && (chars[end].is_alphanumeric() || chars[end] == '_') {
        end += 1;
    }
    (chars.get(end) == Some(&'$') && !chars.get(at + 1).is_some_and(|c| c.is_ascii_digit())).then(|| chars[at..=end].iter().collect())
}

fn inside_trigger_body(statement: &str) -> bool {
    let upper = statement.to_uppercase();
    let head = upper.trim_start();
    let is_trigger = head.starts_with("CREATE TRIGGER") || head.starts_with("CREATE TEMP TRIGGER") || head.starts_with("CREATE TEMPORARY TRIGGER");
    is_trigger && upper.contains("BEGIN") && !upper.trim_end().ends_with("END")
}

pub fn statements(sql: &str, dialect: Dialect) -> Vec<String> {
    let chars: Vec<char> = sql.chars().collect();
    let mut result = Vec::new();
    let mut current = String::new();
    let mut i = 0;

    let flush = |current: &mut String, result: &mut Vec<String>| {
        let trimmed = current.trim();
        if !trimmed.is_empty() {
            result.push(trimmed.to_string());
        }
        current.clear();
    };

    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        if matches!(c, '\'' | '"' | '`') {
            current.push(c);
            i += 1;
            while i < chars.len() {
                let q = chars[i];
                current.push(q);
                i += 1;
                if q == '\\' && c != '`' && i < chars.len() {
                    current.push(chars[i]);
                    i += 1;
                } else if q == c {
                    if chars.get(i) == Some(&c) {
                        current.push(c);
                        i += 1;
                    } else {
                        break;
                    }
                }
            }
        } else if c == '$' && dialect == Dialect::Postgres && dollar_tag(&chars, i).is_some() {
            let tag = dollar_tag(&chars, i).unwrap_or_default();
            let tag_chars: Vec<char> = tag.chars().collect();
            current.push_str(&tag);
            i += tag_chars.len();
            while i < chars.len() && chars[i..].get(..tag_chars.len()) != Some(tag_chars.as_slice()) {
                current.push(chars[i]);
                i += 1;
            }
            let closing: String = chars[i..(i + tag_chars.len()).min(chars.len())].iter().collect();
            current.push_str(&closing);
            i += tag_chars.len();
        } else if (c == '-' && next == Some('-')) || (c == '#' && dialect == Dialect::Mysql) {
            while i < chars.len() && chars[i] != '\n' {
                current.push(chars[i]);
                i += 1;
            }
        } else if c == '/' && next == Some('*') {
            while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                current.push(chars[i]);
                i += 1;
            }
            let closing: String = chars[i..(i + 2).min(chars.len())].iter().collect();
            current.push_str(&closing);
            i += 2;
        } else if c == ';' && dialect == Dialect::Sqlite && inside_trigger_body(&current) {
            current.push(c);
            i += 1;
        } else if c == ';' {
            flush(&mut current, &mut result);
            i += 1;
        } else {
            current.push(c);
            i += 1;
        }
    }
    flush(&mut current, &mut result);
    result
}
