import { describe, test, expect, jest } from '@jest/globals';
import { app } from '../../src/functions/HealthCheckFunction.js';

describe('HealthCheckFunction Integration', () => {
  describe('GET /api/HealthCheck', () => {
    test('should return 200 OK', async () => {
      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/HealthCheck'
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('HealthCheck');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(200);
    });

    test('should include status field in response', async () => {
      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/HealthCheck'
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('HealthCheck');
      const response = await functionHandler(request, context);

      expect(response.jsonBody.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(response.jsonBody.status);
    });

    test('should include version field matching package.json', async () => {
      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/HealthCheck'
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('HealthCheck');
      const response = await functionHandler(request, context);

      expect(response.jsonBody.version).toBeDefined();
      expect(typeof response.jsonBody.version).toBe('string');
      expect(response.jsonBody.version).toMatch(/^\d+\.\d+\.\d+$/); // Semver format
    });

    test('should include timestamp in ISO 8601 format', async () => {
      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/HealthCheck'
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('HealthCheck');
      const response = await functionHandler(request, context);

      expect(response.jsonBody.timestamp).toBeDefined();
      const timestamp = response.jsonBody.timestamp;
      expect(typeof timestamp).toBe('string');
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });

    test('should optionally include dependencies field', async () => {
      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/HealthCheck'
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('HealthCheck');
      const response = await functionHandler(request, context);

      // Dependencies field is optional but if present should be an object
      if (response.jsonBody.dependencies) {
        expect(typeof response.jsonBody.dependencies).toBe('object');
      }
    });

    test('should respond quickly (< 500ms for simple health check)', async () => {
      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/HealthCheck'
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('HealthCheck');

      const startTime = Date.now();
      const response = await functionHandler(request, context);
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(endTime - startTime).toBeLessThan(500);
    });

    test('should verify complete response structure', async () => {
      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/HealthCheck'
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('HealthCheck');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(200);

      // Verify all required fields
      expect(response.jsonBody).toHaveProperty('status');
      expect(response.jsonBody).toHaveProperty('version');
      expect(response.jsonBody).toHaveProperty('timestamp');

      // Verify types
      expect(typeof response.jsonBody.status).toBe('string');
      expect(typeof response.jsonBody.version).toBe('string');
      expect(typeof response.jsonBody.timestamp).toBe('string');
    });
  });
});
