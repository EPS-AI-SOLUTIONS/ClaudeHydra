import { Globe } from 'lucide-react';
import { useEffect, useState } from 'react';

interface NetworkRequest {
  id: string;
  timestamp: number;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'WS';
  url: string;
  status: number | null;
  duration: number | null;
  size: number | null;
  error?: string;
}

export function NetworkPanel() {
  const [requests, setRequests] = useState<NetworkRequest[]>([]);

  // Intercept fetch for demo (in real app, this would come from Tauri)
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const start = Date.now();
      const url =
        typeof args[0] === 'string'
          ? args[0]
          : args[0] instanceof Request
            ? args[0].url
            : args[0].toString();
      const method = (args[1]?.method || 'GET') as NetworkRequest['method'];
      const id = crypto.randomUUID();

      setRequests((prev) => [
        ...prev.slice(-49),
        {
          id,
          timestamp: start,
          method,
          url,
          status: null,
          duration: null,
          size: null,
        },
      ]);

      try {
        const response = await originalFetch(...args);
        const duration = Date.now() - start;
        setRequests((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: response.status, duration, size: null } : r,
          ),
        );
        return response;
      } catch (error) {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, error: String(error), duration: Date.now() - start } : r,
          ),
        );
        throw error;
      }
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  const getStatusColor = (status: number | null) => {
    if (!status) return 'text-gray-400';
    if (status < 300) return 'text-green-400';
    if (status < 400) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="glass-card p-3">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={14} className="text-matrix-accent" />
        <span className="text-sm font-semibold text-matrix-text">Network</span>
        <span className="text-[10px] text-matrix-text-dim">({requests.length})</span>
      </div>
      <div className="space-y-1 max-h-32 overflow-auto">
        {requests.length === 0 ? (
          <div className="text-center text-xs text-matrix-text-dim py-4">No requests yet</div>
        ) : (
          requests
            .slice(-10)
            .reverse()
            .map((req) => (
              <div
                key={req.id}
                className="flex items-center gap-2 text-[10px] font-mono py-1 border-b border-matrix-border/30"
              >
                <span
                  className={`font-bold ${req.method === 'GET' ? 'text-green-400' : 'text-blue-400'}`}
                >
                  {req.method}
                </span>
                <span className="flex-1 truncate text-matrix-text">{req.url}</span>
                <span className={getStatusColor(req.status)}>{req.status || '...'}</span>
                {req.duration && <span className="text-matrix-text-dim">{req.duration}ms</span>}
              </div>
            ))
        )}
      </div>
    </div>
  );
}
