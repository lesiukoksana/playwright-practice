import { useEffect, useState } from 'react';
import { Home } from './components/Home';
import { Reference } from './components/Reference';
import { Workspace } from './components/Workspace';
import { LESSONS } from './lessons/lessons';
import { useProgress } from './progress';

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  const progress = useProgress();
  const lessonMatch = /^#\/lesson\/([\w-]+)/.exec(hash);
  const lesson = lessonMatch ? LESSONS.find((l) => l.id === lessonMatch[1]) ?? null : null;
  const route = lesson
    ? 'lesson'
    : hash.startsWith('#/sandbox') ? 'sandbox'
    : hash.startsWith('#/reference') ? 'reference'
    : hash === '' || hash === '#' || hash === '#/' ? 'home'
    : 'not-found';
  const done = progress.completed.filter((id) => LESSONS.some((l) => l.id === id)).length;

  useEffect(() => {
    document.title = lesson ? `${lesson.title} · Playwright Practice Lab` : route === 'sandbox' ? 'Sandbox · Playwright Practice Lab' : route === 'reference' ? 'Reference · Playwright Practice Lab' : route === 'not-found' ? 'Page not found · Playwright Practice Lab' : 'Playwright Practice Lab';
  }, [lesson, route]);

  return (
    <div className={`app route-${route}`}>
      <header className="app-header">
        <a className="brand" href="#/" aria-label="Playwright Practice Lab, home">
          <span aria-hidden="true">🎭</span> <span className="brand-text">Playwright Practice Lab</span>
        </a>
        <nav aria-label="Main">
          <a href="#/" aria-current={route === 'home' || route === 'lesson' ? 'page' : undefined}>Lessons</a>
          <a href="#/sandbox" aria-current={route === 'sandbox' ? 'page' : undefined}>Sandbox</a>
          <a href="#/reference" aria-current={route === 'reference' ? 'page' : undefined}>Reference</a>
        </nav>
        <span className="header-progress" title="Lessons completed">{done}/{LESSONS.length} ✓</span>
      </header>
      <main className="app-main">
        {route === 'lesson' && lesson && <Workspace key={lesson.id} lesson={lesson} />}
        {route === 'sandbox' && <Workspace key="sandbox" lesson={null} />}
        {route === 'reference' && <Reference />}
        {route === 'home' && <Home />}
        {route === 'not-found' && <NotFound lessonId={lessonMatch?.[1]} />}
      </main>
    </div>
  );
}

function NotFound({ lessonId }: { lessonId?: string }) {
  return (
    <div className="page not-found">
      <h1>Page not found</h1>
      <p className="lead">
        {lessonId ? <>There's no lesson called <code>{lessonId}</code>. It may have been renamed.</> : <>There's no page at this address.</>}
      </p>
      <p className="hero-actions">
        <a className="cta" href="#/">All lessons</a>
        <a className="cta secondary" href="#/reference">Reference</a>
      </p>
    </div>
  );
}
