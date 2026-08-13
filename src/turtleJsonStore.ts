/**
 * Ocean — Shared JSON store helper (features 249–260)
 * -----------------------------------------------------
 * Small lazy-load + debounced-persist file store used by the new-feature turtle
 * backends (same pattern as emergency.json in turtleEmergencyPoolsBackend, but
 * shared so the 249–260 batch doesn't duplicate the boilerplate ten times).
 *
 * Usage:
 *   const store = makeJsonStore<MyStore>('mystore.json', () => ({ items: [] }));
 *   const s = store.load();          // in-memory cached, reads once from disk
 *   s.items.push(item);
 *   store.persist();                // debounced write (120ms)
 */
import fs from 'fs';
import path from 'path';

export function makeJsonStore<T>(file: string, seed: () => T) {
  const filePath = path.join(process.cwd(), file);
  let data: T | null = null;
  let timer: NodeJS.Timeout | null = null;

  function load(): T {
    if (data) return data;
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          data = parsed as T;
          return data;
        }
      }
    } catch (e) {
      console.error(`[store] failed to load ${file}:`, e);
    }
    data = seed();
    return data;
  }

  function persist(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      } catch (e) {
        console.error(`[store] failed to persist ${file}:`, e);
      }
    }, 120);
  }

  return { load, persist };
}
