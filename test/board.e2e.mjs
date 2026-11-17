// Browser check of the board against a mocked incident API (no real acks are spent).
// Run: npm run build -- --dirty && node test/board.e2e.mjs   (PW_LOADER=<module exporting chromium, executablePath> to reuse a local Playwright)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { chromium, executablePath } = await import(process.env.PW_LOADER || 'playwright');
const PORT = 4199;
const BASE = `http://localhost:${PORT}/`;
const sha = readFileSync('dist/index.html', 'utf8').match(/name="build" content="([^"]+)"/)[1];

const inc = (id, min, extra = {}) => ({
  id, service: 'auth', region: 'eu-central', summary: `thing ${id}`, severity: 'sev2',
  openedAt: new Date(Date.UTC(2026, 10, 12, 3, min)).toISOString(), ...extra,
});

function mockApi(page, state) {
  return page.route('**/challenges/show-me-when/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/incidents')) {
      state.polls.push({ at: Date.now(), since: url.searchParams.get('since') });
      if (state.polls.length === 1 && state.firstDelay) await new Promise((r) => setTimeout(r, state.firstDelay));
      const cursor = `c${state.polls.length}`;
      return route.fulfill({ json: { updatedAt: new Date().toISOString(), incidents: state.incidents, cursor } });
    }
    if (url.pathname.endsWith('/ack')) {
      state.acks.push({ id: url.searchParams.get('id'), cursor: url.searchParams.get('cursor') });
      return route.fulfill({ json: { id: url.searchParams.get('id'), ackedAt: new Date().toISOString(), receipt: 'r-test' } });
    }
    return route.fulfill({ status: 404, body: 'no' });
  });
}

const server = spawn(process.execPath, ['scripts/serve.mjs', 'dist'], { env: { ...process.env, PORT: String(PORT) } });
await new Promise((r) => server.stdout.once('data', r));
const browser = await chromium.launch({ executablePath });
test.after(async () => { await browser.close(); server.kill(); });

async function open(state, ctxOpts = {}) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await mockApi(page, state);
  await page.goto(BASE);
  return { ctx, page };
}

test('R3 loader until incidents load, then gone', async () => {
  const state = { incidents: [inc('INC-1', 1)], polls: [], acks: [], firstDelay: 800 };
  const { ctx, page } = await open(state);
  assert.equal(await page.getByTestId('loader').isVisible(), true);
  await page.getByTestId('incident-row').first().waitFor();
  assert.equal(await page.getByTestId('loader').count(), 0);
  await ctx.close();
});

test('R1 + R4: newest first, new incident appears at the top without a reload', async () => {
  const state = { incidents: [inc('INC-1', 1), inc('INC-3', 3), inc('INC-2', 2)], polls: [], acks: [] };
  const { ctx, page } = await open(state);
  await page.getByTestId('incident-row').first().waitFor();
  const ids = () => page.getByTestId('incident-row').evaluateAll((rs) => rs.map((r) => r.dataset.id));
  assert.deepEqual(await ids(), ['INC-3', 'INC-2', 'INC-1']);
  const firstRow = await page.locator('[data-id="INC-3"]').elementHandle();
  await page.evaluate(() => { window.__notReloaded = true; });
  state.incidents = [inc('INC-4', 4), ...state.incidents];
  await page.locator('[data-id="INC-4"]').waitFor({ timeout: 3500 });
  assert.deepEqual(await ids(), ['INC-4', 'INC-3', 'INC-2', 'INC-1']);
  assert.equal(await page.evaluate(() => window.__notReloaded), true);
  assert.equal(await firstRow.evaluate((n) => n.isConnected), true, 'known rows are kept, not rebuilt');
  await page.waitForTimeout(2300);
  const gaps = state.polls.slice(1).map((p, i) => p.at - state.polls[i].at);
  assert.ok(gaps.every((g) => g >= 1900 && g < 3500), `poll gaps ${gaps}`);
  await ctx.close();
});

