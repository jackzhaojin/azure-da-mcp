/**
 * Blog Content Types
 * Defines the structure of blog content and blocks
 */

export interface BlogContent {
  id: string;
  title: string;
  teaser: string;
  slug?: string; // URL-friendly version of title
  heroImage?: string; // Optional hero image URL
  blocks: Block[];
  metadata: {
    author: string;
    date: string; // ISO 8601 format
    tags: string[];
  };
}

export type BlockType =
  | 'prose'
  | 'blockquote'
  | 'image'
  | 'video'
  | 'code'
  | 'callout'
  | 'table'
  | 'stats'
  | 'cta'
  | 'toc'
  | 'author-card';

export interface Block {
  type: BlockType;
  variant?: string; // e.g., 'tip', 'warning', 'danger' for callout
  content: any; // Varies by block type
}

// Specific block content types
export interface ProseBlockContent {
  text: string; // HTML or markdown
}

export interface BlockquoteBlockContent {
  quote: string;
  author?: string;
  citation?: string;
}

export interface ImageBlockContent {
  src: string; // URL or relative path
  alt: string;
  caption?: string;
}

export interface VideoBlockContent {
  videoId: string; // YouTube video ID
  caption?: string;
}

export interface CodeBlockContent {
  code: string;
  language?: string;
  filename?: string;
}

export interface CalloutBlockContent {
  title?: string;
  text: string;
}

export interface TableBlockContent {
  headers: string[];
  rows: string[][];
}

export interface StatsBlockContent {
  stats: Array<{
    value: string;
    label: string;
  }>;
}

export interface CTABlockContent {
  title: string;
  text: string;
  buttonText: string;
  buttonUrl: string;
}

export interface TOCBlockContent {
  items: Array<{
    title: string;
    anchor: string;
  }>;
}

export interface AuthorCardBlockContent {
  name: string;
  bio: string;
  avatar?: string;
}
