// Recorder: turns what the learner does in the preview into Playwright code,
// similar to Playwright's test generator (codegen).
import { fullText, inputType, isTextField, normalizeWhiteSpace } from './dom';
import type { Runtime } from './runtime';
import { fmtValue, generateLocator, retarget } from './selectors';

export type RecorderMode = 'actions' | 'assertVisible' | 'assertText' | 'assertValue';

/** Receives each generated line. `replaceLast` is true when the line updates the previous one (typing). */
export type RecordSink = (line: string, replaceLast: boolean) => void;

const VALUE_INPUTS = new Set(['date', 'time', 'datetime-local', 'month', 'week']);

export class Recorder {
  active = false;
  mode: RecorderMode = 'actions';
  count = 0;
  private sink: RecordSink | null = null;
  private cleanup: (() => void) | null = null;
  private lastFill: Element | null = null;
  /** Enter in a form makes the browser fire a click on the submit button; don't record that click. */
  private ignoreSyntheticClick = false;

  constructor(private rt: Runtime) {}

  /** `openedPath` is the page the test already opens; then no extra goto is recorded. */
  start(sink: RecordSink, openedPath: string | null = null) {
    this.active = true;
    this.sink = sink;
    this.mode = 'actions';
    this.count = 0;
    this.lastFill = null;
    const url = this.rt.activePage?.url() ?? '';
    const path = url.slice(this.rt.baseURL.length) || 'index.html';
    if (url.startsWith(this.rt.baseURL) && path !== openedPath) this.emitLine(`await page.goto(${fmtValue(path)});`);
    this.reattach();
    this.rt.emit();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.sink = null;
    this.cleanup?.();
    this.cleanup = null;
    this.rt.highlightState = null;
    this.rt.emit();
  }

  setMode(mode: RecorderMode) {
    this.mode = mode;
    this.rt.emit();
  }

  /** The learner typed an address in the preview's address bar. */
  navigated(path: string) {
    if (!this.active) return;
    this.lastFill = null;
    this.emitLine(`await page.goto(${fmtValue(path)});`);
  }

  private emitLine(line: string, replaceLast = false) {
    if (!replaceLast) this.count++;
    this.sink?.(line, replaceLast);
    this.rt.emit();
  }

  /** (Re)binds the listeners to the active page's current document. */
  reattach() {
    this.cleanup?.();
    this.cleanup = null;
    if (!this.active) return;
    const page = this.rt.activePage;
    const doc = page?._doc();
    if (!page || !doc) return;

    const loc = (el: Element) => `page.${generateLocator(el, doc)}`;
    const targetOf = (e: Event) => {
      const raw = e.composedPath()[0] as Element | undefined;
      return raw && raw.nodeType === 1 ? raw : null;
    };

    const onMove = (e: MouseEvent) => {
      const raw = targetOf(e);
      if (!raw) return;
      const el = this.mode === 'assertValue' ? (valueElement(raw) ?? retarget(raw)) : retarget(raw);
      let label = '';
      try {
        label = loc(el);
      } catch {
        return;
      }
      const prefix = this.mode === 'actions' ? '' : this.mode === 'assertVisible' ? 'assert visible: ' : this.mode === 'assertText' ? 'assert text: ' : 'assert value: ';
      const r = el.getBoundingClientRect();
      this.rt.highlightState = { pageId: page._id, x: r.left, y: r.top, w: r.width, h: r.height, label: prefix + label };
      this.rt.emit();
    };

    const onClick = (e: MouseEvent) => {
      const raw = targetOf(e);
      if (!raw) return;
      if (this.mode !== 'actions') {
        e.preventDefault();
        e.stopPropagation();
        this.recordAssertion(raw, loc);
        this.mode = 'actions';
        this.rt.emit();
        return;
      }
      if (this.ignoreSyntheticClick && e.detail === 0) return;
      // A click on a <label> is followed by a click on its control; record only the control.
      const label = raw.closest('label') as HTMLLabelElement | null;
      if (label && label.control && label.control !== raw) return;
      const el = retarget(raw);
      const tag = el.localName;
      const type = inputType(el);
      if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
        const checked = (el as HTMLInputElement).checked; // already toggled when click listeners run
        this.emitLine(`await ${loc(el)}.${type === 'radio' || checked ? 'check' : 'uncheck'}();`);
        this.lastFill = null;
        return;
      }
      if (tag === 'select' || tag === 'option' || tag === 'textarea' || isTextField(el)) return; // recorded on input/change
      if (tag === 'input' && (VALUE_INPUTS.has(type) || type === 'file' || type === 'range')) return;
      this.emitLine(`await ${loc(el)}.click();`);
      this.lastFill = null;
    };

