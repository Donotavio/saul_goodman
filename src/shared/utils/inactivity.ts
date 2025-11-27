export function formatInactivityMessage(thresholdMs: number): string {
  const seconds = Math.floor(thresholdMs / 1000);
  return `${seconds}s`;
}
