import { usePrefersDark } from "../hooks/usePrefersDark";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo, type MutableRefObject } from "react";
import type { EngineMeta, SchemaInfo } from "../types";

interface QueryEditorProps {
  engine: EngineMeta | undefined;
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  viewRef: MutableRefObject<EditorView | null>;
  selectionRef: MutableRefObject<string>;
  schema?: SchemaInfo;
}

const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "hsl(var(--background))", color: "hsl(var(--foreground))", fontSize: "12.5px" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.65" },
  ".cm-content": { padding: "8px 0", caretColor: "hsl(var(--primary))" },
  ".cm-line": { padding: "0 10px" },
  ".cm-gutters": { backgroundColor: "hsl(var(--sidebar))", color: "hsl(var(--muted-foreground))", border: "none", paddingLeft: "4px" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 6px 0 8px", minWidth: "30px" },
  ".cm-activeLine": { backgroundColor: "hsl(var(--primary) / 0.045)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "hsl(var(--foreground))" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--primary))", borderLeftWidth: "2px" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "hsl(var(--primary) / 0.16)",
  },
  ".cm-placeholder": { color: "hsl(var(--muted-foreground))", fontStyle: "normal" },
  ".cm-tooltip": { border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--popover))", boxShadow: "0 8px 24px hsl(215 25% 10% / 0.12)" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "hsl(var(--accent))", color: "hsl(var(--foreground))" },
  ".cm-panels": { backgroundColor: "hsl(var(--sidebar))", color: "hsl(var(--foreground))" },
});

export function QueryEditor({ engine, value, onChange, onRun, viewRef, selectionRef, schema }: QueryEditorProps) {
  const dark = usePrefersDark();
  const sqlSchema = useMemo(() => Object.fromEntries((schema?.objects ?? []).map((object) => [object.name, object.columns.map((column) => column.name)])), [schema]);
  const extensions = useMemo(
    () => [
      editorTheme,
      Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => (onRun(), true) }])),
      ...(engine?.isSql ? [sql({ schema: sqlSchema })] : engine?.inputStyle === "json" ? [json()] : []),
    ],
    [engine?.isSql, engine?.inputStyle, onRun, sqlSchema],
  );

  return (
    <div className="h-full" aria-label="Query editor">
      <CodeMirror
        value={value}
        height="100%"
        theme={dark ? "dark" : "light"}
        extensions={extensions}
        placeholder={engine?.consoleHint ?? "Enter a query"}
        basicSetup={{ foldGutter: false, highlightActiveLine: true, autocompletion: engine?.isSql ?? false, highlightSelectionMatches: true }}
        onChange={onChange}
        onCreateEditor={(view) => {
          viewRef.current = view;
        }}
        onUpdate={(update) => {
          const { from, to } = update.state.selection.main;
          selectionRef.current = update.state.sliceDoc(from, to);
        }}
      />
    </div>
  );
}
