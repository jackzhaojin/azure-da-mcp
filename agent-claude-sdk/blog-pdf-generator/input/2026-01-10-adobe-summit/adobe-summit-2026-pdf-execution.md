# Adobe Summit 2026 PDF Generation

Generate 10 professional blog PDFs about Adobe Summit 2026 using AI-powered content generation.

## IMPORTANT: External Dependencies

**You MUST read this configuration file first:**
- **Config**: `./prompts/2026-01-10-pdf-generation/adobe-summit-2026-config.json`

**READ THE CONFIG COMPLETELY** to understand:
- Theme, topics, and industry focus
- Content guidelines and word count ranges
- Template distribution (30% basic, 70% featured)
- Media settings (images, YouTube videos)
- Metadata patterns (authors, dates, tags)

## Task

After reading the config file, generate **10 BlogPdfSpec JSON files** for professional blog PDFs about Adobe Summit 2026.

### Content Requirements

**Theme**: Adobe Summit 2026 - Digital Experience & Marketing Technology

**Topics** (use diverse mix across 10 specs):
- Edge Delivery Services (EDS) - Revolutionary web delivery
- GenAI in Digital Experience - AI-powered personalization
- Content Velocity & Authoring Innovation - From months to minutes
- DA.Live Authoring Platform - Modern content creation
- Adobe Experience Manager Evolution - Headless CMS trends
- Personalization at Scale - Data-driven customer experiences
- Developer Experience - Modern frameworks and APIs
- Marketing Innovation - Campaign orchestration
- Customer Success Stories - Real-world ROI and transformations
- Future of Digital Experience Platforms - Industry predictions

### BlogPdfSpec Structure

Each spec should follow this exact structure:

```json
{
  "id": "edge-delivery-services-future-web",
  "title": "Edge Delivery Services: The Future of Web Performance",
  "teaser": "How Adobe's EDS is transforming digital experiences with 100/100 Lighthouse scores",
  "template": "featured",
  "heroImage": "https://images.unsplash.com/photo-1551288049-bebda4e38f71",
  "content": "<h2>Introduction</h2><p>Well-written HTML content...</p>",
  "images": [
    {
      "url": "https://images.unsplash.com/photo-...",
      "alt": "Descriptive alt text",
      "position": "after-paragraph-2"
    }
  ],
  "youtube": [
    {
      "videoId": "dQw4w9WgXcQ",
      "caption": "Watch: EDS Demo at Adobe Summit 2026",
      "position": "after-section-2"
    }
  ],
  "metadata": {
    "author": "Sarah Chen - Principal Product Manager, Edge Delivery Services",
    "date": "2026-01-10",
    "tags": ["Edge Delivery Services", "Performance", "Adobe Summit 2026", "Web Development"]
  }
}
```

### Content Generation Guidelines

1. **Professional, Realistic Content**
   - Write actual blog articles (800-1500 words based on config)
   - Use proper HTML formatting: `<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>`, `<blockquote>`, `<strong>`, `<em>`
   - Include industry insights, real-world examples, realistic statistics
   - Professional tone suitable for marketing leaders and developers
   - Well-structured with clear sections and logical flow

2. **High Variety** (per config)
   - Diverse topics from the provided list
   - Mix of template types (30% basic, 70% featured)
   - Varied content lengths (800-1500 words)
   - Different heading structures and content organization
   - Mix of technical depth and business value

3. **Template Selection**
   - **Featured template** (70% of specs):
     - Include heroImage field with relevant Unsplash URL
     - Marketing-focused, visually rich content
     - Compelling teasers with strong hooks
     - Examples: product launches, customer stories, keynote insights

   - **Basic template** (30% of specs):
     - No heroImage field
     - Technical deep-dives or detailed guides
     - Developer-focused content
     - Examples: API guides, architecture deep-dives, best practices

