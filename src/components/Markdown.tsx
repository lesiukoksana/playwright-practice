import { loader } from '@monaco-editor/react';
import { marked } from 'marked';
import { useEffect, useMemo, useRef } from 'react';
import { setupMonaco } from './CodeEditor';

marked.setOptions({ gfm: true, breaks: false });

/**
 * Lets long code lines wrap at spaces and after ".", "(", "," and "{" (like the editor does)
 * instead of in the middle of a word. The colorizer writes spaces as non-breaking spaces, so they
 * are turned back into normal ones; <wbr> elements add no text, so copied code is unchanged.
 */
function addWrapPoints(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.data.replace(/\u00a0/g, ' ');
    const frag = document.createDocumentFragment();
    for (const part of text.split(/(?<=[.(,{])/)) {
      frag.appendChild(document.createTextNode(part));
      if (/[.(,{]$/.test(part)) frag.appendChild(document.createElement('wbr'));
    }
    node.replaceWith(frag);
  }
}

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
        void monaco.editor.colorizeElement(code, { theme: 'lab-dark', tabSize: 2 }).then(() => addWrapPoints(code));
      });
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [html]);

  return <div ref={ref} className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
