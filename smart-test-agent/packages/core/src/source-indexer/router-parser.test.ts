/**
 * Router Parser Unit Tests
 * @see Requirements 2.1, 2.9
 */

import { describe, it, expect } from 'vitest';
import {
  detectFrameworkType,
  resolveAliasPath,
  findComponentForRoute,
  flattenRoutes,
} from './router-parser.js';
import type { RouteMapping } from '@smart-test-agent/shared';

describe('Router Parser', () => {
  describe('detectFrameworkType', () => {
    it('should detect Vue Router from import statement', () => {
      const content = `
        import { createRouter, createWebHistory } from 'vue-router';
        const router = createRouter({
          history: createWebHistory(),
          routes: []
        });
      `;
      expect(detectFrameworkType(content)).toBe('vue');
    });

    it('should detect Vue Router from createRouter call', () => {
      const content = `
        const router = createRouter({
          history: createWebHistory(),
          routes: []
        });
      `;
      expect(detectFrameworkType(content)).toBe('vue');
    });

    it('should detect Vue Router from VueRouter constructor', () => {
      const content = `
        const router = new VueRouter({
          routes: []
        });
      `;
      expect(detectFrameworkType(content)).toBe('vue');
    });

    it('should detect Vue Router from dynamic import pattern', () => {
      const content = `
        const routes = [
          {
            path: '/home',
            component: () => import('@/views/Home.vue')
          }
        ];
      `;
      expect(detectFrameworkType(content)).toBe('vue');
    });

    it('should detect React Router from import statement', () => {
      const content = `
        import { createBrowserRouter, RouterProvider } from 'react-router-dom';
        const router = createBrowserRouter([]);
      `;
      expect(detectFrameworkType(content)).toBe('react');
    });

    it('should detect React Router from createBrowserRouter call', () => {
      const content = `
        const router = createBrowserRouter([
          { path: '/', element: <Home /> }
        ]);
      `;
      expect(detectFrameworkType(content)).toBe('react');
    });

    it('should detect React Router from JSX Route elements', () => {
      const content = `
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
        </Routes>
      `;
      expect(detectFrameworkType(content)).toBe('react');
    });

    it('should detect React Router from useRoutes hook', () => {
      const content = `
        const routes = useRoutes([
          { path: '/', element: <Home /> }
        ]);
      `;
      expect(detectFrameworkType(content)).toBe('react');
    });

    it('should default to vue when patterns are ambiguous', () => {
      const content = `
        const routes = [
          { path: '/', component: Home }
        ];
      `;
      expect(detectFrameworkType(content)).toBe('vue');
    });
  });

  describe('resolveAliasPath', () => {
    it('should resolve @ alias to src', () => {
      const result = resolveAliasPath('@/views/Home.vue', '/project');
      expect(result).toBe('/project/src/views/Home.vue');
    });

    it('should resolve custom alias', () => {
      const result = resolveAliasPath(
        '~/components/Button.vue',
        '/project',
        { '~': 'src/components' }
      );
      expect(result).toBe('/project/src/components/components/Button.vue');
    });

    it('should handle relative paths', () => {
      const result = resolveAliasPath('./components/Button.vue', '/project');
      expect(result).toBe('./components/Button.vue');
    });

    it('should handle paths without alias', () => {
      const result = resolveAliasPath('views/Home.vue', '/project');
      expect(result).toBe('/project/views/Home.vue');
    });
  });

  describe('findComponentForRoute', () => {
    const routes: RouteMapping[] = [
      { path: '/', componentPath: '@/views/Home.vue' },
      { path: '/about', componentPath: '@/views/About.vue' },
      { path: '/users/:id', componentPath: '@/views/UserDetail.vue' },
      { path: '/products/*', componentPath: '@/views/Products.vue' },
    ];

    it('should find exact route match', () => {
      expect(findComponentForRoute(routes, '/')).toBe('@/views/Home.vue');
      expect(findComponentForRoute(routes, '/about')).toBe('@/views/About.vue');
    });

    it('should handle trailing slash', () => {
      expect(findComponentForRoute(routes, '/about/')).toBe('@/views/About.vue');
    });

    it('should match dynamic segments', () => {
      expect(findComponentForRoute(routes, '/users/123')).toBe(
        '@/views/UserDetail.vue'
      );
      expect(findComponentForRoute(routes, '/users/abc')).toBe(
        '@/views/UserDetail.vue'
      );
    });

    it('should match wildcard routes', () => {
      expect(findComponentForRoute(routes, '/products/electronics')).toBe(
        '@/views/Products.vue'
      );
    });

    it('should return null for non-existent routes', () => {
      expect(findComponentForRoute(routes, '/nonexistent')).toBeNull();
    });
  });

  describe('flattenRoutes', () => {
    it('should flatten nested routes', () => {
      const routes: RouteMapping[] = [
        {
          path: '/admin',
          componentPath: '@/views/Admin.vue',
          children: [
            { path: 'users', componentPath: '@/views/admin/Users.vue' },
            { path: 'settings', componentPath: '@/views/admin/Settings.vue' },
          ],
        },
      ];

      const flattened = flattenRoutes(routes);

      expect(flattened).toHaveLength(3);
      expect(flattened[0].path).toBe('/admin');
      expect(flattened[1].path).toBe('/admin/users');
      expect(flattened[2].path).toBe('/admin/settings');
    });

    it('should handle deeply nested routes', () => {
      const routes: RouteMapping[] = [
        {
          path: '/a',
          componentPath: 'A.vue',
          children: [
            {
              path: 'b',
              componentPath: 'B.vue',
              children: [{ path: 'c', componentPath: 'C.vue' }],
            },
          ],
        },
      ];

      const flattened = flattenRoutes(routes);

      expect(flattened).toHaveLength(3);
      expect(flattened[2].path).toBe('/a/b/c');
    });

    it('should handle routes without children', () => {
      const routes: RouteMapping[] = [
        { path: '/home', componentPath: 'Home.vue' },
        { path: '/about', componentPath: 'About.vue' },
      ];

      const flattened = flattenRoutes(routes);

      expect(flattened).toHaveLength(2);
      expect(flattened[0].path).toBe('/home');
      expect(flattened[1].path).toBe('/about');
    });

    it('should normalize double slashes', () => {
      const routes: RouteMapping[] = [
        {
          path: '/admin/',
          componentPath: 'Admin.vue',
          children: [{ path: '/users', componentPath: 'Users.vue' }],
        },
      ];

      const flattened = flattenRoutes(routes);

      expect(flattened[1].path).toBe('/admin/users');
    });
  });
});
