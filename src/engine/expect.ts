import { LocatorImpl, PageImpl } from './api';
import {
  deepActiveElement, fullText, getAccessibleName, getRole, isChecked, isDisabled, isEditable, isVisible, normalizeWhiteSpace,
} from './dom';
import { LabError } from './errors';
import type { Runtime } from './runtime';
import { fmtValue, isRegExp, type TextValue } from './selectors';

interface Ctx {
  isNot: boolean;
  soft: boolean;
  message?: string;
  timeout?: number;
}

const NOT_FOUND = '<element(s) not found>';

function fmt(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (isRegExp(v)) return String(v);
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return '[Function]';
  try {
    const s = JSON.stringify(v, null, 2);
    return s.length > 600 ? s.slice(0, 600) + '…' : s;
  } catch {
    return String(v);
  }
}

class ExpectError extends LabError {
  constructor(message: string) {
    super(message);
    this.name = 'Error';
  }
}

export function createExpect(rt: Runtime) {
  const make = (actual: unknown, base: Omit<Ctx, 'isNot'>) => {
    const build = (isNot: boolean) => {
      const ctx: Ctx = { ...base, isNot };
      if (actual instanceof LocatorImpl) return locatorMatchers(rt, actual, ctx);
      if (actual instanceof PageImpl) return pageMatchers(rt, actual, ctx);
      return genericMatchers(rt, actual, ctx);
    };
    const pos = build(false) as Record<string, unknown>;
    pos.not = build(true);
    return pos;
  };
  const expect = (actual: unknown, message?: string | { message?: string }) =>
    make(actual, { soft: false, message: typeof message === 'string' ? message : message?.message });
  return Object.assign(expect, {
    soft: (actual: unknown, message?: string) => make(actual, { soft: true, message }),
    configure: (o: { soft?: boolean; timeout?: number }) => (actual: unknown, message?: string) =>
      make(actual, { soft: !!o.soft, timeout: o.timeout, message }),
    poll: (fn: () => unknown, o: { timeout?: number; message?: string } = {}) => pollMatchers(rt, fn, o),
  });
}

/** Wraps a matcher in a report step and handles soft assertions. */
function run(rt: Runtime, ctx: Ctx, owner: { _assertOpen(): void } | null, title: string, api: string, fn: () => Promise<void>) {
  const p = rt.step(owner, `Expect ${ctx.isNot ? 'not.' : ''}${api}${title ? ' ' + title : ''}`, 'expect', fn, { api });
  if (!ctx.soft) return p;
  return p.catch((e) => rt.softError(e));
}

// ---------------------------------------------------------------- locator matchers

type Check = { pass: boolean; received: string; expectedLabel?: string };

