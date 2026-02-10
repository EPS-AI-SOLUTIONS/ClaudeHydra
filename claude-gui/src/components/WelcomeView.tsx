import { Clock, MessageSquare, Plus, Settings, Sparkles, Terminal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { type ChatSessionSummary, useChatHistory } from '../hooks/useChatHistory';
import { useClaudeStore } from '../stores/claudeStore';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'przed chwilą';
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h temu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'wczoraj';
  return `${days} dni temu`;
}

export function WelcomeView() {
  const { setCurrentView, setActiveSessionId } = useClaudeStore();
  const { sessions, loadSessions, createSession, loadSession } = useChatHistory();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSessions().then(() => setLoaded(true));
  }, [loadSessions]);

  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  const handleNewChat = useCallback(async () => {
    const title = `Chat ${sessions.length + 1}`;
    const session = await createSession(title);
    if (session) {
      setActiveSessionId(session.id);
      setCurrentView('terminal');
    }
  }, [sessions.length, createSession, setActiveSessionId, setCurrentView]);

  const handleOpenSession = useCallback(
    async (session: ChatSessionSummary) => {
      setActiveSessionId(session.id);
      await loadSession(session.id);
      setCurrentView('terminal');
    },
    [setActiveSessionId, loadSession, setCurrentView],
  );

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 overflow-y-auto">
      {/* Hero */}
      <div className="flex flex-col items-center gap-4 mb-10">
        <div className="w-24 h-24 rounded-2xl overflow-hidden bg-matrix-accent/10 shadow-lg shadow-matrix-accent/30">
          <img src="/logodark.webp" alt="Claude HYDRA" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-3xl font-bold text-matrix-accent text-glow">Claude HYDRA</h1>
        <p className="text-sm text-matrix-text-dim text-center max-w-md">
          AI Swarm Control Center — rozpocznij nowy czat lub kontynuuj poprzednią rozmowę.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg mb-8">
        <button
          type="button"
          onClick={handleNewChat}
          className="glass-card p-4 flex flex-col items-center gap-2 hover:bg-matrix-accent/10 hover:border-matrix-accent/40 transition-all group cursor-pointer"
        >
          <Plus
            size={22}
            className="text-matrix-accent group-hover:scale-110 transition-transform"
          />
          <span className="text-xs text-matrix-text group-hover:text-matrix-accent transition-colors">
            Nowy czat
          </span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('terminal')}
          className="glass-card p-4 flex flex-col items-center gap-2 hover:bg-matrix-accent/10 hover:border-matrix-accent/40 transition-all group cursor-pointer"
        >
          <Terminal
            size={22}
            className="text-matrix-text-dim group-hover:text-matrix-accent group-hover:scale-110 transition-all"
          />
          <span className="text-xs text-matrix-text group-hover:text-matrix-accent transition-colors">
            Terminal
          </span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('settings')}
          className="glass-card p-4 flex flex-col items-center gap-2 hover:bg-matrix-accent/10 hover:border-matrix-accent/40 transition-all group cursor-pointer"
        >
          <Settings
            size={22}
            className="text-matrix-text-dim group-hover:text-matrix-accent group-hover:scale-110 transition-all"
          />
          <span className="text-xs text-matrix-text group-hover:text-matrix-accent transition-colors">
            Ustawienia
          </span>
        </button>
      </div>

      {/* Recent Chats */}
      {loaded && recentSessions.length > 0 && (
        <div className="w-full max-w-lg">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} className="text-matrix-text-dim" />
            <span className="text-xs text-matrix-text-dim uppercase tracking-wider">
              Ostatnie czaty
            </span>
          </div>

          <div className="space-y-2">
            {recentSessions.map((session) => (
              <button
                type="button"
                key={session.id}
                onClick={() => handleOpenSession(session)}
                className="w-full glass-card p-3 flex items-center gap-3 hover:bg-matrix-accent/10 hover:border-matrix-accent/40 transition-all group cursor-pointer text-left"
              >
                <MessageSquare
                  size={16}
                  className="text-matrix-text-dim group-hover:text-matrix-accent flex-shrink-0 transition-colors"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-matrix-text truncate group-hover:text-matrix-accent transition-colors">
                    {session.title}
                  </p>
                  {session.preview && (
                    <p className="text-[10px] text-matrix-text-dim truncate mt-0.5">
                      {session.preview}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-[10px] text-matrix-text-dim">
                    {timeAgo(session.updated_at)}
                  </span>
                  <span className="text-[10px] text-matrix-text-dim">
                    {session.message_count} wiad.
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {loaded && recentSessions.length === 0 && (
        <div className="flex flex-col items-center gap-3 text-center">
          <Sparkles size={32} className="text-matrix-accent/40" />
          <p className="text-sm text-matrix-text-dim">Brak czatów. Zacznij nową rozmowę!</p>
        </div>
      )}
    </div>
  );
}
