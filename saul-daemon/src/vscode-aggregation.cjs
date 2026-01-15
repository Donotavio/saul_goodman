const DEFAULT_GAP_MS = 5 * 60 * 1000;
const DEFAULT_GRACE_MS = 2 * 60 * 1000;

function buildDurations(heartbeats, options = {}) {
  const gapMs = Number.isFinite(options.gapMs) ? options.gapMs : DEFAULT_GAP_MS;
  const graceMs = Number.isFinite(options.graceMs) ? options.graceMs : DEFAULT_GRACE_MS;
  const ordered = Array.isArray(heartbeats)
    ? heartbeats
        .filter((heartbeat) => heartbeat && Number.isFinite(heartbeat.time))
        .slice()
        .sort((a, b) => {
          if (a.time !== b.time) {
            return a.time - b.time;
          }
          return getGroupKey(a).localeCompare(getGroupKey(b));
        })
    : [];

  const durations = [];
  let active = null;

  const pushActive = () => {
    if (!active) {
      return;
    }
    const durationMs = Math.max(0, active.endTime - active.startTime);
    durations.push({
      id: active.id,
      startTime: active.startTime,
      endTime: active.endTime,
      durationMs,
      entityType: active.entityType,
      entity: active.entity,
      project: active.project,
      language: active.language,
      category: active.category,
      isWrite: active.isWrite,
      editor: active.editor,
      pluginVersion: active.pluginVersion,
      machineId: active.machineId,
      metadata: active.metadata
    });
    active = null;
  };

  for (let i = 0; i < ordered.length; i++) {
    const heartbeat = ordered[i];
    const groupKey = getGroupKey(heartbeat);
    if (!active || active.groupKey !== groupKey) {
      pushActive();
      active = createDurationSeed(heartbeat, groupKey);
    } else {
      active.isWrite = active.isWrite || Boolean(heartbeat.isWrite);
      active.metadata = mergeMetadata(active.metadata, heartbeat.metadata);
    }

    const next = ordered[i + 1];
    const hasNext = next && getGroupKey(next) === groupKey;
    const delta = hasNext ? next.time - heartbeat.time : null;
    if (!hasNext || delta === null || delta > gapMs) {
      const end = heartbeat.time + Math.min(graceMs, gapMs);
      active.endTime = Math.max(active.endTime, end);
      pushActive();
      continue;
    }

    if (delta > 0) {
      active.endTime = Math.max(active.endTime, next.time);
    }
  }

  pushActive();
  return durations;
}

function createDurationSeed(heartbeat, groupKey) {
  const startTime = heartbeat.time;
  return {
    id: `dur-${heartbeat.id || startTime}`,
    groupKey,
    startTime,
    endTime: startTime,
    entityType: heartbeat.entityType,
    entity: heartbeat.entity,
    project: heartbeat.project,
    language: heartbeat.language,
    category: heartbeat.category,
    isWrite: Boolean(heartbeat.isWrite),
    editor: heartbeat.editor,
    pluginVersion: heartbeat.pluginVersion,
    machineId: heartbeat.machineId,
    metadata: mergeMetadata({}, heartbeat.metadata)
  };
}

function mergeMetadata(target, source) {
  const merged = { ...target };
  if (!source || typeof source !== 'object') {
    return merged;
  }
  const linesAdded = Number(source.linesAdded);
  if (Number.isFinite(linesAdded)) {
    merged.linesAdded = (Number(merged.linesAdded) || 0) + linesAdded;
  }
  const linesRemoved = Number(source.linesRemoved);
  if (Number.isFinite(linesRemoved)) {
    merged.linesRemoved = (Number(merged.linesRemoved) || 0) + linesRemoved;
  }
  if (typeof source.windowFocused === 'boolean') {
    merged.windowFocused = source.windowFocused;
  }
  if (typeof source.workspaceId === 'string') {
    merged.workspaceId = source.workspaceId;
  }
  if (typeof source.branch === 'string') {
    merged.branch = source.branch;
  }
  if (typeof source.remote === 'string') {
    merged.remote = source.remote;
  }
  if (typeof source.commandId === 'string') {
    merged.commandId = source.commandId;
  }
  if (typeof source.vscodeVersion === 'string') {
    merged.vscodeVersion = source.vscodeVersion;
  }
  if (typeof source.uiKind === 'string') {
    merged.uiKind = source.uiKind;
  }
  if (typeof source.remoteName === 'string') {
    merged.remoteName = source.remoteName;
  }
  if (typeof source.shell === 'string') {
    merged.shell = source.shell;
  }
  if (typeof source.sessionId === 'string') {
    merged.sessionId = source.sessionId;
  }
  if (typeof source.commitMessage === 'string') {
    merged.commitMessage = source.commitMessage;
  }
  if (typeof source.eventType === 'string') {
    merged.eventType = source.eventType;
  }
  if (Number.isFinite(source.workingTreeChanges)) {
    merged.workingTreeChanges = source.workingTreeChanges;
  }
  if (Number.isFinite(source.indexChanges)) {
    merged.indexChanges = source.indexChanges;
  }
  if (Number.isFinite(source.ahead)) {
    merged.ahead = source.ahead;
  }
  if (Number.isFinite(source.behind)) {
    merged.behind = source.behind;
  }
  return merged;
}

function getGroupKey(heartbeat) {
  return [
    heartbeat.machineId || '',
    heartbeat.project || '',
    heartbeat.entityType || '',
    heartbeat.entity || '',
    heartbeat.language || '',
    heartbeat.category || '',
    heartbeat.editor || ''
  ].join('|');
}

function splitDurationByDay(duration, rangeStart, rangeEnd) {
  const start = Math.max(duration.startTime, rangeStart);
  const end = Math.min(duration.endTime, rangeEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [];
  }
  const slices = [];
  let cursor = start;
  while (cursor < end) {
    const date = new Date(cursor);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const sliceEnd = Math.min(end, dayEnd);
    slices.push({
      dateKey: formatDateKey(date),
      startTime: cursor,
      endTime: sliceEnd,
      durationMs: Math.max(0, sliceEnd - cursor)
    });
    cursor = sliceEnd;
  }
  return slices;
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

module.exports = {
  buildDurations,
  splitDurationByDay,
  formatDateKey
};
