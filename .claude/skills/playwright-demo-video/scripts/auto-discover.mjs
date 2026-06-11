#!/usr/bin/env node
/**
 * auto-discover.mjs -- Scan a project and generate a Playwright demo spec
 *
 * Analyzes a web project's source code to detect:
 *   - Framework (React, Next.js, Vue, Angular, Svelte)
 *   - Routes and navigation structure
 *   - Interactive features (charts, tables, forms, kanban, dark mode)
 *   - data-testid attributes grouped by page/component
 *
 * Then generates a Playwright demo spec that exercises the discovered features
 * with caption overlays for the demo video pipeline.
 *
 * Supports two modes:
 *   - Full discovery: scan everything, generate comprehensive demo
 *   - Guided: focus on a specific feature (e.g., "kanban drag-and-drop")
 *
 * Zero npm dependencies -- uses Node.js builtins only.
 *
 * Usage:
 *   node auto-discover.mjs <project-dir> [options]
 *
 * Options:
 *   --output, -o <path>      Output spec file path (default: <project>/demo/auto-demo.spec.ts)
 *   --inventory <path>       Output feature inventory JSON (default: <project>/demo/feature-inventory.json)
 *   --focus <feature>        Guided mode: focus on a specific feature (e.g., "kanban", "dark-mode", "charts")
 *   --project-name <name>    Override project name (default: from package.json)
 *   --base-url <url>         Dev server URL (default: http://localhost:5173)
 *   --dry-run                Print generated spec to stdout without writing
 *   --inventory-only         Only output the feature inventory, skip spec generation
 *   --helpers-dir <path>     Directory containing helpers.ts (default: same as output spec dir)
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node auto-discover.mjs <project-dir> [options]

Options:
  --output, -o <path>      Output spec file path (default: <project>/demo/auto-demo.spec.ts)
  --inventory <path>       Output feature inventory JSON
  --focus <feature>        Guided mode: focus on specific feature (kanban, charts, dark-mode, etc.)
  --project-name <name>    Override project name (default: from package.json)
  --base-url <url>         Dev server URL (default: http://localhost:5173)
  --dry-run                Print to stdout without writing files
  --inventory-only         Only generate feature inventory JSON
  --helpers-dir <path>     Directory containing helpers.ts`);
  process.exit(0);
}

function getArg(flags, defaultVal) {
  const flagList = Array.isArray(flags) ? flags : [flags];
  for (const flag of flagList) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  }
  return defaultVal;
}

function hasFlag(flag) {
  return args.includes(flag);
}

const projectDir = path.resolve(args.find((a) => !a.startsWith('-')));
const focus = getArg(['--focus'], null);
const projectNameOverride = getArg(['--project-name'], null);
const baseUrl = getArg(['--base-url'], 'http://localhost:5173');
const dryRun = hasFlag('--dry-run');
const inventoryOnly = hasFlag('--inventory-only');

// Resolve output paths
const defaultDemoDir = path.join(projectDir, 'demo');
const outputSpec = getArg(['--output', '-o'], path.join(defaultDemoDir, 'auto-demo.spec.ts'));
const inventoryPath = getArg(['--inventory'], path.join(defaultDemoDir, 'feature-inventory.json'));
const helpersDir = getArg(['--helpers-dir'], path.dirname(outputSpec));

if (!fs.existsSync(projectDir)) {
  console.error(`Error: Project directory not found: ${projectDir}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Framework detection
// ---------------------------------------------------------------------------

function detectFramework(pkgJson) {
  const allDeps = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  };

  if (allDeps['next']) return { name: 'nextjs', label: 'Next.js' };
  if (allDeps['@remix-run/react']) return { name: 'remix', label: 'Remix' };
  if (allDeps['react']) return { name: 'react', label: 'React' };
  if (allDeps['vue']) return { name: 'vue', label: 'Vue' };
  if (allDeps['@angular/core']) return { name: 'angular', label: 'Angular' };
  if (allDeps['svelte']) return { name: 'svelte', label: 'Svelte' };
  return { name: 'unknown', label: 'Unknown' };
}

function detectBuildTool(pkgJson) {
  const allDeps = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  };

  if (allDeps['vite'] || allDeps['@vitejs/plugin-react']) return 'vite';
  if (allDeps['next']) return 'next';
  if (allDeps['webpack']) return 'webpack';
  return 'unknown';
}

function detectStyling(pkgJson, projectDir) {
  const allDeps = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  };

  const styles = [];
  if (allDeps['tailwindcss']) styles.push('Tailwind CSS');
  if (allDeps['styled-components']) styles.push('styled-components');
  if (allDeps['@emotion/react']) styles.push('Emotion');
  if (allDeps['sass']) styles.push('Sass');
  if (fs.existsSync(path.join(projectDir, 'tailwind.config.js')) ||
      fs.existsSync(path.join(projectDir, 'tailwind.config.ts'))) {
    if (!styles.includes('Tailwind CSS')) styles.push('Tailwind CSS');
  }
  return styles;
}

function detectChartLib(pkgJson) {
  const allDeps = {
    ...(pkgJson.dependencies || {}),
    ...(pkgJson.devDependencies || {}),
  };

  if (allDeps['recharts']) return 'Recharts';
  if (allDeps['chart.js'] || allDeps['react-chartjs-2']) return 'Chart.js';
  if (allDeps['d3']) return 'D3.js';
  if (allDeps['victory']) return 'Victory';
  if (allDeps['@nivo/core']) return 'Nivo';
  return null;
}

// ---------------------------------------------------------------------------
// Route detection
// ---------------------------------------------------------------------------

function detectRoutes(projectDir, framework) {
  const routes = [];

  if (framework.name === 'nextjs') {
    // Next.js: scan pages/ or app/ directory
    const pagesDir = path.join(projectDir, 'pages');
    const appDir = path.join(projectDir, 'app');

    if (fs.existsSync(appDir)) {
      scanNextAppDir(appDir, '', routes);
    } else if (fs.existsSync(pagesDir)) {
      scanNextPagesDir(pagesDir, '', routes);
    }
  } else if (framework.name === 'react') {
    // React Router: scan source files for Route definitions and navItems
    scanReactRoutes(projectDir, routes);
  }

  return routes;
}

function scanNextAppDir(dir, prefix, routes) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('_')) {
      const newPrefix = `${prefix}/${entry.name}`;
      if (fs.existsSync(path.join(dir, entry.name, 'page.tsx')) ||
          fs.existsSync(path.join(dir, entry.name, 'page.jsx'))) {
        routes.push({ path: newPrefix, source: 'nextjs-app-dir' });
      }
      scanNextAppDir(path.join(dir, entry.name), newPrefix, routes);
    }
  }
}

function scanNextPagesDir(dir, prefix, routes) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    if (entry.isDirectory()) {
      scanNextPagesDir(path.join(dir, entry.name), `${prefix}/${entry.name}`, routes);
    } else if (entry.name.match(/\.(tsx?|jsx?)$/)) {
      const routePath = entry.name === 'index.tsx' || entry.name === 'index.jsx'
        ? prefix || '/'
        : `${prefix}/${entry.name.replace(/\.(tsx?|jsx?)$/, '')}`;
      routes.push({ path: routePath, source: 'nextjs-pages-dir' });
    }
  }
}

function scanReactRoutes(projectDir, routes) {
  // First try to find navItems or route config files
  const srcDir = path.join(projectDir, 'src');
  if (!fs.existsSync(srcDir)) return;

  const files = getAllFiles(srcDir, ['.tsx', '.ts', '.jsx', '.js']);

  // Scan for React Router <Route path="..." /> definitions
  const routeRx = /<Route\s+path=["']([^"']+)["']/g;

  // Also scan for navItems arrays
  const navItemPathRx = /path:\s*['"]([^'"]+)['"]/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');

    let m;
    while ((m = routeRx.exec(content)) !== null) {
      const routePath = m[1];
      if (!routes.find((r) => r.path === routePath)) {
        routes.push({
          path: routePath,
          source: 'react-router',
          file: path.relative(projectDir, file),
        });
      }
    }

    // Check for navItems-style configs
    if (content.includes('navItems') || content.includes('routes')) {
      navItemPathRx.lastIndex = 0;
      while ((m = navItemPathRx.exec(content)) !== null) {
        const routePath = m[1];
        if (routePath.startsWith('/') && !routes.find((r) => r.path === routePath)) {
          routes.push({
            path: routePath,
            source: 'nav-config',
            file: path.relative(projectDir, file),
          });
        }
      }
    }
  }

  // Deduplicate and sort
  const seen = new Set();
  const deduped = [];
  for (const r of routes) {
    if (!seen.has(r.path)) {
      seen.add(r.path);
      deduped.push(r);
    }
  }
  routes.length = 0;
  routes.push(...deduped);
}

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

function detectFeatures(projectDir, pkgJson) {
  const features = [];
  const srcDir = path.join(projectDir, 'src');
  if (!fs.existsSync(srcDir)) return features;

  const files = getAllFiles(srcDir, ['.tsx', '.ts', '.jsx', '.js']);

  // Collect all data-testid values with their file context
  const testIds = new Map(); // testId -> { files, component }
  // Match both data-testid="value" and data-testid={`template-${var}`} patterns
  const testIdRx = /data-testid=["']([^"']+)["']/g;
  // Also match testId="value" prop (e.g., StatCard testId="stat-total-projects")
  const testIdPropRx = /\btestId=["']([^"']+)["']/g;
  // Match data-testid={`prefix-${...}`} to extract the prefix pattern
  const testIdTemplateRx = /data-testid=\{`([^$`]+)\$\{/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const relPath = path.relative(projectDir, file);
    let m;

    // Standard data-testid="literal"
    testIdRx.lastIndex = 0;
    while ((m = testIdRx.exec(content)) !== null) {
      const id = m[1];
      if (!testIds.has(id)) {
        testIds.set(id, { files: [], component: guessComponent(relPath), dynamic: false });
      }
      if (!testIds.get(id).files.includes(relPath)) {
        testIds.get(id).files.push(relPath);
      }
    }

    // testId="value" prop (React component pattern, e.g., <StatCard testId="stat-total-projects">)
    testIdPropRx.lastIndex = 0;
    while ((m = testIdPropRx.exec(content)) !== null) {
      const id = m[1];
      if (!testIds.has(id)) {
        testIds.set(id, { files: [], component: guessComponent(relPath), dynamic: false });
      }
      if (!testIds.get(id).files.includes(relPath)) {
        testIds.get(id).files.push(relPath);
      }
    }

    // data-testid={`nav-${item.path}`} template patterns -- record as dynamic prefix
    testIdTemplateRx.lastIndex = 0;
    while ((m = testIdTemplateRx.exec(content)) !== null) {
      const prefix = m[1];
      const dynKey = `__dynamic__${prefix}`;
      if (!testIds.has(dynKey)) {
        testIds.set(dynKey, { files: [], component: guessComponent(relPath), dynamic: true, prefix });
      }
      if (!testIds.get(dynKey).files.includes(relPath)) {
        testIds.get(dynKey).files.push(relPath);
      }
    }
  }

  // Detect charts
  const chartLib = detectChartLib(pkgJson);
  if (chartLib) {
    const chartTestIds = [...testIds.keys()].filter(
      (id) => !id.startsWith('__dynamic__') && (id.includes('chart') || id.includes('graph') || id.includes('pie') || id.includes('line-chart'))
    );
    features.push({
      category: 'charts',
      label: 'Data Visualization',
      description: `Charts powered by ${chartLib}`,
      testIds: chartTestIds,
      demoTimeSec: 10,
      priority: 1,
      route: '/',
    });
  }

  // Detect stat cards
  const statTestIds = [...testIds.keys()].filter((id) => id.startsWith('stat-'));
  if (statTestIds.length > 0) {
    features.push({
      category: 'stat-cards',
      label: 'Stat Cards',
      description: `${statTestIds.length} interactive metric cards`,
      testIds: statTestIds,
      demoTimeSec: 8,
      priority: 2,
      route: '/',
    });
  }

  // Detect tables
  const tableTestIds = [...testIds.keys()].filter(
    (id) => !id.startsWith('__dynamic__') && (id.includes('table') || id.includes('sort-indicator'))
  );
  if (tableTestIds.length > 0) {
    features.push({
      category: 'table',
      label: 'Sortable Data Table',
      description: 'Table with search, sort, and pagination',
      testIds: tableTestIds,
      demoTimeSec: 12,
      priority: 3,
      route: '/projects',
    });
  }

  // Detect kanban / drag-and-drop
  const kanbanTestIds = [...testIds.keys()].filter(
    (id) => !id.startsWith('__dynamic__') && (id.includes('kanban') || id.includes('drag') || id.includes('task-card'))
  );
  if (kanbanTestIds.length > 0) {
    features.push({
      category: 'kanban',
      label: 'Kanban Board',
      description: 'Drag-and-drop task management board',
      testIds: kanbanTestIds,
      demoTimeSec: 12,
      priority: 4,
      route: '/tasks',
    });
  }

  // Detect dark mode / theme toggle
  const themeTestIds = [...testIds.keys()].filter(
    (id) => !id.startsWith('__dynamic__') && (id.includes('theme') || id.includes('dark-mode') || id.includes('appearance'))
  );
  if (themeTestIds.length > 0) {
    features.push({
      category: 'dark-mode',
      label: 'Dark Mode',
      description: 'Theme toggle with full interface adaptation',
      testIds: themeTestIds,
      demoTimeSec: 8,
      priority: 5,
      route: null, // global feature
    });
  }

  // Pre-compute settings test IDs for deduplication
  const settingsTestIds = [...testIds.keys()].filter(
    (id) =>
      !id.startsWith('__dynamic__') &&
      (id.includes('settings') ||
       id.includes('profile') ||
       id.includes('notification-toggle') ||
       id.includes('accent-color'))
  );

  // Detect forms -- exclude IDs already claimed by settings
  const settingsClaimedIds = new Set(settingsTestIds);
  const formTestIds = [...testIds.keys()].filter(
    (id) =>
      !id.startsWith('__dynamic__') &&
      !settingsClaimedIds.has(id) &&
      (id.includes('form') || id.includes('invite'))
  );
  // Only include forms as a feature if there are unique form test IDs
  if (formTestIds.length >= 2) {
    features.push({
      category: 'forms',
      label: 'Forms & Input',
      description: 'Interactive forms with validation',
      testIds: formTestIds,
      demoTimeSec: 10,
      priority: 6,
      route: null, // multiple pages
    });
  }

  // Detect navigation
  const navTestIds = [...testIds.keys()].filter(
    (id) => id.startsWith('nav-') || id === 'sidebar'
  );
  // Also check for dynamic nav patterns and infer nav IDs from routes
  const hasDynamicNav = [...testIds.keys()].some((id) => id === '__dynamic__nav-');
  if (hasDynamicNav) {
    // Infer concrete nav test IDs from discovered routes
    const routes = detectRoutes(projectDir, detectFramework(
      JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'))
    ));
    for (const r of routes) {
      const slug = r.path === '/' ? 'dashboard' : r.path.replace(/^\//, '');
      const navId = `nav-${slug}`;
      if (!navTestIds.includes(navId)) {
        navTestIds.push(navId);
      }
    }
  }
  if (navTestIds.length > 0) {
    features.push({
      category: 'navigation',
      label: 'Navigation',
      description: 'Sidebar navigation with active state',
      testIds: navTestIds.filter((id) => !id.startsWith('__dynamic__')),
      demoTimeSec: 5,
      priority: 7,
      route: null, // global
    });
  }

  // Detect responsive design (check for Tailwind responsive prefixes or media queries)
  const styling = detectStyling(pkgJson, projectDir);
  if (styling.includes('Tailwind CSS')) {
    features.push({
      category: 'responsive',
      label: 'Responsive Design',
      description: 'Adaptive layout from mobile to desktop',
      testIds: [],
      demoTimeSec: 10,
      priority: 8,
      route: '/',
    });
  }

  // Detect settings / preferences (settingsTestIds already computed above for deduplication)
  if (settingsTestIds.length > 0) {
    features.push({
      category: 'settings',
      label: 'Settings & Preferences',
      description: 'User profile, notifications, appearance customization',
      testIds: settingsTestIds,
      demoTimeSec: 8,
      priority: 9,
      route: '/settings',
    });
  }

  // Sort by priority
  features.sort((a, b) => a.priority - b.priority);

  return features;
}

function guessComponent(relPath) {
  const parts = relPath.split(path.sep);
  const fileName = parts[parts.length - 1].replace(/\.(tsx?|jsx?)$/, '');
  return fileName;
}

// ---------------------------------------------------------------------------
// File scanning utilities
// ---------------------------------------------------------------------------

function getAllFiles(dir, extensions) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue;
      results.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Spec generation
// ---------------------------------------------------------------------------

function generateSpec(inventory, focusFeature) {
  const { projectName, framework, chartLib, styling, routes, features } = inventory;

  // Filter features based on focus mode
  let selectedFeatures = features;
  if (focusFeature) {
    selectedFeatures = features.filter((f) => {
      const focusLower = focusFeature.toLowerCase();
      return (
        f.category.toLowerCase().includes(focusLower) ||
        f.label.toLowerCase().includes(focusLower) ||
        f.description.toLowerCase().includes(focusLower)
      );
    });
    if (selectedFeatures.length === 0) {
      console.warn(`WARNING: No features matched focus "${focusFeature}". Using all features.`);
      selectedFeatures = features;
    }
  }

  const techStack = [
    framework.label,
    'TypeScript',
    ...(styling || []),
    chartLib,
  ].filter(Boolean).join(', ');

  const helpersRelPath = path.relative(path.dirname(outputSpec), helpersDir);
  const helpersImport = helpersRelPath === '.' || helpersRelPath === ''
    ? './helpers'
    : `./${helpersRelPath}/helpers`.replace(/\\/g, '/');

  // Build sections
  const sections = [];

  for (const feature of selectedFeatures) {
    sections.push(generateFeatureSection(feature, inventory));
  }

  const testTag = focusFeature
    ? `@auto-${focusFeature.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
    : '@auto-demo';

  const testTitle = focusFeature
    ? `${projectName} -- ${selectedFeatures.map((f) => f.label).join(', ')}`
    : `${projectName} -- Full Auto-Discover Demo`;

  const spec = `/**
 * Auto-Generated Demo Spec
 *
 * Generated by auto-discover.mjs from project analysis.
 * Project: ${projectName}
 * Framework: ${framework.label}
 * Features: ${selectedFeatures.map((f) => f.label).join(', ')}
 *
 * Run: npx playwright test --config=playwright.video.config.ts --grep ${testTag}
 *
 * @tags ${testTag}
 */
