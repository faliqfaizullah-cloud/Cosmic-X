// Access to native Capacitor plugins without a bundler.
// `Capacitor.registerPlugin(name)` is the same call every plugin package makes internally.
const cache = new Map();

export const isNative = () => !!globalThis.Capacitor?.isNativePlatform?.();

/** Returns the native plugin proxy, or null in a plain browser / when the plugin isn't installed. */
export function native(name) {
  if (!isNative()) return null;
  if (cache.has(name)) return cache.get(name);
  let p = null;
  try {
    p = globalThis.Capacitor.registerPlugin?.(name) ?? globalThis.Capacitor.Plugins?.[name] ?? null;
  } catch { p = globalThis.Capacitor?.Plugins?.[name] ?? null; }
  cache.set(name, p);
  return p;
}
