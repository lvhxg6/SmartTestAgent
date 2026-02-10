/**
 * Selector Generator for Playwright
 * Implements Ant Design specific selector strategies
 * @see Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.10
 */

import type { AntdQuirksConfig, UIFramework } from '@smart-test-agent/shared';

/**
 * Selector priority order (highest to lowest)
 * @see Requirements 4.2
 */
export const SELECTOR_PRIORITY = [
  'getByRole',
  'getByText',
  'getByPlaceholder',
  'getByLabel',
  'getByTestId',
  'css',
] as const;

export type SelectorType = (typeof SELECTOR_PRIORITY)[number];

/**
 * Generated selector with metadata
 */
export interface GeneratedSelector {
  type: SelectorType;
  value: string;
  code: string;
  priority: number;
}

/**
 * Selector generation options
 */
export interface SelectorOptions {
  uiFramework: UIFramework;
  antdQuirks?: AntdQuirksConfig;
}

/**
 * Check if text is exactly two Chinese characters
 */
export function isTwoChineseChars(text: string): boolean {
  const chineseRegex = /^[\u4e00-\u9fa5]{2}$/;
  return chineseRegex.test(text.trim());
}

/**
 * Check if text contains Chinese characters
 */
export function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fa5]/.test(text);
}

/**
 * Generate button selector based on Ant Design quirks
 * @see Requirements 4.3, 4.4
 */
export function generateButtonSelector(
  buttonText: string,
  options: SelectorOptions
): GeneratedSelector {
  const { antdQuirks } = options;
  const trimmedText = buttonText.trim();

  // For two-character Chinese buttons with buttonTextSpace quirk, use regex
  if (antdQuirks?.buttonTextSpace && isTwoChineseChars(trimmedText)) {
    const chars = trimmedText.split('');
    const regexPattern = `/${chars[0]}.*${chars[1]}/`;
    return {
      type: 'getByRole',
      value: regexPattern,
      code: `page.getByRole('button', { name: ${regexPattern} })`,
      priority: 0,
    };
  }

  // For three or more characters, use exact match
  return {
    type: 'getByRole',
    value: trimmedText,
    code: `page.getByRole('button', { name: '${escapeString(trimmedText)}' })`,
    priority: 0,
  };
}

/**
 * Generate Select component selector for Ant Design
 * @see Requirements 4.5
 */
export function generateSelectSelector(
  selectIdentifier: string,
  options: SelectorOptions
): { trigger: string; option: (text: string) => string } {
  const { antdQuirks } = options;

  if (antdQuirks?.selectType === 'native') {
    return {
      trigger: `page.locator('select').filter({ hasText: '${escapeString(selectIdentifier)}' })`,
      option: (text: string) => `selectOption('${escapeString(text)}')`,
    };
  }

  // Custom Ant Design Select
  return {
    trigger: `page.locator('.ant-select').filter({ hasText: '${escapeString(selectIdentifier)}' }).locator('.ant-select-selector')`,
    option: (text: string) =>
      `page.locator('.ant-select-item-option').filter({ hasText: '${escapeString(text)}' })`,
  };
}

/**
 * Generate Modal close selector
 * @see Requirements 4.6
 */
export function generateModalCloseSelector(options: SelectorOptions): string {
  const closeSelector = options.antdQuirks?.modalCloseSelector || '.ant-modal-close';
  return `page.locator('${closeSelector}')`;
}

/**
 * Generate scroll into view code for viewport-external elements
 * @see Requirements 4.10
 */
export function generateScrollIntoView(selector: string): string {
  return `await ${selector}.scrollIntoViewIfNeeded()`;
}

/**
 * Generate selector by priority
 * @see Requirements 4.2
 */
export function generateSelectorByPriority(
  element: ElementDescription,
  options: SelectorOptions
): GeneratedSelector {
  // Try getByRole first
  if (element.role) {
    if (element.role === 'button' && element.text) {
      return generateButtonSelector(element.text, options);
    }
    return {
      type: 'getByRole',
      value: element.role,
      code: element.name
        ? `page.getByRole('${element.role}', { name: '${escapeString(element.name)}' })`
        : `page.getByRole('${element.role}')`,
      priority: 0,
    };
  }

  // Try getByText
  if (element.text) {
    return {
      type: 'getByText',
      value: element.text,
      code: `page.getByText('${escapeString(element.text)}')`,
      priority: 1,
    };
  }

  // Try getByPlaceholder
  if (element.placeholder) {
    return {
      type: 'getByPlaceholder',
      value: element.placeholder,
      code: `page.getByPlaceholder('${escapeString(element.placeholder)}')`,
      priority: 2,
    };
  }

  // Try getByLabel
  if (element.label) {
    return {
      type: 'getByLabel',
      value: element.label,
      code: `page.getByLabel('${escapeString(element.label)}')`,
      priority: 3,
    };
  }

  // Try getByTestId
  if (element.testId) {
    return {
      type: 'getByTestId',
      value: element.testId,
      code: `page.getByTestId('${escapeString(element.testId)}')`,
      priority: 4,
    };
  }

  // Fallback to CSS selector
  if (element.css) {
    return {
      type: 'css',
      value: element.css,
      code: `page.locator('${escapeString(element.css)}')`,
      priority: 5,
    };
  }

  throw new Error('No valid selector information provided');
}

/**
 * Element description for selector generation
 */
export interface ElementDescription {
  role?: string;
  name?: string;
  text?: string;
  placeholder?: string;
  label?: string;
  testId?: string;
  css?: string;
}

/**
 * Escape string for JavaScript code generation
 */
export function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Compare selector priorities
 * Returns negative if a has higher priority, positive if b has higher priority
 */
export function compareSelectorPriority(a: GeneratedSelector, b: GeneratedSelector): number {
  return a.priority - b.priority;
}
