import animate from "tailwindcss-animate";

const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "media",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--sans)"],
        mono: ["var(--mono)"],
      },
      fontSize: {
        xs: ["11px", "16px"],
        sm: ["12px", "16px"],
        base: ["13px", "18px"],
      },
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        card: { DEFAULT: token("card"), foreground: token("foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("foreground") },
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground"), soft: token("primary-soft") },
        secondary: { DEFAULT: token("secondary"), foreground: token("foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("foreground") },
        destructive: { DEFAULT: token("destructive"), foreground: token("destructive-foreground"), soft: token("destructive-soft") },
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        sidebar: token("sidebar"),
        success: { DEFAULT: token("success"), soft: token("success-soft") },
        warning: { DEFAULT: token("warning"), soft: token("warning-soft") },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      transitionDuration: { DEFAULT: "120ms" },
      transitionTimingFunction: { DEFAULT: "ease-out" },
      boxShadow: {
        panel: "0 1px 2px hsl(215 25% 10% / 0.04), 0 4px 16px hsl(215 25% 10% / 0.04)",
      },
    },
  },
  plugins: [animate],
};
