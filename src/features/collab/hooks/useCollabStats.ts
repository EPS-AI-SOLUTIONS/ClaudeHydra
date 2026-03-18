import { useQuery } from '@tanstack/react-query';

interface RoomStats {
  room_key: string;
  peer_count: number;
  document_size_bytes: number;
  version: number;
  last_update: string;
}

interface CollabStats {
  active_rooms: number;
  total_peers: number;
  total_documents: number;
  rooms: RoomStats[];
}

const API_BASE = `http://${window.location.hostname}:8082`;

async function fetchCollabStats(): Promise<CollabStats> {
  const resp = await fetch(`${API_BASE}/api/collab/stats`);
  if (!resp.ok) throw new Error(`Failed to fetch collab stats: ${resp.status}`);
  return resp.json();
}

/**
 * Hook for polling collaboration statistics.
 *
 * Returns active rooms, peer counts, document sizes, and versions.
 * Polls every 5 seconds.
 */
export function useCollabStats(enabled = true) {
  return useQuery({
    queryKey: ['collab-stats'],
    queryFn: fetchCollabStats,
    refetchInterval: 5000,
    enabled,
  });
}
