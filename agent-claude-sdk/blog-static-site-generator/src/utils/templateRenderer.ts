/**
 * Template Rendering Utility
 * Simple template variable substitution for HTML templates
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function renderTemplate(
  templateName: string,
  data: Record<string, string>
): Promise<string> {
  // Read template file
  const templatePath = path.join(
    __dirname,
    '../../templates',
    `${templateName}.html`
  );

  let template = await fs.readFile(templatePath, 'utf-8');

  // Replace all variables
  for (const [key, value] of Object.entries(data)) {
    // Handle conditional blocks {{#if KEY}}...{{/if}}
    if (value && value.length > 0) {
      // Remove conditional tags, keep content
      template = template.replace(new RegExp(`\\{\\{#if ${key}\\}\\}`, 'g'), '');
      template = template.replace(new RegExp(`\\{\\{#if !${key}\\}\\}[\\s\\S]*?\\{\\{\\/if\\}\\}`, 'gm'), '');
    } else {
      // Remove blocks for empty values
      template = template.replace(new RegExp(`\\{\\{#if ${key}\\}\\}[\\s\\S]*?\\{\\{\\/if\\}\\}`, 'gm'), '');
      // Keep negation blocks
      template = template.replace(new RegExp(`\\{\\{#if !${key}\\}\\}`, 'g'), '');
    }

    // Replace variable placeholders
    template = template.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }

  // Clean up any remaining conditional blocks
  template = template.replace(/\{\{\/if\}\}/g, '');

  // Clean up any remaining {{#if ...}} tags
  template = template.replace(/\{\{#if [^}]+\}\}/g, '');

  return template;
}
