const { getOrCreateHashSalt, getOrCreateMachineId, hashValue, createUuid } = require('../utils/identity');

function createHeartbeatFactory(context, getConfig) {
  const machineId = getOrCreateMachineId(context);
  const salt = getOrCreateHashSalt(context);
  const pluginVersion = context.extension?.packageJSON?.version || '0.0.0';

  return function buildHeartbeat(payload) {
    const config = getConfig();
    const now = new Date();
    const entity = sanitizeEntity(payload.entity, config, salt);
    const project = sanitizeProject(payload.project, config, salt);
    return {
      id: payload.id || createUuid(),
      time: payload.time || now.toISOString(),
      entityType: payload.entityType || 'file',
      entity,
      project,
      language: payload.language || '',
      category: payload.category || 'coding',
      isWrite: Boolean(payload.isWrite),
      editor: 'vscode',
      pluginVersion,
      machineId,
      metadata: payload.metadata || {}
    };
  };
}

function sanitizeEntity(value, config, salt) {
  const raw = typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'unknown';
  if (config.hashFilePaths !== false) {
    return hashValue(raw, salt);
  }
  return truncateLabel(raw);
}

function sanitizeProject(value, config, salt) {
  const raw = typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
  if (!raw) {
    return '';
  }
  if (config.hashProjectNames) {
    return hashValue(raw, salt);
  }
  return truncateLabel(raw);
}

function truncateLabel(value, maxLength = 120) {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 3) + '...';
}

module.exports = {
  createHeartbeatFactory
};
