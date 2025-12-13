/**
 * Template Rendering Tool
 * Renders HTML from template and blog content
 */

import { renderTemplate as renderTemplateUtil } from '../utils/templateRenderer.js';

export interface RenderTemplateInput {
  title: string;
  content: string;
  teaser?: string;
  author?: string;
  date?: string;
  tags?: string;
  templateName?: string;
}

export interface RenderTemplateResult {
  success: boolean;
  html?: string;
  error?: string;
}

export async function renderTemplate(
  input: RenderTemplateInput
): Promise<RenderTemplateResult> {
  try {
    const templateName = input.templateName || 'basic';

    const html = await renderTemplateUtil(templateName, {
      title: input.title,
      content: input.content,
      teaser: input.teaser,
      author: input.author,
      date: input.date,
      tags: input.tags ? input.tags.split(',').map(t => t.trim()) : undefined,
    });

    return {
      success: true,
      html,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error rendering template',
    };
  }
}

// Tool definition for Agent SDK
export const renderTemplateTool = {
  name: 'render_template',
  description: 'Renders an HTML template with blog post content. Takes title, content, and optional metadata, returns formatted HTML ready for PDF generation.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The blog post title',
      },
      content: {
        type: 'string',
        description: 'The main blog content (HTML)',
      },
      teaser: {
        type: 'string',
        description: 'Optional teaser/preview text',
      },
      author: {
        type: 'string',
        description: 'Optional author name',
      },
      date: {
        type: 'string',
        description: 'Optional publication date',
      },
      tags: {
        type: 'string',
        description: 'Optional comma-separated tags',
      },
      templateName: {
        type: 'string',
        description: 'Template name (default: "basic")',
      },
    },
    required: ['title', 'content'],
  },
  execute: renderTemplate,
};
