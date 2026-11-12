// The Playwright-like API objects that test code talks to: Page, Locator, FrameLocator,
// BrowserContext, Dialog, Route, Request, APIResponse, Keyboard.
import {
  deepActiveElement, describeElement, fullText, isChecked, isDisabled, isEditable, isVisible, normalizeWhiteSpace,
} from './dom';
import { ClosedError, LabError, TimeoutError } from './errors';
import {
  click, dragAndDrop, fill, flushChange, hitTarget, moveMouseTo, newInputState, press, selectOptions, setFiles,
  typeText, type ClickOptions, type FilePayload, type InputState, type SelectValue,
} from './input';
import {
  fmtValue, generateLocator, isRegExp, resolveSteps, stepsToString, type FilterOptions, type RoleOptions, type Step,
  type TextValue,
} from './selectors';
import type { Runtime } from './runtime';

type Listener = (arg: any) => unknown;

// ---------------------------------------------------------------- events

class Emitter {
  _listeners = new Map<string, Set<Listener>>();
  _waiters = new Map<string, Set<Listener>>();

  _add(event: string, l: Listener) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(l);
  }

  _hasListeners(event: string) {
    return (this._listeners.get(event)?.size ?? 0) > 0;
  }

  _emit(rt: Runtime, event: string, arg: unknown) {
    for (const l of [...(this._listeners.get(event) ?? [])]) {
      try {
        const r = l(arg) as Promise<unknown> | undefined;
        if (r && typeof r.catch === 'function') r.catch((e) => rt.asyncError(e));
      } catch (e) {
        rt.asyncError(e);
      }
    }
    for (const w of [...(this._waiters.get(event) ?? [])]) w(arg);
  }

  _waitFor<T>(rt: Runtime, owner: { _assertOpen(): void }, event: string, opts: unknown, defaultTimeout: number): Promise<T> {
    const o = (typeof opts === 'function' ? { predicate: opts } : (opts ?? {})) as { predicate?: (x: T) => unknown; timeout?: number };
    const timeout = o.timeout ?? defaultTimeout;
    return new Promise<T>((resolve, reject) => {
      if (!this._waiters.has(event)) this._waiters.set(event, new Set());
      const set = this._waiters.get(event)!;
      const timer = setInterval(() => {
        try {
          owner._assertOpen();
        } catch (e) {
          cleanup();
          reject(e);
          return;
        }
        if (Date.now() > deadline) {
          cleanup();
          reject(new TimeoutError(`waitForEvent: Timeout ${timeout}ms exceeded while waiting for event "${event}"`));
        }
      }, 50);
      const deadline = Date.now() + timeout;
      const waiter = async (arg: T) => {
        try {
          if (o.predicate && !(await o.predicate(arg))) return;
        } catch (e) {
          cleanup();
          reject(e);
          return;
        }
        cleanup();
        resolve(arg);
      };
      const cleanup = () => {
        clearInterval(timer);
        set.delete(waiter as Listener);
      };
      set.add(waiter as Listener);
      void rt;
    });
  }
}

// ---------------------------------------------------------------- Dialog

export class DialogImpl {
  _handled = false;
  _accepted = false;
  _promptText: string | undefined;
  constructor(private _page: PageImpl, private _type: string, private _message: string, private _default: string) {}
  type() { return this._type; }
  message() { return this._message; }
  defaultValue() { return this._default; }
  page() { return this._page; }
  async accept(promptText?: string) {
    if (this._handled) throw new LabError('Cannot accept dialog which is already handled!');
    this._handled = true;
    this._accepted = true;
    this._promptText = promptText;
  }
  async dismiss() {
    if (this._handled) throw new LabError('Cannot dismiss dialog which is already handled!');
    this._handled = true;
  }
}

// ---------------------------------------------------------------- network

export function urlMatcher(pattern: unknown, baseURL: string): (url: string) => boolean {
  if (typeof pattern === 'function') return (u) => !!(pattern as (u: URL) => unknown)(new URL(u));
  if (isRegExp(pattern)) return (u) => {
    pattern.lastIndex = 0;
    return pattern.test(u);
  };
  let p = String(pattern);
  if (!p.startsWith('*') && !/^[a-z]+:\/\//i.test(p)) p = new URL(p, baseURL).href;
  let re = '';
  let inGroup = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        re += '.*';
        i++;
      } else re += '[^/]*';
    } else if (c === '{') {
      inGroup = true;
      re += '(';
    } else if (c === '}') {
      inGroup = false;
      re += ')';
    } else if (c === ',' && inGroup) re += '|';
    else re += c.replace(/[.+?^$()|[\]\\]/g, '\\$&');
  }
  const r = new RegExp(`^${re}$`);
  return (u) => r.test(u);
}

export class RequestImpl {
  constructor(private _url: string, private _method: string, private _headers: Record<string, string>, private _body: string | null) {}
  url() { return this._url; }
  method() { return this._method; }
  headers() { return { ...this._headers }; }
  postData() { return this._body; }
  postDataJSON() { return this._body ? JSON.parse(this._body) : null; }
  resourceType() { return 'fetch'; }
}

export class APIResponseImpl {
  constructor(private _res: Response, private _text: string) {}
  status() { return this._res.status; }
  statusText() { return this._res.statusText; }
  ok() { return this._res.ok; }
  url() { return this._res.url; }
  headers() {
    const h: Record<string, string> = {};
    this._res.headers.forEach((v, k) => (h[k] = v));
    return h;
  }
  async text() { return this._text; }
  async json() { return JSON.parse(this._text); }
  async body() { return new TextEncoder().encode(this._text); }
}

type RouteDecision =
  | { type: 'fulfill'; response: Response }
  | { type: 'continue' }
  | { type: 'fallback' }
  | { type: 'abort' };

export class RouteImpl {
  _done = false;
  constructor(
    private _request: RequestImpl,
    private _win: Window & typeof globalThis,
    private _origFetch: typeof fetch,
    private _settle: (d: RouteDecision) => void,
  ) {}
  request() { return this._request; }
  private _finish(d: RouteDecision) {
    if (this._done) throw new LabError('Route is already handled!');
    this._done = true;
    this._settle(d);
  }
  async fulfill(o: { status?: number; body?: string; json?: unknown; contentType?: string; headers?: Record<string, string>; response?: APIResponseImpl } = {}) {
    const headers: Record<string, string> = { ...(o.response ? o.response.headers() : {}), ...(o.headers ?? {}) };
    let body = o.body ?? (o.response ? await o.response.text() : '');
    if (o.json !== undefined) {
      body = JSON.stringify(o.json);
      headers['content-type'] = 'application/json';
    }
    if (o.contentType) headers['content-type'] = o.contentType;
    const status = o.status ?? (o.response ? o.response.status() : 200);
    const response = new this._win.Response(status === 204 || status === 304 ? null : body, { status, headers });
    this._finish({ type: 'fulfill', response });
  }
  async continue() { this._finish({ type: 'continue' }); }
  async fallback() { this._finish({ type: 'fallback' }); }
  async abort() { this._finish({ type: 'abort' }); }
  async fetch() {
    const res = await this._origFetch(this._request.url(), { method: this._request.method(), headers: this._request.headers(), body: this._request.postData() ?? undefined });
    return new APIResponseImpl(res, await res.text());
  }
}

