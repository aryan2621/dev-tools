export const isMac = /Mac/i.test(navigator.userAgent);
export const modKey = isMac ? "Cmd" : "Ctrl";
export const modSymbol = isMac ? "⌘" : "Ctrl";
