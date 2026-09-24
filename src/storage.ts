import { savedSchema } from './model.ts';
import type { Saved } from './model.ts';

const key: string = 'market-calendar:v1';

export function readSaved(): Saved {
  const raw: string | null = localStorage.getItem(key);
  if (raw === null) return { version: 1, zone: 'Asia/Shanghai', favorites: [], events: [] };
  return savedSchema.parse(JSON.parse(raw));
}

export function writeSaved(saved: Saved): Saved {
  const validated: Saved = savedSchema.parse(saved);
  localStorage.setItem(key, JSON.stringify(validated));
  return validated;
}
