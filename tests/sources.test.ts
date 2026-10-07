import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBoj, parseFed } from '../scripts/policy.ts';
import { parseNyse, parseSse } from '../scripts/holidays.ts';
import { fetchHolidayCalendar, holidayAlternatives } from '../scripts/holiday-source.ts';
import { sources } from '../scripts/shared.ts';
import { parseMacro } from '../scripts/macro.ts';
import { parseLeaders, parseEarnings } from '../scripts/earnings.ts';
import { parseExpirations } from '../scripts/expirations.ts';
import { rankEvents } from '../src/importance.ts';
import { filteredEvents } from '../src/view.ts';
import type { ViewState } from '../src/view.ts';
import type { Saved } from '../src/model.ts';
import { eventSchema, eventDay } from '../src/model.ts';

/** Fixtures are excerpts of actual publisher responses captured on 2026-09-24/25. */
function fixture(name: string): string { return readFileSync(`tests/fixtures/${name}`, 'utf8'); }

test('official HTML calendar integrations parse real publisher structures', (): void => {
  const macro = parseMacro(fixture('nyfed.html'), 'https://www.newyorkfed.org/research/calendars/nationalecon_cal');
  const fed = parseFed(fixture('fed.html'), 2026);
  const boj = parseBoj(fixture('boj.html'), 2026);
  const nyse = parseNyse(fixture('nyse.html'));
  const sse = parseSse(fixture('sse.html'));
  for (const events of [macro, fed, boj, nyse, sse]) {
    assert.ok(events.length > 10);
    eventSchema.array().parse(events);
    assert.equal(new Set(events.map((event): string => event.id)).size, events.length);
  }
  assert.ok(macro.some((event): boolean => event.title.startsWith('CPI')));
  assert.ok(nyse.some((event): boolean => event.timing.kind === 'timed' && event.timing.at === '2026-11-27T18:00:00.000Z'));
  assert.equal(sse.filter((event): boolean => event.title.startsWith('国庆节')).length, 7);
  assert.throws((): void => { parseFed('<html>Service unavailable</html>', 2026); }, /No events parsed/);
});

test('official annual announcements preserve holiday dates and early closes', (): void => {
  const dates = (events: ReturnType<typeof parseNyse>) => events.map(({ id, title, timing }) => ({ id, title, timing })).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(dates(parseNyse(fixture('nyse-ice.html'))), dates(parseNyse(fixture('nyse.html'))));
  assert.deepEqual(dates(parseSse(fixture('sse-2026.html'))), dates(parseSse(fixture('sse.html'))));
  assert.equal(parseNyse(fixture('nyse-ice.html')).length, 34);
  assert.equal(parseSse(fixture('sse-2026.html')).length, 33);
  assert.throws((): void => { parseNyse(fixture('nyse-ice.html').replaceAll('Each market will close early at 1:00 p.m.', 'Missing')); }, /early-close/);
  assert.throws((): void => { parseNyse(fixture('nyse-ice.html').replace("Washington's Birthday", 'Unknown')); }, /Unknown NYSE holiday/);
});

test('403 uses a fetched official alternative with exact provenance, never invented or stale-year dates', async (): Promise<void> => {
  for (const id of ['nyse', 'sse'] as const) {
    const calls: string[] = [];
    const request = async (url: string): Promise<string> => {
      calls.push(url);
      if (url === sources[id].url) throw new Error('HTTP 403');
      return fixture(id === 'nyse' ? 'nyse-ice.html' : 'sse-2026.html');
    };
    const result = await fetchHolidayCalendar(id, 2026, request);
    assert.deepEqual(calls, [sources[id].url, holidayAlternatives[id].url]);
    assert.deepEqual(result.source, holidayAlternatives[id]);
    assert.ok(result.events.every((event): boolean => event.source?.url === holidayAlternatives[id].url));
    await assert.rejects(fetchHolidayCalendar(id, 2029, request), /does not cover current year 2029/);
    await assert.rejects(fetchHolidayCalendar(id, 2026, async (): Promise<string> => '<html>Blocked</html>'), /calendars unavailable/);
  }
});

test('holdings drive a diversified earnings universe and Nasdaq dates ignore host timezone', (): void => {
  const { leaders } = parseLeaders(fixture('ivv.csv'));
  assert.equal(new Set(leaders.map((leader): string => leader.sector)).size, 11);
  const earnings = parseEarnings(fixture('earnings.json'), '2026-10-29', leaders);
  assert.ok(earnings.some((event): boolean => event.title.startsWith('AAPL')));
  assert.ok(earnings.every((event): boolean => event.category === 'earnings' && event.title.includes('预估')));
  assert.throws((): void => { parseEarnings(fixture('earnings.json'), '2026-10-28', leaders); }, /wrong day/);
  assert.throws((): void => { parseEarnings('{"status":{"rCode":403}}', '2026-10-29', leaders); });
});

test('negative cash or derivative balances do not invalidate equity leaders or earnings', (): void => {
  const csv = fixture('ivv.csv');
  const expected = parseLeaders(csv);
  // Same shape and cash weight as the live 2026-10-05 IVV export that broke sync.
  const cash = '\n"USD","USD CASH","Cash and/or Derivatives","Cash","-1.00","-0.03","-1.00","-1.00","100.00","United States","-","USD","1.00","USD","-"\n';
  const withCash = parseLeaders(csv + cash);
  assert.deepEqual(withCash, expected);
  assert.deepEqual(parseLeaders(csv + cash.replace('"Cash",', '"Futures",')), expected);
  assert.ok(withCash.leaders.every((leader): boolean => leader.weight >= 0 && leader.symbol !== 'USD'));
  assert.ok(parseEarnings(fixture('earnings.json'), '2026-10-29', withCash.leaders).length > 0);
  assert.throws((): void => { parseLeaders(csv.replace('"8.27"', '"-8.27"')); }, /Too small/);
  for (const weight of ['', 'NaN', 'Infinity', 'invalid']) {
    assert.throws((): void => { parseLeaders(csv + cash.replace('"-0.03"', `"${weight}"`)); });
  }
  assert.throws((): void => { parseLeaders(csv.split('\n').slice(0, 30).join('\n')); }, /holdings incomplete/);
  assert.throws((): void => { parseLeaders(csv.replaceAll('"Real Estate"', '"Financials"')); }, /Expected 11 equity sectors/);
});

test('CME quarterly expirations use official holiday shifts and feed into highlighted calendar', (): void => {
  const events = parseExpirations(fixture('cme.html'), 2026);
  eventSchema.array().parse(events);
  assert.deepEqual(events.slice(0, 4).map((event): string => eventDay(event, 'Asia/Shanghai')),
    ['2026-03-20', '2026-06-18', '2026-09-18', '2026-12-18']);
  assert.equal(events.length, 12);
  const ranked = rankEvents(events, []);
  const saved: Saved = { version: 1, zone: 'Asia/Shanghai', favorites: [], events: [] };
  const state: ViewState = { month: '2026-09', day: '2026-09-18', query: '四巫日', category: 'all', favoritesOnly: false, importantOnly: true, view: 'month' };
  assert.equal(filteredEvents(ranked, state, saved).length, events.length);
  assert.equal(filteredEvents(ranked, { ...state, query: '三巫日' }, saved).length, events.length);
  assert.throws((): void => { parseExpirations('<html>Access denied</html>', 2026); }, /table missing/);
  assert.throws((): void => { parseExpirations(fixture('cme.html').replace('6/18', 'bad-date'), 2026); }, /Cannot parse/);
  assert.throws((): void => { parseExpirations(fixture('cme.html'), 2029); }, /incomplete/);
});
