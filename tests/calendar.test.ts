import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beijingToUtc, eventDay, eventSchema, monthDays, shiftMonth, feedSchema } from '../src/model.ts';
import { easternTime, sources } from '../scripts/shared.ts';
import { filteredEvents } from '../src/view.ts';
import { rankEvents, byImportance, nextHighlights } from '../src/importance.ts';
import { parseMacro } from '../scripts/macro.ts';
import { parseBoj, parseFed } from '../scripts/policy.ts';
import { parseNyse, parseSse } from '../scripts/holidays.ts';
import { parseEarnings, parseLeaders } from '../scripts/earnings.ts';
import { parseExpirations } from '../scripts/expirations.ts';
import type { Feed, Saved } from '../src/model.ts';

/** Keep unit tests independent of live source failures and the moving earnings window. */
function fixtureFeed(): Feed {
  const fixture = (name: string): string => readFileSync(`tests/fixtures/${name}`, 'utf8');
  const { leaders, holdingsDate } = parseLeaders(fixture('ivv.csv'));
  const events = [
    ...parseMacro(fixture('nyfed.html'), sources.macro.url),
    ...parseFed(fixture('fed.html'), 2026),
    ...parseBoj(fixture('boj.html'), 2026),
    ...parseNyse(fixture('nyse.html')),
    ...parseSse(fixture('sse.html')),
    ...parseExpirations(fixture('cme.html'), 2026),
    ...parseEarnings(fixture('earnings.json'), '2026-10-29', leaders),
  ];
  const generatedAt: string = '2026-09-25T00:00:00.000Z';
  return feedSchema.parse({
    generatedAt, events, leaders, holdingsDate,
    sources: Object.values(sources).map((source) => {
      const sourceEvents = events.filter((event): boolean => event.source?.name === source.name);
      const days = sourceEvents.map((event): string => eventDay(event, 'America/New_York')).sort();
      return { ...source, status: 'ok', checkedAt: generatedAt, count: source.id === 'holdings' ? leaders.length : sourceEvents.length,
        start: days[0] ?? null, end: days.at(-1) ?? null, error: null };
    }),
  });
}

test('US daytime releases account for DST and cross-date Beijing display', (): void => {
  assert.equal(easternTime('2026-10-14', '08:30'), '2026-10-14T12:30:00.000Z');
  assert.equal(easternTime('2026-11-10', '08:30'), '2026-11-10T13:30:00.000Z');
  const event = eventSchema.parse({ id: 'close', title: 'Early close', category: 'holiday', timing: { kind: 'timed', at: easternTime('2026-11-27', '13:00') }, source: null, note: '' });
  assert.equal(eventDay(event, 'Asia/Shanghai'), '2026-11-28');
  assert.equal(eventDay(event, 'America/New_York'), '2026-11-27');
  const holiday = { ...event, timing: { kind: 'date' as const, date: '2026-11-26', zone: 'America/New_York' as const } };
  assert.equal(eventDay(holiday, 'Asia/Shanghai'), '2026-11-26');
  assert.equal(beijingToUtc('2026-11-28', '02:00'), '2026-11-27T18:00:00.000Z');
});

test('month navigation preserves leap days and crosses years', (): void => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthDays('2028-02').filter((day): boolean => day.startsWith('2028-02')).length, 29);
  assert.equal(monthDays('2026-09')[0], '2026-08-31');
});

test('fixture feed validates and category/search/favorite filters compose', (): void => {
  const feed = fixtureFeed();
  assert.ok(feed.sources.length >= 7);
  const fixtureEvents = feed.events.filter((event): boolean => event.source?.name === sources.macro.name);
  const cpi = fixtureEvents.find((event): boolean => event.title.includes('CPI'));
  assert.ok(cpi);
  const saved: Saved = { version: 1, zone: 'Asia/Shanghai', favorites: [cpi.id], events: [] };
  const filtered = filteredEvents(rankEvents(fixtureEvents, feed.leaders), { month: '2026-09', day: '2026-09-11', query: 'cpi', category: 'inflation', favoritesOnly: true, importantOnly: false, view: 'month' }, saved);
  assert.deepEqual(filtered.map((event): string => event.id), [cpi.id]);
});

test('attention levels distinguish policy decisions and prioritize large-index earnings', (): void => {
  const feed = fixtureFeed();
  const events = rankEvents(feed.events, feed.leaders);
  const cpi = events.find((event): boolean => event.title.startsWith('CPI ·'));
  const opening = events.find((event): boolean => event.title.includes('FOMC') && event.title.includes('首日'));
  const decision = events.find((event): boolean => event.title.includes('FOMC') && event.title.includes('末日'));
  const apple = events.find((event): boolean => event.title.startsWith('AAPL ·'));
  assert.ok(cpi && opening && decision && apple);
  assert.equal(cpi.importance.level, 'high');
  assert.equal(opening.importance.level, 'medium');
  assert.equal(decision.importance.level, 'high');
  assert.equal(apple.importance.level, 'high');
  const saved: Saved = { version: 1, zone: 'Asia/Shanghai', favorites: [], events: [] };
  const filtered = filteredEvents(events, { month: '2026-10', day: '2026-10-01', query: '', category: 'all', favoritesOnly: false, importantOnly: true, view: 'month' }, saved);
  assert.ok(filtered.length > 0 && filtered.length < events.length);
  assert.ok(filtered.every((event): boolean => event.importance.level === 'high'));
});

test('priority ordering is immutable and source-local earnings remain upcoming across midnight', (): void => {
  const feed = fixtureFeed();
  const events = rankEvents(feed.events, feed.leaders);
  const apple = events.find((event): boolean => event.title.startsWith('AAPL ·'));
  const holiday = events.find((event): boolean => event.category === 'holiday');
  assert.ok(apple && holiday && apple.timing.kind === 'date');
  const original = [holiday, apple];
  assert.deepEqual(byImportance(original).map((event): string => event.id), [apple.id, holiday.id]);
  assert.equal(original[0], holiday);
  const nextDay = new Date(`${apple.timing.date}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  nextDay.setUTCHours(2);
  assert.deepEqual(nextHighlights([apple], 'Asia/Shanghai', nextDay), [apple]);
  nextDay.setUTCHours(12);
  assert.deepEqual(nextHighlights([apple], 'Asia/Shanghai', nextDay), []);
});
