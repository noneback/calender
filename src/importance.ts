import { eventDay } from './model.ts';
import type { Leader, MarketEvent, Zone } from './model.ts';

export type ImportanceLevel = 'high' | 'medium' | 'normal';
export interface Importance {
  level: ImportanceLevel;
  label: string;
  reason: string;
}
export type RankedEvent = MarketEvent & { importance: Importance };

export const importanceNotice: string = '本站按事件类型和指数权重设置关注等级，非官方评级，也不代表确定的涨跌方向或波动幅度。';
export const importanceGuide: readonly { label: string; description: string }[] = [
  { label: '重点关注', description: '季度三巫日／四巫日；CPI、非农、PCE；FOMC 会议末日与日本央行决议日；当前 IVV 代表公司清单中整体权重前十的预估财报。' },
  { label: '值得留意', description: '其他已收录经济数据、央行会议首日、行业代表公司财报，以及中美休市和提前收市安排。' },
  { label: '常规事项', description: '不属于以上规则的事项。关注等级与个人关注、来源可信度、日期是否确认是不同概念。' },
];

/** Editorial attention rules use known event kinds; no numerical volatility forecast is inferred. */
function assessImportance(event: MarketEvent, leadingSymbols: ReadonlySet<string>): Importance {
  if (event.category === 'expiration') {
    return { level: 'high', label: '重点关注', reason: '季度衍生品集中到期，移仓与对冲可能改变成交量和盘中价格行为；关注开盘结算及收盘资金流，不预设涨跌方向。' };
  }
  if (event.category === 'inflation' && event.title.startsWith('CPI ·')) {
    return { level: 'high', label: '重点关注', reason: '观察整体与核心通胀，是跟踪美国通胀和利率预期的关键月度发布。' };
  }
  if (event.category === 'inflation' && event.title.startsWith('PCE ·')) {
    return { level: 'high', label: '重点关注', reason: 'PCE 是美联储长期通胀目标采用的价格指标，关注核心通胀与消费支出。' };
  }
  if (event.category === 'employment' && event.title.startsWith('非农 ·')) {
    return { level: 'high', label: '重点关注', reason: '同时观察新增就业、失业率与薪资，是判断美国劳动力市场的重要月度报告。' };
  }
  if (event.category === 'fed') {
    if (event.title.includes('FOMC') && event.title.includes('末日')) {
      return { level: 'high', label: '重点关注', reason: 'FOMC 会议收官日，重点跟踪利率决定和政策措辞；具体发布时间以官方日程为准。' };
    }
    if (event.title.includes('BOJ') && event.title.includes('决议')) {
      return { level: 'high', label: '重点关注', reason: '跟踪日本央行利率决议及日元政策变化，留意汇率和跨市场资金反应。' };
    }
    return { level: 'medium', label: '值得留意', reason: '央行会议进程，提前准备跟踪会议结果；会议首日不等于政策决议发布日。' };
  }
  if (event.category === 'earnings') {
    const symbol: string = event.title.split(' · ')[0]!;
    if (leadingSymbols.has(symbol)) {
      return { level: 'high', label: '重点关注', reason: '公司位于当前 IVV 代表清单的权重前十，优先跟踪财报与指引；日程仍为预估。' };
    }
    return { level: 'medium', label: '值得留意', reason: '行业代表公司的财报窗口，关注业绩与经营指引；预估日期需以公司公告确认。' };
  }
  if (event.category === 'holiday') {
    return { level: 'medium', label: '值得留意', reason: '影响相关市场的可交易时段与假期安排；休市本身不代表市场一定出现大幅波动。' };
  }
  if (event.category === 'inflation' || event.category === 'employment' || event.category === 'macro') {
    return { level: 'medium', label: '值得留意', reason: '用于补充观察通胀、就业或经济景气，实际影响取决于数据与市场预期的差异。' };
  }
  return { level: 'normal', label: '常规事项', reason: '未命中本站重点事件规则，可结合实际内容自行判断关注程度。' };
}

/** Derive priorities without modifying the published feed or the saved-data schema. */
export function rankEvents(events: readonly MarketEvent[], leaders: readonly Leader[]): RankedEvent[] {
  const leadingSymbols: ReadonlySet<string> = new Set([...leaders]
    .sort((a: Leader, b: Leader): number => b.weight - a.weight || a.symbol.localeCompare(b.symbol))
    .slice(0, 10).map((leader: Leader): string => leader.symbol));
  return events.map((event: MarketEvent): RankedEvent => ({ ...event, importance: assessImportance(event, leadingSymbols) }));
}

/** Stable sorting keeps the existing chronology among events of equal priority. */
export function byImportance(events: readonly RankedEvent[]): RankedEvent[] {
  const order: Readonly<Record<ImportanceLevel, number>> = { high: 0, medium: 1, normal: 2 };
  return [...events].sort((a: RankedEvent, b: RankedEvent): number => order[a.importance.level] - order[b.importance.level]);
}

/** Date-only events remain relevant until their source-local calendar day ends. */
export function nextHighlights(events: readonly RankedEvent[], zone: Zone, now: Date): RankedEvent[] {
  return events.filter((event: RankedEvent): boolean => {
    if (event.importance.level !== 'high') return false;
    if (event.timing.kind === 'timed') return Date.parse(event.timing.at) >= now.getTime();
    const sourceToday: string = new Intl.DateTimeFormat('en-CA', {
      timeZone: event.timing.zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    return event.timing.date >= sourceToday;
  }).sort((a: RankedEvent, b: RankedEvent): number => eventDay(a, zone).localeCompare(eventDay(b, zone)) ||
    (a.timing.kind === 'timed' ? a.timing.at : '').localeCompare(b.timing.kind === 'timed' ? b.timing.at : '') || a.id.localeCompare(b.id)).slice(0, 3);
}
