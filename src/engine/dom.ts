// DOM helpers: ARIA roles, accessible names, visibility and text, modelled on Playwright's
// own implementation (simplified). Nodes come from the iframe's realm, so never use
// `instanceof` here; compare localName / nodeType instead.

export const normalizeWhiteSpace = (s: string) =>
  s.replace(/[​­]/g, '').replace(/\s+/g, ' ').trim();

export function parentElementOrHost(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const p = el.parentNode;
  if (p && p.nodeType === 11 && (p as ShadowRoot).host) return (p as ShadowRoot).host;
  return null;
}

export function composedContains(ancestor: Element, node: Element | null): boolean {
  for (let n = node; n; n = parentElementOrHost(n)) if (n === ancestor) return true;
  return false;
}

/** All descendants in (approximately) document order, including open shadow roots. */
export function descendants(root: Document | Element | ShadowRoot): Element[] {
  const out: Element[] = [];
  const visit = (node: ParentNode) => {
    for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
      out.push(c);
      if (c.shadowRoot) visit(c.shadowRoot);
      visit(c);
    }
  };
  if (root.nodeType === 1 && (root as Element).shadowRoot) visit((root as Element).shadowRoot!);
  visit(root as ParentNode);
  return out;
}

export function style(el: Element, pseudo?: string): CSSStyleDeclaration | null {
  const win = el.ownerDocument?.defaultView;
  return win ? win.getComputedStyle(el, pseudo) : null;
}

/** Playwright's definition: non-empty bounding box and not visibility:hidden. */
export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  if (el.localName === 'option' || el.localName === 'optgroup') {
    const select = el.closest('select');
    return select ? isVisible(select) : false;
  }
  const st = style(el);
  if (!st) return false;
  if (st.display === 'contents') {
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (isVisible(c)) return true;
    return false;
  }
  if (st.visibility !== 'visible') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Hidden from assistive technology (aria-hidden, display:none, visibility:hidden). */
export function isAriaHidden(el: Element): boolean {
  let self = true;
  for (let e: Element | null = el; e; e = parentElementOrHost(e)) {
    if (e.getAttribute('aria-hidden') === 'true') return true;
    const st = style(e);
    if (!st) return true;
    if (st.display === 'none') return true;
    if (self && (st.visibility === 'hidden' || st.visibility === 'collapse')) return true;
    self = false;
  }
  return false;
}

export function isDisabled(el: Element): boolean {
  try {
    if (el.matches(':disabled')) return true;
  } catch {
    /* ignore */
  }
  for (let e: Element | null = el; e; e = parentElementOrHost(e)) {
    if (e.getAttribute('aria-disabled') === 'true') return true;
  }
  return false;
}

const TEXT_INPUTS = new Set(['', 'text', 'email', 'password', 'search', 'tel', 'url', 'number']);

export function inputType(el: Element): string {
  return (el.getAttribute('type') || 'text').toLowerCase();
}

export function isTextField(el: Element): boolean {
  return el.localName === 'textarea' || (el.localName === 'input' && TEXT_INPUTS.has(inputType(el)));
}

export function isEditable(el: Element): boolean {
  if (isDisabled(el)) return false;
  if (el.localName === 'input' || el.localName === 'textarea' || el.localName === 'select') {
    return !el.hasAttribute('readonly');
  }
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.getAttribute('aria-readonly') === 'true') return false;
  return false;
}

// ---------------------------------------------------------------- roles

const INPUT_ROLES: Record<string, string | null> = {
  button: 'button', submit: 'button', reset: 'button', image: 'button', file: 'button',
  checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox',
  email: 'textbox', tel: 'textbox', text: 'textbox', url: 'textbox', password: 'textbox',
  date: 'textbox', 'datetime-local': 'textbox', month: 'textbox', time: 'textbox', week: 'textbox',
  color: null, hidden: null,
};

function hasNameAttr(el: Element) {
  return !!(el.getAttribute('aria-label')?.trim() || el.getAttribute('aria-labelledby')?.trim() || el.getAttribute('title')?.trim());
}

function inSectioningContent(el: Element) {
  for (let e = parentElementOrHost(el); e; e = parentElementOrHost(e)) {
    if (['article', 'aside', 'main', 'nav', 'section'].includes(e.localName)) return true;
  }
  return false;
}

