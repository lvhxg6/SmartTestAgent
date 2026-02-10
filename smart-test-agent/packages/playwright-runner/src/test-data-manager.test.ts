/**
 * Unit tests for Test Data Manager
 * @see Requirements 4.11, 7.8, 19.1, 19.2, 19.3, 19.4, 19.5
 */

import { describe, it, expect } from 'vitest';
import {
  generateDataPreparationCode,
  generateDataCleanupCode,
  validateDataSteps,
  hasWriteOperations,
  generateCleanupGuaranteeWrapper,
} from './test-data-manager.js';
import type { TestCase, DataStep } from '@smart-test-agent/shared';

describe('Test Data Manager', () => {
  const mockTestCase: TestCase = {
    id: 'tc-1',
    caseId: 'TC001',
    runId: 'run-1',
    requirementId: 'REQ001',
    route: '/dashboard',
    title: 'Test Dashboard',
    precondition: 'User is logged in',
    steps: [{ stepNumber: 1, action: 'Click button' }],
    assertions: [],
  };

  describe('generateDataPreparationCode', () => {
    it('should return comment when no data preparation', () => {
      const result = generateDataPreparationCode(mockTestCase, 'https://api.example.com');
      expect(result).toContain('No data preparation required');
    });

    it('should generate create step code', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'create', target: 'users', data: { name: 'Test User' } },
        ],
      };

      const result = generateDataPreparationCode(testCase, 'https://api.example.com');

      expect(result).toContain('Data preparation');
      expect(result).toContain('createdEntities_TC001');
      expect(result).toContain('POST');
      expect(result).toContain('users');
      expect(result).toContain('Test User');
    });

    it('should generate update step code', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'update', target: 'users', data: { id: '123', name: 'Updated' } },
        ],
      };

      const result = generateDataPreparationCode(testCase, 'https://api.example.com');

      expect(result).toContain('Update users');
      expect(result).toContain('PUT');
    });

    it('should generate delete step code', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'delete', target: 'users', data: { id: '123' } },
        ],
      };

      const result = generateDataPreparationCode(testCase, 'https://api.example.com');

      expect(result).toContain('Delete users');
      expect(result).toContain('DELETE');
    });

    it('should generate api_call step code', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'api_call', target: 'reset', data: { method: 'POST', body: {} } },
        ],
      };

      const result = generateDataPreparationCode(testCase, 'https://api.example.com');

      expect(result).toContain('API call');
      expect(result).toContain('reset');
    });

    it('should handle multiple preparation steps', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'create', target: 'users', data: { name: 'User 1' } },
          { action: 'create', target: 'orders', data: { userId: '1' } },
        ],
      };

      const result = generateDataPreparationCode(testCase, 'https://api.example.com');

      expect(result).toContain('users');
      expect(result).toContain('orders');
    });
  });

  describe('generateDataCleanupCode', () => {
    it('should generate default cleanup when no explicit cleanup', () => {
      const result = generateDataCleanupCode(mockTestCase, 'https://api.example.com');

      expect(result).toContain('Cleanup created entities');
      expect(result).toContain('DELETE');
    });

    it('should generate explicit cleanup steps', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataCleanup: [
          { action: 'delete', target: 'users', data: { id: '123' } },
        ],
      };

      const result = generateDataCleanupCode(testCase, 'https://api.example.com');

      expect(result).toContain('Data cleanup');
      expect(result).toContain('Delete users');
    });

    it('should include try-catch for error handling', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataCleanup: [
          { action: 'delete', target: 'users', data: { id: '123' } },
        ],
      };

      const result = generateDataCleanupCode(testCase, 'https://api.example.com');

      expect(result).toContain('try {');
      expect(result).toContain('catch');
      expect(result).toContain('Cleanup phase error');
    });

    it('should also clean up created entities after explicit cleanup', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataCleanup: [
          { action: 'api_call', target: 'reset' },
        ],
      };

      const result = generateDataCleanupCode(testCase, 'https://api.example.com');

      expect(result).toContain('Clean up any remaining created entities');
    });
  });

  describe('validateDataSteps', () => {
    it('should return valid for test case without data steps', () => {
      const result = validateDataSteps(mockTestCase);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for correct data steps', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'create', target: 'users', data: { name: 'Test' } },
        ],
        dataCleanup: [
          { action: 'delete', target: 'users' },
        ],
      };

      const result = validateDataSteps(testCase);
      expect(result.valid).toBe(true);
    });

    it('should detect missing target in preparation', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'create', target: '', data: { name: 'Test' } },
        ],
      };

      const result = validateDataSteps(testCase);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Preparation step 1: missing target');
    });

    it('should detect invalid action in preparation', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'invalid' as any, target: 'users' },
        ],
      };

      const result = validateDataSteps(testCase);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('invalid action');
    });

    it('should detect missing data for create action', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'create', target: 'users' },
        ],
      };

      const result = validateDataSteps(testCase);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Preparation step 1: create action requires data');
    });

    it('should detect missing target in cleanup', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataCleanup: [
          { action: 'delete', target: '' },
        ],
      };

      const result = validateDataSteps(testCase);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cleanup step 1: missing target');
    });

    it('should collect multiple errors', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'create', target: '' },
          { action: 'invalid' as any, target: 'users' },
        ],
      };

      const result = validateDataSteps(testCase);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('hasWriteOperations', () => {
    it('should return false for read-only test case', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        steps: [
          { stepNumber: 1, action: 'View dashboard' },
          { stepNumber: 2, action: 'Check element visible' },
        ],
      };

      const result = hasWriteOperations(testCase);
      expect(result).toBe(false);
    });

    it('should return true for test case with create data preparation', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'create', target: 'users', data: {} },
        ],
      };

      const result = hasWriteOperations(testCase);
      expect(result).toBe(true);
    });

    it('should return true for test case with update data preparation', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'update', target: 'users', data: {} },
        ],
      };

      const result = hasWriteOperations(testCase);
      expect(result).toBe(true);
    });

    it('should return true for test case with delete data cleanup', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataCleanup: [
          { action: 'delete', target: 'users' },
        ],
      };

      const result = hasWriteOperations(testCase);
      expect(result).toBe(true);
    });

    it('should return true for test case with create step action', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        steps: [
          { stepNumber: 1, action: 'Create new user' },
        ],
      };

      const result = hasWriteOperations(testCase);
      expect(result).toBe(true);
    });

    it('should return true for test case with edit step action', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        steps: [
          { stepNumber: 1, action: 'Edit user profile' },
        ],
      };

      const result = hasWriteOperations(testCase);
      expect(result).toBe(true);
    });

    it('should return true for test case with delete step action', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        steps: [
          { stepNumber: 1, action: 'Delete selected items' },
        ],
      };

      const result = hasWriteOperations(testCase);
      expect(result).toBe(true);
    });

    it('should return true for test case with submit step action', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        steps: [
          { stepNumber: 1, action: 'Submit form' },
        ],
      };

      const result = hasWriteOperations(testCase);
      expect(result).toBe(true);
    });

    it('should return true for test case with save step action', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        steps: [
          { stepNumber: 1, action: 'Save changes' },
        ],
      };

      const result = hasWriteOperations(testCase);
      expect(result).toBe(true);
    });

    it('should be case insensitive for action keywords', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        steps: [
          { stepNumber: 1, action: 'CREATE NEW ITEM' },
        ],
      };

      const result = hasWriteOperations(testCase);
      expect(result).toBe(true);
    });

    it('should return false for api_call without write actions', () => {
      const testCase: TestCase = {
        ...mockTestCase,
        dataPreparation: [
          { action: 'api_call', target: 'status' },
        ],
      };

      const result = hasWriteOperations(testCase);
      expect(result).toBe(false);
    });
  });

  describe('generateCleanupGuaranteeWrapper', () => {
    it('should wrap test code in try-finally', () => {
      const testCode = 'await page.click(".button");';
      const cleanupCode = 'await cleanup();';

      const result = generateCleanupGuaranteeWrapper(testCode, cleanupCode);

      expect(result).toContain('try {');
      expect(result).toContain('finally {');
      expect(result).toContain('await page.click(".button");');
      expect(result).toContain('await cleanup();');
    });

    it('should indent code properly', () => {
      const testCode = 'line1;\nline2;';
      const cleanupCode = 'cleanup1;\ncleanup2;';

      const result = generateCleanupGuaranteeWrapper(testCode, cleanupCode);

      expect(result).toContain('  line1;');
      expect(result).toContain('  line2;');
      expect(result).toContain('  cleanup1;');
      expect(result).toContain('  cleanup2;');
    });

    it('should include comment about cleanup guarantee', () => {
      const result = generateCleanupGuaranteeWrapper('test', 'cleanup');

      expect(result).toContain('Cleanup is guaranteed');
    });
  });
});
