/**
 * Block Renderer
 * Renders individual blog content blocks using templates
 */

import { renderTemplate } from './templateRenderer.js';
import type { Block } from '../types/blogContent.js';

export async function renderBlock(block: Block): Promise<string> {
  const templateName = `blocks/${block.type}`;

  switch (block.type) {
    case 'prose':
      return await renderTemplate(templateName, {
        CONTENT: block.content.text || '',
      });

    case 'blockquote':
      return await renderTemplate(templateName, {
        QUOTE: block.content.quote || '',
        AUTHOR: block.content.author || '',
        VARIANT: block.variant || '',
      });

    case 'image':
      return await renderTemplate(templateName, {
        SRC: block.content.src || '',
        ALT: block.content.alt || '',
        CAPTION: block.content.caption || '',
        VARIANT: block.variant || '',
      });

    case 'video':
      return await renderTemplate(templateName, {
        VIDEO_ID: block.content.videoId || '',
        CAPTION: block.content.caption || '',
        VARIANT: block.variant || '',
      });

    case 'code':
      return await renderTemplate(templateName, {
        CODE: escapeHtml(block.content.code || ''),
        LANGUAGE: block.content.language || '',
        FILENAME: block.content.filename || '',
      });

    case 'callout':
      return await renderTemplate(templateName, {
        VARIANT: block.variant || 'note',
        TITLE: block.content.title || '',
        CONTENT: block.content.text || '',
      });

    case 'table':
      const headers = (block.content.headers || [])
        .map((h: string) => `<th>${escapeHtml(h)}</th>`)
        .join('');
      const rows = (block.content.rows || [])
        .map(
          (row: string[]) =>
            `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
        )
        .join('');

      return await renderTemplate(templateName, {
        HEADERS: headers,
        ROWS: rows,
        VARIANT: block.variant || '',
      });

    case 'stats':
      const statsItems = (block.content.stats || [])
        .map(
          (stat: any) =>
            `<div class="stats__item">
              <div class="stats__value">${escapeHtml(stat.value)}</div>
              <div class="stats__label">${escapeHtml(stat.label)}</div>
            </div>`
        )
        .join('');

      return await renderTemplate(templateName, {
        STATS_ITEMS: statsItems,
        VARIANT: block.variant || '',
      });

    case 'cta':
      return await renderTemplate(templateName, {
        TITLE: block.content.title || '',
        TEXT: block.content.text || '',
        BUTTON_TEXT: block.content.buttonText || 'Learn More',
        BUTTON_URL: block.content.buttonUrl || '#',
        VARIANT: block.variant || '',
      });

    case 'author-card':
      return await renderTemplate(templateName, {
        NAME: block.content.name || '',
        BIO: block.content.bio || '',
        AVATAR: block.content.avatar || '',
      });

    case 'toc':
      // Table of contents - render list of links
      const tocItems = (block.content.items || [])
        .map(
          (item: any) =>
            `<li><a href="#${item.anchor}">${escapeHtml(item.title)}</a></li>`
        )
        .join('');
      return `<nav class="toc"><ul>${tocItems}</ul></nav>`;

    default:
      console.warn(`Unknown block type: ${block.type}`);
      return '';
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
