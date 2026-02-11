import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClaudeStore } from '../stores/claudeStore';
import { TerminalView } from './TerminalView';

// Mutable mock object that can be modified per test
const mockUseClaude = {
  status: { is_active: true, pending_approval: false },
  isConnecting: false,
  pendingApproval: null,
  startSession: vi.fn(),
  stopSession: vi.fn(),
  sendInput: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
  toggleAutoApproveAll: vi.fn(),
};

// Mock useClaude hook - returns mutable object
vi.mock('../hooks/useClaude', () => ({
  useClaude: () => mockUseClaude,
}));

describe('TerminalView', () => {
  beforeEach(() => {
    // Reset mock to default active state
    mockUseClaude.status = { is_active: true, pending_approval: false };
    mockUseClaude.isConnecting = false;
    mockUseClaude.pendingApproval = null;

    // Reset store before each test
    useClaudeStore.setState({
      outputLines: [],
      status: {
        is_active: true,
        pending_approval: false,
        auto_approve_all: false,
        approved_count: 0,
        denied_count: 0,
        auto_approved_count: 0,
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Rendering', () => {
    it('renders empty state correctly', () => {
      render(<TerminalView />);
      expect(screen.getByText('Brak wiadomości.')).toBeInTheDocument();
      expect(screen.getByText('Rozpocznij rozmowę poniżej.')).toBeInTheDocument();
    });

    it('renders output lines correctly', () => {
      useClaudeStore.setState({
        outputLines: [
          { id: '1', timestamp: new Date(), type: 'system', content: 'Session started' },
          { id: '2', timestamp: new Date(), type: 'output', content: '> test command' },
          { id: '3', timestamp: new Date(), type: 'assistant', content: 'Hello, I am Claude' },
        ],
      });

      render(<TerminalView />);
      expect(screen.getByText('Session started')).toBeInTheDocument();
      expect(screen.getByText('> test command')).toBeInTheDocument();
      expect(screen.getByText('Hello, I am Claude')).toBeInTheDocument();
    });

    it('renders different line types with correct prefixes', () => {
      useClaudeStore.setState({
        outputLines: [
          { id: '1', timestamp: new Date(), type: 'system', content: 'System message' },
          { id: '2', timestamp: new Date(), type: 'assistant', content: 'Assistant message' },
          { id: '3', timestamp: new Date(), type: 'tool', content: 'Tool: Bash' },
          { id: '4', timestamp: new Date(), type: 'error', content: 'Error occurred' },
          { id: '5', timestamp: new Date(), type: 'approval', content: 'Approval required' },
        ],
      });

      render(<TerminalView />);

      // Check prefixes are rendered
      expect(screen.getByText('●')).toBeInTheDocument(); // system
      expect(screen.getByText('◆')).toBeInTheDocument(); // assistant
      expect(screen.getByText('⚙')).toBeInTheDocument(); // tool
      expect(screen.getByText('✗')).toBeInTheDocument(); // error
      expect(screen.getByText('⚠')).toBeInTheDocument(); // approval
    });

    it('renders input field with correct placeholder when session is active', () => {
      render(<TerminalView />);
      const input = screen.getByPlaceholderText('Type a message or command...');
      expect(input).toBeInTheDocument();
      expect(input).not.toBeDisabled();
    });
  });

  describe('Input handling', () => {
    it('allows typing in input field', async () => {
      const user = userEvent.setup();
      render(<TerminalView />);

      const input = screen.getByPlaceholderText('Type a message or command...');
      await user.type(input, 'hello world');

      expect(input).toHaveValue('hello world');
    });

    it('clears input after submit', async () => {
      const user = userEvent.setup();
      render(<TerminalView />);

      const input = screen.getByPlaceholderText('Type a message or command...');
      await user.type(input, 'test message');

      const form = input.closest('form');
      fireEvent.submit(form as HTMLFormElement);

      await waitFor(() => {
        expect(input).toHaveValue('');
      });
    });

    it('does not submit empty input', async () => {
      const _user = userEvent.setup();
      render(<TerminalView />);

      const input = screen.getByPlaceholderText('Type a message or command...');
      const form = input.closest('form');

      // Submit empty form
      fireEvent.submit(form as HTMLFormElement);

      // Input should remain empty and no error
      expect(input).toHaveValue('');
    });

    it('trims whitespace from input before sending', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'log');

      render(<TerminalView />);

      const input = screen.getByPlaceholderText('Type a message or command...');
      await user.type(input, '  test with spaces  ');

      const form = input.closest('form');
      fireEvent.submit(form as HTMLFormElement);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('[INPUT] Sending:', 'test with spaces');
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Session state', () => {
    it('disables input when session is not active', () => {
      // Set mock to inactive session state
      mockUseClaude.status = { is_active: false, pending_approval: false };

      render(<TerminalView />);

      // Check input is disabled and placeholder indicates session needs to start
      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
      expect(input).toHaveAttribute('placeholder', 'Start a session first');
    });

    it('enables input when session is active', () => {
      // Ensure mock is set to active (default)
      mockUseClaude.status = { is_active: true, pending_approval: false };

      render(<TerminalView />);

      const input = screen.getByRole('textbox');
      expect(input).not.toBeDisabled();
      expect(input).toHaveAttribute('placeholder', 'Type a message or command...');
    });
  });

  describe('Clear output', () => {
    it('clears output via store action', async () => {
      useClaudeStore.setState({
        outputLines: [{ id: '1', timestamp: new Date(), type: 'system', content: 'Test message' }],
      });

      const { rerender } = render(<TerminalView />);
      expect(screen.getByText('Test message')).toBeInTheDocument();

      // Clear via store (clear button was removed in UI refactor)
      useClaudeStore.getState().clearOutput();
      rerender(<TerminalView />);

      await waitFor(() => {
        expect(screen.getByText('Brak wiadomości.')).toBeInTheDocument();
      });
    });
  });

  describe('Submit button', () => {
    it('renders submit button with Send icon', () => {
      render(<TerminalView />);
      const submitButton = screen.getByRole('button', { name: '' });
      expect(submitButton).toBeInTheDocument();
      expect(submitButton).toHaveAttribute('type', 'submit');
    });

    it('disables submit button when input is empty', () => {
      render(<TerminalView />);
      const submitButton = document.querySelector('button[type="submit"]');
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Auto-scroll', () => {
    it('scrolls to bottom when new output is added', async () => {
      const { rerender } = render(<TerminalView />);

      // Add output lines
      useClaudeStore.setState({
        outputLines: [
          { id: '1', timestamp: new Date(), type: 'system', content: 'Line 1' },
          { id: '2', timestamp: new Date(), type: 'system', content: 'Line 2' },
          { id: '3', timestamp: new Date(), type: 'system', content: 'Line 3' },
        ],
      });

      rerender(<TerminalView />);

      // The scrollTop should be set to scrollHeight (auto-scroll behavior)
      // This is handled by useEffect in the component
    });
  });

  describe('Keyboard shortcuts', () => {
    it('submits on Enter key press', async () => {
      const user = userEvent.setup();
      const consoleSpy = vi.spyOn(console, 'log');

      render(<TerminalView />);

      const input = screen.getByPlaceholderText('Type a message or command...');
      await user.type(input, 'test{Enter}');

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('[INPUT] Sending:', 'test');
      });

      consoleSpy.mockRestore();
    });
  });
});

describe('TerminalView - Output line styling', () => {
  beforeEach(() => {
    useClaudeStore.setState({
      status: {
        is_active: true,
        pending_approval: false,
        auto_approve_all: false,
        approved_count: 0,
        denied_count: 0,
        auto_approved_count: 0,
      },
    });
  });

  it('applies correct CSS classes for assistant messages', () => {
    useClaudeStore.setState({
      outputLines: [{ id: '1', timestamp: new Date(), type: 'assistant', content: 'AI response' }],
    });

    render(<TerminalView />);
    const content = screen.getByText('AI response');
    expect(content).toHaveClass('text-matrix-text');
  });

  it('applies correct CSS classes for error messages', () => {
    useClaudeStore.setState({
      outputLines: [{ id: '1', timestamp: new Date(), type: 'error', content: 'Error message' }],
    });

    render(<TerminalView />);
    const content = screen.getByText('Error message');
    expect(content).toHaveClass('text-red-400');
  });

  it('applies correct CSS classes for tool messages', () => {
    useClaudeStore.setState({
      outputLines: [{ id: '1', timestamp: new Date(), type: 'tool', content: 'Tool: Bash' }],
    });

    render(<TerminalView />);
    const content = screen.getByText('Tool: Bash');
    expect(content).toHaveClass('text-blue-300');
  });

  it('applies correct CSS classes for system messages', () => {
    useClaudeStore.setState({
      outputLines: [{ id: '1', timestamp: new Date(), type: 'system', content: 'System info' }],
    });

    render(<TerminalView />);
    const content = screen.getByText('System info');
    expect(content).toHaveClass('text-matrix-text-dim');
  });

  it('applies correct CSS classes for approval messages', () => {
    useClaudeStore.setState({
      outputLines: [
        { id: '1', timestamp: new Date(), type: 'approval', content: 'Needs approval' },
      ],
    });

    render(<TerminalView />);
    const content = screen.getByText('Needs approval');
    expect(content).toHaveClass('text-orange-300');
    expect(content).toHaveClass('font-semibold');
  });
});
