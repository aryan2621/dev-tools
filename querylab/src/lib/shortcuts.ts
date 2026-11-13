const isMac = /Mac/i.test(navigator.platform);

export const MOD = isMac ? "⌘" : "Ctrl";
export const ENTER = "↵";

export const SHORTCUTS = {
  run: [MOD, ENTER],
  newTab: [MOD, "T"],
  closeTab: [MOD, "W"],
  palette: [MOD, "K"],
  switcher: [MOD, "P"],
};
