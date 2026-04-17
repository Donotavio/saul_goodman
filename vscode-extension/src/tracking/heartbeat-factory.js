/**
 * Canonical heartbeat schema — contract between VS Code Extension and Saul Daemon.
 * Any field change here MUST be mirrored in saul-daemon/index.cjs (heartbeat ingestion).
 *
 * @typedef {Object} SaulHeartbeat
 * @property {string} id - Unique heartbeat ID (UUID). Daemon generates a fallback if absent.
 * @property {string} time - ISO 8601 timestamp. Daemon coerces to epoch ms internally.
 * @property {string} entityType - Type of entity (e.g. 'file', 'app'). Default: 'file'.
 * @property {string} entity - Entity path (hashed if hashFilePaths=true). Default: 'unknown'.
 * @property {string} project - Project name (hashed if hashProjectNames=true).
 * @property {string} language - Programming language.
 * @property {string} category - Activity category. Default: 'coding'.
 * @property {boolean} isWrite - Whether this is a write operation.
 * @property {string} editor - Editor identifier (always 'vscode').
 * @property {string} pluginVersion - Extension version.
 * @property {string} machineId - Machine identifier (UUID).
 * @property {Object} metadata - Additional metadata (daemon normalizes each field individually).
 * @property {string} [metadata.sessionId] - VS Code session ID. Used in fingerprint.
 * @property {string} [metadata.workspaceId] - Workspace identifier. Used in fingerprint.
 * @property {string} [metadata.vscodeVersion] - VS Code version string.
 * @property {string} [metadata.uiKind] - 'desktop' or 'web'.
 * @property {string} [metadata.remoteName] - Remote environment name.
 * @property {string} [metadata.shell] - User's default shell.
 */

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
    entityType === 'commit' ||
    entityType === 'tab_switch'
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
