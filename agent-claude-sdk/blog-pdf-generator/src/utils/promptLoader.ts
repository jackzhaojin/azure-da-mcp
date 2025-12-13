/**
 * Prompt Template Loader
 * Loads and processes prompt templates from the prompts/ directory
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PromptVariables {
  [key: string]: string;
}

/**
 * Load a prompt template and replace variables
 */
export async function loadPrompt(
  templateName: string,
  variables: PromptVariables
): Promise<string> {
  // Read template file
  const templatePath = path.join(
    __dirname,
    '../../prompts',
    `${templateName}.md`
  );

  let template = await fs.readFile(templatePath, 'utf-8');

  // Replace variables
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    template = template.replaceAll(placeholder, value);
  }

  return template;
}
