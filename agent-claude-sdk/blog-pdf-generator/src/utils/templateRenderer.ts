/**
 * Template Rendering Utility
 * Simple template variable substitution for HTML templates
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BlogContent {
  title: string;
  content: string;
  teaser?: string;
  author?: string;
  date?: string;
  tags?: string[];
  heroImage?: string;
  heroImagePath?: string; // Relative path to hero image asset
}

export async function renderTemplate(
  templateName: string,
  data: BlogContent
): Promise<string> {
  // Read template file
  const templatePath = path.join(
    __dirname,
    '../../templates',
    `${templateName}.html`
  );

  let template = await fs.readFile(templatePath, 'utf-8');

  // Simple variable substitution
  template = template.replace(/\{\{TITLE\}\}/g, escapeHtml(data.title));
  template = template.replace(/\{\{CONTENT\}\}/g, data.content);

  // Optional fields with conditional blocks
  if (data.teaser) {
    template = template.replace(/\{\{#if TEASER\}\}/g, '');
    template = template.replace(/\{\{\/if\}\}/g, '');
    template = template.replace(/\{\{TEASER\}\}/g, escapeHtml(data.teaser));
  } else {
    // Remove conditional block
    template = template.replace(
      /\{\{#if TEASER\}\}[\s\S]*?\{\{\/if\}\}/g,
      ''
    );
  }

  if (data.author) {
    template = template.replace(/\{\{#if AUTHOR\}\}/g, '');
    template = template.replace(/\{\{AUTHOR\}\}/g, escapeHtml(data.author));
  } else {
    template = template.replace(/\{\{#if AUTHOR\}\}.*?\{\{\/if\}\}/g, '');
  }

  if (data.date) {
    template = template.replace(/\{\{#if DATE\}\}/g, '');
    template = template.replace(/\{\{DATE\}\}/g, escapeHtml(data.date));
  } else {
    template = template.replace(/\{\{#if DATE\}\}.*?\{\{\/if\}\}/g, '');
  }

  if (data.tags && data.tags.length > 0) {
    template = template.replace(/\{\{#if TAGS\}\}/g, '');
    template = template.replace(
      /\{\{TAGS\}\}/g,
      escapeHtml(data.tags.join(', '))
    );
  } else {
    template = template.replace(/\{\{#if TAGS\}\}.*?\{\{\/if\}\}/g, '');
  }

  // Handle hero image - process negations FIRST
  if (data.heroImage) {
    // Remove !if HERO_IMAGE blocks when hero image exists
    template = template.replace(
      /\{\{#if !HERO_IMAGE\}\}[\s\S]*?\{\{\/if\}\}/gm,
      ''
    );
    // Then handle positive if HERO_IMAGE blocks
    template = template.replace(/\{\{#if HERO_IMAGE\}\}/g, '');
    template = template.replace(/\{\{HERO_IMAGE\}\}/g, data.heroImage);
  } else {
    // Remove if HERO_IMAGE blocks when no hero image
    template = template.replace(
      /\{\{#if HERO_IMAGE\}\}[\s\S]*?\{\{\/if\}\}/gm,
      ''
    );
    // Keep !if HERO_IMAGE blocks when no hero image
    template = template.replace(/\{\{#if !HERO_IMAGE\}\}/g, '');
  }

  // Handle hero image path
  if (data.heroImagePath) {
    template = template.replace(/\{\{#if HERO_IMAGE_PATH\}\}/g, '');
    template = template.replace(/\{\{HERO_IMAGE_PATH\}\}/g, escapeHtml(data.heroImagePath));
  } else {
    template = template.replace(/\{\{#if HERO_IMAGE_PATH\}\}.*?\{\{\/if\}\}/g, '');
  }

  // Clean up any remaining conditional blocks
  template = template.replace(/\{\{\/if\}\}/g, '');

  return template;
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
