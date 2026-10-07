import { mkdir, writeFile } from 'node:fs/promises';
import { feedSchema, eventSchema, eventDay } from '../src/model.ts';
import type { Feed, MarketEvent, Leader } from '../src/model.ts';
import { fetchText, sources } from './shared.ts';
import type { Source } from './shared.ts';
import { parseFed, parseBoj } from './policy.ts';
import { fetchHolidayCalendar } from './holiday-source.ts';
import { nextMacroUrl, parseMacro } from './macro.ts';
import { parseExpirations } from './expirations.ts';
import { parseEarnings, parseLeaders } from './earnings.ts';

interface SourceResult { source: Source; events: MarketEvent[]; leaders: Leader[]; holdingsDate: string | null; start: string | null; end: string | null }
const now: Date = new Date();
const year: number = now.getUTCFullYear();
const generatedAt: string = now.toISOString();

async function calendarSource(source: Source, parser: (html: string) => MarketEvent[]): Promise<SourceResult> {
  const events: MarketEvent[] = eventSchema.array().parse(parser(await fetchText(source.url, 'text/html')));
  const days: string[] = events.map((event): string => eventDay(event, 'America/New_York')).sort();
  return { source, events, leaders: [], holdingsDate: null, start: days[0] ?? null, end: days.at(-1) ?? null };
}

async function macroSource(): Promise<SourceResult> {
  let url: string = sources.macro.url;
  let events: MarketEvent[] = [];
  for (let month: number = 0; month < 3; month += 1) {
    const html: string = await fetchText(url, 'text/html');
    events = [...events, ...parseMacro(html, url)];
    url = nextMacroUrl(html);
  }
  const days: string[] = events.map((event): string => eventDay(event, 'America/New_York')).sort();
  return { source: sources.macro, events, leaders: [], holdingsDate: null, start: days[0]!, end: days.at(-1)! };
}

async function holdingsSource(): Promise<SourceResult> {
  const holdings = parseLeaders(await fetchText(sources.holdings.url, 'text/csv'));
  return { source: sources.holdings, events: [], ...holdings, start: null, end: null };
}

async function holidaySource(id: 'nyse' | 'sse'): Promise<SourceResult> {
  const { source, events } = await fetchHolidayCalendar(id, year);
  const days = events.map((event): string => eventDay(event, 'America/New_York')).sort();
  return { source, events, leaders: [], holdingsDate: null, start: days[0]!, end: days.at(-1)! };
}

async function earningsSource(holdings: Promise<SourceResult>): Promise<SourceResult> {
  const { leaders, holdingsDate } = await holdings;
  const start: string = now.toISOString().slice(0, 10);
  const days: string[] = Array.from({ length: 46 }, (_, index: number): string => new Date(Date.parse(start) + index * 86400000).toISOString().slice(0, 10));
  let events: MarketEvent[] = [];
  // Bound concurrent requests to avoid overwhelming the public calendar endpoint.
  for (let index: number = 0; index < days.length; index += 3) {
    const batch: MarketEvent[][] = await Promise.all(days.slice(index, index + 3).map(async (day: string): Promise<MarketEvent[]> =>
      parseEarnings(await fetchText(`https://api.nasdaq.com/api/calendar/earnings?date=${day}`, 'application/json'), day, leaders)));
    events = [...events, ...batch.flat()];
  }
  return { source: sources.earnings, events, leaders, holdingsDate, start, end: days.at(-1)! };
}

const holdings: Promise<SourceResult> = holdingsSource();
const tasks: { source: Source; promise: Promise<SourceResult> }[] = [
  { source: sources.expirations, promise: calendarSource(sources.expirations, (html): MarketEvent[] => parseExpirations(html, year)) },
  { source: sources.macro, promise: macroSource() },
  { source: sources.fed, promise: calendarSource(sources.fed, (html): MarketEvent[] => parseFed(html, year)) },
  { source: sources.boj, promise: calendarSource(sources.boj, (html): MarketEvent[] => parseBoj(html, year)) },
  { source: sources.nyse, promise: holidaySource('nyse') },
  { source: sources.sse, promise: holidaySource('sse') },
  { source: sources.holdings, promise: holdings },
  { source: sources.earnings, promise: earningsSource(holdings) },
];
const results: PromiseSettledResult<SourceResult>[] = await Promise.allSettled(tasks.map((task): Promise<SourceResult> => task.promise));
const successful: SourceResult[] = results.flatMap((result): SourceResult[] => result.status === 'fulfilled' ? [result.value] : []);
const feed: Feed = feedSchema.parse({
  generatedAt, events: successful.flatMap((result): MarketEvent[] => result.events),
  leaders: successful.find((result): boolean => result.source.id === 'holdings')?.leaders ?? [],
  holdingsDate: successful.find((result): boolean => result.source.id === 'holdings')?.holdingsDate ?? null,
  sources: results.map((result, index) => {
    const source: Source = tasks[index]!.source;
    if (result.status === 'fulfilled') return { ...result.value.source, status: 'ok', checkedAt: generatedAt, count: source.id === 'holdings' ? result.value.leaders.length : result.value.events.length, start: result.value.start, end: result.value.end, error: null };
    const reason: string = result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.error(JSON.stringify({ message: 'Source sync failed; no events published for this source', source: source.id, error: reason }));
    return { ...source, status: 'error', checkedAt: generatedAt, count: 0, start: null, end: null, error: reason };
  }),
});
await mkdir('public/data', { recursive: true });
await writeFile('public/data/events.json', `${JSON.stringify(feed, null, 2)}\n`);
console.info(JSON.stringify({ message: 'Feed written', events: feed.events.length, leaders: feed.leaders.length, sources: feed.sources.map((source) => ({ id: source.id, status: source.status, count: source.count })) }));
if (results.some((result): boolean => result.status === 'rejected')) throw new Error('Calendar sync incomplete. See source errors above and public/data/events.json; failed sources contain no events.');
