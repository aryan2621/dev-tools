import type { Theme } from "@glideapps/glide-data-grid";

export function readTheme(): Partial<Theme> {
  const css = getComputedStyle(document.documentElement);
  const context = document.createElement("canvas").getContext("2d");
  const raw = (name: string) => css.getPropertyValue(name).trim();
  const token = (name: string) => {
    if (!context) return `hsl(${raw(name)})`;
    context.fillStyle = `hsl(${raw(name)})`;
    return context.fillStyle;
  };
  return {
    accentColor: token("--primary"),
    accentFg: token("--primary-foreground"),
    accentLight: token("--primary-soft"),
    textDark: token("--foreground"),
    textMedium: token("--muted-foreground"),
    textLight: token("--muted-foreground"),
    textHeader: token("--muted-foreground"),
    textHeaderSelected: token("--primary-foreground"),
    textBubble: token("--foreground"),
    bgIconHeader: token("--muted-foreground"),
    fgIconHeader: token("--background"),
    bgCell: token("--background"),
    bgCellMedium: token("--sidebar"),
    bgHeader: token("--sidebar"),
    bgHeaderHasFocus: token("--muted"),
    bgHeaderHovered: token("--muted"),
    bgBubble: token("--muted"),
    bgBubbleSelected: token("--primary-soft"),
    bgSearchResult: token("--primary-soft"),
    borderColor: token("--border"),
    horizontalBorderColor: token("--border"),
    drilldownBorder: token("--input"),
    linkColor: token("--primary"),
    cellHorizontalPadding: 9,
    cellVerticalPadding: 4,
    headerFontStyle: "600 11px",
    baseFontStyle: "12px",
    markerFontStyle: "10px",
    editorFontSize: "12px",
    fontFamily: raw("--mono").replace(/\s+/g, " "),
  };
}
