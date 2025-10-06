/**
 * Path Normalizer for da.live URLs
 * Converts various da.live URL formats to normalized /source/org/site/path format
 */

/**
 * Normalize various da.live URL formats to /source/org/site/path
 *
 * Accepts:
 * - /source/org/site/path (already normalized)
 * - https://admin.da.live/source/org/site/path.html
 * - https://da.live/edit#/org/site/path.html
 * - https://branch--site--org.aem.page/path
 * - https://branch--site--org.aem.live/path
 *
 * @param {string} pathOrUrl - Path or URL in any supported format
 * @returns {string} Normalized path in /source/org/site/path format
 * @throws {Error} If path format is not recognized
 */
export function normalizePath(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') {
    throw new Error('Path is required and must be a string');
  }

  const input = pathOrUrl.trim();

  // Already normalized: /source/org/site/path
  if (input.startsWith('/source/')) {
    return input;
  }

  // Full admin URL: https://admin.da.live/source/org/site/path.html
  if (input.includes('admin.da.live/source/')) {
    const match = input.match(/\/source\/(.+)$/);
    if (match) {
      return `/source/${match[1]}`;
    }
  }

  // Edit URL: https://da.live/edit#/org/site/path.html
  if (input.includes('da.live/edit#/')) {
    const match = input.match(/edit#\/(.+)$/);
    if (match) {
      return `/source/${match[1]}`;
    }
  }

  // AEM page/live URL: https://branch--site--org.aem.page/path
  // or: https://branch--site--org.aem.live/path
  // Site name can contain hyphens, so we match org at the end and split the rest
  const aemMatch = input.match(/^https?:\/\/(.+)--([\w-]+)\.(aem\.page|aem\.live)\/(.+)$/);
  if (aemMatch) {
    const fullSite = aemMatch[1]; // e.g., "main--da-live-postal-2025-07"
    const org = aemMatch[2];
    const path = aemMatch[4];
    // Split fullSite to extract site name (skip branch)
    const parts = fullSite.split('--');
    const site = parts.slice(1).join('--'); // Skip branch, rejoin in case site has hyphens
    return `/source/${org}/${site}/${path}`;
  }

  // AEM page/live URL without path (homepage): https://branch--site--org.aem.page
  const aemRootMatch = input.match(/^https?:\/\/(.+)--([\w-]+)\.(aem\.page|aem\.live)\/?$/);
  if (aemRootMatch) {
    const fullSite = aemRootMatch[1];
    const org = aemRootMatch[2];
    const parts = fullSite.split('--');
    const site = parts.slice(1).join('--');
    return `/source/${org}/${site}/`;
  }

  // If nothing matched, assume it's a plain path and prepend /source
  // This handles cases like: /org/site/path or org/site/path
  if (input.startsWith('/')) {
    return `/source${input}`;
  } else {
    return `/source/${input}`;
  }
}

/**
 * Validate that a normalized path has the correct format
 * @param {string} path - Normalized path to validate
 * @returns {boolean} True if valid
 */
export function isValidNormalizedPath(path) {
  // Must start with /source/
  if (!path.startsWith('/source/')) {
    return false;
  }

  // Must have at least org/site components
  const parts = path.split('/').filter(p => p.length > 0);
  if (parts.length < 3) { // ['source', 'org', 'site']
    return false;
  }

  return true;
}