function locatorMatchers(rt: Runtime, loc: LocatorImpl, ctx: Ctx) {
  const page = loc._page;

  const poll = (name: string, args: string, expected: string | null, opts: { timeout?: number } | undefined, single: boolean, compute: (els: Element[]) => Check) =>
    run(rt, ctx, page, String(loc), name, async () => {
      const timeout = opts?.timeout ?? ctx.timeout ?? rt.expectTimeout;
      const deadline = Date.now() + timeout;
      let last: Check = { pass: false, received: NOT_FOUND };
      for (;;) {
        page._assertOpen();
        await page._runLocatorHandlers();
        const els = loc._resolve();
        if (single && els.length > 1) throw loc._strictError(els);
        last = compute(els);
        if (last.pass !== ctx.isNot) return;
        if (Date.now() >= deadline) break;
        await rt.sleep(100, page);
      }
      const lines = [
        ...(ctx.message ? [ctx.message, ''] : []),
        `expect(locator).${ctx.isNot ? 'not.' : ''}${name}(${args}) failed`,
        '',
        `Locator:  ${loc}`,
      ];
      if (expected !== null) lines.push(`Expected${ctx.isNot ? ' not' : ''}: ${expected}`);
      lines.push(`Received: ${last.received}`);
      lines.push(`Timeout:  ${timeout}ms`);
      throw new ExpectError(lines.join('\n'));
    });

  const one = (els: Element[]) => els[0] as Element | undefined;
  const text = (el: Element, useInnerText?: boolean) =>
    normalizeWhiteSpace(useInnerText ? (el as HTMLElement).innerText : fullText(el));

  const matchText = (actual: string, expected: TextValue, mode: 'full' | 'contain', ignoreCase?: boolean) => {
    if (isRegExp(expected)) {
      const re = ignoreCase && !expected.flags.includes('i') ? new RegExp(expected.source, expected.flags + 'i') : expected;
      re.lastIndex = 0;
      return re.test(actual);
    }
    let a = actual;
    let e = normalizeWhiteSpace(String(expected));
    if (ignoreCase) {
      a = a.toLowerCase();
      e = e.toLowerCase();
    }
    return mode === 'full' ? a === e : a.includes(e);
  };

  const textMatcher = (name: string, mode: 'full' | 'contain') =>
    (expected: TextValue | TextValue[], opts: { timeout?: number; useInnerText?: boolean; ignoreCase?: boolean } = {}) => {
      if (Array.isArray(expected)) {
        return poll(name, 'expected', fmt(expected.map((x) => (isRegExp(x) ? String(x) : x))), opts, false, (els) => {
          const texts = els.map((e) => text(e, opts.useInnerText));
          let pass: boolean;
          if (mode === 'full') pass = texts.length === expected.length && texts.every((t, i) => matchText(t, expected[i], 'full', opts.ignoreCase));
          else {
            let i = 0;
            for (const t of texts) if (i < expected.length && matchText(t, expected[i], 'contain', opts.ignoreCase)) i++;
            pass = i === expected.length;
          }
          return { pass, received: fmt(texts) };
        });
      }
      return poll(name, 'expected', fmt(expected), opts, true, (els) => {
        const el = one(els);
        if (!el) return { pass: false, received: NOT_FOUND };
        const t = text(el, opts.useInnerText);
        return { pass: matchText(t, expected, mode, opts.ignoreCase), received: fmt(t) };
      });
    };

  const state = (name: string, test: (el: Element) => boolean, describe: (ok: boolean) => string, absentPasses = false) =>
    (opts: { timeout?: number } = {}) =>
      poll(name, '', null, opts, true, (els) => {
        const el = one(els);
        if (!el) return { pass: absentPasses, received: NOT_FOUND };
        const ok = test(el);
        return { pass: ok, received: describe(ok) };
      });

  return {
    toBeVisible: (opts: { timeout?: number; visible?: boolean } = {}) =>
      poll('toBeVisible', '', null, opts, true, (els) => {
        const el = one(els);
        const want = opts.visible ?? true;
        if (!el) return { pass: !want, received: NOT_FOUND };
        const v = isVisible(el);
        return { pass: v === want, received: v ? 'visible' : 'hidden' };
      }),
    toBeHidden: state('toBeHidden', (el) => !isVisible(el), (ok) => (ok ? 'hidden' : 'visible'), true),
    toBeAttached: (opts: { timeout?: number; attached?: boolean } = {}) =>
      poll('toBeAttached', '', null, opts, true, (els) => {
        const want = opts.attached ?? true;
        return { pass: !!one(els) === want, received: one(els) ? 'attached' : 'detached' };
      }),
    toBeEnabled: state('toBeEnabled', (el) => !isDisabled(el), (ok) => (ok ? 'enabled' : 'disabled')),
    toBeDisabled: state('toBeDisabled', (el) => isDisabled(el), (ok) => (ok ? 'disabled' : 'enabled')),
    toBeEditable: state('toBeEditable', (el) => isEditable(el), (ok) => (ok ? 'editable' : 'not editable')),
    toBeFocused: state('toBeFocused', (el) => deepActiveElement(el.ownerDocument) === el, (ok) => (ok ? 'focused' : 'not focused')),
    toBeEmpty: state('toBeEmpty', (el) => (['input', 'textarea'].includes(el.localName) ? !(el as HTMLInputElement).value : !normalizeWhiteSpace(fullText(el))), (ok) => (ok ? 'empty' : 'not empty')),
    toBeChecked: (opts: { timeout?: number; checked?: boolean } = {}) =>
      poll('toBeChecked', '', null, opts, true, (els) => {
        const el = one(els);
        if (!el) return { pass: false, received: NOT_FOUND };
        const s = isChecked(el);
        if (s === null) throw new LabError('expect(locator).toBeChecked(): element is not a checkbox or radio button');
        const want = opts.checked ?? true;
        return { pass: (s === true) === want, received: s === true ? 'checked' : 'unchecked' };
      }),
    toHaveText: textMatcher('toHaveText', 'full'),
    toContainText: textMatcher('toContainText', 'contain'),
    toHaveValue: (expected: TextValue, opts: { timeout?: number } = {}) =>
      poll('toHaveValue', 'expected', fmt(expected), opts, true, (els) => {
        const el = one(els);
        if (!el) return { pass: false, received: NOT_FOUND };
        if (!['input', 'textarea', 'select'].includes(el.localName)) throw new LabError('expect(locator).toHaveValue(): not an input element');
        const v = (el as HTMLInputElement).value;
        const pass = isRegExp(expected) ? ((expected.lastIndex = 0), expected.test(v)) : v === expected;
        return { pass, received: fmt(v) };
      }),
    toHaveAttribute: (name: string, value?: TextValue | { timeout?: number }, opts: { timeout?: number } = {}) => {
      const hasValue = value !== undefined && (typeof value === 'string' || isRegExp(value));
      const o = hasValue ? opts : ((value as { timeout?: number }) ?? {});
      return poll('toHaveAttribute', hasValue ? `${fmtValue(name)}, expected` : fmtValue(name), hasValue ? fmt(value) : 'attribute present', o, true, (els) => {
        const el = one(els);
        if (!el) return { pass: false, received: NOT_FOUND };
        const a = el.getAttribute(name);
        if (!hasValue) return { pass: a !== null, received: a === null ? 'attribute missing' : fmt(a) };
        if (a === null) return { pass: false, received: 'attribute missing' };
        const v = value as TextValue;
        const pass = isRegExp(v) ? ((v.lastIndex = 0), v.test(a)) : a === v;
        return { pass, received: fmt(a) };
      });
    },
    toHaveClass: (expected: TextValue, opts: { timeout?: number } = {}) =>
      poll('toHaveClass', 'expected', fmt(expected), opts, true, (els) => {
        const el = one(els);
        if (!el) return { pass: false, received: NOT_FOUND };
        const c = normalizeWhiteSpace(el.getAttribute('class') ?? '');
        const pass = isRegExp(expected) ? ((expected.lastIndex = 0), expected.test(c)) : c === normalizeWhiteSpace(expected);
        return { pass, received: fmt(c) };
      }),
    toContainClass: (expected: string, opts: { timeout?: number } = {}) =>
      poll('toContainClass', 'expected', fmt(expected), opts, true, (els) => {
        const el = one(els);
        if (!el) return { pass: false, received: NOT_FOUND };
        const list = (el.getAttribute('class') ?? '').split(/\s+/);
        return { pass: expected.split(/\s+/).every((c) => list.includes(c)), received: fmt(el.getAttribute('class') ?? '') };
      }),
    toHaveId: (expected: TextValue, opts: { timeout?: number } = {}) =>
      poll('toHaveId', 'expected', fmt(expected), opts, true, (els) => {
        const el = one(els);
        if (!el) return { pass: false, received: NOT_FOUND };
        const pass = isRegExp(expected) ? expected.test(el.id) : el.id === expected;
        return { pass, received: fmt(el.id) };
      }),
    toHaveCSS: (prop: string, expected: TextValue, opts: { timeout?: number } = {}) =>
      poll('toHaveCSS', `${fmtValue(prop)}, expected`, fmt(expected), opts, true, (els) => {
        const el = one(els);
        if (!el) return { pass: false, received: NOT_FOUND };
        const v = el.ownerDocument.defaultView!.getComputedStyle(el).getPropertyValue(prop);
        const pass = isRegExp(expected) ? expected.test(v) : v === expected;
        return { pass, received: fmt(v) };
      }),
    toHaveCount: (expected: number, opts: { timeout?: number } = {}) =>
      poll('toHaveCount', 'expected', String(expected), opts, false, (els) => ({ pass: els.length === expected, received: String(els.length) })),
    toHaveAccessibleName: (expected: TextValue, opts: { timeout?: number } = {}) =>
      poll('toHaveAccessibleName', 'expected', fmt(expected), opts, true, (els) => {
        const el = one(els);
        if (!el) return { pass: false, received: NOT_FOUND };
        const n = getAccessibleName(el);
        const pass = isRegExp(expected) ? expected.test(n) : n === normalizeWhiteSpace(expected);
        return { pass, received: fmt(n) };
      }),
    toHaveRole: (expected: string, opts: { timeout?: number } = {}) =>
      poll('toHaveRole', 'expected', fmt(expected), opts, true, (els) => {
        const el = one(els);
        if (!el) return { pass: false, received: NOT_FOUND };
        const r = getRole(el);
        return { pass: r === expected, received: fmt(r) };
      }),
    toHaveScreenshot: () => Promise.reject(new LabError('toHaveScreenshot() is not available in Playwright Lab (no screenshots in the browser).')),
  };
}

