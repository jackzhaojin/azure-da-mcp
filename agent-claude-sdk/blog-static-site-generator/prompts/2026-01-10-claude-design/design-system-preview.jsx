import React, { useState } from 'react';

// ============================================
// DESIGN TOKENS
// ============================================

const tokens = {
  colors: {
    primary: {
      50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5',
      400: '#f87171', 500: '#ED2224', 600: '#dc2626', 700: '#b91c1c',
      800: '#991b1b', 900: '#7f1d1d',
    },
    neutral: {
      0: '#ffffff', 50: '#fafafa', 100: '#f5f5f5', 200: '#e5e5e5',
      300: '#d4d4d4', 400: '#a3a3a3', 500: '#737373', 600: '#525252',
      700: '#404040', 800: '#2D2E2D', 900: '#171717', 950: '#0a0a0a',
    },
    success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6',
  },
  spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 8: '32px', 10: '40px', 12: '48px', 16: '64px' },
  fonts: { sans: 'system-ui, -apple-system, sans-serif', mono: 'ui-monospace, monospace' },
  fontSizes: { xs: '12px', sm: '14px', base: '16px', lg: '18px', xl: '20px', '2xl': '24px', '3xl': '30px', '4xl': '36px', '5xl': '48px' },
  fontWeights: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  radii: { sm: '4px', md: '6px', lg: '8px', xl: '12px', '2xl': '16px', full: '9999px' },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  },
};

// ============================================
// REUSABLE UI
// ============================================

const SectionTitle = ({ children }) => (
  <h2 style={{ fontSize: tokens.fontSizes['2xl'], fontWeight: tokens.fontWeights.bold, color: tokens.colors.neutral[900], marginBottom: tokens.spacing[2], fontFamily: tokens.fonts.sans }}>{children}</h2>
);

const SectionDesc = ({ children }) => (
  <p style={{ fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[500], marginBottom: tokens.spacing[6], fontFamily: tokens.fonts.sans }}>{children}</p>
);

const VariantLabel = ({ children }) => (
  <div style={{ fontSize: tokens.fontSizes.xs, fontWeight: tokens.fontWeights.semibold, color: tokens.colors.neutral[400], textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: tokens.spacing[3], fontFamily: tokens.fonts.sans }}>{children}</div>
);

const ComponentCard = ({ children, dark = false }) => (
  <div style={{ padding: tokens.spacing[6], background: dark ? tokens.colors.neutral[800] : tokens.colors.neutral[50], borderRadius: tokens.radii.xl, marginBottom: tokens.spacing[4] }}>{children}</div>
);

// ============================================
// BLOG LISTING COMPONENTS
// ============================================