4. **Images**
   - Include 1-3 images per blog (average 2 per config)
   - **Use realistic Unsplash URLs** relevant to the topic:
     - Conference imagery: `https://images.unsplash.com/photo-1540575467063-178a50c2df87`
     - Technology dashboards: `https://images.unsplash.com/photo-1551288049-bebda4e38f71`
     - Collaborative work: `https://images.unsplash.com/photo-1522071820081-009f0129c71c`
     - Modern offices: `https://images.unsplash.com/photo-1497366216548-37526070297c`
   - Write descriptive alt text for accessibility
   - Position strategically: "after-paragraph-2", "after-section-1", etc.
   - Vary image count naturally

5. **YouTube Videos** (40% inclusion rate per config)
   - 4 out of 10 blogs should include a YouTube video
   - Generate realistic 11-character video IDs
   - Examples:
     - "jNQXAC9IVRw" - Adobe Summit keynote
     - "dQw4w9WgXcQ" - Product demo
     - "8VPGRDOGn0E" - Customer testimonial
   - Write compelling captions:
     - "Watch: Adobe Summit 2026 Keynote - GenAI Breakthrough"
     - "Demo: DA.Live Authoring Platform in Action"
     - "Customer Story: How Nike Achieved 10x Content Velocity"
   - Position thoughtfully within content flow

6. **Metadata**
   - **Author**: Choose from config author list or generate similar names
   - **Date**: Use "2026-01-10" (ISO format)
   - **Tags**: Select 3-5 tags from config tagSets (technology, business, audience, events)
   - **ID**: Create URL-friendly slug from title (lowercase, hyphens, no special chars)

### Quality Standards

Each spec should:
- Have unique, engaging content (no duplication)
- Use proper HTML structure (no malformed tags)
- Include realistic Adobe Summit insights
- Have descriptive teasers that hook readers
- Use appropriate images and media
- Follow professional writing standards
- Match the Adobe Summit 2026 theme
- Provide actionable insights and value

### Writing Style

- **Professional but approachable**: Avoid jargon overload, explain complex concepts clearly
- **Forward-thinking**: Focus on innovation, future trends, cutting-edge solutions
- **Customer-centric**: Emphasize business value, ROI, real-world impact
- **Data-driven**: Include realistic metrics, performance numbers, success stories
- **Balanced**: Mix technical depth with business strategy

### Example Topics Distribution

1. Edge Delivery Services - Technical deep-dive (basic template)
2. GenAI Transforms Digital Experience - Product announcement (featured)
3. DA.Live Authoring Platform - How-to guide (basic template)
4. Personalization at Scale - Analytics strategy (featured)
5. Developer Experience Renaissance - API best practices (basic template)
6. Content Velocity Case Study - Customer story (featured)
7. Marketing Innovation Keynote - Summit insights (featured)
8. Customer Success Spotlight - ROI story (featured)
9. Future Predictions Panel - Industry trends (featured)
10. Summit Takeaways - Action items (featured)

## Output

Write **10 JSON files** to `output/specs/`:
- `blog-01-edge-delivery-services-future-web.json`
- `blog-02-genai-transforms-digital-experience.json`
- `blog-03-dalive-reimagining-content-authoring.json`
- ...
- `blog-10-adobe-summit-2026-key-takeaways.json`

## Execution Steps

1. Read the config file completely
2. Understand theme, topics, and requirements
3. Plan 10 diverse blog topics (mix of technical and business)
4. For each blog (1-10):
   - Choose template (basic or featured based on 30/70 distribution)
   - Create engaging title
   - Write realistic blog content (800-1500 words HTML)
   - Add images and/or YouTube based on config
   - Generate metadata (author, date, tags)
   - Create unique ID (slug)
   - Write JSON file to output/specs/
5. Ensure all 10 files are valid JSON

## Success Criteria

- ✅ All 10 spec files created successfully
- ✅ Each spec is valid JSON matching BlogPdfSpec schema
- ✅ Content is realistic, well-written, and varied
- ✅ Template distribution: ~3 basic, ~7 featured
- ✅ Images and YouTube videos included per config rules
- ✅ Files saved with correct naming pattern
- ✅ Topics cover diverse Adobe Summit 2026 themes
- ✅ Professional quality suitable for Adobe brand

Ready to generate world-class Adobe Summit 2026 blog content!
