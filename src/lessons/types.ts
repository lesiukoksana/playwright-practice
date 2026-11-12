import type { LabSetup, RunResult } from '../engine/runtime';

export interface CheckContext {
  code: string;
  run: RunResult;
}

export interface Check {
  label: string;
  test: (ctx: CheckContext) => boolean;
}

export interface Lesson {
  id: string;
  chapter: string;
  title: string;
  /** Markdown shown above the task. */
  intro: string;
  /** Markdown describing what to do. */
  task: string;
  starter: string;
  solution: string;
  hints: string[];
  /** Page shown in the preview before the first run. */
  startPath?: string;
  setup?: LabSetup;
  checks?: Check[];
  /** "Find the bug" lessons: the test must also FAIL when these bugs are turned on. */
  mutation?: { bugs: string[]; description: string };
}

/** Removes comments so checks don't match code that is only mentioned in a comment. */
export function stripComments(code: string) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

export const uses = (api: string, label = `Uses ${api}()`, min = 1): Check => ({
  label,
  test: ({ run }) => (run.calls[api] ?? 0) >= min,
});

export const codeHas = (re: RegExp, label: string): Check => ({
  label,
  test: ({ code }) => re.test(stripComments(code)),
});

export const codeLacks = (re: RegExp, label: string): Check => ({
  label,
  test: ({ code }) => !re.test(stripComments(code)),
});

export const minTests = (n: number, label = `Has at least ${n} tests`): Check => ({
  label,
  test: ({ run }) => run.tests.length >= n,
});
