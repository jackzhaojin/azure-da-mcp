# Auto-Discover Mode -- Detailed Patterns

## Table of Contents

1. [Discovery Pipeline](#discovery-pipeline)
2. [Framework Detection](#framework-detection)
3. [Feature Detection Patterns](#feature-detection-patterns)
4. [Spec Generation Template](#spec-generation-template)
5. [Challenges and Mitigations](#challenges-and-mitigations)

---

## Discovery Pipeline

```
Step 1: Scan project structure
  - Check package.json for framework (react, next, vue, angular)
  - Find route definitions (React Router, Next.js pages/app, file-based)
  - Find component files (*.tsx, *.vue, *.svelte)

Step 2: Extract interactive elements
  - Grep for data-testid attributes across all component files
  - Group by page/route
  - Categorize: navigation, forms, tables, buttons, toggles, charts, draggable

Step 3: Build feature inventory
  - Map elements to feature categories
  - Prioritize by demo impact: charts > tables > forms > buttons
  - Estimate demo time per feature

Step 4: Generate demo spec
  - Template: imports, viewport setup, goto, sections per feature
  - Each section: navigate, interact, caption
  - Include caption overlay system from template
  - Include timing pauses for demo pacing

Step 5: Validate (optional runtime check)
  - Start dev server
  - Run generated spec with --headed to verify it works
  - Fix any selector issues
```

## Framework Detection

Check `package.json` dependencies for framework identification:

| Framework | Detection Keys |
|-----------|---------------|
| React | `react`, `react-dom` |
| Next.js | `next` |
| Vue | `vue` |
| Angular | `@angular/core` |
| Svelte | `svelte` |
| Remix | `@remix-run/react` |

### Route Detection by Framework

**React Router:**
```javascript
/\<Route\s+path=["']([^"']+)["']/g
```

**Next.js pages dir:** Scan `pages/` for `*.tsx`/`*.jsx` files. Each file = a route.

**Next.js app dir:** Scan `app/` for `page.tsx` files. Directory structure = route.

**Vue Router:**
```javascript
/path:\s*['"]([^'"]+)['"]/g  // in router config files
```

## Feature Detection Patterns

### Regex patterns for feature scanning

```javascript
// Navigation with data-testid
/data-testid=["']nav-([^"']+)["']/g

// All interactive elements
/data-testid=["']([^"']+)["']/g

// Forms
/<form|<input|type=["']submit["']/g

// Tables with sort
/<th.*?(?:onClick|sortable|data-testid)/g

// Theme toggle
/data-testid=["'](?:theme|dark-mode|toggle)[-\w]*["']/g

// Charts (library imports)
/import.*?(?:Recharts|Chart\.js|recharts|chartjs|d3|victory)/g

// Draggable elements
/draggable=["']true["']|data-testid=["'](?:kanban|drag|drop)/g
```

### Feature Priority for Demo

| Priority | Feature | Detection | Reliability | Est. Demo Time |
|----------|---------|-----------|-------------|----------------|
| 1 | Charts/Data Viz | Library imports | High | 8-12s |
| 2 | Tables (sortable) | `<th>` + onClick | High | 10-15s |
| 3 | Forms (CRUD) | `<form>` + submit | High | 12-18s |
| 4 | Drag-and-drop | draggable attr / DnD libs | High | 8-12s |
| 5 | Dark mode toggle | theme testid patterns | Medium | 5-8s |
| 6 | Navigation | nav testid patterns | High | 3-5s |
| 7 | Responsive design | Tailwind/media queries | Medium | 8-12s |

## Spec Generation Template

Generated specs follow this structure:

```typescript
import { test, type Page } from '@playwright/test';
import { pause, scenicPause, setViewport, smoothScroll } from './helpers';

// Caption overlay system (standard -- copy from template)
const CAPTION_CSS = [/* ... standard styles ... */].join(';');
async function showCaption(page: Page, text: string) { /* ... */ }
async function hideCaption(page: Page) { /* ... */ }
async function caption(page: Page, text: string, ms = 3000) { /* ... */ }

test('Demo - {Project Name}', async ({ page }) => {
  await setViewport(page, 1280, 800);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // SECTION: Welcome
  await caption(page, 'Welcome to {Project Name}.', 3500);

  // SECTION: {Feature 1}
  await showCaption(page, '{Feature 1 description}.');
  // ... interactions ...
  await hideCaption(page);

  // SECTION: {Feature N}
  // ... repeat per feature ...

  // OUTRO
  await caption(page, '{Project Name} -- {tech stack}. Thanks for watching.', 4500);
});
```

## Challenges and Mitigations

| Challenge | Severity | Mitigation |
|-----------|----------|-----------|
| No data-testid attributes | High | Fall back to role/text locators; suggest adding test IDs |
| Auth-gated pages | High | Prompt user for login steps or skip gated pages |
| Dynamic data | Medium | Use whatever data is present in dev mode |
| Complex SPA routing | Medium | Support React Router, Next.js, Vue Router patterns |
| Framework detection | Low | Check package.json dependencies |
| Ordering features | Medium | Use navigation order (sidebar/nav items) |

### Fallback Locator Strategy

When data-testid is not available:

1. `role` locators: `page.getByRole('button', { name: 'Submit' })`
2. `text` locators: `page.getByText('Submit')`
3. `aria-label`: `page.locator('[aria-label="Submit"]')`
4. CSS class patterns (least reliable): `page.locator('.btn-primary')`

## Output: Feature Inventory (JSON)

```json
{
  "framework": "react",
  "routes": ["/", "/projects", "/tasks"],
  "features": [
    { "category": "charts", "elements": ["dashboard-charts"], "demoTime": 8 },
    { "category": "table", "elements": ["projects-table"], "demoTime": 12 },
    { "category": "kanban", "elements": ["kanban-board"], "demoTime": 10 },
    { "category": "darkMode", "elements": ["theme-toggle"], "demoTime": 6 }
  ],
  "totalEstimatedTime": 36
}
```

## Validation Results (harness-v2-test)

Tested against the Project Management Dashboard (React + Vite + Tailwind CSS + Recharts):

### Auto-Discover Results
- **Framework:** React + Vite (detected correctly)
- **Routes:** 6 detected (/, /projects, /tasks, /team, /settings, /components)
- **Features:** 9 detected:
  - Data Visualization (Recharts charts with tooltips)
  - Stat Cards (4 interactive metric cards)
  - Sortable Data Table (search, sort, pagination)
  - Kanban Board (drag-and-drop task cards)
  - Dark Mode (theme toggle)
  - Forms & Input (task forms, invite modal)
  - Navigation (sidebar with 7 nav links)
  - Responsive Design (Tailwind breakpoints)
  - Settings & Preferences (profile, notifications, accent colors)
- **Estimated demo time:** ~83s

### Pipeline Compatibility
- **Caption extraction:** 20 captions extracted from auto-generated spec (vs 21 from manual spec)
- **Timestamps:** Monotonically increasing, 0-72s range
- **Playwright run:** PASSED (78s video, 5.8MB WebM)

### Guided Mode Validation
- `--focus kanban`: 1 feature matched, 21.6s test run -- PASS
- `--focus "dark mode"`: 1 feature matched -- PASS
- `--focus charts`: 1 feature matched -- PASS
- `--focus drag`: 1 feature matched (Kanban Board) -- PASS
- `--focus nonexistent`: Falls back to all features with warning -- PASS

### Comparison: Auto vs Manual Spec
| Metric | Manual (highlights-with-captions) | Auto-Generated |
|--------|-----------------------------------|---------------|
| Captions | 21 | 20 |
| Estimated duration | ~95s | ~83s |
| Actual video | 95.7s | 78s |
| Features covered | 6 sections | 9 sections |
| Kanban drag-and-drop | Yes | Yes |
| Chart tooltip hover | Yes | Yes |
| Column sorting | Yes | Yes |
| Project creation form | Yes (detailed) | No (generic forms section) |
| Search typing demo | Yes (natural typing) | No |

The auto-generated spec achieves ~80% quality of the hand-crafted manual spec,
covering more features but with less polish per section. The generated spec is
fully compatible with the extract-captions -> generate-voice -> merge-video -> add-music pipeline.
