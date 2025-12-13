# Blog Spec Generation Prompt

Generate realistic BlogPdfSpec JSON files from a configuration file.

## Task

You need to create {{COUNT}} professional blog post specifications based on the provided config file. Each spec will later be used to generate a PDF document.

## Config File

Read the configuration from: {{CONFIG_PATH}}

The config contains:
- **Theme and Topics**: Industry focus and suggested topics
- **Generation Settings**: Number of specs, variety level, content depth
- **Template Distribution**: Ratio of basic vs featured templates
- **Media Settings**: Image and YouTube inclusion rules
- **Output Settings**: Where to save the generated specs

## BlogPdfSpec Schema

Each spec you generate must follow this exact structure:

```json
{
  "id": "unique-slug-based-on-title",
  "title": "Engaging Blog Post Title",
  "teaser": "Compelling 1-2 sentence preview",
  "template": "basic" | "featured",
  "heroImage": "https://images.unsplash.com/...",
  "content": "<h2>Section Title</h2><p>Well-written HTML content...</p>",
  "images": [
    {
      "url": "https://images.unsplash.com/...",
      "alt": "Descriptive alt text",
      "position": "after-paragraph-2"
    }
  ],
  "youtube": [
    {
      "videoId": "dQw4w9WgXcQ",
      "caption": "Descriptive caption",
      "position": "after-section-2"
    }
  ],
  "metadata": {
    "author": "Author Name",
    "date": "2025-12-13",
    "tags": ["tag1", "tag2", "tag3", "tag4"]
  }
}
```

## Content Generation Guidelines

### 1. **Realistic, Professional Content**
- Write actual blog articles (500-1500 words based on config)
- Use proper HTML formatting: `<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>`, `<blockquote>`
- Include industry insights, real-world examples, statistics (realistic but AI-generated)
- Professional tone suitable for B2B/B2C audiences
- Well-structured with clear sections and logical flow

### 2. **High Variety** (when variety=high)
- Diverse topics from the provided list
- Mix of template types (30% basic, 70% featured per config)
- Varied content lengths within specified range
- Different heading structures and content organization
- Mix of technical depth and accessibility

### 3. **Template Selection**
- **Featured template**: Use when heroImage is included (70% of specs)
  - Add heroImage field with Unsplash URL
  - More visual, marketing-focused content
  - Longer teasers with stronger hooks

- **Basic template**: Text-focused posts (30% of specs)
  - No heroImage field
  - Technical deep-dives or detailed guides
  - Focus on content substance over visuals

### 4. **Images**
- Include images based on config averageImageCount (typically 1-4 per blog)
- **Generate realistic Unsplash URLs** relevant to the blog topic
  - Format: `https://images.unsplash.com/photo-{random-id}?w=1200`
  - Choose topics matching blog content (e.g., logistics, technology, postal, delivery, AI, automation)
  - Examples: package sorting, delivery trucks, warehouse robots, postal workers, technology dashboards
- Write descriptive alt text for accessibility
- Position strategically: "after-paragraph-2", "after-section-1", etc.
- Vary image count naturally (not every blog needs the same number)

### 5. **YouTube Videos**
- Include YouTube videos based on config includeYouTube percentage (0-100%)
  - 50% = 50% chance each blog gets a video
  - Vary naturally - not every blog needs a video
- **Generate realistic YouTube video IDs** for tech/industry content
  - Format: 11-character alphanumeric ID (e.g., "dQw4w9WgXcQ", "jNQXAC9IVRw")
  - Create plausible IDs for industry videos (tech demos, talks, tutorials)
  - Video topics: postal technology demos, logistics automation, industry conferences, how-to guides
- Write compelling captions explaining what the video shows
  - Example: "Watch: How DHL Implemented AI-Powered Tracking Across 220 Countries"
- Position thoughtfully within content flow

### 6. **Metadata**
- **Author**: Use author from config or generate realistic names
- **Date**: Use datePattern from config (e.g., "2025-12-13")
- **Tags**: 3-5 relevant tags from config tagSets or generate contextual ones
- **ID**: Create URL-friendly slug from title (lowercase, hyphens, no special chars)

## Output Format

Create {{COUNT}} separate JSON files in the output directory: {{OUTPUT_DIR}}

**Filename pattern**: {{FILENAME_PATTERN}}
- `{index}` = 1, 2, 3, ... (zero-padded if needed)
- `{slug}` = URL-friendly version of title

Example: `blog-01-ai-package-tracking-2025.json`

## Workflow

1. **Read config file** from {{CONFIG_PATH}}
2. **Generate topics**: Use provided topics or create diverse ones based on theme
3. **For each spec (1 to {{COUNT}})**:
   - Choose template (basic or featured based on distribution)
   - Create engaging title related to theme
   - Write realistic blog content (HTML)
   - Add images and/or YouTube based on config
   - Generate metadata (author, date, tags)
   - Create unique ID (slug)
   - Write JSON file to {{OUTPUT_DIR}}
4. **Validate output**: Ensure all files are valid JSON and match schema

## Quality Standards

Each spec should:
- Have unique, engaging content (no copy-paste)
- Use proper HTML structure (no malformed tags)
- Include realistic industry insights
- Have descriptive teasers that hook readers
- Use appropriate images and media
- Follow professional writing standards
- Match the theme and industry focus

## Example Output

File: `generated-specs/blog-01-ai-package-tracking-2025.json`

```json
{
  "id": "ai-package-tracking-2025",
  "title": "AI-Powered Package Tracking: Revolutionizing B2B Logistics in 2025",
  "teaser": "How artificial intelligence is transforming real-time visibility and predictive delivery for postal operators worldwide",
  "template": "featured",
  "heroImage": "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1600",
  "content": "<h2>The Evolution of Package Tracking</h2><p>In 2025, artificial intelligence has fundamentally changed how postal services track and manage packages...</p><h2>Real-Time Visibility</h2><p>Modern AI systems provide unprecedented visibility...</p>",
  "images": [
    {
      "url": "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200",
      "alt": "AI dashboard showing real-time package locations across a logistics network",
      "position": "after-paragraph-2"
    }
  ],
  "youtube": [
    {
      "videoId": "jNQXAC9IVRw",
      "caption": "Watch: How DHL Implemented AI-Powered Tracking Across 220 Countries",
      "position": "after-section-2"
    }
  ],
  "metadata": {
    "author": "Tech Research Team",
    "date": "2025-12-13",
    "tags": ["AI", "logistics", "B2B", "tracking"]
  }
}
```

## Success Criteria

- All {{COUNT}} spec files created successfully
- Each spec is valid JSON matching BlogPdfSpec schema
- Content is realistic, well-written, and varied
- Template distribution matches config (30% basic, 70% featured)
- Images and YouTube videos included per config rules
- Files saved to {{OUTPUT_DIR}} with correct naming pattern

## Tools Available

Use these tools to complete the task:
- **Read** - Read the config file
- **Write** - Create each JSON spec file
- **Bash** - Execute validation scripts if needed

Start by reading the config file, then generate all {{COUNT}} specs one by one.
