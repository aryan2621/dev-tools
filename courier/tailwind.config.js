import animate from "tailwindcss-animate";

const token = (name) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ["media"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    fontSize: {
      xs: ["11px", "16px"],
      sm: ["12px", "16px"],
      base: ["13px", "18px"],
      lg: ["15px", "20px"],
      xl: ["20px", "26px"],
      "2xl": ["26px", "32px"],
    },
    extend: {
      fontFamily: { sans: "var(--sans)", mono: "var(--mono)" },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: token("background"),
        foreground: token("foreground"),
        sidebar: token("sidebar"),
        card: { DEFAULT: token("card"), foreground: token("card-foreground") },
        popover: { DEFAULT: token("popover"), foreground: token("popover-foreground") },
        primary: { DEFAULT: token("primary"), foreground: token("primary-foreground"), ink: token("primary-ink"), soft: token("primary-soft") },
        secondary: { DEFAULT: token("secondary"), foreground: token("secondary-foreground") },
        muted: { DEFAULT: token("muted"), foreground: token("muted-foreground") },
        accent: { DEFAULT: token("accent"), foreground: token("accent-foreground") },
        destructive: { DEFAULT: token("destructive"), foreground: token("destructive-foreground"), soft: token("destructive-soft") },
        success: { DEFAULT: token("success"), soft: token("success-soft") },
        warning: { DEFAULT: token("warning"), soft: token("warning-soft") },
        method: {
          get: token("method-get"),
          post: token("method-post"),
          put: token("method-put"),
          patch: token("method-patch"),
          delete: token("method-delete"),
          head: token("method-head"),
          options: token("method-options"),
        },
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
      },
      boxShadow: {
        panel: "0 1px 2px hsl(215 25% 10% / 0.04), 0 4px 16px hsl(215 25% 10% / 0.05)",
        dialog: "0 12px 40px -12px hsl(215 30% 12% / 0.35), 0 2px 8px hsl(215 30% 12% / 0.08)",
      },
      transitionDuration: { DEFAULT: "120ms" },
      transitionTimingFunction: { DEFAULT: "ease-out" },
    },
  },
  plugins: [animate],
};
