# Input Directory

This directory contains all input files and configurations for the blog static site generator.

**IMPORTANT**: All inputs should be organized in **dated folders** (YYYY-MM-DD-<project-name>).

## Structure

```
input/
├── 2026-01-10-adobe-summit/  # Dated input folder (current pattern)
│   ├── adobe-summit-blog-design-system.md  # Main design system file
│   ├── adobe-summit-2026-execution.md      # Execution guide
│   ├── run-timestamped.sh                  # Helper script for timestamped runs
│   └── README.md                           # Detailed documentation
├── 2026-01-11-my-project/    # Example: New dated input folder
├── archive/                  # Older non-dated examples (deprecated pattern)
│   ├── design-system/
│   ├── spec.md, spec.json, spec-da-live.json
│   └── test-spec.json
└── README.md
```

## Usage

### Current Pattern: Dated Input Folders

All new inputs should use dated folders:

```bash
# Use the Adobe Summit 2026 example (dated folder)
npm run generate input/2026-01-10-adobe-summit/spec.json

# Create your own dated folder
mkdir input/2026-01-11-my-project
# ... add your design system and specs
npm run generate input/2026-01-11-my-project/spec.md
```

### Legacy Examples (Archive)

Older non-dated examples are in `archive/` for reference only:

```bash
# These still work but use deprecated pattern (no date prefix)
npm run generate input/archive/spec.md
npm run generate input/archive/spec.json
```

### Using Adobe Summit Design System

The `2026-01-10-adobe-summit/` directory contains a complete working example:

```bash
# 1. Review the design system
cat input/2026-01-10-adobe-summit/adobe-summit-blog-design-system.md

# 2. Use the execution guide
cat input/2026-01-10-adobe-summit/adobe-summit-2026-execution.md

# 3. Run with timestamped output (helper script)
cd input/2026-01-10-adobe-summit
./run-timestamped.sh
```

## Creating New Inputs

### Spec Files

Create new spec files in this directory following the examples. Each spec should include:

- **Design System**: Path to consolidated or token-based design system
- **Content**: Count, theme, topics for AI generation
- **Output**: Timestamped directory path
- **Deployment** (optional): Azure storage account and resource group

### Design Systems

Place design system files in dated subdirectories:
- `design-system/` for generic design systems
- `YYYY-MM-DD-<project>/` for dated project-specific design systems

## Important Notes

- **Always use timestamped output directories**: `./output/YYYY-MM-DD-HHMMSS`
- **Keep design systems versioned**: Use dated subdirectories for major changes
- **AgentSDK prompts stay in prompts/**: Only input data goes here
