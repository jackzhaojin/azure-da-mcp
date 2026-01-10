/**
 * Generate CSS
 * Generates styles.css from design system tokens
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { DesignSystem } from '../types/designSystem.js';

export interface GenerateCssInput {
  designSystem: DesignSystem;
  outputDir: string;
}

export interface GenerateCssResult {
  success: boolean;
  cssPath?: string;
  error?: string;
}

export async function generateCss(input: GenerateCssInput): Promise<GenerateCssResult> {
  try {
    const { designSystem, outputDir } = input;

    // Build CSS content
    let css = '/* Generated from design tokens */\n\n';

    // Add CSS variables
    css += generateCssVariables(designSystem.tokens);

    // Add reset/base styles
    css += generateBaseStyles();

    // Add block-specific styles
    css += generateBlockStyles(designSystem.blocks);

    // Write to file
    const cssPath = path.join(outputDir, 'assets/css/styles.css');
    await fs.mkdir(path.dirname(cssPath), { recursive: true });
    await fs.writeFile(cssPath, css, 'utf-8');

    return {
      success: true,
      cssPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate CSS',
    };
  }
}

function generateCssVariables(tokens: DesignSystem['tokens']): string {
  let css = ':root {\n';

  // Colors
  for (const [name, value] of Object.entries(tokens.colors)) {
    css += `  --color-${name}: ${value};\n`;
  }

  // Typography
  for (const [name, value] of Object.entries(tokens.typography)) {
    css += `  --font-${name}: ${value};\n`;
  }

  // Spacing
  for (const [name, value] of Object.entries(tokens.spacing)) {
    css += `  --spacing-${name}: ${value};\n`;
  }

  // Other token categories
  for (const [category, values] of Object.entries(tokens)) {
    if (['colors', 'typography', 'spacing'].includes(category)) continue;
    if (typeof values === 'object') {
      for (const [name, value] of Object.entries(values)) {
        css += `  --${category}-${name}: ${value};\n`;
      }
    }
  }

  css += '}\n\n';
  return css;
}

function generateBaseStyles(): string {
  return `/* Base Styles */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-family-base, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: var(--font-size-base, 16px);
  line-height: var(--line-height-base, 1.6);
  color: var(--color-text, #333);
  background-color: var(--color-background, #fff);
}

h1, h2, h3, h4, h5, h6 {
  margin-top: var(--spacing-lg, 1.5rem);
  margin-bottom: var(--spacing-md, 1rem);
  line-height: 1.2;
  font-weight: var(--font-weight-bold, 700);
}

h1 { font-size: var(--font-size-6xl, 3rem); }
h2 { font-size: var(--font-size-4xl, 2.25rem); }
h3 { font-size: var(--font-size-2xl, 1.5rem); }
h4 { font-size: var(--font-size-xl, 1.25rem); }
h5 { font-size: var(--font-size-lg, 1.125rem); }
h6 { font-size: var(--font-size-base, 1rem); }

p {
  margin-bottom: var(--spacing-md, 1rem);
}

a {
  color: var(--color-primary, #007bff);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

img {
  max-width: 100%;
  height: auto;
}

code {
  font-family: var(--font-family-mono, 'Courier New', monospace);
  background-color: var(--color-gray-100, #f5f5f5);
  padding: 0.125rem 0.25rem;
  border-radius: 3px;
  font-size: 0.9em;
}

pre {
  background-color: var(--color-gray-100, #f5f5f5);
  padding: var(--spacing-md, 1rem);
  border-radius: 4px;
  overflow-x: auto;
  margin-bottom: var(--spacing-md, 1rem);
}

pre code {
  background: none;
  padding: 0;
}

\n`;
}

