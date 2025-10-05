# Prompt Management

This directory contains versioned LLM prompts following industry best practices for prompt engineering and versioning.

## Structure

```
prompts/
├── CHANGELOG.md          # Track all prompt changes
├── README.md             # This file
└── {prompt-name}/        # One directory per prompt family
    ├── v1.0.0.json       # Versioned prompt files
    ├── v1.1.0.json
    └── latest.json       # Symlink to current version (optional)
```

## Versioning Strategy

We use **Semantic Versioning** (X.Y.Z) for all prompts:

- **MAJOR (X)**: Breaking changes (incompatible output format, removed functionality)
- **MINOR (Y)**: Backward-compatible additions (new guidelines, enhanced instructions)
- **PATCH (Z)**: Backward-compatible fixes (typos, clarifications)

## Prompt File Format

Each prompt version is stored as JSON with metadata:

```json
{
  "version": "1.0.0",
  "name": "prompt-name",
  "description": "What this prompt does",
  "created": "2025-10-05",
  "author": "Team Name",
  "model": "claude-sonnet-4-20250514",
  "changelog": "What changed in this version",
  "prompts": {
    "system": "System instructions...",
    "guidelines": "Editing guidelines...",
    "context_template": "Template with {{variables}}"
  },
  "parameters": {
    "temperature": 0.7,
    "max_tokens": 4096,
    "top_p": 1.0
  }
}
```

## Best Practices

1. **Never edit prompts directly in code** - Always update JSON files
2. **Document all changes in CHANGELOG.md** - Explain what changed and why
3. **Test before bumping versions** - Run E2E tests with new prompts
4. **Use descriptive commit messages** - e.g., "feat(prompts): add HTML formatting rules to edit-content v1.1.0"
5. **Version control everything** - Git tracks prompt evolution
6. **A/B test major changes** - Compare outputs before deploying

## Loading Prompts

```javascript
import { loadPrompt } from './modules/PromptLoader.js';

// Load latest version
const prompt = await loadPrompt('edit-content');

// Load specific version
const promptV1 = await loadPrompt('edit-content', '1.0.0');
```

## Rollback Process

If a prompt version causes issues:

1. Identify the last working version from CHANGELOG.md
2. Update code to reference that version explicitly
3. Investigate and fix the problematic version
4. Create a new patch version with fixes

## Tools & Monitoring

- **Version Control**: Git for tracking changes
- **Testing**: E2E tests verify prompt behavior with real APIs
- **Rollback**: Explicit version loading allows instant rollback
- **Documentation**: CHANGELOG.md maintains history

## Adding a New Prompt

1. Create directory: `prompts/{prompt-name}/`
2. Create `v1.0.0.json` with prompt content
3. Add entry to `CHANGELOG.md`
4. Update `PromptLoader.js` if needed
5. Write tests for the new prompt
6. Document in `/functions/CLAUDE.md`
