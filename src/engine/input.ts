// Low-level input emulation. Events are created with the iframe's own constructors.
import { composedContains, deepActiveElement, inputType, isTextField, parentElementOrHost } from './dom';
import { LabError } from './errors';

export interface InputState {
  hovered: Element | null;
  /** A text field whose value we changed; "change" fires when it loses focus (like a real browser). */
  pendingChange: { el: Element; value: string } | null;
  selectAll: WeakSet<Element>;
}

export const newInputState = (): InputState => ({ hovered: null, pendingChange: null, selectAll: new WeakSet() });

type Win = Window & typeof globalThis;
const winOf = (el: Element) => el.ownerDocument.defaultView as Win;

export function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Is `el` the topmost element at its centre point? Returns the intercepting element otherwise. */
export function hitTarget(el: Element): { ok: true } | { ok: false; hit: Element | null } {
  const { x, y } = center(el);
  let hit = el.ownerDocument.elementFromPoint(x, y);
  while (hit && hit.shadowRoot) {
    const inner = hit.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === hit) break;
    hit = inner;
  }
  if (!hit) return { ok: false, hit: null };
  if (composedContains(el, hit)) return { ok: true };
  const label = hit.closest('label') as HTMLLabelElement | null;
  if (label && label.control === el) return { ok: true };
  return { ok: false, hit };
}

function mouseInit(el: Element, x: number, y: number, extra: MouseEventInit = {}): MouseEventInit {
  return { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: winOf(el), ...extra };
}

function pointer(el: Element, type: string, init: MouseEventInit) {
  const W = winOf(el);
  const Ctor = (W.PointerEvent ?? W.MouseEvent) as typeof PointerEvent;
  return el.dispatchEvent(new Ctor(type, { ...init, pointerType: 'mouse', isPrimary: true, pointerId: 1 } as PointerEventInit));
}

function mouse(el: Element, type: string, init: MouseEventInit) {
  return el.dispatchEvent(new (winOf(el).MouseEvent)(type, init));
}

export function moveMouseTo(state: InputState, el: Element) {
  const { x, y } = center(el);
  const prev = state.hovered;
  const init = mouseInit(el, x, y);
  if (prev !== el) {
    if (prev && prev.isConnected && prev.ownerDocument === el.ownerDocument) {
      pointer(prev, 'pointerout', init);
      mouse(prev, 'mouseout', init);
      for (let e: Element | null = prev; e && !composedContains(e, el); e = parentElementOrHost(e)) {
        pointer(e, 'pointerleave', { ...init, bubbles: false });
        mouse(e, 'mouseleave', { ...init, bubbles: false });
      }
    }
    pointer(el, 'pointerover', init);
    mouse(el, 'mouseover', init);
    const enter: Element[] = [];
    const prevOk = prev && prev.isConnected && prev.ownerDocument === el.ownerDocument ? prev : null;
    for (let e: Element | null = el; e && !(prevOk && composedContains(e, prevOk)); e = parentElementOrHost(e)) enter.unshift(e);
    for (const e of enter) {
      pointer(e, 'pointerenter', { ...init, bubbles: false });
      mouse(e, 'mouseenter', { ...init, bubbles: false });
    }
    state.hovered = el;
  }
  pointer(el, 'pointermove', init);
  mouse(el, 'mousemove', init);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex], [contenteditable=""], [contenteditable="true"], summary, iframe';

