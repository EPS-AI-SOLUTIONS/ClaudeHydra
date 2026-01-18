import React, { useState, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import MCPStatus from './MCPStatus';
import SystemMetricsPanel from './SystemMetrics';
import LaunchPanel from './LaunchPanel';
import YoloToggle from './YoloToggle';
import OllamaStatus from './OllamaStatus';
import ChatInterface from './ChatInterface';
import StatusLine from './StatusLine';
import SettingsPanel from './SettingsPanel';
import { Moon, Sun, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { useMCPHealth } from '../hooks/useMCPHealth';

const Dashboard: React.FC = () => {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [yoloEnabled] = useState(() => {
    try {
      return localStorage.getItem('hydra_yolo') !== 'false';
    } catch {
      return true;
    }
  });

  const { onlineCount, totalCount } = useMCPHealth();

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected);
  }, []);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Settings Panel Modal */}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - collapsible */}
        <div
          className={`h-full transition-all duration-300 flex flex-col ${
            sidebarOpen ? 'w-80' : 'w-0'
          } overflow-hidden`}
        >
          <div className="w-80 h-full p-4 overflow-auto flex flex-col gap-4">
            {/* MCP Servers Status */}
            <MCPStatus />

            {/* Ollama Status */}
            <OllamaStatus />

            {/* System Metrics */}
            <SystemMetricsPanel />

            {/* Launch Panel */}
            <LaunchPanel />

            {/* Footer */}
            <div className="mt-auto text-center">
              <div className={`h-px my-4 ${isLight ? 'bg-gray-200' : 'bg-gray-800'}`} />
              <p className={`text-[9px] font-mono tracking-wider ${
                isLight ? 'text-gray-400' : 'text-gray-600'
              }`}>
                SERENA • DC • PLAYWRIGHT • SWARM
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col h-full">
          {/* Header */}
          <div className={`flex items-center justify-between p-4 border-b ${
            isLight ? 'border-gray-200' : 'border-gray-800'
          }`}>
            {/* Sidebar Toggle + Logo */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="glass-button p-2"
                title={sidebarOpen ? 'Hide panel' : 'Show panel'}
              >
                {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
              </button>

              <div className="flex flex-col">
                <span className={`text-xl font-mono font-bold tracking-[0.15em] ${
                  isLight ? 'text-black' : 'text-white'
                }`}>
                  HYDRA
                </span>
                <span className={`text-[10px] font-mono tracking-wider ${
                  isLight ? 'text-gray-500' : 'text-gray-500'
                }`}>
                  v10.6.1
                </span>
              </div>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-3">
              {/* YOLO Toggle */}
              <YoloToggle />

              {/* Settings Button */}
              <button
                onClick={() => setSettingsOpen(true)}
                className="glass-button p-2.5"
                title="Settings"
              >
                <Settings size={16} />
              </button>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="glass-button p-2.5"
                title={isLight ? 'Dark mode' : 'Light mode'}
              >
                {isLight ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 overflow-hidden relative">
            {/* Minimal frame */}
            <div className={`absolute inset-4 pointer-events-none z-10 border ${
              isLight ? 'border-gray-200' : 'border-gray-800'
            } rounded-lg opacity-50`} />

            {/* Chat interface */}
            <div className="h-full m-2">
              <ChatInterface onConnectionChange={handleConnectionChange} />
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

export default Dashboard;
