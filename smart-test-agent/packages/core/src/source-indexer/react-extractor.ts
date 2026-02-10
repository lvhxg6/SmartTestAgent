/**
 * React Component Extractor
 * Extracts JSX and hooks from React component files
 * @see Requirements 2.2, 2.4, 2.6, 2.8
 */

import * as fs from 'fs/promises';
import type { ExtractedComponent } from '@smart-test-agent/shared';

/** Maximum lines before truncation */
const MAX_LINES = 500;

/**
 * Extracts the JSX return statement from component content
 */
function extractJsxReturn(content: string): string | null {
  // Pattern 1: return ( ... ) with JSX
  const returnParenMatch = content.match(
    /return\s*\(\s*([\s\S]*?)\s*\)\s*;?\s*(?=\n\s*\}|$)/
  );
  if (returnParenMatch) {
    return returnParenMatch[1].trim();
  }

  // Pattern 2: return <...> without parentheses
  const returnDirectMatch = content.match(
    /return\s+(<[\s\S]*?>)\s*;?\s*(?=\n\s*\}|$)/
  );
  if (returnDirectMatch) {
    return returnDirectMatch[1].trim();
  }

  return null;
}

/**
 * Extracts useState hooks from component content
 */
function extractUseStateHooks(content: string): string[] {
  const hooks: string[] = [];

  // Match useState declarations
  // Pattern: const [state, setState] = useState(initialValue)
  const useStateRegex =
    /const\s+\[(\w+),\s*(\w+)\]\s*=\s*useState(?:<[^>]+>)?\s*\([^)]*\)/g;

  let match;
  while ((match = useStateRegex.exec(content)) !== null) {
    hooks.push(match[0]);
  }

  return hooks;
}

/**
 * Extracts useEffect hooks from component content
 */
function extractUseEffectHooks(content: string): string[] {
  const hooks: string[] = [];

  // Match useEffect declarations (first line + deps array)
  const useEffectRegex = /useEffect\s*\(\s*(?:async\s*)?\(\)\s*=>\s*\{/g;

  let match;
  while ((match = useEffectRegex.exec(content)) !== null) {
    // Find the corresponding closing and deps array
    const startIndex = match.index;
    let braceCount = 1;
    let i = startIndex + match[0].length;

    while (i < content.length && braceCount > 0) {
      if (content[i] === '{') braceCount++;
      if (content[i] === '}') braceCount--;
      i++;
    }

    // Find deps array
    const afterEffect = content.slice(i);
    const depsMatch = afterEffect.match(/^\s*,\s*\[([^\]]*)\]\s*\)/);

    if (depsMatch) {
      hooks.push(`useEffect(() => { ... }, [${depsMatch[1]}])`);
    } else {
      hooks.push('useEffect(() => { ... })');
    }
  }

  return hooks;
}

/**
 * Extracts other common hooks (useMemo, useCallback, useRef, etc.)
 */
function extractOtherHooks(content: string): string[] {
  const hooks: string[] = [];

  // useMemo
  const useMemoRegex = /const\s+(\w+)\s*=\s*useMemo\s*\(/g;
  let match;
  while ((match = useMemoRegex.exec(content)) !== null) {
    hooks.push(`const ${match[1]} = useMemo(...)`);
  }

  // useCallback
  const useCallbackRegex = /const\s+(\w+)\s*=\s*useCallback\s*\(/g;
  while ((match = useCallbackRegex.exec(content)) !== null) {
    hooks.push(`const ${match[1]} = useCallback(...)`);
  }

  // useRef
  const useRefRegex = /const\s+(\w+)\s*=\s*useRef(?:<[^>]+>)?\s*\([^)]*\)/g;
  while ((match = useRefRegex.exec(content)) !== null) {
    hooks.push(match[0]);
  }

  // useContext
  const useContextRegex = /const\s+(\w+)\s*=\s*useContext\s*\([^)]+\)/g;
  while ((match = useContextRegex.exec(content)) !== null) {
    hooks.push(match[0]);
  }

  // Custom hooks (use* pattern)
  const customHookRegex =
    /const\s+(?:\{[^}]+\}|\w+)\s*=\s*use[A-Z]\w*\s*\([^)]*\)/g;
  while ((match = customHookRegex.exec(content)) !== null) {
    // Avoid duplicates with built-in hooks
    if (
      !match[0].includes('useState') &&
      !match[0].includes('useEffect') &&
      !match[0].includes('useMemo') &&
      !match[0].includes('useCallback') &&
      !match[0].includes('useRef') &&
      !match[0].includes('useContext')
    ) {
      hooks.push(match[0]);
    }
  }

  return hooks;
}

