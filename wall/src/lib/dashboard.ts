import { invoke } from '@tauri-apps/api/core';

/** Opens the dashboard window (Home and Settings live there, not in the terminal). `view` is
 * "home" or "settings[/section]". */
export function openDashboard(view: string) {
  invoke('open_dashboard', { view }).catch(() => {});
}
