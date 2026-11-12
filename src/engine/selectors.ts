import {
  composedChildren, descendants, fullText, getAccessibleName, getRole, isAriaHidden, isChecked, isDisabled,
  isVisible, labelTexts, normalizeWhiteSpace,
} from './dom';
import { LabError } from './errors';

export type TextValue = string | RegExp;

export interface RoleOptions {
  name?: TextValue;
  exact?: boolean;
  checked?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  includeHidden?: boolean;
  level?: number;
  pressed?: boolean;
  selected?: boolean;
}

export interface FilterOptions {
  hasText?: TextValue;
  hasNotText?: TextValue;
  has?: { _steps: Step[] };
  hasNot?: { _steps: Step[] };
  visible?: boolean;
}

export type Step =
  | { kind: 'css'; selector: string }
  | { kind: 'role'; role: string; options: RoleOptions }
  | { kind: 'text' | 'label' | 'placeholder' | 'alt' | 'title'; value: TextValue; exact?: boolean }
  | { kind: 'testid'; value: TextValue }
  | { kind: 'nth'; index: number }
  | { kind: 'filter'; options: FilterOptions }
  | { kind: 'and' | 'or'; other: Step[] }
  | { kind: 'frame' };

// ---------------------------------------------------------------- text matching

export function isRegExp(v: unknown): v is RegExp {
  return Object.prototype.toString.call(v) === '[object RegExp]';
}

export function textMatcher(value: TextValue, exact?: boolean): (s: string) => boolean {
  if (isRegExp(value)) {
    return (s) => {
      value.lastIndex = 0;
      return value.test(normalizeWhiteSpace(s));
    };
  }
  const v = normalizeWhiteSpace(String(value));
  if (exact) return (s) => normalizeWhiteSpace(s) === v;
  const lower = v.toLowerCase();
  return (s) => normalizeWhiteSpace(s).toLowerCase().includes(lower);
}

// ---------------------------------------------------------------- resolution

type Scope = Document | Element | ShadowRoot;

export function resolveSteps(steps: Step[], root: Scope): Element[] {
  let scopes: Scope[] = [root];
  let current = null as Element[] | null;
  const cur = (): Element[] => current ?? [];

  for (const step of steps) {
    switch (step.kind) {
      case 'nth': {
        const list = cur();
        const i = step.index < 0 ? list.length + step.index : step.index;
        current = list[i] ? [list[i]] : [];
        break;
      }
      case 'filter':
        current = cur().filter((el) => filterMatches(el, step.options));
        break;
      case 'and': {
        const other = new Set(resolveSteps(step.other, root));
        current = cur().filter((e) => other.has(e));
        break;
      }
      case 'or': {
        const other = resolveSteps(step.other, root);
        const all = [...cur(), ...other];
        current = documentOrder(unique(all));
        break;
      }
      case 'frame': {
        const frames = cur().filter((e) => e.localName === 'iframe' || e.localName === 'frame');
        if (frames.length > 1) {
          throw new LabError(`strict mode violation: frame locator resolved to ${frames.length} iframes. Use .first(), .last() or .nth() before .contentFrame().`);
        }
        scopes = [];
        for (const f of frames) {
          try {
            const d = (f as HTMLIFrameElement).contentDocument;
            if (d && d.documentElement) scopes.push(d);
          } catch {
            /* cross-origin */
          }
        }
        current = null;
        break;
      }
      default: {
        const bases = current ?? scopes;
        const found: Element[] = [];
        for (const b of bases) found.push(...search(step, b));
        current = unique(found);
      }
    }
  }
  return current ?? [];
}

function unique(list: Element[]): Element[] {
  return [...new Set(list)];
}

function documentOrder(list: Element[]): Element[] {
  return list.sort((a, b) => {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    return pos & 4 ? -1 : pos & 2 ? 1 : 0;
  });
}

