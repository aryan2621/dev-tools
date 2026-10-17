use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Every finished block, kept in `<appData>/history.db` for the Home dashboard and search.
pub struct History {
    db: Mutex<Connection>,
}

impl History {
    pub fn open(dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let db = Connection::open(dir.join("history.db")).map_err(|e| e.to_string())?;
        db.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS blocks (
               id TEXT PRIMARY KEY,
               command TEXT NOT NULL,
               cwd TEXT NOT NULL DEFAULT '',
               git_branch TEXT,
               started_at INTEGER NOT NULL,
               finished_at INTEGER NOT NULL,
               exit_code INTEGER NOT NULL,
               output_tail TEXT NOT NULL DEFAULT ''
             );
             CREATE INDEX IF NOT EXISTS blocks_started ON blocks(started_at);
             CREATE TABLE IF NOT EXISTS events (kind TEXT NOT NULL, at INTEGER NOT NULL);",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self { db: Mutex::new(db) })
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRow {
    pub id: String,
    pub command: String,
    pub cwd: String,
    pub git_branch: Option<String>,
    pub started_at: i64,
    pub finished_at: i64,
    pub exit_code: i32,
    #[serde(default)]
    pub output_tail: String,
}

#[tauri::command]
pub fn history_record(history: State<'_, History>, row: HistoryRow) -> Result<(), String> {
    let db = history.db.lock().map_err(|e| e.to_string())?;
    let tail: String = row.output_tail.chars().rev().take(4000).collect::<Vec<_>>().into_iter().rev().collect();
    db.execute(
        "INSERT OR REPLACE INTO blocks (id, command, cwd, git_branch, started_at, finished_at, exit_code, output_tail)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![row.id, row.command, row.cwd, row.git_branch, row.started_at, row.finished_at, row.exit_code, tail],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Counts app events such as `ai_accepted` for the dashboard.
#[tauri::command]
pub fn history_event(history: State<'_, History>, kind: String) -> Result<(), String> {
    let db = history.db.lock().map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
    db.execute("INSERT INTO events (kind, at) VALUES (?1, ?2)", params![kind, now]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn history_search(
    history: State<'_, History>,
    query: String,
    failed_only: bool,
    limit: u32,
) -> Result<Vec<HistoryRow>, String> {
    let db = history.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, command, cwd, git_branch, started_at, finished_at, exit_code, '' FROM blocks
             WHERE (?1 = '' OR command LIKE '%' || ?1 || '%' OR cwd LIKE '%' || ?1 || '%')
               AND (?2 = 0 OR exit_code NOT IN (0, 130))
             ORDER BY started_at DESC LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![query, failed_only as i32, limit], |r| {
            Ok(HistoryRow {
                id: r.get(0)?,
                command: r.get(1)?,
                cwd: r.get(2)?,
                git_branch: r.get(3)?,
                started_at: r.get(4)?,
                finished_at: r.get(5)?,
                exit_code: r.get(6)?,
                output_tail: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayCount {
    pub day: String,
    pub total: i64,
    pub failed: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopCommand {
    pub command: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub total: i64,
    pub today: i64,
    pub success_rate: f64,
    pub avg_duration_ms: f64,
    pub ai_accepted: i64,
    pub streak_days: i64,
    pub daily: Vec<DayCount>,
    pub top: Vec<TopCommand>,
}

/// Dashboard numbers. Days are local-time calendar days.
#[tauri::command]
pub fn history_stats(history: State<'_, History>) -> Result<Stats, String> {
    let db = history.db.lock().map_err(|e| e.to_string())?;
    let e = |e: rusqlite::Error| e.to_string();
    let (total, ok, avg): (i64, i64, f64) = db
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(exit_code IN (0, 130)), 0), COALESCE(AVG(finished_at - started_at), 0) FROM blocks",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(e)?;
    let today: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM blocks WHERE date(started_at / 1000, 'unixepoch', 'localtime') = date('now', 'localtime')",
            [],
            |r| r.get(0),
        )
        .map_err(e)?;
    let ai_accepted: i64 =
        db.query_row("SELECT COUNT(*) FROM events WHERE kind = 'ai_accepted'", [], |r| r.get(0)).map_err(e)?;

    let mut stmt = db
        .prepare(
            "WITH RECURSIVE days(d, n) AS (
               SELECT date('now', 'localtime'), 0
               UNION ALL SELECT date(d, '-1 day'), n + 1 FROM days WHERE n < 13
             )
             SELECT d,
               (SELECT COUNT(*) FROM blocks WHERE date(started_at / 1000, 'unixepoch', 'localtime') = d),
               (SELECT COUNT(*) FROM blocks WHERE date(started_at / 1000, 'unixepoch', 'localtime') = d AND exit_code NOT IN (0, 130))
             FROM days ORDER BY d",
        )
        .map_err(e)?;
    let daily: Vec<DayCount> = stmt
        .query_map([], |r| Ok(DayCount { day: r.get(0)?, total: r.get(1)?, failed: r.get(2)? }))
        .map_err(e)?
        .collect::<Result<_, _>>()
        .map_err(e)?;

    // Streak: consecutive days with at least one command, ending today (or yesterday).
    let mut stmt = db
        .prepare(
            "SELECT DISTINCT date(started_at / 1000, 'unixepoch', 'localtime') AS d FROM blocks ORDER BY d DESC LIMIT 400",
        )
        .map_err(e)?;
    let days: Vec<String> = stmt.query_map([], |r| r.get(0)).map_err(e)?.collect::<Result<_, _>>().map_err(e)?;
    let mut streak = 0i64;
    let mut expect: String = db.query_row("SELECT date('now', 'localtime')", [], |r| r.get(0)).map_err(e)?;
    for (i, d) in days.iter().enumerate() {
        if *d == expect {
            streak += 1;
        } else if i == 0 && streak == 0 {
            let yesterday: String =
                db.query_row("SELECT date('now', 'localtime', '-1 day')", [], |r| r.get(0)).map_err(e)?;
            if *d != yesterday {
                break;
            }
            streak += 1;
            expect = yesterday;
        } else {
            break;
        }
        expect = db.query_row("SELECT date(?1, '-1 day')", [&expect], |r| r.get(0)).map_err(e)?;
    }

    let mut stmt = db
        .prepare(
            "SELECT command, COUNT(*) AS c FROM blocks WHERE command != '' GROUP BY command ORDER BY c DESC LIMIT 10",
        )
        .map_err(e)?;
    let top: Vec<TopCommand> = stmt
        .query_map([], |r| Ok(TopCommand { command: r.get(0)?, count: r.get(1)? }))
        .map_err(e)?
        .collect::<Result<_, _>>()
        .map_err(e)?;

    Ok(Stats {
        total,
        today,
        success_rate: if total > 0 { ok as f64 / total as f64 } else { 1.0 },
        avg_duration_ms: avg,
        ai_accepted,
        streak_days: streak,
        daily,
        top,
    })
}

#[tauri::command]
pub fn history_clear(history: State<'_, History>) -> Result<(), String> {
    let db = history.db.lock().map_err(|e| e.to_string())?;
    db.execute_batch("DELETE FROM blocks; DELETE FROM events;").map_err(|e| e.to_string())
}
