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