function generateBlockStyles(_blocks: Record<string, any>): string {
  return `/* Block Styles */

.blog-post {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--spacing-xl, 2rem);
}

.blog-post header {
  margin-bottom: var(--spacing-2xl, 3rem);
}

.blog-post h1 {
  margin-top: 0;
}

/* Hero */
.hero {
  position: relative;
  width: 100%;
  height: 400px;
  overflow: hidden;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  margin-bottom: var(--spacing-2xl, 3rem);
}

.hero-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.9;
}

.hero-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.6));
}

.hero-content {
  position: relative;
  z-index: 10;
  text-align: center;
  color: white;
  padding: var(--spacing-xl, 2rem);
  max-width: 800px;
}

.hero h1 {
  font-size: 48px;
  font-weight: 800;
  margin-bottom: var(--spacing-md, 1rem);
  color: white;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
  line-height: 1.2;
}

.hero .teaser {
  font-size: 20px;
  font-weight: 300;
  line-height: 1.6;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.5);
  margin-bottom: var(--spacing-md, 1rem);
  color: white;
}

.hero .metadata {
  font-size: 14px;
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 1px;
  display: flex;
  justify-content: center;
  gap: var(--spacing-md, 1rem);
}

.teaser {
  font-size: var(--font-size-lg, 1.125rem);
  color: var(--color-text-secondary, #666);
  margin-bottom: var(--spacing-lg, 1.5rem);
}

.metadata {
  display: flex;
  gap: var(--spacing-md, 1rem);
  color: var(--color-text-muted, #999);
  font-size: var(--font-size-sm, 0.875rem);
}

/* Prose Block */
.prose {
  margin-bottom: var(--spacing-lg, 1.5rem);
}

/* Blockquote Block */
.blockquote {
  border-left: 4px solid var(--color-primary, #007bff);
  padding-left: var(--spacing-lg, 1.5rem);
  margin: var(--spacing-xl, 2rem) 0;
  font-style: italic;
  color: var(--color-text-secondary, #666);
}

.blockquote--large {
  font-size: var(--font-size-2xl, 1.5rem);
}

.blockquote__author {
  margin-top: var(--spacing-sm, 0.5rem);
  font-style: normal;
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: var(--font-weight-semibold, 600);
}

/* Image Block */
.image-block {
  margin: var(--spacing-xl, 2rem) 0;
}

.image-block img {
  display: block;
  width: 100%;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.image-block__caption {
  margin-top: var(--spacing-sm, 0.5rem);
  font-size: var(--font-size-sm, 0.875rem);
  color: var(--color-text-muted, #999);
  text-align: center;
}

.image-block--wide {
  margin-left: calc(-1 * var(--spacing-xl, 2rem));
  margin-right: calc(-1 * var(--spacing-xl, 2rem));
}

/* Code Block */
.code-block {
  margin: var(--spacing-lg, 1.5rem) 0;
}

.code-block__filename {
  background-color: var(--color-gray-200, #e5e5e5);
  padding: var(--spacing-sm, 0.5rem) var(--spacing-md, 1rem);
  font-family: var(--font-family-mono, 'Courier New', monospace);
  font-size: var(--font-size-sm, 0.875rem);
  border-radius: 4px 4px 0 0;
}

/* Callout Block */
.callout {
  padding: var(--spacing-md, 1rem);
  margin: var(--spacing-lg, 1.5rem) 0;
  border-radius: 4px;
  border-left: 4px solid;
}

.callout--tip {
  background-color: #e3f2fd;
  border-color: #2196f3;
}

.callout--note {
  background-color: #f5f5f5;
  border-color: #9e9e9e;
}

.callout--warning {
  background-color: #fff3e0;
  border-color: #ff9800;
}

.callout--danger {
  background-color: #ffebee;
  border-color: #f44336;
}

.callout--success {
  background-color: #e8f5e9;
  border-color: #4caf50;
}

.callout__title {
  font-weight: var(--font-weight-bold, 700);
  margin-bottom: var(--spacing-sm, 0.5rem);
  font-size: var(--font-size-md, 1rem);
}

/* Table Block */
.table-block {
  margin: var(--spacing-lg, 1.5rem) 0;
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: var(--spacing-sm, 0.5rem) var(--spacing-md, 1rem);
  text-align: left;
  border-bottom: 1px solid var(--color-gray-200, #e5e5e5);
}

th {
  font-weight: var(--font-weight-semibold, 600);
  background-color: var(--color-gray-50, #fafafa);
}

.table--striped tbody tr:nth-child(even) {
  background-color: var(--color-gray-50, #fafafa);
}

/* Video Block */
.video-block {
  margin: var(--spacing-xl, 2rem) 0;
  position: relative;
  padding-bottom: 56.25%; /* 16:9 aspect ratio */
  height: 0;
  overflow: hidden;
}

.video-block iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/* Stats Block */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacing-lg, 1.5rem);
  margin: var(--spacing-xl, 2rem) 0;
}

.stats__item {
  text-align: center;
  padding: var(--spacing-lg, 1.5rem);
  background-color: var(--color-gray-50, #fafafa);
  border-radius: 4px;
}

.stats__value {
  font-size: var(--font-size-4xl, 2.25rem);
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-primary, #007bff);
  margin-bottom: var(--spacing-sm, 0.5rem);
}

.stats__label {
  font-size: var(--font-size-sm, 0.875rem);
  color: var(--color-text-secondary, #666);
}

/* CTA Block */
.cta {
  background-color: var(--color-primary, #007bff);
  color: white;
  padding: var(--spacing-xl, 2rem);
  border-radius: 4px;
  text-align: center;
  margin: var(--spacing-2xl, 3rem) 0;
}

.cta__title {
  font-size: var(--font-size-2xl, 1.5rem);
  margin-bottom: var(--spacing-md, 1rem);
}

.cta__text {
  margin-bottom: var(--spacing-lg, 1.5rem);
}

.cta__button {
  display: inline-block;
  background-color: white;
  color: var(--color-primary, #007bff);
  padding: var(--spacing-sm, 0.5rem) var(--spacing-xl, 2rem);
  border-radius: 4px;
  font-weight: var(--font-weight-semibold, 600);
  text-decoration: none;
}

.cta__button:hover {
  background-color: var(--color-gray-100, #f5f5f5);
}

/* Author Card */
.author-card {
  display: flex;
  gap: var(--spacing-md, 1rem);
  padding: var(--spacing-lg, 1.5rem);
  background-color: var(--color-gray-50, #fafafa);
  border-radius: 4px;
  margin: var(--spacing-2xl, 3rem) 0;
}

.author-card__avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
}

.author-card__info {
  flex: 1;
}

.author-card__name {
  font-size: var(--font-size-lg, 1.125rem);
  font-weight: var(--font-weight-bold, 700);
  margin-bottom: var(--spacing-xs, 0.25rem);
}

.author-card__bio {
  color: var(--color-text-secondary, #666);
  font-size: var(--font-size-sm, 0.875rem);
}

/* Landing Page Styles */
.landing {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--spacing-xl, 2rem);
}

.site-header {
  text-align: center;
  margin-bottom: var(--spacing-2xl, 3rem);
}

.featured-post {
  margin-bottom: var(--spacing-2xl, 3rem);
  background-color: var(--color-gray-50, #fafafa);
  border-radius: 8px;
  overflow: hidden;
}

.featured-post__image {
  width: 100%;
  height: 400px;
  object-fit: cover;
}

.featured-post__content {
  padding: var(--spacing-xl, 2rem);
}

.featured-post__title {
  font-size: var(--font-size-4xl, 2.25rem);
  margin-bottom: var(--spacing-md, 1rem);
}

.blog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--spacing-xl, 2rem);
}

.blog-card {
  border: 1px solid var(--color-gray-200, #e5e5e5);
  border-radius: 8px;
  overflow: hidden;
  transition: box-shadow 0.2s;
}

.blog-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.blog-card__content {
  padding: var(--spacing-lg, 1.5rem);
}

.blog-card__title {
  font-size: var(--font-size-xl, 1.25rem);
  margin-bottom: var(--spacing-sm, 0.5rem);
}

.blog-card__teaser {
  color: var(--color-text-secondary, #666);
  margin-bottom: var(--spacing-md, 1rem);
}

.blog-card__meta {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-sm, 0.875rem);
  color: var(--color-text-muted, #999);
}
`;
}
