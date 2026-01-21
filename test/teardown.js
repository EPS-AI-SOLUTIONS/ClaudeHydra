/**
 * Jest Global Teardown
 * Cleans up any lingering resources after all tests complete
 */

export default async function globalTeardown() {
  // Clear any remaining timers
  const activeTimers = process._getActiveHandles?.() || [];
  for (const handle of activeTimers) {
    if (handle.unref) {
      handle.unref();
    }
  }

  // Small delay to allow cleanup
  await new Promise(resolve => setTimeout(resolve, 100));
}
