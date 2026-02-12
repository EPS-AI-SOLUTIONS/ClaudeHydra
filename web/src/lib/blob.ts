import { del, head, list, put } from '@vercel/blob';

// ── Vercel Blob helpers for large data (RAG, training, vectors) ─────────────

const BLOB_PREFIX = {
  rag: 'rag/',
  training: 'training/',
  vectors: 'vectors/',
} as const;

export async function blobPut(
  category: keyof typeof BLOB_PREFIX,
  id: string,
  data: unknown,
): Promise<string> {
  const pathname = `${BLOB_PREFIX[category]}${id}.json`;
  const blob = await put(pathname, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  });
  return blob.url;
}

export async function blobGet<T>(
  category: keyof typeof BLOB_PREFIX,
  id: string,
): Promise<T | null> {
  const pathname = `${BLOB_PREFIX[category]}${id}.json`;
  try {
    const info = await head(pathname);
    if (!info) return null;
    const response = await fetch(info.url);
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function blobDelete(category: keyof typeof BLOB_PREFIX, id: string): Promise<void> {
  const pathname = `${BLOB_PREFIX[category]}${id}.json`;
  await del(pathname);
}

export async function blobList(category: keyof typeof BLOB_PREFIX): Promise<string[]> {
  const result = await list({ prefix: BLOB_PREFIX[category] });
  return result.blobs.map((b) => b.pathname);
}

export function isVercelBlobAvailable(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}
