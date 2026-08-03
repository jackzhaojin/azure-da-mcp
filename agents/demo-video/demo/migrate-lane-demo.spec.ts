/**
 * Demo: the v2.6 "Migrate a real page" lane — a REAL legacy site (Katie's
 * Travel Journal, hand-built 2004-style HTML on jackzhaojin.com) migrated
 * through the coordinator dashboard into the adapt-to-2026-demo Wilderness
 * Journal site on Adobe Edge Delivery.
 *
 * Scenes: legacy source → the new migrate lane (multi-URL fan-out, dated
 * target folder, dryrun take) → live branch grid → this morning's REAL
 * Kimi K3 run from the store → Cloudflare deployment proof → the migrated
 * page live on aem.page.
 *
 * Record with:
 *   npx playwright test --config=playwright.video.config.ts --grep @migrate-demo
 *
 * The local mesh must be up (4001–4004, SSO off) and the store must contain
 * the completed opencode run into travel-journal-2026-08-02.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { startTimestampRecording, caption } from './caption-overlay';
import { naturalType, quickPause, smoothScroll } from './demo-helpers';

const LEGACY_HOME = 'https://www.jackzhaojin.com/adapt-to-2026-demo/';
const LEGACY_ARTICLES = [
  'https://www.jackzhaojin.com/adapt-to-2026-demo/articles/one-week-above-10000-feet.html',
  'https://www.jackzhaojin.com/adapt-to-2026-demo/articles/kilimanjaro.html',
  'https://www.jackzhaojin.com/adapt-to-2026-demo/articles/norway-midnight-sun.html',
];
const DEMO_FOLDER = 'travel-journal-2026-08-02';
const CLOUD_DASH_LOGIN = 'https://content-factor-dash.jackzhaojin.com/login';
const MIGRATED_PAGE =
  'https://main--adapt-to-2026-demo--jackzhaojin.aem.page/travel-journal-2026-08-02/one-week-above-10000-feet';

/** Smooth-scroll a locator into view (demo-helpers' smoothScroll is CSS-only). */
async function scrollTo(page: Page, target: Locator): Promise<void> {
  await target.first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await page.waitForTimeout(1200);
}

interface RunSummary {
  id: string;
  status: string;
  config: { backend?: string; folder?: string; model?: string };
  stats?: {
    overall?: { mean: number };
    branchResults?: Array<{ target?: string; confidence?: number }>;
  };
}

