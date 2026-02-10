// Vercel Edge Function — Anthropic models proxy
// Hides API key, bypasses CORS, filters to Claude 3+ models

export const config = {
  runtime: 'edge',
};

interface AnthropicApiModel {
  id: string;
  created_at: string;
  display_name: string;
  type: string;
}

interface AnthropicModelsResponse {
  data: AnthropicApiModel[];
  first_id: string;
  last_id: string;
  has_more: boolean;
}

/** Check if model ID represents Claude 3+ */
function isClaude3Plus(id: string): boolean {
  return (
    id.startsWith('claude-3') ||
    id.startsWith('claude-sonnet-4') ||
    id.startsWith('claude-opus-4') ||
    id.startsWith('claude-haiku-4')
  );
}

/** Parse model ID into family and version */
function parseModelId(id: string): { family: string; version: string } {
  // claude-sonnet-4-20250514 → family: "sonnet", version: "4"
  // claude-3-5-haiku-20241022 → family: "haiku", version: "3.5"
  // claude-3-opus-20240229 → family: "opus", version: "3"

  // Pattern: claude-{major}-{minor}-{family}-{date}
  const legacyMatch = id.match(/^claude-(\d+)-(\d+)-(\w+)-/);
  if (legacyMatch) {
    return { family: legacyMatch[3], version: `${legacyMatch[1]}.${legacyMatch[2]}` };
  }

  // Pattern: claude-{major}-{family}-{date}
  const oldMatch = id.match(/^claude-(\d+)-(\w+)-/);
  if (oldMatch) {
    return { family: oldMatch[2], version: oldMatch[1] };
  }

  // Pattern: claude-{family}-{major}-{date}
  const newMatch = id.match(/^claude-(\w+)-(\d+)-/);
  if (newMatch) {
    return { family: newMatch[1], version: newMatch[2] };
  }

  return { family: 'unknown', version: '0' };
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'x-api-key, content-type',
      },
    });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Key priority: user-provided header > server env
  const userKey = req.headers.get('x-api-key');
  const apiKey = userKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing API Key' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(errorText, {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data: AnthropicModelsResponse = await response.json();

    // Filter to Claude 3+ and normalize
    const models = data.data
      .filter((m) => isClaude3Plus(m.id))
      .map((m) => {
        const { family, version } = parseModelId(m.id);
        return {
          id: m.id,
          displayName: m.display_name || m.id,
          provider: 'anthropic' as const,
          createdAt: m.created_at,
          family,
          version,
          isLatest: false,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Mark latest per family
    const seenFamilies = new Set<string>();
    for (const model of models) {
      if (!seenFamilies.has(model.family)) {
        model.isLatest = true;
        seenFamilies.add(model.family);
      }
    }

    return new Response(JSON.stringify(models), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
