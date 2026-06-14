/**
 * Demo: a guided tour of the Content Factory coordinator dashboard — the
 * "retro" coordinator flow (previous runs, single full-loop, bulk batches) AND
 * the new decoupled eval flow (Direct eval + evidence). Recorded against the
 * REAL local mesh (ports 4001-4004), navigating REAL completed runs already in
 * the store — no live trigger, because with the agentic eval token enabled a
 * full-loop's eval stage now takes 1-2 min (too slow for a smooth take).
 *
 * Record with:
 *   cd agents/demo-video && set -a; source ../.env; set +a
 *   node ../../.claude/skills/playwright-demo-video/scripts/run-pipeline.mjs \
 *     --record --spec demo/factory-tour.spec.ts --grep "@factory-tour" \
 *     --output-dir ./$(date +%F)-factory-tour --project-dir "$(pwd)"
 * (outputs are archived per-run in a dated YYYY-MM-DD-slug/ dir; see the README
 *  for the exact-timestamp --from-log steps the run-pipeline --video path skips)
 *
 * The store must contain: a completed full-loop run (generate→migrate→evaluate)
 * with branch results, at least one batch (batch_id), and a completed
 * eval-direct run. The v2.1 part-2 hardening pass seeded all three.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { startTimestampRecording, caption } from './caption-overlay';
import { quickPause, smoothScroll } from './demo-helpers';

/** Smooth-scroll a Playwright locator into view (smoothScroll is CSS-only). */
async function scrollTo(page: Page, target: Locator): Promise<void> {
  await target.first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await page.waitForTimeout(1200);
}

interface RunSummary {
  id: string;
  kind: string;
  status: string;
  batchId?: string | null;
  config: { goal?: string; topic?: string; targets?: string[] };
  stats?: {
    route?: string;
    overall?: { mean: number };
    perDimension?: Record<string, unknown>;
    branchResults?: Array<{ target?: string; evalTaskId?: string; dimensionScores?: Record<string, number> }>;
  } | null;
}

async function listRuns(page: Page): Promise<RunSummary[]> {
  const res = await page.request.get('/api/runs?limit=50');
  const { runs } = (await res.json()) as { runs: RunSummary[] };
  return runs ?? [];
}

async function detail(page: Page, id: string): Promise<RunSummary> {
  const { run } = (await (await page.request.get(`/api/runs/${id}`)).json()) as { run: RunSummary };
  return run;
}

test('content factory tour @factory-tour', async ({ page }) => {
  startTimestampRecording();

  // Resolve the three runs the tour needs BEFORE recording captions, so a
  // missing fixture fails loudly instead of narrating an empty screen.
  const runs = await listRuns(page);

  // a completed full-loop with per-branch dimension scores
  let fullLoop: RunSummary | undefined;
  for (const r of runs) {
    if (r.status !== 'completed' || r.stats?.route !== 'generate→migrate→evaluate') continue;
    const d = await detail(page, r.id);
    if ((d.stats?.branchResults ?? []).some((b) => b.dimensionScores)) { fullLoop = d; break; }
  }
  if (!fullLoop) throw new Error('tour: no completed full-loop run with branch dimension scores — run one first');

  // any batch (a run carrying a batch_id)
  const batchId = runs.find((r) => r.batchId)?.batchId ?? undefined;
  if (!batchId) throw new Error('tour: no batch in the store — run a bulk batch first');

  // a completed eval-direct run with an eval task to open evidence on
  let directEval: RunSummary | undefined;
  for (const r of runs) {
    if (r.kind !== 'eval-direct' || r.status !== 'completed') continue;
    const d = await detail(page, r.id);
    if ((d.stats?.branchResults ?? []).some((b) => b.evalTaskId)) { directEval = d; break; }
  }
  if (!directEval) throw new Error('tour: no completed eval-direct run with an evalTaskId — run a Direct eval first');

  const loopScore = Math.round(fullLoop.stats!.overall!.mean);

  // ── Scene 1: the dashboard — the mesh + the audit trail ───────────────────
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Coordinator' })).toBeVisible({ timeout: 15000 });
  await caption(
    page,
    'This is the Content Factory — a decoupled mesh of AI agents speaking the A2A protocol, all running live on this machine.',
    9600,
  );

  await expect(page.getByText('content-gen').first()).toBeVisible({ timeout: 10000 });
  await caption(
    page,
    'The chips are live health checks: the coordinator, content-gen, migration, and eval agents are all up.',
    8200,
  );

  await smoothScroll(page, 'table');
  await expect(page.getByText('Recent runs')).toBeVisible();
  await caption(
    page,
    'Every run the mesh has executed is recorded in the store — durable, and surviving restarts. This is the audit trail.',
    9200,
  );

  // ── Scene 2: a single full-loop run — branches + variance ─────────────────
  await page.goto(`/runs/${fullLoop.id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Overall')).toBeVisible({ timeout: 20000 });
  await caption(
    page,
    'Open a run. This is the full closed loop — generate, migrate, evaluate — fanned out across two parallel branches.',
    9200,
  );

  await expect(page.getByText(String(loopScore)).first()).toBeVisible();
  await caption(
    page,
    `The headline metric is variance: the mean score of ${loopScore}, its spread, the pass rate, and migration confidence across the fan-out.`,
    9600,
  );

  await scrollTo(page, page.getByRole('heading', { name: 'Branches' }));
  await expect(page.getByText('structure', { exact: false }).first()).toBeVisible();
  await caption(
    page,
    "Each branch shows every stage with real timings, and the eval agent's four dimensions, each scored on its own.",
    8800,
  );

  await scrollTo(page, page.getByText('Variance per dimension'));
  await caption(
    page,
    'And the per-dimension variance — mean, spread, min and max — for structure, accessibility, content, and visual.',
    9200,
  );

  // ── Scene 3: the bulk lane — batches at scale ─────────────────────────────
  await page.goto(`/batch/${batchId}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Batch' })).toBeVisible({ timeout: 20000 });
  await caption(
    page,
    'The bulk lane scores batches. Several pages at once — each one its own durable run, grouped under a single batch.',
    9200,
  );

  await expect(page.getByText('avg score')).toBeVisible();
  await caption(
    page,
    'Grade distribution, average score, retry-failed, and a one-click JSON export of the entire batch.',
    7800,
  );

  // ── Scene 4: the new eval flow — Direct eval + evidence ───────────────────
  await page.goto(`/runs/${directEval.id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Overall')).toBeVisible({ timeout: 20000 });
  await caption(
    page,
    'The eval agent is independently addressable. The Direct eval lane calls it straight — scoring exactly the dimensions you choose.',
    10000,
  );

  // expand the evidence panel — the auditability payoff
  await scrollTo(page, page.getByRole('button', { name: /Evidence/ }));
  await page.getByRole('button', { name: /Evidence/ }).first().click();
  await expect(page.getByText(/agentic|deterministic/).first()).toBeVisible({ timeout: 20000 });
  await scrollTo(page, page.getByText(/agentic|deterministic/).first());
  await caption(
    page,
    'Open the evidence: every score shows how it was produced — agentic or deterministic — with the real findings behind it.',
    9600,
  );

  // ── Scene 5: close ────────────────────────────────────────────────────────
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Coordinator' })).toBeVisible({ timeout: 15000 });
  await quickPause(page, 600);
  await caption(
    page,
    'One decoupled mesh — orchestrated or called directly, every run real, durable, and fully explainable. That is the Content Factory.',
    10400,
  );

  // let the voiceover finish before the recording stops
  await page.waitForTimeout(5000);
});
