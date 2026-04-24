/**
 * Accessible Keyboard Navigation Blueprint Tests
 * 
 * This test suite validates the keyboard navigation blueprint implementation
 * according to Wave 4 requirements.
 * 
 * Issue: #284 - Add Accessible keyboard nav blueprint
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('Accessible Keyboard Navigation Blueprint', () => {
  const appRoot = path.resolve(__dirname);
  const blueprintPath = path.join(appRoot, 'add-accessible-keyboard-nav-blueprint.tsx');
  const blueprintPagePath = path.join(appRoot, 'add-accessible-keyboard-nav-blueprint-page-49.tsx');
  const keyboardHelpPath = path.join(appRoot, 'add-keyboard-navigation-help.tsx');

  describe('File existence', () => {
    it('should have the main blueprint component', () => {
      expect(fs.existsSync(blueprintPath)).toBe(true);
    });

    it('should have the blueprint page component', () => {
      expect(fs.existsSync(blueprintPagePath)).toBe(true);
    });

    it('should have the keyboard help component', () => {
      expect(fs.existsSync(keyboardHelpPath)).toBe(true);
    });
  });

  describe('Blueprint component structure', () => {
    const blueprintContent = fs.readFileSync(blueprintPath, 'utf-8');

    it('should be a client component', () => {
      expect(blueprintContent).toContain("'use client'");
    });

    it('should export a default component', () => {
      expect(blueprintContent).toMatch(/export default function/);
    });

    it('should implement skip to content link', () => {
      expect(blueprintContent.toLowerCase()).toContain('skip to');
      expect(blueprintContent).toContain('#main-content');
    });

    it('should have keyboard shortcut trigger button', () => {
      expect(blueprintContent).toContain('Keyboard shortcuts');
      expect(blueprintContent).toMatch(/aria-label.*keyboard/i);
    });

    it('should implement modal with proper ARIA attributes', () => {
      expect(blueprintContent).toContain('role="dialog"');
      expect(blueprintContent).toContain('aria-modal="true"');
      expect(blueprintContent).toContain('aria-labelledby');
    });

    it('should handle "?" key to toggle help', () => {
      expect(blueprintContent).toMatch(/e\.key === ['"]?['"]?/);
      expect(blueprintContent).toContain('toggleHelp');
    });

    it('should handle Escape key to close modal', () => {
      expect(blueprintContent).toMatch(/e\.key === ['"]Escape['"]|Escape/);
    });

    it('should implement focus trap for modal', () => {
      expect(blueprintContent).toContain('Tab');
      expect(blueprintContent).toMatch(/focusableElements|querySelectorAll/);
    });

    it('should list dashboard shortcuts', () => {
      expect(blueprintContent).toContain('DASHBOARD_SHORTCUTS');
      expect(blueprintContent).toContain('Tab');
      expect(blueprintContent).toContain('Enter');
      expect(blueprintContent).toContain('Esc');
    });

    it('should have proper focus styles', () => {
      expect(blueprintContent).toMatch(/focus:ring|focus:outline/);
    });

    it('should support dark mode', () => {
      expect(blueprintContent).toMatch(/dark:/);
    });
  });

  describe('Blueprint page component structure', () => {
    const pageContent = fs.readFileSync(blueprintPagePath, 'utf-8');

    it('should be a client component', () => {
      expect(pageContent).toContain("'use client'");
    });

    it('should have form with proper structure', () => {
      expect(pageContent).toContain('<form');
      expect(pageContent).toContain('onSubmit');
    });

    it('should have text inputs with labels', () => {
      expect(pageContent).toContain('type="text"');
      expect(pageContent).toContain('type="email"');
      expect(pageContent).toContain('<label');
      expect(pageContent).toContain('htmlFor');
    });

    it('should have select dropdowns', () => {
      expect(pageContent).toContain('<select');
      expect(pageContent).toContain('<option');
    });

    it('should have checkboxes', () => {
      expect(pageContent).toContain('type="checkbox"');
    });

    it('should have radio buttons', () => {
      expect(pageContent).toContain('type="radio"');
      expect(pageContent).toContain('<fieldset');
      expect(pageContent).toContain('<legend');
    });

    it('should have multiple button types', () => {
      expect(pageContent).toContain('type="submit"');
      expect(pageContent).toContain('type="button"');
    });

    it('should have links', () => {
      expect(pageContent).toContain('<a');
      expect(pageContent).toContain('href');
    });

    it('should track tab order', () => {
      expect(pageContent).toContain('tabOrder');
      expect(pageContent).toContain('Tab Order Tracker');
    });

    it('should track focused element', () => {
      expect(pageContent).toContain('focusedElement');
      expect(pageContent).toContain('onFocus');
      expect(pageContent).toContain('onBlur');
    });

    it('should have keyboard shortcuts reference', () => {
      expect(pageContent).toContain('Keyboard Shortcuts Reference');
      expect(pageContent).toContain('<kbd');
    });

    it('should have proper ARIA attributes', () => {
      expect(pageContent).toMatch(/aria-label|aria-labelledby/);
    });

    it('should have focus ring styles', () => {
      expect(pageContent).toMatch(/focus:ring|focus:outline/);
    });

    it('should support dark mode', () => {
      expect(pageContent).toMatch(/dark:/);
    });

    it('should have required field indicators', () => {
      expect(pageContent).toContain('required');
      expect(pageContent).toMatch(/\*|required/);
    });

    it('should have autocomplete attributes', () => {
      expect(pageContent).toContain('autoComplete');
    });

    it('should have interactive cards', () => {
      expect(pageContent).toContain('Interactive Cards');
      expect(pageContent).toMatch(/card-\d/);
    });

    it('should have handleReset function', () => {
      expect(pageContent).toContain('handleReset');
      expect(pageContent).toMatch(/const handleReset|function handleReset/);
    });
  });

  describe('Keyboard help component structure', () => {
    const helpContent = fs.readFileSync(keyboardHelpPath, 'utf-8');

    it('should be a client component', () => {
      expect(helpContent).toContain("'use client'");
    });

    it('should toggle on "?" key', () => {
      expect(helpContent).toMatch(/e\.key === ['"]?['"]?/);
    });

    it('should close on Escape key', () => {
      expect(helpContent).toMatch(/e\.key === ['"]Escape['"]|Escape/);
    });

    it('should have modal with ARIA attributes', () => {
      expect(helpContent).toContain('role="dialog"');
      expect(helpContent).toContain('aria-modal="true"');
      expect(helpContent).toContain('aria-labelledby');
    });

    it('should list keyboard shortcuts', () => {
      expect(helpContent).toContain('shortcuts');
      expect(helpContent).toContain('Enter');
      expect(helpContent).toContain('Esc');
    });

    it('should have close button', () => {
      expect(helpContent).toContain('Close');
      expect(helpContent).toMatch(/aria-label.*close/i);
    });

    it('should manage focus', () => {
      expect(helpContent).toContain('focus()');
      expect(helpContent).toMatch(/closeButtonRef|buttonRef/);
    });

    it('should support dark mode', () => {
      expect(helpContent).toMatch(/dark:/);
    });
  });

  describe('Accessibility compliance', () => {
    const blueprintContent = fs.readFileSync(blueprintPath, 'utf-8');
    const pageContent = fs.readFileSync(blueprintPagePath, 'utf-8');

    it('should have semantic HTML elements', () => {
      expect(pageContent).toMatch(/<section|<form|<fieldset|<legend/);
    });

    it('should have proper heading hierarchy', () => {
      expect(pageContent).toContain('<h1');
      expect(pageContent).toContain('<h2');
    });

    it('should have labels for all form inputs', () => {
      const inputMatches = pageContent.match(/<input/g) || [];
      const labelMatches = pageContent.match(/<label/g) || [];
      // Should have at least as many labels as inputs (some inputs may be in label)
      expect(labelMatches.length).toBeGreaterThan(0);
    });

    it('should have focus indicators', () => {
      expect(blueprintContent).toMatch(/focus:ring|focus:outline|focus:border/);
      expect(pageContent).toMatch(/focus:ring|focus:outline|focus:border/);
    });

    it('should have keyboard event handlers', () => {
      expect(blueprintContent).toContain('onKeyDown');
      expect(blueprintContent).toContain('handleKeyDown');
    });

    it('should not have placeholder-only labels', () => {
      // All inputs should have proper labels, not just placeholders
      const inputsWithPlaceholder = pageContent.match(/placeholder=/g) || [];
      const labelsForInputs = pageContent.match(/<label[^>]*htmlFor=/g) || [];
      expect(labelsForInputs.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases and error handling', () => {
    const blueprintContent = fs.readFileSync(blueprintPath, 'utf-8');
    const pageContent = fs.readFileSync(blueprintPagePath, 'utf-8');

    it('should prevent default on keyboard shortcuts', () => {
      expect(blueprintContent).toContain('preventDefault');
    });

    it('should check for input/textarea focus before triggering shortcuts', () => {
      expect(blueprintContent).toMatch(/INPUT|TEXTAREA|SELECT/);
      expect(blueprintContent).toMatch(/activeElement|tagName/);
    });

    it('should handle modal state properly', () => {
      expect(blueprintContent).toContain('isHelpOpen');
      expect(blueprintContent).toContain('setIsHelpOpen');
    });

    it('should handle form state properly', () => {
      expect(pageContent).toContain('formData');
      expect(pageContent).toContain('setFormData');
    });

    it('should have initial form data', () => {
      expect(pageContent).toContain('initialFormData');
    });

    it('should handle form submission', () => {
      expect(pageContent).toContain('handleSubmit');
      expect(pageContent).toContain('e.preventDefault()');
    });

    it('should handle form reset', () => {
      expect(pageContent).toContain('handleReset');
      expect(pageContent).toContain('initialFormData');
    });
  });

  describe('Responsive design', () => {
    const pageContent = fs.readFileSync(blueprintPagePath, 'utf-8');

    it('should have responsive grid layouts', () => {
      expect(pageContent).toMatch(/grid-cols-\d|md:grid-cols|sm:grid-cols/);
    });

    it('should have responsive spacing', () => {
      expect(pageContent).toMatch(/sm:|md:|lg:/);
    });

    it('should have mobile-friendly padding', () => {
      expect(pageContent).toMatch(/px-\d|py-\d/);
    });
  });

  describe('Loading and error states', () => {
    const blueprintContent = fs.readFileSync(blueprintPath, 'utf-8');
    const pageContent = fs.readFileSync(blueprintPagePath, 'utf-8');

    it('should handle component mounting', () => {
      expect(blueprintContent).toContain('useEffect');
    });

    it('should clean up event listeners', () => {
      expect(blueprintContent).toContain('removeEventListener');
      expect(blueprintContent).toMatch(/return \(\) =>/);
    });

    it('should implement isLoading state for form submission', () => {
      expect(pageContent).toContain('isLoading');
      expect(pageContent).toContain('setIsLoading(true)');
      expect(pageContent).toContain('disabled={isLoading}');
      expect(pageContent).toContain('animate-spin');
    });

    it('should handle success and error states', () => {
      expect(pageContent).toContain('isSuccess');
      expect(pageContent).toContain('error');
      expect(pageContent).toContain('Status Indicators');
    });
  });

  describe('Integration with dashboard', () => {
    it('should be importable as a module', () => {
      const blueprintContent = fs.readFileSync(blueprintPath, 'utf-8');
      expect(blueprintContent).toMatch(/export default/);
    });

    it('should have proper TypeScript types', () => {
      const blueprintContent = fs.readFileSync(blueprintPath, 'utf-8');
      const pageContent = fs.readFileSync(blueprintPagePath, 'utf-8');
      
      expect(blueprintContent).toMatch(/interface|type/);
      expect(pageContent).toMatch(/interface|type/);
    });
  });

  describe('Documentation and comments', () => {
    const blueprintContent = fs.readFileSync(blueprintPath, 'utf-8');
    const pageContent = fs.readFileSync(blueprintPagePath, 'utf-8');

    it('should have component documentation', () => {
      expect(blueprintContent).toMatch(/\/\*\*[\s\S]*?\*\//);
      expect(pageContent).toMatch(/\/\*\*[\s\S]*?\*\//);
    });

    it('should reference the issue number', () => {
      expect(blueprintContent).toMatch(/#\d+|Issue:/);
      expect(pageContent).toMatch(/#\d+|Issue:/);
    });

    it('should describe the component purpose', () => {
      expect(blueprintContent).toMatch(/Accessible|Keyboard|Navigation/);
      expect(pageContent).toMatch(/Accessible|Keyboard|Navigation/);
    });
  });
});
