/**
 * Source Indexer Module
 * Parses frontend source code to extract test context
 * @see Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  RouteMapping,
  ExtractedComponent,
  ExtractedApi,
  SourceContext,
  FrameworkType,
  TargetProfile,
  ApiEndpoint,
} from '@smart-test-agent/shared';

// Re-export sub-modules
export * from './router-parser.js';
export * from './vue-extractor.js';
export * from './react-extractor.js';

import {
  parseRouterFile,
  findComponentForRoute,
  resolveAliasPath,
  flattenRoutes,
  detectFrameworkType,
} from './router-parser.js';
import { extractVueComponent } from './vue-extractor.js';
import { extractReactComponent } from './react-extractor.js';

/**
 * Source Indexer class
 * Main interface for extracting test context from frontend source code
 */
export class SourceIndexer {
  private aliasMap: Record<string, string>;

  constructor(aliasMap: Record<string, string> = { '@': 'src' }) {
    this.aliasMap = aliasMap;
  }

  /**
   * Parses the router file and extracts route mappings
   * @param routerPath Path to the router configuration file
   * @returns Array of route mappings
   * @see Requirements 2.1
   */
  async parseRouterFile(routerPath: string): Promise<RouteMapping[]> {
    const result = await parseRouterFile(routerPath);
    return flattenRoutes(result.routes);
  }

  /**
   * Extracts component information from a page component file
   * @param componentPath Path to the component file
   * @returns Extracted component information
   * @see Requirements 2.2, 2.4, 2.5, 2.6, 2.7, 2.8
   */
  async extractPageComponent(
    componentPath: string
  ): Promise<ExtractedComponent> {
    const ext = path.extname(componentPath).toLowerCase();

    if (ext === '.vue') {
      return extractVueComponent(componentPath);
    } else if (ext === '.tsx' || ext === '.jsx' || ext === '.js' || ext === '.ts') {
      return extractReactComponent(componentPath);
    }

    throw new Error(`Unsupported component file type: ${ext}`);
  }

  /**
   * Extracts API definitions from an API file
   * @param apiPath Path to the API definition file
   * @returns Extracted API information
   * @see Requirements 2.2
   */
  async extractApiDefinition(apiPath: string): Promise<ExtractedApi> {
    const content = await fs.readFile(apiPath, 'utf-8');
    const endpoints = this.parseApiEndpoints(content);

    return {
      filePath: apiPath,
      endpoints,
    };
  }

  /**
   * Parses API endpoints from file content
   */
  private parseApiEndpoints(content: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];

    // Pattern 1: export const apiName = (params) => request.get/post/put/delete('path')
    const exportConstRegex =
      /export\s+(?:const|function)\s+(\w+)\s*=?\s*(?:\([^)]*\)\s*(?:=>|:))?\s*[^{]*(?:request|axios|http|api)\s*\.\s*(get|post|put|delete|patch)\s*(?:<[^>]+>)?\s*\(\s*['"`]([^'"`]+)['"`]/gi;

    let match;
    while ((match = exportConstRegex.exec(content)) !== null) {
      endpoints.push({
        name: match[1],
        method: match[2].toUpperCase() as ApiEndpoint['method'],
        path: match[3],
      });
    }

    // Pattern 2: { method: 'GET', url: '/api/...' }
    const objectPatternRegex =
      /(?:method|type)\s*:\s*['"](\w+)['"]\s*,\s*(?:url|path)\s*:\s*['"]([^'"]+)['"]/gi;

    while ((match = objectPatternRegex.exec(content)) !== null) {
      endpoints.push({
        name: `endpoint_${endpoints.length}`,
        method: match[1].toUpperCase() as ApiEndpoint['method'],
        path: match[2],
      });
    }

    return endpoints;
  }

  /**
   * Detects the frontend framework type from router file
   * @param routerPath Path to the router configuration file
   * @returns Detected framework type
   * @see Requirements 2.9
   */
  async detectFrameworkType(routerPath: string): Promise<FrameworkType> {
    const content = await fs.readFile(routerPath, 'utf-8');
    return detectFrameworkType(content);
  }

  /**
   * Generates complete source context for a route
   * @param route Route path to generate context for
   * @param profile Target profile with source code configuration
   * @returns Complete source context
   * @see Requirements 2.3
   */
  async generateSourceContext(
    route: string,
    profile: TargetProfile
  ): Promise<SourceContext> {
    const { sourceCode } = profile;
    const routerPath = path.join(
      sourceCode.frontendRoot,
      sourceCode.routerFile
    );

    // Parse router and detect framework
    const parseResult = await parseRouterFile(routerPath);
    const routes = flattenRoutes(parseResult.routes);
    const framework = parseResult.framework;

    // Find component for route
    const componentRelPath = findComponentForRoute(routes, route);
    if (!componentRelPath) {
      throw new Error(`No component found for route: ${route}`);
    }

    // Resolve component path
    const componentPath = resolveAliasPath(
      componentRelPath,
      sourceCode.frontendRoot,
      this.aliasMap
    );

    // Extract component
    const component = await this.extractPageComponent(componentPath);

    // Extract API definitions
    const apis: ExtractedApi[] = [];
    for (const apiImport of component.apiImports) {
      try {
        const apiPath = resolveAliasPath(
          apiImport,
          sourceCode.frontendRoot,
          this.aliasMap
        );
        // Add extension if missing
        const apiPathWithExt = await this.resolveFileWithExtension(apiPath);
        if (apiPathWithExt) {
          const api = await this.extractApiDefinition(apiPathWithExt);
          apis.push(api);
        }
      } catch {
        // Skip if API file cannot be read
        console.warn(`Could not extract API from: ${apiImport}`);
      }
    }

    return {
      route,
      component,
      apis,
      framework,
    };
  }

  /**
   * Resolves a file path by trying common extensions
   */
  private async resolveFileWithExtension(
    basePath: string
  ): Promise<string | null> {
    // If path already has extension, check if it exists
    if (path.extname(basePath)) {
      try {
        await fs.access(basePath);
        return basePath;
      } catch {
        return null;
      }
    }

    // Try common extensions
    const extensions = ['.ts', '.js', '.tsx', '.jsx', '/index.ts', '/index.js'];
    for (const ext of extensions) {
      const fullPath = basePath + ext;
      try {
        await fs.access(fullPath);
        return fullPath;
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Outputs source context to workspace directory
   * @param context Source context to output
   * @param workspacePath Workspace directory path
   * @see Requirements 2.3
   */
  async outputSourceContext(
    context: SourceContext,
    workspacePath: string
  ): Promise<void> {
    const sourceContextDir = path.join(workspacePath, 'source-context');
    await fs.mkdir(sourceContextDir, { recursive: true });

    // Write component info
    const componentFile = path.join(
      sourceContextDir,
      `component-${path.basename(context.component.filePath)}.json`
    );
    await fs.writeFile(
      componentFile,
      JSON.stringify(context.component, null, 2)
    );

    // Write API info
    for (const api of context.apis) {
      const apiFile = path.join(
        sourceContextDir,
        `api-${path.basename(api.filePath)}.json`
      );
      await fs.writeFile(apiFile, JSON.stringify(api, null, 2));
    }

    // Write summary
    const summaryFile = path.join(sourceContextDir, 'context-summary.json');
    await fs.writeFile(
      summaryFile,
      JSON.stringify(
        {
          route: context.route,
          framework: context.framework,
          componentPath: context.component.filePath,
          truncated: context.component.truncated,
          apiCount: context.apis.length,
        },
        null,
        2
      )
    );
  }
}

// Default export
export default SourceIndexer;
