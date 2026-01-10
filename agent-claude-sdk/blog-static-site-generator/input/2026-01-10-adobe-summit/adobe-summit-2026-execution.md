# Adobe Summit 2026 Blog Generation

Generate 10 professional blog posts about Adobe Summit 2026 using the provided design system.

## IMPORTANT: External Dependencies

**You MUST read these files first before proceeding:**

1. **Design System (MD)**: `/Users/jackjin/dev/azure-da-mcp/agent-claude-sdk/blog-static-site-generator/prompts/2026-01-10-claude-design/adobe-summit-blog-design-system.md`
2. **Design System Preview (JSX)**: `/Users/jackjin/dev/azure-da-mcp/agent-claude-sdk/blog-static-site-generator/prompts/2026-01-10-claude-design/design-system-preview.jsx`

**READ BOTH FILES COMPLETELY** to understand:
- Color tokens, typography, spacing
- Component structure and styling
- Block types and their variants
- Brand guidelines

## Task

After reading the design system files, generate **10 blog posts** about Adobe Summit 2026.

### Content Requirements

**Theme**: Adobe Summit 2026

**Topics** (use diverse mix across 10 posts):
- Edge Delivery Services (EDS)
- GenAI in Digital Experience
- Content Velocity & Authoring
- DA.Live Authoring Platform
- Adobe Experience Manager
- Personalization & Analytics
- Developer Experience
- Marketing Innovation
- Customer Success Stories
- Future of Digital Experience

### Blog Post Structure

Each blog should be **800-1200 words** and include:

1. **Engaging title** (60-80 characters)
2. **Compelling teaser** (1-2 sentences, 120-160 characters)
3. **Diverse block types**:
   - `prose` - Main content (use proper HTML: `<p>`, `<h2>`, `<h3>`, `<ul>`, `<li>`, `<strong>`, `<em>`)
   - `blockquote` - Pull quotes from speakers/executives
   - `image` - Use Unsplash URLs (https://images.unsplash.com/photo-...)
   - `code` - Code examples for developer content
   - `callout` - Tips, warnings, key takeaways (variants: tip, note, warning, success)
   - `stats` - Key metrics and data points
   - `cta` - Call-to-action for registration, demos, resources
   - `author-card` - Author bio at end

### Metadata

- **Author**: Use realistic Adobe author names (e.g., "Sarah Chen", "David Martinez", "Emily Rodriguez")
- **Date**: 2026-01-10 (use ISO format YYYY-MM-DD)
- **Tags**: 3-5 relevant tags per post

### Image Guidelines

Use realistic Unsplash photo IDs for:
- Conference/summit imagery
- Technology/digital screens
- People collaborating
- Modern office/workspace
- Abstract tech patterns

Example: `https://images.unsplash.com/photo-1540575467063-178a50c2df87`

### Code Examples

For technical posts, include realistic code snippets:
- JavaScript/TypeScript
- HTML/CSS
- GraphQL queries
- API examples

### Brand Voice

- Professional but approachable
- Innovative and forward-thinking
- Focus on customer value and ROI
- Highlight Adobe's expertise and leadership

## Output Format

Generate **10 JSON files** named:
- `blog-content-001.json`
- `blog-content-002.json`
- ...
- `blog-content-010.json`

Each file structure:

```json
{
  "id": "post-001",
  "title": "Compelling Title About Adobe Summit 2026",
  "teaser": "A compelling 1-2 sentence summary that hooks readers.",
  "slug": "url-friendly-slug",
  "heroImage": "https://images.unsplash.com/photo-xxxxx",
  "blocks": [
    {
      "type": "prose",
      "content": {
        "text": "<h2>Introduction</h2><p>Opening paragraph...</p>"
      }
    },
    {
      "type": "callout",
      "variant": "tip",
      "content": {
        "title": "Key Insight",
        "text": "Important takeaway for readers."
      }
    },
    {
      "type": "image",
      "content": {
        "src": "https://images.unsplash.com/photo-xxxxx",
        "alt": "Descriptive alt text",
        "caption": "Image caption explaining the visual"
      }
    },
    {
      "type": "blockquote",
      "content": {
        "quote": "Insightful quote from an Adobe executive or summit speaker.",
        "author": "John Doe, VP of Digital Experience"
      }
    },
    {
      "type": "stats",
      "content": {
        "stats": [
          { "value": "10x", "label": "Faster Time to Market" },
          { "value": "50%", "label": "Cost Reduction" },
          { "value": "99.9%", "label": "Uptime SLA" }
        ]
      }
    },
    {
      "type": "code",
      "content": {
        "code": "const config = {\n  apiKey: 'YOUR_API_KEY',\n  endpoint: 'https://api.adobe.io/eds'\n};",
        "language": "javascript",
        "filename": "config.js"
      }
    },
    {
      "type": "cta",
      "content": {
        "title": "Ready to Experience Adobe Summit 2026?",
        "text": "Join thousands of digital experience leaders at Adobe Summit 2026.",
        "buttonText": "Register Now",
        "buttonUrl": "https://summit.adobe.com/2026"
      }
    },
    {
      "type": "author-card",
      "content": {
        "name": "Sarah Chen",
        "bio": "Sarah is a Principal Product Manager at Adobe, leading the Edge Delivery Services initiative.",
        "avatar": "https://images.unsplash.com/photo-xxxxx"
      }
    }
  ],
  "metadata": {
    "author": "Sarah Chen",
    "date": "2026-01-10",
    "tags": ["Adobe Summit 2026", "Edge Delivery Services", "Digital Experience"]
  }
}
```

## Quality Checklist

Before generating each post, ensure:

- ✅ Read both design system files
- ✅ Title is compelling and SEO-friendly
- ✅ Teaser hooks the reader
- ✅ Content is 800-1200 words
- ✅ Mix of 6-8 different block types per post
- ✅ Proper HTML in prose blocks
- ✅ Realistic Unsplash image URLs
- ✅ Valid code snippets
- ✅ Author card at end
- ✅ CTA included
- ✅ 3-5 relevant tags
- ✅ All JSON is valid

## Execution

Write all 10 JSON files to the current working directory.