interface RouteEntry {
  matcher: (url: string) => boolean;
  pattern: unknown;
  handler: (route: RouteImpl, request: RequestImpl) => unknown;
  times?: number;
  used: number;
}

async function routeFetch(
  rt: Runtime,
  routes: RouteEntry[],
  win: Window & typeof globalThis,
  orig: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const isReq = typeof input === 'object' && 'url' in input && typeof (input as Request).method === 'string';
  const url = new URL(isReq ? (input as Request).url : String(input), win.location.href).href;
  const method = (init?.method ?? (isReq ? (input as Request).method : 'GET')).toUpperCase();
  const headers: Record<string, string> = {};
  new win.Headers(init?.headers ?? (isReq ? (input as Request).headers : undefined)).forEach((v, k) => (headers[k] = v));
  const body = typeof init?.body === 'string' ? init.body : null;
  const request = new RequestImpl(url, method, headers, body);
  for (const r of [...routes].reverse()) {
    if (r.times !== undefined && r.used >= r.times) continue;
    if (!r.matcher(url)) continue;
    r.used++;
    const decision = await new Promise<RouteDecision>((resolve) => {
      const route = new RouteImpl(request, win, orig, resolve);
      Promise.resolve()
        .then(() => r.handler(route, request))
        .catch((e) => {
          rt.asyncError(e);
          resolve({ type: 'abort' });
        });
    });
    rt.note(`Route ${fmtValue(typeof r.pattern === 'string' ? r.pattern : String(r.pattern))} → ${decision.type} ${url}`);
    if (decision.type === 'fulfill') return decision.response;
    if (decision.type === 'abort') throw new win.TypeError('Failed to fetch');
    if (decision.type === 'fallback') continue;
    return orig(input, init);
  }
  return orig(input, init);
}

// ---------------------------------------------------------------- Locator

type ActionChecks = { visible?: boolean; enabled?: boolean; editable?: boolean; hit?: boolean };

export class LocatorImpl {
  constructor(public _page: PageImpl, public _steps: Step[]) {}

  toString() {
    return stepsToString(this._steps);
  }

  private _rt() {
    return this._page._rt;
  }

  private _derive(step: Step, api?: string) {
    if (api) this._rt().count(api);
    return new LocatorImpl(this._page, [...this._steps, step]);
  }

  // ----- locators
  locator(selector: string | LocatorImpl, options?: FilterOptions & { has?: LocatorImpl; hasNot?: LocatorImpl }) {
    this._rt().count('locator');
    const steps: Step[] = typeof selector === 'string' ? [{ kind: 'css', selector }] : [...selector._steps];
    let loc = new LocatorImpl(this._page, [...this._steps, ...steps]);
    if (options) loc = loc.filter(options);
    return loc;
  }
  getByRole(role: string, options: RoleOptions = {}) { return this._derive({ kind: 'role', role, options: { ...options } }, 'getByRole'); }
  getByText(text: TextValue, options: { exact?: boolean } = {}) { return this._derive({ kind: 'text', value: text, exact: options.exact }, 'getByText'); }
  getByLabel(text: TextValue, options: { exact?: boolean } = {}) { return this._derive({ kind: 'label', value: text, exact: options.exact }, 'getByLabel'); }
  getByPlaceholder(text: TextValue, options: { exact?: boolean } = {}) { return this._derive({ kind: 'placeholder', value: text, exact: options.exact }, 'getByPlaceholder'); }
  getByAltText(text: TextValue, options: { exact?: boolean } = {}) { return this._derive({ kind: 'alt', value: text, exact: options.exact }, 'getByAltText'); }
  getByTitle(text: TextValue, options: { exact?: boolean } = {}) { return this._derive({ kind: 'title', value: text, exact: options.exact }, 'getByTitle'); }
  getByTestId(testId: TextValue) { return this._derive({ kind: 'testid', value: testId }, 'getByTestId'); }
  first() { return this._derive({ kind: 'nth', index: 0 }, 'first'); }
  last() { return this._derive({ kind: 'nth', index: -1 }, 'last'); }
  nth(index: number) { return this._derive({ kind: 'nth', index }, 'nth'); }
  filter(options: FilterOptions & { has?: LocatorImpl; hasNot?: LocatorImpl } = {}) {
    const o: FilterOptions = { ...options };
    if (options.has) o.has = { _steps: options.has._steps };
    if (options.hasNot) o.hasNot = { _steps: options.hasNot._steps };
    return this._derive({ kind: 'filter', options: o }, 'filter');
  }
  and(other: LocatorImpl) { return this._derive({ kind: 'and', other: other._steps }, 'and'); }
  or(other: LocatorImpl) { return this._derive({ kind: 'or', other: other._steps }, 'or'); }
  contentFrame() {
    this._rt().count('contentFrame');
    return new FrameLocatorImpl(this._page, [...this._steps, { kind: 'frame' }]);
  }
  frameLocator(selector: string) {
    this._rt().count('frameLocator');
    return new FrameLocatorImpl(this._page, [...this._steps, { kind: 'css', selector }, { kind: 'frame' }]);
  }
  page() { return this._page; }

  // ----- resolution helpers
  _resolve(): Element[] {
    const doc = this._page._doc();
    if (!doc) return [];
    return resolveSteps(this._steps, doc);
  }

  _strictError(els: Element[]) {
    const lines = els.slice(0, 10).map((e, i) => {
      let aka = '';
      try {
        aka = ` aka ${generateLocator(e, e.ownerDocument)}`;
      } catch {
        /* ignore */
      }
      return `    ${i + 1}) ${describeElement(e)}${aka}`;
    });
    const more = els.length > 10 ? `\n    ...and ${els.length - 10} more` : '';
    return new LabError(`strict mode violation: ${this} resolved to ${els.length} elements:\n${lines.join('\n')}${more}\n\nTip: make the locator more specific, or use .first(), .last(), .nth() or .filter().`);
  }

  /** Waits for exactly one element (strict mode). */
  async _one(apiName: string, timeout?: number): Promise<Element> {
    return this._waitActionable(apiName, { timeout }, {});
  }

