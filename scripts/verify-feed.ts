import { readFile } from 'node:fs/promises';
import { feedSchema } from '../src/model.ts';
import { sources } from './shared.ts';

// The workflow removes the checkout feed first. Never build from an absent,
// truncated, invalid, or older output after a sync that was allowed to fail.
const feed = feedSchema.parse(JSON.parse(await readFile('public/data/events.json', 'utf8')));
const expected: string[] = Object.values(sources).map((source): string => source.id).sort();
const actual: string[] = feed.sources.map((source): string => source.id).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Incomplete source status: expected ${expected.join(', ')}, received ${actual.join(', ')}`);
}
const startedAt: string | undefined = process.env.SYNC_STARTED_AT;
if (startedAt !== undefined) {
  const started: number = Date.parse(startedAt);
  if (!Number.isFinite(started) || Date.parse(feed.generatedAt) < started) {
    throw new Error(`Refusing stale sync output: generatedAt=${feed.generatedAt}, sync started=${startedAt}`);
  }
  if (feed.sources.some((source): boolean => Date.parse(source.checkedAt) < started)) {
    throw new Error('Refusing source status from before this sync');
  }
}
// Explicit source errors are valid partial output. The workflow still reports
// the original sync failure after deploying the healthy sources and error state.
console.info(JSON.stringify({ message: 'Sync output validated', generatedAt: feed.generatedAt,
  events: feed.events.length, sources: feed.sources.map(({ id, status, error }) => ({ id, status, error })) }));
