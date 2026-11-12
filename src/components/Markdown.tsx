import { loader } from '@monaco-editor/react';
import { marked } from 'marked';
import { useEffect, useMemo, useRef } from 'react';
import { setupMonaco } from './CodeEditor';

marked.setOptions({ gfm: true, breaks: false });

/** Renders trusted, author-written markdown and syntax-highlights code blocks with Monaco. */
export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => marked.parse(source.trim(), { async: false }) as string, [source]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    // External links open in a new tab so learners don't lose their code.
    el.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => {
      a.target = '_blank';
      a.rel = 'noreferrer';
    });
    loader.init().then((monaco) => {
      if (cancelled) return;
      setupMonaco(monaco);
      el.querySelectorAll<HTMLElement>('pre code').forEach((code) => {
        if (code.dataset.colorized) return;
        code.dataset.colorized = '1';
        code.setAttribute('data-lang', 'typescript');
        monaco.editor.colorizeElement(code, { theme: 'lab-dark', tabSize: 2 });
      });
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [html]);

  return <div ref={ref} className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
