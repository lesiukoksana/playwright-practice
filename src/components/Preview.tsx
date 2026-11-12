import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RecordSink, RecorderMode } from '../engine/recorder';
import { runtime } from '../engine/runtime';
import { Icon } from './Icon';
import { loadSetting, saveSetting } from '../progress';

const VIEWPORTS = [
  { label: 'Desktop (fit panel)', width: 1280, height: 0 },
  { label: 'Desktop 1280×800', width: 1280, height: 800 },
  { label: 'Laptop 1024×700', width: 1024, height: 700 },
  { label: 'Mobile 390×800', width: 390, height: 800 },
];

interface Props {
  onInsertLocator?: (text: string) => void;
  onReload: () => void;
  /** Where recorded code goes. Without it, the Record button is hidden. */
  recorder?: { prepare: () => string | null; sink: RecordSink };
}

export function Preview({ onInsertLocator, onReload, recorder }: Props) {
  useSyncExternalStore(runtime.subscribe, runtime.getVersion);
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ width: 600, height: 500 });
  const [mode, setMode] = useState<string>(() => loadSetting('viewport', '1280x0'));
  const [address, setAddress] = useState('');
  const [copied, setCopied] = useState(false);

  useLayoutEffect(() => {
    const host = hostRef.current!;
    runtime.attach(host);
    return () => runtime.detach(host);
  }, []);

  useEffect(() => {
    const el = stageRef.current!;
    const ro = new ResizeObserver(() => setStage({ width: el.clientWidth - 20, height: el.clientHeight - 48 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // "Fit panel": keep 1280 px width and use the panel's height, so no space is wasted.
  useEffect(() => {
    if (runtime.running) return;
    const preset = VIEWPORTS.find((v) => `${v.width}x${v.height}` === mode) ?? VIEWPORTS[0];
    let height = preset.height;
    if (!height) {
      const scale = Math.min(1, stage.width / preset.width);
      height = Math.max(560, Math.min(3000, Math.round(stage.height / scale)));
    }
    if (runtime.viewport.width !== preset.width || Math.abs(runtime.viewport.height - height) > 16) {
      runtime.setViewport({ width: preset.width, height });
    }
  }, [mode, stage, runtime.running]);

  const { width: vw, height: vh } = runtime.viewport;
  const scale = Math.min(1, stage.width / vw);
  const pages = runtime.pages();
  const active = runtime.activePage;
  const activeUrl = active?.url() ?? '';
  const relative = activeUrl.startsWith(runtime.baseURL) ? activeUrl.slice(runtime.baseURL.length) : activeUrl;

  useEffect(() => {
    setAddress(relative);
  }, [relative]);

  const hl = runtime.highlightState && active && runtime.highlightState.pageId === active._id ? runtime.highlightState : null;
  const pickerText = runtime.pickerActive ? runtime.pickerHover : runtime.pickerResult;

  const copy = async () => {
    if (!pickerText) return;
    try {
      await navigator.clipboard.writeText(pickerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="preview">
      <div className="preview-bar">
        <div className="tabs-row" role="tablist" aria-label="Browser tabs">
          {pages.length === 0 && <span className="tab-chip muted">No page</span>}
          {pages.map((p, i) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={active?._id === p.id}
              className={`tab-chip ${active?._id === p.id ? 'active' : ''}`}
              onClick={() => {
                const page = runtime.context?.pages().find((x) => x._id === p.id);
                if (page) runtime.activate(page);
              }}
              title={p.url}
            >
              {p.title || `Tab ${i + 1}`}
            </button>
          ))}
        </div>
        <form
          className="address"
          onSubmit={(e) => {
            e.preventDefault();
            runtime.navigateActive(address || 'index.html');
          }}
        >
          <span className="address-base" title={runtime.baseURL}>baseURL/</span>
          <input
            aria-label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={runtime.running}
            spellCheck={false}
          />
          <button type="button" className="icon-button" title="Reload practice app (resets its data)" onClick={onReload} disabled={runtime.running}>
            ⟳
          </button>
        </form>
        <div className="preview-actions">
          {recorder && (
            <button
              type="button"
              className={`small-button record-button ${runtime.recorder.active ? 'on' : ''}`}
              onClick={() => {
                if (runtime.recorder.active) runtime.recorder.stop();
                else {
                  runtime.setPicker(false);
                  const openedPath = recorder.prepare();
                  runtime.recorder.start(recorder.sink, openedPath);
                }
              }}
              disabled={runtime.running || !active}
              aria-pressed={runtime.recorder.active}
              title="Record: use the app and the test code is written for you"
            >
              <span className="rec-dot" aria-hidden="true" /> {runtime.recorder.active ? 'Stop recording' : 'Record'}
            </button>
          )}
          <button
            type="button"
            className={`small-button ${runtime.pickerActive ? 'on' : ''}`}
            onClick={() => runtime.setPicker(!runtime.pickerActive)}
            disabled={runtime.running || !active}
            aria-pressed={runtime.pickerActive}
            title="Hover over an element in the page to get a locator for it, then click to keep it"
          >
            <Icon name="target" /> Pick locator
          </button>
          <select
            aria-label="Viewport size"
            className="small-select"
            value={mode}
            disabled={runtime.running}
            onChange={(e) => {
              setMode(e.target.value);
              saveSetting('viewport', e.target.value);
            }}
          >
            {VIEWPORTS.map((v) => (
              <option key={v.label} value={`${v.width}x${v.height}`}>{v.label}</option>
            ))}
          </select>
          <a className="small-button" href={runtime.baseURL + 'index.html'} target="_blank" rel="noreferrer" title="Open the practice app in a new browser tab">
            ↗
          </a>
        </div>
      </div>

      {runtime.recorder.active && <RecorderBar />}

      {(runtime.pickerActive || runtime.pickerResult) && (
        <div className="picker-bar" aria-live="polite">
          {runtime.pickerActive && !pickerText && <span className="muted">Hover over an element in the page…</span>}
          {pickerText && <code>{pickerText}</code>}
          {pickerText && (
            <span className="picker-actions">
              <button type="button" className="small-button" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
              {onInsertLocator && !runtime.pickerActive && (
                <button type="button" className="small-button" onClick={() => onInsertLocator(pickerText)}>Insert into code</button>
              )}
              {!runtime.pickerActive && (
                <button type="button" className="icon-button" aria-label="Close" onClick={() => { runtime.pickerResult = null; runtime.emit(); }}>×</button>
              )}
            </span>
          )}
        </div>
      )}

      <div className="preview-stage" ref={stageRef}>
        <div className="viewport-frame" style={{ width: vw * scale, height: vh * scale }}>
          <div className="viewport" style={{ width: vw, height: vh, transform: `scale(${scale})` }}>
            <div className="frame-host" ref={hostRef} />
            {hl && (
              <div className="hl-box" style={{ left: hl.x, top: hl.y, width: hl.w, height: hl.h }}>
                <span className="hl-label">{hl.label}</span>
              </div>
            )}
          </div>
        </div>
        <p className="preview-note">
          {runtime.running ? 'Test running…' : 'Click around the app yourself. Tests start with fresh data.'}
          {scale < 1 && ` Shown at ${Math.round(scale * 100)}%.`}
        </p>
      </div>
    </div>
  );
}

const ASSERT_MODES: { mode: RecorderMode; label: string; title: string }[] = [
  { mode: 'assertVisible', label: 'Assert visible', title: 'Click an element to add expect(...).toBeVisible()' },
  { mode: 'assertText', label: 'Assert text', title: 'Click an element to add expect(...).toHaveText(...)' },
  { mode: 'assertValue', label: 'Assert value', title: 'Click a form field to add expect(...).toHaveValue(...)' },
];

function RecorderBar() {
  const rec = runtime.recorder;
  const asserting = rec.mode !== 'actions';
  return (
    <div className="recorder-bar" role="region" aria-label="Recorder">
      <span className="rec-status">
        <span className="rec-dot live" aria-hidden="true" />
        {asserting ? 'Click an element to add the assertion' : 'Recording: use the app, and code appears in the editor at the cursor'}
        <span className="muted"> · {rec.count} {rec.count === 1 ? 'line' : 'lines'}</span>
      </span>
      <span className="rec-actions">
        {ASSERT_MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            className={`small-button ${rec.mode === m.mode ? 'on' : ''}`}
            aria-pressed={rec.mode === m.mode}
            title={m.title}
            onClick={() => rec.setMode(rec.mode === m.mode ? 'actions' : m.mode)}
          >
            {m.label}
          </button>
        ))}
        <button type="button" className="small-button" onClick={() => rec.stop()}><Icon name="stop" size={12} /> Stop</button>
      </span>
    </div>
  );
}