    const onInput = (e: Event) => {
      const el = targetOf(e);
      if (!el) return;
      const isValueInput = el.localName === 'input' && VALUE_INPUTS.has(inputType(el));
      if (!isTextField(el) && !isValueInput) return;
      const value = (el as HTMLInputElement).value;
      this.emitLine(`await ${loc(el)}.fill(${fmtValue(value)});`, this.lastFill === el);
      this.lastFill = el;
    };

    const onChange = (e: Event) => {
      const el = targetOf(e);
      if (!el) return;
      if (el.localName === 'select') {
        const sel = el as HTMLSelectElement;
        const option = sel.selectedOptions[0];
        const label = option ? normalizeWhiteSpace(option.textContent ?? '') || option.value : sel.value;
        this.emitLine(`await ${loc(el)}.selectOption(${fmtValue(label)});`);
        this.lastFill = null;
      } else if (el.localName === 'input' && inputType(el) === 'file') {
        const file = (el as HTMLInputElement).files?.[0];
        const name = file?.name ?? 'file.txt';
        const mime = file?.type || 'application/octet-stream';
        this.emitLine(`await ${loc(el)}.setInputFiles({ name: ${fmtValue(name)}, mimeType: ${fmtValue(mime)}, buffer: Buffer.from('file contents') });`);
        this.lastFill = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const el = targetOf(e);
      if (!el) return;
      if (e.key === 'Enter' && el.localName === 'input' && isTextField(el)) {
        this.emitLine(`await ${loc(el)}.press('Enter');`);
        this.lastFill = null;
        this.ignoreSyntheticClick = true;
        setTimeout(() => {
          this.ignoreSyntheticClick = false;
        }, 0);
      } else if (e.key === 'Escape') {
        this.emitLine("await page.keyboard.press('Escape');");
        this.lastFill = null;
      }
    };

    doc.addEventListener('mousemove', onMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('input', onInput, true);
    doc.addEventListener('change', onChange, true);
    doc.addEventListener('keydown', onKeyDown, true);
    this.cleanup = () => {
      doc.removeEventListener('mousemove', onMove, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('input', onInput, true);
      doc.removeEventListener('change', onChange, true);
      doc.removeEventListener('keydown', onKeyDown, true);
    };
  }

  private recordAssertion(raw: Element, loc: (el: Element) => string) {
    if (this.mode === 'assertValue') {
      const field = valueElement(raw);
      if (field) {
        this.emitLine(`await expect(${loc(field)}).toHaveValue(${fmtValue((field as HTMLInputElement).value)});`);
        return;
      }
    }
    const el = retarget(raw);
    if (this.mode === 'assertVisible') {
      this.emitLine(`await expect(${loc(el)}).toBeVisible();`);
      return;
    }
    const text = normalizeWhiteSpace(fullText(el));
    if (!text) this.emitLine(`await expect(${loc(el)}).toBeVisible();`);
    else if (text.length <= 80) this.emitLine(`await expect(${loc(el)}).toHaveText(${fmtValue(text)});`);
    else this.emitLine(`await expect(${loc(el)}).toContainText(${fmtValue(text.slice(0, 60).trim())});`);
  }
}

function valueElement(raw: Element): Element | null {
  const field = raw.closest('input, textarea, select');
  if (field) return field;
  const label = raw.closest('label') as HTMLLabelElement | null;
  return label?.control ?? null;
}
