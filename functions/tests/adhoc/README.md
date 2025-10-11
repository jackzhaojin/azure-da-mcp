# Ad-hoc Tests

Quick standalone tests for verifying specific functionality without the full test harness.

## Running Tests

```bash
# From functions directory
node tests/adhoc/test-prompt-array.js
```

## Available Tests

- **test-prompt-array.js** - Verifies prompt array format is correctly converted to strings by PromptBuilder

## When to Use

Use ad-hoc tests when:
- You need a quick verification without Jest overhead
- Testing a specific module in isolation
- Debugging a particular issue
- Creating temporary tests during development

For full E2E tests, use `tests/e2e/` instead.
