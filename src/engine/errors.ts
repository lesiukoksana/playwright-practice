/** Base error for problems the engine reports to the learner. `line` points into their code. */
export class LabError extends Error {
  line?: number;
  constructor(message: string) {
    super(message);
    this.name = 'Error';
  }
}

export class TimeoutError extends LabError {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Thrown when a page/test was closed or aborted while user code was still running. */
export class ClosedError extends LabError {
  constructor(message = 'Target page, context or browser has been closed') {
    super(message);
  }
}

export class SkipError extends Error {
  constructor() {
    super('skipped');
  }
}

export class CompileError extends Error {
  line?: number;
  constructor(message: string, line?: number) {
    super(message);
    this.line = line;
  }
}

/** Finds the line in the learner's code from the current call stack. */
export function captureUserLine(): number | undefined {
  const stack = new Error().stack ?? '';
  const m = /playwright-lab-test\.js:(\d+):(\d+)/.exec(stack);
  return m ? Number(m[1]) : undefined;
}

export function lineFromError(e: unknown): number | undefined {
  const err = e as { line?: number; stack?: string };
  if (typeof err?.line === 'number') return err.line;
  const m = /playwright-lab-test\.js:(\d+):(\d+)/.exec(err?.stack ?? '');
  return m ? Number(m[1]) : undefined;
}
