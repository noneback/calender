import { z } from 'zod';

export const categorySchema = z.enum(['inflation', 'employment', 'fed', 'holiday', 'macro', 'earnings', 'expiration', 'personal']);
export const zoneSchema = z.enum(['Asia/Shanghai', 'America/New_York']);
export type Category = z.infer<typeof categorySchema>;
export type Zone = z.infer<typeof zoneSchema>;
export const categories: Readonly<Record<Category, string>> = {
  expiration: '衍生品到期', inflation: '通胀数据', employment: '就业数据', fed: '央行政策', holiday: '交易日历', macro: '经济活动', earnings: '龙头财报', personal: '个人事件',
};
const dateSchema = z.iso.date();
const timingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('timed'), at: z.iso.datetime() }),
  z.object({ kind: z.literal('date'), date: dateSchema, zone: z.enum(['America/New_York', 'Asia/Shanghai', 'Asia/Tokyo']) }),
]);
export const eventSchema = z.object({
  id: z.string().min(1), title: z.string().trim().min(1).max(100),
  category: categorySchema, timing: timingSchema,
  note: z.string().max(2000),
  source: z.object({ name: z.string().min(1), url: z.url().refine((url: string): boolean => new URL(url).protocol === 'https:') }).nullable(),
});
export type MarketEvent = z.infer<typeof eventSchema>;
export const savedSchema = z.object({
  version: z.literal(1), zone: zoneSchema, favorites: z.array(z.string()),
  events: z.array(eventSchema.refine((event: MarketEvent): boolean => event.category === 'personal' && event.id.startsWith('personal-'))),
}).refine((saved): boolean => new Set(saved.events.map((event): string => event.id)).size === saved.events.length, { message: '个人事件 ID 重复' });
export type Saved = z.infer<typeof savedSchema>;

export function dateKey(date: Date, zone: Zone): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Date-only events retain the official market date in every display timezone. */
export function eventDay(event: MarketEvent, zone: Zone): string {
  return event.timing.kind === 'date' ? event.timing.date : dateKey(new Date(event.timing.at), zone);
}

export function eventTime(event: MarketEvent, zone: Zone): string {
  return event.timing.kind === 'date' ? ({ 'America/New_York': event.category === 'expiration' ? '美东日期 · 分合约结算' : event.category === 'holiday' ? '全天 · 美东日期' : '美东日期 · 时间待定', 'Asia/Shanghai': '全天 · 中国日期', 'Asia/Tokyo': '日本日期 · 时间待定' }[event.timing.zone]) : new Intl.DateTimeFormat('zh-CN', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(event.timing.at));
}

export function shiftMonth(month: string, amount: number): string {
  const date: Date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

export function monthDays(month: string): string[] {
  const first: Date = new Date(`${month}-01T12:00:00Z`);
  const offset: number = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index: number): string => {
    const date: Date = new Date(first);
    date.setUTCDate(1 - offset + index);
    return date.toISOString().slice(0, 10);
  });
}

export function sortEvents(events: readonly MarketEvent[], zone: Zone): MarketEvent[] {
  return [...events].sort((a: MarketEvent, b: MarketEvent): number =>
    eventDay(a, zone).localeCompare(eventDay(b, zone)) || (a.timing.kind === 'date' ? '' : a.timing.at).localeCompare(b.timing.kind === 'date' ? '' : b.timing.at) || a.id.localeCompare(b.id));
}

/** Personal timed events are entered explicitly in Beijing time, avoiding ambiguous DST wall times. */
export function beijingToUtc(day: string, time: string): string {
  dateSchema.parse(day);
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).parse(time);
  return new Date(`${day}T${time}:00+08:00`).toISOString();
}

export const leaderSchema = z.object({ symbol: z.string().min(1), name: z.string().min(1), sector: z.string().min(1), weight: z.number().nonnegative() });
export type Leader = z.infer<typeof leaderSchema>;
export const sourceStatusSchema = z.object({
  id: z.string(), name: z.string(), url: z.url(), status: z.enum(['ok', 'error']),
  checkedAt: z.iso.datetime(), count: z.number().int().nonnegative(),
  start: z.iso.date().nullable(), end: z.iso.date().nullable(), error: z.string().nullable(),
});
export const feedSchema = z.object({
  generatedAt: z.iso.datetime(), sources: z.array(sourceStatusSchema),
  events: z.array(eventSchema), leaders: z.array(leaderSchema), holdingsDate: z.string().nullable(),
}).refine((feed): boolean => new Set(feed.events.map((event): string => event.id)).size === feed.events.length, { message: 'Duplicate event IDs' });
export type Feed = z.infer<typeof feedSchema>;
