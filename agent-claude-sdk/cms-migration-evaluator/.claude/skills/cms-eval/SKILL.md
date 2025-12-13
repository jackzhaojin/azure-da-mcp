---
name: cms-eval
description: "Evaluate CMS migration quality by comparing PDFs, specs, or source webpages against migrated pages. Use when: (1) Comparing PDF design to migrated webpage, (2) Validating migration quality for SEO/accessibility/content, (3) Analyzing migration differences, (4) Generating migration quality reports with scores and findings. Supports PDF→webpage, spec→webpage, and source→migrated comparisons."
---

# CMS Migration Evaluation Skill

Comprehensive quality evaluation for CMS migrations across 5 dimensions: SEO, Accessibility, Visual Fidelity, Content Quality, and Intent Alignment.

## Overview

This skill evaluates migration quality by comparing expected content (PDFs, JSON specs, original webpages) against actual migrated webpages using:
- **Playwright MCP** for webpage testing
- **PDF analysis** (Read tool + pdf-parse)
- **Automated checks** (metadata, structure, content)
- **AI reasoning** (intent, tone, visual quality)

## When to Use This Skill

Invoke this skill when:
- Comparing a PDF design to its migrated webpage
- Validating migration quality against specifications
- Analyzing differences between source and migrated pages
- Generating quality reports with actionable findings
- Assessing SEO, accessibility, or content fidelity

## Evaluation Dimensions

Each evaluation produces scores (0-100) across 5 dimensions:

### 1. SEO (25% weight)
- Meta tags (title, description, Open Graph)
- Heading structure (H1→H2→H3 hierarchy)
- Content readability
- URL structure
- Internal linking

### 2. Accessibility (25% weight)
- WCAG 2.2 AA compliance
- Alt text on images
- Color contrast (≥4.5:1)
- Heading hierarchy
- Keyboard navigation

### 3. Visual Fidelity (20% weight)
- Layout preservation
- Typography consistency
- Spacing and alignment
- Missing/extra elements

### 4. Content Quality (20% weight)
- Data integrity (no loss)
- Structure preservation (headings, lists, sections)
- Completeness

### 5. Intent Alignment (10% weight)
- Messaging consistency (AI reasoning)
- Tone matching (AI reasoning)
- Purpose clarity (AI reasoning)

## Input Formats

### Phase 1: PDF → Webpage Comparison

```json
{
  "pdfPath": "input/pdfs/blog-post.pdf",
  "migratedUrl": "https://site.com/migrated/blog-post"
}
```

### Future Phases

**Spec → Webpage** (Phase 4):
```json
{
  "specPath": "input/specs/page-spec.json",
  "migratedUrl": "https://site.com/migrated/page"
}
```

**Source → Migrated** (Phase 5):
```json
{
  "sourceUrl": "https://old-site.com/page",
  "migratedUrl": "https://new-site.com/page"
}
```

## Workflow

### Phase 1: PDF → Webpage Evaluation

1. **Read PDF (Expected)**
   - Use Read tool to analyze PDF visually (Claude multimodal)
   - Extract text with pdf-parse for metadata/content
   - Identify: headings, content structure, images, key messages

2. **Capture Migrated Webpage (Actual)**
   - Navigate with Playwright: `browser_navigate(url)`
   - Wait for load: `browser_wait_for(time=3000)`
   - Capture snapshot: `browser_snapshot()` (accessibility tree)
   - Take screenshot: `browser_take_screenshot()`
   - Extract: HTML meta tags, headings, content, images

3. **Automated Comparison**
   - SEO: Compare PDF headings vs webpage headings
   - Content: Check text completeness (PDF → webpage)
   - Accessibility: Check alt text presence, heading hierarchy
   - Structure: Verify section order, element presence

4. **AI Reasoning**
   - Visual fidelity: Compare PDF design to webpage screenshot
   - Intent alignment: Assess messaging/tone consistency
   - Look and feel: Evaluate design quality match
   - User experience: Readability, navigation quality

5. **Generate Report**
   - Calculate scores per dimension (0-100)
   - Compute overall weighted score
   - List findings with severity (critical/high/medium/low)
   - Provide actionable recommendations
   - Include AI reasoning for subjective assessments

## Output Format

```json
{
  "summary": {
    "overallScore": 78,
    "seoScore": 85,
    "accessibilityScore": 72,
    "visualFidelityScore": 80,
    "contentQualityScore": 90,
    "intentAlignmentScore": 65,
    "grade": "good"
  },
  "findings": [
    {
      "dimension": "Accessibility",
      "severity": "high",
      "issue": "3 images missing alt text",
      "recommendation": "Add descriptive alt text to all images",
      "location": "Main content section"
    },
    {
      "dimension": "Intent",
      "severity": "low",
      "issue": "Tone slightly more formal than original",
      "recommendation": "Consider adjusting language to match original conversational style",
      "reasoning": "AI detected shift from casual 'you' language to passive voice in migration"
    }
  ],
  "recommendations": [
    "Add missing alt text to 3 images for WCAG AA compliance",
    "Adjust tone in introduction to match original conversational style",
    "Verify meta description is under 160 characters"
  ],
  "metadata": {
    "evaluatedAt": "2025-12-13T20:15:00Z",
    "evaluator": "cms-migration-evaluator-v1.0",
    "source": "input/pdfs/blog-post.pdf",
    "migratedUrl": "https://site.com/migrated/blog-post",
    "evaluationDuration": 45000
  }
}
```

