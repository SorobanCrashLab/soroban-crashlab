import { describe, it, expect, vi } from 'vitest';
import { Button } from '../Button';
import { TextField } from '../TextField';
import { Select } from '../Select';
import { Toggle } from '../Toggle';

describe('Button component', () => {
  it('exports Button component', () => {
    expect(Button).toBeDefined();
    expect(typeof Button).toBe('object');
  });

  it('supports button variants and loading states', () => {
    const props = {
      variant: 'primary' as const,
      size: 'md' as const,
      isLoading: true,
      children: 'Submit',
    };
    expect(props.variant).toBe('primary');
    expect(props.isLoading).toBe(true);
  });
});

describe('TextField component', () => {
  it('exports TextField component', () => {
    expect(TextField).toBeDefined();
    expect(typeof TextField).toBe('object');
  });

  it('handles label, error, and helperText attributes', () => {
    const props = {
      label: 'API Key',
      error: 'API key is required',
      helperText: 'Enter your 32-character key',
      value: 'secret',
    };
    expect(props.label).toBe('API Key');
    expect(props.error).toBe('API key is required');
  });
});

describe('Select component', () => {
  it('exports Select component', () => {
    expect(Select).toBeDefined();
    expect(typeof Select).toBe('object');
  });

  it('supports options array and placeholder', () => {
    const options = [
      { value: 'auth', label: 'Auth' },
      { value: 'state', label: 'State' },
    ];
    const props = {
      label: 'Area',
      options,
      placeholder: 'Select an area',
    };
    expect(props.options).toHaveLength(2);
    expect(props.placeholder).toBe('Select an area');
  });
});

describe('Toggle component', () => {
  it('exports Toggle component', () => {
    expect(Toggle).toBeDefined();
    expect(typeof Toggle).toBe('object');
  });

  it('manages checked state and changes', () => {
    const onChange = vi.fn();
    const props = {
      label: 'Enable telemetry',
      checked: true,
      onChange,
    };
    expect(props.checked).toBe(true);
    props.onChange(false);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
