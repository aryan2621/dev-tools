use crate::drivers::{self, Driver};
use crate::error::{DriverError, DriverResult};
use crate::model::QueryResult;
use crate::profile::ConnectionProfile;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::sync::Notify;

#[derive(Default)]
pub struct Sessions {
    drivers: Mutex<HashMap<String, Arc<dyn Driver>>>,
    runs: Mutex<HashMap<String, Arc<Notify>>>,
}

impl Sessions {
    pub fn driver(&self, profile_id: &str) -> DriverResult<Arc<dyn Driver>> {
        self.drivers.lock().unwrap().get(profile_id).cloned().ok_or(DriverError::NotConnected)
    }

    pub async fn connect(&self, profile: ConnectionProfile) -> DriverResult<()> {
        let id = profile.id.clone();
        let driver = drivers::make(profile)?;
        driver.connect().await?;
        let previous = self.drivers.lock().unwrap().insert(id, driver);
        if let Some(previous) = previous {
            previous.disconnect().await;
        }
        Ok(())
    }

    pub async fn disconnect(&self, profile_id: &str) {
        let driver = self.drivers.lock().unwrap().remove(profile_id);
        if let Some(driver) = driver {
            driver.disconnect().await;
        }
    }

    pub fn connected_ids(&self) -> Vec<String> {
        self.drivers.lock().unwrap().keys().cloned().collect()
    }

    pub async fn run(
        &self,
        profile_id: &str,
        run_id: &str,
        input: &str,
        operation: Option<&str>,
        row_limit: usize,
    ) -> DriverResult<QueryResult> {
        let driver = self.driver(profile_id)?;
        let cancel = Arc::new(Notify::new());
        self.runs.lock().unwrap().insert(run_id.to_string(), cancel.clone());
        let started = Instant::now();
        let outcome = tokio::select! {
            result = driver.run(input, operation, row_limit) => result,
            _ = cancel.notified() => {
                driver.cancel().await;
                Err(DriverError::Cancelled)
            }
        };
        self.runs.lock().unwrap().remove(run_id);
        outcome.map(|mut result| {
            result.duration_ms = started.elapsed().as_secs_f64() * 1000.0;
            result
        })
    }

    pub fn cancel(&self, run_id: &str) {
        if let Some(cancel) = self.runs.lock().unwrap().get(run_id) {
            cancel.notify_one();
        }
    }
}
