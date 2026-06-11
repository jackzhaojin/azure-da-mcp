# Verification Specs — Full Code Examples

Complete code for the mandatory verification stages described in SKILL.md. Copy and adapt these into the target project.

## Stage 0, Step 1: Data Check Spec

Run this BEFORE writing any demo spec to confirm the app has demo-worthy content:

```typescript
// data-check.ts -- run this BEFORE writing any demo spec
import { test, expect } from '@playwright/test';

test('verify app has demo-worthy data', async ({ page }) => {
  // Start by checking the main content pages
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // Take inventory of what's actually on the page
  const screenshot = await page.screenshot({ path: 'data-check-home.png' });

  // Check for empty states -- these mean we need to seed data
  const emptyIndicators = [
    'No recipes found',
    'No items',
    'No results',
    'Nothing here yet',
    'Get started by',
    'Create your first',
  ];
  const bodyText = await page.locator('body').innerText();
  for (const indicator of emptyIndicators) {
    if (bodyText.includes(indicator)) {
      console.log(`WARNING: Found empty state indicator: "${indicator}"`);
      console.log('You MUST seed data before recording. Run the seed script.');
    }
  }

  // Count visible content items (cards, list items, articles)
  const contentSelectors = [
    'article', '.card', '[data-testid*="card"]',
    '[data-testid*="item"]', '[data-testid*="recipe"]',
    '.recipe-card', '.product-card', '.list-item'
  ];
  for (const selector of contentSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      console.log(`Found ${count} elements matching "${selector}"`);
    }
  }
});
```

## Stage 0, Step 2: Route Exploration Spec

Visit every route and catalog what's actually rendered before writing narration:

```typescript
// explore-routes.spec.ts -- discovery, not recording
import { test, expect } from '@playwright/test';

test('explore all routes', async ({ page }) => {
  const routes = ['/', '/recipes', '/search', '/login', '/register', '/favorites', '/profile'];
  const routeReport: Record<string, { status: string; elements: string[]; screenshot: string }> = {};

  for (const route of routes) {
    await page.goto(`http://localhost:3000${route}`);
    await page.waitForLoadState('networkidle');

    // Check for errors
    const hasError = await page.locator('body').innerText()
      .then(text => text.includes('Runtime Error') || text.includes('Application error'));

    // Catalog interactive elements
    const buttons = await page.locator('button').allInnerTexts();
    const links = await page.locator('a').allInnerTexts();
    const forms = await page.locator('form').count();
    const images = await page.locator('img').count();
    const cards = await page.locator('article, .card, [class*="card"]').count();

    const screenshotPath = `explore-${route.replace(/\//g, '_') || 'home'}.png`;
    await page.screenshot({ path: screenshotPath });

    routeReport[route] = {
      status: hasError ? 'ERROR' : 'OK',
      elements: [
        `${buttons.length} buttons: [${buttons.slice(0, 5).join(', ')}]`,
        `${links.length} links`,
        `${forms} forms`,
        `${images} images`,
        `${cards} cards/articles`,
      ],
      screenshot: screenshotPath,
    };
    console.log(`${route}: ${hasError ? 'ERROR' : 'OK'} | ${cards} cards, ${images} images, ${buttons.length} buttons`);
  }

  // Print summary
  console.log('\n=== ROUTE EXPLORATION SUMMARY ===');
  console.log(JSON.stringify(routeReport, null, 2));
});
```

**Use the exploration output to write the demo script.** Only narrate features that the exploration confirmed exist. If a route shows 0 cards, don't write narration about "browsing our collection."

## Stage 1: Pre-Recording Health Check

1. **Start the dev server and confirm it responds:**
   ```bash
   # Verify it returns 200, not an error page
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
   # Must return 200. If 500 or connection refused, fix the app first.
   ```

2. **Navigate to every route the demo will visit and take a screenshot:**
   ```typescript
   // Pre-flight route check -- run BEFORE the demo spec
   const routesToDemo = ['/', '/recipes', '/recipes/1', '/dashboard'];
   for (const route of routesToDemo) {
     await page.goto(`http://localhost:3000${route}`);
     await page.waitForLoadState('networkidle');
     await page.screenshot({ path: `preflight-${route.replace(/\//g, '_')}.png` });
   }
   ```

3. **Verify no error states on any route:**
   ```typescript
   await expect(page.locator('body')).not.toContainText('Runtime Error');
   await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
   await expect(page.locator('body')).not.toContainText('Application error');
   await expect(page.locator('body')).not.toContainText('Internal Server Error');
   await expect(page.locator('body')).not.toContainText('Module not found');
   // Check for Next.js error overlay specifically
   const errorOverlay = page.locator('nextjs-portal');
   await expect(errorOverlay).toHaveCount(0);
   ```

4. **If any route shows errors, FIX THE APP FIRST.** Do not proceed to recording. Common fixes:
   - Run database migrations / seed data
   - Install missing dependencies
   - Set required environment variables
   - Fix Next.js config (image domains, etc.)

## Stage 2: During-Recording Assertions

**After every `page.goto()` or navigation action, add:**
```typescript
// MANDATORY after every navigation
await expect(page.locator('body')).not.toContainText('Runtime Error');
await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
await expect(page.locator('body')).not.toContainText('Application error');
```

**Before narrating about visible content, assert it exists:**
```typescript
// BAD: narrate about recipes without checking they are visible
caption(page, 'Here are the recipes in our collection', 3000);

