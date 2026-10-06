import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sources } from '../scripts/shared.ts';

const generatedAt = '2026-10-06T06:27:10.000Z';
function feed() {
  return { generatedAt, events: [], leaders: [], holdingsDate: null,
    sources: Object.values(sources).map((source) => ({ ...source, status: 'ok', checkedAt: generatedAt,
      count: 0, start: null, end: null, error: null as string | null })) };
}
function verify(output: unknown, startedAt = '2026-10-06T06:27:00Z') {
  const cwd = mkdtempSync(join(tmpdir(), 'calendar-feed-'));
  try {
    mkdirSync(join(cwd, 'public/data'), { recursive: true });
    if (output !== undefined) writeFileSync(join(cwd, 'public/data/events.json'),
      typeof output === 'string' ? output : JSON.stringify(output));
    return spawnSync(process.execPath, ['--experimental-strip-types',
      fileURLToPath(new URL('../scripts/verify-feed.ts', import.meta.url))],
    { cwd, env: { ...process.env, SYNC_STARTED_AT: startedAt }, encoding: 'utf8' });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('fresh complete and explicit partial feeds pass the publishing gate', (): void => {
  assert.equal(verify(feed()).status, 0);
  const partial = feed();
  partial.sources[0]!.status = 'error';
  partial.sources[0]!.error = 'Upstream request failed';
  const result = verify(partial);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Upstream request failed/);
});

test('fatal sync cannot publish absent, truncated, invalid, or stale output', (): void => {
  for (const output of [undefined, '{', { generatedAt }, { ...feed(), generatedAt: '2026-09-24T00:00:00.000Z' }]) {
    assert.notEqual(verify(output).status, 0);
  }
  assert.notEqual(verify(feed(), 'not-a-date').status, 0);
});

test('publishing gate rejects missing, duplicate, and mismatched source statuses', (): void => {
  const missing = feed();
  missing.sources.pop();
  assert.notEqual(verify(missing).status, 0);
  const duplicate = feed();
  duplicate.sources[1] = duplicate.sources[0]!;
  assert.notEqual(verify(duplicate).status, 0);
  const olderStatus = feed();
  olderStatus.sources[0]!.checkedAt = '2026-09-24T00:00:00.000Z';
  assert.notEqual(verify(olderStatus).status, 0);
});

test('Pages validates a fresh output before build and preserves incomplete-sync failure', (): void => {
  const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');
  const order = ['run: npm test', 'rm -f public/data/events.json', 'SYNC_STARTED_AT=',
    'run: npm run sync', 'run: npm run verify:feed', 'run: npm run build',
    'uses: actions/upload-pages-artifact@', 'uses: actions/deploy-pages@', 'name: Report incomplete sync'];
  let previous = -1;
  for (const command of order) {
    const position = workflow.indexOf(command);
    assert.ok(position > previous, `${command} must follow the previous publishing prerequisite`);
    previous = position;
  }
  assert.match(workflow, /if: steps\.sync\.outcome == 'failure'/);
  assert.match(workflow, /exit 1/);
});
