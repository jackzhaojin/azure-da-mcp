# Adobe Summit 2026 Blog Generation - Execution Configuration

**Version**: 2026-01-10
**Design System**: Adobe Summit Blog Design System (Claude-optimized)
**Purpose**: Generate AI-powered blog content for Adobe Summit 2026

---

## 📁 Directory Contents

### Design System Files
- **`adobe-summit-blog-design-system.md`** (37KB)
  - Consolidated design system in Format 2 (single markdown file)
  - Contains: color tokens, typography, spacing, component specs
  - 16 block types with variants

- **`design-system-preview.jsx`** (35KB)
  - React preview component showing visual implementation
  - Interactive component gallery for reference

### Execution Files
- **`run-timestamped.sh`**
  - Main execution script
  - Auto-detects project root
  - Creates timestamped spec and output directories
  - Handles errors and retries

- **`run-adobe-summit-2026.md`**
  - Template spec file for manual execution
  - Shows complete spec structure

- **`adobe-summit-2026-execution.md`**
  - AI prompt template for content generation
  - Instructs Agent SDK to read design system first
  - Defines content requirements and structure

### Generated Files
- **`run-adobe-summit-2026-YYYY-MM-DD-HHMMSS.md`**
  - Timestamped spec files from each execution
  - Preserved for versioning and reproducibility

---

## 🚀 Quick Start

### Prerequisites

1. **Navigate to project root**:
   ```bash
   cd /Users/jackjin/dev/azure-da-mcp/agent-claude-sdk/blog-static-site-generator
   ```

2. **Verify environment**:
   ```bash
   # Check .env file exists with API key
   cat .env | grep ANTHROPIC_API_KEY

   # Install dependencies if needed
   npm install

   # Build TypeScript
   npm run build
   ```

3. **Azure login** (optional, for deployment):
   ```bash
   az login
   ```

### Run Generation

**Option 1: From project root**
```bash
./prompts/2026-01-10-claude-design/run-timestamped.sh
```

**Option 2: Run from anywhere**
```bash
/Users/jackjin/dev/azure-da-mcp/agent-claude-sdk/blog-static-site-generator/prompts/2026-01-10-claude-design/run-timestamped.sh
```

The script will:
1. Auto-detect project root
2. Verify package.json exists
3. Generate timestamp (YYYY-MM-DD-HHMMSS)
4. Create spec file with relative paths
5. Generate 10 AI-powered blog posts
6. Create landing page
7. Save to `output/YYYY-MM-DD-HHMMSS/`

---

## 📊 Output Structure

```
output/YYYY-MM-DD-HHMMSS/
├── index.html                    # Landing page with featured post + grid
├── posts/
│   ├── edge-delivery-services-future-web-experiences.html
│   ├── genai-transforms-digital-experience-adobe-summit.html
│   ├── dalive-reimagining-content-authoring.html
│   ├── personalization-scale-analytics-driven-approach.html
│   ├── developer-experience-renaissance-aem.html
│   ├── content-velocity-months-to-minutes.html
│   ├── marketing-innovation-whats-next-digital-experience.html
│   ├── customer-success-stories-adobe-summit-2026.html
│   ├── future-digital-experience-predictions-adobe-summit.html
│   └── adobe-summit-2026-key-takeaways-action-items.html
└── assets/
    └── css/
        └── styles.css            # Generated from design tokens
```

---

## ⚙️ Configuration

### Modify Topics

Edit `run-timestamped.sh` line 59-68 to change blog topics:

```markdown
topics:
  - Edge Delivery Services
  - GenAI in Digital Experience
  - Your Custom Topic Here
```

### Change Blog Count

Edit `run-timestamped.sh` line 57:
```markdown
count: 10  # Change to desired number
```

### Configure Deployment

Edit `run-timestamped.sh` line 78-79:
```markdown
storageAccount: dalivemcprg94e3
resourceGroup: YOUR_RESOURCE_GROUP_NAME
```

---

## 🎨 Design System

### Color Tokens
- **Primary**: Adobe Red (#ED2224)
- **Neutral**: Charcoal-based grays
- **Semantic**: Success, warning, danger, info

### Typography
- **Font Family**: Adobe Clean
- **Sizes**: xs (12px) → 6xl (60px)
- **Weights**: 400 (regular), 600 (semibold), 700 (bold)

### Spacing
- **Base Unit**: 8px
- **Scale**: xs (4px) → 6xl (96px)

### Available Blocks

| Block          | Purpose                 | Variants                            |
| -------------- | ----------------------- | ----------------------------------- |
| `prose`        | Body text               | -                                   |
| `blockquote`   | Pull quotes             | default, large, centered            |
| `image`        | Images with captions    | default, wide, full                 |
| `video`        | YouTube embeds          | default, wide, full                 |
| `code`         | Code snippets           | default, wide, no-line-numbers      |
| `callout`      | Tips, warnings, notes   | tip, note, warning, danger, success |
| `table`        | Data tables             | default, striped, wide              |
| `stats`        | Key metrics display     | dark, light, brand                  |
| `cta`          | Call-to-action banners  | brand, dark, light                  |
| `toc`          | Table of contents       | -                                   |
| `author-card`  | Author bio              | default, centered                   |

---

## 📈 Performance

**Typical Generation Time**: 4-5 minutes (271 seconds measured)

**Breakdown**:
- Spec parsing: <1s
- Design system loading: <1s
- CSS generation: <1s
- AI content generation: ~260s (depends on API latency)
- HTML generation: ~5s
- Landing page: ~2s
- Total: ~271s

---

## 🔄 Version History

### 2026-01-10-153018 (First Successful Run)
- ✅ 10 blog posts generated
- ✅ Landing page with featured post + grid
- ✅ CSS from design tokens
- ✅ All blocks rendering correctly
- ⏱️ Duration: 271.2 seconds

---

## 🐛 Troubleshooting

### Error: "package.json not found"
**Solution**: Script must run from project root. The script auto-detects this, but verify you're in the correct directory.

### Error: "Missing API key"
**Solution**: Create `.env` file in project root with:
```
ANTHROPIC_API_KEY=your_key_here
```

### Error: "Cannot find module"
**Solution**: Install dependencies:
```bash
npm install
npm run build
```

### Generation hangs or takes too long
**Possible causes**:
- API rate limiting
- Network issues
- Large content count (reduce to 5 for testing)

---

## 📝 Manual Execution

For more control, create a custom spec file:

```bash
cd /Users/jackjin/dev/azure-da-mcp/agent-claude-sdk/blog-static-site-generator
npm run generate prompts/2026-01-10-claude-design/your-custom-spec.md
```

---

## 🔗 Related Files

- **Main README**: `../../README.md` (project documentation)
- **Spec Documentation**: `../../ai-docs/agents/blog-static-site-generator/spec.md`
- **Prompt Log**: `../../ai-docs/agents/blog-static-site-generator/prompt-log.md`

---

## 📌 Notes

- All paths are relative to project root
- Timestamped spec files are preserved for versioning
- Output directories are timestamped to avoid conflicts
- Each run is completely independent and reproducible
- Design system files are versioned with execution config
