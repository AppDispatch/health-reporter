/**
 * Snapshot the current flag evaluation states.
 * Called at error time (not flush time) to capture what was active when the error occurred.
 */
export function snapshotFlagStates(
  provider: (() => Record<string, unknown>) | null,
): Record<string, unknown> | undefined {
  if (!provider) return undefined;
  try {
    const states = provider();
    if (states && Object.keys(states).length > 0) return states;
  } catch {
    // Provider threw — don't let correlation break error capture
  }
  return undefined;
}