const BlogCard = ({ title, excerpt, category, date, author }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <article onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{
      background: tokens.colors.neutral[0], borderRadius: tokens.radii.lg, overflow: 'hidden',
      boxShadow: hovered ? tokens.shadows.lg : tokens.shadows.sm, transition: 'all 200ms ease',
      transform: hovered ? 'translateY(-4px)' : 'translateY(0)', cursor: 'pointer',
    }}>
      <div style={{ position: 'relative', paddingTop: '56.25%', background: `linear-gradient(135deg, ${tokens.colors.primary[500]}22, ${tokens.colors.neutral[800]}44)` }}>
        <div style={{ position: 'absolute', top: tokens.spacing[3], left: tokens.spacing[3] }}>
          <span style={{ display: 'inline-block', padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`, fontSize: tokens.fontSizes.xs, fontWeight: tokens.fontWeights.semibold, color: tokens.colors.neutral[0], background: tokens.colors.primary[500], borderRadius: tokens.radii.sm, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{category}</span>
        </div>
      </div>
      <div style={{ padding: tokens.spacing[5] }}>
        <h3 style={{ margin: 0, fontSize: tokens.fontSizes.lg, fontWeight: tokens.fontWeights.bold, color: tokens.colors.neutral[900], lineHeight: 1.25, marginBottom: tokens.spacing[2] }}>{title}</h3>
        <p style={{ margin: 0, fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[500], lineHeight: 1.6, marginBottom: tokens.spacing[4] }}>{excerpt}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[3], paddingTop: tokens.spacing[4], borderTop: `1px solid ${tokens.colors.neutral[100]}` }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: tokens.colors.neutral[300], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: tokens.fontSizes.sm, fontWeight: tokens.fontWeights.semibold, color: tokens.colors.neutral[600] }}>{author?.charAt(0)}</div>
          <div>
            <div style={{ fontSize: tokens.fontSizes.sm, fontWeight: tokens.fontWeights.medium, color: tokens.colors.neutral[800] }}>{author}</div>
            <div style={{ fontSize: tokens.fontSizes.xs, color: tokens.colors.neutral[400] }}>{date}</div>
          </div>
        </div>
      </div>
    </article>
  );
};

const FeaturedPost = ({ title, excerpt, category, date, author }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <article onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacing[8], padding: tokens.spacing[8],
      background: tokens.colors.neutral[900], borderRadius: tokens.radii.xl, cursor: 'pointer',
      transition: 'all 200ms ease', transform: hovered ? 'scale(1.005)' : 'scale(1)',
    }}>
      <div style={{ borderRadius: tokens.radii.lg, background: `linear-gradient(135deg, ${tokens.colors.primary[500]}, ${tokens.colors.primary[700]})`, minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none"><path d="M32 8L56 56H8L32 8Z" fill="white" opacity="0.9"/></svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ display: 'inline-block', width: 'fit-content', padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`, fontSize: tokens.fontSizes.xs, fontWeight: tokens.fontWeights.semibold, color: tokens.colors.primary[500], background: `${tokens.colors.primary[500]}22`, borderRadius: tokens.radii.sm, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: tokens.spacing[4] }}>{category}</span>
        <h2 style={{ margin: 0, fontSize: tokens.fontSizes['4xl'], fontWeight: tokens.fontWeights.bold, color: tokens.colors.neutral[0], lineHeight: 1.2, marginBottom: tokens.spacing[4] }}>{title}</h2>
        <p style={{ margin: 0, fontSize: tokens.fontSizes.lg, color: tokens.colors.neutral[400], lineHeight: 1.6, marginBottom: tokens.spacing[6] }}>{excerpt}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[3] }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: tokens.colors.neutral[700], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: tokens.fontSizes.base, fontWeight: tokens.fontWeights.semibold, color: tokens.colors.neutral[300] }}>{author?.charAt(0)}</div>
          <div>
            <div style={{ fontSize: tokens.fontSizes.sm, fontWeight: tokens.fontWeights.medium, color: tokens.colors.neutral[200] }}>{author}</div>
            <div style={{ fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[500] }}>{date}</div>
          </div>
        </div>
      </div>
    </article>
  );
};

// ============================================
// BLOG POST BLOCKS
// ============================================

