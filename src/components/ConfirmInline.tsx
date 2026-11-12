import { useEffect, useRef } from 'react';

/** A question with Yes / Cancel buttons, shown in place of the button that asked it. Escape cancels. */
export function ConfirmInline({ question, onYes, onCancel }: { question: string; onYes: () => void; onCancel: () => void }) {
  const yes = useRef<HTMLButtonElement>(null);
  useEffect(() => yes.current?.focus(), []);
  return (
    <span
      className="confirm-inline"
      role="group"
      aria-label={question}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      {question}
      <button ref={yes} className="small-button" onClick={onYes}>Yes</button>
      <button className="small-button" onClick={onCancel}>Cancel</button>
    </span>
  );
}
