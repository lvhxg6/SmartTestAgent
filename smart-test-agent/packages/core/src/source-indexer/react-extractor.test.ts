/**
 * React Extractor Unit Tests
 * @see Requirements 2.2, 2.4, 2.6, 2.8
 */

import { describe, it, expect } from 'vitest';
import { extractReactComponentFromContent } from './react-extractor.js';

describe('React Extractor', () => {
  describe('extractReactComponentFromContent', () => {
    it('should extract JSX return statement', () => {
      const content = `
import React from 'react';

function HelloWorld() {
  return (
    <div className="container">
      <h1>Hello World</h1>
    </div>
  );
}

export default HelloWorld;
`;
      const result = extractReactComponentFromContent(content);

      expect(result.framework).toBe('react');
      expect(result.jsxContent).toContain('<div className="container">');
      expect(result.jsxContent).toContain('<h1>Hello World</h1>');
      expect(result.truncated).toBe(false);
    });

    it('should extract useState hooks', () => {
      const content = `
import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');

  return <div>{count}</div>;
}
`;
      const result = extractReactComponentFromContent(content);

      expect(result.hooksContent).toContain('const [count, setCount] = useState(0)');
      expect(result.hooksContent).toContain("const [name, setName] = useState('')");
    });

    it('should extract useEffect hooks', () => {
      const content = `
import React, { useState, useEffect } from 'react';

function DataFetcher() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchData().then(setData);
  }, []);

  useEffect(() => {
    console.log('Data changed:', data);
  }, [data]);

  return <div>{data}</div>;
}
`;
      const result = extractReactComponentFromContent(content);

      expect(result.hooksContent).toContain('useEffect(() => { ... }, [])');
      expect(result.hooksContent).toContain('useEffect(() => { ... }, [data])');
    });

    it('should extract other hooks (useMemo, useCallback, useRef)', () => {
      const content = `
import React, { useState, useMemo, useCallback, useRef } from 'react';

function OptimizedComponent({ items }) {
  const [filter, setFilter] = useState('');
  const inputRef = useRef(null);

  const filteredItems = useMemo(() => {
    return items.filter(item => item.includes(filter));
  }, [items, filter]);

  const handleClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return <div>{filteredItems.length}</div>;
}
`;
      const result = extractReactComponentFromContent(content);

      expect(result.hooksContent).toContain('const filteredItems = useMemo(...)');
      expect(result.hooksContent).toContain('const handleClick = useCallback(...)');
      expect(result.hooksContent).toContain('const inputRef = useRef(null)');
    });

    it('should extract API imports', () => {
      const content = `
import React from 'react';
import { getUsers, createUser } from '@/api/users';
import { fetchProducts } from '../services/product';

function UserList() {
  return <div>Users</div>;
}
`;
      const result = extractReactComponentFromContent(content);

      expect(result.apiImports).toContain('@/api/users');
      expect(result.apiImports).toContain('../services/product');
    });

    it('should handle arrow function components', () => {
      const content = `
import React from 'react';

const ArrowComponent = ({ name }) => {
  return (
    <div>
      <span>{name}</span>
    </div>
  );
};

export default ArrowComponent;
`;
      const result = extractReactComponentFromContent(content);

      expect(result.jsxContent).toContain('<span>{name}</span>');
    });

    it('should handle TypeScript components', () => {
      const content = `
import React, { useState } from 'react';

interface Props {
  initialCount: number;
}

const TypedCounter: React.FC<Props> = ({ initialCount }) => {
  const [count, setCount] = useState<number>(initialCount);

  return <div>{count}</div>;
};

export default TypedCounter;
`;
      const result = extractReactComponentFromContent(content);

      expect(result.hooksContent).toContain('useState<number>(initialCount)');
    });

    it('should mark truncated for files over 500 lines', () => {
      // Generate a file with more than 500 lines
      const lines = Array(600).fill('  <div>Line</div>').join('\n');
      const content = `
import React from 'react';

function LargeComponent() {
  const [state, setState] = useState(0);

  useEffect(() => {
    console.log('mounted');
  }, []);

  return (
    <div>
${lines}
    </div>
  );
}

export default LargeComponent;
`;
      const result = extractReactComponentFromContent(content);

      expect(result.truncated).toBe(true);
    });

    it('should extract component signature for large files', () => {
      const lines = Array(600).fill('  <div>Line</div>').join('\n');
      const content = `
import React, { useState } from 'react';

function LargeComponent({ prop1, prop2 }) {
  const [count, setCount] = useState(0);

  return (
    <div>
${lines}
    </div>
  );
}
`;
      const result = extractReactComponentFromContent(content);

      expect(result.truncated).toBe(true);
      expect(result.hooksContent).toContain('function LargeComponent({ prop1, prop2 })');
    });

    it('should handle custom hooks', () => {
      const content = `
import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from 'react-query';

function Dashboard() {
  const { user, logout } = useAuth();
  const { data } = useQuery('dashboard', fetchDashboard);

  return <div>{user?.name}</div>;
}
`;
      const result = extractReactComponentFromContent(content);

      expect(result.hooksContent).toContain('useAuth()');
      expect(result.hooksContent).toContain('useQuery');
    });

    it('should handle useContext', () => {
      const content = `
import React, { useContext } from 'react';
import { ThemeContext } from '@/contexts/theme';

function ThemedButton() {
  const theme = useContext(ThemeContext);

  return <button style={{ color: theme.primary }}>Click</button>;
}
`;
      const result = extractReactComponentFromContent(content);

      expect(result.hooksContent).toContain('const theme = useContext(ThemeContext)');
    });

    it('should handle component without hooks', () => {
      const content = `
import React from 'react';

function StaticComponent() {
  return <div>Static content</div>;
}
`;
      const result = extractReactComponentFromContent(content);

      expect(result.jsxContent).toContain('Static content');
      expect(result.hooksContent).toBeUndefined();
    });

    it('should handle JSX without parentheses', () => {
      const content = `
import React from 'react';

function SimpleComponent() {
  return <span>Simple</span>;
}
`;
      const result = extractReactComponentFromContent(content);

      expect(result.jsxContent).toContain('<span>Simple</span>');
    });
  });
});