// GOOD: verify content is on screen BEFORE narrating about it
await expect(
  page.locator('[data-testid="recipe-card"], article, .recipe-card, .card').first()
).toBeVisible({ timeout: 10000 });
caption(page, 'Here are the recipes in our collection', 3000);
```

**NEVER use `.catch(() => {})` on demo-critical interactions:**
```typescript
// BAD: silently swallowing click failures means the demo records garbage
await page.click('[data-testid="add-recipe"]').catch(() => {});

// GOOD: if the click fails, the demo fails -- which is correct behavior
await page.click('[data-testid="add-recipe"]');
```

If an interaction is truly optional (e.g., dismissing a cookie banner that may or may not appear), use an explicit conditional instead:
```typescript
// Acceptable for genuinely optional elements
const cookieBanner = page.locator('[data-testid="cookie-dismiss"]');
if (await cookieBanner.isVisible({ timeout: 2000 }).catch(() => false)) {
  await cookieBanner.click();
}
```

## Stage 3: Post-Recording Validation

After recording completes, verify the output video is not blank or corrupted:

1. **Extract sample frames at 25%, 50%, 75% of the video duration:**
   ```bash
   # Get video duration
   DURATION=$(ffprobe -v error -show_entries format=duration \
     -of default=noprint_wrappers=1:nokey=1 demo-final.mp4)

   # Extract frames at 25%, 50%, 75%
   for pct in 25 50 75; do
     TIMESTAMP=$(echo "$DURATION * $pct / 100" | bc -l)
     ffmpeg -ss "$TIMESTAMP" -i demo-final.mp4 -frames:v 1 \
       "validation-frame-${pct}.png" -y
   done
   ```

2. **Verify frames are not blank (all white or all black):**
   ```bash
   # Check pixel variance -- blank frames have near-zero standard deviation
   for frame in validation-frame-*.png; do
     STDDEV=$(ffprobe -v error -select_streams v:0 \
       -show_entries frame_tags=lavfi.signalstats.YAVG \
       -f lavfi -i "movie=${frame},signalstats" \
       -of default=noprint_wrappers=1:nokey=1 2>/dev/null || echo "0")
     echo "$frame: stddev=$STDDEV"
     # If stddev < 5, the frame is likely blank
   done
   ```

3. **Verify video bitrate is reasonable (blank videos have extremely low bitrate):**
   ```bash
   BITRATE=$(ffprobe -v error -show_entries format=bit_rate \
     -of default=noprint_wrappers=1:nokey=1 demo-final.mp4)
   # Bitrate should be > 50000 (50 kb/s). Blank/error videos typically < 10000.
   echo "Video bitrate: $BITRATE bps"
   ```

4. **If any validation fails, do not deliver the video.** Report the failure with screenshots of the extracted frames so the issue is visible.

## Auto-Discover Mode: Additional Requirements

When generating specs via `auto-discover.mjs`, the generated spec MUST include:

- **Navigation assertions** after every `page.goto()` call (the three error text checks above)
- **Content visibility waits** before each caption that references on-screen content: `await page.waitForSelector('<selector>', { timeout: 10000 })` for key content elements
- **No try/catch suppression** around demo-critical interactions (clicks, form fills, navigation). If an interaction that the narration describes fails, the spec must fail loudly so the developer knows the demo is broken.
- **A pre-flight test block** at the start of the spec that visits all routes and asserts no errors before the recording begins