import { test, type Page } from '@playwright/test';
import {
  pause,
  scenicPause,
  quickPause,
  smoothScroll,
  setViewport,
  dragAndDrop,
} from '${helpersImport}';

// ---------------------------------------------------------------------------
// Caption overlay system
// ---------------------------------------------------------------------------

const CAPTION_CSS = [
  'position:fixed',
  'bottom:0',
  'left:0',
  'right:0',
  'z-index:99999',
  'padding:20px 40px 28px',
  'background:linear-gradient(transparent 0%,rgba(0,0,0,0.15) 15%,rgba(0,0,0,0.82) 100%)',
  'color:#fff',
  'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  'font-size:20px',
  'font-weight:500',
  'line-height:1.4',
  'text-align:center',
  'letter-spacing:0.01em',
  'text-shadow:0 1px 3px rgba(0,0,0,0.5)',
  'pointer-events:none',
  'opacity:0',
  'transition:opacity 0.3s ease',
].join(';');

async function showCaption(page: Page, text: string): Promise<void> {
  await page.evaluate(([t, css]: string[]) => {
    let el = document.getElementById('demo-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-caption';
      el.style.cssText = css;
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.opacity = '1';
  }, [text, CAPTION_CSS]);
  await page.waitForTimeout(300);
}

async function hideCaption(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('demo-caption');
    if (el) el.style.opacity = '0';
  });
  await page.waitForTimeout(300);
}