function search(step: Step, base: Scope): Element[] {
  const all = descendants(base);
  switch (step.kind) {
    case 'css':
      return cssSearch(step.selector, base, all);
    case 'role':
      return all.filter((el) => roleMatches(el, step.role, step.options));
    case 'text':
      return textSearch(all, textMatcher(step.value, step.exact));
    case 'label': {
      const m = textMatcher(step.value, step.exact);
      return all.filter((el) => labelTexts(el).some(m));
    }
    case 'placeholder': {
      const m = textMatcher(step.value, step.exact);
      return all.filter((el) => el.hasAttribute('placeholder') && m(el.getAttribute('placeholder')!));
    }
    case 'alt': {
      const m = textMatcher(step.value, step.exact);
      return all.filter((el) => el.hasAttribute('alt') && m(el.getAttribute('alt')!));
    }
    case 'title': {
      const m = textMatcher(step.value, step.exact);
      return all.filter((el) => el.hasAttribute('title') && m(el.getAttribute('title')!));
    }
    case 'testid': {
      const v = step.value;
      return all.filter((el) => {
        const id = el.getAttribute('data-testid');
        if (id === null) return false;
        if (isRegExp(v)) {
          v.lastIndex = 0;
          return v.test(id);
        }
        return id === v;
      });
    }
    default:
      return [];
  }
}

