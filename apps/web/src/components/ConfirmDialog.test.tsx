import { describe, it, expect, vi } from 'vitest';
import ConfirmDialog from './ConfirmDialog';
import { useFocusTrap } from '../hooks/useFocusTrap';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useRef: (init: any) => ({ current: init }),
  };
});

vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn(),
}));

describe('ConfirmDialog Component', () => {
  it('wires up useFocusTrap and renders alertdialog markup with aria attributes when isOpen is true', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    const element = ConfirmDialog({
      isOpen: true,
      title: 'Delete Confirmation',
      message: 'Are you sure you want to delete this run?',
      confirmText: 'Yes, delete',
      cancelText: 'Keep run',
      variant: 'danger',
      onConfirm,
      onCancel,
    });

    expect(useFocusTrap).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        onClose: onCancel,
        role: 'alertdialog',
      }),
    );

    expect(element).not.toBeNull();
    expect(element?.props.className).toBe('confirm-dialog-overlay');

    const dialog = element?.props.children;
    expect(dialog.props.role).toBe('alertdialog');
    expect(dialog.props['aria-modal']).toBe('true');
    expect(dialog.props['aria-labelledby']).toBe('confirm-dialog-title');
    expect(dialog.props['aria-describedby']).toBe('confirm-dialog-message');
  });

  it('returns null when isOpen is false', () => {
    const element = ConfirmDialog({
      isOpen: false,
      title: 'Title',
      message: 'Message',
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(element).toBeNull();
  });

  it('renders loading spinner when isLoading is true', () => {
    const element = ConfirmDialog({
      isOpen: true,
      title: 'Deleting...',
      message: 'Please wait',
      isLoading: true,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    const dialog = element?.props.children;
    const footer = dialog.props.children[2];
    const [cancelBtn, confirmBtn] = footer.props.children;

    expect(cancelBtn.props.disabled).toBe(true);
    expect(confirmBtn.props.disabled).toBe(true);
  });
});
