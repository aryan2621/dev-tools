const isMac = /Mac/i.test(navigator.platform);

const MOD = isMac ? "⌘" : "Ctrl";
const ENTER = "↵";

export const SHORTCUTS = {
  run: [MOD, ENTER],
  newTab: [MOD, "T"],
  closeTab: [MOD, "W"],
  assistant: [MOD, "J"],
  palette: [MOD, "K"],
  switcher: [MOD, "P"],
};
