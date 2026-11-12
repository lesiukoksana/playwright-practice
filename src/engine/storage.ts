// The shop inside the lab gets its own storage area, like a browser context in real Playwright.
// Pages in the preview see normal `localStorage` / `sessionStorage` keys ("pp.session", …), but they
// are stored in the real storage under SHOP_NS. So tests never change the data of the shop when
// someone opens it in a tab of their own, and the lab never wipes that data.

export const SHOP_NS = 'pwl.shop.';

/** A Storage that reads and writes `real` with every key prefixed by `ns`. */
export function namespacedStorage(real: Storage, ns: string = SHOP_NS): Storage {
  const keys = () => Object.keys(real).filter((k) => k.startsWith(ns)).map((k) => k.slice(ns.length));
  const api = {
    getItem: (key: string) => real.getItem(ns + String(key)),
    setItem: (key: string, value: string) => real.setItem(ns + String(key), String(value)),
    removeItem: (key: string) => real.removeItem(ns + String(key)),
    clear: () => keys().forEach((k) => real.removeItem(ns + k)),
    key: (index: number) => keys()[index] ?? null,
    get length() {
      return keys().length;
    },
  };
  const own = (p: string | symbol) => typeof p === 'string' && Object.prototype.hasOwnProperty.call(api, p);
  // A Proxy so that `Object.keys(localStorage)`, `localStorage.foo` and `delete localStorage.foo` work too.
  return new Proxy(api, {
    get(target, p) {
      if (own(p)) return target[p as keyof typeof api];
      if (typeof p !== 'string') return undefined;
      return real.getItem(ns + p) ?? undefined;
    },
    set(_t, p, value) {
      if (typeof p === 'string' && !own(p)) real.setItem(ns + p, String(value));
      return true;
    },
    deleteProperty(_t, p) {
      if (typeof p === 'string' && !own(p)) real.removeItem(ns + p);
      return true;
    },
    has(_t, p) {
      return own(p) || (typeof p === 'string' && real.getItem(ns + p) !== null);
    },
    ownKeys() {
      return keys();
    },
    getOwnPropertyDescriptor(_t, p) {
      if (typeof p !== 'string' || own(p)) return undefined;
      const value = real.getItem(ns + p);
      return value === null ? undefined : { value, enumerable: true, configurable: true, writable: true };
    },
  }) as unknown as Storage;
}

export const shopLocalStorage = () => namespacedStorage(localStorage);
export const shopSessionStorage = () => namespacedStorage(sessionStorage);

/** Points a shop window's `localStorage` and `sessionStorage` at the lab's own storage area. */
export function isolateStorage(win: Window) {
  for (const [name, store] of [['localStorage', shopLocalStorage()], ['sessionStorage', shopSessionStorage()]] as const) {
    try {
      Object.defineProperty(win, name, { value: store, configurable: true, enumerable: true, writable: false });
    } catch {
      /* leave the real storage in place */
    }
  }
}

/** Empties the lab's shop storage (a fresh browser context). */
export function clearShopStorage() {
  shopLocalStorage().clear();
  shopSessionStorage().clear();
}
