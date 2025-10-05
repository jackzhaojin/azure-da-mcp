/**
 * Azure Functions Entry Point
 *
 * This file imports all HTTP-triggered functions for Azure Functions v4 programming model.
 * Each function self-registers with the app when imported.
 */

import './HealthCheckFunction.js';
import './GetContentFunction.js';
import './EditContentFunction.js';
import './McpSessionFunction.js';
