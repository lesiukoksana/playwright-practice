import Editor, { loader, type Monaco, type OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import apiTypes from '../engine/playwright-api.d.ts.txt?raw';

loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });

let configured = false;

export function setupMonaco(monaco: Monaco) {
  if (configured) return;
  configured = true;
  const ts = monaco.languages.typescript;
  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    strict: true,
    noEmit: true,
    lib: ['es2020', 'dom'],
  });
  ts.typescriptDefaults.addExtraLib(apiTypes, 'file:///node_modules/@types/playwright-lab/index.d.ts');
  monaco.editor.defineTheme('lab-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#12151d', 'editorGutter.background': '#12151d' },
  });
}

export interface EditorError {
  line: number;
  message: string;
}

export interface EditorHandle {
  revealLine(line: number): void;
  insertText(text: string): void;
  /**
   * Puts the cursor where recorded code should go (inside the last test, or a new test).
   * Returns the path of the last page.goto() before the cursor, if any.
   */
  prepareRecording(): string | null;
  /** Inserts a recorded line at the cursor, or replaces the previously recorded line. */
  insertRecordedLine(text: string, replaceLast: boolean): void;
}

interface Props {
  path: string;
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  errors: EditorError[];
  currentLine: number | null;
  handleRef?: React.MutableRefObject<EditorHandle | null>;
}