async function caption(page: Page, text: string, ms = 3000): Promise<void> {
  await showCaption(page, text);
  await page.waitForTimeout(ms);
  await hideCaption(page);
}

// ---------------------------------------------------------------------------
// AUTO-GENERATED DEMO
// ---------------------------------------------------------------------------

test('${testTag} ${testTitle}', async ({ page }) => {
  // =========================================================================
  // SETUP
  // =========================================================================
  await setViewport(page, 1280, 800);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // =========================================================================
  // WELCOME
  // =========================================================================
  await caption(page, 'Welcome to ${projectName} -- ${focusFeature ? `featuring ${selectedFeatures.map((f) => f.label.toLowerCase()).join(', ')}` : 'a full feature tour'}.', 3500);

${sections.join('\n')}
  // =========================================================================
  // OUTRO
  // =========================================================================
  await caption(
    page,
    '${projectName} -- ${techStack}. Thanks for watching.',
    4500,
  );
});
`;

  return spec;
}

// ---------------------------------------------------------------------------
// Per-feature section generators
// ---------------------------------------------------------------------------

function generateFeatureSection(feature, inventory) {
  switch (feature.category) {
    case 'stat-cards':
      return generateStatCardsSection(feature);
    case 'charts':
      return generateChartsSection(feature, inventory);
    case 'table':
      return generateTableSection(feature, inventory);
    case 'kanban':
      return generateKanbanSection(feature);
    case 'dark-mode':
      return generateDarkModeSection(feature);
    case 'responsive':
      return generateResponsiveSection(feature, inventory);
    case 'navigation':
      return generateNavigationSection(feature, inventory);
    case 'settings':
      return generateSettingsSection(feature);
    case 'forms':
      return generateFormsSection(feature);
    default:
      return generateGenericSection(feature);
  }
}

function generateStatCardsSection(feature) {
  const statSelectors = feature.testIds
    .filter((id) => id.startsWith('stat-'))
    .map((id) => `    '[data-testid="${id}"]',`)
    .join('\n');

  return `  // =========================================================================
  // SECTION: ${feature.label}
  // =========================================================================

  await showCaption(page, '${feature.description}.');
  const statCards = [
${statSelectors}
  ];

  for (const card of statCards) {
    await page.hover(card);
    await quickPause(page, 600);
  }
  await pause(page, 1000);
  await hideCaption(page);