## Scoring System

**Overall Score** (weighted average):
```
overallScore =
  (seoScore × 0.25) +
  (accessibilityScore × 0.25) +
  (visualFidelityScore × 0.20) +
  (contentQualityScore × 0.20) +
  (intentAlignmentScore × 0.10)
```

**Grade Thresholds**:
- **excellent** (90-100): Migration exceeds original quality
- **good** (75-89): Migration matches original, minor improvements possible
- **acceptable** (60-74): Migration functional, some issues to address
- **needs-improvement** (40-59): Significant issues, rework recommended
- **critical** (0-39): Major failures, not production-ready

## Tools Available

Use these tools during evaluation:

### Playwright MCP Tools
- `browser_navigate(url)` - Load webpage
- `browser_wait_for(time=3000)` - Wait for page load
- `browser_snapshot()` - Capture accessibility tree (best for analysis)
- `browser_take_screenshot()` - Visual proof for reports
- `browser_console_messages()` - Check for JavaScript errors
- `browser_network_requests()` - Validate asset loading

### File Operations
- `Read` - Read PDF files (Claude multimodal support)
- `Write` - Save JSON reports
- `Bash` - Run external tools (Lighthouse, aXe in future phases)

### PDF Analysis
For text extraction, use pdf-parse in Python/Node.js:
```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

## Configuration

Read evaluation criteria from `config/evaluation-criteria.json`:

```json
{
  "weights": {
    "seo": 0.25,
    "accessibility": 0.25,
    "visualFidelity": 0.20,
    "contentQuality": 0.20,
    "intentAlignment": 0.10
  },
  "thresholds": {
    "excellent": 90,
    "good": 75,
    "acceptable": 60,
    "needsImprovement": 40
  },
  "wcagLevel": "AA",
  "minContrast": 4.5
}
```

## Best Practices

### PDF Analysis
- Use Read tool for visual analysis (Claude can read PDFs multimodally)
- Extract text for automated checks
- Identify key visual elements and messaging

### Webpage Testing
- Always wait for page load before capturing
- Use `browser_snapshot()` for content analysis (not just screenshots)
- Take screenshots for visual comparison
- Check console for JavaScript errors

### Automated Checks
- Compare heading hierarchies (H1→H2→H3)
- Verify all images have alt text
- Check meta tags (title, description)
- Validate content completeness

### AI Reasoning
- Assess intent alignment (messaging, tone, purpose)
- Evaluate visual fidelity (layout, typography, spacing)
- Provide specific reasoning for subjective scores
- Include evidence (quotes, visual observations)

### Report Generation
- Prioritize findings by severity (critical first)
- Provide actionable recommendations
- Include AI reasoning for subjective assessments
- Save to `output/reports/{id}-report.json`

## Error Handling

- **PDF read fails**: Fallback to visual-only analysis with Claude multimodal
- **Webpage timeout**: Increase wait time or report navigation error
- **Playwright errors**: Check URL accessibility, retry with longer timeout
- **Missing elements**: Note in findings with "missing content" severity

## Success Criteria

Phase 1 evaluation is successful when:
- ✅ PDF analyzed (text + visual)
- ✅ Webpage captured (snapshot + screenshot)
- ✅ All 5 dimensions scored (0-100)
- ✅ Findings listed with severity + recommendations
- ✅ AI reasoning provided for subjective scores
- ✅ JSON report generated and saved
- ✅ Evaluation completes in < 60 seconds

## Example Usage

When user provides:
```json
{
  "pdfPath": "input/pdfs/ai-powered-package-tracking-2025.pdf",
  "migratedUrl": "https://main--da-live-postal-2025-07--jackzhaojin.aem.page/migration-batch-2025-12-13/ai-powered-package-tracking"
}
```

Execute workflow:
1. Read PDF and extract content/structure
2. Navigate to migrated URL with Playwright
3. Compare PDF vs webpage across 5 dimensions
4. Generate scored report with findings
5. Save to `output/reports/ai-powered-package-tracking-2025-report.json`

## Phase Progression

- **Phase 1** (Current): PDF → Webpage comparison
- **Phase 2** (Future): AI-generated dashboards from reports
- **Phase 3** (Future): Enhanced visual regression + deep accessibility
- **Phase 4** (Future): JSON spec → Webpage validation
- **Phase 5** (Future): Source webpage → Migrated webpage comparison
