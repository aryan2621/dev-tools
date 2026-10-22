import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import {
  autocompletion,
  type CompletionContext,
  snippetCompletion,
} from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorView, keymap } from "@codemirror/view";

function relayEditorTheme() {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--code-bg)",
        color: "var(--text)",
        fontSize: "12.5px",
        fontFamily: "var(--mono)",
        borderRadius: "8px",
      },
      ".cm-scroller": {
        lineHeight: "1.55",
        fontFamily: "inherit",
      },
      ".cm-gutters": {
        backgroundColor: "var(--surface-2)",
        color: "var(--muted)",
        border: "none",
        borderTopLeftRadius: "8px",
        borderBottomLeftRadius: "8px",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "var(--surface-2)",
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in srgb, var(--accent-soft) 45%, transparent)",
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: "var(--accent)",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
        {
          backgroundColor: "var(--accent-soft) !important",
        },
      ".cm-tooltip-autocomplete": {
        backgroundColor: "var(--surface)",
        border: "1px solid var(--border-strong)",
        fontFamily: "var(--mono)",
        fontSize: "12px",
      },
      ".cm-completionLabel": {
        fontFamily: "var(--mono)",
      },
    },
    { dark: false },
  );
}

function sandboxCompletions(toolNames: string[]) {
  return (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const callToolMatch = before.match(/callTool\s*\(\s*["']?([\w-]*)$/);
    if (callToolMatch) {
      const partial = callToolMatch[1];
      const from = context.pos - partial.length;
      return {
        from,
        options: toolNames
          .filter((n) => n.startsWith(partial))
          .map((label) => ({
            label,
            type: "function" as const,
            apply: `"${label}", `,
          })),
      };
    }

    const word = context.matchBefore(/[\w$]+/);
    if (!word && !context.explicit) return null;
    const from = word ? word.from : context.pos;
    const prefix = (word?.text ?? "").toLowerCase();

    const options = [
      snippetCompletion("callTool(${1:toolName}, ${2:{}})", {
        label: "callTool",
        type: "function",
        detail: "(name, args)",
        info: "Invoke the bound MCP tool from sandbox code.",
      }),
      snippetCompletion("return ${1:value};", {
        label: "return",
        type: "keyword",
      }),
      { label: "const", type: "keyword" as const },
      { label: "let", type: "keyword" as const },
      { label: "await", type: "keyword" as const },
      { label: "JSON.stringify", type: "function" as const },
      { label: "JSON.parse", type: "function" as const },
      ...toolNames.map((label) => ({
        label,
        type: "variable" as const,
        detail: "MCP tool",
      })),
    ].filter((o) => !prefix || o.label.toLowerCase().startsWith(prefix));

    return options.length ? { from, options } : null;
  };
}

export function JavaScriptEditor({
  value,
  onChange,
  toolNames = [],
  minHeight = 280,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  toolNames?: string[];
  minHeight?: number;
  readOnly?: boolean;
}) {
  const extensions = useMemo(
    () => [
      javascript(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      relayEditorTheme(),
      autocompletion({
        override: [sandboxCompletions(toolNames)],
        activateOnTyping: true,
        defaultKeymap: true,
      }),
      keymap.of([indentWithTab]),
      EditorView.lineWrapping,
    ],
    [toolNames],
  );

  return (
    <div className="javascript-editor" style={{ minHeight }}>
      <CodeMirror
        value={value}
        height={`${minHeight}px`}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          indentOnInput: true,
          tabSize: 2,
          autocompletion: false,
          bracketMatching: true,
          closeBrackets: true,
        }}
        extensions={extensions}
        onChange={onChange}
      />
    </div>
  );
}
