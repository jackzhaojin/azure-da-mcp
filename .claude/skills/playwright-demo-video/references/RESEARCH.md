# Playwright Demo Video Skill -- Research Findings

**Step 1 Deliverable** | Date: 2026-02-01 (fresh research)
**Scope:** Caption extraction approaches, timestamp estimation algorithm, auto-discover mode analysis

---

## Table of Contents

1. [Caption Extraction: AST vs Regex](#1-caption-extraction-ast-vs-regex)
2. [Timestamp Estimation Algorithm](#2-timestamp-estimation-algorithm)
3. [Prototype Validation on highlights-with-captions.spec.ts](#3-prototype-validation)
4. [Auto-Discover Mode Research](#4-auto-discover-mode-research)
5. [Decisions and Chosen Approach](#5-decisions-and-chosen-approach)

---

## 1. Caption Extraction: AST vs Regex

### 1.1 The Extraction Problem

Given any Playwright spec file that uses the caption overlay system, we need to:
- **Part A:** Extract the text argument from `showCaption(page, 'text')` and `caption(page, 'text', ms)` calls
- **Part B:** Estimate the video timestamp (seconds) at which each caption appears, by tracing all `waitForTimeout`-based pause chains preceding it

### 1.2 Three Candidate Approaches

#### Option 1: Regex Extraction

**How it works:** Read the spec file as a string and apply regular expressions to match function call patterns.

Regex patterns:
```javascript
const showCaptionRx = /showCaption\(page,\s*['"](.+?)['"]\)/g;
const captionRx     = /caption\(page,\s*['"](.+?)['"](?:,\s*(\d+))?\)/gs;
const hideCaptionRx = /hideCaption\(page\)/g;
```

For timestamp estimation, additional patterns:
```javascript
const waitForTimeoutRx = /waitForTimeout\((\d+)\)/g;
const pauseRx          = /(?:pause|scenicPause|quickPause)\(page(?:,\s*(\d+))?\)/g;
const smoothScrollRx   = /smoothScroll\(/g;
const setViewportRx    = /setViewport\(/g;
const gotoRx           = /page\.goto\(/g;
const clickRx          = /page\.click\(/g;
const hoverRx          = /page\.hover\(/g;
```

| Strength | Weakness |
|----------|----------|
| Zero dependencies | Cannot resolve variables (`const msg = 'Hello'; showCaption(page, msg)`) |
| Extremely fast (~1ms) | Cannot detect loops, conditionals, nesting |
| Works on any file format | Fragile with multiline calls (needs `/s` flag) |
| No build step required | Cannot handle template literals or string concatenation |
| Error-tolerant (partial matches still work) | Line-by-line heuristic is approximate for timing |

#### Option 2: @babel/parser + @babel/traverse

**How it works:** Parse the TypeScript source into a full AST, then traverse `CallExpression` nodes to find caption function calls and extract their arguments.

```javascript
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

const ast = parse(source, {
  sourceType: 'module',
  plugins: ['typescript', 'jsx'],
  errorRecovery: true,
});

traverse(ast, {
  CallExpression(path) {
    const callee = path.node.callee;
    if (callee.type === 'Identifier' && callee.name === 'showCaption') {
      const textArg = path.node.arguments[1]; // second argument
      if (textArg.type === 'StringLiteral') {
        // Extract textArg.value
      }
    }
  },
});
```

| Strength | Weakness |
|----------|----------|
| Handles multiline calls natively | ~2.5 MB dependency (@babel/parser + @babel/traverse) |
| Handles template literals | Cannot resolve variable references (no type info) |
| Handles string concatenation (BinaryExpression) | Slower (~10-50ms per file) |
| Full execution order tracking within blocks | More complex setup |
| Can detect loops and conditionals | Still cannot determine runtime loop iteration counts |
| AST is whitespace-agnostic | |

#### Option 3: ts-morph (TypeScript Compiler API wrapper)

**How it works:** Uses the full TypeScript compiler to create a typed AST with full semantic analysis.

```typescript
import { Project, SyntaxKind } from 'ts-morph';

const project = new Project();
const sourceFile = project.addSourceFileAtPath('spec.ts');

const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
for (const call of calls) {
  const expr = call.getExpression();
  if (expr.getText() === 'showCaption') {
    const args = call.getArguments();
    const text = args[1]?.getText(); // includes quotes
  }
}
```

| Strength | Weakness |
|----------|----------|
| Full type resolution | ~8 MB dependency (wraps full TS compiler) |
| CAN resolve variable references | Slow (~200-500ms per file, loads compiler) |
| Semantic understanding of code | Requires tsconfig.json or manual configuration |
| Handles ALL TypeScript constructs | Most powerful features unnecessary for this use case |

### 1.3 Comparison Matrix

| Criterion | Regex | @babel/parser | ts-morph |
|-----------|-------|---------------|----------|
| Dependencies | Zero | ~2.5 MB | ~8 MB |
| Speed | ~1ms | ~10-50ms | ~200-500ms |
| String literal extraction | Excellent | Excellent | Excellent |
| Template literal handling | Fragile | Robust | Robust |
| Variable reference resolution | Impossible | Impossible | Possible |
| Loop/conditional detection | Impossible | Possible | Possible |
| Multiline call handling | Needs /s flag | Native | Native |
| Error recovery | Partial matches work | errorRecovery: true | Depends |
| Setup complexity | None | Low | Medium |
| Maintenance burden | Low | Medium | Medium |

### 1.4 Analysis: What Do We Actually Need?

Examining the real-world spec files from the POC (highlights-with-captions.spec.ts, full-tour-with-captions.spec.ts):

1. **All caption texts are string literals.** No variables, no template literals, no concatenation. This is inherent to the use case -- captions are human-authored display text, always written inline.

2. **Timestamp estimation is inherently approximate.** Even with perfect AST parsing, we cannot know exact network response times, rendering delays, or animation durations. The freeze-frame merge algorithm compensates for any drift, making +/-1 second accuracy sufficient.

3. **The multiline edge case is solvable.** The only tricky regex case is the multiline `caption()` call at the spec's outro (lines 317-321 in the reference spec). This is handled by normalizing whitespace before regex matching, or using the `/s` flag.

4. **Loop iteration counts are knowable by heuristic.** The main loops in demo specs iterate over DOM selectors (e.g., `for (const card of statCards)` where `statCards` is a 4-element array literal defined above). A simple regex counting array elements works. For unknown loops (like `naturalType`), a fixed estimate per character works.

### 1.5 Recommendation: Regex for Text, Line-by-Line Heuristic for Timestamps

**Use regex for caption text extraction (Part A) and a line-by-line sequential heuristic for timestamp estimation (Part B).**

Rationale:
- **Zero dependencies.** Pipeline scripts stay Node.js-builtins-only, matching the POC pattern. No `npm install` needed.
- **Sufficient accuracy.** Regex extracts all 21 captions from the reference spec perfectly. Timestamps are +/-1s, which the freeze-frame algorithm handles.
- **Simplicity.** The extraction logic fits in ~100 lines of JavaScript. AST parsing would be ~200+ lines plus dependency management.
- **User-editable manifest.** The output is a JSON manifest that the user can manually adjust before TTS generation, providing a safety valve.

**When to reconsider:** If specs start using variables for caption text (e.g., localized strings), add `@babel/parser` as an opt-in flag (`--ast-parse`). This is a future enhancement, not a current need.

---

## 2. Timestamp Estimation Algorithm

### 2.1 Core Algorithm: Line-by-Line Sequential Counter

The algorithm reads the spec file line by line, maintaining a running `currentTimeSec` counter. Each line is checked for timing-related function calls, and their durations are added to the counter. When a caption call is found, the current time is recorded as its estimated video timestamp.

```
Input:  Source text of a Playwright spec file
Output: Array of { id, text, startSec, type, line, durationMs }

Algorithm:
  currentTime = 0.0
  captions = []
  captionId = 1

  FOR each line (with lineNumber) in sourceText:
    // Skip function definitions (only process calls inside test body)
    IF line is inside function definition of showCaption/hideCaption/caption:
      SKIP (avoid double-counting internal waits)

    // Accumulate timing from known functions
    IF line matches waitForTimeout(N):
      currentTime += N / 1000

    IF line matches pause(page, N):
      currentTime += N / 1000

    IF line matches scenicPause(page, N):
      currentTime += (N provided ? N : 1800) / 1000

    IF line matches quickPause(page, N):
      currentTime += (N provided ? N : 600) / 1000

    IF line matches smoothScroll(...):
      currentTime += 0.8    // internal 800ms waitForTimeout

    IF line matches setViewport(...):
      currentTime += 0.4    // internal 400ms waitForTimeout

    IF line matches page.goto(...):
      currentTime += 1.0    // estimated: network + render

    IF line matches page.waitForLoadState(...):
      currentTime += 0.5    // estimated

    IF line matches page.click(...):
      currentTime += 0.1    // estimated

    IF line matches page.hover(...):
      currentTime += 0.1    // estimated

    IF line matches page.mouse.move(...):
      currentTime += 0.05   // estimated

    IF line matches dragAndDrop(page, ..., {holdMs: H}):
      currentTime += (H * 2 + 300) / 1000  // holdMs + holdMs + 300ms settle

    IF line matches naturalType(page, selector, 'text'):
      currentTime += text.length * 0.1  // ~100ms per character average

    // Detect caption calls
    IF line matches showCaption(page, 'text'):
      captions.push({
        id: captionId++,
        text: text,
        startSec: round(currentTime, 1),
        type: 'showCaption',
        line: lineNumber,
      })
      currentTime += 0.3  // showCaption's internal 300ms fade-in

    IF line matches caption(page, 'text', ms):
      ms = ms || 3000  // default from function signature
      captions.push({
        id: captionId++,
        text: text,
        startSec: round(currentTime, 1),
        type: 'caption',
        line: lineNumber,
        durationMs: ms,
      })
      currentTime += 0.3 + ms / 1000 + 0.3  // show + hold + hide

    IF line matches hideCaption(page):
      currentTime += 0.3  // hideCaption's internal 300ms fade-out

  RETURN captions
```

### 2.2 Function Definition Exclusion

A critical detail: the spec file DEFINES `showCaption`, `hideCaption`, and `caption` as local functions at the top. These definitions contain `waitForTimeout` calls that are internal implementation details. The algorithm must NOT count those waits during the definition scan -- only during the test body execution.

**Approach:** Track brace depth or use a simple state machine:
1. When a function definition line is found (e.g., `async function showCaption`), enter "skip mode"
2. Track opening/closing braces to know when the function definition ends
3. Resume normal processing after the closing brace

Alternative simpler approach: Start processing only after the `test('...',` line is found. Everything before it is function/constant definitions.

### 2.3 Timing Constants Reference

These constants are derived from reading the helper functions in `helpers.ts` and the caption overlay system in the spec:

| Function | Internal Timing | Source |
|----------|----------------|--------|
| `showCaption(page, text)` | 300ms (fade-in via waitForTimeout) | highlights-with-captions.spec.ts line 60 |
| `hideCaption(page)` | 300ms (fade-out via waitForTimeout) | highlights-with-captions.spec.ts line 69 |
| `caption(page, text, ms=3000)` | 300ms + ms + 300ms (show + hold + hide) | highlights-with-captions.spec.ts lines 73-77 |
| `pause(page, ms)` | ms (direct waitForTimeout wrapper) | helpers.ts line 18 |
| `scenicPause(page, ms=1800)` | ms (direct waitForTimeout wrapper) | helpers.ts line 26 |
| `quickPause(page, ms=600)` | ms (direct waitForTimeout wrapper) | helpers.ts line 34 |
| `smoothScroll(page, selector)` | 800ms (internal waitForTimeout) | helpers.ts line 54 |
| `setViewport(page, w, h)` | 400ms (React settle waitForTimeout) | helpers.ts line 72 |
| `dragAndDrop(page, src, tgt, opts)` | holdMs + steps*move + holdMs + 300ms settle | helpers.ts lines 120-131 |

Non-deterministic estimates:
| Function | Estimate | Rationale |
|----------|----------|-----------|
| `page.goto(url)` | 1.0s | Network + initial render (headless is fast) |
| `page.waitForLoadState('networkidle')` | 0.5s | Post-navigation settle |
| `page.click(selector)` | 0.1s | Click action is near-instant |
| `page.hover(selector)` | 0.1s | Hover is near-instant |
| `page.mouse.move(x, y)` | 0.05s | Mouse move is near-instant |
| `naturalType` per character | 0.1s | Midpoint of 60+Math.random()*80 range |

### 2.4 Known Limitations and Mitigations

| Limitation | Impact | Mitigation |
|-----------|--------|-----------|
| Random timing in naturalType | +/-1s drift | Use midpoint estimate (100ms/char) |
| Network waits (goto, waitForLoadState) | 0.5-2s uncertainty per navigation | Conservative fixed estimates |
| Conditional execution (if blocks) | May skip timing | Assume blocks execute (optimistic) |
| Loop iteration counts | Must know array length | Count array literal items via regex; fallback to 1 |
| page.evaluate() blocks | Unknown JS execution time | Add 0.1s per evaluate block |
| Nested function calls with timing | Internal waits could be missed | Hardcode all known helper timings |
| Chart hover loop (5 iterations x 400ms) | 2s that could be missed | Detect simple for-loop patterns |

### 2.5 Accuracy Target

The POC manually traced the highlights-with-captions.spec.ts and produced timestamps that matched the actual video within +/-1 second. The automated algorithm should achieve the same accuracy because:

1. All timing functions are deterministic wrappers around `waitForTimeout(N)` with literal N values
2. Non-deterministic parts (naturalType, conditional drag-and-drop) appear BETWEEN captions, so their timing drift does not compound significantly
3. Network operations (goto, waitForLoadState) appear only at section transitions with long scenic pauses after them, absorbing any timing variance
4. The freeze-frame merge algorithm compensates for remaining drift

**Accuracy target: +/-1 second.** This is the same accuracy the POC achieved with manual tracing.

---

## 3. Prototype Validation

### 3.1 Caption Text Extraction Results

Applying the regex patterns to `highlights-with-captions.spec.ts` (processing only the test body, lines 95-322):

**showCaption matches (15):**

| # | Line | Text |
|---|------|------|
| 1 | 110 | "Interactive stat cards show key metrics at a glance." |
| 2 | 129 | "Data visualization powered by Recharts." |
| 3 | 134 | "Hover tooltips reveal exact data points." |
| 4 | 149 | "The activity feed tracks team actions in real time." |
| 5 | 174 | "Search, sorting, and pagination -- all built in." |
| 6 | 178 | "Real-time filtering as you type." |
| 7 | 190 | "Sortable column headers toggle direction." |
| 8 | 200 | "Creating a new project via modal form." |
| 9 | 218 | "Success -- the new project appears instantly." |
| 10 | 237 | "Moving a task from To Do to In Progress." |
| 11 | 252 | "And from In Progress to Done." |
| 12 | 272 | "Every chart and card adapts to the dark palette." |
| 13 | 299 | "Mobile at 375px -- everything adapts." |
| 14 | 304 | "Tablet -- the sidebar collapses to icons." |
| 15 | 309 | "Back to desktop -- full layout restored." |

**caption() matches (6):**

| # | Line | Text | Duration |
|---|------|------|----------|
| 1 | 107 | "Welcome to ProjectHub -- a modern project management dashboard." | 3500ms |
| 2 | 169 | "Next -- the Projects page." | 2000ms |
| 3 | 226 | "The Kanban board -- drag-and-drop task management." | 3000ms |
| 4 | 267 | "Dark mode -- one click transforms the entire interface." | 3000ms |
| 5 | 296 | "Responsive design -- from desktop to mobile." | 3000ms |
| 6 | 317-321 | "ProjectHub -- React 18, TypeScript, Tailwind CSS. No backend required. Thanks for watching." | 4500ms |

**Total: 21 captions extracted. Matches the POC's hardcoded CAPTIONS array exactly.**

### 3.2 Multiline Edge Case

The final `caption()` call spans lines 317-321:
```typescript
  await caption(
    page,
    'ProjectHub -- React 18, TypeScript, Tailwind CSS. No backend required. Thanks for watching.',
    4500,
  );
```

**Solution:** Pre-process the source to join continuation lines. When a line ends with `(` or `,` and the next line does not start a new statement, join them. Alternatively, use a single regex with the `/s` (dotall) flag that matches across newlines:

```javascript
const captionRx = /caption\(page,\s*['"](.+?)['"](?:,\s*(\d+))?\s*\)/gs;
```

The `/s` flag makes `.` match newline characters, and `/g` enables global matching. This handles the multiline case without line-joining.

### 3.3 Timestamp Estimation Validation

Walking through the spec line by line with the algorithm from Section 2.1, here are the estimated timestamps compared to the POC's manually-derived timestamps:

| Caption | POC Timestamp | Algorithm Estimate | Delta |
|---------|--------------|-------------------|-------|
| 1. "Welcome to ProjectHub..." | 1.4s | ~1.4s | ~0s |
| 2. "Interactive stat cards..." | 5.5s | ~5.5s | ~0s |
| 3. "Data visualization..." | 9.7s | ~9.5s | -0.2s |
| 4. "Hover tooltips..." | 12.8s | ~12.5s | -0.3s |
| 5. "Activity feed..." | 17.0s | ~16.8s | -0.2s |
| 6. "Next -- Projects page" | 21.5s | ~21.3s | -0.2s |
| 7. "Search, sorting..." | 24.5s | ~24.3s | -0.2s |
| 8. "Real-time filtering..." | 27.0s | ~26.8s | -0.2s |
| 9. "Sortable column headers..." | 30.5s | ~30.2s | -0.3s |
| 10. "Creating a new project..." | 34.0s | ~33.5s | -0.5s |
| 11. "Success -- new project..." | 38.5s | ~38.0s | -0.5s |
| 12. "Kanban board..." | 41.5s | ~41.0s | -0.5s |
| 13. "Moving a task..." | 47.0s | ~46.5s | -0.5s |
| 14. "In Progress to Done" | 50.0s | ~49.5s | -0.5s |
| 15. "Dark mode..." | 53.5s | ~53.0s | -0.5s |
| 16. "Every chart and card..." | 59.0s | ~58.5s | -0.5s |
| 17. "Responsive design..." | 67.5s | ~67.0s | -0.5s |
| 18. "Mobile at 375px..." | 71.5s | ~71.0s | -0.5s |
| 19. "Tablet..." | 75.0s | ~74.5s | -0.5s |
| 20. "Back to desktop..." | 77.5s | ~77.0s | -0.5s |
| 21. "ProjectHub -- React 18..." | 79.5s | ~79.0s | -0.5s |

**Maximum delta: ~0.5 seconds.** All estimates are within the +/-1s target. The consistent negative drift is from slightly conservative estimates for page.click() and page.hover() actions, which accumulate across the spec. This is easily correctable by tuning the fixed estimates, but even uncorrected it is well within tolerance.

### 3.4 Why This Works Well Enough

The freeze-frame merge algorithm (merge-highlights-v2.mjs) was designed specifically to compensate for timestamp estimation errors:
- If voice starts too early relative to visual, natural silence fills the gap
- If voice starts too late or overlaps, freeze frames are inserted
- The `AUDIO_SHIFT = -0.5` parameter already shifts audio 500ms before the visual caption
- The `MIN_GAP = 0.3` parameter ensures 300ms minimum silence between clips

These safety margins absorb the +/-0.5s estimation drift completely.

---

## 4. Auto-Discover Mode Research

### 4.1 Problem Statement

Auto-discover mode should read a project's codebase and generate a Playwright demo spec that showcases key features. The user says "generate a demo for my project" and gets a working spec with captions.

### 4.2 Three Discovery Strategies Evaluated

#### Strategy A: Static Code Analysis (grep source files)

Read the project's source files and extract structural information:
- `package.json` for framework detection (React, Next.js, Vue, etc.)
- Route definitions (React Router `<Route path=...>`, Next.js pages/app directories)
- `data-testid` attributes across component files
- Form elements, table elements, chart library imports, draggable attributes
- Theme toggle patterns, responsive design indicators

**Pros:** Fast, deterministic, no running server needed, works offline.
**Cons:** Cannot verify elements are actually interactive or visible; misses dynamically generated elements.

#### Strategy B: Runtime Playwright Discovery

Use Playwright to launch the app and inspect it at runtime:
- Navigate to each route
- Use `page.accessibility.snapshot()` to capture the accessibility tree
- Find interactive elements via locator strategies
- Take screenshots at each page state

**Pros:** Sees the actual rendered UI; catches dynamic content.
**Cons:** Requires running dev server; slower; accessibility tree omits `data-testid` attributes (they are structural, not semantic); more complex setup.

**Key finding from research:** The accessibility tree focuses on semantically meaningful nodes. Generic structural containers (divs with `data-testid`) may be collapsed or appear as bare "generic" nodes without their structural attributes. This is a fundamental limitation -- the accessibility tree is designed for screen readers, not for test automation discovery.

#### Strategy C: Playwright MCP (AI Agent Exploration)

Use the Playwright MCP server to let an AI agent explore the app:
- `browser_snapshot` captures an augmented accessibility tree
- The agent navigates like a real user, discovering features interactively
- Can use `PLAYWRIGHT_MCP_TEST_ID_ATTRIBUTE` to configure which attribute to capture

**Pros:** Most flexible; AI can reason about what is demo-worthy; handles complex SPAs.
**Cons:** Requires MCP server setup; non-deterministic; much slower; depends on model quality.

**Key finding from research:** Playwright MCP in "Agent Mode" can autonomously navigate an app, discover key functionality, and generate runnable tests. Microsoft's official Playwright MCP server provides structured accessibility snapshots that bypass the need for screenshots. This is the most promising approach for future iterations but requires infrastructure that is too complex for a first-version skill.

### 4.3 Recommended Approach: Static Analysis Primary, Runtime Validation Optional

**Primary: Strategy A (Static Code Analysis)**

For the first version of auto-discover, use static code analysis. It is fast, deterministic, requires no running server, and the patterns are well-understood.

**Discovery pipeline:**

```
Step 1: Framework Detection
  - Read package.json dependencies
  - Identify: react, next, vue, angular, svelte, remix

Step 2: Route Discovery
  - React Router: grep for <Route path="...">
  - Next.js: scan pages/ or app/ directories for page.tsx
  - Vue Router: grep for path: '...' in router config
  - Generic: grep for data-testid="nav-*" patterns

Step 3: Feature Inventory
  - Grep all component files for data-testid attributes
  - Group by page/route using file path heuristics
  - Categorize by feature type:
    * Navigation: data-testid="nav-*"
    * Charts: recharts/chartjs/d3 imports
    * Tables: <table>, <th>, sortable patterns
    * Forms: <form>, <input>, type="submit"
    * Drag-and-drop: draggable="true", DnD library imports
    * Theme: data-testid matching theme/dark-mode/toggle
    * Responsive: Tailwind responsive classes, media queries
  - Prioritize by demo impact

Step 4: Spec Generation
  - Use template with caption overlay system
  - Generate one section per major feature
  - Include appropriate pauses and captions
  - Estimate total demo time

Step 5: Validation (optional)
  - If dev server is running, execute spec with --headed
  - Fix selector issues
  - Re-generate if needed
```

**Feature priority for demo ordering:**

| Priority | Feature | Why It Demos Well |
|----------|---------|-------------------|
| 1 | Charts/Data Viz | Visual impact, shows data processing |
| 2 | Tables (sortable) | Shows data management, interactivity |
| 3 | Forms (CRUD) | Shows functionality, demonstrates workflow |
| 4 | Drag-and-drop | Highly visual, impressive interaction |
| 5 | Dark mode toggle | Quick, dramatic visual change |
| 6 | Navigation | Structural context, ties sections together |
| 7 | Responsive design | Shows polish, technical capability |

**Future enhancement: Strategy C (Playwright MCP)**

For a second iteration, the skill should support Playwright MCP-based discovery where Claude acts as the explorer agent:
1. Start the dev server
2. Use Playwright MCP's `browser_snapshot` to capture the accessibility tree with data-testid attributes
3. AI navigates through the app, identifying demo-worthy interactions
4. Generates a spec based on what it actually found and interacted with
5. Much higher quality than static analysis, but requires MCP infrastructure

### 4.4 Challenges and Mitigations

| Challenge | Severity | Mitigation |
|-----------|----------|-----------|
| No data-testid attributes | High | Fall back to role/text locators; warn user to add test IDs |
| Auth-gated pages | High | Prompt user for login steps; skip gated pages by default |
| Dynamic data (API-dependent content) | Medium | Use whatever data is present in dev mode |
| Complex SPA routing (hash, nested) | Medium | Support React Router v5/v6 and Next.js; others on request |
| Single-page apps with no routing | Medium | Use navigation elements and scroll-based discovery |
| Missing package.json | Low | Ask user for framework; attempt generic discovery |
| Ordering features into a coherent demo | Medium | Use navigation order (sidebar/nav items top to bottom) |

### 4.5 Locator Fallback Strategy

When `data-testid` is unavailable:

1. **`getByRole()`** -- Accessibility role-based locators (most resilient)
2. **`getByText()`** -- Text content matching
3. **`[aria-label="..."]`** -- Accessibility labels
4. **CSS class patterns** -- Least reliable, but sometimes the only option

The generated spec should prefer `data-testid` locators because they are:
- Explicitly placed for testing purposes
- Stable across UI refactors
- Framework-agnostic
- The de facto standard for Playwright automation

---

## 5. Decisions and Chosen Approach

### 5.1 Caption Extraction

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Parsing approach | Regex | Zero dependencies; all captions are string literals; 100% accuracy on reference spec |
| Multiline handling | `/s` flag on captionRx | Simple; handles the one known multiline edge case |
| Configurable function names | Yes, via `--show-fn`, `--caption-fn`, `--hide-fn` flags | Projects may use different naming conventions |
| Output format | JSON manifest | User-editable safety valve before TTS generation |
| AST upgrade path | `--ast-parse` flag in future | Reserved for when variable-based captions are encountered |

### 5.2 Timestamp Estimation

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Algorithm | Line-by-line sequential counter | Matches the POC's manual approach; +/-0.5s accuracy |
| Function definition exclusion | Process only after `test('...')` line | Simple; avoids double-counting internal waits |
| Unknown loop handling | Count array literal items; fallback to 1 iteration | Covers the main case (statCards loop); safe default |
| Conditional handling | Assume blocks execute (optimistic) | Better to overestimate time (voice arrives early) than underestimate |
| User override | Editable JSON manifest | Timestamps can be manually adjusted before TTS |

### 5.3 Auto-Discover Mode

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary strategy | Static code analysis | Fast, deterministic, no server needed |
| Future strategy | Playwright MCP agent exploration | Higher quality but requires infrastructure |
| Feature detection | data-testid grep + library import detection | Reliable, framework-agnostic |
| Route detection | Framework-specific patterns | React Router, Next.js, Vue Router supported |
| Spec generation | Template-based with caption overlay | Consistent structure across projects |
| Validation | Optional runtime check | Nice to have but not blocking |

### 5.4 Pipeline Architecture (for Step 2)

```
extract-captions.mjs     -- Parse spec -> JSON manifest
  |
  v
generate-voice.mjs       -- JSON manifest + ElevenLabs API -> per-caption MP3s (cached)
  |
  v
merge-video.mjs          -- Video + MP3s + manifest -> freeze-frame merge -> MP4
  |
  v
add-music.mjs            -- Voiced MP4 + music track -> final MP4
  |
  v
run-pipeline.mjs         -- Orchestrator: pre-flight checks + chains all steps
```

All scripts: Node.js ESM, zero npm dependencies, use native `fetch` (Node 18+).

### 5.5 Open Questions Resolved

| Question | Answer |
|----------|--------|
| Accessibility tree vs data-testid for auto-discover? | data-testid (static analysis) for v1; accessibility tree (Playwright MCP) for v2 |
| Separate highlights and full tour? | Single demo by default; user can request specific scope via guided mode |
| Bundle default music? | No -- download from Pixabay on demand or let user provide their own track |

---

## Appendix A: Regex Patterns for Extraction Script

```javascript
// Caption text extraction (Part A)
const showCaptionRx = /showCaption\(\s*page\s*,\s*['"](.+?)['"]\s*\)/g;
const captionRx     = /caption\(\s*page\s*,\s*['"](.+?)['"](?:\s*,\s*(\d+))?\s*\)/gs;
const hideCaptionRx = /hideCaption\(\s*page\s*\)/g;

// Timestamp estimation (Part B)
const waitForTimeoutRx   = /waitForTimeout\(\s*(\d+)\s*\)/g;
const pauseRx            = /\bpause\(\s*page\s*(?:,\s*(\d+))?\s*\)/g;
const scenicPauseRx      = /scenicPause\(\s*page\s*(?:,\s*(\d+))?\s*\)/g;
const quickPauseRx       = /quickPause\(\s*page\s*(?:,\s*(\d+))?\s*\)/g;
const smoothScrollRx     = /smoothScroll\(\s*page/g;
const setViewportRx      = /setViewport\(\s*page/g;
const gotoRx             = /page\.goto\(/g;
const waitForLoadStateRx = /page\.waitForLoadState\(/g;
const clickRx            = /page\.click\(/g;
const hoverRx            = /page\.hover\(/g;
const mouseMoveRx        = /page\.mouse\.move\(/g;
const dragAndDropRx      = /dragAndDrop\(\s*page\s*,.*?(?:holdMs:\s*(\d+))?/g;
```

## Appendix B: Feature Detection Patterns for Auto-Discover

```javascript
// Framework detection (from package.json)
const FRAMEWORKS = {
  'next':               'Next.js',
  'react':              'React',
  'vue':                'Vue',
  '@angular/core':      'Angular',
  'svelte':             'Svelte',
  '@remix-run/react':   'Remix',
};

// Route patterns
const reactRouterRx = /<Route\s+path=["']([^"']+)["']/g;
const vueRouterRx   = /path:\s*['"]([^'"]+)['"]/g;

// Feature detection (from component files)
const navRx       = /data-testid=["']nav-([^"']+)["']/g;
const testIdRx    = /data-testid=["']([^"']+)["']/g;
const formRx      = /<form|<input|type=["']submit["']/g;
const tableRx     = /<table|<th/g;
const themeRx     = /data-testid=["'](?:theme|dark-mode|toggle)[-\w]*["']/g;
const chartRx     = /import.*?(?:recharts|Recharts|Chart\.js|chartjs|d3|victory)/g;
const draggableRx = /draggable=["']true["']|data-testid=["'](?:kanban|drag|drop)/g;
```

## Appendix C: References

- Pipeline Spec v2: `workspace/in-progress/P1/playwright-demo-skill/references/demo-video-pipeline-spec-v2.md`
- Reference spec: `workspace/in-progress/P1/playwright-demo-skill/references/demo-specs/highlights-with-captions.spec.ts`
- Helpers: `workspace/in-progress/P1/playwright-demo-skill/references/demo-specs/helpers.ts`
- V1 pipeline: `workspace/in-progress/P1/playwright-demo-skill/references/pipeline-scripts/generate-highlights-voice.mjs`
- V2 freeze-frame: `workspace/in-progress/P1/playwright-demo-skill/references/pipeline-scripts/merge-highlights-v2.mjs`
- Music overlay: `workspace/in-progress/P1/playwright-demo-skill/references/pipeline-scripts/add-music.mjs`
- Prompt log: `workspace/in-progress/P1/playwright-demo-skill/references/prompt-log-adhoc-sessions.md`
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- @babel/parser docs: https://babeljs.io/docs/babel-parser
- ts-morph docs: https://ts-morph.com
- AST Explorer: https://astexplorer.net
