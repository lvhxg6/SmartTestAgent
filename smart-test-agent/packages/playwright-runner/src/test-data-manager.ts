/**
 * Test Data Manager
 * Handles test data preparation and cleanup
 * @see Requirements 4.11, 7.8, 19.1, 19.2, 19.3, 19.4, 19.5
 */

import type { DataStep, TestCase } from '@smart-test-agent/shared';

/**
 * Data operation result
 */
export interface DataOperationResult {
  success: boolean;
  step: DataStep;
  error?: string;
  createdId?: string;
}

/**
 * Cleanup context for tracking created data
 */
export interface CleanupContext {
  runId: string;
  createdEntities: Array<{
    caseId: string;
    target: string;
    entityId: string;
    data: Record<string, unknown>;
  }>;
}

/**
 * Generate data preparation code for a test case
 * @see Requirements 19.1, 19.2
 */
export function generateDataPreparationCode(
  testCase: TestCase,
  apiBaseUrl: string
): string {
  const { dataPreparation, caseId } = testCase;

  if (!dataPreparation || dataPreparation.length === 0) {
    return '// No data preparation required';
  }

  const lines: string[] = [];
  lines.push(`// Data preparation for test case: ${caseId}`);
  lines.push(`const createdEntities_${sanitizeId(caseId)} = [];`);
  lines.push('');

  dataPreparation.forEach((step, index) => {
    lines.push(generateDataStepCode(step, index, caseId, apiBaseUrl, 'preparation'));
  });

  return lines.join('\n');
}

/**
 * Generate data cleanup code for a test case
 * @see Requirements 19.3, 19.4, 19.5
 */
export function generateDataCleanupCode(
  testCase: TestCase,
  apiBaseUrl: string
): string {
  const { dataCleanup, caseId } = testCase;

  if (!dataCleanup || dataCleanup.length === 0) {
    // Even without explicit cleanup, clean up created entities
    return `// Cleanup created entities for test case: ${caseId}
try {
  for (const entity of createdEntities_${sanitizeId(caseId)}) {
    try {
      await fetch(\`${apiBaseUrl}/\${entity.target}/\${entity.id}\`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      console.warn('Cleanup failed for entity:', entity);
    }
  }
} catch (e) {
  console.warn('Cleanup phase error:', e.message);
}`;
  }

  const lines: string[] = [];
  lines.push(`// Data cleanup for test case: ${caseId}`);
  lines.push('try {');

  dataCleanup.forEach((step, index) => {
    lines.push('  ' + generateDataStepCode(step, index, caseId, apiBaseUrl, 'cleanup'));
  });

  // Also clean up any created entities not explicitly handled
  lines.push(`  // Clean up any remaining created entities`);
  lines.push(`  for (const entity of createdEntities_${sanitizeId(caseId)}) {`);
  lines.push(`    try {`);
  lines.push(`      await fetch(\`${apiBaseUrl}/\${entity.target}/\${entity.id}\`, {`);
  lines.push(`        method: 'DELETE',`);
  lines.push(`        headers: { 'Content-Type': 'application/json' }`);
  lines.push(`      });`);
  lines.push(`    } catch (e) {`);
  lines.push(`      console.warn('Cleanup failed for entity:', entity);`);
  lines.push(`    }`);
  lines.push(`  }`);
  lines.push('} catch (e) {');
  lines.push('  console.warn(\'Cleanup phase error:\', e.message);');
  lines.push('}');

  return lines.join('\n');
}

/**
 * Generate code for a single data step
 */
