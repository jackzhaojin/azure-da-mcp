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

    return {
      path,
      html: response.data,
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

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Create multipart form data with HTML as a file
      const formData = new FormData();
      formData.append('data', Buffer.from(html), {
        filename: 'content.html',
        contentType: 'text/html'
      });

      const response = await axios.post(
        `${DALIVE_API_URL}${path}`,
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
 * Trigger preview publish on admin.hlx.page
 * @param {string} path - da.live page path in /source/{org}/{site}/{file} format
 * @param {string} bearerToken - Authentication Bearer token
 * @param {string} branch - Git branch (defaults to 'main')
 * @returns {Promise<Object>} Preview publish response
 * @throws {Error} On 401 Unauthorized, 404 Not Found, or service unavailable
 */
export async function previewPublish(path, bearerToken, branch = 'main') {
  try {
    // Parse path: /source/{org}/{site}/{path}
    // Example: /source/jackzhaojin/da-live-postal-2025-07/index-copy.html
    const pathParts = path.split('/').filter(p => p.length > 0);

    if (pathParts.length < 4 || pathParts[0] !== 'source') {
      throw new Error(`Invalid path format: ${path}. Expected /source/{org}/{site}/{file}`);
    }

    const org = pathParts[1];
    const site = pathParts[2];
    let filePath = pathParts.slice(3).join('/');

    // Strip .html extension for preview URL (admin.hlx.page doesn't use .html)
    if (filePath.endsWith('.html')) {
      filePath = filePath.slice(0, -5);
    }

    // Build preview URL: https://admin.hlx.page/preview/{org}/{site}/{ref}/{path}
    const previewUrl = `https://admin.hlx.page/preview/${org}/${site}/${branch}/${filePath}`;

    const response = await axios.post(previewUrl, null, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`
      },
      timeout: 10000 // Preview can take longer than regular GET/POST
    });

    return {
      status: response.status,
      message: response.data,
      previewUrl,
      org,
      site,
      branch,
      path: filePath
    };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        throw new Error(`401 Unauthorized: Invalid or expired Bearer token`);
      }
      if (status === 404) {
        throw new Error(`404 Not Found: Path '${path}' does not exist or cannot be previewed`);
      }
      throw new Error(`admin.hlx.page preview error: ${status} ${error.response.statusText}`);
    }
    throw new Error(`Network error accessing admin.hlx.page: ${error.message}`);
  }
}

/**
 * Create a folder in da.live Admin API
 * @param {string} path - da.live folder path (e.g., '/source/owner/site/folder-name')
 * @param {string} bearerToken - Authentication Bearer token
 * @returns {Promise<Object>} Create folder response
 * @throws {Error} On 401 Unauthorized, 404 Not Found, or service unavailable
 */
export async function createFolder(path, bearerToken) {
  try {
    const response = await axios.put(
      `${DALIVE_API_URL}${path}`,
      null,
      {
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Content-Length': '0'
        },
        timeout: 5000
      }
    );

    return {
      status: response.status,
      message: response.data,
      path
    };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        throw new Error(`401 Unauthorized: Invalid or expired Bearer token`);
      }
      if (status === 404) {
        throw new Error(`404 Not Found: Parent path does not exist for '${path}'`);
      }
      throw new Error(`da.live API error: ${status} ${error.response.statusText}`);
    }
    throw new Error(`Network error accessing da.live API: ${error.message}`);
  }
}

/**
 * Sleep utility for retry backoff
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
