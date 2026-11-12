import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { runtime, type LabSetup, type RunResult } from '../engine/runtime';
import { CHAPTERS, LESSONS, SANDBOX_EXAMPLES } from '../lessons/lessons';
import { LESSON_DOCS } from '../lessons/docs';
import type { Lesson } from '../lessons/types';
import { loadCode, loadSetting, markCompleted, saveCode, saveSetting, useProgress } from '../progress';
import { CodeEditor, type EditorError, type EditorHandle } from './CodeEditor';
import { Markdown } from './Markdown';
import { OutputPanel } from './OutputPanel';
import { Preview } from './Preview';
import { Splitter } from './Splitter';

interface CheckState {
  testsPassed: boolean;
  checks: { label: string; ok: boolean }[];
  mutation: boolean | null;
  complete: boolean;
}

const SLOW_MO = [
  { label: 'Normal speed', value: 0 },
  { label: 'Slow motion', value: 400 },
  { label: 'Very slow', value: 1000 },
];

interface Layout {
  lesson: number;
  preview: number;
  output: number;
}

const defaultLayout = (): Layout => ({
  lesson: 330,
  preview: Math.round(Math.max(320, window.innerWidth * 0.34)),
  output: Math.round(Math.max(160, window.innerHeight * 0.36)),
});

const clampLayout = (l: Layout): Layout => {
  const w = window.innerWidth;
  const lesson = Math.min(Math.max(l.lesson, 240), 640);
  return {
    lesson,
    preview: Math.min(Math.max(l.preview, 260), Math.max(260, w - lesson - 380)),
    output: Math.min(Math.max(l.output, 70), Math.max(70, window.innerHeight - 260)),
  };
};

const BUGS = ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'B12'];

function testsPassed(r: RunResult) {
  return !r.compileError && r.status === 'passed' && r.tests.some((t) => t.status === 'passed');
}