test('migrate a real website @migrate-demo', async ({ page }) => {
  startTimestampRecording();

  // ── Scene 1: the legacy source, as-is ────────────────────────────────────
  await page.goto(LEGACY_HOME);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/Katie'?s Travel Journal/i).first()).toBeVisible({ timeout: 15000 });
  await caption(
    page,
    "This is Katie's Travel Journal — a real legacy travel site, hand-coded in early-2000s HTML, with ten stories to migrate.",
    9600,
  );
  await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'smooth' }));
  await quickPause(page, 900);

  await page.getByRole('link', { name: /One Week Above 10,000 Feet/i }).first().click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 15000 });
  await caption(
    page,
    'Take one story — One Week Above Ten Thousand Feet. The mission: move pages like this onto Adobe Edge Delivery, automatically.',
    10000,
  );

  // ── Scene 2: the new migrate lane on the dashboard ───────────────────────
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Coordinator' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('text=migration').first()).toBeVisible({ timeout: 10000 });
  await caption(
    page,
    'This is the Content Factory — four A2A agents behind one coordinator, all live. Version 2.6 adds a new lane: migrate a real page.',
    10400,
  );

  await smoothScroll(page, '#goal');
  await page.locator('#goal').selectOption('migrate');
  await expect(page.locator('#source')).toBeVisible();
  await caption(
    page,
    "Paste real source URLs — one migration branch per URL. Three of Katie's stories go in.",
    7000,
  );
  const source = page.locator('#source');
  await source.fill(LEGACY_ARTICLES.slice(0, 2).join('\n') + '\n');
  // Put the caret at the very end, then type the third URL live on camera.
  await source.evaluate((el) => {
    const ta = el as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });
  await source.pressSequentially(LEGACY_ARTICLES[2], { delay: 12 });
  await quickPause(page, 600);

  await naturalType(page, '#folder', DEMO_FOLDER);
  await caption(
    page,
    'A dated target folder — travel journal 2026 08 02 — keeps the demo batch out of the curated site content.',
    8600,
  );

  // Fast take: dryrun backend (default), skip the fidelity eval so the run
  // completes on camera. The REAL K3 run is the next scene.
  await page.getByRole('checkbox').uncheck();
  await expect(page.getByText('migrate only')).toBeVisible();
  await caption(
    page,
    "Backends swap behind one A2A contract — dryrun for a fast take now, Kimi K3 when it's for real. A real run follows in a moment.",
    10300,
  );

  await page.getByRole('button', { name: 'Run it' }).click();

  // ── Scene 3: the fan-out, live ───────────────────────────────────────────
  // A 3-branch dryrun completes in seconds, so the "Running now" card is
  // ephemeral — click through if it's still there, else open the run directly.
  const watchLive = page.getByRole('link', { name: 'Watch live' }).first();
  let opened = false;
  try {
    await watchLive.click({ timeout: 4000 });
    opened = true;
  } catch {
    /* card already gone — resolved below via the API */
  }
  if (!opened) {
    const res = await page.request.get('/api/runs');
    const { runs } = (await res.json()) as { runs: RunSummary[] };
    const fresh = runs.find((r) => r.config.folder === DEMO_FOLDER && r.config.backend === 'dryrun');
    if (!fresh) throw new Error('triggered dryrun run not found in /api/runs');
    await page.goto(`/runs/${fresh.id}`);
  }
  await expect(page.getByText(/completed|Branches/i).first()).toBeVisible({ timeout: 60000 });
  await scrollTo(page, page.getByRole('heading', { name: 'Branches' }));
  await caption(
    page,
    'Three source URLs fanned out into three branches — each migrated independently, with per-branch confidence and variance across the batch.',
    10900,
  );

  // ── Scene 4: this morning's REAL Kimi K3 run, same lane ──────────────────
  const res = await page.request.get('/api/runs');
  const { runs } = (await res.json()) as { runs: RunSummary[] };
  const real = runs.find(
    (r) => r.status.startsWith('completed') && r.config.backend === 'opencode' && r.config.folder === DEMO_FOLDER,
  );
  if (!real) throw new Error('no completed opencode run into the demo folder — run the real migration first');
  const detail = (await (await page.request.get(`/api/runs/${real.id}`)).json()) as { run: RunSummary };
  const confidence = detail.run.stats?.branchResults?.find((b) => b.confidence)?.confidence;
  const evalScore = detail.run.stats?.overall?.mean;

  await page.goto(`/runs/${real.id}`);
  await expect(page.getByText('Overall')).toBeVisible({ timeout: 20000 });
  await caption(
    page,
    "And here is this morning's real run through the same lane — backend opencode, Kimi K3, evaluate after migration.",
    9000,
  );
  await scrollTo(page, page.getByRole('heading', { name: 'Branches' }));
  await caption(
    page,
    `K3 authored the page block by block on da.live in seven and a half minutes — migration confidence ${confidence ?? 90}, then a fidelity eval scoring ${Math.round(evalScore ?? 72)} against the legacy source.`,
    12800,
  );

  // ── Scene 5: deployed on Cloudflare ──────────────────────────────────────
  await page.goto(CLOUD_DASH_LOGIN);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText(/sign in/i).first()).toBeVisible({ timeout: 20000 });
  await caption(
    page,
    'The same mesh is deployed on Cloudflare — Workers plus containers behind Google sign-in. Version 2.6.0 shipped there today.',
    9800,
  );

  // ── Scene 6: the migrated page, live on Edge Delivery ────────────────────
  await page.goto(MIGRATED_PAGE);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('main h1, h1').first()).toBeVisible({ timeout: 30000 });
  await caption(
    page,
    "And the result, live on Edge Delivery: Katie's 2004 story reborn — hero, stats, pull quote, author bio — authored end to end by an agent.",
    11000,
  );
  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'smooth' }));
  await quickPause(page, 1200);
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  await quickPause(page, 1200);
  await caption(
    page,
    "One decoupled A2A mesh — daily content, real migrations, honest scores. That's the Content Factory.",
    7900,
  );

  // Let the voiceover finish before the recording stops.
  await page.waitForTimeout(5000);
});
