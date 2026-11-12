import { CHAPTERS, LESSONS } from '../lessons/lessons';
import { resetProgress, useProgress } from '../progress';

export function Home() {
  const progress = useProgress();
  const done = progress.completed.filter((id) => LESSONS.some((l) => l.id === id)).length;
  const nextLesson = LESSONS.find((l) => !progress.completed.includes(l.id)) ?? LESSONS[0];

  return (
    <div className="page home">
      <section className="hero">
        <h1>Learn Playwright by writing real tests</h1>
        <p className="lead">
          Short lessons, an editor in your browser and a demo shop to test against. Write a test, press <strong>Run</strong>, and watch it
          click through the app. Nothing to install.
        </p>
        <div className="hero-actions">
          <a className="cta" href={`#/lesson/${nextLesson.id}`}>{done === 0 ? 'Start the course' : done === LESSONS.length ? 'Review the course' : `Continue: ${nextLesson.title}`} →</a>
          <a className="cta secondary" href="#/sandbox">Open the sandbox</a>
        </div>
        <div className="progress-line" aria-label={`${done} of ${LESSONS.length} lessons completed`}>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${(done / LESSONS.length) * 100}%` }} /></div>
          <span>{done} / {LESSONS.length} lessons completed</span>
        </div>
      </section>

      <section className="how">
        <div><span className="step-num">1</span><h3>Read</h3><p>Each lesson explains one Playwright idea with a short example.</p></div>
        <div><span className="step-num">2</span><h3>Write</h3><p>Complete the test in the editor, with autocomplete for the Playwright API.</p></div>
        <div><span className="step-num">3</span><h3>Run</h3><p>Your test drives the shop live. Failures show Playwright-style errors and the exact line.</p></div>
      </section>

      <section className="course" aria-labelledby="course-heading">
        <h2 id="course-heading">Course</h2>
        <div className="chapters">
          {CHAPTERS.map((ch, ci) => (
            <div className="chapter" key={ch}>
              <h3><span className="chapter-num">{ci + 1}</span> {ch}</h3>
              <ol>
                {LESSONS.filter((l) => l.chapter === ch).map((l) => {
                  const complete = progress.completed.includes(l.id);
                  return (
                    <li key={l.id} className={complete ? 'complete' : ''}>
                      <a href={`#/lesson/${l.id}`}>
                        <span className="lesson-check" aria-hidden="true">{complete ? '✓' : '○'}</span>
                        {l.title}
                        {complete && <span className="visually-hidden"> (completed)</span>}
                      </a>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
        {done > 0 && (
          <button
            className="link-button muted small"
            onClick={() => {
              if (window.confirm('Reset all progress and saved code?')) resetProgress();
            }}
          >
            Reset progress
          </button>
        )}
      </section>

      <section className="about-note">
        <h2>About this site</h2>
        <p>
          Tests run in your browser with <strong>Playwright Lab</strong>, a JavaScript re-implementation of the core Playwright API
          (locators, actions, auto-waiting assertions, dialogs, frames, network mocking and tabs). The code you write is standard{' '}
          <code>@playwright/test</code> code, so it also runs with real Playwright. See the <a href="#/reference">reference</a> for
          what's supported and how to run your tests locally. Every lesson links to the matching page of the{' '}
          <a href="https://playwright.dev/docs/intro" target="_blank" rel="noreferrer">official Playwright documentation</a>.
        </p>
      </section>
    </div>
  );
}
