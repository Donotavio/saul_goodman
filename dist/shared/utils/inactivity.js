export function formatInactivityMessage(thresholdMs) {
    const seconds = Math.floor(thresholdMs / 1000);
    return `${seconds}s`;
}
