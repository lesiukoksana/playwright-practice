import { useRef } from 'react';

interface Props {
  /** "vertical" = a vertical bar you drag left/right; "horizontal" = a bar you drag up/down. */
  orientation: 'vertical' | 'horizontal';
  label: string;
  onDrag: (delta: number) => void;
  onEnd?: () => void;
  onReset?: () => void;
  disabled?: boolean;
}

/** Drag handle between panels. Works with mouse, touch and the keyboard (arrow keys). */
export function Splitter({ orientation, label, onDrag, onEnd, onReset, disabled }: Props) {
  const last = useRef<number | null>(null);
  const pos = (e: React.PointerEvent) => (orientation === 'vertical' ? e.clientX : e.clientY);

  const stop = () => {
    if (last.current === null) return;
    last.current = null;
    document.body.classList.remove('resizing', `resizing-${orientation}`);
    onEnd?.();
  };

  if (disabled) return <div className={`splitter splitter-${orientation} disabled`} aria-hidden="true" />;

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      title={`${label} (drag, or double-click to reset)`}
      tabIndex={0}
      className={`splitter splitter-${orientation}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = pos(e);
        // While dragging, iframes must not swallow the pointer.
        document.body.classList.add('resizing', `resizing-${orientation}`);
      }}
      onPointerMove={(e) => {
        if (last.current === null) return;
        const p = pos(e);
        onDrag(p - last.current);
        last.current = p;
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 60 : 20;
        const keys: Record<string, number> = orientation === 'vertical' ? { ArrowLeft: -step, ArrowRight: step } : { ArrowUp: -step, ArrowDown: step };
        const d = keys[e.key];
        if (d) {
          e.preventDefault();
          onDrag(d);
          onEnd?.();
        }
      }}
    />
  );
}
