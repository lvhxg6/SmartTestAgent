/**
 * Unit tests for Selector Generator
 * @see Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.10
 */

import { describe, it, expect } from 'vitest';
import {
  isTwoChineseChars,
  containsChinese,
  generateButtonSelector,
  generateSelectSelector,
  generateModalCloseSelector,
  generateScrollIntoView,
  generateSelectorByPriority,
  escapeString,
  compareSelectorPriority,
  SELECTOR_PRIORITY,
  type SelectorOptions,
  type ElementDescription,
} from './selector-generator.js';

describe('Selector Generator', () => {
  describe('isTwoChineseChars', () => {
    it('should return true for exactly two Chinese characters', () => {
      expect(isTwoChineseChars('确定')).toBe(true);
      expect(isTwoChineseChars('取消')).toBe(true);
      expect(isTwoChineseChars('关闭')).toBe(true);
      expect(isTwoChineseChars('保存')).toBe(true);
    });

    it('should return false for non-two Chinese characters', () => {
      expect(isTwoChineseChars('确')).toBe(false);
      expect(isTwoChineseChars('确定了')).toBe(false);
      expect(isTwoChineseChars('保存配置')).toBe(false);
      expect(isTwoChineseChars('OK')).toBe(false);
      expect(isTwoChineseChars('')).toBe(false);
    });

    it('should handle whitespace correctly', () => {
      expect(isTwoChineseChars(' 确定 ')).toBe(true);
      expect(isTwoChineseChars('确 定')).toBe(false);
    });

    it('should return false for mixed content', () => {
      expect(isTwoChineseChars('确定1')).toBe(false);
      expect(isTwoChineseChars('A确定')).toBe(false);
    });
  });

  describe('containsChinese', () => {
    it('should return true for strings containing Chinese', () => {
      expect(containsChinese('确定')).toBe(true);
      expect(containsChinese('Hello 世界')).toBe(true);
      expect(containsChinese('测试123')).toBe(true);
    });

    it('should return false for strings without Chinese', () => {
      expect(containsChinese('Hello')).toBe(false);
      expect(containsChinese('123')).toBe(false);
      expect(containsChinese('')).toBe(false);
    });
  });

  describe('generateButtonSelector', () => {
    const antdOptions: SelectorOptions = {
      uiFramework: 'antd',
      antdQuirks: {
        buttonTextSpace: true,
        selectType: 'custom',
        modalCloseSelector: '.ant-modal-close',
      },
    };

    const noQuirksOptions: SelectorOptions = {
      uiFramework: 'antd',
    };

    it('should generate regex pattern for two-char Chinese buttons with quirks', () => {
      const result = generateButtonSelector('确定', antdOptions);
      expect(result.type).toBe('getByRole');
      expect(result.code).toContain('/确.*定/');
      expect(result.priority).toBe(0);
    });

    it('should generate regex pattern for "关闭" button', () => {
      const result = generateButtonSelector('关闭', antdOptions);
      expect(result.code).toContain('/关.*闭/');
    });

    it('should generate exact match for three+ char buttons', () => {
      const result = generateButtonSelector('保存配置', antdOptions);
      expect(result.type).toBe('getByRole');
      expect(result.code).toContain("name: '保存配置'");
      expect(result.code).not.toContain('/');
    });

    it('should generate exact match when buttonTextSpace is false', () => {
      const result = generateButtonSelector('确定', noQuirksOptions);
      expect(result.code).toContain("name: '确定'");
      expect(result.code).not.toContain('/确.*定/');
    });

    it('should generate exact match for English buttons', () => {
      const result = generateButtonSelector('Submit', antdOptions);
      expect(result.code).toContain("name: 'Submit'");
    });

    it('should handle whitespace in button text', () => {
      const result = generateButtonSelector(' 确定 ', antdOptions);
      expect(result.code).toContain('/确.*定/');
    });
  });

  describe('generateSelectSelector', () => {
    it('should generate Ant Design custom select selectors', () => {
      const options: SelectorOptions = {
        uiFramework: 'antd',
        antdQuirks: {
          buttonTextSpace: true,
          selectType: 'custom',
          modalCloseSelector: '.ant-modal-close',
        },
      };

      const result = generateSelectSelector('状态', options);
      expect(result.trigger).toContain('.ant-select');
      expect(result.trigger).toContain('.ant-select-selector');
      expect(result.option('已完成')).toContain('.ant-select-item-option');
    });

    it('should generate native select selectors', () => {
      const options: SelectorOptions = {
        uiFramework: 'antd',
        antdQuirks: {
          buttonTextSpace: true,
          selectType: 'native',
          modalCloseSelector: '.ant-modal-close',
        },
      };

      const result = generateSelectSelector('状态', options);
      expect(result.trigger).toContain('select');
      expect(result.option('已完成')).toContain('selectOption');
    });
  });

  describe('generateModalCloseSelector', () => {
    it('should use custom modal close selector from quirks', () => {
      const options: SelectorOptions = {
        uiFramework: 'antd',
        antdQuirks: {
          buttonTextSpace: true,
          selectType: 'custom',
          modalCloseSelector: '.custom-modal-close',
        },
      };

      const result = generateModalCloseSelector(options);
      expect(result).toContain('.custom-modal-close');
    });

    it('should use default modal close selector', () => {
      const options: SelectorOptions = {
        uiFramework: 'antd',
      };

      const result = generateModalCloseSelector(options);
      expect(result).toContain('.ant-modal-close');
    });
  });

  describe('generateScrollIntoView', () => {
    it('should generate scrollIntoViewIfNeeded code', () => {
      const result = generateScrollIntoView('page.locator(".element")');
      expect(result).toContain('scrollIntoViewIfNeeded()');
      expect(result).toContain('page.locator(".element")');
    });
  });

  describe('generateSelectorByPriority', () => {
    const options: SelectorOptions = {
      uiFramework: 'antd',
      antdQuirks: {
        buttonTextSpace: true,
        selectType: 'custom',
        modalCloseSelector: '.ant-modal-close',
      },
    };

    it('should prioritize getByRole for buttons', () => {
      const element: ElementDescription = {
        role: 'button',
        text: '确定',
      };

      const result = generateSelectorByPriority(element, options);
      expect(result.type).toBe('getByRole');
      expect(result.priority).toBe(0);
    });

    it('should use getByRole with name for other roles', () => {
      const element: ElementDescription = {
        role: 'textbox',
        name: 'Username',
      };

      const result = generateSelectorByPriority(element, options);
      expect(result.type).toBe('getByRole');
      expect(result.code).toContain("getByRole('textbox'");
      expect(result.code).toContain("name: 'Username'");
    });

    it('should fallback to getByText', () => {
      const element: ElementDescription = {
        text: 'Some text',
      };

      const result = generateSelectorByPriority(element, options);
      expect(result.type).toBe('getByText');
      expect(result.priority).toBe(1);
    });

    it('should fallback to getByPlaceholder', () => {
      const element: ElementDescription = {
        placeholder: 'Enter username',
      };

      const result = generateSelectorByPriority(element, options);
      expect(result.type).toBe('getByPlaceholder');
      expect(result.priority).toBe(2);
    });

    it('should fallback to getByLabel', () => {
      const element: ElementDescription = {
        label: 'Username',
      };

      const result = generateSelectorByPriority(element, options);
      expect(result.type).toBe('getByLabel');
      expect(result.priority).toBe(3);
    });

    it('should fallback to getByTestId', () => {
      const element: ElementDescription = {
        testId: 'submit-btn',
      };

      const result = generateSelectorByPriority(element, options);
      expect(result.type).toBe('getByTestId');
      expect(result.priority).toBe(4);
    });

    it('should fallback to CSS selector', () => {
      const element: ElementDescription = {
        css: '.my-button',
      };

      const result = generateSelectorByPriority(element, options);
      expect(result.type).toBe('css');
      expect(result.priority).toBe(5);
    });

    it('should throw error when no selector info provided', () => {
      const element: ElementDescription = {};

      expect(() => generateSelectorByPriority(element, options)).toThrow(
        'No valid selector information provided'
      );
    });
  });

  describe('escapeString', () => {
    it('should escape single quotes', () => {
      expect(escapeString("it's")).toBe("it\\'s");
    });

    it('should escape double quotes', () => {
      expect(escapeString('say "hello"')).toBe('say \\"hello\\"');
    });

    it('should escape backslashes', () => {
      expect(escapeString('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('should escape newlines', () => {
      expect(escapeString('line1\nline2')).toBe('line1\\nline2');
    });

    it('should escape tabs', () => {
      expect(escapeString('col1\tcol2')).toBe('col1\\tcol2');
    });

    it('should handle empty string', () => {
      expect(escapeString('')).toBe('');
    });
  });

  describe('compareSelectorPriority', () => {
    it('should return negative when first has higher priority', () => {
      const a = { type: 'getByRole' as const, value: '', code: '', priority: 0 };
      const b = { type: 'getByText' as const, value: '', code: '', priority: 1 };
      expect(compareSelectorPriority(a, b)).toBeLessThan(0);
    });

    it('should return positive when second has higher priority', () => {
      const a = { type: 'css' as const, value: '', code: '', priority: 5 };
      const b = { type: 'getByRole' as const, value: '', code: '', priority: 0 };
      expect(compareSelectorPriority(a, b)).toBeGreaterThan(0);
    });

    it('should return zero for equal priority', () => {
      const a = { type: 'getByRole' as const, value: '', code: '', priority: 0 };
      const b = { type: 'getByRole' as const, value: '', code: '', priority: 0 };
      expect(compareSelectorPriority(a, b)).toBe(0);
    });
  });

  describe('SELECTOR_PRIORITY', () => {
    it('should have correct priority order', () => {
      expect(SELECTOR_PRIORITY[0]).toBe('getByRole');
      expect(SELECTOR_PRIORITY[1]).toBe('getByText');
      expect(SELECTOR_PRIORITY[2]).toBe('getByPlaceholder');
      expect(SELECTOR_PRIORITY[3]).toBe('getByLabel');
      expect(SELECTOR_PRIORITY[4]).toBe('getByTestId');
      expect(SELECTOR_PRIORITY[5]).toBe('css');
    });
  });
});
