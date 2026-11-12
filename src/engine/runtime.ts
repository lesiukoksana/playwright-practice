import { transform } from 'sucrase';
import { clearShopStorage, isolateStorage, shopLocalStorage } from './storage';
import { ContextImpl, PageImpl, RequestContextImpl } from './api';
import { normalizeWhiteSpace } from './dom';
import { captureUserLine, ClosedError, CompileError, LabError, lineFromError, SkipError } from './errors';
import { createExpect } from './expect';
import { Recorder } from './recorder';
import { generateLocator, retarget } from './selectors';

// ---------------------------------------------------------------- result types

export type StepCategory = 'action' | 'expect' | 'step' | 'hook' | 'note';

export interface StepResult {
  title: string;
  category: StepCategory;
  line?: number;
  status: 'running' | 'passed' | 'failed';
  duration: number;
  error?: string;
  children: StepResult[];
}

export type TestStatus = 'running' | 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

export interface TestResult {
  id: number;
  title: string;
  titlePath: string[];
  status: TestStatus;
  duration: number;
  errors: { message: string; line?: number }[];
  steps: StepResult[];
}

export interface RunResult {
  label?: string;
  /** The code that ran, so error snippets still match it after the editor changes. */
  code: string;
  tests: TestResult[];
  compileError?: { message: string; line?: number };
  calls: Record<string, number>;
  duration: number;
  status: 'running' | 'passed' | 'failed' | 'interrupted' | 'error';
}

export interface ConsoleEntry {
  id: number;
  source: 'test' | 'browser';
  level: string;
  text: string;
}

export interface LabSetup {
  /** Pre-accept the cookie banner and pre-dismiss the newsletter popup. */
  dismissOverlays?: boolean;
  /** Start every test logged in as this user. */
  loggedInAs?: string | null;
  /** Turn on bug mode in the practice app. */
  bugs?: string[] | 'all' | null;
  /** Extra localStorage entries (values are JSON-encoded). */
  storage?: Record<string, unknown>;
  /** Test timeout in ms (default 30 000). */
  timeout?: number;
}

export interface Highlight {
  pageId: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

interface TestCase {
  title: string;
  titlePath: string[];
  fn: (fixtures: unknown, info: unknown) => unknown;
  scopes: Scope[];
  only: boolean;
  skip: boolean;
}

interface Scope {
  title: string;
  beforeEach: Hook[];
  afterEach: Hook[];
  beforeAll: Hook[];
  afterAll: Hook[];
}

type Hook = (fixtures: unknown, info: unknown) => unknown;

class TestTimeoutError extends LabError {}
class InterruptedError extends LabError {}

// ---------------------------------------------------------------- compile

const SOURCE_URL = 'playwright-lab-test.js';
const PARAMS = ['require', 'exports', 'module', 'Buffer', 'console', 'process', 'document', 'window', 'localStorage', 'sessionStorage', 'location'];

export function compile(code: string): (...args: unknown[]) => Promise<void> {
  let js: string;
  try {
    js = transform(code, {
      transforms: ['typescript', 'imports'],
      filePath: 'example.spec.ts',
      production: true,
      // Keep ?. and ?? as they are: browsers support them, and Sucrase's helper functions would not exist
      // inside the page when a function is passed to page.evaluate().
      disableESTransforms: true,
    }).code;
  } catch (e) {
    const msg = (e as Error).message;
    const m = /\((\d+):(\d+)\)/.exec(msg);
    throw new CompileError(`SyntaxError: ${msg}`, m ? Number(m[1]) : undefined);
  }
  // The prefix stays on line 1 so line numbers match the editor.
  const src = `(async function (${PARAMS.join(', ')}) {${js}\n})\n//# sourceURL=${SOURCE_URL}`;
  try {
    return (0, eval)(src);
  } catch (e) {
    throw new CompileError(`${(e as Error).name}: ${(e as Error).message}`, lineFromError(e));
  }
}

const BufferShim = {
  from(data: string | ArrayLike<number>, encoding: 'utf8' | 'utf-8' | 'base64' = 'utf8') {
    if (typeof data !== 'string') return Uint8Array.from(data as ArrayLike<number>);
    if (encoding === 'base64') return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    return new TextEncoder().encode(data);
  },
};

function nodeOnly(name: string) {
  return new Proxy({}, {
    get() {
      throw new LabError(`${name} is not available in test code. Tests run in Node.js, not in the page. Use locators, or page.evaluate(() => ${name}...) to run code inside the page.`);
    },
  });
}

let ids = 0;

// ---------------------------------------------------------------- runtime

export class Runtime {
  baseURL = new URL('shop/', location.origin + location.pathname).href;
  viewport = { width: 1280, height: 800 };
  actionTimeout = 10_000;
  expectTimeout = 5_000;
  navigationTimeout = 15_000;
  defaultTestTimeout = 30_000;
  slowMo = 0;

