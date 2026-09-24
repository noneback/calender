import 'bootstrap/dist/css/bootstrap.min.css';
import './style.css';
import { dateKey, eventDay, feedSchema, shiftMonth, sortEvents, zoneSchema } from './model.ts';
import type { Feed, Saved } from './model.ts';
import { byImportance, importanceGuide, importanceNotice, nextHighlights, rankEvents } from './importance.ts';
import type { RankedEvent } from './importance.ts';
import { readSaved, writeSaved } from './storage.ts';
import { agendaView, calendarView, emptyView, escapeHtml, eventCard, filteredEvents } from './view.ts';
import type { ViewState } from './view.ts';

function element<T extends Element>(selector: string): T {
  const node: T | null = document.querySelector<T>(selector);
  if (!node) throw new Error(`Required UI element missing: ${selector}`);
  return node;
}

async function loadFeed(): Promise<Feed> {
  const url: string = `${import.meta.env.BASE_URL}data/events.json`;
  for (let attempt: number = 1; attempt <= 3; attempt += 1) {
    try {
      const response: Response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`日程加载失败：${url}，HTTP ${response.status}，${(await response.text()).slice(0, 120)}`);
      return feedSchema.parse(await response.json());
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      console.warn('Calendar data request failed', { url, attempt, error: error.message });
      if (attempt === 3) throw error;
    }
  }
  throw new Error('日程加载重试已耗尽');
}

function showError(error: Error): void {
  const alert: HTMLElement = element('#error');
  alert.textContent = `操作未完成：${error.message}`;
  alert.hidden = false;
  console.error('Calendar operation failed', { error });
}

