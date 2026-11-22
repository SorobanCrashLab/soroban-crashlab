import { describe, expect, it } from 'vitest';
import { getFieldA11yProps } from './form-errors';

describe('form error association (W5-H09)', () => {
  it('adds no ARIA attributes to a clean field', () => {
    expect(getFieldA11yProps({ id: 'name' })).toEqual({
      errorId: null,
      helperId: null,
      inputProps: {},
    });
  });

  it('associates an error through both describedby and errormessage', () => {
    const a11y = getFieldA11yProps({ id: 'cron', error: 'Cron expression is invalid.' });

    expect(a11y.errorId).toBe('cron-error');
    expect(a11y.inputProps).toEqual({
      'aria-invalid': true,
      'aria-describedby': 'cron-error',
      'aria-errormessage': 'cron-error',
    });
  });

  it('never references helper text that is hidden by an error', () => {
    const a11y = getFieldA11yProps({
      id: 'name',
      error: 'Name is required.',
      helperText: 'Used in the schedule list.',
    });

    expect(a11y.helperId).toBeNull();
    expect(a11y.inputProps['aria-describedby']).toBe('name-error');
    expect(a11y.inputProps['aria-describedby']).not.toContain('helper');
  });

  it('associates helper text when there is no error', () => {
    const a11y = getFieldA11yProps({ id: 'name', helperText: 'Used in the schedule list.' });

    expect(a11y.errorId).toBeNull();
    expect(a11y.helperId).toBe('name-helper');
    expect(a11y.inputProps).toEqual({ 'aria-describedby': 'name-helper' });
  });

  it('treats empty or false error values as absent', () => {
    for (const error of ['', null, undefined, false]) {
      expect(getFieldA11yProps({ id: 'field', error }).inputProps).toEqual({});
    }
  });
});