export function getRole(el: Element): string | null {
  const explicit = el.getAttribute('role')?.trim().split(/\s+/)[0];
  if (explicit) return explicit === 'none' ? 'presentation' : explicit;
  switch (el.localName) {
    case 'a':
    case 'area':
      return el.hasAttribute('href') ? 'link' : null;
    case 'article': return 'article';
    case 'aside': return 'complementary';
    case 'blockquote': return 'blockquote';
    case 'button': return 'button';
    case 'caption': return 'caption';
    case 'code': return 'code';
    case 'datalist': return 'listbox';
    case 'dd': return 'definition';
    case 'details': return 'group';
    case 'dialog': return 'dialog';
    case 'dt': return 'term';
    case 'em': return 'emphasis';
    case 'fieldset': return 'group';
    case 'figure': return 'figure';
    case 'footer': return inSectioningContent(el) ? null : 'contentinfo';
    case 'form': return hasNameAttr(el) ? 'form' : null;
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
    case 'header': return inSectioningContent(el) ? null : 'banner';
    case 'hr': return 'separator';
    case 'img': return el.getAttribute('alt') === '' && !el.getAttribute('title') ? 'presentation' : 'img';
    case 'input': {
      const t = inputType(el);
      if (el.hasAttribute('list') && ['text', 'search', 'email', 'tel', 'url'].includes(t)) return 'combobox';
      return t in INPUT_ROLES ? INPUT_ROLES[t] : 'textbox';
    }
    case 'li': return 'listitem';
    case 'main': return 'main';
    case 'menu': case 'ol': case 'ul': return 'list';
    case 'meter': return 'meter';
    case 'nav': return 'navigation';
    case 'optgroup': return 'group';
    case 'option': return 'option';
    case 'output': return 'status';
    case 'p': return 'paragraph';
    case 'progress': return 'progressbar';
    case 'search': return 'search';
    case 'section': return hasNameAttr(el) ? 'region' : null;
    case 'select': return el.hasAttribute('multiple') || Number(el.getAttribute('size')) > 1 ? 'listbox' : 'combobox';
    case 'strong': return 'strong';
    case 'table': return 'table';
    case 'tbody': case 'thead': case 'tfoot': return 'rowgroup';
    case 'td': return 'cell';
    case 'textarea': return 'textbox';
    case 'th': return el.getAttribute('scope') === 'row' ? 'rowheader' : 'columnheader';
    case 'time': return 'time';
    case 'tr': return 'row';
    default: return null;
  }
}

const NAME_FROM_CONTENT = new Set([
  'button', 'cell', 'checkbox', 'columnheader', 'gridcell', 'heading', 'link', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'option', 'radio', 'row', 'rowheader', 'switch', 'tab', 'tooltip', 'treeitem',
]);

interface NameOpts {
  visited: Set<Element>;
  labelledBy: boolean;
  fromContent: boolean;
  root: Element;
}

export function getAccessibleName(el: Element): string {
  return normalizeWhiteSpace(nameOf(el, { visited: new Set(), labelledBy: false, fromContent: false, root: el }));
}

function getById(el: Element, id: string): Element | null {
  const root = el.getRootNode() as Document | ShadowRoot;
  return (root.getElementById?.(id) ?? el.ownerDocument.getElementById(id)) || null;
}

function pseudoContent(el: Element, which: '::before' | '::after') {
  const c = style(el, which)?.content;
  if (!c || c === 'none' || c === 'normal') return '';
  const m = /^"(.*)"$/.exec(c);
  return m ? m[1].replace(/\\"/g, '"') : '';
}

function isInline(el: Element) {
  const d = style(el)?.display ?? 'inline';
  return d.startsWith('inline');
}

function controlValueText(el: Element): string | null {
  const role = getRole(el);
  if (role === 'textbox' || role === 'searchbox') return (el as HTMLInputElement).value ?? '';
  if (role === 'combobox' && el.localName === 'select') {
    const s = el as HTMLSelectElement;
    return s.selectedOptions?.[0]?.textContent ?? '';
  }
  if (role === 'slider' || role === 'spinbutton') return (el as HTMLInputElement).value ?? '';
  return null;
}

function nameOf(el: Element, o: NameOpts): string {
  if (o.visited.has(el)) return '';
  o.visited.add(el);

  if (!o.labelledBy) {
    const ids = el.getAttribute('aria-labelledby');
    if (ids) {
      const txt = ids
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => getById(el, id))
        .filter((x): x is Element => !!x)
        .map((ref) => nameOf(ref, { visited: o.visited, labelledBy: true, fromContent: true, root: ref }))
        .join(' ');
      if (txt.trim()) return txt;
    }
  }

  // Embedded control while computing the name of an ancestor.
  if (o.fromContent && el !== o.root) {
    const v = controlValueText(el);
    if (v !== null) return v;
  }

  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel;

  const tag = el.localName;
  if (tag === 'input') {
    const t = inputType(el);
    const value = (el as HTMLInputElement).value;
    if (t === 'button' || t === 'submit' || t === 'reset') return value || (t === 'submit' ? 'Submit' : t === 'reset' ? 'Reset' : '');
    if (t === 'image') return el.getAttribute('alt') || value || 'Submit';
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag === 'meter' || tag === 'progress' || tag === 'output') {
    const labels = (el as HTMLInputElement).labels;
    if (labels && labels.length && !(tag === 'button' && o.fromContent)) {
      const txt = [...labels].map((l) => contentText(l, { ...o, fromContent: true, root: l })).join(' ');
      if (txt.trim()) return txt;
    }
  }
  if (tag === 'img' || tag === 'area') {
    const alt = el.getAttribute('alt');
    if (alt) return alt;
  }
  if (tag === 'fieldset') {
    const legend = [...el.children].find((c) => c.localName === 'legend');
    if (legend) return contentText(legend, { ...o, fromContent: true, root: legend });
  }
  if (tag === 'table') {
    const caption = [...el.children].find((c) => c.localName === 'caption');
    if (caption) return contentText(caption, { ...o, fromContent: true, root: caption });
  }
  if (tag === 'figure') {
    const cap = [...el.children].find((c) => c.localName === 'figcaption');
    if (cap) return contentText(cap, { ...o, fromContent: true, root: cap });
  }

  const role = getRole(el);
  if (o.fromContent || (role && NAME_FROM_CONTENT.has(role))) {
    const t = contentText(el, o);
    if (t.trim()) return t;
  }

  const title = el.getAttribute('title');
  if (title && title.trim()) return title;
  if (tag === 'input' || tag === 'textarea') {
    const ph = el.getAttribute('placeholder');
    if (ph) return ph;
  }
  return '';
}

