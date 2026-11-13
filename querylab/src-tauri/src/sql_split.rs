pub fn statements(sql: &str) -> Vec<String> {
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
        } else if (c == '-' && next == Some('-')) || c == '#' {
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
