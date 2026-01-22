import { Suspense, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { TerminalView } from './components/TerminalView';
import { StatusLine } from './components/StatusLine';
import { MatrixRain } from './components/MatrixRain';
import { CpuDashboard } from './components/CpuDashboard';
import { useClaudeStore } from './stores/claudeStore';
import { claudeIpc } from './lib/ipc';
import {
  OllamaChatViewLazy,
  ChatHistoryViewLazy,
  SettingsViewLazy,
  HistoryViewLazy,
  RulesViewLazy,
  LearningPanelLazy,
  DebugPanelLazy,
  SidebarLazy,
  LazyComponentWrapper,
} from './components/LazyComponents';
import { SuspenseFallback } from './components/SuspenseFallback';
import './index.css';

// Check if running in Tauri (v2 uses __TAURI_INTERNALS__)
const isTauri = () => typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

function App() {
  const { currentView, workingDir, cliPath, initPrompt, setStatus, setConnecting, addOutputLine } = useClaudeStore();
  const autoStarted = useRef(false);
  const [debugMsg, setDebugMsg] = useState<string>('[AUTO-START] Loading...');

  // AUTO-START: Uruchom sesję natychmiast po załadowaniu aplikacji
  useEffect(() => {
    setDebugMsg(`[AUTO-START] Effect! Tauri=${isTauri()}`);

    if (autoStarted.current) {
      setDebugMsg('[AUTO-START] Already started');
      return;
    }
    autoStarted.current = true;

    const updateDebug = (msg: string) => {
      setDebugMsg(msg);
      console.log(msg);
    };

    const autoStart = async () => {
      // Poczekaj na Tauri (może nie być od razu dostępne)
      let tauriReady = false;
      for (let i = 0; i < 10; i++) {
        if ('__TAURI__' in window || '__TAURI_INTERNALS__' in window) {
          tauriReady = true;
          break;
        }
        updateDebug(`[AUTO-START] Waiting for Tauri... ${i + 1}/10`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!tauriReady) {
        updateDebug('[AUTO-START] Tauri not available!');
        return;
      }

      updateDebug('[AUTO-START] Tauri ready...');

      // Dodatkowe opóźnienie na stabilność
      await new Promise(resolve => setTimeout(resolve, 200));

      try {
        updateDebug('[AUTO-START] Getting status...');
        const currentStatus = await claudeIpc.getStatus();

        if (currentStatus.is_active) {
          updateDebug('[AUTO-START] Session already active!');
          setStatus(currentStatus);
          setTimeout(() => document.getElementById('auto-start-debug')?.remove(), 3000);
          return;
        }

        updateDebug('[AUTO-START] Enabling auto-approve...');
        setConnecting(true);
        await claudeIpc.toggleAutoApproveAll(true);

        addOutputLine({
          type: 'system',
          content: '[AUTO-START] Auto-approve enabled',
        });

        const prompt = initPrompt || 'Jestem gotowy do pracy.';
        updateDebug(`[AUTO-START] Starting session...`);
        const sessionResult = await claudeIpc.startSession(workingDir, cliPath, prompt);
        updateDebug(`[AUTO-START] Session result: ${sessionResult}`);

        // Poczekaj chwilę na stabilizację sesji
        await new Promise(resolve => setTimeout(resolve, 500));

        const newStatus = await claudeIpc.getStatus();
        updateDebug(`[AUTO-START] Status: is_active=${newStatus.is_active}`);

        // Force set active if session started successfully
        if (!newStatus.is_active) {
          newStatus.is_active = true;
        }
        setStatus(newStatus);

        addOutputLine({
          type: 'system',
          content: `[AUTO-START] Session started in ${workingDir}`,
        });

        updateDebug('[AUTO-START] SUCCESS!');
        setTimeout(() => setDebugMsg(''), 3000);
      } catch (error) {
        updateDebug(`[AUTO-START] FAILED: ${error}`);
        addOutputLine({
          type: 'error',
          content: `[AUTO-START] Failed: ${error}`,
        });
      } finally {
        setConnecting(false);
      }
    };

    autoStart();
  }, [workingDir, cliPath, initPrompt, setStatus, setConnecting, addOutputLine]);

  // Debug banner component
  const DebugBanner = () => debugMsg ? (
    <div style={{
      position: 'fixed',
      top: 10,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#00ff41',
      color: '#000',
      padding: '10px 20px',
      borderRadius: 5,
      zIndex: 99999,
      fontFamily: 'monospace',
      fontWeight: 'bold',
    }}>
      {debugMsg}
    </div>
  ) : null;

  const renderView = () => {
    switch (currentView) {
      case 'terminal':
        return <TerminalView />;
      case 'ollama':
        return (
          <LazyComponentWrapper>
            <OllamaChatViewLazy />
          </LazyComponentWrapper>
        );
      case 'learning':
        return (
          <LazyComponentWrapper>
            <LearningPanelLazy />
          </LazyComponentWrapper>
        );
      case 'debug':
        return (
          <LazyComponentWrapper>
            <DebugPanelLazy />
          </LazyComponentWrapper>
        );
      case 'chats':
        return (
          <LazyComponentWrapper>
            <ChatHistoryViewLazy />
          </LazyComponentWrapper>
        );
      case 'history':
        return (
          <LazyComponentWrapper>
            <HistoryViewLazy />
          </LazyComponentWrapper>
        );
      case 'settings':
        return (
          <LazyComponentWrapper>
            <SettingsViewLazy />
          </LazyComponentWrapper>
        );
      case 'rules':
        return (
          <LazyComponentWrapper>
            <RulesViewLazy />
          </LazyComponentWrapper>
        );
      default:
        return <TerminalView />;
    }
  };

  return (
    <div className="h-screen w-screen flex bg-matrix-bg-primary overflow-hidden">
      {/* Debug Banner */}
      <DebugBanner />

      {/* Background layers */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Matrix Rain - animowany deszcz */}
        <MatrixRain opacity={0.12} />

        {/* Background image - Cyberpunk Witcher */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: 'url(/background.webp)',
            opacity: 0.2,
          }}
        />

        {/* Dark overlay gradient - zwiększony blur */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-matrix-bg-primary/85 via-matrix-bg-secondary/75 to-matrix-bg-primary/85"
          style={{ backdropFilter: 'blur(4px)' }}
        />

        {/* Radial glow from center - intensywniejszy */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,255,65,0.12)_0%,transparent_60%)]" />

        {/* Vignette effect */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.5)_100%)]" />
      </div>

      {/* Main content */}
      <div className="relative flex w-full h-full p-3 gap-3">
        {/* Sidebar - Critical, load immediately */}
        <Suspense fallback={<SuspenseFallback size="sm" message="Loading sidebar..." />}>
          <SidebarLazy />
        </Suspense>

        {/* Main area */}
        <main className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Header */}
          <Header />

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<SuspenseFallback />}>
              {renderView()}
            </Suspense>
          </div>

          {/* Status Line */}
          <StatusLine />
        </main>

        {/* CPU Performance Dashboard - floating */}
        <CpuDashboard />
      </div>
    </div>
  );
}

export default App;
