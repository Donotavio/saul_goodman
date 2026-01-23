const vscode = require('vscode');
const { getOrCreateHashSalt, getOrCreateMachineId, hashValue, createUuid } = require('../utils/identity');

function createHeartbeatFactory(context, getConfig) {
  const machineId = getOrCreateMachineId(context);
  const salt = getOrCreateHashSalt(context);
  const pluginVersion = context.extension?.packageJSON?.version || '0.0.0';
  const vscodeVersion = vscode.env.appName || 'VS Code';
  const uiKind = vscode.env.uiKind === vscode.UIKind.Desktop ? 'desktop' : 'web';
  const remoteName = vscode.env.remoteName || '';
  const shell = vscode.env.shell || '';

  return function buildHeartbeat(payload) {
    const config = getConfig();
    const now = new Date();
    const entityType = payload.entityType || 'file';
    const entity = sanitizeEntity(payload.entity, entityType, config, salt);
    const project = sanitizeProject(payload.project, config, salt);
    
    const metadata = {
      ...(payload.metadata || {}),
      vscodeVersion,
      uiKind,
      remoteName,
      shell,
      sessionId: vscode.env.sessionId
    };

    return {
      id: payload.id || createUuid(),
      time: payload.time || now.toISOString(),
      entityType,
      entity,
      project,
      language: payload.language || '',
      category: payload.category || 'coding',
      isWrite: Boolean(payload.isWrite),
      editor: 'vscode',
      pluginVersion,
      machineId,
      metadata
    };
  };
}

function sanitizeEntity(value, entityType, config, salt) {
  const raw = typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'unknown';
  if (shouldHashEntity(entityType, config)) {
    return hashValue(raw, salt);
  }
  return truncateLabel(raw);
}

function shouldHashEntity(entityType, config) {
  if (config.hashFilePaths === false) {
    return false;
  }
  return (
    entityType === 'file' ||
    entityType === 'workspace' ||
    entityType === 'repository' ||
    entityType === 'commit'
  );
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