function startApp(feed: Feed, initialSaved: Saved): void {
  let saved: Saved = initialSaved;
  const today: string = dateKey(new Date(), saved.zone);
  let state: ViewState = { month: today.slice(0, 7), day: today, query: '', category: 'all', favoritesOnly: false, importantOnly: false, view: 'month' };
  let returnFocus: string = '#today-button';
  const app: HTMLElement = element('#app');
  app.innerHTML = `<main class="terminal"><header class="masthead"><div class="title-group"><a class="brand" href="./" aria-label="市历首页">市历</a><h1>市场日历</h1><span class="subtitle">宏观 · 央行 · 财报 · 交易安排</span></div><div class="header-actions"><button id="guide-button" class="btn btn-link">分级依据</button><button id="sources-button" class="btn btn-link">数据来源 ↗</button></div></header>
    <div id="error" class="error-banner" role="alert" hidden></div>
    <section class="calendar-shell" aria-label="市场事件日历"><div class="calendar-toolbar"><div class="month-controls"><button id="previous-month" class="btn icon-button" aria-label="上个月">‹</button><h2 id="month-title"></h2><button id="next-month" class="btn icon-button" aria-label="下个月">›</button><input type="month" id="jump-month" aria-label="跳转月份" min="2000-01" max="2100-12"><button id="today-button" class="btn btn-outline-secondary">今天</button></div><div class="toolbar-actions"><button id="next-important" class="btn btn-outline-secondary">下个重点 ↗</button><button id="important-only" class="btn btn-outline-secondary" aria-pressed="false">只看重点</button><select id="timezone" class="form-select" aria-label="显示时区"><option value="Asia/Shanghai">北京时间</option><option value="America/New_York">美东时间</option></select><div class="btn-group view-toggle" aria-label="视图切换"><button id="month-view" class="btn btn-outline-secondary" aria-pressed="true">月历</button><button id="agenda-view" class="btn btn-outline-secondary" aria-pressed="false">日程</button></div></div></div>
    <div class="filter-toolbar"><input id="search" class="form-control" type="search" placeholder="搜索事件或公司…" aria-label="搜索事件"><span id="result-count" role="status"></span><span class="importance-key"><span class="badge importance-badge importance-high">重点</span> 优先关注</span></div><div id="calendar" class="calendar-scroll"></div><div class="calendar-footnote"><span id="freshness"></span><span id="updated-at"></span></div></section>
    <footer><span>${escapeHtml(importanceNotice)}</span><span>定时事件自动换算时区；全天事件保留当地日期。</span></footer>
  </main>
  <dialog id="day-dialog" aria-labelledby="day-title"><div class="dialog-heading"><h2 id="day-title"></h2><button id="close-day" class="btn icon-button" aria-label="关闭当日日程">×</button></div><div id="day-panel" aria-live="polite"></div></dialog>
  <dialog id="info-dialog" aria-labelledby="info-title"><div class="dialog-heading"><h2 id="info-title"></h2><button id="close-info" class="btn icon-button" aria-label="关闭详情">×</button></div><div id="info-body"></div></dialog>`;

  function allEvents(): RankedEvent[] { return rankEvents(sortEvents(feed.events, saved.zone), feed.leaders); }
  function render(): void {
    const all: RankedEvent[] = allEvents();
    const events: RankedEvent[] = filteredEvents(all, state, saved);
    const monthly: RankedEvent[] = events.filter((event: RankedEvent): boolean => eventDay(event, saved.zone).startsWith(state.month));
    element('#month-title').textContent = `${state.month.slice(0, 4)} 年 ${Number(state.month.slice(5))} 月`;
    element<HTMLInputElement>('#jump-month').value = state.month;
    element<HTMLSelectElement>('#timezone').value = saved.zone;
    element('#result-count').textContent = `${monthly.length} 项日程 · ${monthly.filter((event: RankedEvent): boolean => event.importance.level === 'high').length} 项重点`;
    element('#month-view').setAttribute('aria-pressed', String(state.view === 'month'));
    element('#agenda-view').setAttribute('aria-pressed', String(state.view === 'agenda'));
    element('#important-only').setAttribute('aria-pressed', String(state.importantOnly));
    element('#calendar').innerHTML = state.view === 'month' ? calendarView(events, state, saved.zone, dateKey(new Date(), saved.zone)) : agendaView(events, state, saved);
    const dayEvents: RankedEvent[] = byImportance(events.filter((event: RankedEvent): boolean => eventDay(event, saved.zone) === state.day));
    element('#day-title').textContent = `${state.day.replaceAll('-', ' / ')} ${new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${state.day}T12:00:00Z`))}`;
    element('#day-panel').innerHTML = `<p class="day-summary">${dayEvents.length} 项日程 · ${dayEvents.filter((event: RankedEvent): boolean => event.importance.level === 'high').length} 项重点</p>${dayEvents.length ? dayEvents.map((event: RankedEvent): string => eventCard(event, saved)).join('') : emptyView(state.importantOnly ? '没有匹配的重点事件' : '没有匹配的事件', '请清除筛选或调整搜索。空白不代表当天没有市场事件。')}`;
    const next: RankedEvent | undefined = nextHighlights(all, saved.zone, new Date())[0];
    element<HTMLButtonElement>('#next-important').disabled = !next;
    element<HTMLButtonElement>('#next-important').title = next ? `${eventDay(next, saved.zone)} · ${next.title}` : '当前来源尚未收录未来重点事件';
    const failures: number = feed.sources.filter((source): boolean => source.status === 'error').length;
    const stale: boolean = Date.now() - Date.parse(feed.generatedAt) > 36 * 3600000;
    element('#freshness').classList.toggle('warning', Boolean(failures || stale));
    element('#freshness').textContent = failures ? `${failures} 个来源同步失败，相关事件缺失。请查看数据来源。` : stale ? '数据超过 36 小时未更新，请检查同步任务。' : '日程自动同步 · 预估财报以公司公告为准';
    element('#updated-at').textContent = `更新 ${new Intl.DateTimeFormat('zh-CN', { timeZone: saved.zone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(feed.generatedAt))}`;
  }

  function openSources(): void {
    element('#info-title').textContent = '数据来源与覆盖';
    element('#info-body').innerHTML = `<p class="dialog-note">每天由 GitHub Actions 获取免费公开来源。日期范围表示已收录事件的首末日期，不保证范围内所有市场事件均已覆盖。暂无突发新闻自动识别。</p>${feed.sources.map((source): string => `<section class="source-row"><strong>${escapeHtml(source.name)}</strong><span class="${source.status === 'error' ? 'warning' : ''}">${source.status === 'ok' ? `${source.count} 条 · 同步成功` : '同步失败 · 数据缺失'}</span><p>${source.start && source.end ? `${source.start} 至 ${source.end}` : '详见来源公布范围'}</p>${source.error ? `<p class="warning">${escapeHtml(source.error)}</p>` : ''}<a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">查看原始来源 ↗</a></section>`).join('')}<p class="dialog-note">NYSE 与上交所分别表示美股、A 股交易安排。央行会议日期不代表已决定加息。财报代表公司每日依据 IVV 持仓更新，每行业前三及整体前十合并去重，并非投资推荐。持仓日期：${escapeHtml(feed.holdingsDate ?? '未获取')}。</p>`;
    element<HTMLDialogElement>('#info-dialog').showModal();
  }

  app.addEventListener('click', (click: MouseEvent): void => {
    if (!(click.target instanceof Element)) return;
    const button: HTMLButtonElement | null = click.target.closest('button');
    if (!button) return;
    try {
      if (button.dataset.day) {
        const day: string = button.dataset.day;
        state = { ...state, day, month: day.slice(0, 7) };
        returnFocus = `[data-day="${day}"]`;
        render();
        element<HTMLDialogElement>('#day-dialog').showModal();
        return;
      }
      switch (button.id) {
        case 'close-day': element<HTMLDialogElement>('#day-dialog').close(); return;
        case 'close-info': element<HTMLDialogElement>('#info-dialog').close(); return;
        case 'sources-button': openSources(); return;
        case 'guide-button':
          element('#info-title').textContent = '哪些事件值得优先关注';
          element('#info-body').innerHTML = `<p class="dialog-note">${escapeHtml(importanceNotice)}</p>${importanceGuide.map((rule): string => `<section class="source-row"><strong>${escapeHtml(rule.label)}</strong><p>${escapeHtml(rule.description)}</p></section>`).join('')}`;
          element<HTMLDialogElement>('#info-dialog').showModal(); return;
        case 'previous-month': state = { ...state, month: shiftMonth(state.month, -1), day: `${shiftMonth(state.month, -1)}-01` }; break;
        case 'next-month': state = { ...state, month: shiftMonth(state.month, 1), day: `${shiftMonth(state.month, 1)}-01` }; break;
        case 'today-button': { const day: string = dateKey(new Date(), saved.zone); state = { ...state, month: day.slice(0, 7), day }; break; }
        case 'month-view': state = { ...state, view: 'month' }; break;
        case 'agenda-view': state = { ...state, view: 'agenda' }; break;
        case 'important-only': state = { ...state, importantOnly: !state.importantOnly }; break;
        case 'next-important': {
          const next: RankedEvent | undefined = nextHighlights(allEvents(), saved.zone, new Date())[0];
          if (!next) throw new Error('当前来源尚未收录未来重点事件');
          const day: string = eventDay(next, saved.zone);
          state = { ...state, day, month: day.slice(0, 7), query: '', importantOnly: false };
          element<HTMLInputElement>('#search').value = '';
          returnFocus = '#next-important';
          render();
          element<HTMLDialogElement>('#day-dialog').showModal(); return;
        }
      }
      render();
    } catch (error) { if (error instanceof Error) showError(error); else throw error; }
  });
  element<HTMLDialogElement>('#day-dialog').addEventListener('close', (): void => { element<HTMLElement>(returnFocus).focus({ preventScroll: true }); });
  element<HTMLInputElement>('#search').addEventListener('input', (event): void => { state = { ...state, query: (event.target as HTMLInputElement).value }; render(); });
  element<HTMLSelectElement>('#timezone').addEventListener('change', (event): void => {
    try { saved = writeSaved({ ...saved, zone: zoneSchema.parse((event.target as HTMLSelectElement).value) }); render(); }
    catch (error) { if (error instanceof Error) showError(error); else throw error; }
  });
  element<HTMLInputElement>('#jump-month').addEventListener('change', (event): void => {
    const month: string = (event.target as HTMLInputElement).value;
    if (month) { state = { ...state, month, day: `${month}-01` }; render(); }
  });
  render();
}

const root: HTMLElement = element('#app');
root.innerHTML = '<div class="loading" role="status">市历 · 正在载入市场日程…</div>';
try { startApp(await loadFeed(), readSaved()); }
catch (error) {
  if (!(error instanceof Error)) throw error;
  root.innerHTML = `<main class="fatal"><h1>日历暂时无法打开</h1><p>请检查网络、日程文件及浏览器存储权限。</p><pre>${escapeHtml(error.message)}</pre><button id="reload" class="btn btn-outline-secondary">重新加载</button></main>`;
  element('#reload').addEventListener('click', (): void => location.reload());
  console.error('Calendar startup failed', { error });
}
