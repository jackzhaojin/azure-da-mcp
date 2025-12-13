# Agent SDK PDF Generation Prompt

Generate a professional PDF from a blog post by writing and executing a Node.js script.

## Task

Create and run a script that uses the existing deterministic PDF generator.

The deterministic generator is already working perfectly. Your job is to:
1. Read the spec from: {{SPEC_PATH}}
2. Write a simple script that imports and calls the deterministic generator
3. Execute the script to generate the PDF

## Approach

Write a file called "agent-runner.js" in {{OUTPUT_DIR}} with this content:

```javascript
import { generateBlogPdf } from './src/agentDeterministic.js';
import fs from 'fs/promises';

const spec = JSON.parse(await fs.readFile('{{SPEC_PATH}}', 'utf-8'));
const result = await generateBlogPdf(spec, '{{OUTPUT_DIR}}');

console.log(JSON.stringify(result, null, 2));
```

Then run it with: cd {{PROJECT_ROOT}} && node agent-runner.js

The script will output a JSON result showing success/failure and PDF path.

## Important

- Write the runner script to {{OUTPUT_DIR}}/agent-runner.js
- Execute it from the project root
- The PDF will be generated at: {{OUTPUT_DIR}}/{{SPEC_ID}}.pdf

## Variables

These placeholders will be replaced at runtime:
- `{{SPEC_PATH}}` - Path to the blog spec JSON file
- `{{OUTPUT_DIR}}` - Directory for output files
- `{{PROJECT_ROOT}}` - Project root directory
- `{{SPEC_ID}}` - Blog post ID