function focusTarget(el: Element): HTMLElement | null {
  for (let e: Element | null = el; e; e = parentElementOrHost(e)) {
    try {
      if (e.matches(FOCUSABLE)) return e as HTMLElement;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Fires "change" on a text field we edited, the way a browser does when it loses focus. */
export function flushChange(state: InputState, except?: Element | null) {
  const p = state.pendingChange;
  if (!p || p.el === except) return;
  state.pendingChange = null;
  const el = p.el as HTMLInputElement;
  if (el.isConnected && el.value !== p.value) el.dispatchEvent(new (winOf(el).Event)('change', { bubbles: true }));
}

function focusElement(state: InputState, el: HTMLElement | null, doc: Document) {
  if (el) {
    flushChange(state, el);
    el.focus({ preventScroll: true });
  } else {
    flushChange(state);
    (deepActiveElement(doc) as HTMLElement | null)?.blur?.();
  }
}

export interface ClickOptions {
  clickCount?: number;
  button?: 'left' | 'right' | 'middle';
  modifiers?: string[];
}

function modifierFlags(mods: string[] = []) {
  const has = (m: string) => mods.includes(m) || (m === 'Control' && mods.includes('ControlOrMeta'));
  return { ctrlKey: has('Control'), shiftKey: has('Shift'), altKey: has('Alt'), metaKey: has('Meta') };
}

export function click(state: InputState, el: Element, opts: ClickOptions = {}) {
  moveMouseTo(state, el);
  const { x, y } = center(el);
  const button = opts.button === 'right' ? 2 : opts.button === 'middle' ? 1 : 0;
  const base = mouseInit(el, x, y, { button, ...modifierFlags(opts.modifiers) });
  const count = opts.clickCount ?? 1;
  for (let i = 1; i <= count; i++) {
    pointer(el, 'pointerdown', { ...base, buttons: 1 });
    if (mouse(el, 'mousedown', { ...base, buttons: 1, detail: i })) focusElement(state, focusTarget(el), el.ownerDocument);
    pointer(el, 'pointerup', { ...base, buttons: 0 });
    mouse(el, 'mouseup', { ...base, buttons: 0, detail: i });
    if (button === 0) mouse(el, 'click', { ...base, buttons: 0, detail: i });
    else if (button === 2) mouse(el, 'contextmenu', { ...base, buttons: 0, detail: i });
  }
  if (count === 2 && button === 0) mouse(el, 'dblclick', { ...base, detail: 2 });
}

// ---------------------------------------------------------------- text input

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function fireInput(el: Element, data: string | null, inputType = 'insertText') {
  const W = winOf(el);
  el.dispatchEvent(new W.InputEvent('input', { bubbles: true, composed: true, data, inputType }));
}

export function fill(state: InputState, el: Element, value: string) {
  const tag = el.localName;
  if (tag === 'input') {
    const t = inputType(el);
    const unfillable = ['checkbox', 'radio', 'file', 'button', 'submit', 'reset', 'image', 'range', 'color', 'hidden'];
    if (unfillable.includes(t)) throw new LabError(`Input of type "${t}" cannot be filled`);
    if (t === 'number' && value !== '' && Number.isNaN(Number(value))) throw new LabError('Cannot type text into input[type=number]');
    if (['date', 'time', 'datetime-local', 'month', 'week'].includes(t)) {
      const input = el as HTMLInputElement;
      focusElement(state, input, el.ownerDocument);
      setValue(input, value);
      if (value && input.value !== value) throw new LabError(`Malformed value "${value}" for input[type=${t}]`);
      fireInput(el, value);
      el.dispatchEvent(new (winOf(el).Event)('change', { bubbles: true }));
      return;
    }
  } else if (tag !== 'textarea' && !(el as HTMLElement).isContentEditable) {
    throw new LabError('Element is not an <input>, <textarea> or [contenteditable] element');
  }
  focusElement(state, el as HTMLElement, el.ownerDocument);
  if ((el as HTMLElement).isContentEditable && tag !== 'input' && tag !== 'textarea') {
    el.textContent = value;
    fireInput(el, value);
    return;
  }
  const input = el as HTMLInputElement;
  if (!state.pendingChange || state.pendingChange.el !== el) state.pendingChange = { el, value: input.value };
  setValue(input, value);
  fireInput(el, value, value ? 'insertText' : 'deleteContentBackward');
}

function insertText(state: InputState, el: Element, text: string) {
  if (!isTextField(el)) {
    if ((el as HTMLElement).isContentEditable) {
      el.textContent = (el.textContent ?? '') + text;
      fireInput(el, text);
    }
    return;
  }
  const input = el as HTMLInputElement;
  if (!state.pendingChange || state.pendingChange.el !== el) state.pendingChange = { el, value: input.value };
  let next: string;
  if (state.selectAll.has(el)) {
    next = text;
    state.selectAll.delete(el);
  } else next = input.value + text;
  if (input.maxLength >= 0 && next.length > input.maxLength) return;
  setValue(input, next);
  fireInput(el, text);
}

// ---------------------------------------------------------------- keyboard

const KEYS: Record<string, { key: string; code: string; keyCode: number }> = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  Home: { key: 'Home', code: 'Home', keyCode: 36 },
  End: { key: 'End', code: 'End', keyCode: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  Space: { key: ' ', code: 'Space', keyCode: 32 },
  Shift: { key: 'Shift', code: 'ShiftLeft', keyCode: 16 },
  Control: { key: 'Control', code: 'ControlLeft', keyCode: 17 },
  Alt: { key: 'Alt', code: 'AltLeft', keyCode: 18 },
  Meta: { key: 'Meta', code: 'MetaLeft', keyCode: 91 },
};

function keyInfo(name: string) {
  if (KEYS[name]) return KEYS[name];
  if (name.length === 1) {
    const upper = name.toUpperCase();
    const code = /[a-z]/i.test(name) ? `Key${upper}` : /\d/.test(name) ? `Digit${name}` : name === ' ' ? 'Space' : '';
    return { key: name, code, keyCode: upper.charCodeAt(0) };
  }
  if (/^F\d{1,2}$/.test(name)) return { key: name, code: name, keyCode: 111 + Number(name.slice(1)) };
  throw new LabError(`Unknown key: "${name}"`);
}

function tabbables(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => {
    if (e.tabIndex < 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function isClickable(el: Element) {
  if (el.localName === 'button' || el.localName === 'summary') return true;
  if (el.localName === 'a' && el.hasAttribute('href')) return true;
  if (el.localName === 'input' && ['button', 'submit', 'reset', 'checkbox', 'radio', 'image'].includes(inputType(el))) return true;
  const role = el.getAttribute('role');
  return !!role && ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'switch', 'option'].includes(role);
}

/** Presses a key (or combination like "Control+A") on `target`. */
export function press(state: InputState, target: Element, combo: string) {
  const parts = combo === '+' ? ['+'] : combo.split('+');
  const keyName = parts.pop()!;
  const mods = parts;
  const info = keyInfo(keyName === ' ' ? 'Space' : keyName);
  const W = winOf(target);
  const flags = modifierFlags(mods);
  const init: KeyboardEventInit & { keyCode: number; which: number } = {
    key: flags.shiftKey && info.key.length === 1 ? info.key.toUpperCase() : info.key,
    code: info.code, keyCode: info.keyCode, which: info.keyCode,
    bubbles: true, cancelable: true, composed: true, ...flags,
  };
  const notPrevented = target.dispatchEvent(new W.KeyboardEvent('keydown', init));
  if (notPrevented) defaultKeyAction(state, target, init.key!, flags);
  target.dispatchEvent(new W.KeyboardEvent('keyup', init));
}

function defaultKeyAction(state: InputState, target: Element, key: string, f: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
  const doc = target.ownerDocument;
  const W = winOf(target);
  if ((f.ctrlKey || f.metaKey) && key.toLowerCase() === 'a') {
    if (isTextField(target)) state.selectAll.add(target);
    return;
  }
  if (key.length === 1 && !f.ctrlKey && !f.metaKey) {
    if (key === ' ' && isClickable(target)) return click(state, target);
    if (isTextField(target) || (target as HTMLElement).isContentEditable) {
      target.dispatchEvent(new W.KeyboardEvent('keypress', { key, bubbles: true, cancelable: true, composed: true }));
      insertText(state, target, key);
    }
    return;
  }
  switch (key) {
    case 'Enter': {
      if (target.localName === 'textarea') return insertText(state, target, '\n');
      if (target.localName === 'input' && isTextField(target)) {
        flushChange(state);
        (target as HTMLInputElement).form?.requestSubmit();
        return;
      }
      if (isClickable(target)) click(state, target);
      return;
    }
    case 'Backspace':
    case 'Delete': {
      if (!isTextField(target)) return;
      const input = target as HTMLInputElement;
      if (!state.pendingChange || state.pendingChange.el !== target) state.pendingChange = { el: target, value: input.value };
      const next = state.selectAll.has(target) ? '' : input.value.slice(0, -1);
      state.selectAll.delete(target);
      setValue(input, next);
      fireInput(target, null, 'deleteContentBackward');
      return;
    }
    case 'Tab': {
      const list = tabbables(doc);
      const i = list.indexOf(target as HTMLElement);
      const next = list[(i + (f.shiftKey ? -1 : 1) + list.length) % list.length];
      focusElement(state, next ?? null, doc);
      return;
    }
    case 'Escape': {
      const dlg = doc.querySelector('dialog[open]') as HTMLDialogElement | null;
      if (dlg) {
        const go = dlg.dispatchEvent(new W.Event('cancel', { cancelable: true }));
        if (go) dlg.close();
      }
      return;
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      if (target.localName === 'input' && inputType(target) === 'number') {
        const input = target as HTMLInputElement;
        if (key === 'ArrowUp') input.stepUp();
        else input.stepDown();
        fireInput(target, null);
        target.dispatchEvent(new W.Event('change', { bubbles: true }));
      }
      return;
    }
  }
}

export function typeText(state: InputState, target: Element, text: string) {
  for (const ch of text) press(state, target, ch === ' ' ? 'Space' : ch);
}

// ---------------------------------------------------------------- select, check, files, drag

export interface SelectValue {
  value?: string;
  label?: string;
  index?: number;
}

export function selectOptions(el: Element, values: (string | SelectValue)[]): string[] | null {
  if (el.localName !== 'select') throw new LabError('Element is not a <select> element');
  const select = el as HTMLSelectElement;
  const options = [...select.options];
  const picked: HTMLOptionElement[] = [];
  for (const v of values) {
    const opt = options.find((o, i) => {
      if (typeof v === 'string') return o.value === v || o.label === v || o.textContent?.trim() === v;
      if (v.value !== undefined && o.value !== v.value) return false;
      if (v.label !== undefined && o.label !== v.label) return false;
      if (v.index !== undefined && i !== v.index) return false;
      return true;
    });
    if (!opt) return null; // keep waiting: options may not be loaded yet
    picked.push(opt);
  }
  if (!select.multiple && picked.length > 1) throw new LabError('Element is not a multi-select <select> element');
  for (const o of options) o.selected = picked.includes(o);
  const W = winOf(el);
  el.dispatchEvent(new W.Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new W.Event('change', { bubbles: true }));
  return picked.map((o) => o.value);
}

export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Uint8Array | ArrayBuffer | string;
}

export function setFiles(el: Element, files: FilePayload[]) {
  if (el.localName !== 'input' || inputType(el) !== 'file') throw new LabError('Node is not an HTMLInputElement of type "file"');
  const W = winOf(el);
  const dt = new W.DataTransfer();
  for (const f of files) {
    if (typeof f === 'string') {
      throw new LabError(`setInputFiles: file paths ("${f}") aren't available in the browser. Pass { name, mimeType, buffer } instead, e.g. { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('...') }`);
    }
    const data = typeof f.buffer === 'string' ? new TextEncoder().encode(f.buffer) : f.buffer;
    dt.items.add(new W.File([data as BlobPart], f.name, { type: f.mimeType }));
  }
  (el as HTMLInputElement).files = dt.files;
  el.dispatchEvent(new W.Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new W.Event('change', { bubbles: true }));
}

export function dragAndDrop(state: InputState, source: Element, target: Element) {
  const W = winOf(source);
  const dt = new W.DataTransfer();
  const s = center(source);
  const t = center(target);
  moveMouseTo(state, source);
  mouse(source, 'mousedown', mouseInit(source, s.x, s.y, { buttons: 1 }));
  const drag = (el: Element, type: string, x: number, y: number) =>
    el.dispatchEvent(new W.DragEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, dataTransfer: dt }));
  drag(source, 'dragstart', s.x, s.y);
  drag(source, 'drag', s.x, s.y);
  drag(target, 'dragenter', t.x, t.y);
  const accepted = !drag(target, 'dragover', t.x, t.y);
  if (accepted) drag(target, 'drop', t.x, t.y);
  drag(source, 'dragend', t.x, t.y);
  state.hovered = target;
}