  async _waitActionable(apiName: string, opts: { timeout?: number; force?: boolean; trial?: boolean }, checks: ActionChecks): Promise<Element> {
    const page = this._page;
    const rt = this._rt();
    const timeout = opts.timeout ?? rt.actionTimeout;
    const deadline = Date.now() + timeout;
    const log: string[] = [`waiting for ${this}`];
    const note = (s: string) => {
      if (!log.includes(s)) log.push(s);
    };
    for (;;) {
      page._assertOpen();
      await page._runLocatorHandlers();
      const els = this._resolve();
      if (els.length > 1) throw this._strictError(els);
      if (els.length === 1) {
        const el = els[0];
        note(`locator resolved to ${describeElement(el)}`);
        if (opts.force) return el;
        if (checks.visible && !isVisible(el)) note('element is not visible');
        else if (checks.enabled && isDisabled(el)) note('element is not enabled');
        else if (checks.editable && !isEditable(el)) note('element is not editable');
        else if (checks.hit) {
          scrollIntoViewIfNeeded(el);
          const res = hitTarget(el);
          if (res.ok) return el;
          note(`${describeElement(res.hit)} intercepts pointer events`);
        } else return el;
      }
      if (Date.now() >= deadline) {
        throw new TimeoutError(`locator.${apiName}: Timeout ${timeout}ms exceeded.\nCall log:\n${log.map((l) => `  - ${l}`).join('\n')}`);
      }
      await rt.sleep(100, page);
    }
  }

  private _action<T>(api: string, title: string, fn: () => Promise<T>): Promise<T> {
    return this._rt().step(this._page, title, 'action', fn, { api, slow: true });
  }

