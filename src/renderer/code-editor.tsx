import { useEffect, useRef } from "react";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting, type LanguageSupport } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers, rectangularSelection } from "@codemirror/view";
import type { AppearanceTheme } from "./types";

type CodeEditorProps = {
  appearanceTheme: AppearanceTheme;
  initialContent: string;
  relativePath: string;
  readOnly?: boolean;
  onChange: (content: string) => void;
  onSave?: () => void;
};

export function CodeEditor({ appearanceTheme, initialContent, relativePath, readOnly = false, onChange, onSave }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const language = languageExtensionForPath(relativePath);
    const theme = appearanceTheme === "night" ? darkTheme : lightTheme;
    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        EditorState.readOnly.of(readOnly),
        EditorView.lineWrapping,
        EditorView.theme(theme.styles, { dark: theme.dark }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => { onSaveRef.current?.(); return true; },
          },
        ]),
        ...(language ? [language] : []),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [appearanceTheme, relativePath, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== initialContent) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: initialContent } });
    }
  }, [initialContent]);

  return <div className="code-editor" ref={containerRef} />;
}

function languageExtensionForPath(relativePath: string): LanguageSupport | null {
  const lower = relativePath.toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : base;

  if (/\.(tsx|jsx)$/.test(lower)) return javascript({ jsx: true, typescript: lower.endsWith(".tsx") });
  if (/\.(ts|mts|cts)$/.test(lower)) return javascript({ typescript: true });
  if (/\.(js|mjs|cjs)$/.test(lower)) return javascript();
  if (ext === ".json" || base === ".prettierrc" || base === ".eslintrc") return json();
  if (/\.(html?|svg)$/.test(lower)) return html();
  if (/\.(css|scss|sass|less)$/.test(lower)) return css();
  if (/\.(py|pyi)$/.test(lower)) return python();
  if (/\.(md|mdx|markdown)$/.test(lower)) return markdown();
  if (/\.(ya?ml)$/.test(lower)) return yaml();
  if (ext === ".rs") return rust();
  if (ext === ".go") return go();
  if (/\.(xml|xsd|xsl)$/.test(lower)) return xml();
  if (ext === ".sql") return sql();
  return null;
}

type ThemeSpec = {
  dark: boolean;
  styles: Parameters<typeof EditorView.theme>[0];
};

const lightTheme: ThemeSpec = {
  dark: false,
  styles: {
    "&": {
      color: "#1f2933",
      backgroundColor: "transparent",
      height: "100%",
      fontSize: "13px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    ".cm-content": { caretColor: "#0f172a" },
    ".cm-cursor": { borderLeftColor: "#0f172a" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#94a3b8", border: "0" },
    ".cm-activeLine": { backgroundColor: "rgba(15, 23, 42, 0.04)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(15, 23, 42, 0.04)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(59, 130, 246, 0.25)",
    },
  },
};

const darkTheme: ThemeSpec = {
  dark: true,
  styles: {
    "&": {
      color: "#e2e8f0",
      backgroundColor: "transparent",
      height: "100%",
      fontSize: "13px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    ".cm-content": { caretColor: "#f8fafc" },
    ".cm-cursor": { borderLeftColor: "#f8fafc" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#475569", border: "0" },
    ".cm-activeLine": { backgroundColor: "rgba(248, 250, 252, 0.05)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(248, 250, 252, 0.05)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(59, 130, 246, 0.35)",
    },
  },
};

export const editorIgnoredExtension: Extension = [];