`;
}

function generateChartsSection(feature, inventory) {
  const chartIds = feature.testIds.filter((id) => id.includes('chart'));
  const chartSelectors = chartIds.length > 0
    ? `'[data-testid="${chartIds[0]}"]'`
    : `'[data-testid="dashboard-charts"]'`;

  return `  // =========================================================================
  // SECTION: ${feature.label}
  // =========================================================================

  await showCaption(page, '${feature.description}.');
  await smoothScroll(page, ${chartSelectors});
  await scenicPause(page, 2000);

  // Hover over chart to trigger tooltips
  await showCaption(page, 'Hover tooltips reveal exact data points.');
  const chartsSection = page.locator(${chartSelectors});
  const chartsBBox = await chartsSection.boundingBox();
  if (chartsBBox) {
    for (let i = 0; i < 5; i++) {
      const x = chartsBBox.x + (chartsBBox.width * 0.1) + (chartsBBox.width * 0.35 * i) / 4;
      const y = chartsBBox.y + chartsBBox.height * 0.4;
      await page.mouse.move(x, y);
      await pause(page, 400);
    }
  }
  await scenicPause(page, 1500);
  await hideCaption(page);

`;
}

function generateTableSection(feature, inventory) {
  const tableRoute = feature.route || '/projects';

  return `  // =========================================================================
  // SECTION: ${feature.label}
  // =========================================================================

  await caption(page, 'The ${feature.label.toLowerCase()} with search, sort, and pagination.', 2500);

  await page.click('[data-testid="nav-${tableRoute.replace('/', '') || 'dashboard'}"]');
  await page.waitForLoadState('networkidle');
  await scenicPause(page, 1500);

  // Show table features
  await showCaption(page, 'Search, sorting, and pagination -- all built in.');
  await scenicPause(page, 2000);

  // Demonstrate column sorting
  await showCaption(page, 'Sortable column headers toggle direction.');
  const headers = page.locator('th');
  const headerCount = await headers.count();
  if (headerCount > 0) {
    await headers.first().click();
    await pause(page, 800);
    await headers.first().click();
    await pause(page, 800);
  }
  await scenicPause(page, 1200);
  await hideCaption(page);

