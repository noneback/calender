import { load } from 'cheerio';
import type { MarketEvent } from '../src/model.ts';
import { datedEvent, isoDay, nonEmpty, requireMatch, sources } from './shared.ts';

/** Use published US expirations, not roll dates or a third-Friday approximation. */
export function parseExpirations(html: string, year: number): MarketEvent[] {
  const $ = load(html);
  const tables = $('table').filter((_, table): boolean => $(table).find('th').toArray()
    .some((cell): boolean => $(cell).text().trim() === 'U.S. Indexes'));
  if (tables.length !== 1) throw new Error(`CME expiration table missing or ambiguous: URL=${sources.expirations.url}, tables=${tables.length}`);
  const headers: string[] = tables.find('th').toArray().map((cell): string => $(cell).text().trim());
  if (headers.join('|') !== 'Year|Month|U.S. Indexes|Nikkei / TOPIX|Expiration|Roll|Expiration|Roll') {
    throw new Error(`CME expiration columns changed: headers=${headers.join('|')}`);
  }
  const events: MarketEvent[] = tables.find('tr').toArray().flatMap((row): MarketEvent[] => {
    const cells: string[] = $(row).find('td').toArray().map((cell): string => $(cell).text().trim());
    if (!cells.length) return [];
    const rowYear: number = Number(cells[0]);
    const month: number = Number(cells[1]);
    if (cells.length !== 6 || !Number.isInteger(rowYear) || rowYear < 2020 || ![3, 6, 9, 12].includes(month)) {
      throw new Error(`CME expiration row invalid: cells=${JSON.stringify(cells)}`);
    }
    const match: RegExpMatchArray = requireMatch(cells[2]!, /^(\d{1,2})\/(\d{1,2})$/, 'CME US expiration date');
    if (Number(match[1]) !== month) throw new Error(`CME expiration month mismatch: cells=${JSON.stringify(cells)}`);
    const day: string = isoDay(rowYear, month, Number(match[2]));
    if (rowYear < year) return [];
    return [datedEvent(sources.expirations, '三巫日 / 四巫日 · 季度集中到期', day, 'expiration', 'America/New_York',
      '季度衍生品集中到期窗口，日期取自 CME 美国股指期货官方到期表（非移仓日），包含假期调整。三巫日指股票期权、股指期权与股指期货集中到期；四巫日是历史上另计个股期货的称呼，此处合并检索，不重复计数。不同合约的最后交易日及 AM/PM 结算时点不同，不代表全部在收盘同时到期。关注移仓、对冲与成交量变化，不表示必然大涨、大跌或持续震荡。')];
  });
  const dates: string[] = events.map((event): string => event.timing.kind === 'date' ? event.timing.date : '');
  if (new Set(dates).size !== dates.length || dates.filter((day): boolean => day.startsWith(`${year}-`)).length !== 4) {
    throw new Error(`CME quarterly expirations incomplete or duplicated for year=${year}: dates=${dates.join(',')}`);
  }
  return nonEmpty(events, sources.expirations);
}