function contentText(el: Element, o: NameOpts): string {
  let out = pseudoContent(el, '::before');
  let nodes: Node[];
  if (el.shadowRoot) {
    nodes = [];
    for (const n of el.shadowRoot.childNodes) {
      if (n.nodeType === 1 && (n as Element).localName === 'slot') {
        const assigned = (n as HTMLSlotElement).assignedNodes({ flatten: true });
        nodes.push(...(assigned.length ? assigned : [...n.childNodes]));
      } else nodes.push(n);
    }
  } else {
    nodes = [...el.childNodes];
  }
  for (const n of nodes) {
    if (n.nodeType === 3) out += (n as Text).data;
    else if (n.nodeType === 1) {
      const child = n as Element;
      if (['script', 'style', 'template', 'noscript'].includes(child.localName)) continue;
      if (!o.labelledBy && isAriaHidden(child)) continue;
      const s = nameOf(child, { ...o, fromContent: true });
      out += isInline(child) ? s : ` ${s} `;
    }
  }
  return out + pseudoContent(el, '::after');
}

/** Texts that getByLabel() matches: aria-labelledby, aria-label and <label> elements. */
export function labelTexts(el: Element): string[] {
  const out: string[] = [];
  const ids = el.getAttribute('aria-labelledby');
  if (ids) {
    const t = ids.split(/\s+/).map((id) => getById(el, id)).filter((x): x is Element => !!x).map((r) => fullText(r)).join(' ');
    if (t.trim()) out.push(t);
  }
  const al = el.getAttribute('aria-label');
  if (al) out.push(al);
  const labels = (el as HTMLInputElement).labels;
  if (labels) for (const l of labels) out.push(fullText(l));
  return out;
}

// ---------------------------------------------------------------- text

const SKIP_TEXT = new Set(['script', 'style', 'noscript', 'template', 'head', 'title']);

export function fullText(el: Element, memo?: Map<Element, string>): string {
  const cached = memo?.get(el);
  if (cached !== undefined) return cached;
  let s = '';
  if (SKIP_TEXT.has(el.localName)) s = '';
  else if (el.localName === 'input' && ['button', 'submit', 'reset'].includes(inputType(el))) s = (el as HTMLInputElement).value;
  else {
    const nodes = el.shadowRoot ? [...el.shadowRoot.childNodes, ...el.childNodes] : el.childNodes;
    for (const n of nodes) {
      if (n.nodeType === 3) s += (n as Text).data;
      else if (n.nodeType === 1) s += fullText(n as Element, memo);
    }
  }
  memo?.set(el, s);
  return s;
}

export function composedChildren(el: Element): Element[] {
  const kids = [...el.children];
  if (el.shadowRoot) kids.unshift(...el.shadowRoot.children);
  return kids;
}

export function isChecked(el: Element): boolean | 'mixed' | null {
  if (el.localName === 'input' && ['checkbox', 'radio'].includes(inputType(el))) {
    const i = el as HTMLInputElement;
    return i.indeterminate ? 'mixed' : i.checked;
  }
  const role = getRole(el);
  if (role && ['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem'].includes(role)) {
    const a = el.getAttribute('aria-checked');
    if (a === 'mixed') return 'mixed';
    return a === 'true';
  }
  return null;
}

/** "<button class="x">Text</button>" style short description for error messages. */
export function describeElement(el: Element | null): string {
  if (!el) return '<null>';
  const attrs = [...el.attributes]
    .filter((a) => a.name !== 'style')
    .slice(0, 6)
    .map((a) => (a.value === '' ? a.name : `${a.name}="${a.value.length > 40 ? a.value.slice(0, 40) + '…' : a.value}"`))
    .join(' ');
  const text = normalizeWhiteSpace(fullText(el));
  const short = text.length > 40 ? text.slice(0, 40) + '…' : text;
  return `<${el.localName}${attrs ? ' ' + attrs : ''}>${short}</${el.localName}>`;
}

export function deepActiveElement(doc: Document): Element | null {
  let a: Element | null = doc.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  return a;
}