`;
}

function generateKanbanSection(feature) {
  return `  // =========================================================================
  // SECTION: ${feature.label}
  // =========================================================================

  await caption(page, 'The Kanban board -- drag-and-drop task management.', 3000);

  await page.click('[data-testid="nav-tasks"]');
  await page.waitForLoadState('networkidle');
  await scenicPause(page, 1500);

  // Drag To Do -> In Progress
  const todoCards = page.locator('[data-testid="kanban-column-todo"] article[draggable="true"]');
  const todoCount = await todoCards.count();

  if (todoCount > 0) {
    await showCaption(page, 'Moving a task from To Do to In Progress.');
    await dragAndDrop(
      page,
      '[data-testid="kanban-column-todo"] article[draggable="true"]:first-of-type',
      '[data-testid="kanban-column-in-progress"]',
      { steps: 15, holdMs: 150 },
    );
    await scenicPause(page, 1800);
  }

  // Drag In Progress -> Done
  const ipCards = page.locator('[data-testid="kanban-column-in-progress"] article[draggable="true"]');
  const ipCount = await ipCards.count();

  if (ipCount > 0) {
    await showCaption(page, 'And from In Progress to Done.');
    await dragAndDrop(
      page,
      '[data-testid="kanban-column-in-progress"] article[draggable="true"]:first-of-type',
      '[data-testid="kanban-column-done"]',
      { steps: 15, holdMs: 150 },
    );
    await scenicPause(page, 1800);
  }
  await hideCaption(page);

