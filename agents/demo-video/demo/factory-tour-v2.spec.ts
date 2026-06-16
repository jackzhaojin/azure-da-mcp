/**
 * Demo v2: a guided tour of the Content Factory coordinator dashboard — the
 * "retro" coordinator flow (previous runs, single full-loop) AND the decoupled
 * eval flow, now centered on the v2.1 **bulk source→target comparison** (the v1
 * parity capability): a bulk batch pairs each migrated target with its original
 * source — a PDF or a webpage — and the eval agent scores content + visual
 * fidelity against it. Recorded against the REAL local mesh (ports 4001-4004),
 * navigating REAL completed runs already in the store — no live trigger, because
 * with the agentic eval token enabled a full eval takes 1-2 min (too slow for a
 * smooth take).
 *
 * Record with (manual 4-step path for exact --from-log timestamps; see the README).
 * Use only --grep "@factory-tour-v2" (no file positional — testDir already scopes
 * to demo/, and the grep uniquely matches this test, not the v1 @factory-tour):
 *   1) npx playwright test --config=playwright.video.config.ts --grep "@factory-tour-v2"
 *   2) extract-captions.mjs --from-log <log> --output captions-v2.json
 *   3) generate-voice.mjs captions-v2.json --output-dir audio-v2 --env-file ../.env
 *   4) merge-video.mjs --video <test-results video.webm> --manifest captions-v2.json
 *      --audio-dir audio-v2 --output 2026-06-14-factory-tour/factory-tour-v2-final.mp4
 *
 * The store must contain: a completed full-loop run (generate→migrate→evaluate)
 * with branch results, a bulk batch whose items carry a SOURCE (sourceType pdf or
 * webpage), and a completed source-bearing eval run. The v2.1 bulk-source work seeded all three.
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
  config: { goal?: string; topic?: string; targets?: string[]; sourceType?: string; title?: string };
  stats?: {
    route?: string;
    overall?: { mean: number };
    perDimension?: Record<string, unknown>;
    branchResults?: Array<{ target?: string; evalTaskId?: string; dimensionScores?: Record<string, number> }>;
  } | null;
}

async function listRuns(page: Page): Promise<RunSummary[]> {
  const res = await page.request.get('/api/runs?limit=60');
  const { runs } = (await res.json()) as { runs: RunSummary[] };
  return runs ?? [];
}

async function detail(page: Page, id: string): Promise<RunSummary> {
  const { run } = (await (await page.request.get(`/api/runs/${id}`)).json()) as { run: RunSummary };
  return run;
}

const hasSource = (r: RunSummary): boolean => Boolean(r.config?.sourceType && r.config.sourceType !== 'none');

test('content factory tour v2 @factory-tour-v2', async ({ page }) => {
  startTimestampRecording();

  // Resolve every fixture the tour needs BEFORE recording captions, so a missing
  // fixture fails loudly instead of narrating an empty screen.
  const runs = await listRuns(page);

  // a completed full-loop with per-branch dimension scores
  let fullLoop: RunSummary | undefined;
  for (const r of runs) {
    if (r.status !== 'completed' || r.stats?.route !== 'generate→migrate→evaluate') continue;
    const d = await detail(page, r.id);
    if ((d.stats?.branchResults ?? []).some((b) => b.dimensionScores)) { fullLoop = d; break; }
  }
  if (!fullLoop) throw new Error('tour: no completed full-loop run with branch dimension scores — run one first');

  // a batch whose items carry a SOURCE (the bulk source→target comparison)
  const byBatch = new Map<string, RunSummary[]>();
  for (const r of runs) if (r.batchId) byBatch.set(r.batchId, [...(byBatch.get(r.batchId) ?? []), r]);
  let sourceBatchId: string | undefined;
  for (const [bid, rs] of byBatch) {
    if (rs.some(hasSource)) { sourceBatchId = bid; break; }
  }
  if (!sourceBatchId) throw new Error('tour: no bulk batch with a source — run a bulk source→target batch first');

  // a completed eval run that compared against a source (prefer a PDF source — the
  // content-fidelity comparison), with an eval task to open evidence on
  let sourceEval: RunSummary | undefined;
  const sourced = runs.filter((r) => r.status === 'completed' && hasSource(r));
  for (const r of [...sourced.filter((r) => r.config.sourceType === 'pdf'), ...sourced]) {
    const d = await detail(page, r.id);
    if ((d.stats?.branchResults ?? []).some((b) => b.evalTaskId)) { sourceEval = d; break; }
  }
  if (!sourceEval) throw new Error('tour: no completed source-bearing eval with an evalTaskId — run a source eval first');

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
    'Every run the mesh has executed is recorded in the store — durable, surviving restarts. This is the audit trail.',
    9000,
  );

  // ── Scene 2: a single full-loop run — branches + variance ─────────────────
  await page.goto(`/runs/${fullLoop.id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Overall')).toBeVisible({ timeout: 20000 });
  await caption(
    page,
    'Open a run. This is the full closed loop — generate, migrate, evaluate — fanned out across parallel branches.',
    9000,
  );

  await expect(page.getByText(String(loopScore)).first()).toBeVisible();
  await caption(
    page,
    `The headline metric is variance: the mean score of ${loopScore}, its spread, the pass rate, and migration confidence across the fan-out.`,
    9600,
  );

  // ── Scene 3: the bulk lane — source → target comparison (the v1 parity win) ─
  await page.goto('/bulk');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Bulk run', level: 1 })).toBeVisible({ timeout: 15000 });
  await caption(
    page,
    'Evaluation is really about source investigation — comparing a migrated page against the original it came from. The bulk lane does that at scale.',
    10400,
  );

  // load the sample → the read-only source→target pairing table
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText(/with a source to compare against/)).toBeVisible({ timeout: 10000 });
  await scrollTo(page, page.getByText(/with a source to compare against/));
  await caption(
    page,
    'Upload a batch and each page is paired with its original source — a PDF or a webpage — exactly like the v1 evaluator. Nothing in the UI to wire up; the JSON is just displayed.',
    10800,
  );

  await expect(page.getByText('pdf', { exact: true }).first()).toBeVisible();
  await caption(
    page,
    'Here: two pages sourced from PDFs, one from a live webpage, and one scored target-only — three source modes in one batch.',
    9600,
  );

  // a real completed source batch — the source column + scores
  await page.goto(`/batch/${sourceBatchId}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Batch' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('avg score')).toBeVisible();
  await scrollTo(page, page.getByRole('columnheader', { name: 'source' }));
  await caption(
    page,
    'A finished batch shows every item with the source it was compared against, its grade, and a one-click JSON export of the whole run.',
    9800,
  );

  // ── Scene 4: the payoff — content fidelity scored against the source ──────
  await page.goto(`/runs/${sourceEval.id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Overall')).toBeVisible({ timeout: 20000 });
  await caption(
    page,
    'Open one. The eval agent fetched the source, parsed it, and scored how faithfully the migrated page preserved it.',
    9400,
  );

  // expand the evidence panel — the source-comparison payoff
  await scrollTo(page, page.getByRole('button', { name: /Evidence/ }));
  await page.getByRole('button', { name: /Evidence/ }).first().click();
  await expect(page.getByText(/agentic|deterministic/).first()).toBeVisible({ timeout: 20000 });
  await scrollTo(page, page.getByText(/agentic|deterministic/).first());
  await caption(
    page,
    'The evidence is explainable: content fidelity scored agentically against the real source, every dimension showing how it was produced.',
    10000,
  );

  // ── Scene 5: close ────────────────────────────────────────────────────────
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Coordinator' })).toBeVisible({ timeout: 15000 });
  await quickPause(page, 600);
  await caption(
    page,
    'One decoupled mesh — single, bulk, or direct — every page scored against its source, every run real, durable, and fully explainable. That is the Content Factory.',
    11000,
  );

  // let the voiceover finish before the recording stops
  await page.waitForTimeout(5000);
});
