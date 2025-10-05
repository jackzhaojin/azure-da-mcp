import { app } from '@azure/functions';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

/**
 * Azure HTTP Function: GET /api/HealthCheck
 * Runtime health verification and readiness checks
 */
app.http('HealthCheck', {
  methods: ['GET'],
  route: 'HealthCheck',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      // Get version from package.json
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const packageJsonPath = join(__dirname, '../../package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const version = packageJson.version || '1.0.0';

      // Build health response
      const healthResponse = {
        status: 'healthy',
        version,
        timestamp: new Date().toISOString()
      };

      // Optionally check dependencies (simplified for Release 1)
      // For now, return 'unknown' since we don't want to add latency
      healthResponse.dependencies = {
        dalive: 'unknown',
        anthropic: 'unknown'
      };

      return {
        status: 200,
        jsonBody: healthResponse
      };
    } catch (error) {
      context.log('HealthCheck error:', error.message);

      // Even if there's an error reading version, return degraded status
      return {
        status: 200,
        jsonBody: {
          status: 'degraded',
          version: 'unknown',
          timestamp: new Date().toISOString(),
          error: error.message
        }
      };
    }
  }
});

export { app };
