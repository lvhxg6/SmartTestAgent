/**
 * Router File Parser
 * Parses vue-router and react-router configuration files to extract route mappings
 * @see Requirements 2.1, 2.9
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { RouteMapping, FrameworkType } from '@smart-test-agent/shared';

/**
 * Result of parsing a router file
 */
export interface RouterParseResult {
  /** Detected framework type */
  framework: FrameworkType;
  /** Extracted route mappings */
  routes: RouteMapping[];
}

/**
 * Detects the framework type from router file content
 * @see Requirements 2.9
 */
export function detectFrameworkType(content: string): FrameworkType {
  // Vue Router patterns
  const vueRouterPatterns = [
    /import\s+.*\s+from\s+['"]vue-router['"]/,
    /createRouter\s*\(/,
    /new\s+VueRouter\s*\(/,
    /component:\s*\(\)\s*=>\s*import\s*\(/,
    /import\.meta\.glob/,
  ];

  // React Router patterns
  const reactRouterPatterns = [
    /import\s+.*\s+from\s+['"]react-router/,
    /createBrowserRouter\s*\(/,
    /createHashRouter\s*\(/,
    /<Route\s+/,
    /<Routes\s*/,
    /useRoutes\s*\(/,
  ];

  const vueScore = vueRouterPatterns.filter((p) => p.test(content)).length;
  const reactScore = reactRouterPatterns.filter((p) => p.test(content)).length;

  return vueScore >= reactScore ? 'vue' : 'react';
}

/**
 * Extracts component path from various import patterns
 */
function extractComponentPath(componentStr: string): string | null {
  // Pattern 1: () => import('@/views/xxx.vue')
  const dynamicImportMatch = componentStr.match(
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/
  );
  if (dynamicImportMatch) {
    return dynamicImportMatch[1];
  }

  // Pattern 2: require('@/views/xxx.vue')
  const requireMatch = componentStr.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
  if (requireMatch) {
    return requireMatch[1];
  }

  // Pattern 3: Direct string path
  const directPathMatch = componentStr.match(/['"]([^'"]+\.(?:vue|tsx|jsx))['"]/);
  if (directPathMatch) {
    return directPathMatch[1];
  }

  // Pattern 4: Variable reference (return the variable name for later resolution)
  const variableMatch = componentStr.match(/^\s*(\w+)\s*$/);
  if (variableMatch) {
    return `$ref:${variableMatch[1]}`;
  }

  return null;
}

/**
 * Parses Vue Router configuration
 */
function parseVueRouterRoutes(content: string): RouteMapping[] {
  const routes: RouteMapping[] = [];

  // Extract routes array - handle various formats
  // Pattern: routes: [...] or const routes = [...]
  const routesArrayMatch = content.match(
    /(?:routes\s*:\s*|const\s+routes\s*=\s*)\[[\s\S]*?\](?=\s*[,\n\r}]|\s*$)/
  );

  if (!routesArrayMatch) {
    // Try to find route objects directly
    return parseRouteObjects(content);
  }

  const routesStr = routesArrayMatch[0];
  return parseRouteObjects(routesStr);
}

/**
 * Parses React Router configuration
 */
function parseReactRouterRoutes(content: string): RouteMapping[] {
  const routes: RouteMapping[] = [];

  // Pattern 1: createBrowserRouter([...])
  const browserRouterMatch = content.match(
    /createBrowserRouter\s*\(\s*\[[\s\S]*?\]\s*\)/
  );
  if (browserRouterMatch) {
    return parseRouteObjects(browserRouterMatch[0]);
  }

  // Pattern 2: useRoutes([...])
  const useRoutesMatch = content.match(/useRoutes\s*\(\s*\[[\s\S]*?\]\s*\)/);
  if (useRoutesMatch) {
    return parseRouteObjects(useRoutesMatch[0]);
  }

  // Pattern 3: JSX <Route> elements
  const jsxRoutes = parseJsxRoutes(content);
  if (jsxRoutes.length > 0) {
    return jsxRoutes;
  }

  // Pattern 4: routes config array
  return parseRouteObjects(content);
}

/**
 * Parses JSX Route elements
 */
function parseJsxRoutes(content: string): RouteMapping[] {
  const routes: RouteMapping[] = [];

  // Match <Route path="..." element={...} /> or <Route path="..." component={...} />
  const routeRegex =
    /<Route\s+[^>]*path\s*=\s*["']([^"']+)["'][^>]*(?:element|component)\s*=\s*\{([^}]+)\}[^>]*\/?>/g;

  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const routePath = match[1];
    const componentStr = match[2];

    // Extract component path from element/component prop
    const componentPath = extractComponentPathFromJsx(componentStr);

    if (componentPath) {
      routes.push({
        path: routePath,
        componentPath,
      });
    }
  }

  return routes;
}

/**
 * Extracts component path from JSX element prop
 */
function extractComponentPathFromJsx(elementStr: string): string | null {
  // Pattern: <ComponentName /> or <ComponentName>
  const componentMatch = elementStr.match(/<\s*(\w+)/);
  if (componentMatch) {
    return `$ref:${componentMatch[1]}`;
  }

  // Pattern: lazy(() => import('...'))
  const lazyImportMatch = elementStr.match(
    /lazy\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/
  );
  if (lazyImportMatch) {
    return lazyImportMatch[1];
  }

  return null;
}

/**
 * Parses route objects from content string
 */
function parseRouteObjects(content: string): RouteMapping[] {
  const routes: RouteMapping[] = [];

  // Match route objects with path and component properties
  // This regex handles nested objects and various formatting
  const routeObjectRegex =
    /\{\s*(?:[^{}]*?)path\s*:\s*['"]([^'"]+)['"][^{}]*?(?:component\s*:\s*([^,}\n]+)|element\s*:\s*([^,}\n]+))[^{}]*?\}/g;

  let match;
  while ((match = routeObjectRegex.exec(content)) !== null) {
    const routePath = match[1];
    const componentStr = match[2] || match[3];

    if (componentStr) {
      const componentPath = extractComponentPath(componentStr.trim());
      if (componentPath) {
        routes.push({
          path: routePath,
          componentPath,
        });
      }
    }
  }

  // Also try to parse children routes
  const childrenRegex =
    /children\s*:\s*\[\s*([\s\S]*?)\s*\](?=\s*[,}])/g;
  let childMatch;
  while ((childMatch = childrenRegex.exec(content)) !== null) {
    const childRoutes = parseRouteObjects(childMatch[1]);
    // Find parent route and attach children
    // For now, just add them as top-level routes
    routes.push(...childRoutes);
  }

  return routes;
}

/**
 * Resolves alias paths to actual file paths
 * @param aliasPath Path with alias (e.g., @/views/Home.vue)
 * @param frontendRoot Root directory of frontend source
 * @param aliasMap Map of aliases to actual paths
 */
export function resolveAliasPath(
  aliasPath: string,
  frontendRoot: string,
  aliasMap: Record<string, string> = { '@': 'src' }
): string {
  let resolvedPath = aliasPath;

  for (const [alias, actualPath] of Object.entries(aliasMap)) {
    if (resolvedPath.startsWith(alias)) {
      resolvedPath = resolvedPath.replace(alias, actualPath);
      break;
    }
  }

  // If path doesn't start with ./ or ../, prepend frontendRoot
  if (!resolvedPath.startsWith('.') && !path.isAbsolute(resolvedPath)) {
    resolvedPath = path.join(frontendRoot, resolvedPath);
  }

  return resolvedPath;
}

/**
 * Parses a router file and extracts route mappings
 * @param routerPath Path to the router configuration file
 * @returns Parsed routes and detected framework type
 * @see Requirements 2.1, 2.9
 */
export async function parseRouterFile(
  routerPath: string
): Promise<RouterParseResult> {
  const content = await fs.readFile(routerPath, 'utf-8');
  const framework = detectFrameworkType(content);

  let routes: RouteMapping[];
  if (framework === 'vue') {
    routes = parseVueRouterRoutes(content);
  } else {
    routes = parseReactRouterRoutes(content);
  }

  // Deduplicate routes by path
  const uniqueRoutes = new Map<string, RouteMapping>();
  for (const route of routes) {
    if (!uniqueRoutes.has(route.path)) {
      uniqueRoutes.set(route.path, route);
    }
  }

  return {
    framework,
    routes: Array.from(uniqueRoutes.values()),
  };
}

/**
 * Finds the component path for a given route
 * @param routes List of route mappings
 * @param routePath Route path to find
 * @returns Component path or null if not found
 */
export function findComponentForRoute(
  routes: RouteMapping[],
  routePath: string
): string | null {
  // Direct match
  const directMatch = routes.find((r) => r.path === routePath);
  if (directMatch) {
    return directMatch.componentPath;
  }

  // Try to match with/without trailing slash
  const normalizedPath = routePath.endsWith('/')
    ? routePath.slice(0, -1)
    : routePath;
  const withSlash = normalizedPath + '/';

  const match = routes.find(
    (r) => r.path === normalizedPath || r.path === withSlash
  );
  if (match) {
    return match.componentPath;
  }

  // Try to match dynamic segments (e.g., /users/:id matches /users/123)
  for (const route of routes) {
    const routePattern = route.path
      .replace(/:[^/]+/g, '[^/]+')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${routePattern}$`);
    if (regex.test(routePath)) {
      return route.componentPath;
    }
  }

  return null;
}

/**
 * Flattens nested routes into a flat list
 * @param routes Nested route mappings
 * @param parentPath Parent path prefix
 * @returns Flattened route list
 */
export function flattenRoutes(
  routes: RouteMapping[],
  parentPath: string = ''
): RouteMapping[] {
  const result: RouteMapping[] = [];

  for (const route of routes) {
    const fullPath = parentPath
      ? `${parentPath}/${route.path}`.replace(/\/+/g, '/')
      : route.path;

    result.push({
      ...route,
      path: fullPath,
    });

    if (route.children && route.children.length > 0) {
      result.push(...flattenRoutes(route.children, fullPath));
    }
  }

  return result;
}
