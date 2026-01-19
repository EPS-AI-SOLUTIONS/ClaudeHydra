import React, { useState, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { TabProvider, useTabContext, CLIProvider } from '../contexts/TabContext';
import MCPStatus from './MCPStatus';
import OllamaStatus from './OllamaStatus';
import MultiTabChat from './MultiTabChat';
import MultiInputDashboard from './MultiInputDashboard';
import StreamPanel, { StreamSource } from './StreamPanel';
import TabBar from './TabBar';
import StatusLine from './StatusLine';
import SettingsPanel from './SettingsPanel';
import QueueStatus from './QueueStatus';
import YoloToggle from './YoloToggle';
import { Moon, Sun, ChevronLeft, ChevronRight, Settings, Bot, History, MessageSquare, Grid3X3, Activity } from 'lucide-react';
import { useMCPHealth } from '../hooks/useMCPHealth';
import { PROVIDERS } from '../providers';
import ChatHistory from './ChatHistory';
import BuildFreshness from './BuildFreshness';
import { ChatSession } from '../hooks/useChatHistory';

// View mode type for routing
type ViewMode = 'chat' | 'multi-input' | 'stream-panel';

// ============================================================================
// MODEL SELECTOR - na górze sidebara
// ============================================================================
const ModelSelector: React.FC<{
  onSelect: (provider: CLIProvider) => void;
  isLight: boolean;
}> = ({ onSelect, isLight }) => {
  const [selectedModel, setSelectedModel] = useState<CLIProvider>('claude');

  const availableProviders = Object.values(PROVIDERS).filter(p => p.isAvailable);

  const handleSelect = (provider: CLIProvider) => {
    setSelectedModel(provider);
    onSelect(provider);
  };

  return (
    <div className="glass-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <Bot size={14} className={isLight ? 'text-gray-600' : 'text-gray-400'} />
        <span className={`text-[10px] font-mono tracking-wider uppercase ${
          isLight ? 'text-gray-600' : 'text-gray-400'
        }`}>
          Model AI
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {availableProviders.map((provider) => (
          <button
            key={provider.id}
            onClick={() => handleSelect(provider.id)}
            className={`py-1.5 px-2 rounded text-[10px] font-mono transition-all duration-200 border ${
              selectedModel === provider.id
                ? isLight
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-black border-white'
                : isLight
                  ? 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                  : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
            }`}
          >
            <span className="mr-1">{provider.icon}</span>
            {provider.name}
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// SIDEBAR CONTROLS - Logo, YOLO, Settings, Theme
// ============================================================================
const SidebarControls: React.FC<{
  isLight: boolean;
  onSettingsOpen: () => void;
  toggleTheme: () => void;
}> = ({ isLight, onSettingsOpen, toggleTheme }) => {
  return (
    <div className="glass-card p-3">
      {/* Logo - większe */}
      <div className="flex items-center justify-center mb-3">
        <img
          src={isLight ? '/logolight.webp' : '/logodark.webp'}
          alt="Regis"
          className="w-16 h-16 object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>

      <div className="text-center mb-3">
        <h1 className={`text-lg font-mono font-bold tracking-[0.2em] ${
          isLight ? 'text-black' : 'text-white'
        }`}>
          REGIS
        </h1>
        <span className={`text-[9px] font-mono tracking-wider ${
          isLight ? 'text-gray-500' : 'text-gray-500'
        }`}>
          v10.6.1 Swarm
        </span>
      </div>

      <div className={`h-px my-2 ${isLight ? 'bg-gray-200' : 'bg-gray-800'}`} />

      {/* YOLO Toggle */}
      <div className="mb-2">
        <YoloToggle />
      </div>

      {/* Settings & Theme buttons */}
      <div className="flex gap-2">
        <button
          onClick={onSettingsOpen}
          className="flex-1 glass-button py-1.5 px-2 flex items-center justify-center gap-1.5"
          title="Settings"
        >
          <Settings size={12} />
          <span className="text-[9px]">Settings</span>
        </button>

        <button
          onClick={toggleTheme}
          className="glass-button py-1.5 px-2.5"
          title={isLight ? 'Dark mode' : 'Light mode'}
        >
          {isLight ? <Moon size={12} /> : <Sun size={12} />}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// DASHBOARD CONTENT
// ============================================================================
const DashboardContent: React.FC = () => {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>('chat');

  // Sample streams for StreamPanel demo (can be replaced with real data)
  const [streams, setStreams] = useState<StreamSource[]>([]);

  const [yoloEnabled] = useState(() => {
    try {
      return localStorage.getItem('hydra_yolo') !== 'false';
    } catch {
      return true;
    }
  });

  const { onlineCount, totalCount } = useMCPHealth();
  const { createTab, tabs } = useTabContext();

  // Handle restoring a session from history
  const handleRestoreSession = useCallback((session: ChatSession) => {
    // Create a new tab with the session data
    createTab(session.name, session.provider as CLIProvider);
    setHistoryOpen(false);
    // Note: Message restoration would need TabContext enhancement
  }, [createTab]);

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected);
  }, []);

  const handleCreateTab = useCallback(async (provider: CLIProvider) => {
    const tabNumber = tabs.length + 1;
    await createTab(`${provider.charAt(0).toUpperCase() + provider.slice(1)} #${tabNumber}`, provider);
  }, [createTab, tabs.length]);

  const handleModelSelect = useCallback((provider: CLIProvider) => {
    // Auto-create tab when model selected
    handleCreateTab(provider);
  }, [handleCreateTab]);

  // StreamPanel handlers
  const handleStopStream = useCallback((id: string) => {
    setStreams(prev => prev.map(s =>
      s.id === id ? { ...s, status: 'completed' as const } : s
    ));
  }, []);

  const handleStopAllStreams = useCallback(() => {
    setStreams(prev => prev.map(s => ({ ...s, status: 'completed' as const })));
  }, []);

  const handleToggleStreamCollapse = useCallback((id: string) => {
    setStreams(prev => prev.map(s =>
      s.id === id ? { ...s, isCollapsed: !s.isCollapsed } : s
    ));
  }, []);

  const handleCollapseAllStreams = useCallback(() => {
    setStreams(prev => prev.map(s => ({ ...s, isCollapsed: true })));
  }, []);

  const handleExpandAllStreams = useCallback(() => {
    setStreams(prev => prev.map(s => ({ ...s, isCollapsed: false })));
  }, []);

  // View mode buttons config
  const viewModes: { id: ViewMode; icon: React.ReactNode; label: string; title: string }[] = [
    { id: 'chat', icon: <MessageSquare size={14} />, label: 'Chat', title: 'Chat View' },
    { id: 'multi-input', icon: <Grid3X3 size={14} />, label: 'Multi', title: 'Multi-Input Dashboard' },
    { id: 'stream-panel', icon: <Activity size={14} />, label: 'Streams', title: 'Stream Panel' },
  ];

  return (
    <div className="w-full h-full flex flex-col">
      {/* Settings Panel Modal */}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Chat History Sidebar */}
      <ChatHistory
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestoreSession={handleRestoreSession}
      />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - collapsible */}
        <div
          className={`h-full transition-all duration-300 flex flex-col ${
            sidebarOpen ? 'w-64' : 'w-0'
          } overflow-hidden`}
        >
          <div className="w-64 h-full p-3 overflow-auto flex flex-col gap-2">
            {/* 1. Sidebar Controls (Logo, YOLO, Settings, Theme) - NA GÓRZE */}
            <SidebarControls
              isLight={isLight}
              onSettingsOpen={() => setSettingsOpen(true)}
              toggleTheme={toggleTheme}
            />

            {/* 2. Model Selector - zaraz pod logo */}
            <ModelSelector
              onSelect={handleModelSelect}
              isLight={isLight}
            />

            {/* 3. Queue Status */}
            <QueueStatus />

            {/* 4. MCP Servers Status */}
            <MCPStatus />

            {/* 5. Ollama Status */}
            <OllamaStatus />

            {/* 6. Build Freshness Check */}
            <BuildFreshness />

            {/* Footer */}
            <div className="mt-auto text-center">
              <div className={`h-px my-2 ${isLight ? 'bg-gray-200' : 'bg-gray-800'}`} />
              <p className={`text-[8px] font-mono tracking-wider ${
                isLight ? 'text-gray-400' : 'text-gray-600'
              }`}>
                SERENA • DC • PLAYWRIGHT • SWARM
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full">
          {/* Header - uproszczony */}
          <div className={`flex items-center justify-between p-2 border-b ${
            isLight ? 'border-gray-200' : 'border-gray-800'
          }`}>
            {/* Left: Sidebar Toggle + View Mode Tabs */}
            <div className="flex items-center gap-2">
              {/* Sidebar Toggle */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="glass-button p-1.5"
                title={sidebarOpen ? 'Hide panel' : 'Show panel'}
              >
                {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </button>

              {/* View Mode Tabs */}
              <div className={`flex items-center gap-0.5 p-0.5 rounded-lg ${
                isLight ? 'bg-gray-100' : 'bg-gray-800/50'
              }`}>
                {viewModes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setActiveView(mode.id)}
                    data-testid={`view-tab-${mode.id}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono transition-all duration-200 ${
                      activeView === mode.id
                        ? isLight
                          ? 'bg-white text-black shadow-sm'
                          : 'bg-gray-700 text-white shadow-sm'
                        : isLight
                          ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                    }`}
                    title={mode.title}
                  >
                    {mode.icon}
                    <span className="hidden sm:inline">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Center - Tab Bar (only show in chat view) */}
            <div className={`flex-1 mx-2 ${activeView !== 'chat' ? 'opacity-50 pointer-events-none' : ''}`}>
              <TabBar onCreateTab={handleCreateTab} />
            </div>

            {/* History Button */}
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className={`glass-button p-1.5 ${historyOpen ? 'ring-1 ring-offset-1' : ''} ${
                isLight ? 'ring-gray-400' : 'ring-gray-500'
              }`}
              title="Historia czatów"
            >
              <History size={16} />
            </button>
          </div>

          {/* Content Area z tłem */}
          <div className="flex-1 overflow-hidden relative">
            {/* Background image */}
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: `url(${isLight ? '/backgroundlight.webp' : '/background.webp'})`,
                opacity: 0.15,
              }}
            />

            {/* Glassmorphism overlay */}
            <div className={`absolute inset-0 ${
              isLight
                ? 'bg-white/60 backdrop-blur-sm'
                : 'bg-black/60 backdrop-blur-sm'
            }`} />

            {/* Content frame with glassmorphism */}
            <div className={`absolute inset-2 rounded-lg overflow-hidden border ${
              isLight
                ? 'border-gray-200/50 bg-white/40 backdrop-blur-md'
                : 'border-gray-800/50 bg-black/40 backdrop-blur-md'
            }`}>
              {/* Render component based on activeView */}
              {activeView === 'chat' && (
                <div data-testid="view-content-chat" className="h-full">
                  <MultiTabChat onConnectionChange={handleConnectionChange} />
                </div>
              )}
              {activeView === 'multi-input' && (
                <div data-testid="view-content-multi-input" className="h-full">
                  <MultiInputDashboard />
                </div>
              )}
              {activeView === 'stream-panel' && (
                <div data-testid="view-content-stream-panel" className="h-full">
                  <StreamPanel
                    streams={streams}
                    onStopStream={handleStopStream}
                    onStopAll={handleStopAllStreams}
                    onToggleCollapse={handleToggleStreamCollapse}
                    onCollapseAll={handleCollapseAllStreams}
                    onExpandAll={handleExpandAllStreams}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* StatusLine at bottom */}
      <StatusLine
        isConnected={isConnected}
        yoloEnabled={yoloEnabled}
        mcpOnline={onlineCount}
        mcpTotal={totalCount}
      />
    </div>
  );
};

// ============================================================================
// WRAPPER
// ============================================================================
const Dashboard: React.FC = () => {
  return (
    <TabProvider>
      <DashboardContent />
    </TabProvider>
  );
};

export default Dashboard;
