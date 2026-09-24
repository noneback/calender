import { load } from 'cheerio';
import type { MarketEvent } from '../src/model.ts';
import { easternTime, englishMonth, isoDay, nonEmpty, requireMatch, sources } from './shared.ts';

interface Indicator { pattern: RegExp; title: string; category: MarketEvent['category']; note: string }
const indicators: readonly Indicator[] = [
  { pattern: /^Consumer Price Index$/, title: 'CPI · 美国消费者价格指数', category: 'inflation', note: '关注整体与核心通胀，可能影响利率预期。' },
  { pattern: /^Employment Situation$/, title: '非农 · 美国就业报告', category: 'employment', note: '关注非农就业、失业率和时薪变化。' },
  { pattern: /^Producer Price Index/, title: 'PPI · 美国生产者价格指数', category: 'inflation', note: '观察生产端价格压力。' },
  { pattern: /^JOLTS$/, title: 'JOLTS · 职位空缺', category: 'employment', note: '观察劳动力需求。' },
  { pattern: /^Initial Claims$/, title: '美国初请失业金人数', category: 'employment', note: '观察就业市场的高频变化。' },
  { pattern: /^ADP National/, title: 'ADP · 私营部门就业', category: 'employment', note: '私营部门就业报告，统计口径不同于非农。' },
  { pattern: /^ISM Manufacturing$/, title: 'ISM · 制造业 PMI', category: 'macro', note: '观察美国制造业景气度。' },
  { pattern: /^ISM Non-Manufacturing$/, title: 'ISM · 服务业 PMI', category: 'macro', note: '观察美国服务业景气度。' },
  { pattern: /^Advance Retail Sales$/, title: '美国零售销售', category: 'macro', note: '观察消费需求。' },
  { pattern: /^Gross Domestic Product/, title: 'GDP · 美国国内生产总值', category: 'macro', note: '观察经济增长，留意初值与修正值。' },
  { pattern: /^Personal Income and the PCE/, title: 'PCE · 个人收入与支出', category: 'inflation', note: '关注 PCE 与核心 PCE 通胀。' },
  { pattern: /^Michigan Consumer Survey/, title: '密歇根大学消费者调查', category: 'macro', note: '关注消费信心与通胀预期。' },
];

export function parseMacro(html: string, url: string): MarketEvent[] {
  const $ = load(html);
  const heading: string = $('.ts-data-table-head').toArray().map((node): string => $(node).text().trim()).find((text): boolean => /^[A-Z][a-z]+ \d{4}$/.test(text)) ?? '';
  const month = requireMatch(heading, /^([A-Za-z]+) (\d{4})$/, 'NY Fed calendar month');
  const events: MarketEvent[] = $('td.somatdR').toArray().flatMap((cell): MarketEvent[] => {
    const content = $(cell).find('.ts-accordion-content');
    if (!content.length) return [];
    const day: string = isoDay(Number(month[2]), englishMonth(month[1]!), Number(requireMatch($(cell).text().trim(), /^(\d{1,2})/, 'NY Fed day')[1]));
    return content.find('a').toArray().flatMap((link): MarketEvent[] => {
      const name: string = $(link).text().trim();
      const indicator: Indicator | undefined = indicators.find((item): boolean => item.pattern.test(name));
      if (!indicator) return [];
      const siblings = $(link).parent().contents().toArray();
      const start: number = siblings.indexOf(link) + 1;
      const nextLink: number = siblings.slice(start).findIndex((node): boolean => node.type === 'tag' && node.name === 'a');
      const after: string = siblings.slice(start, nextLink === -1 ? undefined : start + nextLink).map((node): string => $(node).text()).join('');
      const time: string = requireMatch(after, /\((\d{2}:\d{2})\)/, `NY Fed time: ${name}`)[1]!;
      return [{ id: `macro-${day}-${name}`, title: indicator.title, category: indicator.category,
        timing: { kind: 'timed', at: easternTime(day, time) },
        note: `${indicator.note} 来源条目：${name}。日程可能调整，不包含预测值或实际公布值。`, source: { name: sources.macro.name, url } }];
    });
  });
  return nonEmpty(events, sources.macro);
}

export function nextMacroUrl(html: string): string {
  const $ = load(html);
  const href: string | undefined = $('a').filter((_, node): boolean => $(node).text().includes('NEXT MONTH')).attr('href');
  if (!href) throw new Error('NY Fed next-month calendar link missing');
  const url: URL = new URL(href, sources.macro.url);
  if (url.origin !== 'https://www.newyorkfed.org') throw new Error(`Unexpected calendar origin: ${url.origin}`);
  return url.href;
}
