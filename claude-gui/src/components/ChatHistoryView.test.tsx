import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the hooks before importing the component
const mockLoadSessions = vi.fn();
const mockLoadSession = vi.fn();
const mockCreateSession = vi.fn();
const mockDeleteSession = vi.fn();
const mockUpdateSessionTitle = vi.fn();
const mockAddMessage = vi.fn();
const mockEnhanceSessions = vi.fn().mockReturnValue([]);
const mockSearchSessions = vi.fn().mockResolvedValue([]);
const mockFindRelatedSessions = vi.fn().mockResolvedValue([]);

let mockSessions: unknown[] = [];
let mockCurrentSession: unknown = null;
let mockLoading = false;
let mockError: string | null = null;

vi.mock('../hooks/useChatHistory', () => ({
  useChatHistory: () => ({
    sessions: mockSessions,
    currentSession: mockCurrentSession,
    loading: mockLoading,
    error: mockError,
    loadSessions: mockLoadSessions,
    loadSession: mockLoadSession,
    createSession: mockCreateSession,
    deleteSession: mockDeleteSession,
    updateSessionTitle: mockUpdateSessionTitle,
    addMessage: mockAddMessage,
  }),
}));

vi.mock('../hooks/useSessionAI', () => ({
  useSessionAI: () => ({
    enhanceSessions: mockEnhanceSessions,
    generateSummary: vi.fn(),
    generateTags: vi.fn(),
    searchSessions: mockSearchSessions,
    findRelatedSessions: mockFindRelatedSessions,
    checkOllama: vi.fn().mockResolvedValue(true),
    loading: false,
    error: null,
  }),
}));

// Import component after mocks are set up
import { ChatHistoryView } from './ChatHistoryView';

// Helper to create mock session
const createMockSession = (overrides = {}) => ({
  id: 'session-1',
  title: 'Test Session',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T12:00:00Z',
  message_count: 5,
  model: 'claude-3',
  preview: 'Test preview message...',
  messages: [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: '2024-01-15T10:00:00Z',
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: '2024-01-15T10:00:05Z',
      model: 'claude-3',
    },
  ],
  ...overrides,
});

describe('ChatHistoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessions = [];
    mockCurrentSession = null;
    mockLoading = false;
    mockError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Empty state', () => {
    it('should show empty state when no sessions exist', async () => {
      await act(async () => {
        render(<ChatHistoryView />);
      });

      expect(screen.getByText(/No chat sessions yet/)).toBeInTheDocument();
    });

    it('should show "New" button in empty state', async () => {
      await act(async () => {
        render(<ChatHistoryView />);
      });

      // Button has name "New" with title "New Chat"
      expect(screen.getByRole('button', { name: /New/i })).toBeInTheDocument();
    });
  });

  describe('Session list', () => {
    it('should display session list', async () => {
      mockSessions = [
        createMockSession({ id: '1', title: 'First Session' }),
        createMockSession({ id: '2', title: 'Second Session' }),
      ];

      await act(async () => {
        render(<ChatHistoryView />);
      });

      expect(screen.getByText('First Session')).toBeInTheDocument();
      expect(screen.getByText('Second Session')).toBeInTheDocument();
    });

    it('should load session when clicked', async () => {
      mockSessions = [createMockSession({ id: 'test-id', title: 'Clickable Session' })];

      await act(async () => {
        render(<ChatHistoryView />);
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Clickable Session'));
      });

      expect(mockLoadSession).toHaveBeenCalledWith('test-id');
    });
  });

  describe('Loading state', () => {
    it('should show loading indicator', async () => {
      mockLoading = true;

      await act(async () => {
        render(<ChatHistoryView />);
      });

      expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should handle error state without crashing', async () => {
      mockError = 'Failed to load sessions';

      // Component should render without crashing even with error
      await act(async () => {
        render(<ChatHistoryView />);
      });

      // Component renders (error handling is internal)
      expect(document.body).toBeTruthy();
    });
  });

  describe('Session messages', () => {
    it('should display messages when session is loaded', async () => {
      const session = createMockSession();
      mockSessions = [session];
      mockCurrentSession = session;

      await act(async () => {
        render(<ChatHistoryView />);
      });

      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });

    it('should show empty message state for session without messages', async () => {
      const emptySession = createMockSession({ messages: [], message_count: 0 });
      mockSessions = [emptySession];
      mockCurrentSession = emptySession;

      await act(async () => {
        render(<ChatHistoryView />);
      });

      expect(screen.getByText(/No messages/i)).toBeInTheDocument();
    });
  });

  describe('Search functionality', () => {
    it('should have search input', async () => {
      mockSessions = [createMockSession()];

      await act(async () => {
        render(<ChatHistoryView />);
      });

      const searchInput =
        screen.queryByPlaceholderText(/search/i) || screen.queryByRole('searchbox');
      expect(searchInput).toBeTruthy();
    });
  });

  describe('Create session', () => {
    it('should call createSession when New button is clicked', async () => {
      await act(async () => {
        render(<ChatHistoryView />);
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /New/i }));
      });

      expect(mockCreateSession).toHaveBeenCalled();
    });
  });
});

// Separate test file for formatSimilarity integration
describe('formatSimilarity edge cases (unit)', () => {
  // These are tested in format.test.ts but we verify the integration
  it('formatSimilarity is imported and used correctly', async () => {
    const { formatSimilarity } = await import('../utils/format');

    // Verify edge cases that caused the original crash
    expect(formatSimilarity(undefined)).toBe('0');
    expect(formatSimilarity(null)).toBe('0');
    expect(formatSimilarity(NaN)).toBe('0');
    expect(formatSimilarity(85)).toBe('85');
    expect(formatSimilarity(85.7)).toBe('86');
  });
});
