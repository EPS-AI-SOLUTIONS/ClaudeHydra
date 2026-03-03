import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from '@/components/atoms/Input';

describe('Input', () => {
  // -------------------------------------------------------------------------
  // Basic rendering
  // -------------------------------------------------------------------------

  it('renders an input element', () => {
    render(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('renders with a label when provided', () => {
    render(<Input label="Email" placeholder="you@example.com" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Value and onChange
  // -------------------------------------------------------------------------

  it('displays the provided value', () => {
    render(<Input value="hello" onChange={() => {}} />);
    expect(screen.getByDisplayValue('hello')).toBeInTheDocument();
  });

  it('calls onChange when the user types', () => {
    const onChange = vi.fn();
    render(<Input placeholder="Type" onChange={onChange} />);
    const input = screen.getByPlaceholderText('Type');
    fireEvent.change(input, { target: { value: 'new value' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Disabled state
  // -------------------------------------------------------------------------

  it('is disabled when disabled prop is true', () => {
    render(<Input disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText('Disabled')).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it('shows error message when error prop is provided', () => {
    render(<Input error="This field is required" placeholder="Name" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('This field is required')).toBeInTheDocument();
  });

  it('marks the input as aria-invalid when error is provided', () => {
    render(<Input error="Invalid" placeholder="Name" />);
    const input = screen.getByPlaceholderText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not show error message when error is not provided', () => {
    render(<Input placeholder="Name" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Right element
  // -------------------------------------------------------------------------

  it('renders rightElement when provided', () => {
    render(
      <Input
        placeholder="Search"
        rightElement={
          <button type="button" data-testid="clear-btn">
            X
          </button>
        }
      />,
    );
    expect(screen.getByTestId('clear-btn')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Icon
  // -------------------------------------------------------------------------

  it('renders icon when provided', () => {
    render(<Input placeholder="Search" icon={<span data-testid="search-icon">S</span>} />);
    expect(screen.getByTestId('search-icon')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Size variants
  // -------------------------------------------------------------------------

  it('applies sm size classes', () => {
    render(<Input inputSize="sm" placeholder="Small" />);
    const input = screen.getByPlaceholderText('Small');
    expect(input.className).toContain('text-xs');
  });

  it('applies md size classes by default', () => {
    render(<Input placeholder="Medium" />);
    const input = screen.getByPlaceholderText('Medium');
    expect(input.className).toContain('text-sm');
  });

  it('applies lg size classes', () => {
    render(<Input inputSize="lg" placeholder="Large" />);
    const input = screen.getByPlaceholderText('Large');
    expect(input.className).toContain('text-base');
  });

  // -------------------------------------------------------------------------
  // Custom className
  // -------------------------------------------------------------------------

  it('applies additional className to wrapper', () => {
    const { container } = render(<Input className="my-custom" placeholder="Test" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('my-custom');
  });
});
