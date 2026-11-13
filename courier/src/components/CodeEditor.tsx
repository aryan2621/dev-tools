import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useState } from "react";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: "json" | "plain";
  label: string;
  wrap?: boolean;
}

const frame = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", fontSize: "12px", color: "hsl(var(--foreground))" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.6" },
  ".cm-content": { padding: "8px 0", caretColor: "hsl(var(--primary))" },
  ".cm-line": { padding: "0 12px" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "hsl(var(--muted-foreground))", paddingLeft: "4px" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 6px 0 8px", minWidth: "30px" },
  ".cm-activeLine": { backgroundColor: "hsl(var(--primary) / 0.05)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "hsl(var(--foreground))" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--primary))", borderLeftWidth: "2px" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "hsl(var(--primary) / 0.16)",
  },
  ".cm-placeholder": { color: "hsl(var(--muted-foreground))" },
  ".cm-tooltip": {
    border: "1px solid hsl(var(--border))",
    backgroundColor: "hsl(var(--popover))",
    boxShadow: "0 8px 24px hsl(215 25% 10% / 0.14)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "hsl(var(--accent))",
    color: "hsl(var(--foreground))",
  },
});

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function usePrefersDark() {
  const [dark, setDark] = useState(darkQuery.matches);
  useEffect(() => {
    const update = () => setDark(darkQuery.matches);
    darkQuery.addEventListener("change", update);
    return () => darkQuery.removeEventListener("change", update);
  }, []);
  return dark;
}

export function CodeEditor({ value, onChange, language = "plain", label, wrap = true }: CodeEditorProps) {
  const dark = usePrefersDark();
  const extensions = useMemo(
    () => [
      frame,
      EditorView.contentAttributes.of({ "aria-label": label }),
      ...(wrap ? [EditorView.lineWrapping] : []),
      ...(language === "json" ? [json()] : []),
    ],
    [language, label, wrap],
  );
  return (
    <div className="h-full min-h-0 overflow-hidden" aria-label={label} role="group">
      <CodeMirror
        value={value}
        onChange={onChange}
        readOnly={!onChange}
        theme={dark ? "dark" : "light"}
        extensions={extensions}
        height="100%"
        style={{ height: "100%" }}
        basicSetup={{ foldGutter: false, highlightActiveLine: !!onChange }}
      />
    </div>
  );
}
