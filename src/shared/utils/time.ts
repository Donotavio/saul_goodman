import type { WorkInterval } from '../types.js';

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
  if (ms < 60000) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    return `${seconds}s`;
  }
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

export function isWithinWorkSchedule(date: Date, schedule?: WorkInterval[]): boolean {
  if (!schedule || !schedule.length) {
    return true;
  }

  const minutesOfDay = date.getHours() * 60 + date.getMinutes();

  return schedule.some(({ start, end }) => {
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);
    if (startMinutes === null || endMinutes === null) {
      return false;
    }

    if (startMinutes === endMinutes) {
      return true;
    }

    if (startMinutes < endMinutes) {
      return minutesOfDay >= startMinutes && minutesOfDay < endMinutes;
    }

    return minutesOfDay >= startMinutes || minutesOfDay < endMinutes;
  });
}

function parseTimeToMinutes(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const [hours, minutes] = value.split(':').map((chunk) => Number.parseInt(chunk, 10));
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}
