import { eventDay, eventSchema } from '../src/model.ts';
import type { MarketEvent } from '../src/model.ts';
import { parseNyse, parseSse } from './holidays.ts';
import { parseNysePdf } from './nyse-pdf.ts';
import { fetchPdf, fetchText, sources } from './shared.ts';
import type { Source } from './shared.ts';

// Official published documents, not proxy mirrors or challenge bypasses. These
// are fetched on every run and accepted only while they cover the current year.
export const holidayAlternatives: Readonly<Record<'nyse' | 'sse', Source>> = {
  nyse: { id: 'nyse', name: 'NYSE / ICE · 官方交易日历公告', url: 'https://ir.theice.com/press/news-details/2025/NYSE-Group-Announces-2026-2027-and-2028-Holiday-and-Early-Closings-Calendar/default.aspx' },
  sse: { id: 'sse', name: '上交所 · 官方年度休市公告', url: 'https://www.sse.com.cn/disclosure/dealinstruc/closed/c/c_20251222_10802510.shtml' },
};

export const nysePdf: Source = { id: 'nyse', name: 'NYSE / ICE · 官方交易日历公告 PDF', url: 'https://s2.q4cdn.com/154085107/files/doc_news/NYSE-Group-Announces-2026-2027-and-2028-Holiday-and-Early-Closings-Calendar-2025.pdf' };

export async function fetchHolidayCalendar(id: 'nyse' | 'sse', year: number,
  request: typeof fetchText = fetchText, requestPdf: typeof fetchPdf = fetchPdf): Promise<{ source: Source; events: MarketEvent[] }> {
  const parser = id === 'nyse' ? parseNyse : parseSse;
  const errors: string[] = [];
  const candidates = [sources[id], holidayAlternatives[id]].map((source) => ({ source,
    load: async (): Promise<MarketEvent[]> => parser(await request(source.url, 'text/html'), source) }));
  if (id === 'nyse') candidates.push({ source: nysePdf, load: async (): Promise<MarketEvent[]> => parseNysePdf(await requestPdf(nysePdf.url), nysePdf) });
  for (const { source, load } of candidates) {
    try {
      const events = eventSchema.array().parse(await load());
      if (!events.some((event): boolean => eventDay(event, 'America/New_York').startsWith(`${year}-`))) {
        throw new Error(`Official holiday calendar does not cover current year ${year}`);
      }
      if (source.url !== sources[id].url) console.info(JSON.stringify({ message: 'Using live official holiday announcement', source: id, url: source.url, year }));
      return { source, events };
    } catch (error) {
      errors.push(`${source.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Official ${id.toUpperCase()} calendars unavailable: ${errors.join('; ')}`);
}
