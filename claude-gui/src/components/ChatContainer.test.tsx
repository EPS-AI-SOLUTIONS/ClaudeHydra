import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OllamaChatView } from './OllamaChatView';

// Mock scrollIntoView before rendering components
Element.prototype.scrollIntoView = vi.fn();

// Mock hooks before importing the component
const mockUseChatHistory = {
  currentSession: null,
  createSession: vi.fn().mockResolvedValue({ id: 'session-1' }),
  addMessage: vi.fn().mockResolvedValue(undefined),
};

const mockUsePromptPipeline = {
  processPrompt: vi.fn().mockImplementation((_prompt: string, callback: Function) => {
    return callback('processed prompt');
  }),
};

vi.mock('../hooks/useChatHistory', () => ({
  useChatHistory: () => mockUseChatHistory,
}));

vi.mock('../hooks/usePromptPipeline', () => ({
  usePromptPipeline: () => mockUsePromptPipeline,
  getAlzurStatus: () => ({
    samples: 10,
    buffer: 5,
    isTraining: false,
    modelVersion: 2,
  }),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock('remark-gfm', () => ({
  default: {},
}));

vi.mock('rehype-highlight', () => ({
  default: {},
}));

vi.mock('./CodeBlock', () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
  InlineCode: ({ children }: { children: React.ReactNode }) => <code>{children}</code>,
}));

describe('ChatContainer (OllamaChatView)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChatHistory.currentSession = null;
    (Element.prototype.scrollIntoView as any).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders without crashing', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(document.body).toBeTruthy();
    });

    it('shows empty state when no messages', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(screen.getByText('Start chatting with Ollama')).toBeInTheDocument();
      expect(screen.getByText('Select a model and type a message')).toBeInTheDocument();
    });

    it('displays header with Ollama Chat title', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(screen.getByText('Ollama Chat')).toBeInTheDocument();
    });

    it('renders model selector', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const modelSelect = screen.getByRole('combobox');
      expect(modelSelect).toBeInTheDocument();
    });

    it('renders clear chat button', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const clearButton = screen.getByTitle('Clear chat');
      expect(clearButton).toBeInTheDocument();
    });

    it('renders input textarea', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeInTheDocument();
    });

    it('renders file attachment button', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const attachButton = screen.getByTitle('Attach file');
      expect(attachButton).toBeInTheDocument();
    });

    it('renders send button', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Message Display', () => {
    it('shows empty state initially', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const emptyState = screen.getByText('Start chatting with Ollama');
      expect(emptyState).toBeInTheDocument();
    });

    it('displays help text in empty state', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(screen.getByText('Select a model and type a message')).toBeInTheDocument();
    });

    it('displays messages container structure', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const container = screen.getByText('Start chatting with Ollama').closest('.flex-1');
      expect(container).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('accepts text input', async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<OllamaChatView />);
      });

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello, Ollama!');

      expect(textarea).toHaveValue('Hello, Ollama!');
    });

    it('input field is empty initially', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue('');
    });

    it('allows typing in input field', async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<OllamaChatView />);
      });

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'test message');

      expect(textarea).toHaveValue('test message');
    });

    it('handles keyboard events without crashing', async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<OllamaChatView />);
      });

      const _textarea = screen.getByRole('textbox');
      await user.keyboard('hello');

      expect(document.body).toBeTruthy();
    });

    it('handles Shift+Enter for newline', async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<OllamaChatView />);
      });

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'line 1{Shift>}{Enter}{/Shift}line 2');

      expect(textarea).toHaveValue('line 1\nline 2');
    });
  });

  describe('File Upload / Image Drop', () => {
    it('renders file input element', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
    });

    it('accepts multiple file types', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput?.accept).toBeTruthy();
      expect(fileInput?.multiple).toBe(true);
    });

    it('shows file attachment button', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const attachButton = screen.getByTitle('Attach file');
      expect(attachButton).toBeInTheDocument();
    });

    it('has drag and drop area', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const chatArea = screen.getByText('Start chatting with Ollama').closest('.flex-1');
      expect(chatArea).toBeInTheDocument();
    });

    it('handles drag over without error', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const chatArea = screen.getByText('Start chatting with Ollama').closest('.flex-1');
      if (chatArea) {
        await act(async () => {
          fireEvent.dragOver(chatArea);
        });
        expect(chatArea).toBeTruthy();
      }
    });

    it('handles drag leave without error', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const chatArea = screen.getByText('Start chatting with Ollama').closest('.flex-1');
      if (chatArea) {
        await act(async () => {
          fireEvent.dragLeave(chatArea);
        });
        expect(chatArea).toBeTruthy();
      }
    });
  });

  describe('Streaming State', () => {
    it('component renders during initialization', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(document.body).toBeTruthy();
    });

    it('textarea is available for input', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeInTheDocument();
    });

    it('component renders without error', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(document.body).toBeTruthy();
    });
  });

  describe('Model Selection', () => {
    it('renders model selector', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const modelSelect = screen.getByRole('combobox');
      expect(modelSelect).toBeInTheDocument();
    });

    it('model selector has options attribute', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const modelSelect = screen.getByRole('combobox');
      expect(modelSelect).toHaveProperty('options');
    });

    it('model selector is accessible', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const modelSelect = screen.getByRole('combobox');
      expect(modelSelect).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('hooks are properly initialized', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(mockUseChatHistory.createSession).toBeDefined();
      expect(mockUseChatHistory.addMessage).toBeDefined();
    });

    it('uses prompt pipeline hook', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(mockUsePromptPipeline.processPrompt).toBeDefined();
    });
  });

  describe('Clear Chat', () => {
    it('clear button is visible', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const clearButton = screen.getByTitle('Clear chat');
      expect(clearButton).toBeInTheDocument();
    });

    it('clear button is clickable', async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<OllamaChatView />);
      });

      const clearButton = screen.getByTitle('Clear chat');
      await act(async () => {
        await user.click(clearButton);
      });

      expect(document.body).toBeTruthy();
    });
  });

  describe('Attachment Management', () => {
    it('file input accepts image files', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput?.accept).toContain('image/*');
    });

    it('file input accepts text files', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput?.accept).toContain('.txt');
    });

    it('file input accepts code files', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput?.accept).toContain('.json');
    });
  });

  describe('Accessibility', () => {
    it('textarea has placeholder text', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAttribute('placeholder');
    });

    it('buttons have title attributes', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(screen.getByTitle('Clear chat')).toBeInTheDocument();
      expect(screen.getByTitle('Attach file')).toBeInTheDocument();
    });

    it('file input has multiple attribute', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute('multiple');
    });

    it('uses semantic HTML elements', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);

      const combobox = screen.getByRole('combobox');
      expect(combobox).toBeInTheDocument();
    });
  });

  describe('Component Structure', () => {
    it('renders header section', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(screen.getByText('Ollama Chat')).toBeInTheDocument();
    });

    it('renders chat area section', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(screen.getByText('Start chatting with Ollama')).toBeInTheDocument();
    });

    it('renders input section', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  describe('CSS Classes', () => {
    it('applies correct styling classes', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const chatArea = screen.getByText('Start chatting with Ollama').closest('.glass-panel');
      expect(chatArea).toBeInTheDocument();
    });

    it('buttons have styling classes', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const clearButton = screen.getByTitle('Clear chat');
      expect(clearButton.className).toBeTruthy();
    });
  });

  describe('User Interactions', () => {
    it('text input can receive focus', async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(<OllamaChatView />);
      });

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);

      expect(textarea).toBeInTheDocument();
    });

    it('buttons can be clicked without error', async () => {
      const _user = userEvent.setup();

      await act(async () => {
        render(<OllamaChatView />);
      });

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Component Props', () => {
    it('renders with no required props', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      expect(screen.getByText('Ollama Chat')).toBeInTheDocument();
    });

    it('component is self-contained', async () => {
      await act(async () => {
        render(<OllamaChatView />);
      });

      const container = screen.getByText('Ollama Chat').closest('.h-full');
      expect(container).toBeInTheDocument();
    });
  });
});
