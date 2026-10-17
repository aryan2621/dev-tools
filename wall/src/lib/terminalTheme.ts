import type { ITheme } from '@xterm/xterm';

/** ANSI palettes tuned for LocalBoard's warm light and dark backgrounds (readable at 4.5:1). */
const LIGHT = {
  black: '#3d3a36',
  red: '#b5372d',
  green: '#3f7a3a',
  yellow: '#946200',
  blue: '#2c5fa8',
  magenta: '#8c3f8c',
  cyan: '#17707a',
  white: '#6b6760',
  brightBlack: '#7a766f',
  brightRed: '#c94a3f',
  brightGreen: '#4c8c46',
  brightYellow: '#a87000',
  brightBlue: '#3a6fbd',
  brightMagenta: '#a14fa1',
  brightCyan: '#1d818c',
  brightWhite: '#2a2825',
};

const DARK = {
  black: '#4a4844',
  red: '#ec7a6e',
  green: '#9ccf8a',
  yellow: '#e6c06a',
  blue: '#7fb0ee',
  magenta: '#d39be0',
  cyan: '#7fcfd4',
  white: '#d8d4cc',
  brightBlack: '#8a867e',
  brightRed: '#f59a90',
  brightGreen: '#b4e0a2',
  brightYellow: '#f0d290',
  brightBlue: '#a2c6f5',
  brightMagenta: '#e2b6ec',
  brightCyan: '#a0e0e4',
  brightWhite: '#f5f2ea',
};

function cssHsl(name: string, alpha?: number) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return alpha === undefined ? `hsl(${v})` : `hsl(${v} / ${alpha})`;
}

/** xterm colors from the LocalBoard CSS variables, so terminals follow light/dark and the accent. */
export function terminalTheme(): ITheme {
  const dark = document.documentElement.classList.contains('dark');
  return {
    ...(dark ? DARK : LIGHT),
    background: cssHsl('--background'),
    foreground: cssHsl('--foreground'),
    cursor: cssHsl('--brand'),
    cursorAccent: cssHsl('--background'),
    selectionBackground: cssHsl('--brand', 0.25),
  };
}