// ---------------------------------------------------------------- page matchers

function pageMatchers(rt: Runtime, page: PageImpl, ctx: Ctx) {
  const poll = (name: string, expected: string, opts: { timeout?: number } | undefined, get: () => string, test: (v: string) => boolean) =>
    run(rt, ctx, page, '', name, async () => {
      const timeout = opts?.timeout ?? ctx.timeout ?? rt.expectTimeout;
      const deadline = Date.now() + timeout;
      let v = '';
      for (;;) {
        page._assertOpen();
        v = get();
        if (test(v) !== ctx.isNot) return;
        if (Date.now() >= deadline) break;
        await rt.sleep(100, page);
      }
      throw new ExpectError([
        ...(ctx.message ? [ctx.message, ''] : []),
        `expect(page).${ctx.isNot ? 'not.' : ''}${name}(expected) failed`,
        '',
        `Expected${ctx.isNot ? ' not' : ''}: ${expected}`,
        `Received: ${fmt(v)}`,
        `Timeout:  ${timeout}ms`,
      ].join('\n'));
    });
  return {
    toHaveURL: (expected: string | RegExp | ((u: URL) => boolean), opts: { timeout?: number } = {}) => {
      if (typeof expected === 'function') {
        return poll('toHaveURL', 'predicate', opts, () => page.url(), (v) => {
          try {
            return !!expected(new URL(v));
          } catch {
            return false;
          }
        });
      }
      if (isRegExp(expected)) return poll('toHaveURL', String(expected), opts, () => page.url(), (v) => ((expected.lastIndex = 0), expected.test(v)));
      const full = new URL(expected, rt.baseURL).href;
      return poll('toHaveURL', fmt(full), opts, () => page.url(), (v) => v === full);
    },
    toHaveTitle: (expected: TextValue, opts: { timeout?: number } = {}) =>
      poll('toHaveTitle', fmt(expected), opts, () => page._doc()?.title ?? '', (v) =>
        isRegExp(expected) ? ((expected.lastIndex = 0), expected.test(v)) : normalizeWhiteSpace(v) === normalizeWhiteSpace(expected)),
    toHaveScreenshot: () => Promise.reject(new LabError('toHaveScreenshot() is not available in Playwright Lab (no screenshots in the browser).')),
  };
}