  // ----- actions
  click(options: ClickOptions & { timeout?: number; force?: boolean; trial?: boolean } = {}) {
    return this._action('click', `Click ${this}`, async () => {
      const el = await this._waitActionable('click', options, { visible: true, enabled: true, hit: true });
      this._page._highlight(el, 'click');
      if (options.trial) return;
      click(this._page._input, el, options);
      await this._page._afterAction();
    });
  }
  dblclick(options: { timeout?: number; force?: boolean } = {}) {
    return this._action('dblclick', `Double click ${this}`, async () => {
      const el = await this._waitActionable('dblclick', options, { visible: true, enabled: true, hit: true });
      this._page._highlight(el, 'dblclick');
      click(this._page._input, el, { clickCount: 2 });
      await this._page._afterAction();
    });
  }
  hover(options: { timeout?: number; force?: boolean } = {}) {
    return this._action('hover', `Hover ${this}`, async () => {
      const el = await this._waitActionable('hover', options, { visible: true, hit: true });
      this._page._highlight(el, 'hover');
      moveMouseTo(this._page._input, el);
    });
  }
  tap(options: { timeout?: number } = {}) {
    return this.click(options);
  }
  fill(value: string, options: { timeout?: number; force?: boolean } = {}) {
    return this._action('fill', `Fill ${fmtValue(String(value))} ${this}`, async () => {
      if (typeof value !== 'string') throw new LabError(`locator.fill: value: expected string, got ${typeof value}`);
      const el = await this._waitActionable('fill', options, { visible: true, enabled: true, editable: true });
      scrollIntoViewIfNeeded(el);
      this._page._highlight(el, 'fill');
      fill(this._page._input, el, value);
    });
  }
  clear(options: { timeout?: number } = {}) {
    return this._action('clear', `Clear ${this}`, async () => {
      const el = await this._waitActionable('clear', options, { visible: true, enabled: true, editable: true });
      this._page._highlight(el, 'clear');
      fill(this._page._input, el, '');
    });
  }
  pressSequentially(text: string, options: { delay?: number; timeout?: number } = {}) {
    return this._action('pressSequentially', `Type ${fmtValue(text)} ${this}`, async () => {
      const el = await this._waitActionable('pressSequentially', options, { visible: true });
      this._page._highlight(el, 'type');
      (el as HTMLElement).focus();
      for (const ch of text) {
        typeText(this._page._input, el, ch);
        if (options.delay) await this._rt().sleep(options.delay, this._page);
      }
    });
  }
  type(text: string, options: { delay?: number; timeout?: number } = {}) {
    return this.pressSequentially(text, options);
  }
  press(key: string, options: { timeout?: number } = {}) {
    return this._action('press', `Press ${fmtValue(key)} ${this}`, async () => {
      const el = await this._waitActionable('press', options, {});
      this._page._highlight(el, `press ${key}`);
      if (deepActiveElement(el.ownerDocument) !== el) (el as HTMLElement).focus();
      press(this._page._input, el, key);
      await this._page._afterAction();
    });
  }
  focus(options: { timeout?: number } = {}) {
    return this._action('focus', `Focus ${this}`, async () => {
      const el = await this._waitActionable('focus', options, {});
      flushChange(this._page._input, el);
      (el as HTMLElement).focus();
    });
  }
  blur(options: { timeout?: number } = {}) {
    return this._action('blur', `Blur ${this}`, async () => {
      const el = await this._waitActionable('blur', options, {});
      flushChange(this._page._input);
      (el as HTMLElement).blur();
    });
  }
  private _setChecked(api: string, checked: boolean, options: { timeout?: number; force?: boolean }) {
    return this._action(api, `${checked ? 'Check' : 'Uncheck'} ${this}`, async () => {
      const el = await this._waitActionable(api, options, { visible: true, enabled: true, hit: true });
      const state = isChecked(el);
      if (state === null) throw new LabError(`locator.${api}: Not a checkbox or radio button`);
      if (state === checked) return;
      if (!checked && (el.getAttribute('type') === 'radio' || el.getAttribute('role') === 'radio')) {
        throw new LabError(`locator.${api}: Cannot uncheck radio button`);
      }
      this._page._highlight(el, api);
      click(this._page._input, el);
      if (isChecked(el) !== checked) throw new LabError(`locator.${api}: Clicking the checkbox did not change its state`);
    });
  }
  check(options: { timeout?: number; force?: boolean } = {}) { return this._setChecked('check', true, options); }
  uncheck(options: { timeout?: number; force?: boolean } = {}) { return this._setChecked('uncheck', false, options); }
  setChecked(checked: boolean, options: { timeout?: number; force?: boolean } = {}) {
    return this._setChecked(checked ? 'check' : 'uncheck', checked, options);
  }
  selectOption(values: string | SelectValue | (string | SelectValue)[] | null, options: { timeout?: number } = {}) {
    const list = values === null ? [] : Array.isArray(values) ? values : [values];
    return this._action('selectOption', `Select option ${list.map((v) => fmtValue(typeof v === 'string' ? v : JSON.stringify(v))).join(', ')} ${this}`, async () => {
      const timeout = options.timeout ?? this._rt().actionTimeout;
      const deadline = Date.now() + timeout;
      for (;;) {
        const el = await this._waitActionable('selectOption', { timeout: Math.max(1, deadline - Date.now()) }, { visible: true, enabled: true });
        this._page._highlight(el, 'select');
        const result = selectOptions(el, list);
        if (result) return result;
        if (Date.now() >= deadline) {
          throw new TimeoutError(`locator.selectOption: Timeout ${timeout}ms exceeded.\nCall log:\n  - waiting for ${this}\n  - did not find some options: ${list.map((v) => fmtValue(typeof v === 'string' ? v : JSON.stringify(v))).join(', ')}`);
        }
        await this._rt().sleep(100, this._page);
      }
    });
  }
  setInputFiles(files: FilePayload | FilePayload[] | string | string[], options: { timeout?: number } = {}) {
    const list = (Array.isArray(files) ? files : [files]) as FilePayload[];
    return this._action('setInputFiles', `Set input files ${this}`, async () => {
      const el = await this._waitActionable('setInputFiles', options, {});
      this._page._highlight(el, 'upload');
      setFiles(el, list);
    });
  }
  dragTo(target: LocatorImpl, options: { timeout?: number } = {}) {
    return this._action('dragTo', `Drag ${this} to ${target}`, async () => {
      const src = await this._waitActionable('dragTo', options, { visible: true, hit: true });
      const dst = await target._waitActionable('dragTo', options, { visible: true });
      this._page._highlight(dst, 'drop');
      dragAndDrop(this._page._input, src, dst);
    });
  }
  scrollIntoViewIfNeeded(options: { timeout?: number } = {}) {
    return this._action('scrollIntoViewIfNeeded', `Scroll into view ${this}`, async () => {
      const el = await this._waitActionable('scrollIntoViewIfNeeded', options, { visible: true });
      scrollIntoViewIfNeeded(el);
    });
  }
  highlight() {
    return this._action('highlight', `Highlight ${this}`, async () => {
      const el = await this._one('highlight');
      this._page._highlight(el, 'highlight');
    });
  }
  waitFor(options: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number } = {}) {
    const state = options.state ?? 'visible';
    return this._rt().step(this._page, `Wait for ${this} to be ${state}`, 'action', async () => {
      const timeout = options.timeout ?? this._rt().actionTimeout;
      const deadline = Date.now() + timeout;
      for (;;) {
        this._page._assertOpen();
        await this._page._runLocatorHandlers();
        const els = this._resolve();
        if (els.length > 1 && (state === 'visible' || state === 'attached')) throw this._strictError(els);
        const el = els[0];
        const ok =
          state === 'attached' ? !!el
          : state === 'detached' ? !el
          : state === 'visible' ? !!el && isVisible(el)
          : !el || !isVisible(el);
        if (ok) return;
        if (Date.now() >= deadline) throw new TimeoutError(`locator.waitFor: Timeout ${timeout}ms exceeded.\nCall log:\n  - waiting for ${this} to be ${state}`);
        await this._rt().sleep(100, this._page);
      }
    }, { api: 'waitFor' });
  }

  // ----- queries
  private _query<T>(api: string, fn: (el: Element) => T, options: { timeout?: number } = {}) {
    return this._rt().step(this._page, `${api} ${this}`, 'action', async () => fn(await this._one(api, options.timeout)), { api });
  }
  textContent(options: { timeout?: number } = {}) { return this._query('textContent', (el) => el.textContent, options); }
  innerText(options: { timeout?: number } = {}) { return this._query('innerText', (el) => (el as HTMLElement).innerText, options); }
  innerHTML(options: { timeout?: number } = {}) { return this._query('innerHTML', (el) => el.innerHTML, options); }
  getAttribute(name: string, options: { timeout?: number } = {}) { return this._query('getAttribute', (el) => el.getAttribute(name), options); }
  inputValue(options: { timeout?: number } = {}) {
    return this._query('inputValue', (el) => {
      if (!['input', 'textarea', 'select'].includes(el.localName)) throw new LabError('locator.inputValue: Not an input element');
      return (el as HTMLInputElement).value;
    }, options);
  }
  isChecked(options: { timeout?: number } = {}) {
    return this._query('isChecked', (el) => {
      const s = isChecked(el);
      if (s === null) throw new LabError('locator.isChecked: Not a checkbox or radio button');
      return s === true;
    }, options);
  }
  isEnabled(options: { timeout?: number } = {}) { return this._query('isEnabled', (el) => !isDisabled(el), options); }
  isDisabled(options: { timeout?: number } = {}) { return this._query('isDisabled', (el) => isDisabled(el), options); }
  isEditable(options: { timeout?: number } = {}) { return this._query('isEditable', (el) => isEditable(el), options); }
  isVisible() {
    return this._rt().step(this._page, `isVisible ${this}`, 'action', async () => {
      const els = this._resolve();
      if (els.length > 1) throw this._strictError(els);
      return !!els[0] && isVisible(els[0]);
    }, { api: 'isVisible' });
  }
  isHidden() {
    return this._rt().step(this._page, `isHidden ${this}`, 'action', async () => {
      const els = this._resolve();
      if (els.length > 1) throw this._strictError(els);
      return !els[0] || !isVisible(els[0]);
    }, { api: 'isHidden' });
  }
  count() {
    return this._rt().step(this._page, `Count ${this}`, 'action', async () => this._resolve().length, { api: 'count' });
  }
  async all() {
    this._rt().count('all');
    const n = this._resolve().length;
    return Array.from({ length: n }, (_, i) => this.nth(i));
  }
  allTextContents() {
    return this._rt().step(this._page, `allTextContents ${this}`, 'action', async () => this._resolve().map((e) => e.textContent ?? ''), { api: 'allTextContents' });
  }
  allInnerTexts() {
    return this._rt().step(this._page, `allInnerTexts ${this}`, 'action', async () => this._resolve().map((e) => (e as HTMLElement).innerText ?? normalizeWhiteSpace(fullText(e))), { api: 'allInnerTexts' });
  }
  boundingBox(options: { timeout?: number } = {}) {
    return this._query('boundingBox', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, options);
  }
  evaluate(fn: ((el: Element, arg?: unknown) => unknown) | string, arg?: unknown, options: { timeout?: number } = {}) {
    return this._rt().step(this._page, `Evaluate ${this}`, 'action', async () => {
      const el = await this._one('evaluate', options.timeout);
      const win = el.ownerDocument.defaultView as Window & typeof globalThis;
      const f = win.eval(`(${String(fn)})`);
      return clone(await f(el, arg));
    }, { api: 'evaluate' });
  }
  evaluateAll(fn: ((els: Element[], arg?: unknown) => unknown) | string, arg?: unknown) {
    return this._rt().step(this._page, `Evaluate all ${this}`, 'action', async () => {
      const els = this._resolve();
      const win = this._page._win();
      const f = win.eval(`(${String(fn)})`);
      return clone(await f(els, arg));
    }, { api: 'evaluateAll' });
  }
  async screenshot() {
    this._rt().note('Screenshots are not available in Playwright Lab; locator.screenshot() did nothing.');
    return new Uint8Array();
  }
}

