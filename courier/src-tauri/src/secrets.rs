use crate::models::{Collection, RequestAuth};
use keyring::{Entry, Error};
use std::collections::{HashMap, HashSet};

const SERVICE: &str = "Courier";

#[derive(Default)]
pub struct SecretVault {
    known: HashMap<String, String>,
}

fn secret_fields(auth: &mut RequestAuth) -> [(&'static str, &mut String); 3] {
    [
        ("token", &mut auth.token),
        ("password", &mut auth.password),
        ("keyValue", &mut auth.key_value),
    ]
}

fn read(account: &str) -> Option<String> {
    Entry::new(SERVICE, account).ok()?.get_password().ok()
}

fn provider_account(id: &str) -> String {
    format!("provider:{id}")
}

pub fn provider_key(id: &str) -> Option<String> {
    read(&provider_account(id))
}

pub fn save_provider_key(id: &str, key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &provider_account(id)).map_err(|error| error.to_string())?;
    let outcome = if key.is_empty() { entry.delete_credential() } else { entry.set_password(key) };
    match outcome {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

impl SecretVault {
    fn store(&mut self, account: &str, value: &str) -> bool {
        let current = self.known.get(account).map(String::as_str).unwrap_or("");
        if current == value {
            return true;
        }
        let Ok(entry) = Entry::new(SERVICE, account) else {
            return value.is_empty();
        };
        let outcome = if value.is_empty() {
            entry.delete_credential()
        } else {
            entry.set_password(value)
        };
        let stored = matches!(outcome, Ok(()) | Err(Error::NoEntry));
        if stored {
            if value.is_empty() {
                self.known.remove(account);
            } else {
                self.known.insert(account.into(), value.into());
            }
        }
        stored
    }

    pub fn adopt(&mut self, collections: &mut [Collection]) {
        for request in collections.iter_mut().flat_map(|collection| collection.requests_mut()) {
            let id = request.id.clone();
            for (name, value) in secret_fields(&mut request.auth) {
                let account = format!("{id}.{name}");
                if value.is_empty() {
                    if let Some(secret) = read(&account) {
                        self.known.insert(account, secret.clone());
                        *value = secret;
                    }
                } else {
                    self.store(&account, value);
                }
            }
        }
    }

    pub fn protect(&mut self, collections: &[Collection]) -> Vec<Collection> {
        let mut stripped = collections.to_vec();
        let mut live = HashSet::new();
        for request in stripped.iter_mut().flat_map(|collection| collection.requests_mut()) {
            let id = request.id.clone();
            for (name, value) in secret_fields(&mut request.auth) {
                let account = format!("{id}.{name}");
                if self.store(&account, value) {
                    value.clear();
                }
                live.insert(account);
            }
        }
        let stale: Vec<String> = self
            .known
            .keys()
            .filter(|account| !live.contains(*account))
            .cloned()
            .collect();
        for account in stale {
            self.store(&account, "");
        }
        stripped
    }
}