// ---------------------------------------------------------------- generic (non-retrying) matchers

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (isRegExp(a) && isRegExp(b)) return String(a) === String(b);
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function matchesObject(actual: unknown, expected: unknown): boolean {
  if (typeof expected !== 'object' || expected === null) return deepEqual(actual, expected);
  if (typeof actual !== 'object' || actual === null) return false;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matchesObject(actual[i], e));
  return Object.entries(expected).every(([k, v]) => matchesObject((actual as Record<string, unknown>)[k], v));
}

function getPath(obj: unknown, path: string | string[]): { found: boolean; value: unknown } {
  const parts = Array.isArray(path) ? path : path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || !(p in Object(cur))) return { found: false, value: undefined };
    cur = (cur as Record<string, unknown>)[p];
  }
  return { found: true, value: cur };
}

type GenericCheck = { pass: boolean; expected?: string; received?: string; hint?: string };

function genericChecks(actual: unknown) {
  const num = (name: string) => {
    if (typeof actual !== 'number' && typeof actual !== 'bigint') throw new LabError(`expect(received).${name}(expected): received value must be a number, got ${fmt(actual)}`);
    return actual as number;
  };
  return {
    toBe: (e: unknown): GenericCheck => ({ pass: Object.is(actual, e), expected: fmt(e), received: fmt(actual), hint: '// Object.is equality' }),
    toEqual: (e: unknown): GenericCheck => ({ pass: deepEqual(actual, e), expected: fmt(e), received: fmt(actual), hint: '// deep equality' }),
    toStrictEqual: (e: unknown): GenericCheck => ({ pass: deepEqual(actual, e), expected: fmt(e), received: fmt(actual) }),
    toMatchObject: (e: unknown): GenericCheck => ({ pass: matchesObject(actual, e), expected: fmt(e), received: fmt(actual) }),
    toBeTruthy: (): GenericCheck => ({ pass: !!actual, received: fmt(actual) }),
    toBeFalsy: (): GenericCheck => ({ pass: !actual, received: fmt(actual) }),
    toBeNull: (): GenericCheck => ({ pass: actual === null, received: fmt(actual) }),
    toBeUndefined: (): GenericCheck => ({ pass: actual === undefined, received: fmt(actual) }),
    toBeDefined: (): GenericCheck => ({ pass: actual !== undefined, received: fmt(actual) }),
    toBeNaN: (): GenericCheck => ({ pass: Number.isNaN(actual), received: fmt(actual) }),
    toBeGreaterThan: (e: number): GenericCheck => ({ pass: num('toBeGreaterThan') > e, expected: `> ${e}`, received: fmt(actual) }),
    toBeGreaterThanOrEqual: (e: number): GenericCheck => ({ pass: num('toBeGreaterThanOrEqual') >= e, expected: `>= ${e}`, received: fmt(actual) }),
    toBeLessThan: (e: number): GenericCheck => ({ pass: num('toBeLessThan') < e, expected: `< ${e}`, received: fmt(actual) }),
    toBeLessThanOrEqual: (e: number): GenericCheck => ({ pass: num('toBeLessThanOrEqual') <= e, expected: `<= ${e}`, received: fmt(actual) }),
    toBeCloseTo: (e: number, digits = 2): GenericCheck => ({ pass: Math.abs(num('toBeCloseTo') - e) < 10 ** -digits / 2, expected: fmt(e), received: fmt(actual) }),
    toContain: (e: unknown): GenericCheck => {
      const pass = typeof actual === 'string' ? actual.includes(String(e)) : Array.isArray(actual) ? actual.includes(e) : false;
      return { pass, expected: fmt(e), received: fmt(actual) };
    },
    toContainEqual: (e: unknown): GenericCheck => ({ pass: Array.isArray(actual) && actual.some((x) => deepEqual(x, e)), expected: fmt(e), received: fmt(actual) }),
    toHaveLength: (e: number): GenericCheck => {
      const len = (actual as { length?: number })?.length;
      return { pass: len === e, expected: String(e), received: String(len) };
    },
    toMatch: (e: string | RegExp): GenericCheck => {
      const s = String(actual);
      const pass = isRegExp(e) ? ((e.lastIndex = 0), e.test(s)) : s.includes(e);
      return { pass, expected: fmt(e), received: fmt(actual) };
    },
    toHaveProperty: (path: string | string[], ...value: unknown[]): GenericCheck => {
      const { found, value: v } = getPath(actual, path);
      const pass = found && (value.length === 0 || deepEqual(v, value[0]));
      return { pass, expected: value.length ? `${fmt(path)} = ${fmt(value[0])}` : fmt(path), received: found ? fmt(v) : 'property not found' };
    },
    toBeInstanceOf: (cls: new (...a: unknown[]) => unknown): GenericCheck => ({ pass: actual instanceof cls, expected: cls?.name, received: fmt(actual) }),
    toThrow: (expected?: string | RegExp): GenericCheck => {
      if (typeof actual !== 'function') throw new LabError('expect(received).toThrow(): received value must be a function');
      try {
        (actual as () => unknown)();
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        const pass = expected === undefined || (isRegExp(expected) ? expected.test(msg) : msg.includes(expected));
        return { pass, expected: expected === undefined ? 'a thrown error' : fmt(expected), received: fmt(msg) };
      }
      return { pass: false, expected: 'a thrown error', received: 'function did not throw' };
    },
  };
}