function clone<T>(v: T): T {
  try {
    return structuredClone(v);
  } catch {
    return v;
  }
}

function scrollIntoViewIfNeeded(el: Element) {
  const r = el.getBoundingClientRect();
  const win = el.ownerDocument.defaultView;
  if (!win) return;
  const inView = r.top >= 0 && r.left >= 0 && r.bottom <= win.innerHeight && r.right <= win.innerWidth;
  if (!inView) el.scrollIntoView({ block: 'center', inline: 'center' });
}

// ---------------------------------------------------------------- FrameLocator

export class FrameLocatorImpl {
  constructor(public _page: PageImpl, public _steps: Step[]) {}
  private _loc(step: Step, api: string) {
    this._page._rt.count(api);
    return new LocatorImpl(this._page, [...this._steps, step]);
  }
  locator(selector: string | LocatorImpl) {
    this._page._rt.count('locator');
    return new LocatorImpl(this._page, [...this._steps, ...(typeof selector === 'string' ? [{ kind: 'css', selector } as Step] : selector._steps)]);
  }
  getByRole(role: string, options: RoleOptions = {}) { return this._loc({ kind: 'role', role, options: { ...options } }, 'getByRole'); }
  getByText(text: TextValue, options: { exact?: boolean } = {}) { return this._loc({ kind: 'text', value: text, exact: options.exact }, 'getByText'); }
  getByLabel(text: TextValue, options: { exact?: boolean } = {}) { return this._loc({ kind: 'label', value: text, exact: options.exact }, 'getByLabel'); }
  getByPlaceholder(text: TextValue, options: { exact?: boolean } = {}) { return this._loc({ kind: 'placeholder', value: text, exact: options.exact }, 'getByPlaceholder'); }
  getByAltText(text: TextValue, options: { exact?: boolean } = {}) { return this._loc({ kind: 'alt', value: text, exact: options.exact }, 'getByAltText'); }
  getByTitle(text: TextValue, options: { exact?: boolean } = {}) { return this._loc({ kind: 'title', value: text, exact: options.exact }, 'getByTitle'); }
  getByTestId(testId: TextValue) { return this._loc({ kind: 'testid', value: testId }, 'getByTestId'); }
  frameLocator(selector: string) {
    return new FrameLocatorImpl(this._page, [...this._steps, { kind: 'css', selector }, { kind: 'frame' }]);
  }
  private _withIframeNth(index: number) {
    const steps = [...this._steps];
    steps.splice(steps.length - 1, 0, { kind: 'nth', index });
    return new FrameLocatorImpl(this._page, steps);
  }
  first() { return this._withIframeNth(0); }
  last() { return this._withIframeNth(-1); }
  nth(index: number) { return this._withIframeNth(index); }
  owner() { return new LocatorImpl(this._page, this._steps.slice(0, -1)); }
  toString() { return stepsToString(this._steps); }
}

// ---------------------------------------------------------------- Keyboard

