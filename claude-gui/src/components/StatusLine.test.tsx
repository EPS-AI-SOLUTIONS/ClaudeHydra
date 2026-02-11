import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClaudeStore } from '../stores/claudeStore';
import { StatusLine } from './StatusLine';

describe('StatusLine', () => {
  beforeEach(() => {
    // Reset store to default state
    useClaudeStore.setState({
      status: {
        is_active: false,
        pending_approval: false,
        auto_approve_all: false,
        approved_count: 0,
        denied_count: 0,
        auto_approved_count: 0,
      },
      isConnecting: false,
      pendingApproval: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Pending approval indicator', () => {
    it('should not show pending indicator by default', async () => {
      await act(async () => {
        render(<StatusLine />);
      });

      expect(screen.queryByText('Pending Approval')).not.toBeInTheDocument();
    });

    it('should show pending indicator when approval is pending', async () => {
      useClaudeStore.setState({
        pendingApproval: {
          id: 'test-1',
          timestamp: new Date().toISOString(),
          event_type: 'tool_request',
          data: {},
          requires_approval: true,
          approval_type: { type: 'bash_command', command: 'ls' },
        },
      });

      await act(async () => {
        render(<StatusLine />);
      });

      expect(screen.getByText('Oczekuje na zatwierdzenie')).toBeInTheDocument();
    });
  });

  describe('Statistics display', () => {
    it('should display approval counts', async () => {
      useClaudeStore.setState({
        status: {
          ...useClaudeStore.getState().status,
          approved_count: 10,
          denied_count: 3,
          auto_approved_count: 5,
        },
      });

      await act(async () => {
        render(<StatusLine />);
      });

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show zero counts initially', async () => {
      await act(async () => {
        render(<StatusLine />);
      });

      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Version display', () => {
    it('should display version', async () => {
      await act(async () => {
        render(<StatusLine />);
      });

      expect(screen.getByText('v0.1.0')).toBeInTheDocument();
    });
  });

  describe('Component rendering', () => {
    it('should render status line footer', async () => {
      await act(async () => {
        render(<StatusLine />);
      });

      // Footer should exist
      const footer = document.querySelector('footer');
      expect(footer).toBeInTheDocument();
    });

    it('should contain Claude status text', async () => {
      await act(async () => {
        render(<StatusLine />);
      });

      // Use textContent to check for Claude status
      const footer = document.querySelector('footer');
      expect(footer?.textContent).toContain('Claude');
    });

    it('should contain Ollama status text', async () => {
      await act(async () => {
        render(<StatusLine />);
      });

      const footer = document.querySelector('footer');
      expect(footer?.textContent).toContain('Ollama');
    });

    it('should contain Auto status text', async () => {
      await act(async () => {
        render(<StatusLine />);
      });

      const footer = document.querySelector('footer');
      expect(footer?.textContent).toContain('Auto');
    });

    it('should show Nieaktywny when not connected', async () => {
      await act(async () => {
        render(<StatusLine />);
      });

      const footer = document.querySelector('footer');
      expect(footer?.textContent).toContain('Nieaktywny');
    });

    it('should show Aktywny when connected', async () => {
      useClaudeStore.setState({
        status: {
          ...useClaudeStore.getState().status,
          is_active: true,
        },
      });

      await act(async () => {
        render(<StatusLine />);
      });

      const footer = document.querySelector('footer');
      expect(footer?.textContent).toContain('Aktywny');
    });

    it('should show Łączenie when connecting', async () => {
      useClaudeStore.setState({ isConnecting: true });

      await act(async () => {
        render(<StatusLine />);
      });

      const footer = document.querySelector('footer');
      expect(footer?.textContent).toContain('Łączenie');
    });
  });
});
