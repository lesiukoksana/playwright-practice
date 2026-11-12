import { useState, useSyncExternalStore } from 'react';
import { runtime, type StepResult, type TestResult } from '../engine/runtime';

interface Props {
  onGoToLine: (line: number) => void;
}

const ICON: Record<string, string> = {
  passed: '✓', failed: '✗', timedOut: '✗', skipped: '–', interrupted: '■', running: '•',
};

function ms(n: number) {
  return n < 1000 ? `${Math.round(n)}ms` : `${(n / 1000).toFixed(1)}s`;
}

export function OutputPanel({ onGoToLine }: Props) {
  useSyncExternalStore(runtime.subscribe, runtime.getVersion);
  const [tab, setTab] = useState<'results' | 'console'>('results');
  const result = runtime.result;
  const consoleCount = runtime.console.length;

  return (
    <div className="output">
      <div className="output-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'results'} className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>
          Results
        </button>
        <button role="tab" aria-selected={tab === 'console'} className={tab === 'console' ? 'active' : ''} onClick={() => setTab('console')}>
          Console{consoleCount ? ` (${consoleCount})` : ''}
        </button>
        {result && <Summary />}
      </div>
      <div className="output-body">
        {tab === 'console' ? <ConsoleView /> : !result ? (
          <p className="muted output-empty">Press <strong>Run</strong> (<kbd>Ctrl</kbd>+<kbd>Enter</kbd>) to run your test. Results appear here.</p>
        ) : (
          <>
            {result.label && <p className="run-label">{result.label}</p>}
            {result.compileError && (
              <ErrorBox message={result.compileError.message} line={result.compileError.line} code={result.code} onGoToLine={onGoToLine} />
            )}
            {result.tests.map((t) => (
              <TestView key={t.id} test={t} code={result.code} onGoToLine={onGoToLine} single={result.tests.length === 1} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Summary() {
  const r = runtime.result!;
  const passed = r.tests.filter((t) => t.status === 'passed').length;
  const failed = r.tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length;
  const skipped = r.tests.filter((t) => t.status === 'skipped').length;
  if (r.status === 'running') return <span className="summary running"><span className="spinner" /> Running…</span>;
  if (r.compileError) return <span className="summary failed">Error</span>;
  return (
    <span className={`summary ${failed ? 'failed' : 'passed'}`}>
      {passed > 0 && <span className="passed">{passed} passed</span>}
      {failed > 0 && <span className="failed">{failed} failed</span>}
      {skipped > 0 && <span className="muted">{skipped} skipped</span>}
      {r.status === 'interrupted' && <span className="muted">stopped</span>}
      <span className="muted">{ms(r.duration)}</span>
    </span>
  );
}

function TestView({ test, code, onGoToLine, single }: { test: TestResult; code: string; onGoToLine: (l: number) => void; single: boolean }) {
  const failed = test.status === 'failed' || test.status === 'timedOut';
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? (single || failed || test.status === 'running');
  return (
    <div className={`test test-${test.status}`}>
      <button className="test-head" onClick={() => setOpen(!isOpen)} aria-expanded={isOpen}>
        <span className={`status-icon ${test.status}`}>{test.status === 'running' ? <span className="spinner" /> : ICON[test.status]}</span>
        <span className="test-title">{test.titlePath.join(' › ')}</span>
        <span className="muted">{test.status === 'running' ? '' : ms(test.duration)}</span>
      </button>
      {isOpen && (
        <div className="test-body">
          {test.steps.length > 0 && (
            <ol className="steps">
              {test.steps.map((s, i) => <StepView key={i} step={s} onGoToLine={onGoToLine} />)}
            </ol>
          )}
          {test.errors.map((e, i) => (
            <ErrorBox key={i} message={e.message} line={e.line} code={code} onGoToLine={onGoToLine} />
          ))}
          {test.status === 'skipped' && <p className="muted">Skipped.</p>}
        </div>
      )}
    </div>
  );
}

function StepView({ step, onGoToLine }: { step: StepResult; onGoToLine: (l: number) => void }) {
  if (step.category === 'note') return <li className="step note">ℹ {step.title}</li>;
  return (
    <li className={`step ${step.status} cat-${step.category}`}>
      <div className="step-row">
        <span className={`status-icon ${step.status}`}>{step.status === 'running' ? <span className="spinner" /> : ICON[step.status]}</span>
        <span className="step-title">{step.title}</span>
        {step.line && (
          <button className="line-link" onClick={() => onGoToLine(step.line!)} title="Show in editor">
            line {step.line}
          </button>
        )}
        <span className="muted step-time">{step.status === 'running' ? '' : ms(step.duration)}</span>
      </div>
      {step.children.length > 0 && (
        <ol className="steps nested">
          {step.children.map((c, i) => <StepView key={i} step={c} onGoToLine={onGoToLine} />)}
        </ol>
      )}
    </li>
  );
}

function ErrorBox({ message, line, code, onGoToLine }: { message: string; line?: number; code: string; onGoToLine: (l: number) => void }) {
  const lines = code.split('\n');
  const frame = line && line <= lines.length
    ? lines.slice(Math.max(0, line - 3), Math.min(lines.length, line + 2)).map((text, i) => {
      const n = Math.max(0, line - 3) + i + 1;
      return { n, text, current: n === line };
    })
    : [];
  return (
    <div className="error-box" role="alert">
      <pre className="error-message">{message}</pre>
      {frame.length > 0 && (
        <button className="code-frame" onClick={() => onGoToLine(line!)} title="Show in editor">
          {frame.map((f) => (
            <span key={f.n} className={f.current ? 'current' : ''}>
              <span className="ln">{f.current ? '>' : ' '} {String(f.n).padStart(3)} |</span> {f.text}
              {'\n'}
            </span>
          ))}
        </button>
      )}
    </div>
  );
}

function ConsoleView() {
  if (!runtime.console.length) {
    return <p className="muted output-empty">Messages from <code>console.log()</code> in your test and from the page appear here.</p>;
  }
  return (
    <ul className="console">
      {runtime.console.map((c) => (
        <li key={c.id} className={`console-line level-${c.level}`}>
          <span className={`console-src ${c.source}`}>{c.source === 'test' ? 'test' : 'page'}</span>
          <span className="console-text">{c.text}</span>
        </li>
      ))}
    </ul>
  );
}
