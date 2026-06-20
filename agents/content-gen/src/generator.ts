/**
 * Content generation — template tier. The Claude Agent SDK backend (PRD part-4,
 * M3) replaces the bodies of these two functions behind the same signatures;
 * the structured shapes below ARE the contract artifacts, so swapping the
 * generator never touches the A2A surface. Template output is deterministic per
 * topic — useful for pipeline tests and $0.
 */

export interface Brief {
  title: string;
  pageType: string;
  audience: string;
  intent: string;
  /** One-line hook under the title — the dek/standfirst. Optional (template tier omits it). */
  dek?: string;
  outline: Array<{ heading: string; summary: string; targetBlock: string }>;
  /** Body copy per section, aligned 1:1 with `outline`. `text` may hold multiple paragraphs (split on blank lines). */
  copyBlocks: Array<{ block: string; text: string }>;
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
    outline: sections.map(([heading, summary, targetBlock]) => ({ heading, summary, targetBlock })),
    copyBlocks: sections.map(([heading, summary]) => ({ block: heading, text: sectionCopy(summary) })),
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

  const img = (alt: string, i: number) =>
    `<img src="https://picsum.photos/seed/${encodeURIComponent(alt)}/640/360" alt="${alt}" ${
      legacyStyle === "messy" ? `style="float:${i % 2 ? "left" : "right"};margin:5px" width="320"` : ""
    }/>`;

  const dek = brief.dek?.trim();

  let body: string;
  if (legacyStyle === "clean") {
    body = brief.outline
      .map(
        (s, i) =>
          `<section><h2>${s.heading}</h2>${(sectionParas[i] ?? []).map((p) => `<p>${p}</p>`).join("")}${
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
            .join("<br><br>")}<br>${imageAlts[i] ? img(imageAlts[i], i) : ""}<br><br>`
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
          (imageAlts[i] ? img(imageAlts[i], i) : "")
      )
      .join("<br clear=\"all\">");
  }

  const nav = legacyStyle === "dated" ? "" : `<div>${links.map((l) => `<a href="${l.href}">${l.text}</a>`).join(" | ")}</div>`;
  const dekHtml = dek ? `\n<p${legacyStyle === "messy" ? ' style="font-size:15px;color:#666;font-style:italic"' : ""}><i>${dek}</i></p>` : "";
  const html = `<!DOCTYPE html>
<html>
<head><title>${brief.title}</title><meta charset="utf-8"></head>
<body${legacyStyle === "messy" ? ' bgcolor="#fafafa"' : ""}>
<h1>${brief.title}</h1>${dekHtml}
${nav}
${body}
</body>
</html>`;

  return {
    html,
    groundTruth: {
      title: brief.title,
      headings,
      links,
      imageAlts,
      bodyText: brief.copyBlocks.map((c) => c.text).join(" "),
    },
    legacyStyle,
  };
}