function cssSearch(selector: string, base: Scope, all: Element[]): Element[] {
  let sel = selector.trim();
  if (sel.startsWith('text=')) {
    const raw = sel.slice(5);
    const quoted = /^(["'])(.*)\1$/.exec(raw);
    return textSearch(all, textMatcher(quoted ? quoted[2] : raw, !!quoted));
  }
  if (sel.startsWith('//') || sel.startsWith('xpath=')) {
    const xp = sel.startsWith('xpath=') ? sel.slice(6) : sel;
    const doc = base.nodeType === 9 ? (base as Document) : (base as Element).ownerDocument;
    const ctx = base.nodeType === 11 ? (base as ShadowRoot).host : (base as Node);
    try {
      const res = doc.evaluate(xp.startsWith('/') && base.nodeType !== 9 ? '.' + xp : xp, ctx, null, 7, null);
      const out: Element[] = [];
      for (let i = 0; i < res.snapshotLength; i++) {
        const n = res.snapshotItem(i);
        if (n && n.nodeType === 1) out.push(n as Element);
      }
      return out;
    } catch {
      throw new LabError(`Invalid XPath selector: ${selector}`);
    }
  }
  sel = sel.replace(/^css=/, '');
  let visibleOnly = false;
  let hasText: string | null = null;
  const hasTextMatch = /:has-text\((["'])(.*?)\1\)/.exec(sel);
  if (hasTextMatch) {
    hasText = hasTextMatch[2];
    sel = sel.replace(hasTextMatch[0], '');
  }
  if (/:visible\b/.test(sel)) {
    visibleOnly = true;
    sel = sel.replace(/:visible\b/g, '');
  }
  if (!sel) sel = '*';
  try {
    let found = all.filter((el) => el.matches(sel));
    if (hasText !== null) {
      const m = textMatcher(hasText);
      found = found.filter((el) => m(fullText(el)));
    }
    if (visibleOnly) found = found.filter(isVisible);
    return found;
  } catch {
    throw new LabError(`Unexpected token in selector "${selector}". Is it a valid CSS selector?`);
  }
}

function textSearch(all: Element[], matches: (s: string) => boolean): Element[] {
  const memo = new Map<Element, string>();
  return all.filter((el) => {
    if (['script', 'style', 'head', 'title', 'noscript', 'template', 'html'].includes(el.localName)) return false;
    if (!matches(fullText(el, memo))) return false;
    return !composedChildren(el).some((c) => matches(fullText(c, memo)));
  });
}

function roleMatches(el: Element, role: string, o: RoleOptions): boolean {
  if (getRole(el) !== role) return false;
  if (!o.includeHidden && isAriaHidden(el)) return false;
  if (o.checked !== undefined && isChecked(el) !== o.checked) return false;
  if (o.disabled !== undefined && isDisabled(el) !== o.disabled) return false;
  if (o.expanded !== undefined && (el.getAttribute('aria-expanded') === 'true') !== o.expanded) return false;
  if (o.pressed !== undefined && (el.getAttribute('aria-pressed') === 'true') !== o.pressed) return false;
  if (o.selected !== undefined) {
    const sel = el.localName === 'option' ? (el as HTMLOptionElement).selected : el.getAttribute('aria-selected') === 'true';
    if (sel !== o.selected) return false;
  }
  if (o.level !== undefined) {
    const lvl = Number(el.getAttribute('aria-level')) || (/^h([1-6])$/.exec(el.localName)?.[1] ? Number(el.localName[1]) : NaN);
    if (lvl !== o.level) return false;
  }
  if (o.name !== undefined) {
    if (!textMatcher(o.name, o.exact)(getAccessibleName(el))) return false;
  }
  return true;
}

function filterMatches(el: Element, o: FilterOptions): boolean {
  if (o.hasText !== undefined && !textMatcher(o.hasText)(fullText(el))) return false;
  if (o.hasNotText !== undefined && textMatcher(o.hasNotText)(fullText(el))) return false;
  if (o.has && resolveSteps(o.has._steps, el).length === 0) return false;
  if (o.hasNot && resolveSteps(o.hasNot._steps, el).length > 0) return false;
  if (o.visible !== undefined && isVisible(el) !== o.visible) return false;
  return true;
}

// ---------------------------------------------------------------- toString (matches Playwright's output)

export function fmtValue(v: unknown): string {
  if (isRegExp(v)) return String(v);
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return String(v);
}

function fmtOptions(o: Record<string, unknown>): string {
  const entries = Object.entries(o).filter(([, v]) => v !== undefined);
  if (!entries.length) return '';
  return `{ ${entries.map(([k, v]) => `${k}: ${k === 'has' || k === 'hasNot' ? stepsToString((v as { _steps: Step[] })._steps) : fmtValue(v)}`).join(', ')} }`;
}

const STEP_METHOD = { text: 'getByText', label: 'getByLabel', placeholder: 'getByPlaceholder', alt: 'getByAltText', title: 'getByTitle' } as const;

export function stepsToString(steps: Step[]): string {
  const parts: string[] = [];
  for (const s of steps) {
    switch (s.kind) {
      case 'css': parts.push(`locator(${fmtValue(s.selector)})`); break;
      case 'role': {
        const o = fmtOptions(s.options as Record<string, unknown>);
        parts.push(`getByRole(${fmtValue(s.role)}${o ? ', ' + o : ''})`);
        break;
      }
      case 'testid': parts.push(`getByTestId(${fmtValue(s.value)})`); break;
      case 'nth': parts.push(s.index === 0 ? 'first()' : s.index === -1 ? 'last()' : `nth(${s.index})`); break;
      case 'filter': parts.push(`filter(${fmtOptions(s.options as Record<string, unknown>)})`); break;
      case 'and': parts.push(`and(${stepsToString(s.other)})`); break;
      case 'or': parts.push(`or(${stepsToString(s.other)})`); break;
      case 'frame': parts.push('contentFrame()'); break;
      default: parts.push(`${STEP_METHOD[s.kind]}(${fmtValue(s.value)}${s.exact ? ', { exact: true }' : ''})`);
    }
  }
  return parts.join('.');
}

// ---------------------------------------------------------------- locator generator (picker, "aka" hints)

const INTERACTIVE = new Set([
  'button', 'link', 'checkbox', 'radio', 'textbox', 'searchbox', 'combobox', 'listbox', 'option', 'slider',
  'spinbutton', 'tab', 'menuitem', 'switch', 'heading', 'img', 'dialog', 'row', 'cell', 'columnheader', 'alert',
]);

/** Picks the element a user most likely means when hovering `el` (e.g. the button around an icon). */
export function retarget(el: Element): Element {
  for (let e: Element | null = el, depth = 0; e && depth < 4; e = e.parentElement, depth++) {
    const role = getRole(e);
    if (role && INTERACTIVE.has(role) && role !== 'cell' && role !== 'row') return e;
    if (e.hasAttribute('data-testid')) return e;
  }
  return el;
}

export function generateLocator(el: Element, root: Document): string {
  const candidates: Step[][] = [];
  const role = getRole(el);
  const name = role ? getAccessibleName(el) : '';
  if (role && role !== 'presentation' && name && name.length <= 80) {
    candidates.push([{ kind: 'role', role, options: { name } }]);
    candidates.push([{ kind: 'role', role, options: { name, exact: true } }]);
  }
  const labels = labelTexts(el).map(normalizeWhiteSpace).filter((t) => t && t.length <= 60);
  for (const l of labels) {
    candidates.push([{ kind: 'label', value: l }]);
    candidates.push([{ kind: 'label', value: l, exact: true }]);
  }
  const ph = el.getAttribute('placeholder');
  if (ph) candidates.push([{ kind: 'placeholder', value: ph }]);
  const testid = el.getAttribute('data-testid');
  if (testid) candidates.push([{ kind: 'testid', value: testid }]);
  const alt = el.getAttribute('alt');
  if (alt) candidates.push([{ kind: 'alt', value: alt }]);
  const text = normalizeWhiteSpace(fullText(el));
  if (text && text.length <= 50) {
    candidates.push([{ kind: 'text', value: text }]);
    candidates.push([{ kind: 'text', value: text, exact: true }]);
  }
  if (role && role !== 'presentation') candidates.push([{ kind: 'role', role, options: {} }]);

  const results = candidates.map((steps) => {
    try {
      return { steps, found: resolveSteps(steps, root) };
    } catch {
      return { steps, found: [] as Element[] };
    }
  });
  for (const r of results) if (r.found.length === 1 && r.found[0] === el) return stepsToString(r.steps);
  // Repeated element (e.g. "Add to cart" in every card): scope it to its card or row.
  for (const r of results.slice(0, 3)) {
    if (!r.found.includes(el)) continue;
    const scoped = scopedSteps(el, root, r.steps);
    if (scoped) return stepsToString(scoped);
  }
  for (const r of results) {
    const i = r.found.indexOf(el);
    if (i >= 0 && r.found.length <= 20) {
      const nth: Step = { kind: 'nth', index: i === 0 ? 0 : i === r.found.length - 1 ? -1 : i };
      return stepsToString([...r.steps, nth]);
    }
  }
  return `locator(${fmtValue(cssPath(el))})`;
}

const CONTAINER_ROLES = new Set(['row', 'listitem', 'article']);

/** Text that identifies a container, e.g. a product card's name or an order row's number. */
function distinctiveText(container: Element): string | null {
  for (const d of descendants(container)) {
    const role = getRole(d);
    if (role === 'heading' || role === 'link' || role === 'rowheader') {
      const n = getAccessibleName(d);
      if (n && n.length <= 50) return n;
    }
  }
  for (const d of descendants(container)) {
    if (getRole(d) === 'cell') {
      const t = normalizeWhiteSpace(fullText(d));
      if (t && t.length <= 40) return t;
    }
  }
  return null;
}

/** Finds `container.filter({ hasText }).<inner>` that matches exactly `el`. */
function scopedSteps(el: Element, root: Document, inner: Step[]): Step[] | null {
  for (let anc = el.parentElement, depth = 0; anc && depth < 8; anc = anc.parentElement, depth++) {
    const testid = anc.getAttribute('data-testid');
    const role = getRole(anc);
    let base: Step | null = null;
    if (testid) base = { kind: 'testid', value: testid };
    else if (role && CONTAINER_ROLES.has(role)) base = { kind: 'role', role, options: {} };
    if (!base) continue;
    const text = distinctiveText(anc);
    if (!text) continue;
    const steps: Step[] = [base, { kind: 'filter', options: { hasText: text } }, ...inner];
    try {
      const found = resolveSteps(steps, root);
      if (found.length === 1 && found[0] === el) return steps;
    } catch {
      /* try the next ancestor */
    }
  }
  return null;
}

function cssPath(el: Element): string {
  const parts: string[] = [];
  for (let e: Element | null = el; e && e.localName !== 'html'; e = e.parentElement) {
    if (e.id && /^[A-Za-z][\w-]*$/.test(e.id)) {
      parts.unshift(`#${e.id}`);
      break;
    }
    let part = e.localName;
    const parent: Element | null = e.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.localName === e!.localName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(e) + 1})`;
    }
    parts.unshift(part);
  }
  return parts.join(' > ');
}
