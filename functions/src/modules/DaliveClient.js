import axios from 'axios';
import FormData from 'form-data';

const DALIVE_API_URL = process.env.DALIVE_API_URL || 'https://admin.da.live';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Fetch page content from da.live Admin API
 * @param {string} path - da.live page path (e.g., '/products/enterprise')
 * @param {string} bearerToken - Authentication Bearer token
 * @returns {Promise<Object>} Page content with blocks and metadata
 * @throws {Error} On 401 Unauthorized, 404 Not Found, or service unavailable
 */
export async function getContent(path, bearerToken) {
  try {
    const response = await axios.get(`${DALIVE_API_URL}${path}`, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`
      },
      timeout: 5000,
      responseType: 'text' // Get raw HTML text, not JSON
    });

    // Ensure we have actual HTML string (not JSON-encoded with \n escapes)
    let html = response.data;

    // If the response is a string but looks like it might be JSON-encoded,
    // it should already be decoded by axios with responseType: 'text'
    // Just ensure no literal \n escape sequences remain
    if (typeof html === 'string' && html.includes('\\n')) {
      // This shouldn't happen with responseType: 'text', but just in case
      console.warn('Warning: HTML contains literal \\n escape sequences, cleaning...');
      html = html.replace(/\\n/g, '\n');
    }

    return {
      path,
      html: html,
      blocks: [], // Will be parsed from HTML by LLM if needed
      metadata: {}
    };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        throw new Error(`401 Unauthorized: Invalid or expired Bearer token`);
      }
      if (status === 404) {
        throw new Error(`404 Not Found: Path '${path}' does not exist in da.live`);
      }
      throw new Error(`da.live API error: ${status} ${error.response.statusText}`);
    }
    throw new Error(`Network error accessing da.live API: ${error.message}`);
  }
}

/**
 * Update page content in da.live Admin API
 * Implements retry logic for 500-level errors with exponential backoff
 * @param {string} path - da.live page path
 * @param {string} html - Updated HTML content
 * @param {string} bearerToken - Authentication Bearer token
 * @returns {Promise<Object>} Update response
 * @throws {Error} After max retries or on non-retryable errors
 */
export async function updateContent(path, html, bearerToken) {
  let lastError;

  // Clean HTML: remove any literal \n escape sequences before saving
  let cleanedHtml = html;
  if (typeof cleanedHtml === 'string' && cleanedHtml.includes('\\n')) {
    console.warn('Warning: HTML contains literal \\n escape sequences, cleaning before save...');
    cleanedHtml = cleanedHtml.replace(/\\n/g, '\n');
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Create multipart form data with HTML as a file
      const formData = new FormData();
      formData.append('data', Buffer.from(cleanedHtml), {
        filename: 'content.html',
        contentType: 'text/html'
      });

      const response = await axios.post(
        `${DALIVE_API_URL}/api${path}`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            ...formData.getHeaders()
          },
          timeout: 5000
        }
      );

      return response.data;
    } catch (error) {
      lastError = error;

      // Don't retry on client errors or auth failures
      if (error.response && error.response.status < 500) {
        if (error.response.status === 401) {
          throw new Error(`401 Unauthorized: Invalid or expired Bearer token`);
        }
        throw new Error(`da.live API error: ${error.response.status} ${error.response.statusText}`);
      }

      // Retry on 500+ errors
      if (error.response && error.response.status >= 500) {
        if (attempt < MAX_RETRIES - 1) {
          const backoffTime = INITIAL_BACKOFF_MS * (2 ** attempt);
          await sleep(backoffTime);
          continue;
        }
      }

      // Network errors or final attempt
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(`da.live API update failed after ${MAX_RETRIES} retries: ${error.message}`);
      }
    }
  }

  throw new Error(`da.live API update failed after ${MAX_RETRIES} retries: ${lastError.message}`);
}

/**
 * Sleep utility for retry backoff
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