`;
}

function generateDarkModeSection(feature) {
  const toggleId = feature.testIds.find((id) => id.includes('theme-toggle')) || 'theme-toggle';

  return `  // =========================================================================
  // SECTION: ${feature.label}
  // =========================================================================

  await caption(page, 'Dark mode -- one click transforms the entire interface.', 3000);

  await page.click('[data-testid="${toggleId}"]');
  await scenicPause(page, 1500);

  await showCaption(page, 'Every component adapts to the dark palette.');
  await page.click('[data-testid="nav-dashboard"]');
  await page.waitForLoadState('networkidle');
  await scenicPause(page, 2500);
  await hideCaption(page);

  // Toggle back to light mode
  await page.click('[data-testid="${toggleId}"]');
  await scenicPause(page, 1500);

`;
}

function generateResponsiveSection(feature, inventory) {
  return `  // =========================================================================
  // SECTION: ${feature.label}
  // =========================================================================

  await caption(page, 'Responsive design -- from desktop to mobile.', 3000);

  // Mobile
  await showCaption(page, 'Mobile at 375px -- everything adapts.');
  await setViewport(page, 375, 800);
  await scenicPause(page, 2500);

  // Tablet
  await showCaption(page, 'Tablet -- the sidebar collapses.');
  await setViewport(page, 768, 800);
  await scenicPause(page, 1800);

  // Back to desktop
  await showCaption(page, 'Back to desktop -- full layout restored.');
  await setViewport(page, 1280, 800);
  await scenicPause(page, 2000);
  await hideCaption(page);

