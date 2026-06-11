/**
 * Demo: the A2A content factory closed loop, recorded against the REAL local
 * mesh (no mocks). Scenes: dashboard → trigger a real Kimi K2.6 run → live
 * activity → completed run results → the migrated da.live page itself.
 *
 * Record with:
 *   DEMO_BACKEND=opencode npx playwright test --config=playwright.video.config.ts --grep @loop-demo
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { startTimestampRecording, caption } from './caption-overlay';
import { naturalType, quickPause, smoothScroll } from './demo-helpers';

/** Smooth-scroll a locator into view (demo-helpers' smoothScroll is CSS-only). */
async function scrollTo(page: Page, target: Locator): Promise<void> {
  await target.first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await page.waitForTimeout(1200);
}

// 'opencode' = real Kimi K2.6 migration (the final take). While developing
// scenes, 'dryrun' avoids firing a 15-minute real migration per iteration.
const BACKEND = process.env.DEMO_BACKEND ?? 'dryrun';
const TOPIC = process.env.DEMO_TOPIC ?? 'urban balcony herb gardens for beginners';

interface RunSummary {
  id: string;
  status: string;
  config: { backend?: string; topic?: string };
  stats?: {
    overall?: { mean: number };
    branchResults?: Array<{ target?: string; dimensionScores?: Record<string, number> }>;
  };
}

test('content factory closed loop @loop-demo', async ({ page }) => {
  startTimestampRecording();

  // ── Scene 1: the coordinator dashboard ────────────────────────────────────
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Coordinator' })).toBeVisible({ timeout: 15000 });
  await caption(
    page,
    'This is the Content Factory — a mesh of four AI agents speaking the A2A protocol, running live on this machine.',
    8960,
  );

  // Mesh chips: all four agents answer their agent cards.
  await expect(page.locator('text=migration').first()).toBeVisible({ timeout: 10000 });
  await caption(
    page,
    'The chips up top are real health checks: coordinator, eval, content generation, and migration agents are all up.',
    8960,
  );

  // ── Scene 2: trigger a real run ───────────────────────────────────────────
  await smoothScroll(page, '#topic');
  await expect(page.locator('#topic')).toBeVisible();
  await caption(
    page,
    "Let's start a full loop: generate a legacy source page, migrate it, and evaluate the result.",
    7600,
  );

  await naturalType(page, '#topic', TOPIC);
  await quickPause(page, 800);
  await page.locator('#backend').selectOption(BACKEND);
  if (BACKEND === 'opencode') {
    // The real-backend panel appears only for non-dryrun backends.
    await expect(page.locator('#site')).toBeVisible();
    await expect(page.getByText('Real pages will be authored')).toBeVisible();
    await caption(
      page,
      'The migration backend is Kimi K2.6 — it will author a REAL page on da.live, Adobe Edge Delivery Services. No mocks anywhere.',
      9760,
    );
  }

  await page.getByRole('button', { name: 'Run it' }).click();

  // ── Scene 3: watch it live ────────────────────────────────────────────────
  // Click through to the run detail quickly — a dryrun run completes in ~7s
  // and its "Running now" card disappears; captions happen on the detail page.
  await expect(page.getByText('Running now')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(TOPIC).first()).toBeVisible();
  await page.getByRole('link', { name: 'Watch live' }).first().click();
  await expect(page.getByText('Live activity')).toBeVisible({ timeout: 20000 });
  await caption(
    page,
    'The run is live. The content generation agent synthesizes the legacy source page in under a second.',
    8240,
  );
  await caption(
    page,
    'Every working note streams from the agents over the A2A protocol into this activity feed.',
    7280,
  );

  if (BACKEND === 'opencode') {
    // Kimi's first tool calls surface ~15-30s into the migration.
    await expect(page.getByText('K2.6 →').first()).toBeVisible({ timeout: 120000 });
    await caption(
      page,
      'Kimi K2.6 is migrating the page right now — each line is a real tool call: reading the source, authoring blocks, publishing previews.',
      10720,
    );
  }

  // ── Scene 4: a completed run's results ────────────────────────────────────
  // The triggered run takes ~15 minutes; for results we open the freshest
  // COMPLETED Kimi run from the store — same pipeline, finished minutes ago.
  // The list endpoint slims stats; branchResults live on the detail endpoint.
  const res = await page.request.get('/api/runs');
  const { runs } = (await res.json()) as { runs: RunSummary[] };
  let done: RunSummary | undefined;
  for (const r of runs) {
    if (r.status !== 'completed' || r.config.backend !== 'opencode' || !r.stats?.overall) continue;
    const detail = (await (await page.request.get(`/api/runs/${r.id}`)).json()) as { run: RunSummary };
    if ((detail.run.stats?.branchResults ?? []).some((b) => b.target)) {
      done = detail.run;
      break;
    }
  }
  if (!done) throw new Error('no completed opencode run with branchResults in the store — run the loop first');
  const score = Math.round(done.stats!.overall!.mean);

  await page.goto(`/runs/${done.id}`);
  await expect(page.getByText('Overall')).toBeVisible({ timeout: 20000 });
  await caption(
    page,
    `Here is a run that finished minutes ago — same pipeline, end to end. The topic: ${done.config.topic}.`,
    8400,
  );
  await expect(page.getByText(String(score)).first()).toBeVisible();
  await caption(
    page,
    `The evaluation agent scored the migrated page ${score} out of 100 — and that eval is itself agentic, driving a real browser.`,
    9680,
  );

  await scrollTo(page, page.getByRole('heading', { name: 'Branches' }));
  await expect(page.getByText('structure', { exact: false }).first()).toBeVisible();
  await caption(
    page,
    'Four dimensions, each scored separately: structure, accessibility, content fidelity, and visual quality.',
    8400,
  );

  // ── Scene 5: the migrated page itself, live on Edge Delivery ──────────────
  const target = done.stats!.branchResults!.find((b) => b.target)?.target;
  if (!target) throw new Error('completed run has no target URL');
  await page.goto(target);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('h1, main h2').first()).toBeVisible({ timeout: 30000 });
  await caption(
    page,
    'And this is the migrated page itself — live on Adobe Edge Delivery, authored block by block by Kimi K2.6.',
    8640,
  );
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  await page.waitForTimeout(1500);
  await caption(
    page,
    'Generate, migrate, evaluate — a closed loop of real agents, real pages, and real scores. That is the Content Factory.',
    9520,
  );

  // Let the voiceover finish before the recording stops.
  await page.waitForTimeout(5000);
});