test('R2: Ack asks to confirm by id; confirm-ack acks that incident with the latest cursor and marks the row', async () => {
  const state = { incidents: [inc('INC-1', 1), inc('INC-2', 2)], polls: [], acks: [] };
  const { ctx, page } = await open(state);
  const row = page.locator('[data-testid="incident-row"][data-id="INC-1"]');
  assert.equal(await page.getByTestId('confirm').isVisible(), false);
  await row.getByTestId('ack').click();
  await page.getByTestId('confirm').waitFor();
  assert.match(await page.getByTestId('confirm').innerText(), /INC-1/);
  assert.equal(state.acks.length, 0, 'Ack on the row only asks');
  await page.getByTestId('confirm-cancel').click();
  assert.equal(await page.getByTestId('confirm').isVisible(), false);
  await page.waitForTimeout(200);
  assert.equal(state.acks.length, 0, 'Cancel sends nothing');
  await row.getByTestId('ack').click();
  await page.keyboard.press('Enter'); // focus is on Cancel: a second Enter must not ack
  await page.waitForTimeout(200);
  assert.equal(state.acks.length, 0, 'Enter right after Ack sends nothing');
  await row.getByTestId('ack').click();
  await page.getByTestId('confirm-ack').click();
  await row.getByTestId('acked').waitFor();
  assert.equal(await page.getByTestId('confirm').isVisible(), false);
  assert.equal(state.acks.length, 1);
  assert.equal(state.acks[0].id, 'INC-1');
  assert.equal(state.acks[0].cursor, `c${state.polls.length}`);
  assert.equal(await row.getByTestId('ack').count(), 0);
  await page.waitForTimeout(2300);
  assert.equal(await row.getByTestId('acked').count(), 1, 'acked mark survives a refresh');
  assert.equal(await page.locator('[data-id="INC-2"]').getByTestId('acked').count(), 0);
  await ctx.close();
});

test('R5: Berlin and Auckland viewers each see their own zone and order; datetime keeps UTC', async () => {
  const one = [inc('INC-1', 3)]; // 03:03Z
  for (const [locale, timezoneId, want] of [
    ['de-DE', 'Europe/Berlin', '12.11., 04:03'],
    ['en-NZ', 'Pacific/Auckland', '12/11, 04:03 pm'],
  ]) {
    const { ctx, page } = await open({ incidents: one, polls: [], acks: [] }, { locale, timezoneId });
    const time = page.getByTestId('incident-row').first().locator('time');
    await time.waitFor();
    assert.equal(await time.textContent(), want);
    assert.equal(await time.getAttribute('datetime'), '2026-11-12T03:03:00.000Z');
    await ctx.close();
  }
});

test('R6: build sha in meta and footer; empty state; incident text is never markup', async () => {
  const { ctx, page } = await open({ incidents: [inc('INC-9', 9, { summary: '<img src=x onerror="window.__x=1">' })], polls: [], acks: [] });
  await page.getByTestId('incident-row').first().waitFor();
  assert.equal(await page.locator('meta[name="build"]').getAttribute('content'), sha);
  assert.equal(await page.getByTestId('build-sha').textContent(), sha);
  assert.match(sha, /^[0-9a-f]{40}$/);
  assert.equal(await page.evaluate(() => window.__x), undefined);
  await ctx.close();
  const e = await open({ incidents: [], polls: [], acks: [] });
  await e.page.getByTestId('empty').waitFor();
  assert.equal(await e.page.getByTestId('incident-row').count(), 0);
  await e.ctx.close();
});

test('R2: a row that arrives under the pointer gets no ack; the confirm names the row that was hit', async () => {
  const state = { incidents: [inc('INC-1', 1), inc('INC-2', 2)], polls: [], acks: [] };
  const { ctx, page } = await open(state);
  const box = await page.locator('[data-id="INC-2"]').getByTestId('ack').boundingBox(); // top row
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  state.incidents = [inc('INC-3', 3), ...state.incidents];
  await page.locator('[data-id="INC-3"]').waitFor({ timeout: 3500 });
  await page.mouse.click(x, y); // aimed at INC-2, lands on INC-3
  await page.getByTestId('confirm').waitFor();
  assert.match(await page.getByTestId('confirm').innerText(), /INC-3/);
  assert.doesNotMatch(await page.getByTestId('confirm').innerText(), /INC-2/);
  const place = await page.getByTestId('confirm').boundingBox();
  state.incidents = [inc('INC-4', 4), ...state.incidents];
  await page.locator('[data-id="INC-4"]').waitFor({ timeout: 3500 });
  assert.deepEqual(await page.getByTestId('confirm').boundingBox(), place, 'the confirm holds still while rows arrive');
  await page.getByTestId('confirm-cancel').click();
  assert.equal(state.acks.length, 0);
  await page.locator('[data-id="INC-2"]').getByTestId('ack').click();
  assert.match(await page.getByTestId('confirm').innerText(), /INC-2/);
  await page.getByTestId('confirm-ack').click();
  await page.locator('[data-id="INC-2"]').getByTestId('acked').waitFor();
  assert.deepEqual(state.acks.map((a) => a.id), ['INC-2']);
  await ctx.close();
});
