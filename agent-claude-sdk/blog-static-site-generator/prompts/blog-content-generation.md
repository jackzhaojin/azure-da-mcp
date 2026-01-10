# Blog Content Generation

You are generating **{{COUNT}}** blog posts for a static site.

## Theme
{{THEME}}

## Topics
{{TOPICS}}

## Available Design System Blocks
You can use these block types in your blog posts:
{{AVAILABLE_BLOCKS}}

## Task
Generate {{COUNT}} blog content files named `blog-content-001.json`, `blog-content-002.json`, etc.

Each JSON file should contain:

```json
{
  "id": "post-001",
  "title": "Compelling Blog Post Title",
  "teaser": "A 1-2 sentence summary that hooks the reader",
  "slug": "url-friendly-slug",
  "heroImage": "https://images.unsplash.com/photo-xxxxx",
  "blocks": [
    {
      "type": "prose",
      "content": { "text": "<p>Introduction paragraph...</p>" }
    },
    {
      "type": "callout",
      "variant": "tip",
      "content": { "title": "Pro Tip", "text": "Helpful advice..." }
    },
    {
      "type": "image",
      "content": {
        "src": "https://images.unsplash.com/photo-xxxxx",
        "alt": "Descriptive alt text",
        "caption": "Image caption"
      }
    },
    {
      "type": "code",
      "content": {
        "code": "const example = 'code snippet';",
        "language": "javascript",
        "filename": "example.js"
      }
    }
  ],
  "metadata": {
    "author": "Author Name",
    "date": "2026-01-10",
    "tags": ["tag1", "tag2", "tag3"]
  }
}
```

## Requirements

1. **Vary the content structure**: Each blog should have a different mix of blocks
2. **Use diverse block types**: Include prose, blockquote, image, code, callout, table, stats, cta, etc.
3. **Realistic image URLs**: Use Unsplash or similar (https://images.unsplash.com/photo-...)
4. **Relevant to theme**: All content should relate to the theme and topics
5. **Proper length**: Each post should be 800-1200 words when rendered
6. **Valid HTML in prose**: Use proper HTML tags in prose blocks (<p>, <h2>, <h3>, <ul>, <ol>, etc.)
7. **Unique slugs**: Each post must have a unique URL-friendly slug
8. **ISO dates**: Use ISO 8601 format (YYYY-MM-DD) for dates

## Example Block Types

**Prose Block**:
```json
{
  "type": "prose",
  "content": {
    "text": "<p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p>"
  }
}
```

**Callout Block**:
```json
{
  "type": "callout",
  "variant": "tip",
  "content": {
    "title": "Quick Tip",
    "text": "This is helpful advice for readers."
  }
}
```

**Stats Block**:
```json
{
  "type": "stats",
  "content": {
    "stats": [
      { "value": "10x", "label": "Faster Performance" },
      { "value": "50%", "label": "Cost Reduction" }
    ]
  }
}
```

**CTA Block**:
```json
{
  "type": "cta",
  "content": {
    "title": "Ready to Get Started?",
    "text": "Join thousands of developers already using our platform.",
    "buttonText": "Start Free Trial",
    "buttonUrl": "https://example.com/signup"
  }
}
```

## Output
Write {{COUNT}} files to the current directory: `blog-content-001.json`, `blog-content-002.json`, etc.

Each file should be valid JSON and follow the structure above.