  // live state for the UI
  running = false;
  result: RunResult | null = null;
  /** Resolves when no test is running. */
  private idle: Promise<void> = Promise.resolve();
  private opened = 0;
  console: ConsoleEntry[] = [];
  highlightState: Highlight | null = null;
  currentLine: number | null = null;
  pickerActive = false;
  pickerHover: string | null = null;
  pickerResult: string | null = null;

  context: ContextImpl | null = null;
  activePage: PageImpl | null = null;
  recorder = new Recorder(this);

  private container: HTMLElement | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  private scheduled = false;
  private hlTimer: number | undefined;
  private abortRequested = false;
  private currentTest: TestResult | null = null;
  private stepStack: StepResult[][] = [];
  private softErrors: { message: string; line?: number }[] = [];
  private asyncErrors: { message: string; line?: number }[] = [];
  private testTimeout = 30_000;
  private calls: Record<string, number> = {};
  private tracked: { title: string; line?: number; awaited: boolean; failed: boolean }[] = [];
  private pickerCleanup: (() => void) | null = null;

  // ----- subscription (useSyncExternalStore)
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  emit() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.version++;
      this.listeners.forEach((f) => f());
    });
  }

  // ----- preview container
  attach(container: HTMLElement) {
    this.container = container;
    for (const p of this.context?._pages ?? []) if (!p._closed) container.appendChild(p._frame);
    this.applyViewport();
  }
  detach(container: HTMLElement) {
    if (this.container === container) this.container = null;
  }
  setViewport(size: { width: number; height: number }) {
    this.viewport = { width: Math.max(320, size.width), height: Math.max(240, size.height) };
    this.applyViewport();
    this.emit();
  }
  private applyViewport() {
    for (const p of this.context?._pages ?? []) {
      p._frame.style.width = `${this.viewport.width}px`;
      p._frame.style.height = `${this.viewport.height}px`;
    }
  }

  createPage(context: ContextImpl, isPopup: boolean, url?: string): PageImpl {
    const frame = document.createElement('iframe');
    frame.className = 'lab-page';
    frame.title = 'Practice app';
    frame.style.width = `${this.viewport.width}px`;
    frame.style.height = `${this.viewport.height}px`;
    (this.container ?? this.fallbackContainer()).appendChild(frame);
    const page = new PageImpl(this, context, frame);
    page._isPopup = isPopup;
    context._addPage(page);
    this.activate(page);
    if (url && url !== 'about:blank') {
      page._navigating = true;
      frame.src = url;
    }
    return page;
  }

  private fallbackContainer() {
    let el = document.getElementById('lab-offscreen');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lab-offscreen';
      el.style.cssText = 'position:fixed;left:-20000px;top:0;';
      document.body.appendChild(el);
    }
    return el;
  }

  activate(page: PageImpl) {
    this.activePage = page;
    for (const p of this.context?._pages ?? []) p._frame.classList.toggle('active', p === page);
    if (this.pickerActive) this.attachPicker();
    this.recorder.reattach();
    this.emit();
  }

  removePage(page: PageImpl) {
    page._frame.remove();
    if (this.activePage === page) {
      const rest = this.context?.pages() ?? [];
      if (rest.length) this.activate(rest[rest.length - 1]);
      else this.activePage = null;
    }
    this.emit();
  }

  private disposeContext() {
    if (!this.context) return;
    this.context._closed = true;
    for (const p of this.context._pages) {
      p._closed = true;
      p._frame.remove();
    }
    this.context = null;
    this.activePage = null;
  }

  pages() {
    return (this.context?.pages() ?? []).map((p) => ({ id: p._id, url: p.url(), title: p._doc()?.title ?? '' }));
  }

  /** Shows the app in the preview when no test is running, so learners can explore it. */
  explore(setup: LabSetup, path = 'index.html') {
    if (this.running) return;
    this.disposeContext();
    this.resetStorage(setup);
    this.context = new ContextImpl(this);
    this.createPage(this.context, false, new URL(path, this.baseURL).href);
    this.emit();
  }

  navigateActive(path: string) {
    const page = this.activePage;
    if (!page || this.running) return;
    const target = new URL(path, this.baseURL).href;
    if (!target.startsWith(this.baseURL)) return;
    this.recorder.navigated(target.slice(this.baseURL.length));
    page._frame.src = target;
  }

  // ----- instrumentation (called synchronously by shop/js/test-hooks.js)
  instrument(win: Window & typeof globalThis) {
    // Before any page script runs: give the page the lab's own storage area.
    isolateStorage(win);
    let top: Window = win;
    while (top.parent !== top && top.parent !== window) top = top.parent;
    const page = this.context?._pages.find((p) => p._frame.contentWindow === top);
    if (!page) return;
    const isMain = top === win;

    win.alert = (m?: unknown) => void page._onDialog('alert', String(m ?? ''), '');
    win.confirm = (m?: string) => page._onDialog('confirm', String(m ?? ''), '') as boolean;
    win.prompt = (m?: string, d?: string) => page._onDialog('prompt', String(m ?? ''), d ?? '') as string | null;

    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      const orig = win.console[level].bind(win.console);
      win.console[level] = (...args: unknown[]) => {
        orig(...args);
        const text = args.map(fmtConsoleArg).join(' ');
        this.addConsole('browser', level, text);
        page._emit(this, 'console', { type: () => (level === 'warn' ? 'warning' : level), text: () => text, args: () => args, page: () => page });
      };
    }
    win.addEventListener('error', (e) => {
      const err = e.error instanceof win.Error || e.error instanceof Error ? e.error : new Error(e.message);
      this.addConsole('browser', 'error', `Uncaught ${err.name}: ${err.message}`);
      page._emit(this, 'pageerror', err);
    });
    win.addEventListener('unhandledrejection', (e) => {
      const reason = e.reason as Error;
      this.addConsole('browser', 'error', `Uncaught (in promise) ${reason?.message ?? reason}`);
      page._emit(this, 'pageerror', reason instanceof Error ? reason : new Error(String(reason)));
    });

    const origFetch = win.fetch.bind(win);
    win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => page._fetch(win, origFetch, input, init)) as typeof fetch;

    if (isMain) {
      win.addEventListener('beforeunload', () => {
        page._navigating = true;
      });
      win.close = () => {
        if (page._isPopup) void page.close();
      };
    }

    win.open = ((url?: string | URL) => {
      const target = url ? new URL(String(url), win.location.href).href : 'about:blank';
      const popup = this.openPopup(page, target);
      return popup._frame.contentWindow;
    }) as typeof win.open;

    // target=_blank links open a new tab; <a download> links produce a download event.
    win.addEventListener('click', (e) => {
      if (e.defaultPrevented) return;
      const a = (e.composedPath()[0] as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      if (a.hasAttribute('download')) {
        e.preventDefault();
        const href = a.href;
        const filename = a.getAttribute('download') || href.split('/').pop() || 'download';
        page._emit(this, 'download', { suggestedFilename: () => filename, url: () => href, page: () => page, failure: async () => null, path: async () => { throw new LabError('download.path() is not available in the browser. Use download.suggestedFilename().'); }, saveAs: async () => { this.note('download.saveAs() did nothing (no file system in the browser).'); } });
        this.note(`Download "${filename}"`);
        return;
      }
      if (a.target === '_blank') {
        e.preventDefault();
        this.openPopup(page, a.href);
      }
    });

    for (const src of [...(page._clockScript ? [page._clockScript] : []), ...page._context._initScripts, ...page._initScripts]) {
      try {
        win.eval(src);
      } catch (err) {
        this.addConsole('browser', 'error', `Init script error: ${(err as Error).message}`);
      }
    }
    if (isMain && this.pickerActive && page === this.activePage) queueMicrotask(() => this.attachPicker());
    if (isMain && this.recorder.active && page === this.activePage) queueMicrotask(() => this.recorder.reattach());
  }

  openPopup(opener: PageImpl, url: string): PageImpl {
    const popup = this.createPage(opener._context, true, url);
    this.note(`New tab opened: ${url}`);
    opener._emit(this, 'popup', popup);
    opener._context._emit(this, 'page', popup);
    return popup;
  }

  // ----- console
  addConsole(source: 'test' | 'browser', level: string, text: string) {
    this.console.push({ id: ++ids, source, level, text });
    if (this.console.length > 500) this.console.shift();
    this.emit();
  }

  private makeConsole() {
    const log = (level: string) => (...args: unknown[]) => {
      // eslint-disable-next-line no-console
      (console as unknown as Record<string, (...a: unknown[]) => void>)[level]?.(...args);
      this.addConsole('test', level, args.map(fmtConsoleArg).join(' '));
    };
    return { log: log('log'), info: log('info'), warn: log('warn'), error: log('error'), debug: log('debug'), table: log('log') };
  }

  // ----- steps
  count(api: string) {
    this.calls[api] = (this.calls[api] ?? 0) + 1;
  }

  note(text: string) {
    const parent = this.stepStack[this.stepStack.length - 1];
    if (parent) parent.push({ title: text, category: 'note', status: 'passed', duration: 0, children: [] });
    this.emit();
  }

  assertNotAborted() {
    if (this.abortRequested) throw new InterruptedError('Test was stopped.');
  }

  step<T>(
    owner: { _assertOpen(): void } | null,
    title: string,
    category: StepCategory,
    fn: () => T | Promise<T>,
    opts: { api?: string; nest?: boolean; slow?: boolean } = {},
  ): Promise<T> {
    const line = captureUserLine();
    try {
      owner?._assertOpen();
    } catch (e) {
      return Promise.reject(e);
    }
    const s: StepResult = { title, category, line, status: 'running', duration: 0, children: [] };
    const parent = this.stepStack[this.stepStack.length - 1];
    parent?.push(s);
    if (opts.nest) this.stepStack.push(s.children);
    if (line && (category === 'action' || category === 'expect')) this.currentLine = line;
    this.emit();
    const t0 = performance.now();
    const finish = (err?: unknown) => {
      s.duration = performance.now() - t0;
      s.status = err ? 'failed' : 'passed';
      if (err) {
        s.error = firstLine(errorMessage(err));
        const e = err as { line?: number };
        if (e && typeof e === 'object' && e.line === undefined && line) e.line = line;
      }
      if (opts.nest) {
        const i = this.stepStack.lastIndexOf(s.children);
        if (i > 0) this.stepStack.splice(i, 1);
      }
      // Count only calls that worked, so lesson checks reflect what really happened.
      if (opts.api && (!err || category === 'expect')) this.count(opts.api);
      this.emit();
    };
    let p: Promise<T>;
    try {
      p = Promise.resolve(fn());
    } catch (e) {
      finish(e);
      return Promise.reject(e);
    }
    const result = p.then(
      async (v) => {
        finish();
        if (opts.slow && this.slowMo) await this.sleep(this.slowMo, owner);
        return v;
      },
      (e) => {
        finish(e);
        throw e;
      },
    );
    return this.track(result, title, line);
  }

  /** Returns a thenable that remembers whether the test code awaited it. */
  private track<T>(p: Promise<T>, title: string, line?: number): Promise<T> {
    if (!this.currentTest) return p;
    const entry = { title, line, awaited: false, failed: false };
    this.tracked.push(entry);
    p.catch(() => {
      entry.failed = true;
    });
    const thenable = {
      then(a?: (v: T) => unknown, b?: (e: unknown) => unknown) {
        entry.awaited = true;
        return p.then(a, b);
      },
      catch(b?: (e: unknown) => unknown) {
        entry.awaited = true;
        return p.catch(b);
      },
      finally(f?: () => void) {
        entry.awaited = true;
        return p.finally(f);
      },
      [Symbol.toStringTag]: 'Promise',
    };
    return thenable as unknown as Promise<T>;
  }

  /** Records a synchronous step (used by non-retrying expect matchers). */
  syncStep<T>(title: string, api: string, fn: () => T): T {
    const line = captureUserLine();
    this.count(api);
    const s: StepResult = { title, category: 'expect', line, status: 'running', duration: 0, children: [] };
    this.stepStack[this.stepStack.length - 1]?.push(s);
    try {
      const v = fn();
      s.status = 'passed';
      return v;
    } catch (e) {
      s.status = 'failed';
      s.error = firstLine(errorMessage(e));
      const err = e as { line?: number };
      if (err && typeof err === 'object' && err.line === undefined && line) err.line = line;
      throw e;
    } finally {
      this.emit();
    }
  }

  async sleep(ms: number, owner?: { _assertOpen(): void } | null) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      owner?._assertOpen();
      this.assertNotAborted();
      await new Promise((r) => setTimeout(r, Math.min(50, Math.max(0, end - Date.now()))));
    }
    owner?._assertOpen();
  }

  softError(e: unknown) {
    this.softErrors.push({ message: errorMessage(e), line: lineFromError(e) });
  }

  asyncError(e: unknown) {
    if (e instanceof ClosedError) return;
    this.asyncErrors.push({ message: errorMessage(e), line: lineFromError(e) });
  }

  // ----- highlight
  highlight(page: PageImpl, el: Element, label: string) {
    if (page !== this.activePage) this.activate(page);
    const r = el.getBoundingClientRect();
    let x = r.left;
    let y = r.top;
    let win = el.ownerDocument.defaultView;
    while (win && win.frameElement && win.frameElement !== page._frame) {
      const fr = win.frameElement.getBoundingClientRect();
      x += fr.left;
      y += fr.top;
      win = win.parent as Window & typeof globalThis;
    }
    this.highlightState = { pageId: page._id, x, y, w: r.width, h: r.height, label };
    this.emit();
    window.clearTimeout(this.hlTimer);
    this.hlTimer = window.setTimeout(() => {
      this.highlightState = null;
      this.emit();
    }, Math.max(700, this.slowMo + 300));
  }

  // ----- locator picker
  setPicker(active: boolean) {
    if (active) this.recorder.stop();
    this.pickerActive = active;
    this.pickerHover = null;
    if (active) {
      this.pickerResult = null;
      this.attachPicker();
    } else {
      this.pickerCleanup?.();
      this.pickerCleanup = null;
      this.highlightState = null;
    }
    this.emit();
  }

  private attachPicker() {
    this.pickerCleanup?.();
    this.pickerCleanup = null;
    const page = this.activePage;
    const doc = page?._doc();
    if (!page || !doc) return;
    const pick = (e: Event) => {
      const raw = e.composedPath()[0] as Element;
      if (!raw || raw.nodeType !== 1) return null;
      return retarget(raw);
    };
    const onMove = (e: MouseEvent) => {
      const el = pick(e);
      if (!el) return;
      try {
        this.pickerHover = `page.${generateLocator(el, doc)}`;
      } catch {
        this.pickerHover = null;
      }
      const r = el.getBoundingClientRect();
      this.highlightState = { pageId: page._id, x: r.left, y: r.top, w: r.width, h: r.height, label: this.pickerHover ?? '' };
      this.emit();
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = pick(e);
      if (el) {
        try {
          this.pickerResult = `page.${generateLocator(el, doc)}`;
        } catch {
          /* ignore */
        }
      }
      this.setPicker(false);
    };
    const block = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    doc.addEventListener('mousemove', onMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('mousedown', block, true);
    doc.addEventListener('mouseup', block, true);
    this.pickerCleanup = () => {
      doc.removeEventListener('mousemove', onMove, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('mousedown', block, true);
      doc.removeEventListener('mouseup', block, true);
    };
  }

  // ----- storage
  resetStorage(setup: LabSetup) {
    // Only the lab's own copy of the shop data is reset (see storage.ts).
    clearShopStorage();
    const store = shopLocalStorage();
    if (setup.dismissOverlays) {
      store.setItem('pp.cookieConsent', '"accepted"');
      store.setItem('pp.newsletterDismissed', 'true');
    }
    if (setup.loggedInAs) {
      store.setItem('pp.session', JSON.stringify({ email: setup.loggedInAs, token: 'lab-session', expiresAt: Date.now() + 86_400_000 }));
    }
    if (setup.bugs && (setup.bugs === 'all' || setup.bugs.length)) store.setItem('pp.bugs', JSON.stringify(setup.bugs));
    for (const [k, v] of Object.entries(setup.storage ?? {})) store.setItem(k, JSON.stringify(v));
  }

  // ----- running tests
  stop() {
    if (this.running) this.abortRequested = true;
  }

  async run(code: string, setup: LabSetup = {}, label?: string): Promise<RunResult> {
    if (this.running) throw new Error('A run is already in progress');
    this.setPicker(false);
    this.recorder.stop();
    this.running = true;
    this.abortRequested = false;
    let finished!: () => void;
    this.idle = new Promise((resolve) => (finished = resolve));
    this.calls = {};
    this.console = [];
    const result: RunResult = { label, code, tests: [], calls: this.calls, duration: 0, status: 'running' };
    this.result = result;
    this.emit();
    const t0 = performance.now();

    try {
      let fn: (...args: unknown[]) => Promise<void>;
      try {
        fn = compile(code);
      } catch (e) {
        result.compileError = { message: errorMessage(e), line: lineFromError(e) };
        result.status = 'error';
        return result;
      }

      const collector = createCollector(this);
      const expect = createExpect(this);
      const req = (name: string) => {
        if (name === '@playwright/test') return { test: collector.test, expect, devices: {}, defineConfig: (c: unknown) => c };
        throw new LabError(`Cannot import "${name}". In Playwright Lab everything lives in one file, and only '@playwright/test' can be imported. Put helper classes (like page objects) in the same file.`);
      };
      const module = { exports: {} };
      try {
        await fn(req, module.exports, module, BufferShim, this.makeConsole(), { env: {} }, nodeOnly('document'), nodeOnly('window'), nodeOnly('localStorage'), nodeOnly('sessionStorage'), nodeOnly('location'));
      } catch (e) {
        result.compileError = { message: `Error while loading the test file:\n${errorMessage(e)}`, line: lineFromError(e) };
        result.status = 'error';
        return result;
      }
      let tests = collector.tests;
      if (!tests.length) {
        result.compileError = { message: "No tests found. Add a test with test('title', async ({ page }) => { ... })." };
        result.status = 'error';
        return result;
      }
      if (tests.some((t) => t.only)) tests = tests.filter((t) => t.only);

      const scopes = [...new Set(tests.flatMap((t) => t.scopes))];
      let beforeAllError: { message: string; line?: number } | null = null;
      for (const scope of scopes) {
        for (const h of scope.beforeAll) {
          try {
            await h({ baseURL: this.baseURL }, {});
          } catch (e) {
            beforeAllError = { message: `beforeAll hook failed:\n${errorMessage(e)}`, line: lineFromError(e) };
          }
        }
      }

      for (const t of tests) {
        if (this.abortRequested) {
          result.tests.push({ id: ++ids, title: t.title, titlePath: t.titlePath, status: 'skipped', duration: 0, errors: [], steps: [] });
          continue;
        }
        await this.runTest(t, setup, beforeAllError);
      }

      for (const scope of scopes) {
        for (const h of scope.afterAll) {
          try {
            await h({ baseURL: this.baseURL }, {});
          } catch (e) {
            result.tests[result.tests.length - 1]?.errors.push({ message: `afterAll hook failed:\n${errorMessage(e)}`, line: lineFromError(e) });
          }
        }
      }

      const statuses = result.tests.map((t) => t.status);
      result.status = this.abortRequested ? 'interrupted' : statuses.some((s) => s === 'failed' || s === 'timedOut') ? 'failed' : 'passed';
      return result;
    } finally {
      result.duration = performance.now() - t0;
      if (result.status === 'running') result.status = 'error';
      this.running = false;
      this.currentLine = null;
      this.currentTest = null;
      this.stepStack = [];
      this.emit();
      finished();
    }
  }

  /**
   * Starts over for a new lesson or the Sandbox: stops a running test, waits for it to finish,
   * then clears the results and shows the app in the preview.
   */
  async open(setup: LabSetup, path = 'index.html') {
    const opened = ++this.opened;
    this.stop();
    await this.idle;
    if (opened !== this.opened) return; // another lesson was opened meanwhile
    this.result = null;
    this.console = [];
    this.pickerResult = null;
    this.explore(setup, path);
  }

  private async runTest(t: TestCase, setup: LabSetup, beforeAllError: { message: string; line?: number } | null) {
    const tr: TestResult = { id: ++ids, title: t.title, titlePath: t.titlePath, status: 'running', duration: 0, errors: [], steps: [] };
    this.result!.tests.push(tr);
    this.currentTest = tr;
    this.stepStack = [tr.steps];
    this.softErrors = [];
    this.asyncErrors = [];
    this.tracked = [];
    this.emit();
    if (t.skip) {
      tr.status = 'skipped';
      return;
    }
    if (beforeAllError) {
      tr.status = 'failed';
      tr.errors.push(beforeAllError);
      return;
    }

    // A fresh "browser context" for every test, like real Playwright.
    this.disposeContext();
    this.resetStorage(setup);
    const context = new ContextImpl(this);
    this.context = context;
    const page = this.createPage(context, false);
    const fixtures = {
      page, context, baseURL: this.baseURL, browserName: 'chromium',
      request: new RequestContextImpl(this, context),
      browser: nodeOnly('browser'),
    };
    const info = { title: t.title, titlePath: t.titlePath, retry: 0, project: { name: 'chromium' }, annotations: [], timeout: this.testTimeout };
    this.testTimeout = setup.timeout ?? this.defaultTestTimeout;

    const t0 = performance.now();
    let skipped = false;
    let timedOut = false;
    const runBody = async () => {
      for (const scope of t.scopes) {
        for (const h of scope.beforeEach) await this.step(null, 'beforeEach hook', 'hook', () => h(fixtures, info), { nest: true });
      }
      await t.fn(fixtures, info);
    };
    try {
      await this.withTimeout(context, runBody, t0);
    } catch (e) {
      if (e instanceof SkipError) skipped = true;
      else {
        if (e instanceof TestTimeoutError) timedOut = true;
        tr.errors.push({ message: errorMessage(e), line: lineFromError(e) });
      }
    }
    if (!context._closed) {
      for (const scope of [...t.scopes].reverse()) {
        for (const h of scope.afterEach) {
          try {
            await this.withTimeout(context, () => this.step(null, 'afterEach hook', 'hook', () => h(fixtures, info), { nest: true }), t0);
          } catch (e) {
            tr.errors.push({ message: errorMessage(e), line: lineFromError(e) });
          }
        }
      }
    }
    tr.errors.push(...this.softErrors, ...this.asyncErrors);
    const passedOtherwise = tr.errors.length === 0;
    for (const t2 of this.tracked) {
      if (t2.awaited || (!passedOtherwise && !t2.failed)) continue;
      tr.errors.push({
        message: `Error: Missing await${t2.line ? ` on line ${t2.line}` : ''}: "${t2.title}" was never awaited.\nPlaywright actions and assertions return promises. Put await in front of them so the test waits for them to finish.`,
        line: t2.line,
      });
    }
    this.tracked = [];
    tr.duration = performance.now() - t0;
    if (this.abortRequested) tr.status = 'interrupted';
    else if (skipped) tr.status = 'skipped';
    else if (timedOut) tr.status = 'timedOut';
    else tr.status = tr.errors.length ? 'failed' : 'passed';
    context._closed = true; // stops any code still running from this test; the iframes stay visible
    this.currentLine = null;
    this.emit();
  }

  setTestTimeout(ms: number) {
    this.testTimeout = ms;
  }

  private withTimeout<T>(context: ContextImpl, fn: () => Promise<T>, start: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const timer = window.setInterval(() => {
        if (done) return;
        if (this.abortRequested) {
          done = true;
          context._closed = true;
          clearInterval(timer);
          reject(new InterruptedError('Test was stopped.'));
        } else if (this.testTimeout > 0 && performance.now() - start > this.testTimeout) {
          done = true;
          context._closed = true;
          clearInterval(timer);
          reject(new TestTimeoutError(`Test timeout of ${this.testTimeout}ms exceeded.`));
        }
      }, 50);
      fn().then(
        (v) => {
          if (done) return;
          done = true;
          clearInterval(timer);
          resolve(v);
        },
        (e) => {
          if (done) return;
          done = true;
          clearInterval(timer);
          reject(e);
        },
      );
    });
  }

  inTest() {
    return !!this.currentTest && this.running;
  }
}

