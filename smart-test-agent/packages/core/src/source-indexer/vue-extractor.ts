/**
 * Vue Component Extractor
 * Extracts template and script sections from Vue single-file components
 * @see Requirements 2.2, 2.4, 2.5, 2.7
 */

import * as fs from 'fs/promises';
import type { ExtractedComponent } from '@smart-test-agent/shared';

/** Maximum lines before truncation */
const MAX_LINES = 500;

/**
 * Extracts the template section from Vue SFC content
 */
function extractTemplate(content: string): string | null {
  // Match <template> ... </template>
  const templateMatch = content.match(
    /<template[^>]*>([\s\S]*?)<\/template>/i
  );
  return templateMatch ? templateMatch[1].trim() : null;
}

/**
 * Extracts the script section from Vue SFC content
 */
function extractScript(content: string): string | null {
  // Match <script> or <script setup> or <script lang="ts">
  const scriptMatch = content.match(
    /<script[^>]*>([\s\S]*?)<\/script>/i
  );
  return scriptMatch ? scriptMatch[1].trim() : null;
}

/**
 * Extracts the export default object from script content
 * Used for truncation when file exceeds MAX_LINES
 * @see Requirements 2.7
 */
function extractExportDefault(scriptContent: string): string | null {
  // Pattern 1: export default { ... }
  const exportDefaultMatch = scriptContent.match(
    /export\s+default\s*(\{[\s\S]*\})\s*(?:;?\s*)?$/
  );
  if (exportDefaultMatch) {
    return exportDefaultMatch[1];
  }

  // Pattern 2: export default defineComponent({ ... })
  const defineComponentMatch = scriptContent.match(
    /export\s+default\s+defineComponent\s*\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$/
  );
  if (defineComponentMatch) {
    return `defineComponent(${defineComponentMatch[1]})`;
  }

  // Pattern 3: <script setup> - extract the entire content
  // For script setup, we want to keep reactive declarations and computed
  if (scriptContent.includes('defineProps') || scriptContent.includes('ref(') || scriptContent.includes('reactive(')) {
    return extractScriptSetupEssentials(scriptContent);
  }

  return null;
}

/**
 * Extracts essential parts from <script setup> content
 */
function extractScriptSetupEssentials(content: string): string {
  const essentials: string[] = [];

  // Extract imports
  const importMatches = content.match(/^import\s+.*$/gm);
  if (importMatches) {
    essentials.push(...importMatches);
  }

  // Extract defineProps/defineEmits
  const definePropsMatch = content.match(/(?:const\s+\w+\s*=\s*)?defineProps[^;]+;?/g);
  if (definePropsMatch) {
    essentials.push(...definePropsMatch);
  }

  const defineEmitsMatch = content.match(/(?:const\s+\w+\s*=\s*)?defineEmits[^;]+;?/g);
  if (defineEmitsMatch) {
    essentials.push(...defineEmitsMatch);
  }

  // Extract ref/reactive declarations
  const refMatches = content.match(/(?:const|let)\s+\w+\s*=\s*(?:ref|reactive|computed)\s*\([^)]*\)/g);
  if (refMatches) {
    essentials.push(...refMatches);
  }

  // Extract function declarations (first line only for brevity)
  const functionMatches = content.match(/(?:const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|function\s+\w+\s*\([^)]*\))/g);
  if (functionMatches) {
    essentials.push(...functionMatches.map(f => f + ' { ... }'));
  }

  return essentials.join('\n');
}

/**
 * Extracts API imports from script content
 * @see Requirements 2.2
 */
function extractApiImports(scriptContent: string): string[] {
  const apiImports: string[] = [];

  // Match import statements that look like API imports
  // Pattern: import { xxx } from '@/api/...' or '../api/...' or './api/...'
  const importRegex = /import\s+(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]*api[^'"]*)['"]/gi;

  let match;
  while ((match = importRegex.exec(scriptContent)) !== null) {
    apiImports.push(match[1]);
  }

  // Also match require statements
  const requireRegex = /require\s*\(\s*['"]([^'"]*api[^'"]*)['"]\s*\)/gi;
  while ((match = requireRegex.exec(scriptContent)) !== null) {
    apiImports.push(match[1]);
  }

  return [...new Set(apiImports)]; // Deduplicate
}

/**
 * Counts the number of lines in content
 */
function countLines(content: string): number {
  return content.split('\n').length;
}

/**
 * Extracts component information from a Vue SFC file
 * @param filePath Path to the .vue file
 * @returns Extracted component information
 * @see Requirements 2.2, 2.4, 2.5, 2.7
 */
export async function extractVueComponent(
  filePath: string
): Promise<ExtractedComponent> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lineCount = countLines(content);
  const truncated = lineCount > MAX_LINES;

  const template = extractTemplate(content);
  const script = extractScript(content);
  const apiImports = script ? extractApiImports(script) : [];

  let scriptExports: string | undefined;

  if (truncated && script) {
    // For large files, only extract export default object
    // @see Requirements 2.7
    scriptExports = extractExportDefault(script) || undefined;
  } else {
    scriptExports = script || undefined;
  }

  return {
    filePath,
    framework: 'vue',
    template: template || undefined,
    scriptExports,
    apiImports,
    truncated,
  };
}

/**
 * Extracts component from Vue SFC content string (for testing)
 * @param content Vue SFC content
 * @param filePath Virtual file path
 * @returns Extracted component information
 */
export function extractVueComponentFromContent(
  content: string,
  filePath: string = 'component.vue'
): ExtractedComponent {
  const lineCount = countLines(content);
  const truncated = lineCount > MAX_LINES;

  const template = extractTemplate(content);
  const script = extractScript(content);
  const apiImports = script ? extractApiImports(script) : [];

  let scriptExports: string | undefined;

  if (truncated && script) {
    scriptExports = extractExportDefault(script) || undefined;
  } else {
    scriptExports = script || undefined;
  }

  return {
    filePath,
    framework: 'vue',
    template: template || undefined,
    scriptExports,
    apiImports,
    truncated,
  };
}
