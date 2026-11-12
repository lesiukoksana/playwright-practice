import { useSyncExternalStore } from 'react';

// Everything the lab stores starts with "pwl." so the test runner never clears it.
const KEY = 'pwl.progress';
const EVENT = 'pwl-progress';

interface Progress {
  completed: string[];
}

function read(): Progress {
  try {
    return { completed: [], ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { completed: [] };
  }
}

function write(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
  cached = null;
  window.dispatchEvent(new Event(EVENT));
}

let cached: Progress | null = null;
const snapshot = () => (cached ??= read());
const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};

export function useProgress() {
  return useSyncExternalStore(subscribe, snapshot);
}

export function markCompleted(id: string) {
  const p = read();
  if (!p.completed.includes(id)) write({ ...p, completed: [...p.completed, id] });
}

export function resetProgress() {
  for (const k of Object.keys(localStorage)) if (k.startsWith('pwl.')) localStorage.removeItem(k);
  write({ completed: [] });
}

export function loadCode(id: string, fallback: string): string {
  try {
    return localStorage.getItem(`pwl.code.${id}`) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveCode(id: string, code: string) {
  try {
    localStorage.setItem(`pwl.code.${id}`, code);
  } catch {
    /* ignore */
  }
}

export function loadSetting<T>(name: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`pwl.setting.${name}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function saveSetting(name: string, value: unknown) {
  try {
    localStorage.setItem(`pwl.setting.${name}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
