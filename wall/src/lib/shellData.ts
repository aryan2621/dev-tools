import { invoke } from '@tauri-apps/api/core';

/** Shell knowledge shared by every pane: command names (for highlighting and AI detection) and history. */
let known: Set<string> | null = null;
let knownLoading: Promise<void> | null = null;
let history: string[] = [];
let historyLoaded = false;

export function loadShellData() {
  if (!knownLoading) {
    knownLoading = invoke<string[]>('known_commands')
      .then((list) => {
        known = new Set(list);
      })
      .catch(() => {});
  }
  if (!historyLoaded) {
    historyLoaded = true;
    invoke<string[]>('shell_history', { limit: 5000 })
      .then((h) => {
        history = [...h, ...history];
      })
      .catch(() => {});
  }
}

export function isKnownCommand(word: string) {
  if (!known) return true; // until loaded, never misclassify a command as English
  return known.has(word);
}

export function knownLoaded() {
  return known !== null;
}

export function pushHistory(cmd: string) {
  if (!cmd.trim()) return;
  history = history.filter((h) => h !== cmd);
  history.push(cmd);
}

export function getHistory() {
  return history;
}

/** Most recent history entry that extends `prefix`. */
export function suggestFromHistory(prefix: string): string | null {
  if (!prefix.trim() || prefix.includes('\n')) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.length > prefix.length && h.startsWith(prefix) && !h.includes('\n')) return h;
  }
  return null;
}

const STOPWORDS = new Set(
  'the a an all my me this that these those here there for with in of to from and which what is are be it its into on by every any some files folder folders directory biggest largest large small big recent last first how why where please can could would should i you show give tell make'.split(
    ' ',
  ),
);
const QUESTION_START = /^(how|what|why|where|which|who|when|can|could|would|should|is|are|does|do|please|explain|show me|give me|tell me|help)\b/i;
const SHELL_CHARS = /[-|&;<>$=`'"\\/*~(){}[\]]/;

/**
 * Warp-style natural-language detection: true when the line reads like English rather than a command.
 * Conservative: anything with shell syntax, or a known command followed by few English words, stays a command.
 */
export function looksLikeNaturalLanguage(line: string): boolean {
  const text = line.trim();
  if (!text || text.includes('\n')) return false;
  const words = text.split(/\s+/);
  if (words.length < 3) return false;
  if (text.endsWith('?') && !SHELL_CHARS.test(text.slice(0, -1))) return true;
  if (SHELL_CHARS.test(text)) return false;
  if (QUESTION_START.test(text) && !isKnownCommand(words[0])) return true;
  const englishWords = words.slice(1).filter((w) => STOPWORDS.has(w.toLowerCase())).length;
  if (!isKnownCommand(words[0])) return englishWords >= 1 || words.length >= 4;
  return englishWords >= 2 && words.length >= 4;
}