class KeyboardImpl {
  constructor(private _page: PageImpl) {}
  private _target() {
    const doc = this._page._doc();
    if (!doc) throw new LabError('keyboard: page has no document');
    return deepActiveElement(doc) ?? doc.body;
  }
  press(key: string) {
    return this._page._rt.step(this._page, `Press ${fmtValue(key)}`, 'action', async () => {
      press(this._page._input, this._target(), key);
      await this._page._afterAction();
    }, { api: 'keyboard.press', slow: true });
  }
  type(text: string) {
    return this._page._rt.step(this._page, `Type ${fmtValue(text)}`, 'action', async () => {
      typeText(this._page._input, this._target(), text);
    }, { api: 'keyboard.type', slow: true });
  }
  insertText(text: string) {
    return this._page._rt.step(this._page, `Insert text ${fmtValue(text)}`, 'action', async () => {
      const t = this._target() as HTMLInputElement;
      if ('value' in t) {
        t.value += text;
        t.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, { api: 'keyboard.insertText' });
  }
  async down() { throw new LabError('keyboard.down() is not supported in Playwright Lab. Use keyboard.press() instead.'); }
  async up() { throw new LabError('keyboard.up() is not supported in Playwright Lab. Use keyboard.press() instead.'); }
}

// ---------------------------------------------------------------- Clock

function toMillis(t: unknown): number {
  if (t instanceof Date) return t.getTime();
  if (typeof t === 'number') return t;
  const d = new Date(String(t));
  if (Number.isNaN(d.getTime())) throw new LabError(`clock: invalid time ${JSON.stringify(t)}`);
  return d.getTime();
}

/** page.clock: replaces Date in the page so "now" is under the test's control. */
class ClockImpl {
  constructor(private _page: PageImpl) {}

  private _set(mode: 'fixed' | 'flow', time: unknown, title: string, api: string) {
    return this._page._rt.step(this._page, title, 'action', async () => {
      const t = toMillis(time);
      const src = `(function(){var R=window.__pwRealDate||Date;window.__pwRealDate=R;var mode=${JSON.stringify(mode)},t=${t},at=R.now();`
        + `var now=function(){return mode==='fixed'?t:t+(R.now()-at)};`
        + `function F(){if(!(this instanceof F))return new R(now()).toString();var a=Array.prototype.slice.call(arguments);if(!a.length)return new R(now());return new (Function.prototype.bind.apply(R,[null].concat(a)))()}`
        + `F.prototype=R.prototype;F.now=now;F.parse=R.parse;F.UTC=R.UTC;window.Date=F})();`;
      this._page._clockScript = src;
      try {
        (this._page._frame.contentWindow as (Window & { eval(s: string): unknown }) | null)?.eval(src);
      } catch {
        /* applied on the next navigation */
      }
    }, { api });
  }

  setFixedTime(time: number | string | Date) {
    return this._set('fixed', time, `Set fixed time ${new Date(toMillis(time)).toString().slice(0, 24)}`, 'clock.setFixedTime');
  }
  install(options: { time?: number | string | Date } = {}) {
    return this._set('flow', options.time ?? Date.now(), 'Install clock', 'clock.install');
  }
  setSystemTime(time: number | string | Date) {
    return this._set('flow', time, `Set system time ${new Date(toMillis(time)).toString().slice(0, 24)}`, 'clock.setSystemTime');
  }
}

// ---------------------------------------------------------------- Page

interface LocatorHandler {
  locator: LocatorImpl;
  handler: (l: LocatorImpl) => unknown;
  times?: number;
  noWaitAfter?: boolean;
  used: number;
}

let pageIds = 0;

export class PageImpl extends Emitter {
  _id = ++pageIds;
  _closed = false;
  _isPopup = false;
  _input: InputState = newInputState();
  _routes: RouteEntry[] = [];
  _initScripts: string[] = [];
  _locatorHandlers: LocatorHandler[] = [];
  _runningHandler = false;
  _loadCount = 0;
  _navigating = false;
  _clockScript: string | null = null;
  keyboard: KeyboardImpl;
  clock: ClockImpl = new ClockImpl(this);
  mouse = {
    click: async () => { throw new LabError('page.mouse is not supported in Playwright Lab. Use locator.click() instead.'); },
    move: async () => { throw new LabError('page.mouse is not supported in Playwright Lab. Use locator.hover() instead.'); },
  };

  constructor(public _rt: Runtime, public _context: ContextImpl, public _frame: HTMLIFrameElement) {
    super();
    this.keyboard = new KeyboardImpl(this);
    _frame.addEventListener('load', () => {
      this._loadCount++;
      this._navigating = false;
      this._input.hovered = null;
      this._input.pendingChange = null;
      this._emit(this._rt, 'load', this);
      this._rt.emit();
    });
  }

  // ----- internals
  _assertOpen() {
    if (this._closed || this._context._closed) throw new ClosedError();
    this._rt.assertNotAborted();
  }
  _doc(): Document | null {
    try {
      return this._frame.contentDocument;
    } catch {
      return null;
    }
  }
  _win(): Window & typeof globalThis {
    const w = this._frame.contentWindow;
    if (!w) throw new ClosedError();
    return w as Window & typeof globalThis;
  }
  _highlight(el: Element, label: string) {
    this._rt.highlight(this, el, label);
  }
  async _afterAction() {
    await this._rt.sleep(40, this);
    if (this._navigating) await this._waitForLoad(this._loadCount, this._rt.navigationTimeout, 'navigation');
  }
  async _waitForLoad(before: number, timeout: number, what: string) {
    const deadline = Date.now() + timeout;
    for (;;) {
      this._assertOpen();
      const doc = this._doc();
      if (this._loadCount > before && !this._navigating && doc && doc.readyState === 'complete') return;
      if (Date.now() >= deadline) throw new TimeoutError(`${what}: Timeout ${timeout}ms exceeded.`);
      await this._rt.sleep(30, this);
    }
  }
  async _runLocatorHandlers() {
    if (this._runningHandler || !this._locatorHandlers.length) return;
    for (const h of [...this._locatorHandlers]) {
      let visible = false;
      try {
        const els = h.locator._resolve();
        visible = !!els[0] && isVisible(els[0]);
      } catch {
        visible = false;
      }
      if (!visible) continue;
      this._runningHandler = true;
      try {
        await this._rt.step(this, `Locator handler for ${h.locator}`, 'step', async () => {
          await h.handler(h.locator);
          if (!h.noWaitAfter) {
            const deadline = Date.now() + this._rt.actionTimeout;
            while (Date.now() < deadline) {
              const els = h.locator._resolve();
              if (!els[0] || !isVisible(els[0])) break;
              await this._rt.sleep(100, this);
            }
          }
        }, { nest: true });
      } finally {
        this._runningHandler = false;
      }
      h.used++;
      if (h.times !== undefined && h.used >= h.times) this._locatorHandlers = this._locatorHandlers.filter((x) => x !== h);
    }
  }
  _onDialog(type: string, message: string, defaultValue: string): boolean | string | null | undefined {
    const dialog = new DialogImpl(this, type, message, defaultValue);
    const hasHandlers = this._hasListeners('dialog');
    this._emit(this._rt, 'dialog', dialog);
    let outcome: string;
    if (!hasHandlers) outcome = `auto-dismissed (no page.on('dialog') handler)`;
    else if (!dialog._handled) outcome = 'dismissed (the handler did not call accept() or dismiss() right away)';
    else outcome = dialog._accepted ? 'accepted' : 'dismissed';
    this._rt.note(`Dialog ${type} "${message}" ${outcome}`);
    if (type === 'alert') return undefined;
    if (type === 'confirm') return dialog._accepted;
    if (type === 'prompt') return dialog._accepted ? (dialog._promptText ?? defaultValue) : null;
    return undefined;
  }
  _fetch(win: Window & typeof globalThis, orig: typeof fetch, input: RequestInfo | URL, init?: RequestInit) {
    return routeFetch(this._rt, [...this._context._routes, ...this._routes], win, orig, input, init);
  }

  // ----- navigation
  goto(url: string, options: { timeout?: number; waitUntil?: string } = {}) {
    return this._rt.step(this, `Navigate to ${fmtValue(url)}`, 'action', async () => {
      if (typeof url !== 'string') throw new LabError('page.goto: url: expected string');
      let target = new URL(url, this._rt.baseURL).href;
      if (target.endsWith('/')) target += 'index.html';
      if (!target.startsWith(this._rt.baseURL) && !target.startsWith('about:')) {
        throw new LabError(`page.goto: ${fmtValue(url)} points outside the practice app (${target}).\nUse a path relative to baseURL, e.g. page.goto('index.html'). baseURL is ${this._rt.baseURL}`);
      }
      const before = this._loadCount;
      this._navigating = true;
      this._frame.src = target;
      await this._waitForLoad(before, options.timeout ?? this._rt.navigationTimeout, 'page.goto');
      return null;
    }, { api: 'goto', slow: true });
  }
  reload(options: { timeout?: number } = {}) {
    return this._rt.step(this, 'Reload', 'action', async () => {
      const before = this._loadCount;
      this._navigating = true;
      this._win().location.reload();
      await this._waitForLoad(before, options.timeout ?? this._rt.navigationTimeout, 'page.reload');
      return null;
    }, { api: 'reload', slow: true });
  }
  goBack(options: { timeout?: number } = {}) {
    return this._rt.step(this, 'Go back', 'action', async () => {
      const before = this._loadCount;
      this._win().history.back();
      await this._rt.sleep(50, this);
      if (this._loadCount > before || this._navigating) await this._waitForLoad(before, options.timeout ?? this._rt.navigationTimeout, 'page.goBack');
      return null;
    }, { api: 'goBack' });
  }
  goForward(options: { timeout?: number } = {}) {
    return this._rt.step(this, 'Go forward', 'action', async () => {
      const before = this._loadCount;
      this._win().history.forward();
      await this._rt.sleep(50, this);
      if (this._loadCount > before || this._navigating) await this._waitForLoad(before, options.timeout ?? this._rt.navigationTimeout, 'page.goForward');
      return null;
    }, { api: 'goForward' });
  }
  url() {
    try {
      return this._frame.contentWindow?.location.href ?? '';
    } catch {
      return '';
    }
  }
  async title() {
    return this._doc()?.title ?? '';
  }
  async content() {
    return this._doc()?.documentElement.outerHTML ?? '';
  }
  waitForURL(url: string | RegExp | ((u: URL) => boolean), options: { timeout?: number } = {}) {
    return this._rt.step(this, `Wait for URL ${typeof url === 'function' ? 'predicate' : fmtValue(url)}`, 'action', async () => {
      const match = urlMatcher(url, this._rt.baseURL);
      const timeout = options.timeout ?? this._rt.navigationTimeout;
      const deadline = Date.now() + timeout;
      for (;;) {
        this._assertOpen();
        const doc = this._doc();
        if (match(this.url()) && !this._navigating && doc?.readyState === 'complete') return;
        if (Date.now() >= deadline) throw new TimeoutError(`page.waitForURL: Timeout ${timeout}ms exceeded.\n  waiting for navigation to ${typeof url === 'function' ? 'match predicate' : fmtValue(url)}\n  current URL: ${this.url()}`);
        await this._rt.sleep(50, this);
      }
    }, { api: 'waitForURL' });
  }
  waitForLoadState(_state?: string, options: { timeout?: number } = {}) {
    return this._rt.step(this, 'Wait for load state', 'action', async () => {
      const deadline = Date.now() + (options.timeout ?? this._rt.navigationTimeout);
      while (this._navigating || this._doc()?.readyState !== 'complete') {
        if (Date.now() >= deadline) throw new TimeoutError('page.waitForLoadState: Timeout exceeded.');
        await this._rt.sleep(30, this);
      }
    }, { api: 'waitForLoadState' });
  }
  waitForTimeout(ms: number) {
    return this._rt.step(this, `Wait for timeout ${ms}ms`, 'action', () => this._rt.sleep(ms, this), { api: 'waitForTimeout' });
  }
  waitForSelector(selector: string, options: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number } = {}) {
    return this.locator(selector).waitFor(options);
  }
  waitForFunction(fn: string | ((arg?: unknown) => unknown), arg?: unknown, options: { timeout?: number; polling?: number } = {}) {
    return this._rt.step(this, 'Wait for function', 'action', async () => {
      const deadline = Date.now() + (options.timeout ?? this._rt.actionTimeout);
      for (;;) {
        this._assertOpen();
        try {
          const win = this._win();
          const v = typeof fn === 'string' ? win.eval(fn) : await win.eval(`(${String(fn)})`)(arg);
          if (v) return v;
        } catch {
          /* page may be navigating */
        }
        if (Date.now() >= deadline) throw new TimeoutError('page.waitForFunction: Timeout exceeded.');
        await this._rt.sleep(options.polling ?? 100, this);
      }
    }, { api: 'waitForFunction' });
  }

  // ----- locators
  private _loc(step: Step, api: string) {
    this._rt.count(api);
    return new LocatorImpl(this, [step]);
  }
  locator(selector: string, options?: FilterOptions & { has?: LocatorImpl; hasNot?: LocatorImpl }) {
    const l = this._loc({ kind: 'css', selector }, 'locator');
    return options ? l.filter(options) : l;
  }
  getByRole(role: string, options: RoleOptions = {}) { return this._loc({ kind: 'role', role, options: { ...options } }, 'getByRole'); }
  getByText(text: TextValue, options: { exact?: boolean } = {}) { return this._loc({ kind: 'text', value: text, exact: options.exact }, 'getByText'); }
  getByLabel(text: TextValue, options: { exact?: boolean } = {}) { return this._loc({ kind: 'label', value: text, exact: options.exact }, 'getByLabel'); }
  getByPlaceholder(text: TextValue, options: { exact?: boolean } = {}) { return this._loc({ kind: 'placeholder', value: text, exact: options.exact }, 'getByPlaceholder'); }
  getByAltText(text: TextValue, options: { exact?: boolean } = {}) { return this._loc({ kind: 'alt', value: text, exact: options.exact }, 'getByAltText'); }
  getByTitle(text: TextValue, options: { exact?: boolean } = {}) { return this._loc({ kind: 'title', value: text, exact: options.exact }, 'getByTitle'); }
  getByTestId(testId: TextValue) { return this._loc({ kind: 'testid', value: testId }, 'getByTestId'); }
  frameLocator(selector: string) {
    this._rt.count('frameLocator');
    return new FrameLocatorImpl(this, [{ kind: 'css', selector }, { kind: 'frame' }]);
  }

  // ----- shortcuts (discouraged in modern Playwright, but common in tutorials)
  click(selector: string, options?: ClickOptions & { timeout?: number }) { return this.locator(selector).click(options); }
  fill(selector: string, value: string, options?: { timeout?: number }) { return this.locator(selector).fill(value, options); }
  type(selector: string, text: string) { return this.locator(selector).pressSequentially(text); }
  press(selector: string, key: string) { return this.locator(selector).press(key); }
  check(selector: string) { return this.locator(selector).check(); }
  uncheck(selector: string) { return this.locator(selector).uncheck(); }
  hover(selector: string) { return this.locator(selector).hover(); }
  selectOption(selector: string, values: string | string[]) { return this.locator(selector).selectOption(values); }
  textContent(selector: string) { return this.locator(selector).textContent(); }
  innerText(selector: string) { return this.locator(selector).innerText(); }
  inputValue(selector: string) { return this.locator(selector).inputValue(); }
  isVisible(selector: string) { return this.locator(selector).isVisible(); }

  // ----- events
  on(event: string, listener: Listener) {
    this._rt.count('on');
    this._add(event, listener);
    return this;
  }
  addListener(event: string, listener: Listener) { return this.on(event, listener); }
  once(event: string, listener: Listener) {
    this._rt.count('once');
    const wrapper: Listener = (arg) => {
      this._listeners.get(event)?.delete(wrapper);
      return listener(arg);
    };
    this._add(event, wrapper);
    return this;
  }
  off(event: string, listener: Listener) {
    this._listeners.get(event)?.delete(listener);
    return this;
  }
  removeListener(event: string, listener: Listener) { return this.off(event, listener); }
  removeAllListeners(event?: string) {
    if (event) this._listeners.delete(event);
    else this._listeners.clear();
    return this;
  }
  waitForEvent(event: string, optionsOrPredicate?: unknown) {
    return this._rt.step(this, `Wait for event "${event}"`, 'action', () => this._waitFor(this._rt, this, event, optionsOrPredicate, this._rt.actionTimeout), { api: 'waitForEvent' });
  }
  waitForRequest(url: string | RegExp | ((r: RequestImpl) => boolean)) {
    void url;
    return Promise.reject(new LabError('page.waitForRequest() is not supported in Playwright Lab. Use page.route() to observe requests.'));
  }
  waitForResponse(url: string | RegExp) {
    void url;
    return Promise.reject(new LabError('page.waitForResponse() is not supported in Playwright Lab. Use page.route() to observe requests.'));
  }

  // ----- network & scripts
  route(url: unknown, handler: (route: RouteImpl, request: RequestImpl) => unknown, options: { times?: number } = {}) {
    return this._rt.step(this, `Route ${typeof url === 'string' ? fmtValue(url) : String(url)}`, 'action', async () => {
      this._routes.push({ matcher: urlMatcher(url, this._rt.baseURL), pattern: url, handler, times: options.times, used: 0 });
    }, { api: 'route' });
  }
  unroute(url: unknown, handler?: unknown) {
    return this._rt.step(this, `Unroute ${typeof url === 'string' ? fmtValue(url) : String(url)}`, 'action', async () => {
      this._routes = this._routes.filter((r) => !(String(r.pattern) === String(url) && (!handler || r.handler === handler)));
    }, { api: 'unroute' });
  }
  async unrouteAll() {
    this._routes = [];
  }
  evaluate(fn: string | ((arg?: any) => unknown), arg?: unknown) {
    return this._rt.step(this, 'Evaluate', 'action', async () => {
      const win = this._win();
      if (typeof fn === 'string') return clone(await win.eval(fn));
      return clone(await win.eval(`(${String(fn)})`)(arg));
    }, { api: 'evaluate' });
  }
  addInitScript(script: string | ((arg?: any) => unknown) | { content?: string; path?: string }, arg?: unknown) {
    return this._rt.step(this, 'Add init script', 'action', async () => {
      this._initScripts.push(initScriptSource(script, arg));
    }, { api: 'addInitScript' });
  }
  addLocatorHandler(locator: LocatorImpl, handler: (l: LocatorImpl) => unknown, options: { times?: number; noWaitAfter?: boolean } = {}) {
    return this._rt.step(this, `Add locator handler for ${locator}`, 'action', async () => {
      this._locatorHandlers.push({ locator, handler, times: options.times, noWaitAfter: options.noWaitAfter, used: 0 });
    }, { api: 'addLocatorHandler' });
  }
  async removeLocatorHandler(locator: LocatorImpl) {
    this._locatorHandlers = this._locatorHandlers.filter((h) => h.locator !== locator);
  }

  // ----- misc
  context() { return this._context; }
  async setViewportSize(size: { width: number; height: number }) {
    this._rt.setViewport(size);
  }
  viewportSize() { return { ...this._rt.viewport }; }
  async bringToFront() { this._rt.activate(this); }
  async close() {
    if (this._closed) return;
    this._closed = true;
    this._rt.removePage(this);
    this._emit(this._rt, 'close', this);
  }
  isClosed() { return this._closed; }
  async screenshot() {
    this._rt.note('Screenshots are not available in Playwright Lab; page.screenshot() did nothing.');
    return new Uint8Array();
  }
  async pause() {
    this._rt.note('page.pause() is not available in Playwright Lab. Use slow motion in the toolbar to watch your test.');
  }
  async opener() { return null; }
}

export function initScriptSource(script: unknown, arg?: unknown): string {
  if (typeof script === 'function') return `(${String(script)})(${arg === undefined ? '' : JSON.stringify(arg)});`;
  if (typeof script === 'string') return script;
  const o = script as { content?: string; path?: string };
  if (o?.path) throw new LabError('addInitScript({ path }) is not supported in Playwright Lab. Pass a function or { content } instead.');
  return o?.content ?? '';
}

// ---------------------------------------------------------------- BrowserContext

export class ContextImpl extends Emitter {
  _closed = false;
  _pages: PageImpl[] = [];
  _routes: RouteEntry[] = [];
  _initScripts: string[] = [];

