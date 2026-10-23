/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // styles.css already owns the base styles; preflight would reset the whole app.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        border: "var(--border)",
        popover: "var(--surface)",
        accent: "var(--surface-2)",
        foreground: "var(--text)",
        "muted-foreground": "var(--muted)",
        ring: "var(--accent)",
      },
      transitionDuration: { fast: "150ms" },
      keyframes: {
        "overlay-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "overlay-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "sheet-in": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "sheet-out": { from: { transform: "translateX(0)" }, to: { transform: "translateX(100%)" } },
      },
      animation: {
        "overlay-in": "overlay-in 150ms ease-out",
        "overlay-out": "overlay-out 120ms ease-in",
        "sheet-in": "sheet-in 260ms cubic-bezier(0.16, 1, 0.3, 1)",
        "sheet-out": "sheet-out 180ms ease-in",
      },
    },
  },
};
