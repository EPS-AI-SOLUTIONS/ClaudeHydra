/**
 * Hydra Bridge — lazy runtime-only import of Hydra core.
 *
 * Because Hydra's dependency tree (agents, MCP, git, hooks, planning)
 * is not compatible with Next.js webpack bundling, we use a fully
 * dynamic approach that only works at runtime, not at build time.
 *
 * Routes that need Hydra should gracefully degrade when it's unavailable.
 */

let hydraInstance: any = null;
let initAttempted = false;

export async function getHydraBridge() {
  if (hydraInstance) return hydraInstance;
  if (initAttempted) return null;

  initAttempted = true;

  try {
    // Use eval to prevent webpack from analyzing this import
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const mod = await dynamicImport('../../src/hydra/index.js');
    const { getHydra } = mod;
    hydraInstance = getHydra();
    return hydraInstance;
  } catch (err) {
    console.warn('[hydra-bridge] Hydra not available:', (err as Error).message);
    return null;
  }
}

export async function getHydraStats() {
  const hydra = await getHydraBridge();
  if (!hydra) return null;
  try {
    return hydra.getStats();
  } catch {
    return null;
  }
}

export async function processWithHydra(prompt: string, options?: Record<string, unknown>) {
  const hydra = await getHydraBridge();
  if (!hydra) throw new Error('Hydra not initialized');
  return hydra.process(prompt, options);
}
