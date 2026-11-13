use keyring::Entry;

const SERVICE: &str = "querylab";

pub fn read(account: &str) -> Option<String> {
    Entry::new(SERVICE, account).ok()?.get_password().ok()
}

pub fn write(account: &str, secret: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE, account).map_err(|e| e.to_string())?;
    if secret.is_empty() {
        delete(account);
        return Ok(());
    }
    entry.set_password(secret).map_err(|e| e.to_string())
}

pub fn delete(account: &str) {
    if let Ok(entry) = Entry::new(SERVICE, account) {
        let _ = entry.delete_credential();
    }
}

fn provider_account(id: &str) -> String {
    format!("provider:{id}")
}

pub fn provider_key(id: &str) -> Option<String> {
    read(&provider_account(id))
}

pub fn save_provider_key(id: &str, key: &str) -> Result<(), String> {
    write(&provider_account(id), key)
}