export function CodeEditor({ path, value, onChange, onRun, errors, currentLine, handleRef }: Props) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorations = useRef<string[]>([]);
  const lastRecorded = useRef<ReturnType<Parameters<OnMount>[0]['createDecorationsCollection']> | null>(null);
  const runRef = useRef(onRun);
  runRef.current = onRun;

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    if (handleRef) {
      handleRef.current = {
        revealLine(line) {
          editor.revealLineInCenter(line);
          editor.setPosition({ lineNumber: line, column: 1 });
          editor.focus();
        },
        insertText(text) {
          const sel = editor.getSelection();
          if (!sel) return;
          editor.executeEdits('picker', [{ range: sel, text, forceMoveMarkers: true }]);
          editor.focus();
        },
        prepareRecording() {
          const model = editor.getModel();
          if (!model) return null;
          const lastGoto = () => {
            const p = editor.getPosition();
            const before = p ? model.getValueInRange(new monaco.Range(1, 1, p.lineNumber, model.getLineMaxColumn(p.lineNumber))) : model.getValue();
            const matches = [...before.matchAll(/page\.goto\(\s*['"`]([^'"`]+)['"`]/g)];
            return matches.length ? matches[matches.length - 1][1] : null;
          };
          lastRecorded.current?.clear();
          const lines = model.getLinesContent();
          const firstTest = lines.findIndex((l) => /\btest(\.\w+)?\s*\(/.test(l));
          if (firstTest < 0) {
            // No test yet: add one and record into it.
            const end = model.getLineCount();
            const prefix = model.getValue().trim() ? '\n\n' : "import { test, expect } from '@playwright/test';\n\n";
            const range = new monaco.Range(end, model.getLineMaxColumn(end), end, model.getLineMaxColumn(end));
            editor.executeEdits('recorder', [{ range, text: `${prefix}test('recorded test', async ({ page }) => {\n  \n});\n` }]);
            const blank = model.getLineCount() - 2;
            editor.setPosition({ lineNumber: blank, column: 3 });
            return null;
          }
          const pos = editor.getPosition();
          if (pos && pos.lineNumber > firstTest + 1) return lastGoto(); // the learner chose a place
          // Default: the end of the last test's body.
          let close = -1;
          for (let i = lines.length - 1; i > firstTest; i--) {
            if (/^\s*\}\);?\s*$/.test(lines[i])) {
              close = i;
              break;
            }
          }
          if (close < 0) return null;
          const target = close; // 1-based number of the line before "});"
          editor.setPosition({ lineNumber: target, column: model.getLineMaxColumn(target) });
          return lastGoto();
        },
        insertRecordedLine(text, replaceLast) {
          const model = editor.getModel();
          if (!model) return;
          const last = lastRecorded.current?.getRange(0);
          if (replaceLast && last) {
            editor.executeEdits('recorder', [{ range: last, text }]);
            const line = last.startLineNumber;
            lastRecorded.current!.set([{ range: new monaco.Range(line, last.startColumn, line, last.startColumn + text.length), options: {} }]);
            return;
          }
          const pos = editor.getPosition() ?? { lineNumber: model.getLineCount(), column: 1 };
          const current = model.getLineContent(pos.lineNumber);
          let indent = /^\s*/.exec(current)![0];
          const blank = current.trim() === '';
          let ref = current;
          if (blank && !indent) {
            for (let i = pos.lineNumber - 1; i >= 1; i--) {
              const l = model.getLineContent(i);
              if (l.trim()) {
                ref = l;
                indent = /^\s*/.exec(l)![0];
                break;
              }
            }
          }
          if (ref.trim().endsWith('{')) indent += '  ';
          let lineNo: number;
          if (blank) {
            const range = new monaco.Range(pos.lineNumber, 1, pos.lineNumber, current.length + 1);
            editor.executeEdits('recorder', [{ range, text: `${indent}${text}\n${indent}` }]);
            lineNo = pos.lineNumber;
            editor.setPosition({ lineNumber: lineNo + 1, column: indent.length + 1 });
          } else {
            const end = current.length + 1;
            editor.executeEdits('recorder', [{ range: new monaco.Range(pos.lineNumber, end, pos.lineNumber, end), text: `\n${indent}${text}` }]);
            lineNo = pos.lineNumber + 1;
            editor.setPosition({ lineNumber: lineNo, column: model.getLineMaxColumn(lineNo) });
          }
          const range = new monaco.Range(lineNo, indent.length + 1, lineNo, indent.length + 1 + text.length);
          if (!lastRecorded.current) lastRecorded.current = editor.createDecorationsCollection();
          lastRecorded.current.set([{ range, options: { className: 'recorded-line' } }]);
          editor.revealLineInCenterIfOutsideViewport(lineNo);
        },
      };
    }
  };

  // Run errors as red squiggles.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    monaco.editor.setModelMarkers(
      model,
      'run',
      errors
        .filter((e) => e.line >= 1 && e.line <= model.getLineCount())
        .map((e) => ({
          severity: monaco.MarkerSeverity.Error,
          message: e.message,
          startLineNumber: e.line,
          endLineNumber: e.line,
          startColumn: model.getLineFirstNonWhitespaceColumn(e.line) || 1,
          endColumn: model.getLineMaxColumn(e.line),
        })),
    );
  }, [errors, path]);

  // Highlight the line that is currently running.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    decorations.current = editor.deltaDecorations(
      decorations.current,
      currentLine
        ? [{ range: new monaco.Range(currentLine, 1, currentLine, 1), options: { isWholeLine: true, className: 'running-line', glyphMarginClassName: 'running-glyph' } }]
        : [],
    );
    if (currentLine) editor.revealLineInCenterIfOutsideViewport(currentLine);
  }, [currentLine]);

  return (
    <Editor
      path={path}
      defaultLanguage="typescript"
      language="typescript"
      value={value}
      theme="lab-dark"
      beforeMount={setupMonaco}
      onMount={onMount}
      onChange={(v) => onChange(v ?? '')}
      loading={<div className="editor-loading">Loading editor…</div>}
      options={{
        fontSize: 13.5,
        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        tabSize: 2,
        automaticLayout: true,
        glyphMargin: true,
        lineNumbersMinChars: 3,
        padding: { top: 12 },
        renderLineHighlight: 'line',
        fixedOverflowWidgets: true,
        wordWrap: 'on',
        wrappingIndent: 'indent',
      }}
    />
  );
}