function generateDataStepCode(
  step: DataStep,
  index: number,
  caseId: string,
  apiBaseUrl: string,
  phase: 'preparation' | 'cleanup'
): string {
  const { action, target, data } = step;
  const sanitizedCaseId = sanitizeId(caseId);

  switch (action) {
    case 'create':
      return `// ${phase} step ${index + 1}: Create ${target}
{
  const response = await fetch('${apiBaseUrl}/${target}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(${JSON.stringify(data || {})})
  });
  if (response.ok) {
    const created = await response.json();
    createdEntities_${sanitizedCaseId}.push({ target: '${target}', id: created.id, data: created });
  }
}`;

    case 'update':
      return `// ${phase} step ${index + 1}: Update ${target}
{
  const entityId = ${data?.id ? `'${data.id}'` : `createdEntities_${sanitizedCaseId}[0]?.id`};
  if (entityId) {
    await fetch(\`${apiBaseUrl}/${target}/\${entityId}\`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(${JSON.stringify(data || {})})
    });
  }
}`;

    case 'delete':
      return `// ${phase} step ${index + 1}: Delete ${target}
{
  const entityId = ${data?.id ? `'${data.id}'` : `createdEntities_${sanitizedCaseId}[0]?.id`};
  if (entityId) {
    await fetch(\`${apiBaseUrl}/${target}/\${entityId}\`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
  }
}`;

    case 'api_call':
      const method = (data?.method as string) || 'GET';
      const body = data?.body ? JSON.stringify(data.body) : 'null';
      return `// ${phase} step ${index + 1}: API call to ${target}
{
  await fetch('${apiBaseUrl}/${target}', {
    method: '${method}',
    headers: { 'Content-Type': 'application/json' }${method !== 'GET' ? `,
    body: ${body}` : ''}
  });
}`;

    default:
      return `// ${phase} step ${index + 1}: Unknown action ${action}`;
  }
}

/**
 * Sanitize ID for use as JavaScript variable name
 */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Validate data steps for a test case
 * @see Requirements 19.1
 */
export function validateDataSteps(testCase: TestCase): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const { dataPreparation, dataCleanup } = testCase;

  // Validate preparation steps
  if (dataPreparation) {
    dataPreparation.forEach((step, index) => {
      if (!step.target) {
        errors.push(`Preparation step ${index + 1}: missing target`);
      }
      if (!['create', 'update', 'delete', 'api_call'].includes(step.action)) {
        errors.push(`Preparation step ${index + 1}: invalid action '${step.action}'`);
      }
      if (step.action === 'create' && !step.data) {
        errors.push(`Preparation step ${index + 1}: create action requires data`);
      }
    });
  }

  // Validate cleanup steps
  if (dataCleanup) {
    dataCleanup.forEach((step, index) => {
      if (!step.target) {
        errors.push(`Cleanup step ${index + 1}: missing target`);
      }
      if (!['create', 'update', 'delete', 'api_call'].includes(step.action)) {
        errors.push(`Cleanup step ${index + 1}: invalid action '${step.action}'`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if test case has write operations
 * @see Requirements 19.1
 */
export function hasWriteOperations(testCase: TestCase): boolean {
  const { dataPreparation, dataCleanup, steps } = testCase;

  // Check data preparation
  if (dataPreparation?.some((s) => ['create', 'update', 'delete'].includes(s.action))) {
    return true;
  }

  // Check data cleanup
  if (dataCleanup?.some((s) => ['create', 'update', 'delete'].includes(s.action))) {
    return true;
  }

  // Check test steps for write-like actions
  const writeKeywords = ['create', 'add', 'edit', 'update', 'delete', 'remove', 'submit', 'save'];
  if (steps.some((s) => writeKeywords.some((kw) => s.action.toLowerCase().includes(kw)))) {
    return true;
  }

  return false;
}

/**
 * Generate cleanup guarantee wrapper
 * Ensures cleanup runs even if test fails
 * @see Requirements 19.4, 19.5
 */
export function generateCleanupGuaranteeWrapper(
  testCode: string,
  cleanupCode: string
): string {
  return `try {
${indent(testCode, 2)}
} finally {
  // Cleanup is guaranteed to run regardless of test outcome
${indent(cleanupCode, 2)}
}`;
}

/**
 * Indent code by specified number of spaces
 */
function indent(code: string, spaces: number): string {
  const indentation = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => (line.trim() ? indentation + line : line))
    .join('\n');
}
