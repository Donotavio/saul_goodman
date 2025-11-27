export function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}
export function formatMilliseconds(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    return {
        hours: Math.floor(totalMinutes / 60),
        minutes: totalMinutes % 60
    };
}
export function formatDuration(ms) {
    const { hours, minutes } = formatMilliseconds(ms);
    if (hours <= 0) {
        return `${minutes}m`;
    }
    return `${hours}h ${minutes}m`;
}