/**
 * Extracts component function signature
 */
function extractComponentSignature(content: string): string | null {
  // Pattern 1: function ComponentName(props) { or function ComponentName({ prop1, prop2 }) {
  const functionMatch = content.match(
    /(?:export\s+(?:default\s+)?)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/
  );
  if (functionMatch) {
    const name = functionMatch[1];
    const params = functionMatch[2].trim();
    return `function ${name}(${params})`;
  }

  // Pattern 2: const ComponentName = (props) => { or const ComponentName: FC = (props) => {
  const arrowMatch = content.match(
    /(?:export\s+(?:default\s+)?)?const\s+(\w+)(?:\s*:\s*[^=]+)?\s*=\s*(?:memo\s*\()?\s*\(([^)]*)\)\s*(?::\s*[^=]+)?\s*=>/
  );
  if (arrowMatch) {
    const name = arrowMatch[1];
    const params = arrowMatch[2].trim();
    return `const ${name} = (${params}) =>`;
  }

  // Pattern 3: export default function(props) { (anonymous)
  const anonFunctionMatch = content.match(
    /export\s+default\s+function\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/
  );
  if (anonFunctionMatch) {
    const params = anonFunctionMatch[1].trim();
    return `export default function(${params})`;
  }

  return null;
}

/**
 * Extracts API imports from component content
 * @see Requirements 2.2
 */
function extractApiImports(content: string): string[] {
  const apiImports: string[] = [];

  // Match import statements that look like API imports
  const importRegex =
    /import\s+(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]*(?:api|service|request)[^'"]*)['"]/gi;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    apiImports.push(match[1]);
  }

  return [...new Set(apiImports)];
}

/**
 * Counts the number of lines in content
 */
function countLines(content: string): number {
  return content.split('\n').length;
}

/**
 * Extracts component information from a React component file
 * @param filePath Path to the .tsx/.jsx file
 * @returns Extracted component information
 * @see Requirements 2.2, 2.4, 2.6, 2.8
 */
export async function extractReactComponent(
  filePath: string
): Promise<ExtractedComponent> {
  const content = await fs.readFile(filePath, 'utf-8');
  return extractReactComponentFromContent(content, filePath);
}

/**
 * Extracts component from React content string (for testing)
 * @param content React component content
 * @param filePath Virtual file path
 * @returns Extracted component information
 * @see Requirements 2.2, 2.4, 2.6, 2.8
 */
export function extractReactComponentFromContent(
  content: string,
  filePath: string = 'component.tsx'
): ExtractedComponent {
  const lineCount = countLines(content);
  const truncated = lineCount > MAX_LINES;
  const apiImports = extractApiImports(content);

  let jsxContent: string | undefined;
  let hooksContent: string | undefined;

  if (truncated) {
    // For large files, extract only essential parts
    // @see Requirements 2.8
    const signature = extractComponentSignature(content);
    const useStateHooks = extractUseStateHooks(content);
    const useEffectHooks = extractUseEffectHooks(content);
    const otherHooks = extractOtherHooks(content);
    const jsx = extractJsxReturn(content);

    const allHooks = [...useStateHooks, ...useEffectHooks, ...otherHooks];
    hooksContent = allHooks.length > 0 ? allHooks.join('\n') : undefined;

    // Include signature with hooks
    if (signature) {
      hooksContent = signature + '\n' + (hooksContent || '');
    }

    jsxContent = jsx || undefined;
  } else {
    // For small files, include full content
    jsxContent = extractJsxReturn(content) || undefined;

    const useStateHooks = extractUseStateHooks(content);
    const useEffectHooks = extractUseEffectHooks(content);
    const otherHooks = extractOtherHooks(content);
    const allHooks = [...useStateHooks, ...useEffectHooks, ...otherHooks];

    if (allHooks.length > 0) {
      hooksContent = allHooks.join('\n');
    }
  }

  return {
    filePath,
    framework: 'react',
    jsxContent,
    hooksContent,
    apiImports,
    truncated,
  };
}
