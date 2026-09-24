import { load } from 'cheerio';
import type { MarketEvent } from '../src/model.ts';
import { datedEvent, englishMonth, isoDay, nonEmpty, requireMatch, sources } from './shared.ts';

export function parseFed(html: string, year: number): MarketEvent[] {
  const $ = load(html);
  const events: MarketEvent[] = $('.panel').toArray().flatMap((panel): MarketEvent[] => {
    const heading: string = $(panel).find('.panel-heading').text();
    const match = heading.match(/(\d{4}) FOMC Meetings/);
    if (!match || Number(match[1]) < year) return [];
    const meetingYear: number = Number(match[1]);
    return $(panel).find('.fomc-meeting').toArray().flatMap((row): MarketEvent[] => {
      const monthNames: string[] = $(row).find('.fomc-meeting__month').text().trim().split('/');
      const dates: string = $(row).find('.fomc-meeting__date').text().trim();
      const range = requireMatch(dates, /^(\d{1,2})(?:-(\d{1,2}))?\*?$/, 'FOMC meeting dates');
      const startMonth: number = englishMonth(monthNames[0]!);
      const endMonth: number = englishMonth(monthNames[monthNames.length - 1]!);
      const start: string = isoDay(meetingYear, startMonth, Number(range[1]));
      const end: string = isoDay(meetingYear, endMonth, Number(range[2] ?? range[1]));
      return [...new Set([start, end])].map((day: string): MarketEvent => datedEvent(sources.fed,
        day === end ? 'FOMC · 议息会议末日' : 'FOMC · 议息会议首日', day, 'fed', 'America/New_York',
        `美东会议日期，声明具体发布时间待官方确认。关注政策利率、政策措辞${dates.includes('*') ? '及经济预测（SEP）' : ''}；不代表一定加息或降息。`));
    });
  });
  return nonEmpty(events, sources.fed);
}

export function parseBoj(html: string, year: number): MarketEvent[] {
  const $ = load(html);
  const events: MarketEvent[] = $('table').toArray().flatMap((table): MarketEvent[] => {
    const match = $(table).find('caption').text().match(/(\d{4})/);
    if (!match || Number(match[1]) < year) return [];
    return $(table).find('tbody tr').toArray().flatMap((row): MarketEvent[] => {
      const text: string = $(row).find('td').first().text().trim();
      if (!text) return [];
      const date = requireMatch(text, /^([A-Za-z.]+)\s+(\d+)\s*\([^)]+\),\s*(\d+)\s*\(/, 'BOJ meeting');
      return [date[2]!, date[3]!].map((day: string, index: number): MarketEvent => datedEvent(sources.boj,
        index === 0 ? 'BOJ · 日本央行会议首日' : 'BOJ · 日本央行利率决议日', isoDay(Number(match[1]), englishMonth(date[1]!), Number(day)),
        'fed', 'Asia/Tokyo', '日本当地会议日期，决议发布时间未固定。关注日元利率、汇率及跨市场资金变化；会议安排不代表已决定加息，也不预测波动持续时间。'));
    });
  });
  return nonEmpty(events, sources.boj);
}
