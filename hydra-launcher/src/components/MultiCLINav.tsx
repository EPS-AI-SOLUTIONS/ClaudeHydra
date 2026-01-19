import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import {
  Zap,
  Sparkles,
  Brain,
  Code2,
  Bot,
  Flame,
  Swords,
  Check,
  Clock,
  AlertCircle
} from 'lucide-react';

export type CLIProvider = 'hydra' | 'gemini' | 'jules' | 'codex' | 'grok' | 'deepseek' | 'witcher';

interface CLIConfig {
  id: CLIProvider;
  name: string;
  provider: string;
  model: string;
  icon: React.ReactNode;
  color: string;
  status: 'active' | 'placeholder' | 'offline';
  specialty: string;
}

const CLI_CONFIGS: CLIConfig[] = [
  {
    id: 'hydra',
    name: 'HYDRA',
    provider: 'Anthropic',
    model: 'Claude Opus 4.5',
    icon: <Sparkles size={18} />,
    color: 'amber',
    status: 'active',
    specialty: 'MCP, Agent Swarm, Full Autonomy'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    provider: 'Google',
    model: 'Gemini 2.0 Flash',
    icon: <Brain size={18} />,
    color: 'blue',
    status: 'active',
    specialty: 'Multimodal, 2M Context'
  },
  {
    id: 'jules',
    name: 'Jules',
    provider: 'Google',
    model: 'Jules AI',
    icon: <Bot size={18} />,
    color: 'purple',
    status: 'active',
    specialty: 'Async Tasks, GitHub'
  },
  {
    id: 'codex',
    name: 'Codex',
    provider: 'OpenAI',
    model: 'GPT-5 Codex',
    icon: <Code2 size={18} />,
    color: 'green',
    status: 'placeholder',
    specialty: 'Code Generation, MCP'
  },
  {
    id: 'grok',
    name: 'Grok',
    provider: 'xAI',
    model: 'Grok 3',
    icon: <Zap size={18} />,
    color: 'gray',
    status: 'placeholder',
    specialty: 'Real-time, Unfiltered'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'DeepSeek',
    model: 'DeepSeek-R1',
    icon: <Flame size={18} />,
    color: 'red',
    status: 'active',
    specialty: '100+ Languages, Local'
  },
  {
    id: 'witcher',
    name: 'Witcher Mode',
    provider: 'ALL',
    model: 'Multi-Model',
    icon: <Swords size={18} />,
    color: 'amber',
    status: 'active',
    specialty: 'Combined Intelligence'
  },
];

interface MultiCLINavProps {
  selectedCLI: CLIProvider;
  onSelectCLI: (cli: CLIProvider) => void;
}

const MultiCLINav: React.FC<MultiCLINavProps> = ({ selectedCLI, onSelectCLI }) => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [hoveredCLI, setHoveredCLI] = useState<CLIProvider | null>(null);

  const getStatusIcon = (status: CLIConfig['status']) => {
    switch (status) {
      case 'active':
        return <Check size={10} className="text-emerald-500" />;
      case 'placeholder':
        return <Clock size={10} className="text-amber-500" />;
      case 'offline':
        return <AlertCircle size={10} className="text-red-500" />;
    }
  };

  return (
    <div className="w-full">
      {/* Title */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`text-xs font-mono font-semibold tracking-wider ${
          isLight ? 'text-gray-600' : 'text-gray-400'
        }`}>
          CLI PROVIDERS
        </span>
        <div className={`flex-1 h-px ${isLight ? 'bg-gray-200' : 'bg-gray-700'}`} />
      </div>

      {/* CLI Grid */}
      <div className="grid grid-cols-4 gap-2">
        {CLI_CONFIGS.map((cli) => {
          const isSelected = selectedCLI === cli.id;
          const isDisabled = cli.status === 'placeholder';
          void hoveredCLI; // Used for hover state tracking

          return (
            <button
              key={cli.id}
              onClick={() => !isDisabled && onSelectCLI(cli.id)}
              onMouseEnter={() => setHoveredCLI(cli.id)}
              onMouseLeave={() => setHoveredCLI(null)}
              disabled={isDisabled}
              className={`
                relative p-3 rounded-lg border-2 transition-all duration-200
                ${isSelected ? 'ring-2 ring-offset-1' : ''}
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
                ${isSelected && !isDisabled ? (isLight ? 'ring-amber-400' : 'ring-amber-500') : ''}
                ${isLight
                  ? isSelected
                    ? 'bg-white border-amber-400 shadow-lg'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  : isSelected
                    ? 'bg-gray-800 border-amber-500 shadow-lg shadow-amber-500/10'
                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                }
              `}
            >
              {/* Status indicator */}
              <div className="absolute top-1 right-1">
                {getStatusIcon(cli.status)}
              </div>

              {/* Icon */}
              <div className={`mb-2 ${
                isSelected
                  ? isLight ? 'text-amber-600' : 'text-amber-400'
                  : isDisabled
                    ? isLight ? 'text-gray-400' : 'text-gray-500'
                    : isLight ? 'text-gray-600' : 'text-gray-300'
              }`}>
                {cli.icon}
              </div>

              {/* Name */}
              <div className={`text-xs font-mono font-bold truncate ${
                isSelected
                  ? isLight ? 'text-amber-700' : 'text-amber-300'
                  : isDisabled
                    ? isLight ? 'text-gray-400' : 'text-gray-500'
                    : isLight ? 'text-gray-700' : 'text-gray-200'
              }`}>
                {cli.name}
              </div>

              {/* Provider */}
              <div className={`text-[9px] font-mono truncate ${
                isLight ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {cli.provider}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected CLI Info */}
      {selectedCLI && (
        <div className={`mt-4 p-3 rounded-lg border ${
          isLight
            ? 'bg-amber-50/50 border-amber-200'
            : 'bg-amber-900/10 border-amber-500/20'
        }`}>
          {(() => {
            const cli = CLI_CONFIGS.find(c => c.id === selectedCLI);
            if (!cli) return null;

            return (
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  isLight ? 'bg-amber-100' : 'bg-amber-900/30'
                }`}>
                  {cli.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-bold text-sm ${
                      isLight ? 'text-amber-800' : 'text-amber-300'
                    }`}>
                      {cli.name}
                    </span>
                    {getStatusIcon(cli.status)}
                  </div>
                  <div className={`text-xs font-mono ${
                    isLight ? 'text-amber-600' : 'text-amber-400/70'
                  }`}>
                    {cli.model}
                  </div>
                  <div className={`text-[10px] font-mono mt-1 ${
                    isLight ? 'text-gray-500' : 'text-gray-400'
                  }`}>
                    {cli.specialty}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default MultiCLINav;
