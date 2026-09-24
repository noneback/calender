import { categories, eventDay, eventTime, monthDays } from './model.ts';
import type { Saved, Category, Zone } from './model.ts';
import { byImportance } from './importance.ts';
import type { RankedEvent } from './importance.ts';

export interface ViewState {
  month: string;
  day: string;
  query: string;
  category: Category | 'all';
  favoritesOnly: boolean;
  importantOnly: boolean;
  view: 'month' | 'agenda';
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character: string): string => `&#${character.charCodeAt(0)};`);
}

export function filteredEvents(events: readonly RankedEvent[], state: ViewState, saved: Saved): RankedEvent[] {
  return events.filter((event: RankedEvent): boolean =>
    (state.category === 'all' || state.category === event.category) &&
    (!state.favoritesOnly || saved.favorites.includes(event.id)) &&
    (!state.importantOnly || event.importance.level === 'high') &&
    `${event.title} ${event.note}`.toLowerCase().includes(state.query.trim().toLowerCase()));
}

export function eventCard(event: RankedEvent, saved: Saved): string {
  return `<article class="event-card importance-${event.importance.level}" data-testid="event-card">
    <div class="event-meta"><span class="badge importance-badge">${escapeHtml(event.importance.label)}</span><span>${categories[event.category]}</span><time>${eventTime(event, saved.zone)}</time></div>
    <h3>${escapeHtml(event.title)}</h3><p class="importance-reason"><strong>为什么关注</strong>${escapeHtml(event.importance.reason)}</p>
    ${event.note ? `<details><summary>日程说明${event.note.includes('预估') || event.title.includes('预估') ? ' · 含预估日期，请以公司公告为准' : ''}</summary><p>${escapeHtml(event.note)}</p></details>` : ''}
    ${event.source ? `<div class="event-source"><a href="${escapeHtml(event.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.source.name)} ↗</a></div>` : ''}
  </article>`;
}

export function calendarView(events: readonly RankedEvent[], state: ViewState, zone: Zone, today: string): string {
  return `<div class="month-grid"><div class="weekdays" aria-hidden="true">${['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day: string): string => `<span>${day}</span>`).join('')}</div>
    <div class="calendar-grid">${monthDays(state.month).map((day: string): string => {
      const matches: RankedEvent[] = byImportance(events.filter((event: RankedEvent): boolean => eventDay(event, zone) === day));
      const highCount: number = matches.filter((event: RankedEvent): boolean => event.importance.level === 'high').length;
      return `<button class="day ${day.startsWith(state.month) ? '' : 'outside'} ${day === state.day ? 'selected' : ''} ${day === today ? 'today' : ''} ${highCount ? 'has-important' : ''}" data-day="${day}" data-testid="day-${day}" aria-label="${day}，${matches.length} 个事件，${highCount} 个重点" aria-pressed="${day === state.day}" ${day === today ? 'aria-current="date"' : ''}>
        <span class="day-header"><span class="day-number">${Number(day.slice(-2))}</span>${day === today ? '<span class="today-label">今天</span>' : ''}${highCount ? `<span class="day-important-count">${highCount} 重点</span>` : ''}</span>
        <span class="day-events">${matches.slice(0, 3).map((event: RankedEvent): string => `<span class="mini-event importance-${event.importance.level}" title="${escapeHtml(event.title)}">${event.importance.level === 'high' ? '<span class="mini-badge">重点</span>' : ''}<span class="mini-title">${escapeHtml(event.title)}</span></span>`).join('')}${matches.length > 3 ? `<span class="more">+${matches.length - 3} 项日程</span>` : ''}</span></button>`;
    }).join('')}</div></div>`;
}

export function agendaView(events: readonly RankedEvent[], state: ViewState, saved: Saved): string {
  const monthly: RankedEvent[] = events.filter((event: RankedEvent): boolean => eventDay(event, saved.zone).startsWith(state.month));
  if (monthly.length === 0) return emptyView(state.importantOnly ? '本月没有匹配的重点事件' : '本月没有匹配的事件', '请清除筛选、调整搜索或查看其他月份。空白不代表没有市场事件。');
  return `<div class="agenda">${[...new Set(monthly.map((event: RankedEvent): string => eventDay(event, saved.zone)))].map((day: string): string => `<section class="agenda-day"><div class="agenda-date"><strong>${day.slice(-2)}</strong><span>${new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))}</span></div><div>${byImportance(monthly.filter((event: RankedEvent): boolean => eventDay(event, saved.zone) === day)).map((event: RankedEvent): string => eventCard(event, saved)).join('')}</div></section>`).join('')}</div>`;
}

export function emptyView(title: string, description: string): string {
  return `<div class="empty"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>`;
}