const ArticleHeader = ({ title, category, date, author, readTime }) => (
  <header style={{ maxWidth: '720px', margin: '0 auto', textAlign: 'center', paddingBottom: tokens.spacing[10] }}>
    <span style={{ display: 'inline-block', padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`, fontSize: tokens.fontSizes.xs, fontWeight: tokens.fontWeights.semibold, color: tokens.colors.primary[500], background: `${tokens.colors.primary[500]}15`, borderRadius: tokens.radii.sm, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: tokens.spacing[5] }}>{category}</span>
    <h1 style={{ margin: 0, fontSize: tokens.fontSizes['5xl'], fontWeight: tokens.fontWeights.bold, color: tokens.colors.neutral[900], lineHeight: 1.1, marginBottom: tokens.spacing[6] }}>{title}</h1>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: tokens.spacing[4], fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[500] }}>
      <span style={{ fontWeight: tokens.fontWeights.medium, color: tokens.colors.neutral[700] }}>{author}</span>
      <span>·</span><span>{date}</span><span>·</span><span>{readTime} min read</span>
    </div>
  </header>
);

const Blockquote = ({ children, author, variant = 'default' }) => {
  const styles = {
    default: { borderLeft: `4px solid ${tokens.colors.primary[500]}`, background: tokens.colors.neutral[50], borderRadius: `0 ${tokens.radii.lg} ${tokens.radii.lg} 0`, textAlign: 'left' },
    large: { borderLeft: `4px solid ${tokens.colors.primary[500]}`, background: tokens.colors.neutral[50], borderRadius: `0 ${tokens.radii.lg} ${tokens.radii.lg} 0`, textAlign: 'left' },
    centered: { borderLeft: 'none', background: tokens.colors.neutral[50], borderRadius: tokens.radii.lg, textAlign: 'center' },
  };
  const fontSize = variant === 'large' ? tokens.fontSizes['3xl'] : tokens.fontSizes['2xl'];
  return (
    <blockquote style={{ maxWidth: '680px', margin: `${tokens.spacing[10]} auto`, padding: `${tokens.spacing[6]} ${tokens.spacing[8]}`, ...styles[variant] }}>
      {variant === 'centered' && <div style={{ fontSize: '48px', color: tokens.colors.primary[500], lineHeight: 1, marginBottom: tokens.spacing[2] }}>"</div>}
      <p style={{ margin: 0, fontSize, fontWeight: tokens.fontWeights.medium, fontStyle: 'italic', color: tokens.colors.neutral[800], lineHeight: 1.5 }}>"{children}"</p>
      {author && <footer style={{ marginTop: tokens.spacing[4], fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[500], fontWeight: tokens.fontWeights.medium }}>— {author}</footer>}
    </blockquote>
  );
};

const ImageBlock = ({ caption, variant = 'default' }) => {
  const maxWidth = { default: '680px', wide: '900px', full: '100%' }[variant];
  return (
    <figure style={{ maxWidth, margin: `${tokens.spacing[10]} auto` }}>
      <div style={{ borderRadius: tokens.radii.lg, background: `linear-gradient(135deg, ${tokens.colors.neutral[200]}, ${tokens.colors.neutral[300]})`, paddingTop: '56.25%', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="8" fill={tokens.colors.neutral[400]} opacity="0.3"/><circle cx="18" cy="18" r="5" fill={tokens.colors.neutral[400]}/><path d="M8 40L20 28L32 40L44 24V40H8Z" fill={tokens.colors.neutral[400]}/></svg>
        </div>
      </div>
      {caption && <figcaption style={{ marginTop: tokens.spacing[3], fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[500], textAlign: 'center' }}>{caption}</figcaption>}
    </figure>
  );
};

const CodeBlock = ({ code, language = 'javascript', variant = 'default', showLineNumbers = true }) => {
  const maxWidth = variant === 'wide' ? '900px' : '680px';
  const lines = code.split('\n');
  return (
    <div style={{ maxWidth, margin: `${tokens.spacing[10]} auto`, background: tokens.colors.neutral[900], borderRadius: tokens.radii.lg, overflow: 'hidden' }}>
      <div style={{ background: tokens.colors.neutral[800], padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: tokens.fontSizes.xs, fontWeight: tokens.fontWeights.medium, color: tokens.colors.neutral[400], textTransform: 'uppercase' }}>{language}</span>
        <button style={{ fontSize: tokens.fontSizes.xs, fontWeight: tokens.fontWeights.medium, color: tokens.colors.neutral[400], background: 'none', border: 'none', cursor: 'pointer' }}>Copy</button>
      </div>
      <pre style={{ margin: 0, padding: tokens.spacing[4], fontFamily: tokens.fonts.mono, fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[100], lineHeight: 1.6, overflowX: 'auto' }}>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex' }}>
            {showLineNumbers && <span style={{ color: tokens.colors.neutral[600], paddingRight: tokens.spacing[4], borderRight: `1px solid ${tokens.colors.neutral[700]}`, marginRight: tokens.spacing[4], userSelect: 'none', minWidth: '24px', textAlign: 'right' }}>{i + 1}</span>}
            <span>{line}</span>
          </div>
        ))}
      </pre>
    </div>
  );
};

const Callout = ({ children, type = 'tip', label }) => {
  const configs = {
    tip: { color: tokens.colors.info, icon: '💡', defaultLabel: 'Tip' },
    note: { color: tokens.colors.neutral[400], icon: 'ℹ️', defaultLabel: 'Note' },
    warning: { color: tokens.colors.warning, icon: '⚠️', defaultLabel: 'Warning' },
    danger: { color: tokens.colors.error, icon: '🚫', defaultLabel: 'Danger' },
    success: { color: tokens.colors.success, icon: '✓', defaultLabel: 'Success' },
  };
  const config = configs[type];
  return (
    <div style={{ maxWidth: '680px', margin: `${tokens.spacing[8]} auto`, padding: tokens.spacing[5], borderRadius: tokens.radii.lg, borderLeft: `4px solid ${config.color}`, background: `${config.color}08` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2], marginBottom: tokens.spacing[2] }}>
        <span>{config.icon}</span>
        <span style={{ fontSize: tokens.fontSizes.sm, fontWeight: tokens.fontWeights.semibold, color: config.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label || config.defaultLabel}</span>
      </div>
      <p style={{ margin: 0, fontSize: tokens.fontSizes.base, color: tokens.colors.neutral[700], lineHeight: 1.6 }}>{children}</p>
    </div>
  );
};

const Table = ({ headers, rows, variant = 'default' }) => {
  const maxWidth = variant === 'wide' ? '900px' : '680px';
  const striped = variant === 'striped';
  return (
    <div style={{ maxWidth, margin: `${tokens.spacing[10]} auto`, border: `1px solid ${tokens.colors.neutral[200]}`, borderRadius: tokens.radii.lg, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: tokens.colors.neutral[50] }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: `${tokens.spacing[3]} ${tokens.spacing[4]}`, fontSize: tokens.fontSizes.sm, fontWeight: tokens.fontWeights.semibold, color: tokens.colors.neutral[700], textAlign: 'left', borderBottom: `1px solid ${tokens.colors.neutral[200]}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: striped && i % 2 === 1 ? tokens.colors.neutral[50] : tokens.colors.neutral[0], borderBottom: i < rows.length - 1 ? `1px solid ${tokens.colors.neutral[100]}` : 'none' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: `${tokens.spacing[3]} ${tokens.spacing[4]}`, fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[600] }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const StatsHighlight = ({ stats, variant = 'dark' }) => {
  const styles = {
    dark: { bg: tokens.colors.neutral[900], value: tokens.colors.neutral[0], label: tokens.colors.neutral[400] },
    light: { bg: tokens.colors.neutral[50], value: tokens.colors.neutral[900], label: tokens.colors.neutral[500] },
    brand: { bg: tokens.colors.primary[500], value: tokens.colors.neutral[0], label: 'rgba(255,255,255,0.7)' },
  };
  const style = styles[variant];
  return (
    <div style={{ maxWidth: '900px', margin: `${tokens.spacing[12]} auto`, padding: tokens.spacing[10], background: style.bg, borderRadius: tokens.radii.xl }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: tokens.spacing[8], textAlign: 'center' }}>
        {stats.map((stat, i) => (
          <div key={i}>
            <div style={{ fontSize: tokens.fontSizes['5xl'], fontWeight: tokens.fontWeights.bold, color: style.value, letterSpacing: '-0.025em' }}>{stat.value}</div>
            <div style={{ fontSize: tokens.fontSizes.sm, fontWeight: tokens.fontWeights.medium, color: style.label, marginTop: tokens.spacing[2] }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const CTABanner = ({ heading, description, buttonText, variant = 'brand' }) => {
  const styles = {
    brand: { bg: `linear-gradient(135deg, ${tokens.colors.primary[500]}, ${tokens.colors.primary[700]})`, text: tokens.colors.neutral[0], btnBg: tokens.colors.neutral[0], btnText: tokens.colors.primary[600] },
    dark: { bg: tokens.colors.neutral[900], text: tokens.colors.neutral[0], btnBg: tokens.colors.primary[500], btnText: tokens.colors.neutral[0] },
    light: { bg: tokens.colors.neutral[100], text: tokens.colors.neutral[900], btnBg: tokens.colors.primary[500], btnText: tokens.colors.neutral[0] },
  };
  const style = styles[variant];
  return (
    <div style={{ maxWidth: '900px', margin: `${tokens.spacing[16]} auto`, padding: `${tokens.spacing[12]} ${tokens.spacing[8]}`, background: style.bg, borderRadius: tokens.radii.xl, textAlign: 'center' }}>
      <h3 style={{ margin: 0, fontSize: tokens.fontSizes['3xl'], fontWeight: tokens.fontWeights.bold, color: style.text, marginBottom: tokens.spacing[4] }}>{heading}</h3>
      <p style={{ margin: '0 auto', fontSize: tokens.fontSizes.lg, color: style.text, opacity: 0.8, maxWidth: '500px', marginBottom: tokens.spacing[6] }}>{description}</p>
      <button style={{ background: style.btnBg, color: style.btnText, fontSize: tokens.fontSizes.base, fontWeight: tokens.fontWeights.semibold, padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`, borderRadius: tokens.radii.lg, border: 'none', cursor: 'pointer' }}>{buttonText}</button>
    </div>
  );
};

const TableOfContents = ({ items }) => (
  <div style={{ maxWidth: '680px', margin: `${tokens.spacing[8]} auto`, border: `1px solid ${tokens.colors.neutral[200]}`, borderRadius: tokens.radii.lg, overflow: 'hidden' }}>
    <div style={{ background: tokens.colors.neutral[50], padding: `${tokens.spacing[3]} ${tokens.spacing[4]}`, borderBottom: `1px solid ${tokens.colors.neutral[200]}` }}>
      <span style={{ fontSize: tokens.fontSizes.xs, fontWeight: tokens.fontWeights.semibold, color: tokens.colors.neutral[500], textTransform: 'uppercase', letterSpacing: '0.1em' }}>Table of Contents</span>
    </div>
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{ padding: `${tokens.spacing[3]} ${tokens.spacing[4]}`, borderBottom: i < items.length - 1 ? `1px solid ${tokens.colors.neutral[100]}` : 'none', display: 'flex', gap: tokens.spacing[3], cursor: 'pointer' }}>
          <span style={{ fontSize: tokens.fontSizes.sm, fontWeight: tokens.fontWeights.medium, color: tokens.colors.neutral[400], minWidth: '24px' }}>{String(i + 1).padStart(2, '0')}</span>
          <span style={{ fontSize: tokens.fontSizes.sm, fontWeight: tokens.fontWeights.medium, color: tokens.colors.neutral[700] }}>{item}</span>
        </li>
      ))}
    </ul>
  </div>
);

const AuthorCard = ({ name, role, bio, variant = 'default' }) => {
  if (variant === 'centered') {
    return (
      <div style={{ maxWidth: '680px', margin: `${tokens.spacing[16]} auto 0`, padding: tokens.spacing[8], background: tokens.colors.neutral[50], borderRadius: tokens.radii.xl, textAlign: 'center' }}>
        <div style={{ width: '96px', height: '96px', borderRadius: '50%', background: tokens.colors.neutral[300], margin: '0 auto', marginBottom: tokens.spacing[4], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: tokens.fontSizes['3xl'], fontWeight: tokens.fontWeights.bold, color: tokens.colors.neutral[600] }}>{name?.charAt(0)}</div>
        <div style={{ fontSize: tokens.fontSizes.xs, fontWeight: tokens.fontWeights.semibold, color: tokens.colors.primary[500], textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: tokens.spacing[1] }}>Written by</div>
        <h4 style={{ margin: 0, fontSize: tokens.fontSizes.xl, fontWeight: tokens.fontWeights.bold, color: tokens.colors.neutral[900], marginBottom: tokens.spacing[1] }}>{name}</h4>
        <div style={{ fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[500], marginBottom: tokens.spacing[4] }}>{role}</div>
        <p style={{ margin: 0, fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[600], lineHeight: 1.6 }}>{bio}</p>
      </div>
    );
  }
  return (
    <div style={{ maxWidth: '680px', margin: `${tokens.spacing[16]} auto 0`, padding: tokens.spacing[6], background: tokens.colors.neutral[50], borderRadius: tokens.radii.xl, display: 'flex', gap: tokens.spacing[5] }}>
      <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: tokens.colors.neutral[300], flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: tokens.fontSizes['2xl'], fontWeight: tokens.fontWeights.bold, color: tokens.colors.neutral[600] }}>{name?.charAt(0)}</div>
      <div>
        <div style={{ fontSize: tokens.fontSizes.xs, fontWeight: tokens.fontWeights.semibold, color: tokens.colors.primary[500], textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: tokens.spacing[1] }}>Written by</div>
        <h4 style={{ margin: 0, fontSize: tokens.fontSizes.xl, fontWeight: tokens.fontWeights.bold, color: tokens.colors.neutral[900], marginBottom: tokens.spacing[1] }}>{name}</h4>
        <div style={{ fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[500], marginBottom: tokens.spacing[3] }}>{role}</div>
        <p style={{ margin: 0, fontSize: tokens.fontSizes.sm, color: tokens.colors.neutral[600], lineHeight: 1.6 }}>{bio}</p>
      </div>
    </div>
  );
};

// ============================================
// MAIN APP
// ============================================

export default function DesignSystemPreview() {
  const [activeSection, setActiveSection] = useState('listing');
  
  const navItems = [
    { id: 'listing', label: 'Listing Components' },
    { id: 'header', label: 'Article Header' },
    { id: 'blockquote', label: 'Blockquote' },
    { id: 'image', label: 'Image Block' },
    { id: 'code', label: 'Code Block' },
    { id: 'callout', label: 'Callout' },
    { id: 'table', label: 'Table' },
    { id: 'stats', label: 'Stats Highlight' },
    { id: 'cta', label: 'CTA Banner' },
    { id: 'toc', label: 'Table of Contents' },
    { id: 'author', label: 'Author Card' },
  ];

  return (
    <div style={{ fontFamily: tokens.fonts.sans, background: tokens.colors.neutral[0], minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ borderBottom: `1px solid ${tokens.colors.neutral[200]}`, padding: `${tokens.spacing[4]} ${tokens.spacing[6]}`, display: 'flex', alignItems: 'center', gap: tokens.spacing[4], position: 'sticky', top: 0, background: tokens.colors.neutral[0], zIndex: 100 }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 4L24 24H4L14 4Z" fill={tokens.colors.primary[500]}/></svg>
        <span style={{ fontSize: tokens.fontSizes.lg, fontWeight: tokens.fontWeights.bold, color: tokens.colors.neutral[900] }}>Summit Blog Design System</span>
        <span style={{ fontSize: tokens.fontSizes.xs, color: tokens.colors.neutral[400], background: tokens.colors.neutral[100], padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`, borderRadius: tokens.radii.sm }}>v1.0</span>
      </header>

      <div style={{ display: 'flex' }}>
        {/* Sidebar */}
        <nav style={{ width: '220px', borderRight: `1px solid ${tokens.colors.neutral[200]}`, padding: tokens.spacing[4], position: 'sticky', top: '60px', height: 'calc(100vh - 60px)', overflowY: 'auto' }}>
          <div style={{ fontSize: tokens.fontSizes.xs, fontWeight: tokens.fontWeights.semibold, color: tokens.colors.neutral[400], textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: tokens.spacing[3], padding: `0 ${tokens.spacing[3]}` }}>Components</div>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: `${tokens.spacing[2]} ${tokens.spacing[3]}`, marginBottom: tokens.spacing[1],
                fontSize: tokens.fontSizes.sm, fontWeight: activeSection === item.id ? tokens.fontWeights.semibold : tokens.fontWeights.normal,
                color: activeSection === item.id ? tokens.colors.primary[500] : tokens.colors.neutral[600],
                background: activeSection === item.id ? `${tokens.colors.primary[500]}10` : 'transparent',
                border: 'none', borderRadius: tokens.radii.md, cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Main Content */}
        <main style={{ flex: 1, padding: tokens.spacing[8], maxWidth: '1000px' }}>
          
          {activeSection === 'listing' && (
            <>
              <SectionTitle>Blog Listing Components</SectionTitle>
              <SectionDesc>Components for the blog listing/index page</SectionDesc>
              
              <VariantLabel>Featured Post</VariantLabel>
              <FeaturedPost
                title="Announcing GenAI at Adobe Summit 2026"
                excerpt="Discover how Adobe is transforming digital experiences with AI-powered tools."
                category="GenAI"
                author="Adobe Team"
                date="January 10, 2026"
              />
              
              <div style={{ height: tokens.spacing[8] }} />
              
              <VariantLabel>Blog Card (Grid of 3)</VariantLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: tokens.spacing[6] }}>
                <BlogCard title="Edge Delivery Deep Dive" excerpt="How to build blazing fast sites." category="Edge Delivery" author="Sarah Chen" date="Jan 8, 2026" />
                <BlogCard title="AI Personalization Guide" excerpt="Create experiences that convert." category="GenAI" author="Marcus J." date="Jan 6, 2026" />
                <BlogCard title="DA.Live for Authors" excerpt="The authoring experience reimagined." category="Authoring" author="Emily Park" date="Jan 4, 2026" />
              </div>
            </>
          )}

          {activeSection === 'header' && (
            <>
              <SectionTitle>Article Header</SectionTitle>
              <SectionDesc>Hero header for blog post pages</SectionDesc>
              <VariantLabel>Default</VariantLabel>
              <ComponentCard>
                <ArticleHeader title="Building AI-Powered Personalization" category="GenAI" date="January 10, 2026" author="Jack Zhao" readTime={8} />
              </ComponentCard>
            </>
          )}

          {activeSection === 'blockquote' && (
            <>
              <SectionTitle>Blockquote</SectionTitle>
              <SectionDesc>Pull quotes for highlighting important text</SectionDesc>
              
              <VariantLabel>Default</VariantLabel>
              <Blockquote author="Adobe Team">The future of digital experience isn't about choosing between speed and personalization. It's about having both.</Blockquote>
              
              <VariantLabel>Large</VariantLabel>
              <Blockquote variant="large" author="Adobe Team">Speed is a feature.</Blockquote>
              
              <VariantLabel>Centered</VariantLabel>
              <Blockquote variant="centered" author="Adobe Team">Content velocity changes everything.</Blockquote>
            </>
          )}

          {activeSection === 'image' && (
            <>
              <SectionTitle>Image Block</SectionTitle>
              <SectionDesc>Image display with optional captions</SectionDesc>
              
              <VariantLabel>Default (680px)</VariantLabel>
              <ImageBlock caption="Standard width image with caption" variant="default" />
              
              <VariantLabel>Wide (900px)</VariantLabel>
              <ImageBlock caption="Wide image breaks out of content column" variant="wide" />
            </>
          )}

          {activeSection === 'code' && (
            <>
              <SectionTitle>Code Block</SectionTitle>
              <SectionDesc>Syntax-highlighted code display</SectionDesc>
              
              <VariantLabel>Default with Line Numbers</VariantLabel>
              <CodeBlock 
                language="javascript" 
                code={`const greeting = "Hello Summit";
console.log(greeting);

function getData() {
  return fetch('/api/data');
}`}
              />
              
              <VariantLabel>Without Line Numbers</VariantLabel>
              <CodeBlock 
                language="bash" 
                showLineNumbers={false}
                code={`npm install @adobe/eds-core
npm run dev`}
              />
            </>
          )}

          {activeSection === 'callout' && (
            <>
              <SectionTitle>Callout</SectionTitle>
              <SectionDesc>Alert boxes for tips, warnings, and notes</SectionDesc>
              
              <VariantLabel>Tip</VariantLabel>
              <Callout type="tip">Use Edge Delivery Services for maximum performance.</Callout>
              
              <VariantLabel>Note</VariantLabel>
              <Callout type="note">This feature requires the latest SDK version.</Callout>
              
              <VariantLabel>Warning</VariantLabel>
              <Callout type="warning">Breaking changes in v2.0. Update your dependencies.</Callout>
              
              <VariantLabel>Danger</VariantLabel>
              <Callout type="danger">This action cannot be undone. Proceed with caution.</Callout>
              
              <VariantLabel>Success</VariantLabel>
              <Callout type="success">Deployment completed successfully!</Callout>
            </>
          )}

          {activeSection === 'table' && (
            <>
              <SectionTitle>Table</SectionTitle>
              <SectionDesc>Data tables for structured information</SectionDesc>
              
              <VariantLabel>Default</VariantLabel>
              <Table 
                headers={['Feature', 'Free', 'Pro', 'Enterprise']}
                rows={[
                  ['Projects', '3', '10', 'Unlimited'],
                  ['Storage', '1 GB', '10 GB', '100 GB'],
                  ['Support', 'Community', 'Email', '24/7 Phone'],
                ]}
              />
              
              <VariantLabel>Striped</VariantLabel>
              <Table 
                variant="striped"
                headers={['Metric', 'Before', 'After', 'Change']}
                rows={[
                  ['Load Time', '3.2s', '0.8s', '-75%'],
                  ['Bounce Rate', '45%', '22%', '-51%'],
                  ['Conversions', '2.1%', '4.8%', '+128%'],
                ]}
              />
            </>
          )}

          {activeSection === 'stats' && (
            <>
              <SectionTitle>Stats Highlight</SectionTitle>
              <SectionDesc>Showcase key metrics and numbers</SectionDesc>
              
              <VariantLabel>Dark</VariantLabel>
              <StatsHighlight variant="dark" stats={[{ value: '99.9%', label: 'Uptime' }, { value: '50M+', label: 'Users' }, { value: '10x', label: 'Faster' }]} />
              
              <VariantLabel>Light</VariantLabel>
              <StatsHighlight variant="light" stats={[{ value: '99.9%', label: 'Uptime' }, { value: '50M+', label: 'Users' }, { value: '10x', label: 'Faster' }]} />
              
              <VariantLabel>Brand</VariantLabel>
              <StatsHighlight variant="brand" stats={[{ value: '99.9%', label: 'Uptime' }, { value: '50M+', label: 'Users' }, { value: '10x', label: 'Faster' }]} />
            </>
          )}

          {activeSection === 'cta' && (
            <>
              <SectionTitle>CTA Banner</SectionTitle>
              <SectionDesc>Call-to-action banners for conversions</SectionDesc>
              
              <VariantLabel>Brand (Gradient)</VariantLabel>
              <CTABanner variant="brand" heading="Ready to Get Started?" description="Join thousands building with Edge Delivery." buttonText="Get Started Free" />
              
              <VariantLabel>Dark</VariantLabel>
              <CTABanner variant="dark" heading="Ready to Get Started?" description="Join thousands building with Edge Delivery." buttonText="Get Started Free" />
              
              <VariantLabel>Light</VariantLabel>
              <CTABanner variant="light" heading="Ready to Get Started?" description="Join thousands building with Edge Delivery." buttonText="Get Started Free" />
            </>
          )}

          {activeSection === 'toc' && (
            <>
              <SectionTitle>Table of Contents</SectionTitle>
              <SectionDesc>Navigation for article sections</SectionDesc>
              
              <VariantLabel>Default</VariantLabel>
              <TableOfContents items={['Introduction', 'Getting Started', 'Core Concepts', 'Advanced Techniques', 'Best Practices', 'Conclusion']} />
            </>
          )}

          {activeSection === 'author' && (
            <>
              <SectionTitle>Author Card</SectionTitle>
              <SectionDesc>Author bio displayed at article end</SectionDesc>
              
              <VariantLabel>Default (Horizontal)</VariantLabel>
              <AuthorCard name="Jack Zhao" role="Senior Technical Architect, Accenture" bio="Jack specializes in Adobe Experience Manager and has been helping enterprises transform their digital experiences for over 19 years." />
              
              <VariantLabel>Centered</VariantLabel>
              <AuthorCard variant="centered" name="Jack Zhao" role="Senior Technical Architect, Accenture" bio="Jack specializes in Adobe Experience Manager and has been helping enterprises transform their digital experiences for over 19 years." />
            </>
          )}

        </main>
      </div>
    </div>
  );
}
