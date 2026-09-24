import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import type { Leader, MarketEvent } from '../src/model.ts';
import { datedEvent, englishMonth, isoDay, requireMatch, sources } from './shared.ts';

const holdingSchema = z.object({
  Ticker: z.string().min(1), Name: z.string().min(1), Sector: z.string().min(1),
  'Asset Class': z.string(), 'Weight (%)': z.coerce.number().nonnegative(),
});

/** Sector top three plus overall top ten; class shares are grouped by issuer name. */
export function parseLeaders(csv: string): { leaders: Leader[]; holdingsDate: string } {
  const start: number = csv.indexOf('Ticker,Name,Sector,');
  if (start < 0) throw new Error('iShares CSV holdings header missing');
  const holdingsDate: string = requireMatch(csv.slice(0, start), /Fund Holdings as of,"([^"]+)"/, 'IVV holdings date')[1]!;
  const rows = z.array(holdingSchema).parse(parse(csv.slice(start), { columns: true, skip_empty_lines: true, trim: true }));
  const equities: Leader[] = rows.filter((row): boolean => row['Asset Class'] === 'Equity')
    .map((row): Leader => ({ symbol: row.Ticker.replace(/ /g, '.'), name: row.Name, sector: row.Sector, weight: row['Weight (%)'] }))
    .sort((a: Leader, b: Leader): number => b.weight - a.weight);
  if (equities.length < 400) throw new Error(`IVV holdings incomplete: ${equities.length} equities`);
  const issuers: Leader[] = equities.filter((item: Leader, index: number, all: Leader[]): boolean =>
    all.findIndex((other: Leader): boolean => other.name.replace(/ CLASS .+$/, '') === item.name.replace(/ CLASS .+$/, '')) === index);
  const sectors: string[] = [...new Set(issuers.map((item): string => item.sector))];
  if (sectors.length !== 11) throw new Error(`Expected 11 equity sectors, received ${sectors.length}; review sector classification`);
  const selected: Leader[] = [...issuers.slice(0, 10), ...sectors.flatMap((sector: string): Leader[] => issuers.filter((item): boolean => item.sector === sector).slice(0, 3))];
  return { leaders: [...new Map(selected.map((item): [string, Leader] => [item.symbol, item])).values()], holdingsDate };
}

const earningsSchema = z.union([
  z.object({
    status: z.object({ rCode: z.literal(200), bCodeMessage: z.null() }),
    data: z.object({ asOf: z.string(), rows: z.array(z.object({ symbol: z.string(), name: z.string(), time: z.string(), fiscalQuarterEnding: z.string() })).nullable() }),
  }),
  z.object({
    status: z.object({ rCode: z.literal(200), bCodeMessage: z.array(z.object({ code: z.literal(1002), errorMessage: z.string() })).min(1) }),
    data: z.null(),
  }),
]);

/** Nasdaq code 1002 is an empty calendar day. Parse asOf as a date, never as host-local midnight. */
export function parseEarnings(json: string, day: string, leaders: readonly Leader[]): MarketEvent[] {
  const parsed = earningsSchema.parse(JSON.parse(json));
  if (parsed.data === null) return [];
  const sourceDate = requireMatch(parsed.data.asOf, /^[A-Za-z]+, ([A-Za-z]+) (\d{1,2}), (\d{4})$/, 'Nasdaq response date');
  const sourceDay: string = isoDay(Number(sourceDate[3]), englishMonth(sourceDate[1]!), Number(sourceDate[2]));
  if (sourceDay !== day) throw new Error(`Nasdaq returned wrong day: requested=${day}, response=${parsed.data.asOf}`);
  const symbols: Set<string> = new Set(leaders.map((leader): string => leader.symbol));
  return (parsed.data.rows ?? []).filter((row): boolean => symbols.has(row.symbol)).map((row): MarketEvent => {
    const session: Readonly<Record<string, string>> = { 'time-pre-market': '盘前', 'time-after-hours': '盘后', 'time-not-supplied': '时间未公布' };
    if (!(row.time in session)) throw new Error(`Unknown Nasdaq earnings session: ${row.time}; symbol=${row.symbol}`);
    return datedEvent(sources.earnings, `${row.symbol} · 预估财报`, day, 'earnings', 'America/New_York',
      `${row.name}，报告期 ${row.fiscalQuarterEnding}，${session[row.time]}。Nasdaq / Zacks 提供的日历可能根据历史规律估算，并非公司已确认日期；请关注公司投资者关系公告。`);
  });
}
