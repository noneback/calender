import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { MarketEvent } from '../src/model.ts';
import { parseNyse } from './holidays.ts';
import { englishMonth, isoDay } from './shared.ts';
import type { Source } from './shared.ts';

interface TextRun { text: string; x: number; y: number; height: number }

const weekday = /^(Monday|Tuesday|Wednesday|Thursday|Friday),\s/;
const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character): string =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const readingOrder = (a: TextRun, b: TextRun): number => Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x;

/** Reconstruct the publisher's ruled table from text positions, not PDF content-stream order. */
function calendarHtml(pages: TextRun[][]): string {
  const candidates = pages.flatMap((runs): { runs: TextRun[]; header: TextRun }[] =>
    runs.filter((run): boolean => /^HOLIDAY$/i.test(run.text)).map((header) => ({ runs, header })));
  if (candidates.length !== 1) throw new Error('NYSE PDF must contain one holiday table');
  const { runs, header } = candidates[0]!;
  const tolerance: number = Math.max(2, header.height / 3);
  const headings = runs.filter((run): boolean => /^20\d{2}$/.test(run.text) && run.x > header.x &&
    Math.abs(run.y - header.y) <= tolerance).sort((a, b): number => a.x - b.x);
  const years: number[] = headings.map((run): number => Number(run.text));
  if (!years.length || years.length > 5 || years.some((year, index): boolean => year < 2020 ||
    (index > 0 && year !== years[index - 1]! + 1))) throw new Error('NYSE PDF year headers missing or invalid');

  const footer = runs.filter((run): boolean => /^\*/.test(run.text) && run.y < header.y && run.x <= header.x)
    .sort((a, b): number => b.y - a.y)[0];
  if (!footer) throw new Error('NYSE PDF table-end footnote missing');
  const body = runs.filter((run): boolean => run.y < header.y - tolerance && run.y > footer.y + tolerance);
  const dates = body.filter((run): boolean => weekday.test(run.text));

  // Year headings are centered, so their midpoints are not cell boundaries.
  // Find each column's left-aligned dates inside the interval ending at its
  // own heading, then use those starts to retain wrapped cell continuations.
  const starts: number[] = headings.map((heading, index): number => {
    const previousX: number = headings[index - 1]?.x ?? header.x;
    const matches = dates.filter((run): boolean => run.x > previousX && run.x <= heading.x + tolerance);
    if (!matches.length) throw new Error(`NYSE PDF date column missing: ${heading.text}`);
    const start: number = Math.min(...matches.map((run): number => run.x));
    if (matches.some((run): boolean => Math.abs(run.x - start) > tolerance)) {
      throw new Error(`NYSE PDF ambiguous date column: ${heading.text}`);
    }
    return start;
  });
  if (dates.some((run): boolean => !starts.some((x): boolean => Math.abs(x - run.x) <= tolerance))) {
    throw new Error('NYSE PDF has unassigned date columns');
  }

  const rowTops: number[] = [];
  for (const run of [...dates].sort((a, b): number => b.y - a.y)) {
    if (!rowTops.some((y): boolean => Math.abs(run.y - y) <= tolerance)) rowTops.push(run.y);
  }
  if (rowTops.length !== 10) throw new Error(`NYSE PDF holiday rows incomplete: ${rowTops.length}`);
  const rows: string[][] = rowTops.map((top, index): string[] => {
    const bottom: number = rowTops[index + 1] ?? footer.y;
    const cells: TextRun[][] = Array.from({ length: years.length + 1 }, (): TextRun[] => []);
    for (const run of body.filter((item): boolean => item.y <= top + tolerance && item.y > bottom + tolerance)) {
      const column: number = starts.filter((x): boolean => run.x >= x - tolerance).length;
      cells[column]!.push(run);
    }
    const row: string[] = cells.map((cell): string => clean(cell.sort(readingOrder).map((run): string => run.text).join(' ')));
    for (const [column, cell] of row.slice(1).entries()) {
      if (/^[—–-]\*?$/.test(cell)) continue;
      const match = cell.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday), ([A-Z][a-z]+) (\d{1,2})(?:\s*\([^)]*\))?\*{0,4}$/);
      if (!match) throw new Error(`NYSE PDF malformed holiday cell: ${cell}`);
      const day: string = isoDay(years[column]!, englishMonth(match[2]!), Number(match[3]));
      if (new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(day)) !== match[1]) {
        throw new Error(`NYSE PDF weekday/date mismatch: ${cell}, ${years[column]}`);
      }
    }
    return row;
  });
  if (new Set(rows.map((row): string => row[0]!)).size !== rows.length) throw new Error('NYSE PDF has duplicate holiday names');
  const text: string = pages.map((page): string => clean([...page].sort(readingOrder).map((run): string => run.text).join(' '))).join(' ');
  const footnotes = [...text.matchAll(/(\*{2,})\s*Each market will close early at 1:00 p\.m\..*?All times/g)];
  if (!footnotes.length) throw new Error('NYSE PDF early-close footnotes missing');
  const markers: string[] = [...new Set(rows.flatMap((row): string[] => row.slice(1).flatMap((cell): string[] => {
    const marker = cell.match(/(\*{2,})$/);
    return marker ? [marker[1]!] : [];
  })))].sort();
  if (JSON.stringify(markers) !== JSON.stringify(footnotes.map((match): string => match[1]!).sort())) {
    throw new Error('NYSE PDF early-close footnotes do not match table references');
  }
  return `<table><tr><th>Holiday</th>${years.map((year): string => `<th>${year}</th>`).join('')}</tr>${
    rows.map((row): string => `<tr>${row.map((cell): string => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')
  }</table>${footnotes.map((footnote): string => `<p>${escapeHtml(footnote[0])}</p>`).join('')}`;
}

/** Read the official annual NYSE/ICE PDF; callers retain its exact URL as provenance. */
export async function parseNysePdf(data: Uint8Array, source: Source): Promise<MarketEvent[]> {
  if (data.byteLength < 5 || data.byteLength > 5 * 1024 * 1024 ||
    new TextDecoder().decode(data.subarray(0, 5)) !== '%PDF-') throw new Error('NYSE PDF missing, invalid or over 5 MiB');
  const task = getDocument({ data: Uint8Array.from(data), useWorkerFetch: false,
    disableFontFace: true, maxImageSize: 0, stopAtErrors: true });
  try {
    const document = await task.promise;
    if (document.numPages < 1 || document.numPages > 8) throw new Error(`NYSE PDF has unexpected page count: ${document.numPages}`);
    const pages: TextRun[][] = [];
    for (let number: number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      if (page.rotate !== 0) throw new Error('NYSE PDF rotated pages are unsupported');
      const content = await page.getTextContent();
      if (content.items.length > 10000) throw new Error('NYSE PDF page has excessive text');
      pages.push(content.items.flatMap((item): TextRun[] => {
        if (!('str' in item) || !item.str.trim()) return [];
        return [{ text: clean(item.str), x: item.transform[4]!, y: item.transform[5]!, height: item.height }];
      }));
      page.cleanup();
    }
    const events: MarketEvent[] = parseNyse(calendarHtml(pages), source);
    if (new Set(events.map((event): string => event.id)).size !== events.length) throw new Error('NYSE PDF has duplicate events');
    return events;
  } finally {
    await task.destroy();
  }
}
