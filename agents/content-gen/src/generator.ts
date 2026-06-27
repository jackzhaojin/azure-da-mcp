/**
 * Content generation — template tier. The Claude Agent SDK backend (PRD part-4,
 * M3) replaces the bodies of these two functions behind the same signatures;
 * the structured shapes below ARE the contract artifacts, so swapping the
 * generator never touches the A2A surface. Template output is deterministic per
 * topic — useful for pipeline tests and $0.
 */

/**
 * Rich, typed feature blocks — the lever for *compelling* pages (ported from the
 * v1.0 blog-static-site-generator's block model). A section can carry one beyond
 * its prose: a stat strip, a pull quote, a callout, a comparison table, or a CTA.
 * This is what gives the synthetic source real semantic variety — so it reads
 * like a genuine article AND the migration has distinct EDS blocks to map to.
 */
export type FeatureBlock =
  | { kind: "stats"; items: Array<{ value: string; label: string }> }
  | { kind: "callout"; variant?: "tip" | "warning" | "note"; title?: string; text: string }
  | { kind: "quote"; quote: string; attribution?: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "cta"; title: string; text: string; buttonText: string; buttonUrl: string };

export interface Brief {
  title: string;
  pageType: string;
  audience: string;
  intent: string;
  /** One-line hook under the title — the dek/standfirst. Optional (template tier omits it). */
  dek?: string;
  /** Byline metadata — author + ISO date + tags. Renders a realistic article header. */
  author?: string;
  date?: string;
  tags?: string[];
  outline: Array<{ heading: string; summary: string; targetBlock: string }>;
  /**
   * Body copy per section, aligned 1:1 with `outline`. `text` may hold multiple
   * paragraphs (split on blank lines). `feature` is an optional rich block
   * rendered after the prose (stats / quote / callout / table / cta).
   */
  copyBlocks: Array<{ block: string; text: string; feature?: FeatureBlock }>;
  imageDirections: Array<{ description: string; alt: string }>;
  /** In-body links. Optional — when absent, synthesizeSource falls back to two generic example links. */
  links?: Array<{ href: string; text: string }>;
  generator: "template" | "agent-sdk";
}