function genericMatchers(rt: Runtime, actual: unknown, ctx: Ctx) {
  const checks = genericChecks(actual);
  const out: Record<string, (...args: unknown[]) => void> = {};
  for (const [name, check] of Object.entries(checks)) {
    // Synchronous, like real Playwright: `expect(value).toBe(x)` works without await.
    out[name] = (...args: unknown[]) => {
      try {
        rt.syncStep(`Expect ${ctx.isNot ? 'not.' : ''}${name}`, name, () => {
          const r = (check as (...a: unknown[]) => GenericCheck)(...args);
          if (r.pass !== ctx.isNot) return;
          throw new ExpectError([
            ...(ctx.message ? [ctx.message, ''] : []),
            `expect(received).${ctx.isNot ? 'not.' : ''}${name}(${r.expected !== undefined ? 'expected' : ''})${r.hint ? ' ' + r.hint : ''}`,
            '',
            ...(r.expected !== undefined ? [`Expected${ctx.isNot ? ': not' : ''}: ${r.expected}`] : []),
            `Received: ${r.received}`,
          ].join('\n'));
        });
      } catch (e) {
        if (!ctx.soft) throw e;
        rt.softError(e);
      }
    };
  }
  return out;
}

function pollMatchers(rt: Runtime, fn: () => unknown, o: { timeout?: number; message?: string }) {
  const build = (isNot: boolean) => {
    const out: Record<string, (...args: unknown[]) => Promise<void>> = {};
    for (const name of Object.keys(genericChecks(undefined))) {
      out[name] = (...args: unknown[]) =>
        rt.step(null, `Expect.poll ${isNot ? 'not.' : ''}${name}`, 'expect', async () => {
          const timeout = o.timeout ?? rt.expectTimeout;
          const deadline = Date.now() + timeout;
          let last: GenericCheck = { pass: false };
          for (;;) {
            const value = await fn();
            try {
              last = (genericChecks(value) as unknown as Record<string, (...a: unknown[]) => GenericCheck>)[name](...args);
            } catch (e) {
              last = { pass: false, received: (e as Error).message };
            }
            if (last.pass !== isNot) return;
            if (Date.now() >= deadline) break;
            await rt.sleep(100);
          }
          throw new ExpectError([
            ...(o.message ? [o.message, ''] : []),
            `expect.poll(received).${isNot ? 'not.' : ''}${name}(expected) failed`,
            '',
            ...(last.expected !== undefined ? [`Expected: ${last.expected}`] : []),
            `Received: ${last.received}`,
            `Timeout:  ${timeout}ms`,
          ].join('\n'));
        }, { api: name });
    }
    return out;
  };
  const pos = build(false) as Record<string, unknown>;
  pos.not = build(true);
  return pos;
}
