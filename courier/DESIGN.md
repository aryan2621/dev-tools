# Courier: design system ("dispatch desk")

- **Type:** system UI font for chrome; JetBrains Mono only for URLs, code, headers, values. Scale 11/12/13/15px.
- **Colour:** cool graphite neutrals; one accent, courier yellow (`--primary`), used for Send, focus ring, selection. Accent text uses `--primary-ink` (4.5:1). Status colours are semantic only. Tokens live in `src/styles.css` (light + dark, both designed).
- **Shape:** 6px controls, 4px chips; borders not shadows; popovers only get a soft shadow.
- **Layout:** sidebar always shows workspace (Collections | History tabs, ⌘1/⌘2), tools in the footer icon row; request beside response at >=1280px, stacked when narrower or when the Assistant is open.
- **Motion:** 100-150ms ease-out state changes only; honours reduced motion.
- **Accessibility:** 2px accent focus ring, roving tree + tab keyboard nav, labelled icon buttons, status never colour-only.
