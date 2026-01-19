import React, { useState, useCallback, useMemo } from 'react';
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
import ModelSelector from './ModelSelector';
import { Moon, Sun, ChevronLeft, Settings, History, MessageSquare, Grid3X3, Activity, Zap, Terminal, RefreshCw } from 'lucide-react';
import { useMCPHealth } from '../hooks/useMCPHealth';
import ChatHistory from './ChatHistory';
import BuildFreshness from './BuildFreshness';
import { ChatSession } from '../hooks/useChatHistory';

// Visual Effect Components
import AuroraBackground from './effects/AuroraBackground';
import Spotlight from './effects/Spotlight';
import ParticleField from './effects/ParticleField';
import MorphingBlob from './effects/MorphingBlob';
import AnimatedText from './ui/AnimatedText';
import GlowCard from './ui/GlowCard';
import FloatingDock, { DockItem } from './ui/FloatingDock';

// View mode type for routing
type ViewMode = 'chat' | 'multi-input' | 'stream-panel';

// ============================================================================
// SIDEBAR CONTROLS - Logo, YOLO, Settings, Theme
// ============================================================================
const SidebarControls: React.FC<{
  isLight: boolean;
  onSettingsOpen: () => void;
  toggleTheme: () => void;
}> = ({ isLight, onSettingsOpen, toggleTheme }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <GlowCard
      className="p-3"
      disableTilt={true}
      disableAnimation={true}
      intensity={0.3}
      glowColor={isLight ? '#6b7280' : '#9ca3af'}
    >
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Logo - wieksze z animacja */}
        <div className="flex items-center justify-center mb-3">
          <img
            src={isLight ? '/logolight.webp' : '/logodark.webp'}
            alt="Regis"
            className={`w-16 h-16 object-contain transition-transform duration-300 ${
              isHovered ? 'scale-105' : ''
            }`}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>

        <div className="text-center mb-3">
          <AnimatedText
            text="REGIS"
            effect="gradient"
            speed={80}
            colors={isLight
              ? ['#374151', '#6b7280', '#374151']
              : ['#e5e7eb', '#9ca3af', '#e5e7eb']
            }
            className={`text-lg font-mono font-bold tracking-[0.2em] ${
              isHovered ? 'tracking-[0.25em]' : ''
            }`}
            as="h1"
          />
          <span className={`text-[9px] font-mono tracking-wider transition-opacity duration-300 ${
            isLight ? 'text-gray-500' : 'text-gray-500'
          } ${isHovered ? 'opacity-100' : 'opacity-70'}`}>
            v10.6.1 Swarm
          </span>
        </div>

        <div className={`h-px my-2 transition-all duration-300 ${
          isLight ? 'bg-gray-200' : 'bg-gray-800'
        } ${isHovered ? 'opacity-100' : 'opacity-50'}`} />

        {/* YOLO Toggle */}
        <div className="mb-2">
          <YoloToggle />
        </div>

        {/* Settings & Theme buttons z ulepszonymi hover states */}
        <div className="flex gap-2">
          <button
            onClick={onSettingsOpen}
            className={`flex-1 glass-button py-1.5 px-2 flex items-center justify-center gap-1.5
              transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
              ${isLight ? 'hover:bg-gray-200 hover:shadow-sm' : 'hover:bg-gray-700 hover:shadow-sm hover:shadow-white/5'}`}
            title="Settings"
          >
            <Settings size={12} className="transition-transform duration-200 hover:rotate-45" />
            <span className="text-[9px]">Settings</span>
          </button>

          <button
            onClick={toggleTheme}
            className={`glass-button py-1.5 px-2.5 transition-all duration-200 hover:scale-[1.05] active:scale-[0.95]
              ${isLight ? 'hover:bg-gray-200 hover:shadow-sm' : 'hover:bg-gray-700 hover:shadow-sm hover:shadow-white/5'}`}
            title={isLight ? 'Dark mode' : 'Light mode'}
          >
            {isLight ? (
              <Moon size={12} className="transition-transform duration-300 hover:rotate-12" />
            ) : (
              <Sun size={12} className="transition-transform duration-300 hover:rotate-45" />
            )}
          </button>
        </div>
      </div>
    </GlowCard>
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

  // Animation state for view transitions
  const [isViewTransitioning, setIsViewTransitioning] = useState(false);

  const handleViewChange = (newView: ViewMode) => {
    if (newView !== activeView) {
      setIsViewTransitioning(true);
      setTimeout(() => {
        setActiveView(newView);
        setTimeout(() => setIsViewTransitioning(false), 50);
      }, 150);
    }
  };

  // Floating Dock Items for quick actions
  const dockItems: DockItem[] = useMemo(() => [
    {
      id: 'new-chat',
      icon: <MessageSquare size={20} />,
      label: 'New Chat',
      onClick: () => handleCreateTab('claude'),
    },
    {
      id: 'terminal',
      icon: <Terminal size={20} />,
      label: 'Terminal',
      onClick: () => handleCreateTab('claude'),
    },
    {
      id: 'quick-action',
      icon: <Zap size={20} />,
      label: 'Quick Action',
      onClick: () => setActiveView('multi-input'),
      isActive: activeView === 'multi-input',
    },
    {
      id: 'refresh',
      icon: <RefreshCw size={20} />,
      label: 'Refresh',
      onClick: () => window.location.reload(),
    },
    {
      id: 'settings',
      icon: <Settings size={20} />,
      label: 'Settings',
      onClick: () => setSettingsOpen(true),
    },
  ], [activeView, handleCreateTab]);

  // Magnetic elements for spotlight
  const magneticElements = useMemo(() => [
    { selector: '.glass-button', strength: 0.2, threshold: 80 },
    { selector: 'button', strength: 0.15, threshold: 60 },
  ], []);

  return (
    <div className="w-full h-full flex flex-col relative">
      {/* Aurora Background - Base layer */}
      <AuroraBackground
        intensity={isLight ? 0.3 : 0.5}
        speed={0.6}
        blur={150}
      />

      {/* Particle Field - Subtle background particles */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        <ParticleField
          count={20}
          speed={0.5}
          connections={true}
          mouseInteraction={false}
          connectionDistance={120}
          className="opacity-30"
        />
      </div>

      {/* Spotlight Effect - Follows cursor */}
      <Spotlight
        size={300}
        blur={100}
        intensity={isLight ? 0.08 : 0.12}
        magnetic={true}
        magneticElements={magneticElements}
        easing={0.1}
        zIndex={2}
      />

      {/* Morphing Blob Decorations - Corner accents */}
      <div className="fixed top-0 left-0 pointer-events-none opacity-20" style={{ zIndex: 1 }}>
        <MorphingBlob
          size={200}
          speed={0.4}
          blur={60}
          glow={0.3}
          opacity={0.3}
          colors={isLight
            ? ['#6b7280', '#9ca3af', '#d1d5db']
            : ['#374151', '#4b5563', '#6b7280']
          }
        />
      </div>
      <div className="fixed bottom-0 right-0 pointer-events-none opacity-20" style={{ zIndex: 1 }}>
        <MorphingBlob
          size={250}
          speed={0.5}
          blur={70}
          glow={0.4}
          opacity={0.25}
          colors={isLight
            ? ['#9ca3af', '#6b7280', '#4b5563']
            : ['#4b5563', '#374151', '#1f2937']
          }
        />
      </div>

      {/* Settings Panel Modal */}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Chat History Sidebar */}
      <ChatHistory
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestoreSession={handleRestoreSession}
      />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative" style={{ zIndex: 10 }}>
        {/* Sidebar - collapsible z gradient i glow */}
        <div
          className={`h-full flex flex-col overflow-hidden
            transition-all duration-500 ease-in-out
            ${sidebarOpen ? 'w-64' : 'w-0'}`}
        >
          <div className={`w-64 h-full p-3 overflow-auto flex flex-col gap-2 relative
            ${isLight
              ? 'bg-gradient-to-b from-gray-50/80 via-white/70 to-gray-100/80'
              : 'bg-gradient-to-b from-gray-900/80 via-black/70 to-gray-900/80'
            }
            backdrop-blur-xl
            ${sidebarOpen
              ? isLight
                ? 'border-r border-gray-200/80 shadow-[2px_0_15px_rgba(0,0,0,0.05)]'
                : 'border-r border-gray-800/80 shadow-[2px_0_15px_rgba(255,255,255,0.02)]'
              : ''
            }`}
            style={{
              opacity: sidebarOpen ? 1 : 0,
              transform: sidebarOpen ? 'translateX(0)' : 'translateX(-20px)',
              transition: 'opacity 300ms ease, transform 300ms ease'
            }}
          >
            {/* Subtle glow effect at top */}
            <div className={`absolute top-0 left-0 right-0 h-32 pointer-events-none
              ${isLight
                ? 'bg-gradient-to-b from-gray-200/30 to-transparent'
                : 'bg-gradient-to-b from-gray-700/10 to-transparent'
              }`}
            />

            {/* 1. Sidebar Controls (Logo, YOLO, Settings, Theme) - NA GORZE */}
            <SidebarControls
              isLight={isLight}
              onSettingsOpen={() => setSettingsOpen(true)}
              toggleTheme={toggleTheme}
            />

            {/* 2. Model Selector - wrapped in GlowCard */}
            <GlowCard className="p-0" disableTilt={true} disableAnimation={true} intensity={0.2}>
              <ModelSelector
                onSelect={handleModelSelect}
                compact={true}
              />
            </GlowCard>

            {/* 3. Queue Status */}
            <GlowCard className="p-0" disableTilt={true} disableAnimation={true} intensity={0.2}>
              <QueueStatus />
            </GlowCard>

            {/* 4. MCP Servers Status */}
            <GlowCard className="p-0" disableTilt={true} disableAnimation={true} intensity={0.2}>
              <MCPStatus />
            </GlowCard>

            {/* 5. Ollama Status */}
            <GlowCard className="p-0" disableTilt={true} disableAnimation={true} intensity={0.2}>
              <OllamaStatus />
            </GlowCard>

            {/* 6. Build Freshness Check */}
            <GlowCard className="p-0" disableTilt={true} disableAnimation={true} intensity={0.2}>
              <BuildFreshness />
            </GlowCard>

            {/* Footer z gradient divider */}
            <div className="mt-auto text-center relative">
              <div className={`h-px my-2 ${
                isLight
                  ? 'bg-gradient-to-r from-transparent via-gray-300 to-transparent'
                  : 'bg-gradient-to-r from-transparent via-gray-700 to-transparent'
              }`} />
              <p className={`text-[8px] font-mono tracking-wider transition-opacity duration-300 hover:opacity-100 ${
                isLight ? 'text-gray-400 opacity-60' : 'text-gray-600 opacity-60'
              }`}>
                SERENA &bull; DC &bull; PLAYWRIGHT &bull; SWARM
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full">
          {/* Header - z backdrop-blur i subtle shadow */}
          <div className={`flex items-center justify-between p-2 border-b backdrop-blur-xl
            ${isLight
              ? 'border-gray-200/80 bg-white/60 shadow-[0_2px_10px_rgba(0,0,0,0.03)]'
              : 'border-gray-800/80 bg-black/60 shadow-[0_2px_10px_rgba(255,255,255,0.01)]'
            }`}
          >
            {/* Left: Sidebar Toggle + View Mode Tabs */}
            <div className="flex items-center gap-2">
              {/* Sidebar Toggle z animacja */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`glass-button p-1.5 transition-all duration-300 hover:scale-105 active:scale-95
                  ${isLight ? 'hover:bg-gray-200' : 'hover:bg-gray-700'}`}
                title={sidebarOpen ? 'Hide panel' : 'Show panel'}
              >
                <span className={`inline-block transition-transform duration-300 ${!sidebarOpen ? 'rotate-180' : ''}`}>
                  <ChevronLeft size={16} />
                </span>
              </button>

              {/* View Mode Tabs z ulepszonymi animacjami */}
              <div className={`flex items-center gap-0.5 p-0.5 rounded-lg relative overflow-hidden ${
                isLight ? 'bg-gray-100/80 backdrop-blur-sm' : 'bg-gray-800/50 backdrop-blur-sm'
              }`}>
                {viewModes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => handleViewChange(mode.id)}
                    data-testid={`view-tab-${mode.id}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono
                      transition-all duration-300 ease-out relative z-10 ${
                      activeView === mode.id
                        ? isLight
                          ? 'bg-white text-black shadow-md scale-[1.02]'
                          : 'bg-gray-700 text-white shadow-md shadow-white/5 scale-[1.02]'
                        : isLight
                          ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-50/80'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                    }`}
                    title={mode.title}
                  >
                    <span className={`transition-transform duration-200 ${
                      activeView === mode.id ? 'scale-110' : 'scale-100'
                    }`}>
                      {mode.icon}
                    </span>
                    <span className="hidden sm:inline">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Center - Tab Bar (only show in chat view) */}
            <div className={`flex-1 mx-2 transition-all duration-300 ${
              activeView !== 'chat' ? 'opacity-30 pointer-events-none scale-[0.98]' : 'opacity-100'
            }`}>
              <TabBar onCreateTab={handleCreateTab} />
            </div>

            {/* History Button z glow effect */}
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className={`glass-button p-1.5 transition-all duration-300 hover:scale-105 active:scale-95
                ${historyOpen
                  ? isLight
                    ? 'ring-2 ring-gray-400 ring-offset-2 ring-offset-white/50 bg-gray-200'
                    : 'ring-2 ring-gray-500 ring-offset-2 ring-offset-black/50 bg-gray-700'
                  : isLight
                    ? 'hover:bg-gray-200'
                    : 'hover:bg-gray-700'
                }`}
              title="Historia czatow"
            >
              <History size={16} className={`transition-transform duration-200 ${historyOpen ? 'rotate-12' : ''}`} />
            </button>
          </div>

          {/* Content Area z tlem i ulepszonym spacing */}
          <div className="flex-1 overflow-hidden relative p-2">
            {/* Background image */}
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-500"
              style={{
                backgroundImage: `url(${isLight ? '/backgroundlight.webp' : '/background.webp'})`,
                opacity: 0.08,
              }}
            />

            {/* Subtle gradient overlay */}
            <div className={`absolute inset-0 ${
              isLight
                ? 'bg-gradient-to-br from-white/50 via-gray-50/40 to-gray-100/50 backdrop-blur-sm'
                : 'bg-gradient-to-br from-black/50 via-gray-900/40 to-black/50 backdrop-blur-sm'
            }`} />

            {/* Extra subtle radial glow in center */}
            <div className={`absolute inset-0 pointer-events-none ${
              isLight
                ? 'bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.3)_0%,transparent_70%)]'
                : 'bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.02)_0%,transparent_70%)]'
            }`} />

            {/* Content frame with enhanced glassmorphism */}
            <div className={`absolute inset-3 rounded-xl overflow-hidden border transition-all duration-300
              ${isLight
                ? 'border-gray-200/60 bg-white/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)]'
                : 'border-gray-800/60 bg-black/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
              }
              ${isViewTransitioning ? 'scale-[0.99] opacity-80' : 'scale-100 opacity-100'}
            `}>
              {/* Inner glow effect */}
              <div className={`absolute inset-0 pointer-events-none rounded-xl ${
                isLight
                  ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-1px_0_rgba(0,0,0,0.02)]'
                  : 'shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-1px_0_rgba(0,0,0,0.2)]'
              }`} />

              {/* Render component based on activeView with animations */}
              <div className={`h-full transition-all duration-300 ease-out ${
                isViewTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
              }`}>
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
      </div>

      {/* Floating Dock - Quick actions */}
      <FloatingDock
        items={dockItems}
        position="bottom"
        magnification={1.4}
        baseIconSize={44}
        distance={20}
        visible={true}
      />

      {/* StatusLine at bottom - Above the dock */}
      <div style={{ zIndex: 100 }}>
        <StatusLine
          isConnected={isConnected}
          yoloEnabled={yoloEnabled}
          mcpOnline={onlineCount}
          mcpTotal={totalCount}
        />
      </div>
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
