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
  outline: Array<{ heading: string; summary: string; targetBlock: string }>;
  copyBlocks: Array<{ block: string; text: string }>;
  imageDirections: Array<{ description: string; alt: string }>;
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

  return {
    title,
    pageType,
    audience: opts.siteBrief ? `Readers of: ${opts.siteBrief}` : `People researching ${opts.topic}`,
    intent: `Help the reader make a confident decision about ${opts.topic}.`,
    outline: sections.map(([heading, summary, targetBlock]) => ({ heading, summary, targetBlock })),
    copyBlocks: sections.map(([heading, summary]) => ({
      block: heading,
      text: `${summary} — ${"placeholder copy for " + opts.topic + ". ".repeat(3)}`.trim(),
    })),
    imageDirections: Array.from({ length: opts.constraints?.imageCount ?? 2 }, (_, i) => ({
      description: `Illustration ${i + 1} for ${opts.topic}`,
      alt: `${title} illustration ${i + 1}`,
    })),
    generator: "template",
  };
}

/** Renders a brief into standalone legacy-style HTML with KNOWN ground truth. */
export function synthesizeSource(brief: Brief, legacyStyle: "clean" | "dated" | "messy"): SyntheticSource {
  const headings = brief.outline.map((s) => s.heading);
  const links = [
    { href: "https://example.com/about", text: "About us" },
    { href: "https://example.com/contact", text: "Contact" },
  ];
  const imageAlts = brief.imageDirections.map((d) => d.alt);
  const paragraphs = brief.copyBlocks.map((c) => c.text);

  const img = (alt: string, i: number) =>
    `<img src="https://picsum.photos/seed/${encodeURIComponent(alt)}/640/360" alt="${alt}" ${
      legacyStyle === "messy" ? `style="float:${i % 2 ? "left" : "right"};margin:5px" width="320"` : ""
    }/>`;

  let body: string;
  if (legacyStyle === "clean") {
    body = brief.outline
      .map((s, i) => `<section><h2>${s.heading}</h2><p>${paragraphs[i] ?? ""}</p>${imageAlts[i] ? img(imageAlts[i], i) : ""}</section>`)
      .join("\n");
  } else if (legacyStyle === "dated") {
    body = `<table width="100%" border="0" cellpadding="8"><tr><td>${brief.outline
      .map((s, i) => `<font size="4"><b>${s.heading}</b></font><br>${paragraphs[i] ?? ""}<br>${imageAlts[i] ? img(imageAlts[i], i) : ""}<br><br>`)
      .join("")}</td><td width="200" bgcolor="#eeeeee">${links.map((l) => `<a href="${l.href}">${l.text}</a><br>`).join("")}</td></tr></table>`;
  } else {
    body = brief.outline
      .map(
        (s, i) =>
          `<div style="font-size:19px;font-weight:bold;color:#333;margin-top:22px">${s.heading}</div>` +
          `<div style="font-family:Verdana;font-size:13px;line-height:1.3">${paragraphs[i] ?? ""}</div>` +
          (imageAlts[i] ? img(imageAlts[i], i) : "")
      )
      .join("<br clear=\"all\">");
  }

  const nav = legacyStyle === "dated" ? "" : `<div>${links.map((l) => `<a href="${l.href}">${l.text}</a>`).join(" | ")}</div>`;
  const html = `<!DOCTYPE html>
<html>
<head><title>${brief.title}</title><meta charset="utf-8"></head>
<body${legacyStyle === "messy" ? ' bgcolor="#fafafa"' : ""}>
<h1>${brief.title}</h1>
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
      bodyText: paragraphs.join(" "),
    },
    legacyStyle,
  };
}