`;
}

function generateNavigationSection(feature, inventory) {
  const navIds = feature.testIds.filter((id) => id.startsWith('nav-'));
  const navSelectors = navIds.slice(0, 4).map((id) => `    '[data-testid="${id}"]',`).join('\n');

  return `  // =========================================================================
  // SECTION: ${feature.label}
  // =========================================================================

  await showCaption(page, '${feature.description}.');
  const navLinks = [
${navSelectors}
  ];

  for (const link of navLinks) {
    await page.click(link);
    await page.waitForLoadState('networkidle');
    await quickPause(page, 800);
  }
  await scenicPause(page, 1000);
  await hideCaption(page);

  // Return to dashboard
  await page.click('[data-testid="nav-dashboard"]');
  await page.waitForLoadState('networkidle');
  await pause(page, 800);

`;
}

function generateSettingsSection(feature) {
  const themeOptions = feature.testIds.filter((id) => id.includes('theme-option'));
  const accentColors = feature.testIds.filter((id) => id.includes('accent-color'));

  let settingsBody = '';

  if (themeOptions.length > 0 || accentColors.length > 0) {
    settingsBody += `
  await page.click('[data-testid="nav-settings"]');
  await page.waitForLoadState('networkidle');
  await scenicPause(page, 1500);
`;
    if (accentColors.length > 0) {
      const colorSelectors = accentColors.slice(0, 3).map((id) =>
        `    await page.click('[data-testid="${id}"]');\n    await pause(page, 600);`
      ).join('\n');
      settingsBody += `
  await showCaption(page, 'Customize the accent color scheme.');
${colorSelectors}
  await scenicPause(page, 1200);
  await hideCaption(page);
`;
    }
  }

  return `  // =========================================================================
  // SECTION: ${feature.label}
  // =========================================================================

  await caption(page, '${feature.description}.', 2500);
${settingsBody}
`;
}

function generateFormsSection(feature) {
  return `  // =========================================================================
  // SECTION: ${feature.label}
  // =========================================================================

  await showCaption(page, '${feature.description}.');
  await scenicPause(page, 2000);
  await hideCaption(page);

`;
}

function generateGenericSection(feature) {
  return `  // =========================================================================
  // SECTION: ${feature.label}
  // =========================================================================

  await showCaption(page, '${feature.description}.');
  await scenicPause(page, 2500);
  await hideCaption(page);