// ---------------------------------------------------------------- test API (test, describe, hooks)

function createCollector(rt: Runtime) {
  const tests: TestCase[] = [];
  const root: Scope = { title: '', beforeEach: [], afterEach: [], beforeAll: [], afterAll: [] };
  const stack: Scope[] = [root];
  const top = () => stack[stack.length - 1];

  const register = (title: unknown, fn: unknown, flags: { only?: boolean; skip?: boolean }) => {
    if (typeof title !== 'string') throw new LabError('test(): the first argument must be the test title (a string).');
    if (typeof fn !== 'function') throw new LabError(`test("${title}"): the second argument must be an async function, e.g. async ({ page }) => { ... }`);
    if (rt.inTest()) throw new LabError('test() can only be called at the top level of the file or inside test.describe().');
    tests.push({
      title,
      titlePath: [...stack.slice(1).map((s) => s.title), title],
      fn: fn as TestCase['fn'],
      scopes: [...stack],
      only: !!flags.only || stack.some((s) => (s as Scope & { only?: boolean }).only),
      skip: !!flags.skip || stack.some((s) => (s as Scope & { skip?: boolean }).skip),
    });
  };

  const hook = (kind: 'beforeEach' | 'afterEach' | 'beforeAll' | 'afterAll') => (a: unknown, b?: unknown) => {
    const fn = (typeof a === 'function' ? a : b) as Hook;
    if (typeof fn !== 'function') throw new LabError(`test.${kind}() expects a function.`);
    rt.count(kind);
    top()[kind].push(fn);
  };

  const describe = (title: unknown, fn: unknown, flags: { only?: boolean; skip?: boolean } = {}) => {
    const body = (typeof title === 'function' ? title : fn) as () => void;
    const name = typeof title === 'string' ? title : '';
    rt.count('describe');
    const scope = { title: name, beforeEach: [], afterEach: [], beforeAll: [], afterAll: [], ...flags } as Scope;
    stack.push(scope);
    try {
      body();
    } finally {
      stack.pop();
    }
  };
  const describeFn = Object.assign((t: unknown, f?: unknown) => describe(t, f), {
    only: (t: unknown, f?: unknown) => describe(t, f, { only: true }),
    skip: (t: unknown, f?: unknown) => describe(t, f, { skip: true }),
    fixme: (t: unknown, f?: unknown) => describe(t, f, { skip: true }),
    serial: (t: unknown, f?: unknown) => describe(t, f),
    parallel: (t: unknown, f?: unknown) => describe(t, f),
    configure: () => {},
  });

  const skipLike = (a?: unknown, b?: unknown) => {
    if (typeof a === 'string' && typeof b === 'function') return register(a, b, { skip: true });
    if (rt.inTest()) {
      if (a === undefined || a === true || typeof a === 'string') throw new SkipError();
      return;
    }
    throw new LabError('test.skip() must be called with a title and a function, or inside a test.');
  };

  const test = Object.assign((title: unknown, fn: unknown) => register(title, fn, {}), {
    only: (title: unknown, fn: unknown) => register(title, fn, { only: true }),
    skip: skipLike,
    fixme: skipLike,
    fail: (title: unknown, fn: unknown) => register(title, fn, {}),
    slow: () => rt.setTestTimeout(rt.defaultTestTimeout * 3),
    describe: describeFn,
    beforeEach: hook('beforeEach'),
    afterEach: hook('afterEach'),
    beforeAll: hook('beforeAll'),
    afterAll: hook('afterAll'),
    step: <T>(title: string, body: () => T | Promise<T>) => rt.step(null, title, 'step', body, { nest: true, api: 'step' }),
    setTimeout: (ms: number) => rt.setTestTimeout(ms),
    use: () => {
      throw new LabError('test.use() is not supported in Playwright Lab. The page always uses the practice app as baseURL.');
    },
    info: () => ({ title: '', retry: 0 }),
    extend: () => {
      throw new LabError('test.extend() (custom fixtures) is not supported in Playwright Lab yet. Use beforeEach hooks or page object classes instead.');
    },
  });

  return { tests, test };
}

// ---------------------------------------------------------------- helpers

export function errorMessage(e: unknown): string {
  if (e instanceof CompileError) return e.message;
  if (e instanceof Error) {
    const name = e.name && e.name !== 'Error' ? e.name : 'Error';
    return e.message.startsWith(`${name}:`) ? e.message : `${name}: ${e.message}`;
  }
  return String(e);
}

function firstLine(s: string) {
  return s.split('\n')[0];
}

function fmtConsoleArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try {
    return normalizeWhiteSpace(JSON.stringify(a) ?? String(a));
  } catch {
    return String(a);
  }
}

export const runtime = new Runtime();
(window as unknown as { __playwrightLab: unknown }).__playwrightLab = {
  instrument: (win: Window & typeof globalThis) => runtime.instrument(win),
};
