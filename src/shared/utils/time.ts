export function getTodayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function formatMilliseconds(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.floor(ms / 60000);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60
  };
}

export function formatDuration(ms: number): string {
  const { hours, minutes } = formatMilliseconds(ms);
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

export function splitDurationByHour(
  startTimestamp: number,
  durationMs: number
): Array<{ hour: number; milliseconds: number }> {
  const result: Array<{ hour: number; milliseconds: number }> = [];
  let remaining = durationMs;
  let cursor = startTimestamp;

  while (remaining > 0) {
    const cursorDate = new Date(cursor);
    const hour = cursorDate.getHours();
    const hourStart = new Date(cursorDate);
    hourStart.setMinutes(0, 0, 0);
    const hourEnd = hourStart.getTime() + 3600000;
    const chunk = Math.min(remaining, Math.max(hourEnd - cursor, 0));

    result.push({ hour, milliseconds: chunk });

    remaining -= chunk;
    cursor += chunk;
    if (chunk === 0) {
      // safeguard infinite loop
      cursor = hourEnd;
    }
  }

  return result;
}

export function formatTimeRange(start: number, end: number, locale = 'pt-BR'): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const formatter = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
}
