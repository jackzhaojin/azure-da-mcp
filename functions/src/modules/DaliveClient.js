import axios from 'axios';

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
    const response = await axios.get(`${DALIVE_API_URL}/api/content${path}`, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`
      },
      timeout: 5000
    });

    return response.data;
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
 * @param {Array} blocks - Updated content blocks
 * @param {string} bearerToken - Authentication Bearer token
 * @returns {Promise<Object>} Update response
 * @throws {Error} After max retries or on non-retryable errors
 */
export async function updateContent(path, blocks, bearerToken) {
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        `${DALIVE_API_URL}/api/content${path}`,
        { blocks },
        {
          headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'Content-Type': 'application/json'
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