export interface SyntheticSource {
  html: string;
  groundTruth: {
    title: string;
    headings: string[];
    links: Array<{ href: string; text: string }>;
    imageAlts: string[];
    bodyText: string;
  };
  legacyStyle: string;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Topic ideation (content.ideate) ─────────────────────────────────────────
// The agent-led front door: the mesh picks what to write about today, instead of
// a human typing a topic. Template tier on purpose — deterministic, $0, no creds,
// no network in the critical path (the daily scheduled loop must not flake on an
// RSS/LLM dependency). Same swap-the-body contract as generateBrief: a future
// LLM / web-pull / site-grounded picker replaces ideateTopic() behind this shape.

export interface IdeatedTopic {
  topic: string;
  lane: string;
  rationale: string;
  seed: string;
}

/** Editorial lanes: allowed subjects × angles the agent composes within (C7 seam). */
const TOPIC_LANES: Record<string, { label: string; subjects: string[]; angles: string[] }> = {
  // The adaptTo() demo site: a first-person backcountry "Wilderness Journal".
  "wilderness-journal": {
    label: "wilderness & backcountry journal",
    subjects: [
      "a solo High Sierra trek",
      "an alpine lake circuit",
      "testing ultralight shelters in the field",
      "a Cascades ridge traverse",
      "reading mountain weather windows",
      "Leave-No-Trace camping",
      "desert canyon route-finding",
      "winter layering systems",
      "backcountry water sourcing",
      "a fall larch-season loop",
      "navigating without GPS",
      "first-light summit pushes",
      "a long approach to a granite basin",
      "trail food that actually keeps you moving",
    ],
    angles: [
      "Field notes from",
      "A trail guide to",
      "Gear tested on",
      "Lessons from",
      "What the map doesn't tell you about",
      "A slow morning on",
      "Chasing light on",
    ],
  },
  "postal-logistics": {
    label: "postal, shipping & logistics",
    subjects: [
      "international parcel customs declarations",
      "last-mile delivery route optimization",
      "cold-chain shipping for perishable goods",
      "package tracking and proof of delivery",
      "dimensional weight pricing",
      "returns and reverse logistics",
      "hazardous materials shipping compliance",
      "postal address validation and standardization",
      "cross-border e-commerce fulfillment",
      "parcel locker and pickup-point networks",
      "shipping insurance and liability claims",
      "bulk mail and direct-mail campaigns",
      "warehouse slotting and pick-pack efficiency",
      "carrier rate shopping and negotiation",
      "sustainable and carbon-neutral shipping",
      "duties, taxes, and landed-cost calculation",
    ],
    angles: [
      "A practical guide to",
      "Common mistakes to avoid in",
      "How small businesses can master",
      "What every shipper should know about",
      "Cost-saving strategies for",
      "The complete checklist for",
      "Trends reshaping",
      "Comparing your options for",
    ],
  },
};

const DEFAULT_LANE = "postal-logistics";

/**
 * Real wilderness photo pool (stable Unsplash IDs proven on the adapt-to-2026-demo
 * site). Replaces picsum placeholders — "the header image is the whole vibe", so a
 * generated article needs a real, prominent scenic photo the migrator maps into the
 * EDS hero. All landscapes (no portraits); the AEM pipeline re-serves any public
 * <img src> optimized, so these URLs work directly. Deterministic per (seed,index)
 * so a given article always renders the same images.
 */
const WILDERNESS_IMAGE_IDS = [
  "photo-1506905925346-21bda4d32df4", // Sierra sunset / alpine lake
  "photo-1454496522488-7a8e488e8606", // misty emerald peaks
  "photo-1441974231531-c6227db76b6e", // forest fern trail
  "photo-1551632811-561732d1e306", // hiker on a ridge
  "photo-1469474968028-56623f02e42e", // red desert mesa
  "photo-1432405972618-c60b0225b8f9", // waterfall canyon
  "photo-1504280390367-361c6d9f38f4", // tent at dusk
];

/** A deterministic real photo URL for a given seed + index (hero uses w=1600, others w=1200). */
function sceneryImageUrl(seed: string, index: number, width: number): string {
  const id = WILDERNESS_IMAGE_IDS[(fnv1a(seed) + index) % WILDERNESS_IMAGE_IDS.length];
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;
}

/** Deterministic 32-bit FNV-1a — stable topic selection from a seed (no RNG). */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Pick today's topic. Deterministic per (lane, seed) — the seed defaults to the
 * UTC calendar day, so each day yields a different, reproducible topic; tests
 * pin the seed. Unknown lanes fall back to the default lane (never throws).
 */
export function ideateTopic(opts: { lane?: string; seed?: string } = {}): IdeatedTopic {
  const laneKey = opts.lane && TOPIC_LANES[opts.lane] ? opts.lane : DEFAULT_LANE;
  const lane = TOPIC_LANES[laneKey];
  const seed = (opts.seed ?? new Date().toISOString().slice(0, 10)).trim();
  const h = fnv1a(`${laneKey}::${seed}`);
  const subject = lane.subjects[h % lane.subjects.length];
  const angle = lane.angles[Math.floor(h / lane.subjects.length) % lane.angles.length];
  const topic = `${angle} ${subject}`;
  return {
    topic,
    lane: laneKey,
    rationale: `Agent-picked ${lane.label} topic for ${seed}: "${angle}" × "${subject}".`,
    seed,
  };
}

export function generateBrief(opts: {
  topic: string;
  pageType?: string;
  siteBrief?: string;
  constraints?: { wordCount?: number; imageCount?: number };
}): Brief {
  const pageType = opts.pageType ?? "article";
  const title = titleCase(opts.topic);
  const sections: Array<[string, string, string]> =
    pageType === "landing"
      ? [
          [`Why ${title}?`, "value proposition and hook", "hero"],
          ["Key Benefits", "three benefit teasers", "cards"],
          ["How It Works", "step-by-step explanation", "columns"],
          ["Get Started", "call to action", "cta"],
        ]
      : [
          [`Introduction to ${title}`, "context and why it matters", "hero"],
          [`Understanding ${title}`, "core concepts explained", "default-content"],
          ["Comparison at a Glance", "options side by side", "table"],
          ["Practical Checklist", "actionable next steps", "cards"],
        ];

  // Deterministic, topic-substituted prose. NOT lorem — coherent sentences so the
  // $0 / no-creds fallback still produces a readable page. The agentic backend
  // (agentic.ts) replaces this with genuinely compelling, specific writing.
  const sectionCopy = (summary: string): string => {
    const t = opts.topic;
    return [
      `When it comes to ${t}, the difference between a good outcome and an expensive one usually comes down to a few decisions made early. This section covers ${summary}, and why getting it right matters more than most people expect.`,
      `The fundamentals are straightforward once you see them laid out. Start by understanding what ${t} actually requires, then work backward from the result you want. Most missteps trace back to skipping that first step.`,
      `Treat the points below as a working baseline. They apply whether you are just getting started with ${t} or refining a process you already run, and each one compounds: small, consistent choices add up to a meaningfully better result.`,
    ].join("\n\n");
  };

  return {
    title,
    pageType,
    audience: opts.siteBrief ? `Readers of: ${opts.siteBrief}` : `People researching ${opts.topic}`,
    intent: `Help the reader make a confident decision about ${opts.topic}.`,
    dek: `A practical, no-fluff guide to ${opts.topic} — what matters, what to skip, and how to get it right.`,
    author: "The Editorial Team",
    date: new Date().toISOString().slice(0, 10),
    tags: [pageType, opts.topic.split(/\s+/).slice(0, 2).join("-").toLowerCase()],
    outline: sections.map(([heading, summary, targetBlock]) => ({ heading, summary, targetBlock })),
    // Deterministic feature variety so even the $0 fallback isn't flat prose:
    // a stat strip mid-article and a CTA at the end.
    copyBlocks: sections.map(([heading, summary], i) => ({
      block: heading,
      text: sectionCopy(summary),
      ...(i === 1
        ? {
            feature: {
              kind: "stats" as const,
              items: [
                { value: "3×", label: `faster results with ${opts.topic}` },
                { value: "80%", label: "of mistakes are avoidable" },
                { value: "1", label: "decision that matters most" },
              ],
            },
          }
        : i === sections.length - 1
          ? {
              feature: {
                kind: "cta" as const,
                title: `Put this ${opts.topic} guide to work`,
                text: `Start with the checklist above and revisit it as your needs grow.`,
                buttonText: "Get started",
                buttonUrl: "https://example.com/get-started",
              },
            }
          : {}),
    })),
    imageDirections: Array.from({ length: opts.constraints?.imageCount ?? 2 }, (_, i) => ({
      description: `Illustration ${i + 1} for ${opts.topic}`,
      alt: `${title} illustration ${i + 1}`,
    })),
    generator: "template",
  };
}

/** Split a copy block into paragraphs (blank-line separated), trimmed + non-empty. */
function paras(text: string): string[] {
  const out = (text ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return out.length ? out : [(text ?? "").replace(/\s+/g, " ").trim()].filter(Boolean);
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return (s ?? "").replace(/[&<>"']/g, (m) => map[m]);
}

/** Plain-text content of a feature block — folded into groundTruth.bodyText so eval fidelity stays truthful. */
function featureText(f: FeatureBlock): string {
  switch (f.kind) {
    case "stats":
      return f.items.map((s) => `${s.value} ${s.label}`).join(". ");
    case "callout":
      return `${f.title ?? ""} ${f.text}`.trim();
    case "quote":
      return `${f.quote}${f.attribution ? ` — ${f.attribution}` : ""}`;
    case "table":
      return [f.headers.join(" "), ...f.rows.map((r) => r.join(" "))].join(". ");
    case "cta":
      return `${f.title} ${f.text} ${f.buttonText}`.trim();
  }
}

/** Links a feature contributes (only the CTA button) — kept in groundTruth.links. */
function featureLinks(f: FeatureBlock): Array<{ href: string; text: string }> {
  return f.kind === "cta" ? [{ href: f.buttonUrl, text: f.buttonText }] : [];
}

/**
 * Render a feature block as legacy-flavoured HTML. The *content* (numbers, quote,
 * table cells, CTA link) is always present so migration has real semantic blocks
 * to map to EDS (cards/columns/quote/table/cta); the chrome adapts to the style.
 */
function renderFeature(f: FeatureBlock, style: "clean" | "dated" | "messy"): string {
  const e = escapeHtml;
  switch (f.kind) {
    case "stats": {
      if (style === "dated")
        return `<table border="1" cellpadding="6"><tr>${f.items
          .map((s) => `<td align="center"><font size="5"><b>${e(s.value)}</b></font><br><font size="2">${e(s.label)}</font></td>`)
          .join("")}</tr></table>`;
      if (style === "messy")
        return `<div style="display:flex;gap:10px;margin:12px 0">${f.items
          .map(
            (s) =>
              `<div style="border:1px solid #ccc;padding:8px;text-align:center"><div style="font-size:24px;font-weight:bold">${e(s.value)}</div><div style="font-size:11px;color:#777">${e(s.label)}</div></div>`
          )
          .join("")}</div>`;
      return `<dl class="stats">${f.items.map((s) => `<div><dt>${e(s.value)}</dt><dd>${e(s.label)}</dd></div>`).join("")}</dl>`;
    }
    case "callout": {
      const title = f.title ? e(f.title) : "Note";
      if (style === "dated")
        return `<table width="100%" bgcolor="#fff8dc" border="0" cellpadding="8"><tr><td><font size="3"><b>${title}</b></font><br>${e(f.text)}</td></tr></table>`;
      if (style === "messy")
        return `<div style="background:#fff8dc;border-left:4px solid #e0a800;padding:10px;margin:10px 0"><b>${title}</b><br>${e(f.text)}</div>`;
      return `<aside class="callout callout--${f.variant ?? "note"}"><strong>${title}</strong><p>${e(f.text)}</p></aside>`;
    }
    case "quote": {
      const cite = f.attribution ? e(f.attribution) : "";
      if (style === "dated")
        return `<table width="90%" align="center"><tr><td><font size="4"><i>&ldquo;${e(f.quote)}&rdquo;</i></font>${cite ? `<br>&mdash; ${cite}` : ""}</td></tr></table>`;
      if (style === "messy")
        return `<div style="border-left:3px solid #999;padding-left:12px;font-style:italic;color:#444;margin:12px 0">&ldquo;${e(f.quote)}&rdquo;${cite ? `<br><span style="font-size:11px">&mdash; ${cite}</span>` : ""}</div>`;
      return `<blockquote><p>${e(f.quote)}</p>${cite ? `<cite>${cite}</cite>` : ""}</blockquote>`;
    }
    case "table": {
      const border = style === "clean" ? 0 : 1;
      const thead = `<tr>${f.headers.map((h) => `<th>${e(h)}</th>`).join("")}</tr>`;
      const tbody = f.rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join("")}</tr>`).join("");
      return `<table border="${border}" cellpadding="6"${style === "messy" ? ' style="border-collapse:collapse;margin:12px 0"' : ""}><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
    }
    case "cta": {
      const t = e(f.title), x = e(f.text), b = e(f.buttonText);
      if (style === "dated")
        return `<table width="100%" bgcolor="#eef" border="0" cellpadding="10"><tr><td align="center"><font size="4"><b>${t}</b></font><br>${x}<br><a href="${f.buttonUrl}"><b>[ ${b} ]</b></a></td></tr></table>`;
      if (style === "messy")
        return `<div style="background:#eef;padding:14px;text-align:center;margin:12px 0"><b>${t}</b><br>${x}<br><a href="${f.buttonUrl}" style="display:inline-block;margin-top:6px;background:#36c;color:#fff;padding:6px 14px;text-decoration:none">${b}</a></div>`;
      return `<div class="cta"><h3>${t}</h3><p>${x}</p><a class="button" href="${f.buttonUrl}">${b}</a></div>`;
    }
  }
}

/**
 * Renders a brief into standalone legacy-style HTML with KNOWN ground truth.
 *
 * The legacy *styling* is deliberately dated (table/`<font>`) or messy (floats +
 * inline styles) so the migration agent has real cruft to clean up — but the
 * *copy* it carries is whatever the brief holds. An agentic brief therefore
 * produces a genuinely substantive article wearing legacy chrome; the template
 * tier produces a thinner deterministic stand-in. Body copy is rendered
 * paragraph-by-paragraph so multi-paragraph narrative reads as prose.
 */
export function synthesizeSource(brief: Brief, legacyStyle: "clean" | "dated" | "messy"): SyntheticSource {
  const headings = brief.outline.map((s) => s.heading);
  const links =
    brief.links && brief.links.length
      ? brief.links
      : [
          { href: "https://example.com/about", text: "About us" },
          { href: "https://example.com/contact", text: "Contact" },
        ];
  const imageAlts = brief.imageDirections.map((d) => d.alt);
  const sectionParas = brief.copyBlocks.map((c) => paras(c.text));
  const features = brief.copyBlocks.map((c) => c.feature);

  // CTA buttons add real links — fold them into the truthful groundTruth.
  const featureLinkList = features.filter((f): f is FeatureBlock => !!f).flatMap(featureLinks);
  const allLinks = [...links, ...featureLinkList];

  // Section 0 is the hero — give it the largest, scenic image; others a card width.
  const img = (alt: string, i: number) =>
    `<img src="${sceneryImageUrl(alt, i, i === 0 ? 1600 : 1200)}" alt="${alt}" ${
      legacyStyle === "messy" ? `style="float:${i % 2 ? "left" : "right"};margin:5px" width="320"` : ""
    }/>`;
  const feat = (i: number) => (features[i] ? renderFeature(features[i]!, legacyStyle) : "");

  const dek = brief.dek?.trim();

  let body: string;
  if (legacyStyle === "clean") {
    body = brief.outline
      .map(
        (s, i) =>
          `<section><h2>${s.heading}</h2>${(sectionParas[i] ?? []).map((p) => `<p>${p}</p>`).join("")}${feat(i)}${
            imageAlts[i] ? img(imageAlts[i], i) : ""
          }</section>`
      )
      .join("\n");
  } else if (legacyStyle === "dated") {
    body = `<table width="100%" border="0" cellpadding="8"><tr><td>${brief.outline
      .map(
        (s, i) =>
          `<font size="4"><b>${s.heading}</b></font><br>${(sectionParas[i] ?? [])
            .map((p) => p)
            .join("<br><br>")}<br>${feat(i)}${imageAlts[i] ? img(imageAlts[i], i) : ""}<br><br>`
      )
      .join("")}</td><td width="200" bgcolor="#eeeeee">${links
      .map((l) => `<a href="${l.href}">${l.text}</a><br>`)
      .join("")}</td></tr></table>`;
  } else {
    body = brief.outline
      .map(
        (s, i) =>
          `<div style="font-size:19px;font-weight:bold;color:#333;margin-top:22px">${s.heading}</div>` +
          (sectionParas[i] ?? [])
            .map((p) => `<div style="font-family:Verdana;font-size:13px;line-height:1.3">${p}</div>`)
            .join("") +
          feat(i) +
          (imageAlts[i] ? img(imageAlts[i], i) : "")
      )
      .join("<br clear=\"all\">");
  }

  const nav = legacyStyle === "dated" ? "" : `<div>${links.map((l) => `<a href="${l.href}">${l.text}</a>`).join(" | ")}</div>`;
  const dekHtml = dek ? `\n<p${legacyStyle === "messy" ? ' style="font-size:15px;color:#666;font-style:italic"' : ""}><i>${dek}</i></p>` : "";
  // Byline: realistic article header (author · date · tags) when the brief carries it.
  const bylineBits = [
    brief.author ? `By ${escapeHtml(brief.author)}` : "",
    brief.date ? escapeHtml(brief.date) : "",
    brief.tags && brief.tags.length ? brief.tags.map((t) => `#${escapeHtml(t)}`).join(" ") : "",
  ].filter(Boolean);
  const bylineHtml = bylineBits.length
    ? `\n<p${legacyStyle === "dated" ? "" : ' style="font-size:12px;color:#888"'}>${
        legacyStyle === "dated" ? `<font size="2" color="#888">${bylineBits.join(" &middot; ")}</font>` : bylineBits.join(" &middot; ")
      }</p>`
    : "";
  const html = `<!DOCTYPE html>
<html>
<head><title>${brief.title}</title><meta charset="utf-8"></head>
<body${legacyStyle === "messy" ? ' bgcolor="#fafafa"' : ""}>
<h1>${brief.title}</h1>${dekHtml}${bylineHtml}
${nav}
${body}
</body>
</html>`;

  const featureBodyText = features.filter((f): f is FeatureBlock => !!f).map(featureText).join(" ");
  return {
    html,
    groundTruth: {
      title: brief.title,
      headings,
      links: allLinks,
      imageAlts,
      bodyText: [brief.copyBlocks.map((c) => c.text).join(" "), featureBodyText].filter(Boolean).join(" "),
    },
    legacyStyle,
  };
}
