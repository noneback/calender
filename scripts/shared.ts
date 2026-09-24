import { z } from 'zod';
import type { MarketEvent } from '../src/model.ts';

export interface Source { id: string; name: string; url: string }
export const sources = {
  expirations: { id: 'expirations', name: 'CME · 季度衍生品到期', url: 'https://www.cmegroup.com/trading/equity-index/rolldates.html' },
  macro: { id: 'macro', name: '纽约联储 · 经济日历', url: 'https://www.newyorkfed.org/research/calendars/nationalecon_cal' },
  fed: { id: 'fed', name: 'Federal Reserve · 美联储', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
  boj: { id: 'boj', name: '日本央行 · BOJ', url: 'https://www.boj.or.jp/en/mopo/mpmsche_minu/' },
  nyse: { id: 'nyse', name: 'NYSE · 交易日历', url: 'https://www.nyse.com/markets/hours-calendars' },
  sse: { id: 'sse', name: '上交所 · 休市安排', url: 'https://www.sse.com.cn/disclosure/dealinstruc/closed/' },
  holdings: { id: 'holdings', name: 'iShares · IVV 持仓', url: 'https://www.ishares.com/us/products/239726/ishares-core-s-p-500-etf/latest-holdings.csv' },
  earnings: { id: 'earnings', name: 'Nasdaq · 预估财报日历', url: 'https://www.nasdaq.com/market-activity/earnings' },
} satisfies Record<string, Source>;

export function requireMatch(text: string, pattern: RegExp, context: string): RegExpMatchArray {
  const match: RegExpMatchArray | null = text.match(pattern);
  if (!match) throw new Error(`Cannot parse ${context}: ${text.slice(0, 300)}`);
  return match;
}

export function isoDay(year: number, month: number, day: number): string {
  return z.iso.date().parse(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}

export function englishMonth(name: string): number {
  const months: readonly string[] = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const index: number = months.indexOf(name.toLowerCase().slice(0, 3));
  if (index === -1) throw new Error(`Unrecognized month: ${name}`);
  return index + 1;
}

/** Resolve scheduled US daytime releases using IANA DST rules, never a fixed ET offset. */
export function easternTime(day: string, time: string): string {
  const probe: Date = new Date(`${day}T12:00:00Z`);
  const offset: string = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })
    .formatToParts(probe).find((part: Intl.DateTimeFormatPart): boolean => part.type === 'timeZoneName')!.value.replace('GMT', '');
  return new Date(`${day}T${time}:00${offset}`).toISOString();
}

export function datedEvent(source: Source, title: string, day: string, category: MarketEvent['category'], zone: 'America/New_York' | 'Asia/Shanghai' | 'Asia/Tokyo', note: string): MarketEvent {
  return { id: `${source.id}-${day}-${title}`, title, category, timing: { kind: 'date', date: day, zone }, note, source: { name: source.name, url: source.url } };
}

export function nonEmpty(events: MarketEvent[], source: Source): MarketEvent[] {
  if (!events.length) throw new Error(`No events parsed from ${source.name}; URL=${source.url}. Source layout or coverage may have changed.`);
  return events;
}

/** Send a source-specific Accept header; Nasdaq rejects broad HTML-oriented request headers. */
export async function fetchText(url: string, accept: string): Promise<string> {
  for (let attempt: number = 1; attempt <= 3; attempt += 1) {
    try {
      const response: Response = await fetch(url, { headers: { 'User-Agent': 'MarketCalendar/0.1', Accept: accept }, signal: AbortSignal.timeout(30000) });
      const body: string = await response.text();
      if (!response.ok) throw new Error(`GET ${url}: HTTP ${response.status}; response=${body.slice(0, 400)}`);
      return body;
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      console.warn(JSON.stringify({ message: 'Source request failed', url, attempt, error: error.message }));
      if (attempt === 3) throw error;
      await new Promise<void>((resolve): void => { setTimeout(resolve, attempt * 1500); });
    }
  }
  throw new Error(`Request retry loop exhausted: ${url}`);
}
