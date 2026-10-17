use std::sync::LazyLock;

use regex::RegexSet;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Risk {
    Safe,
    Caution,
    Danger,
}

/// Commands that destroy data, escalate privileges or run downloaded code. Always `danger`,
/// whatever the model says about them.
static DANGER: LazyLock<RegexSet> = LazyLock::new(|| {
    RegexSet::new([
        r"(?i)\brm\s+(-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(-[a-z]*\s+)*(/|~|\$HOME|\*|\.\.?)(\s|$)",
        r"(?i)\bmkfs(\.\w+)?\b",
        r"(?i)\bdd\b[^|;&]*\bof=/dev/",
        r":\(\)\s*\{",
        r"(?i)\bchmod\s+(-[a-z]+\s+)*-R\s+(0?777|a\+rwx)\s+(/|~)",
        r"(?i)\bchown\s+(-[a-z]+\s+)*-R\s+\S+\s+/(\s|$)",
        r"(?i)\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b",
        r"(?i)\bsudo\b",
        r"(?i)>\s*/dev/(sd|disk|nvme|hd)",
        r"(?i)\b(shutdown|reboot|halt)\b",
        r"(?i)\bdrop\s+(table|database|schema)\b",
        r"(?i)\bdiskutil\s+(erase|partition|zero|secure)",
    ])
    .expect("valid danger patterns")
});

/// Commands that change or lose work and deserve a second look.
static CAUTION: LazyLock<RegexSet> = LazyLock::new(|| {
    RegexSet::new([
        r"(?i)\brm\b",
        r"(?i)\bgit\s+push\b[^|;&]*(\s-f\b|--force)",
        r"(?i)\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+--\s|restore\b)",
        r"(?i)\bkill(all)?\s+-9\b",
        r"(?i)\b(mv|cp)\b[^|;&]*\s-[a-z]*f",
        r"(?i)\bchmod\b|\bchown\b",
        r"(?i)\btruncate\b|\bshred\b",
        r">\s*[^\s&|]+",
        r"(?i)\b(npm|pip|brew|cargo)\s+(uninstall|remove)\b",
        r"(?i)\bxargs\b[^|;&]*\brm\b",
    ])
    .expect("valid caution patterns")
});

/// The higher of the model's own rating and what the rules find.
pub fn assess(command: &str, model_risk: Risk) -> Risk {
    let rule = if DANGER.is_match(command) {
        Risk::Danger
    } else if CAUTION.is_match(command) {
        Risk::Caution
    } else {
        Risk::Safe
    };
    rule.max(model_risk)
}

/// Makes a model-written command safe to type into a prompt: one line, no control characters.
/// A newline written to the PTY would run the command, which suggestions must never do.
pub fn sanitize(command: &str) -> String {
    command
        .trim()
        .chars()
        .map(|c| if c == '\n' || c == '\r' { ' ' } else { c })
        .filter(|c| !c.is_control() || *c == '\t')
        .collect::<String>()
        .trim()
        .to_owned()
}