  constructor(public _rt: Runtime) {
    super();
  }

  _assertOpen() {
    if (this._closed) throw new ClosedError();
    this._rt.assertNotAborted();
  }
  _addPage(page: PageImpl) {
    this._pages.push(page);
  }

  pages() { return this._pages.filter((p) => !p._closed); }
  newPage() {
    return this._rt.step(this, 'New page', 'action', async () => {
      const page = this._rt.createPage(this, true);
      this._emit(this._rt, 'page', page);
      return page;
    }, { api: 'newPage' });
  }
  on(event: string, listener: Listener) {
    this._rt.count('context.on');
    this._add(event, listener);
    return this;
  }
  waitForEvent(event: string, optionsOrPredicate?: unknown) {
    return this._rt.step(this, `Wait for event "${event}"`, 'action', () => this._waitFor(this._rt, this, event, optionsOrPredicate, this._rt.actionTimeout), { api: 'waitForEvent' });
  }
  route(url: unknown, handler: (route: RouteImpl, request: RequestImpl) => unknown, options: { times?: number } = {}) {
    return this._rt.step(this, `Route ${typeof url === 'string' ? fmtValue(url) : String(url)}`, 'action', async () => {
      this._routes.push({ matcher: urlMatcher(url, this._rt.baseURL), pattern: url, handler, times: options.times, used: 0 });
    }, { api: 'route' });
  }
  addInitScript(script: string | ((arg?: any) => unknown) | { content?: string }, arg?: unknown) {
    return this._rt.step(this, 'Add init script', 'action', async () => {
      this._initScripts.push(initScriptSource(script, arg));
    }, { api: 'addInitScript' });
  }
  async clearCookies() {}
  async cookies() { return []; }
  async addCookies() {
    this._rt.note('Cookies are not used by the practice app; context.addCookies() did nothing.');
  }
  async storageState() {
    const items = Object.keys(localStorage)
      .filter((k) => !k.startsWith('pwl.'))
      .map((name) => ({ name, value: localStorage.getItem(name) ?? '' }));
    return { cookies: [], origins: [{ origin: location.origin, localStorage: items }] };
  }
  async close() {
    for (const p of this.pages()) await p.close();
    this._closed = true;
  }
}

// ---------------------------------------------------------------- request fixture

export class RequestContextImpl {
  constructor(private _rt: Runtime, private _owner: ContextImpl) {}
  private _do(method: string, url: string, options: { data?: unknown; headers?: Record<string, string> } = {}) {
    return this._rt.step(this._owner, `${method} ${fmtValue(url)}`, 'action', async () => {
      const target = new URL(url, this._rt.baseURL).href;
      const headers = { ...(options.headers ?? {}) };
      let body: string | undefined;
      if (options.data !== undefined) {
        body = typeof options.data === 'string' ? options.data : JSON.stringify(options.data);
        if (typeof options.data !== 'string') headers['content-type'] = 'application/json';
      }
      const res = await fetch(target, { method, headers, body });
      return new APIResponseImpl(res, await res.text());
    }, { api: `request.${method.toLowerCase()}` });
  }
  get(url: string, options?: { headers?: Record<string, string> }) { return this._do('GET', url, options); }
  post(url: string, options?: { data?: unknown; headers?: Record<string, string> }) { return this._do('POST', url, options); }
  put(url: string, options?: { data?: unknown }) { return this._do('PUT', url, options); }
  delete(url: string, options?: { headers?: Record<string, string> }) { return this._do('DELETE', url, options); }
}
