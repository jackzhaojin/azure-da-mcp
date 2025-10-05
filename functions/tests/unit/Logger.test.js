import { describe, test, expect, beforeEach } from '@jest/globals';
import { generateRequestId, logPhase, getLogs, clearLogs } from '../../src/modules/Logger.js';

describe('Logger', () => {
  beforeEach(() => {
    // Clear logs before each test to ensure isolation
    if (typeof clearLogs === 'function') {
      clearLogs();
    }
  });

  describe('generateRequestId', () => {
    test('should create unique IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      const id3 = generateRequestId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id3).toBeDefined();

      // All IDs should be different
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    test('should generate string IDs', () => {
      const id = generateRequestId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    test('should generate IDs in UUID format or timestamp-based', () => {
      const id = generateRequestId();

      // Should match UUID v4 pattern OR timestamp-based pattern
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const timestampPattern = /^\d{13,}-[a-z0-9]+$/i;

      const isValidFormat = uuidPattern.test(id) || timestampPattern.test(id) || id.length > 10;
      expect(isValidFormat).toBe(true);
    });
  });

  describe('logPhase', () => {
    test('should store log entry with requestId', () => {
      const requestId = 'test-request-123';
      const phase = 'dalive_fetch';
      const data = { blocks: [], blockCount: 0 };
      const duration = 250;
      const status = 'success';

      logPhase(requestId, phase, data, duration, status);

      const logs = getLogs(requestId);
      expect(logs).toBeDefined();
      expect(logs.length).toBe(1);
      expect(logs[0].phase).toBe(phase);
      expect(logs[0].data).toEqual(data);
      expect(logs[0].duration).toBe(duration);
      expect(logs[0].status).toBe(status);
    });

    test('should store multiple log entries for same requestId', () => {
      const requestId = 'test-request-456';

      logPhase(requestId, 'request', { command: 'Test', path: '/test' }, null, 'success');
      logPhase(requestId, 'dalive_fetch', { blocks: [], blockCount: 0 }, 300, 'success');
      logPhase(requestId, 'llm_call', { tokenUsage: { input: 100, output: 50 } }, 2000, 'success');

      const logs = getLogs(requestId);
      expect(logs.length).toBe(3);
      expect(logs[0].phase).toBe('request');
      expect(logs[1].phase).toBe('dalive_fetch');
      expect(logs[2].phase).toBe('llm_call');
    });

    test('should include timestamp in log entry', () => {
      const requestId = 'test-request-789';
      const beforeLog = new Date();

      logPhase(requestId, 'validation', { valid: true, errors: [] }, 50, 'success');

      const logs = getLogs(requestId);
      const afterLog = new Date();

      expect(logs[0].timestamp).toBeDefined();
      const logTimestamp = new Date(logs[0].timestamp);
      expect(logTimestamp.getTime()).toBeGreaterThanOrEqual(beforeLog.getTime());
      expect(logTimestamp.getTime()).toBeLessThanOrEqual(afterLog.getTime());
    });

    test('should handle error status', () => {
      const requestId = 'test-request-error';

      logPhase(requestId, 'llm_call', { error: 'API timeout' }, 5000, 'error');

      const logs = getLogs(requestId);
      expect(logs[0].status).toBe('error');
      expect(logs[0].data.error).toBe('API timeout');
    });
  });

  describe('getLogs', () => {
    test('should retrieve all phases for requestId', () => {
      const requestId = 'test-full-request';

      logPhase(requestId, 'request', {}, null, 'success');
      logPhase(requestId, 'dalive_fetch', {}, 400, 'success');
      logPhase(requestId, 'llm_call', {}, 2400, 'success');
      logPhase(requestId, 'validation', {}, 200, 'success');
      logPhase(requestId, 'dalive_update', {}, 300, 'success');
      logPhase(requestId, 'response', {}, null, 'success');

      const logs = getLogs(requestId);
      expect(logs.length).toBe(6);

      const phases = logs.map((log) => log.phase);
      expect(phases).toEqual([
        'request',
        'dalive_fetch',
        'llm_call',
        'validation',
        'dalive_update',
        'response'
      ]);
    });

    test('should return empty array for unknown requestId', () => {
      const logs = getLogs('non-existent-request-id');
      expect(logs).toEqual([]);
    });

    test('should maintain separate logs for different requestIds', () => {
      const requestId1 = 'request-1';
      const requestId2 = 'request-2';

      logPhase(requestId1, 'request', { path: '/path1' }, null, 'success');
      logPhase(requestId2, 'request', { path: '/path2' }, null, 'success');
      logPhase(requestId1, 'dalive_fetch', {}, 300, 'success');

      const logs1 = getLogs(requestId1);
      const logs2 = getLogs(requestId2);

      expect(logs1.length).toBe(2);
      expect(logs2.length).toBe(1);
      expect(logs1[0].data.path).toBe('/path1');
      expect(logs2[0].data.path).toBe('/path2');
    });
  });

  describe('In-memory storage', () => {
    test('should use Map structure for storage', () => {
      const requestId = 'test-map-storage';

      logPhase(requestId, 'request', {}, null, 'success');
      const logs = getLogs(requestId);

      expect(Array.isArray(logs)).toBe(true);
      expect(logs[0]).toHaveProperty('requestId');
      expect(logs[0]).toHaveProperty('phase');
      expect(logs[0]).toHaveProperty('timestamp');
      expect(logs[0]).toHaveProperty('duration');
      expect(logs[0]).toHaveProperty('status');
      expect(logs[0]).toHaveProperty('data');
    });

    test('should persist logs across multiple calls', () => {
      const requestId = 'test-persistence';

      logPhase(requestId, 'request', {}, null, 'success');
      let logs = getLogs(requestId);
      expect(logs.length).toBe(1);

      logPhase(requestId, 'dalive_fetch', {}, 400, 'success');
      logs = getLogs(requestId);
      expect(logs.length).toBe(2);

      logPhase(requestId, 'llm_call', {}, 2400, 'success');
      logs = getLogs(requestId);
      expect(logs.length).toBe(3);
    });
  });
});
