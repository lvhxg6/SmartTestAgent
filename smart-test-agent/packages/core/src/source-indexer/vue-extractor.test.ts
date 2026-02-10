/**
 * Vue Extractor Unit Tests
 * @see Requirements 2.2, 2.4, 2.5, 2.7
 */

import { describe, it, expect } from 'vitest';
import { extractVueComponentFromContent } from './vue-extractor.js';

describe('Vue Extractor', () => {
  describe('extractVueComponentFromContent', () => {
    it('should extract template section', () => {
      const content = `
<template>
  <div class="container">
    <h1>Hello World</h1>
  </div>
</template>

<script>
export default {
  name: 'HelloWorld'
}
</script>
`;
      const result = extractVueComponentFromContent(content);

      expect(result.framework).toBe('vue');
      expect(result.template).toContain('<div class="container">');
      expect(result.template).toContain('<h1>Hello World</h1>');
      expect(result.truncated).toBe(false);
    });

    it('should extract script section', () => {
      const content = `
<template>
  <div>Test</div>
</template>

<script>
import { ref } from 'vue';

export default {
  name: 'TestComponent',
  setup() {
    const count = ref(0);
    return { count };
  }
}
</script>
`;
      const result = extractVueComponentFromContent(content);

      expect(result.scriptExports).toContain('export default');
      expect(result.scriptExports).toContain("name: 'TestComponent'");
    });

    it('should extract API imports', () => {
      const content = `
<template>
  <div>Test</div>
</template>

<script>
import { getUserList, createUser } from '@/api/user';
import { getProducts } from '../api/product';

export default {
  name: 'TestComponent'
}
</script>
`;
      const result = extractVueComponentFromContent(content);

      expect(result.apiImports).toContain('@/api/user');
      expect(result.apiImports).toContain('../api/product');
    });

    it('should handle script setup syntax', () => {
      const content = `
<template>
  <div>{{ count }}</div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { fetchData } from '@/api/data';

const count = ref(0);
const doubled = computed(() => count.value * 2);

function increment() {
  count.value++;
}
</script>
`;
      const result = extractVueComponentFromContent(content);

      expect(result.scriptExports).toContain('ref');
      expect(result.apiImports).toContain('@/api/data');
    });

    it('should handle TypeScript script', () => {
      const content = `
<template>
  <div>{{ message }}</div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import type { User } from '@/types';

export default defineComponent({
  name: 'TypedComponent',
  setup() {
    const message = ref<string>('Hello');
    return { message };
  }
});
</script>
`;
      const result = extractVueComponentFromContent(content);

      expect(result.scriptExports).toContain('defineComponent');
    });

    it('should mark truncated for files over 500 lines', () => {
      // Generate a file with more than 500 lines
      const lines = Array(600).fill('<div>Line</div>').join('\n');
      const content = `
<template>
${lines}
</template>

<script>
export default {
  name: 'LargeComponent',
  data() {
    return { value: 1 };
  },
  methods: {
    doSomething() {}
  }
}
</script>
`;
      const result = extractVueComponentFromContent(content);

      expect(result.truncated).toBe(true);
    });

    it('should handle empty template', () => {
      const content = `
<template></template>

<script>
export default {
  name: 'EmptyTemplate'
}
</script>
`;
      const result = extractVueComponentFromContent(content);

      // Empty template returns undefined (trimmed empty string becomes falsy)
      expect(result.template).toBeUndefined();
    });

    it('should handle component without script', () => {
      const content = `
<template>
  <div>Static content</div>
</template>
`;
      const result = extractVueComponentFromContent(content);

      expect(result.template).toContain('Static content');
      expect(result.scriptExports).toBeUndefined();
    });

    it('should deduplicate API imports', () => {
      const content = `
<template>
  <div>Test</div>
</template>

<script>
import { getUser } from '@/api/user';
import { updateUser } from '@/api/user';

export default {}
</script>
`;
      const result = extractVueComponentFromContent(content);

      // Should only have one entry for @/api/user
      const userApiCount = result.apiImports.filter(
        (i) => i === '@/api/user'
      ).length;
      expect(userApiCount).toBe(1);
    });
  });
});