export function Workspace({ lesson }: { lesson: Lesson | null }) {
  useSyncExternalStore(runtime.subscribe, runtime.getVersion);
  const id = lesson?.id ?? 'sandbox';
  const initial = lesson?.starter ?? SANDBOX_EXAMPLES[0].code;
  const [code, setCode] = useState(() => loadCode(id, initial));
  const [sandboxSetup, setSandboxSetup] = useState<LabSetup>(() => loadSetting('sandboxSetup', { dismissOverlays: true, loggedInAs: null, bugs: null }));
  const [checkState, setCheckState] = useState<CheckState | null>(null);
  const [slowMo, setSlowMo] = useState<number>(() => loadSetting('slowMo', 0));
  const [lessonOpen, setLessonOpen] = useState(true);
  const [layout, setLayout] = useState<Layout>(() => clampLayout({ ...defaultLayout(), ...loadSetting<Partial<Layout>>('layout', {}) }));
  const editor = useRef<EditorHandle | null>(null);
  const resize = (key: keyof Layout, delta: number) => setLayout((l) => clampLayout({ ...l, [key]: l[key] + delta }));
  const saveLayout = () => setLayout((l) => {
    saveSetting('layout', l);
    return l;
  });
  const resetLayout = (key: keyof Layout) => setLayout((l) => {
    const next = clampLayout({ ...l, [key]: defaultLayout()[key] });
    saveSetting('layout', next);
    return next;
  });

  useEffect(() => {
    const onResize = () => setLayout((l) => clampLayout(l));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const setup: LabSetup = useMemo(
    () => (lesson ? { dismissOverlays: true, ...lesson.setup } : sandboxSetup),
    [lesson, sandboxSetup],
  );

  useEffect(() => {
    runtime.slowMo = slowMo;
    saveSetting('slowMo', slowMo);
  }, [slowMo]);

  // Show the app in the preview when a lesson opens.
  useEffect(() => {
    runtime.stop();
    runtime.result = null;
    runtime.console = [];
    runtime.pickerResult = null;
    runtime.explore(setup, lesson?.startPath ?? 'index.html');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => saveCode(id, code), 300);
    return () => clearTimeout(t);
  }, [id, code]);

  const run = useCallback(async () => {
    if (runtime.running) return;
    saveCode(id, code);
    setCheckState(null);
    const r = await runtime.run(code, setup);
    if (!lesson) return;
    const passed = testsPassed(r);
    const checks = (lesson.checks ?? []).map((c) => {
      let ok = false;
      try {
        ok = c.test({ code, run: r });
      } catch {
        ok = false;
      }
      return { label: c.label, ok };
    });
    let mutation: boolean | null = null;
    if (lesson.mutation && passed && checks.every((c) => c.ok)) {
      const r2 = await runtime.run(code, { ...setup, bugs: lesson.mutation.bugs }, `Second run: the same test against the shop with a bug switched on (${lesson.mutation.description}). This run should FAIL.`);
      mutation = r2.status === 'interrupted' ? null : r2.tests.some((t) => t.status === 'failed' || t.status === 'timedOut');
    }
    const complete = passed && checks.every((c) => c.ok) && (!lesson.mutation || mutation === true);
    setCheckState({ testsPassed: passed, checks, mutation, complete });
    if (complete) markCompleted(lesson.id);
  }, [code, id, lesson, setup]);

  const errors: EditorError[] = useMemo(() => {
    const r = runtime.result;
    if (!r || r.label || r.status === 'running') return [];
    const out: EditorError[] = [];
    if (r.compileError?.line) out.push({ line: r.compileError.line, message: r.compileError.message });
    for (const t of r.tests) for (const e of t.errors) if (e.line) out.push({ line: e.line, message: e.message });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.result, runtime.result?.status]);

  const recorder = useMemo(() => ({
    prepare: () => editor.current?.prepareRecording() ?? null,
    sink: (line: string, replaceLast: boolean) => editor.current?.insertRecordedLine(line, replaceLast),
  }), []);

  // Stop recording when leaving the lesson.
  useEffect(() => () => runtime.recorder.stop(), []);

  const resetCode = () => {
    if (window.confirm('Replace your code with the starter code? Your changes will be lost.')) setCode(initial);
  };

  return (
    <div
      className={`workspace ${lessonOpen ? '' : 'lesson-collapsed'}`}
      style={{ ['--lesson-w' as string]: `${lessonOpen ? layout.lesson : 36}px`, ['--preview-w' as string]: `${layout.preview}px` }}
    >
      <aside className="pane lesson-pane" aria-label={lesson ? 'Lesson' : 'Sandbox settings'}>
        {lessonOpen ? (
          lesson ? (
            <LessonPanel lesson={lesson} checkState={checkState} onShowSolution={() => setCode(lesson.solution)} onCollapse={() => setLessonOpen(false)} />
          ) : (
            <SandboxPanel
              setup={sandboxSetup}
              onChange={(s) => {
                setSandboxSetup(s);
                saveSetting('sandboxSetup', s);
                runtime.explore(s, 'index.html');
              }}
              onLoadExample={(c) => {
                if (code === c || window.confirm('Replace the code in the editor with this example?')) setCode(c);
              }}
              onCollapse={() => setLessonOpen(false)}
            />
          )
        ) : (
          <button className="expand-lesson" onClick={() => setLessonOpen(true)} title="Show the lesson">
            <span aria-hidden="true">›</span>
            <span className="vertical">{lesson ? 'Lesson' : 'Settings'}</span>
          </button>
        )}
      </aside>
      <Splitter
        orientation="vertical"
        label="Resize lesson panel"
        disabled={!lessonOpen}
        onDrag={(d) => resize('lesson', d)}
        onEnd={saveLayout}
        onReset={() => resetLayout('lesson')}
      />

      <section className="pane editor-pane" aria-label="Code editor">
        <div className="toolbar">
          {runtime.running ? (
            <button className="run-button stop" onClick={() => runtime.stop()}>■ Stop</button>
          ) : (
            <button className="run-button" onClick={run} title="Run (Ctrl+Enter)">▶ Run</button>
          )}
          <select className="small-select" aria-label="Speed" value={slowMo} onChange={(e) => setSlowMo(Number(e.target.value))}>
            {SLOW_MO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <span className="toolbar-spacer" />
          <span className="file-name">example.spec.ts</span>
          <button className="small-button" onClick={resetCode} disabled={runtime.running} title="Restore the starter code">Reset code</button>
        </div>
        <div className="editor-wrap">
          <CodeEditor
            path={`file:///${id}.spec.ts`}
            value={code}
            onChange={setCode}
            onRun={run}
            errors={errors}
            currentLine={runtime.running ? runtime.currentLine : null}
            handleRef={editor}
          />
        </div>
        <Splitter
          orientation="horizontal"
          label="Resize results panel"
          onDrag={(d) => resize('output', -d)}
          onEnd={saveLayout}
          onReset={() => resetLayout('output')}
        />
        <div className="output-wrap" style={{ height: layout.output }}>
          <OutputPanel code={code} onGoToLine={(l) => editor.current?.revealLine(l)} />
        </div>
      </section>
      <Splitter
        orientation="vertical"
        label="Resize browser panel"
        onDrag={(d) => resize('preview', -d)}
        onEnd={saveLayout}
        onReset={() => resetLayout('preview')}
      />

      <section className="pane preview-pane" aria-label="Browser">
        <Preview
          recorder={recorder}
          onInsertLocator={(t) => editor.current?.insertText(t)}
          onReload={() => runtime.explore(setup, lesson?.startPath ?? 'index.html')}
        />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- lesson panel

function LessonPanel({ lesson, checkState, onShowSolution, onCollapse }: { lesson: Lesson; checkState: CheckState | null; onShowSolution: () => void; onCollapse: () => void }) {
  const progress = useProgress();
  const [hints, setHints] = useState(0);
  const [confirmSolution, setConfirmSolution] = useState(false);
  const index = LESSONS.findIndex((l) => l.id === lesson.id);
  const prev = LESSONS[index - 1];
  const next = LESSONS[index + 1];
  const done = progress.completed.includes(lesson.id);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHints(0);
    setConfirmSolution(false);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [lesson.id]);

  const requirements = [
    { label: lesson.mutation ? 'Your test passes on the correct shop' : 'All tests pass', ok: checkState ? checkState.testsPassed : null },
    ...(lesson.checks ?? []).map((c, i) => ({ label: c.label, ok: checkState ? checkState.checks[i]?.ok ?? null : null })),
    ...(lesson.mutation ? [{ label: 'Your test fails when the bug is switched on', ok: checkState ? checkState.mutation : null }] : []),
  ];

  return (
    <div className="lesson" ref={scrollRef}>
      <div className="lesson-top">
        <span className="lesson-meta">
          {lesson.chapter} · Lesson {index + 1} of {LESSONS.length}
        </span>
        <button className="icon-button" onClick={onCollapse} title="Hide the lesson panel" aria-label="Hide the lesson panel">‹</button>
      </div>
      <h1>
        {lesson.title} {done && <span className="done-badge" title="Completed">✓</span>}
      </h1>
      <Markdown source={lesson.intro} />

      <section className="task-card" aria-labelledby="task-heading">
        <h2 id="task-heading">Your task</h2>
        <Markdown source={lesson.task} />
        <ul className="requirements" aria-label="Requirements">
          {requirements.map((r) => (
            <li key={r.label} className={r.ok === null ? 'pending' : r.ok ? 'ok' : 'fail'}>
              <span aria-hidden="true">{r.ok === null ? '○' : r.ok ? '✓' : '✗'}</span> {r.label}
            </li>
          ))}
        </ul>
        {checkState?.complete && (
          <div className="success-card" role="status">
            <strong>🎉 Lesson complete!</strong>
            {next ? (
              <a className="next-button" href={`#/lesson/${next.id}`}>
                <span>Next lesson: {next.title}</span>
                <span aria-hidden="true">→</span>
              </a>
            ) : (
              <>
                <span>You finished the whole course. Well done!</span>
                <a className="next-button" href="#/">
                  <span>Back to the course overview</span>
                  <span aria-hidden="true">→</span>
                </a>
              </>
            )}
          </div>
        )}
        {checkState && !checkState.complete && checkState.testsPassed && lesson.mutation && checkState.mutation === false && (
          <p className="nudge">Your test passed on the buggy shop too, so it doesn't catch the bug yet. Which input would behave differently?</p>
        )}
        {checkState && !checkState.complete && checkState.testsPassed && checkState.checks.some((c) => !c.ok) && (
          <p className="nudge">The test passes, but it doesn't meet every requirement yet. Check the list above.</p>
        )}
      </section>

      <section className="help" aria-label="Help">
        {lesson.hints.slice(0, hints).map((h, i) => (
          <div className="hint" key={i}>
            <strong>Hint {i + 1}</strong>
            <Markdown source={h} />
          </div>
        ))}
        <div className="help-buttons">
          {hints < lesson.hints.length && (
            <button className="small-button" onClick={() => setHints(hints + 1)}>
              💡 Show a hint ({hints + 1} of {lesson.hints.length})
            </button>
          )}
          {!confirmSolution ? (
            <button className="small-button" onClick={() => setConfirmSolution(true)}>Show solution</button>
          ) : (
            <span className="confirm-inline">
              Replace your code with the solution?
              <button className="small-button" onClick={() => { onShowSolution(); setConfirmSolution(false); }}>Yes</button>
              <button className="small-button" onClick={() => setConfirmSolution(false)}>Cancel</button>
            </span>
          )}
        </div>
      </section>

      {LESSON_DOCS[lesson.id]?.length > 0 && (
        <section className="learn-more" aria-labelledby="learn-more-heading">
          <h2 id="learn-more-heading">📖 Learn more</h2>
          <ul>
            {LESSON_DOCS[lesson.id].map((d) => (
              <li key={d.url}>
                <a href={d.url} target="_blank" rel="noreferrer">
                  {d.title}
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
                <span className="doc-source">{d.url.includes('playwright.dev') ? 'playwright.dev' : 'MDN'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="lesson-nav" aria-label="Lessons">
        {prev ? (
          <a className="nav-card prev" href={`#/lesson/${prev.id}`}>
            <span className="nav-label">← Previous</span>
            <span className="nav-title">{prev.title}</span>
          </a>
        ) : <span />}
        {next ? (
          <a className="nav-card next" href={`#/lesson/${next.id}`}>
            <span className="nav-label">Next →</span>
            <span className="nav-title">{next.title}</span>
          </a>
        ) : <span />}
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------- sandbox panel

function SandboxPanel({ setup, onChange, onLoadExample, onCollapse }: { setup: LabSetup; onChange: (s: LabSetup) => void; onLoadExample: (code: string) => void; onCollapse: () => void }) {
  const bugs = setup.bugs === 'all' ? BUGS : setup.bugs ?? [];
  const toggleBug = (b: string) => {
    const next = bugs.includes(b) ? bugs.filter((x) => x !== b) : [...bugs, b];
    onChange({ ...setup, bugs: next.length ? next : null });
  };
  return (
    <div className="lesson">
      <div className="lesson-top">
        <span className="lesson-meta">Free practice</span>
        <button className="icon-button" onClick={onCollapse} title="Hide this panel" aria-label="Hide this panel">‹</button>
      </div>
      <h1>Sandbox</h1>
      <p>Write any test you like against PracticeShop. Your code is saved in this browser.</p>

      <section className="task-card">
        <h2>Examples</h2>
        <div className="example-list">
          {SANDBOX_EXAMPLES.map((e) => (
            <button key={e.name} className="small-button" onClick={() => onLoadExample(e.code)}>{e.name}</button>
          ))}
        </div>
      </section>

      <section className="task-card">
        <h2>Before each test</h2>
        <label className="check-row">
          <input type="checkbox" checked={!!setup.dismissOverlays} onChange={(e) => onChange({ ...setup, dismissOverlays: e.target.checked })} />
          Hide the cookie banner and newsletter pop-up
        </label>
        <label className="field-row">
          Start logged in as
          <select className="small-select" value={setup.loggedInAs ?? ''} onChange={(e) => onChange({ ...setup, loggedInAs: e.target.value || null })}>
            <option value="">Nobody (logged out)</option>
            <option value="standard@shop.test">standard@shop.test</option>
            <option value="admin@shop.test">admin@shop.test</option>
          </select>
        </label>
      </section>

      <section className="task-card">
        <h2>Bug mode</h2>
        <p className="muted small">Switch on known bugs, then see whether your tests catch them. The bug list is in <a href={`${runtime.baseURL}BUGS.md`} target="_blank" rel="noreferrer">BUGS.md</a> (spoilers!).</p>
        <div className="bug-grid">
          {BUGS.map((b) => (
            <label key={b} className="check-row">
              <input type="checkbox" checked={bugs.includes(b)} onChange={() => toggleBug(b)} /> {b}
            </label>
          ))}
        </div>
        <div className="help-buttons">
          <button className="small-button" onClick={() => onChange({ ...setup, bugs: 'all' })}>All on</button>
          <button className="small-button" onClick={() => onChange({ ...setup, bugs: null })}>All off</button>
        </div>
      </section>

      <section className="task-card">
        <h2>Test accounts</h2>
        <ul className="small plain">
          <li><code>standard@shop.test</code> / <code>Password123!</code></li>
          <li><code>admin@shop.test</code> / <code>Admin123!</code></li>
          <li><code>locked@shop.test</code> / <code>Password123!</code> (locked)</li>
          <li><code>slow@shop.test</code> / <code>Password123!</code> (7 s login)</li>
        </ul>
        <p className="small"><a href="#/reference">API reference and app guide →</a></p>
      </section>
      <p className="muted small">{CHAPTERS.length} chapters of guided lessons are on the <a href="#/">home page</a>.</p>
    </div>
  );
}
