import { load } from 'cheerio';
import type { MarketEvent } from '../src/model.ts';
import { datedEvent, easternTime, englishMonth, isoDay, nonEmpty, requireMatch, sources } from './shared.ts';
import type { Source } from './shared.ts';

const holidayNames: Readonly<Record<string, string>> = {
  'New Year’s Day': '元旦', 'Martin Luther King, Jr. Day': '马丁路德金纪念日', "Washington's Birthday": '总统日',
  'Good Friday': '耶稣受难日', 'Memorial Day': '阵亡将士纪念日', 'Juneteenth National Independence Day': '六月节',
  'Independence Day': '独立日', 'Labor Day': '劳动节', 'Thanksgiving Day': '感恩节', 'Christmas Day': '圣诞节',
};

export function parseNyse(html: string, source: Source = sources.nyse): MarketEvent[] {
  const $ = load(html);
  // NYSE's calendar and ICE's official annual release use th/thead and td-only
  // tables respectively. Identify the semantic header rather than its tag.
  const table = $('table').filter((_, element): boolean => /^holiday$/i.test($(element).find('tr').first().children().first().text().trim())).first();
  const rows = table.find('tr').toArray();
  const years: number[] = $(rows[0]).children().toArray().slice(1).map((cell): number => Number($(cell).text().trim()));
  if (!years.length || years.some((year): boolean => !Number.isInteger(year) || year < 2020)) throw new Error('NYSE holiday year headers missing or invalid');
  if (rows.length !== 11) throw new Error(`NYSE holiday table incomplete: ${rows.length - 1} holiday rows`);
  const holidays: MarketEvent[] = rows.slice(1).flatMap((row): MarketEvent[] => {
    const cells = $(row).children();
    const label = cells.first().clone();
    label.find('p').append(' ');
    const name: string = label.text().replace(/\s+/g, ' ').trim();
    if (!(name in holidayNames)) throw new Error(`Unknown NYSE holiday: ${name}`);
    if (cells.length !== years.length + 1) throw new Error(`NYSE holiday columns incomplete: ${name}`);
    return years.flatMap((year: number, index: number): MarketEvent[] => {
      const text: string = cells.eq(index + 1).text().trim();
      if (/^[—–-]\*?$/.test(text)) return [];
      const match = requireMatch(text, /([A-Z][a-z]+)\s+(\d{1,2})/, 'NYSE holiday date');
      return [datedEvent(source, `${holidayNames[name]} · 美股休市`, isoDay(year, englishMonth(match[1]!), Number(match[2])),
        'holiday', 'America/New_York', 'NYSE 股票市场全天休市。按美东交易日期记录；美国节日不等于全部资产市场休市。')];
    });
  });
  const earlyCloses: MarketEvent[] = $('p').toArray().flatMap((paragraph): MarketEvent[] => {
    const text: string = $(paragraph).text();
    if (!text.includes('Each market will close early at 1:00 p.m.')) return [];
    return [...text.matchAll(/(?:Monday|Tuesday|Wednesday|Thursday|Friday), ([A-Z][a-z]+) (\d{1,2}), (\d{4})/g)].map((match): MarketEvent => {
      const day: string = isoDay(Number(match[3]), englishMonth(match[1]!), Number(match[2]));
      return { ...datedEvent(source, '美股提前收市 · 13:00 ET', day, 'holiday', 'America/New_York', 'NYSE 股票常规交易于美东 13:00 结束。部分期权交易时间不同，详见来源。'), timing: { kind: 'timed', at: easternTime(day, '13:00') } };
    });
  });
  if (earlyCloses.length < years.length) throw new Error('NYSE early-close footnotes missing or incomplete');
  return nonEmpty([...holidays, ...earlyCloses], source);
}

export function parseSse(html: string, source: Source = sources.sse): MarketEvent[] {
  const $ = load(html);
  const heading: string = $('strong').filter((_, element): boolean => /\d{4}年休市安排/.test($(element).text())).first().text();
  const year: number = Number(requireMatch(heading, /(\d{4})年/, 'SSE year')[1]);
  const table = $('table').filter((_, element): boolean => $(element).text().includes('春节') && $(element).text().includes('国庆节')).first();
  const events: MarketEvent[] = table.find('tr').toArray().flatMap((row): MarketEvent[] => {
    const cells = $(row).find('td');
    const name: string = cells.first().text().replace('：', '').trim();
    const text: string = cells.eq(1).text().trim();
    const match = requireMatch(text, /(\d+)月(\d+)日[^至]*至(?:(\d+)月)?(\d+)日[^休]*休市/, 'SSE holiday range');
    const start: string = isoDay(year, Number(match[1]), Number(match[2]));
    const end: string = isoDay(year, Number(match[3] ?? match[1]), Number(match[4]));
    const length: number = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
    if (length < 1 || length > 20) throw new Error(`SSE holiday range invalid: ${text}`);
    return Array.from({ length }, (_, index: number): MarketEvent => datedEvent(source, `${name} · A股休市`,
      new Date(Date.parse(start) + index * 86400000).toISOString().slice(0, 10), 'holiday', 'Asia/Shanghai',
      '上交所节假日休市安排，包含假期内周末。中国市场休市可能影响跨市场交易安排；不表示美股或港股同时休市。'));
  });
  return nonEmpty(events, source);
}