`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== Auto-Discover Mode ===\n');
  console.log(`Project: ${projectDir}`);
  if (focus) console.log(`Focus:   ${focus}`);
  console.log();

  // Read package.json
  const pkgJsonPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    console.error('Error: No package.json found in project directory.');
    process.exit(1);
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  const rawName = projectNameOverride || pkgJson.name || path.basename(projectDir);
  // Format project name: "project-management-dashboard" -> "Project Management Dashboard"
  const projectName = rawName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Detect framework
  const framework = detectFramework(pkgJson);
  const buildTool = detectBuildTool(pkgJson);
  const chartLib = detectChartLib(pkgJson);
  const styling = detectStyling(pkgJson, projectDir);

  console.log('--- Project Analysis ---');
  console.log(`  Name:       ${projectName}`);
  console.log(`  Framework:  ${framework.label}`);
  console.log(`  Build tool: ${buildTool}`);
  console.log(`  Styling:    ${styling.join(', ') || 'none detected'}`);
  console.log(`  Charts:     ${chartLib || 'none detected'}`);
  console.log();

  // Detect routes
  const routes = detectRoutes(projectDir, framework);
  console.log(`--- Routes (${routes.length}) ---`);
  for (const r of routes) {
    console.log(`  ${r.path} (${r.source})`);
  }
  console.log();

  // Detect features
  const features = detectFeatures(projectDir, pkgJson);
  console.log(`--- Features (${features.length}) ---`);
  for (const f of features) {
    console.log(`  [P${f.priority}] ${f.label}: ${f.description}`);
    if (f.testIds.length > 0) {
      console.log(`       test IDs: ${f.testIds.slice(0, 5).join(', ')}${f.testIds.length > 5 ? ` (+${f.testIds.length - 5} more)` : ''}`);
    }
  }
  console.log();

  // Total estimated demo time
  let filteredFeatures = features;
  if (focus) {
    filteredFeatures = features.filter((f) => {
      const focusLower = focus.toLowerCase();
      return (
        f.category.toLowerCase().includes(focusLower) ||
        f.label.toLowerCase().includes(focusLower) ||
        f.description.toLowerCase().includes(focusLower)
      );
    });
    if (filteredFeatures.length === 0) {
      console.warn(`No features matched focus "${focus}". Will use all features.`);
      filteredFeatures = features;
    } else {
      console.log(`Focus mode: ${filteredFeatures.length} features matched "${focus}"`);
    }
  }

  const totalTime = filteredFeatures.reduce((sum, f) => sum + f.demoTimeSec, 0);
  console.log(`Estimated demo time: ~${totalTime}s (${filteredFeatures.length} features)\n`);

  // Build inventory
  const inventory = {
    projectName,
    projectDir,
    framework,
    buildTool,
    chartLib,
    styling,
    routes,
    features,
    totalEstimatedTimeSec: totalTime,
    generatedAt: new Date().toISOString(),
  };

  // Write inventory JSON
  if (!dryRun) {
    const invDir = path.dirname(inventoryPath);
    if (!fs.existsSync(invDir)) {
      fs.mkdirSync(invDir, { recursive: true });
    }
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));
    console.log(`Feature inventory: ${path.resolve(inventoryPath)}`);
  }

  if (inventoryOnly) {
    if (dryRun) {
      console.log('\n--- Feature Inventory (dry run) ---');
      console.log(JSON.stringify(inventory, null, 2));
    }
    console.log('\nDone (inventory only).');
    return;
  }

  // Generate spec
  console.log('\nGenerating demo spec...');
  const spec = generateSpec(inventory, focus);

  if (dryRun) {
    console.log('\n--- Generated Spec (dry run) ---');
    console.log(spec);
  } else {
    const specDir = path.dirname(outputSpec);
    if (!fs.existsSync(specDir)) {
      fs.mkdirSync(specDir, { recursive: true });
    }
    fs.writeFileSync(outputSpec, spec);
    console.log(`Demo spec written: ${path.resolve(outputSpec)}`);
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`  Project:    ${projectName}`);
  console.log(`  Framework:  ${framework.label} + ${buildTool}`);
  console.log(`  Features:   ${filteredFeatures.length} detected`);
  console.log(`  Est. time:  ~${totalTime}s`);
  if (!dryRun) {
    console.log(`  Inventory:  ${path.resolve(inventoryPath)}`);
    console.log(`  Spec file:  ${path.resolve(outputSpec)}`);
  }
  console.log('\nNext steps:');
  console.log('  1. Review the generated spec and adjust captions/timing as needed');
  console.log('  2. Copy helpers.ts and caption-overlay.ts into the demo directory');
  console.log('  3. Record video: npx playwright test --config=playwright.video.config.ts --grep @auto-demo');
  console.log('  4. Run pipeline: node run-pipeline.mjs --spec <spec> --video <video>');
}

main();
