const crypto = require('crypto');

const MACHINE_ID_KEY = 'saulGoodman.machineId';
const HASH_SALT_KEY = 'saulGoodman.hashSalt';
const WORKSPACE_IDS_KEY = 'saulGoodman.workspaceIds';

function getOrCreateMachineId(context) {
  const stored = context.globalState.get(MACHINE_ID_KEY);
  if (stored) {
    return stored;
  }
  const id = createUuid();
  void context.globalState.update(MACHINE_ID_KEY, id);
  return id;
}

function getOrCreateHashSalt(context) {
  const stored = context.globalState.get(HASH_SALT_KEY);
  if (stored) {
    return stored;
  }
  const salt = createUuid();
  void context.globalState.update(HASH_SALT_KEY, salt);
  return salt;
}

function getOrCreateWorkspaceId(context, workspacePath) {
  if (!workspacePath) {
    return null;
  }
  const stored = context.globalState.get(WORKSPACE_IDS_KEY) || {};
  if (stored[workspacePath]) {
    return stored[workspacePath];
  }
  const id = createUuid();
  const updated = { ...stored, [workspacePath]: id };
  void context.globalState.update(WORKSPACE_IDS_KEY, updated);
  return id;
}

function hashValue(value, salt) {
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

function createUuid() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

module.exports = {
  getOrCreateMachineId,
  getOrCreateHashSalt,
  getOrCreateWorkspaceId,
  hashValue,
  createUuid
};
