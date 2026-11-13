use std::ops::Range;

fn userinfo_range(uri: &str) -> Option<Range<usize>> {
    let scheme_end = uri.find("://")? + 3;
    let rest = &uri[scheme_end..];
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let at = rest[..authority_end].rfind('@')?;
    Some(scheme_end..scheme_end + at)
}

pub fn stripping(uri: &str) -> (String, Option<String>) {
    let Some(range) = userinfo_range(uri) else {
        return (uri.to_string(), None);
    };
    let Some(colon) = uri[range.clone()].find(':') else {
        return (uri.to_string(), None);
    };
    let colon = range.start + colon;
    let password = uri[colon + 1..range.end].to_string();
    let clean = format!("{}{}", &uri[..colon], &uri[range.end..]);
    (clean, (!password.is_empty()).then_some(password))
}

pub fn inserting(password: Option<&str>, uri: &str) -> String {
    let Some(password) = password.filter(|value| !value.is_empty()) else {
        return uri.to_string();
    };
    match userinfo_range(uri) {
        Some(range) if !uri[range.clone()].contains(':') => {
            format!("{}:{}{}", &uri[..range.end], password, &uri[range.end..])
        }
        _ => uri.to_string(),
    }
}
