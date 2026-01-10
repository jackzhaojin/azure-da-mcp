# Input Directory

This directory contains all input files and configurations for the blog PDF generator.

**IMPORTANT**: All inputs should be organized in **dated folders** (YYYY-MM-DD-<project-name>).

## Structure

```
input/
├── 2026-01-10-adobe-summit/  # Dated input folder (current pattern)
│   ├── adobe-summit-2026-config.json     # Main config for spec generation
│   ├── adobe-summit-2026-pdf-execution.md # Execution guide
│   ├── run-timestamped.sh                 # Helper script
│   └── README.md                          # Detailed documentation
├── 2026-01-11-my-project/    # Example: New dated input folder
├── archive/                  # Older non-dated examples (deprecated pattern)
│   ├── sample-blog.json
│   └── sample-blog-phase2.json
└── README.md
```

## Usage

### Phase 1-2: Single PDF Generation

**Current Pattern**: Use dated folders for specs:

```bash
# Use specs from dated folder
npm run dev:deterministic input/2026-01-10-adobe-summit/my-spec.json
```

**Legacy Examples** (archive - deprecated pattern):

```bash
# These still work but use old non-dated pattern
npm run dev:deterministic input/archive/sample-blog.json
npm run dev:deterministic input/archive/sample-blog-phase2.json
npm run dev:compare input/archive/sample-blog-phase2.json
```

### Phase 3: Spec Generation

Use config files to generate multiple specs:

```bash
# Use Adobe Summit config
npm run generate:specs input/2026-01-10-adobe-summit/adobe-summit-2026-config.json

# Or use the helper script
cd input/2026-01-10-adobe-summit
./run-timestamped.sh
```

### Phase 4: Bulk PDF Generation

After Phase 3, generate PDFs from specs:

```bash
# Generate PDFs from generated specs
npm run generate:bulk output/specs

# Deploy to Azure
npm run generate:bulk output/specs --deploy
```

## File Types

### Blog Spec Files (`*.json`)

Individual blog specifications for Phase 1-2:
- `sample-blog.json` - Basic template example
- `sample-blog-phase2.json` - Featured template with media

### Config Files (`config-*/`)

Configuration for Phase 3 spec generation:
- Define theme, topics, media settings
- Control template distribution
- Set output directory and naming patterns

## Creating New Inputs

### New Blog Spec (Dated Pattern)

Create a dated folder and add your spec:

```bash
# Create dated folder
mkdir -p input/2026-01-11-my-project

# Copy template from archive
cp input/archive/sample-blog-phase2.json input/2026-01-11-my-project/my-blog.json

# Edit with your content, images, YouTube videos
nano input/2026-01-11-my-project/my-blog.json

# Generate PDF
npm run dev:deterministic input/2026-01-11-my-project/my-blog.json
```

### New Config for Bulk Generation

Copy the Adobe Summit config:

```bash
cp -r input/2026-01-10-adobe-summit input/2026-01-11-my-project
# Edit adobe-summit-2026-config.json with your theme/topics
npm run generate:specs input/2026-01-11-my-project/*.json
```

## Important Notes

- **AgentSDK prompts stay in prompts/**: Only input data goes here
- **Configs drive Phase 3**: Spec generation configs belong in `input/YYYY-MM-DD-*/`
- **Specs are intermediate**: Generated in `output/specs/`, consumed by Phase 4
- **Keep examples clean**: Sample files should be production-ready references
