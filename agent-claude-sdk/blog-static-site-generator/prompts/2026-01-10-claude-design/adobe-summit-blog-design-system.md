# Adobe Summit Blog Design System
## For DA.Live / Edge Delivery Services

**Version:** 1.0  
**Theme:** Bold & Modern  
**Primary Brand:** Adobe Summit 2026

---

# Table of Contents

1. [Design Tokens](#design-tokens)
   - Colors
   - Typography
   - Spacing
   - Borders & Shadows
   - Transitions
2. [Blog Listing Components](#blog-listing-components)
   - FeaturedPost
   - BlogCard
   - BlogGrid
3. [Blog Post Blocks](#blog-post-blocks)
   - ArticleHeader
   - Prose
   - Blockquote
   - ImageBlock
   - CodeBlock
   - VideoEmbed
   - Callout
   - Table
   - StatsHighlight
   - CTABanner
   - TableOfContents
   - RelatedPosts
   - AuthorCard

---

# Design Tokens

## Colors

### Primary (Adobe Red)
Use for: CTAs, accents, category badges, interactive highlights

| Token | Hex | Usage |
|-------|-----|-------|
| `primary-50` | `#fef2f2` | Subtle backgrounds |
| `primary-100` | `#fee2e2` | Hover backgrounds |
| `primary-200` | `#fecaca` | Light accents |
| `primary-300` | `#fca5a5` | Borders |
| `primary-400` | `#f87171` | Secondary accents |
| `primary-500` | `#ED2224` | **Main Adobe Red** |
| `primary-600` | `#dc2626` | Hover state |
| `primary-700` | `#b91c1c` | Active/pressed |
| `primary-800` | `#991b1b` | Dark accent |
| `primary-900` | `#7f1d1d` | Darkest |

### Neutral (Adobe Charcoal Base)
Use for: Text, backgrounds, borders, subtle UI

| Token | Hex | Usage |
|-------|-----|-------|
| `neutral-0` | `#ffffff` | White backgrounds |
| `neutral-50` | `#fafafa` | Page background |
| `neutral-100` | `#f5f5f5` | Card backgrounds, dividers |
| `neutral-200` | `#e5e5e5` | Borders, disabled |
| `neutral-300` | `#d4d4d4` | Placeholder, icons |
| `neutral-400` | `#a3a3a3` | Muted text |
| `neutral-500` | `#737373` | Secondary text |
| `neutral-600` | `#525252` | Body text |
| `neutral-700` | `#404040` | Strong text |
| `neutral-800` | `#2D2E2D` | **Adobe Dark Charcoal** - headings |
| `neutral-900` | `#171717` | Darkest text |
| `neutral-950` | `#0a0a0a` | Near black |

### Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `success` | `#10b981` | Success states, positive callouts |
| `warning` | `#f59e0b` | Warning states, caution callouts |
| `error` | `#ef4444` | Error states, danger callouts |
| `info` | `#3b82f6` | Info states, tip callouts |

---

## Typography

### Font Families

```css
--font-sans: "Adobe Clean", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: "Adobe Clean Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
```

### Font Sizes

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `text-xs` | 12px | 1.5 | Labels, captions, metadata |
| `text-sm` | 14px | 1.5 | Secondary text, UI elements |
| `text-base` | 16px | 1.6 | Body text |
| `text-lg` | 18px | 1.6 | Large body, lead paragraphs |
| `text-xl` | 20px | 1.4 | Small headings |
| `text-2xl` | 24px | 1.3 | H4 headings |
| `text-3xl` | 30px | 1.25 | H3 headings |
| `text-4xl` | 36px | 1.2 | H2 headings |
| `text-5xl` | 48px | 1.1 | H1 headings |
| `text-6xl` | 60px | 1.05 | Display headings |

### Font Weights

| Token | Value | Usage |
|-------|-------|-------|
| `font-normal` | 400 | Body text |
| `font-medium` | 500 | Emphasized text, labels |
| `font-semibold` | 600 | Subheadings, buttons |
| `font-bold` | 700 | Headings, strong emphasis |

### Letter Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `tracking-tight` | -0.025em | Large headings |
| `tracking-normal` | 0 | Body text |
| `tracking-wide` | 0.05em | Uppercase labels, category pills |
| `tracking-wider` | 0.1em | All-caps small text |

---

## Spacing

Based on 4px base unit, 8-point grid system.

| Token | Value | Usage |
|-------|-------|-------|
| `space-0` | 0 | None |
| `space-1` | 4px | Tight gaps |
| `space-2` | 8px | Small gaps, icon spacing |
| `space-3` | 12px | Compact padding |
| `space-4` | 16px | Default padding |
| `space-5` | 20px | Medium padding |
| `space-6` | 24px | Card padding |
| `space-8` | 32px | Section gaps |
| `space-10` | 40px | Large gaps |
| `space-12` | 48px | Section padding |
| `space-16` | 64px | Major sections |
| `space-20` | 80px | Page sections |
| `space-24` | 96px | Hero spacing |

---

## Borders & Shadows

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-none` | 0 | Sharp corners |
| `radius-sm` | 4px | Buttons, small elements |
| `radius-md` | 6px | Inputs, pills |
| `radius-lg` | 8px | Cards, containers |
| `radius-xl` | 12px | Large cards, modals |
| `radius-2xl` | 16px | Feature sections |
| `radius-full` | 9999px | Circles, pills |

### Box Shadows

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
```

---

## Transitions

| Token | Value | Usage |
|-------|-------|-------|
| `transition-fast` | 150ms ease | Hover states, micro-interactions |
| `transition-normal` | 200ms ease | Card hovers, toggles |
| `transition-slow` | 300ms ease | Page transitions, modals |

---

# Blog Listing Components

---

## FeaturedPost

Hero component for the primary/featured article on the listing page.

### Structure
```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │                     │  │  [CATEGORY BADGE]            │  │
│  │                     │  │                              │  │
│  │   HERO IMAGE        │  │  Title Goes Here in Large    │  │
│  │   (gradient bg)     │  │  Bold Typography             │  │
│  │                     │  │                              │  │
│  │                     │  │  Excerpt text that provides  │  │
│  │                     │  │  a brief summary...          │  │
│  │                     │  │                              │  │
│  │                     │  │  [Avatar] Author · Date      │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Specifications

| Property | Value |
|----------|-------|
| Layout | CSS Grid, 2 columns, 1:1 ratio |
| Background | `neutral-900` |
| Padding | `space-8` (32px) |
| Border Radius | `radius-xl` (12px) |
| Gap | `space-8` (32px) |
| Min Height | 400px |

### Image Side

| Property | Value |
|----------|-------|
| Background | Gradient: `primary-500` to `primary-700` (135deg) |
| Border Radius | `radius-lg` (8px) |
| Aspect Ratio | Fill container |
| Placeholder | Adobe "A" triangle icon, white, centered |

### Content Side

| Element | Specifications |
|---------|----------------|
| **Category Badge** | |
| - Font | `text-xs`, `font-semibold`, uppercase |
| - Letter Spacing | `tracking-wider` (0.1em) |
| - Color | `primary-500` |
| - Background | `primary-500` at 15% opacity |
| - Padding | `space-1` vertical, `space-3` horizontal |
| - Border Radius | `radius-sm` |
| - Margin Bottom | `space-4` |
| **Title** | |
| - Font | `text-4xl` (36px), `font-bold` |
| - Color | `neutral-0` (white) |
| - Line Height | 1.2 |
| - Letter Spacing | `tracking-tight` |
| - Margin Bottom | `space-4` |
| **Excerpt** | |
| - Font | `text-lg` (18px), `font-normal` |
| - Color | `neutral-400` |
| - Line Height | 1.6 |
| - Margin Bottom | `space-6` |
| - Max Lines | 3 (line-clamp) |
| **Author Row** | |
| - Layout | Flex, centered, `space-3` gap |
| - Avatar | 40px circle, `neutral-700` bg, initials in `neutral-300` |
| - Author Name | `text-sm`, `font-medium`, `neutral-200` |
| - Date | `text-sm`, `font-normal`, `neutral-500` |

### States

| State | Changes |
|-------|---------|
| **Default** | As specified |
| **Hover** | Scale transform 1.01, cursor pointer |

### Variations

**None** - Single variant for featured posts.

---

## BlogCard

Card component for individual blog posts in the grid.

### Structure
```
┌─────────────────────────┐
│  ┌───────────────────┐  │
│  │ [CATEGORY]        │  │
│  │                   │  │
│  │   IMAGE AREA      │  │
│  │   (16:9 ratio)    │  │
│  │                   │  │
│  └───────────────────┘  │
│                         │
│  Title of the Post      │
│                         │
│  Excerpt text goes      │
│  here with summary...   │
│                         │
│  ─────────────────────  │
│  [Av] Author · Date     │
└─────────────────────────┘
```

### Specifications

| Property | Value |
|----------|-------|
| Background | `neutral-0` (white) |
| Border Radius | `radius-lg` (8px) |
| Box Shadow | `shadow-sm` default, `shadow-lg` on hover |
| Overflow | Hidden |
| Cursor | Pointer |

### Image Area

| Property | Value |
|----------|-------|
| Aspect Ratio | 16:9 (padding-top: 56.25%) |
| Background | `neutral-200` with gradient overlay |
| Position | Relative (for badge positioning) |

### Category Badge (on image)

| Property | Value |
|----------|-------|
| Position | Absolute, top `space-3`, left `space-3` |
| Font | `text-xs`, `font-semibold`, uppercase |
| Letter Spacing | `tracking-wide` |
| Color | `neutral-0` (white) |
| Background | `primary-500` |
| Padding | `space-1` vertical, `space-2` horizontal |
| Border Radius | `radius-sm` |

### Content Area

| Property | Value |
|----------|-------|
| Padding | `space-5` (20px) |
| Display | Flex column |

| Element | Specifications |
|---------|----------------|
| **Title** | |
| - Font | `text-lg` (18px), `font-bold` |
| - Color | `neutral-900` |
| - Line Height | 1.25 |
| - Margin Bottom | `space-2` |
| - Max Lines | 2 (line-clamp) |
| **Excerpt** | |
| - Font | `text-sm` (14px), `font-normal` |
| - Color | `neutral-500` |
| - Line Height | 1.6 |
| - Margin Bottom | `space-4` |
| - Max Lines | 3 (line-clamp) |
| - Flex | 1 (fills available space) |
| **Divider** | |
| - Border Top | 1px solid `neutral-100` |
| - Padding Top | `space-4` |
| **Author Row** | |
| - Layout | Flex, centered, `space-3` gap |
| - Avatar | 32px circle, `neutral-300` bg, initial in `neutral-600` |
| - Author Name | `text-sm`, `font-medium`, `neutral-800` |
| - Date | `text-xs`, `font-normal`, `neutral-400` |

### States

| State | Changes |
|-------|---------|
| **Default** | `shadow-sm` |
| **Hover** | `shadow-lg`, translateY(-4px) |

### Variations

**None** - Single variant. Sizing handled by grid.

---

## BlogGrid

Layout wrapper for BlogCard components.

### Specifications

| Property | Value |
|----------|-------|
| Display | CSS Grid |
| Columns | 3 columns, equal width (`1fr 1fr 1fr`) |
| Gap | `space-6` (24px) |
| Responsive | 2 columns at 768px, 1 column at 480px |

---

# Blog Post Blocks

---

## ArticleHeader

Hero header block for blog post pages.

### Structure
```
              [CATEGORY BADGE]
              
    Title of the Article Goes Here
       in Large Centered Text
              
      Author Name · Date · X min read
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 720px |
| Margin | 0 auto (centered) |
| Text Align | Center |
| Padding Bottom | `space-10` (40px) |

| Element | Specifications |
|---------|----------------|
| **Category Badge** | |
| - Font | `text-xs`, `font-semibold`, uppercase |
| - Letter Spacing | `tracking-wider` |
| - Color | `primary-500` |
| - Background | `primary-500` at 10% opacity |
| - Padding | `space-1` vertical, `space-3` horizontal |
| - Border Radius | `radius-sm` |
| - Margin Bottom | `space-5` |
| **Title** | |
| - Font | `text-5xl` (48px), `font-bold` |
| - Color | `neutral-900` |
| - Line Height | 1.1 |
| - Letter Spacing | `tracking-tight` |
| - Margin Bottom | `space-6` |
| **Meta Row** | |
| - Font | `text-sm`, `font-normal` |
| - Color | `neutral-500` |
| - Layout | Inline with `·` separators |
| - Author Name | `font-medium`, `neutral-700` |

### Variations

**None** - Single variant.

---

## Prose

Body text wrapper block with proper typography for article content.

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 680px |
| Margin | 0 auto (centered) |
| Font Family | `font-sans` |
| Font Size | `text-lg` (18px) |
| Line Height | 1.7 |
| Color | `neutral-700` |

### Child Element Styles

| Element | Specifications |
|---------|----------------|
| **Paragraph** | |
| - Margin Bottom | `space-6` (24px) |
| **Heading 2** | |
| - Font | `text-3xl` (30px), `font-bold` |
| - Color | `neutral-900` |
| - Margin Top | `space-12` (48px) |
| - Margin Bottom | `space-4` (16px) |
| **Heading 3** | |
| - Font | `text-2xl` (24px), `font-semibold` |
| - Color | `neutral-900` |
| - Margin Top | `space-8` (32px) |
| - Margin Bottom | `space-3` (12px) |
| **Bold** | |
| - Font Weight | `font-semibold` |
| - Color | `neutral-800` |
| **Italic** | |
| - Font Style | Italic |
| **Link** | |
| - Color | `primary-500` |
| - Text Decoration | Underline on hover |
| **Unordered List** | |
| - Margin Left | `space-6` |
| - List Style | Disc |
| - Item Margin | `space-2` between items |
| **Ordered List** | |
| - Margin Left | `space-6` |
| - List Style | Decimal |
| - Item Margin | `space-2` between items |

### Variations

**None** - Single variant.

---

## Blockquote

Pull quote or callout block for highlighting important quotes.

### Structure
```
┌─────────────────────────────────────────────┐
│ ▌                                           │
│ ▌  "Quote text goes here in larger,         │
│ ▌   italicized typography."                 │
│ ▌                                           │
│ ▌   — Attribution Name                      │
└─────────────────────────────────────────────┘
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 680px |
| Margin | `space-10` auto (40px vertical, centered) |
| Padding | `space-6` vertical, `space-8` horizontal |
| Border Left | 4px solid `primary-500` |
| Background | `neutral-50` |
| Border Radius | 0 `radius-lg` `radius-lg` 0 |

| Element | Specifications |
|---------|----------------|
| **Quote Text** | |
| - Font | `text-2xl` (24px), `font-medium`, italic |
| - Color | `neutral-800` |
| - Line Height | 1.5 |
| - Quotes | Curly quotes added via CSS or content |
| **Attribution** | |
| - Font | `text-sm`, `font-medium` |
| - Color | `neutral-500` |
| - Margin Top | `space-4` |
| - Prefix | Em dash (—) |

### Variations

| Variant | Changes |
|---------|---------|
| **Default** | As specified above |
| **Large** | `text-3xl` quote text, `space-12` vertical margin |
| **Centered** | No left border, centered text, `primary-500` decorative quote marks above |

---

## ImageBlock

Image display block with optional caption.

### Structure
```
┌─────────────────────────────────────────────┐
│                                             │
│                                             │
│              IMAGE AREA                     │
│              (responsive)                   │
│                                             │
│                                             │
└─────────────────────────────────────────────┘
              Caption text here
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 680px (default), 900px (wide), 100% (full) |
| Margin | `space-10` auto (40px vertical, centered) |

| Element | Specifications |
|---------|----------------|
| **Image Container** | |
| - Border Radius | `radius-lg` |
| - Overflow | Hidden |
| - Background | `neutral-200` (placeholder) |
| **Image** | |
| - Width | 100% |
| - Height | Auto |
| - Object Fit | Cover |
| **Caption** | |
| - Font | `text-sm`, `font-normal` |
| - Color | `neutral-500` |
| - Text Align | Center |
| - Margin Top | `space-3` |

### Variations

| Variant | Max Width | Description |
|---------|-----------|-------------|
| **Default** | 680px | Standard content width |
| **Wide** | 900px | Breaks out of content column |
| **Full** | 100% | Full bleed (viewport width) |

---

## CodeBlock

Syntax-highlighted code display block.

### Structure
```
┌─────────────────────────────────────────────┐
│  JavaScript                        [Copy]   │
├─────────────────────────────────────────────┤
│  1  │ const greeting = "Hello Summit";      │
│  2  │ console.log(greeting);                │
│  3  │                                       │
└─────────────────────────────────────────────┘
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 680px (default), 900px (wide) |
| Margin | `space-10` auto |
| Background | `neutral-900` |
| Border Radius | `radius-lg` |
| Overflow | Hidden |

| Element | Specifications |
|---------|----------------|
| **Header Bar** | |
| - Background | `neutral-800` |
| - Padding | `space-3` horizontal, `space-2` vertical |
| - Display | Flex, space-between |
| - Language Label | `text-xs`, `font-medium`, `neutral-400`, uppercase |
| - Copy Button | `text-xs`, `font-medium`, `neutral-400`, hover `neutral-200` |
| **Code Area** | |
| - Padding | `space-4` |
| - Font | `font-mono`, `text-sm` |
| - Color | `neutral-100` |
| - Line Height | 1.6 |
| - Overflow X | Auto (horizontal scroll) |
| **Line Numbers** | |
| - Color | `neutral-600` |
| - Padding Right | `space-4` |
| - Border Right | 1px solid `neutral-700` |
| - Margin Right | `space-4` |
| - User Select | None |

### Syntax Highlighting Colors

| Token Type | Color |
|------------|-------|
| Keyword | `#f472b6` (pink) |
| String | `#a5f3a6` (green) |
| Number | `#fdba74` (orange) |
| Comment | `#6b7280` (gray) |
| Function | `#93c5fd` (blue) |
| Variable | `#fef3c7` (cream) |

### Variations

| Variant | Changes |
|---------|---------|
| **Default** | Line numbers shown, 680px max width |
| **Wide** | 900px max width |
| **No Line Numbers** | Line numbers hidden |
| **Inline** | No block wrapper, inline `font-mono` with `neutral-100` bg |

---

## VideoEmbed

Embedded video player block.

### Structure
```
┌─────────────────────────────────────────────┐
│                                             │
│                 ▶ PLAY                      │
│              VIDEO AREA                     │
│              (16:9 ratio)                   │
│                                             │
└─────────────────────────────────────────────┘
              Caption text here
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 680px (default), 900px (wide), 100% (full) |
| Margin | `space-10` auto |

| Element | Specifications |
|---------|----------------|
| **Video Container** | |
| - Aspect Ratio | 16:9 (padding-top: 56.25%) |
| - Border Radius | `radius-lg` |
| - Overflow | Hidden |
| - Background | `neutral-900` |
| **Play Button Overlay** (if thumbnail) | |
| - Size | 80px circle |
| - Background | `primary-500` at 90% opacity |
| - Icon | White play triangle |
| - Hover | Scale 1.1, full opacity |
| **Caption** | |
| - Same as ImageBlock caption |

### Variations

| Variant | Max Width |
|---------|-----------|
| **Default** | 680px |
| **Wide** | 900px |
| **Full** | 100% |

---

## Callout

Alert/callout box for tips, warnings, notes, and important information.

### Structure
```
┌─────────────────────────────────────────────┐
│  ℹ  TIP                                     │
│                                             │
│  Callout content text goes here. Can        │
│  contain multiple lines of information.     │
└─────────────────────────────────────────────┘
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 680px |
| Margin | `space-8` auto |
| Padding | `space-5` |
| Border Radius | `radius-lg` |
| Border Left | 4px solid (color varies by type) |

| Element | Specifications |
|---------|----------------|
| **Header Row** | |
| - Display | Flex, `space-2` gap, align center |
| - Margin Bottom | `space-2` |
| **Icon** | |
| - Size | 20px |
| - Color | Matches type color |
| **Label** | |
| - Font | `text-sm`, `font-semibold`, uppercase |
| - Letter Spacing | `tracking-wide` |
| - Color | Matches type color |
| **Content** | |
| - Font | `text-base`, `font-normal` |
| - Color | `neutral-700` |
| - Line Height | 1.6 |

### Variations

| Variant | Border Color | Background | Icon |
|---------|--------------|------------|------|
| **Tip** | `info` (#3b82f6) | `info` at 5% | Lightbulb |
| **Note** | `neutral-400` | `neutral-50` | Info circle |
| **Warning** | `warning` (#f59e0b) | `warning` at 5% | Warning triangle |
| **Danger** | `error` (#ef4444) | `error` at 5% | X circle |
| **Success** | `success` (#10b981) | `success` at 5% | Check circle |

---

## Table

Data table block for structured information.

### Structure
```
┌─────────────────────────────────────────────┐
│  Header 1    │  Header 2    │  Header 3    │
├─────────────────────────────────────────────┤
│  Cell 1      │  Cell 2      │  Cell 3      │
├─────────────────────────────────────────────┤
│  Cell 1      │  Cell 2      │  Cell 3      │
└─────────────────────────────────────────────┘
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 680px (default), 900px (wide) |
| Margin | `space-10` auto |
| Border | 1px solid `neutral-200` |
| Border Radius | `radius-lg` |
| Overflow | Hidden (for border radius), auto-x (for scroll) |

| Element | Specifications |
|---------|----------------|
| **Table** | |
| - Width | 100% |
| - Border Collapse | Collapse |
| **Header Row** | |
| - Background | `neutral-50` |
| **Header Cell** | |
| - Font | `text-sm`, `font-semibold` |
| - Color | `neutral-700` |
| - Padding | `space-3` vertical, `space-4` horizontal |
| - Text Align | Left |
| - Border Bottom | 1px solid `neutral-200` |
| **Body Row** | |
| - Border Bottom | 1px solid `neutral-100` |
| - Last Row | No border |
| **Body Row Hover** | |
| - Background | `neutral-50` |
| **Body Cell** | |
| - Font | `text-sm`, `font-normal` |
| - Color | `neutral-600` |
| - Padding | `space-3` vertical, `space-4` horizontal |

### Variations

| Variant | Changes |
|---------|---------|
| **Default** | As specified |
| **Striped** | Alternating row backgrounds (`neutral-0` / `neutral-50`) |
| **Compact** | Smaller padding (`space-2` vertical) |
| **Wide** | 900px max width |

---

## StatsHighlight

Metrics/statistics display block for showcasing key numbers.

### Structure
```
┌─────────────────────────────────────────────┐
│                                             │
│    99%          50M+         10x            │
│  Uptime       Users       Faster            │
│                                             │
└─────────────────────────────────────────────┘
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 900px |
| Margin | `space-12` auto |
| Padding | `space-10` |
| Background | `neutral-900` |
| Border Radius | `radius-xl` |

| Element | Specifications |
|---------|----------------|
| **Grid** | |
| - Display | Grid |
| - Columns | Auto-fit, min 150px |
| - Gap | `space-8` |
| - Text Align | Center |
| **Stat Value** | |
| - Font | `text-5xl` (48px), `font-bold` |
| - Color | `neutral-0` |
| - Letter Spacing | `tracking-tight` |
| **Stat Label** | |
| - Font | `text-sm`, `font-medium` |
| - Color | `neutral-400` |
| - Margin Top | `space-2` |
| - Text Transform | Uppercase (optional) |

### Variations

| Variant | Changes |
|---------|---------|
| **Dark** (default) | `neutral-900` background, white text |
| **Light** | `neutral-50` background, `neutral-900` values |
| **Brand** | `primary-500` background, white text |
| **With Icons** | Icon above each stat value |

---

## CTABanner

Call-to-action banner block for driving conversions.

### Structure
```
┌─────────────────────────────────────────────┐
│                                             │
│         Ready to Get Started?               │
│                                             │
│  Join thousands of developers building      │
│  with Edge Delivery Services.               │
│                                             │
│         [ Get Started Free ]                │
│                                             │
└─────────────────────────────────────────────┘
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 900px |
| Margin | `space-16` auto |
| Padding | `space-12` vertical, `space-8` horizontal |
| Background | Gradient `primary-500` to `primary-700` (135deg) |
| Border Radius | `radius-xl` |
| Text Align | Center |

| Element | Specifications |
|---------|----------------|
| **Heading** | |
| - Font | `text-3xl` (30px), `font-bold` |
| - Color | `neutral-0` |
| - Margin Bottom | `space-4` |
| **Description** | |
| - Font | `text-lg`, `font-normal` |
| - Color | `neutral-0` at 80% opacity |
| - Max Width | 500px, centered |
| - Margin Bottom | `space-6` |
| **Button** | |
| - Background | `neutral-0` |
| - Color | `primary-600` |
| - Font | `text-base`, `font-semibold` |
| - Padding | `space-3` vertical, `space-6` horizontal |
| - Border Radius | `radius-lg` |
| - Hover | Scale 1.02, shadow-lg |

### Variations

| Variant | Background | Text Color | Button |
|---------|------------|------------|--------|
| **Brand** (default) | Gradient `primary-500` → `primary-700` | White | White bg, `primary-600` text |
| **Dark** | `neutral-900` | White | `primary-500` bg, white text |
| **Light** | `neutral-100` | `neutral-900` | `primary-500` bg, white text |

---

## TableOfContents

Navigation block listing article sections (simplified listing style).

### Structure
```
┌─────────────────────────────────────────────┐
│  TABLE OF CONTENTS                          │
├─────────────────────────────────────────────┤
│  01  Introduction                           │
│  02  Getting Started                        │
│  03  Core Concepts                          │
│  04  Advanced Techniques                    │
│  05  Conclusion                             │
└─────────────────────────────────────────────┘
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 680px |
| Margin | `space-8` auto |
| Border | 1px solid `neutral-200` |
| Border Radius | `radius-lg` |
| Overflow | Hidden |

| Element | Specifications |
|---------|----------------|
| **Header** | |
| - Background | `neutral-50` |
| - Padding | `space-3` vertical, `space-4` horizontal |
| - Font | `text-xs`, `font-semibold`, uppercase |
| - Letter Spacing | `tracking-wider` |
| - Color | `neutral-500` |
| - Border Bottom | 1px solid `neutral-200` |
| **List** | |
| - List Style | None |
| - Padding | 0 |
| - Margin | 0 |
| **List Item** | |
| - Padding | `space-3` vertical, `space-4` horizontal |
| - Border Bottom | 1px solid `neutral-100` |
| - Last Item | No border |
| - Display | Flex, `space-3` gap |
| - Cursor | Pointer |
| - Hover Background | `neutral-50` |
| **Item Number** | |
| - Font | `text-sm`, `font-medium` |
| - Color | `neutral-400` |
| - Min Width | 24px |
| **Item Title** | |
| - Font | `text-sm`, `font-medium` |
| - Color | `neutral-700` |
| - Hover Color | `primary-500` |

### Variations

**None** - Single simplified variant.

---

## RelatedPosts

Related articles section displayed at article end.

### Structure
```
  RELATED POSTS
  
┌─────────┐ ┌─────────┐ ┌─────────┐
│  Card   │ │  Card   │ │  Card   │
│   1     │ │   2     │ │   3     │
└─────────┘ └─────────┘ └─────────┘
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 100% (full width) |
| Margin | `space-16` 0 |
| Padding | `space-12` vertical, `space-8` horizontal |
| Background | `neutral-50` |

| Element | Specifications |
|---------|----------------|
| **Section Label** | |
| - Font | `text-xs`, `font-semibold`, uppercase |
| - Letter Spacing | `tracking-wider` |
| - Color | `neutral-500` |
| - Margin Bottom | `space-6` |
| **Grid** | |
| - Display | Grid |
| - Columns | 3 columns |
| - Gap | `space-6` |
| **Cards** | |
| - Use BlogCard component (compact variant if available) |

### Variations

| Variant | Columns |
|---------|---------|
| **Default** | 3 columns |
| **Compact** | 2 columns, smaller cards |

---

## AuthorCard

Author bio block displayed at article end.

### Structure
```
┌─────────────────────────────────────────────┐
│  ┌────┐                                     │
│  │    │  WRITTEN BY                         │
│  │ Av │  Author Name                        │
│  │    │  Role / Title                       │
│  └────┘                                     │
│                                             │
│  Bio text goes here describing the author   │
│  and their background...                    │
└─────────────────────────────────────────────┘
```

### Specifications

| Property | Value |
|----------|-------|
| Max Width | 680px |
| Margin | `space-16` auto 0 |
| Padding | `space-6` |
| Background | `neutral-50` |
| Border Radius | `radius-xl` |
| Display | Flex |
| Gap | `space-5` |

| Element | Specifications |
|---------|----------------|
| **Avatar** | |
| - Size | 72px |
| - Border Radius | 50% (circle) |
| - Background | `neutral-300` (placeholder) |
| - Flex Shrink | 0 |
| **Label** | |
| - Font | `text-xs`, `font-semibold`, uppercase |
| - Letter Spacing | `tracking-wider` |
| - Color | `primary-500` |
| - Margin Bottom | `space-1` |
| **Name** | |
| - Font | `text-xl` (20px), `font-bold` |
| - Color | `neutral-900` |
| - Margin Bottom | `space-1` |
| **Role** | |
| - Font | `text-sm`, `font-normal` |
| - Color | `neutral-500` |
| - Margin Bottom | `space-3` |
| **Bio** | |
| - Font | `text-sm`, `font-normal` |
| - Color | `neutral-600` |
| - Line Height | 1.6 |

### Variations

| Variant | Changes |
|---------|---------|
| **Default** | Horizontal layout as specified |
| **Centered** | Vertical stack, centered text, larger avatar (96px) |
| **With Social** | Social media icon links below bio |

---

# Implementation Notes for AI Agents

## File Structure Recommendation

```
/design-system/
├── tokens/
│   ├── colors.css
│   ├── typography.css
│   ├── spacing.css
│   └── index.css
├── components/
│   ├── listing/
│   │   ├── FeaturedPost.css
│   │   ├── BlogCard.css
│   │   └── BlogGrid.css
│   └── blocks/
│       ├── ArticleHeader.css
│       ├── Prose.css
│       ├── Blockquote.css
│       ├── ImageBlock.css
│       ├── CodeBlock.css
│       ├── VideoEmbed.css
│       ├── Callout.css
│       ├── Table.css
│       ├── StatsHighlight.css
│       ├── CTABanner.css
│       ├── TableOfContents.css
│       ├── RelatedPosts.css
│       └── AuthorCard.css
└── index.css
```

## CSS Custom Properties Setup

```css
:root {
  /* Colors - Primary */
  --color-primary-50: #fef2f2;
  --color-primary-100: #fee2e2;
  --color-primary-200: #fecaca;
  --color-primary-300: #fca5a5;
  --color-primary-400: #f87171;
  --color-primary-500: #ED2224;
  --color-primary-600: #dc2626;
  --color-primary-700: #b91c1c;
  --color-primary-800: #991b1b;
  --color-primary-900: #7f1d1d;
  
  /* Colors - Neutral */
  --color-neutral-0: #ffffff;
  --color-neutral-50: #fafafa;
  --color-neutral-100: #f5f5f5;
  --color-neutral-200: #e5e5e5;
  --color-neutral-300: #d4d4d4;
  --color-neutral-400: #a3a3a3;
  --color-neutral-500: #737373;
  --color-neutral-600: #525252;
  --color-neutral-700: #404040;
  --color-neutral-800: #2D2E2D;
  --color-neutral-900: #171717;
  --color-neutral-950: #0a0a0a;
  
  /* Colors - Semantic */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  
  /* Typography */
  --font-sans: "Adobe Clean", system-ui, -apple-system, sans-serif;
  --font-mono: "Adobe Clean Mono", ui-monospace, monospace;
  
  /* Font Sizes */
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 30px;
  --text-4xl: 36px;
  --text-5xl: 48px;
  --text-6xl: 60px;
  
  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  
  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
  
  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  
  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;
  --transition-slow: 300ms ease;
}
```

## Key Implementation Guidelines

1. **Use CSS Custom Properties** - All values should reference tokens, not hardcoded values
2. **Mobile-First** - Start with mobile styles, add breakpoints for larger screens
3. **Semantic HTML** - Use proper elements (`<article>`, `<figure>`, `<blockquote>`, etc.)
4. **Accessibility** - Ensure proper contrast ratios, focus states, and ARIA labels
5. **Performance** - Lazy load images, use modern image formats (WebP, AVIF)

---

**End of Design System Specification**
