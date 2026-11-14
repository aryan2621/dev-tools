use thiserror::Error;

#[derive(Debug, Error)]
pub enum DriverError {
    #[error("{0}")]
    Message(String),
    #[error("Not connected.")]
    NotConnected,
    #[error("{0}")]
    Unsupported(String),
    #[error("Query cancelled.")]
    Cancelled,
}

pub type DriverResult<T> = Result<T, DriverError>;

impl DriverError {
    pub fn message(text: impl Into<String>) -> Self {
        Self::Message(text.into())
    }
}

macro_rules! from_display {
    ($($source:ty),* $(,)?) => {
        $(impl From<$source> for DriverError {
            fn from(error: $source) -> Self {
                Self::Message(error.to_string())
            }
        })*
    };
}

from_display!(
    std::io::Error,
    serde_json::Error,
    reqwest::Error,
    rusqlite::Error,
    native_tls::Error,
    mysql_async::Error,
    mongodb::error::Error,
    mongodb::bson::ser::Error,
    mongodb::bson::de::Error,
    redis::RedisError,
    csv::Error,
);

impl From<tokio_postgres::Error> for DriverError {
    fn from(error: tokio_postgres::Error) -> Self {
        let Some(db) = error.as_db_error() else {
            return Self::Message(std::error::Error::source(&error).map_or_else(|| error.to_string(), |cause| cause.to_string()));
        };
        let mut text = format!("{}: {}", db.severity(), db.message());
        for extra in [db.detail(), db.hint()].into_iter().flatten() {
            text.push('\n');
            text.push_str(extra);
        }
        Self::Message(text)
    }
}
