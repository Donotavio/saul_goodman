const crypto = require('crypto');

const SALT_KEY = 'saul.telemetry.hashSalt';

function getOrCreateHashSalt(context) {
  let salt = context.globalState.get(SALT_KEY);
  if (!salt) {
    salt = crypto.randomBytes(32).toString('hex');
    context.globalState.update(SALT_KEY, salt);
  }
  return salt;
}

function hashWithSalt(value, salt) {
  if (!value || typeof value !== 'string') {
    return 'unknown';
  }
  return crypto.createHash('sha256').update(salt + value).digest('hex').substring(0, 16);
}

function anonymizePath(filePath, salt) {
  if (!filePath) {
    return 'unknown';
  }
  return hashWithSalt(filePath, salt);
}

function categorizeCommand(command) {
  if (!command || typeof command !== 'string') {
    return 'other';
  }
  const cmd = command.toLowerCase().trim();
  
  if (cmd.startsWith('git ') || cmd === 'git') return 'git';
  if (cmd.startsWith('npm ') || cmd === 'npm') return 'npm';
  if (cmd.startsWith('yarn ') || cmd === 'yarn') return 'yarn';
  if (cmd.startsWith('pnpm ') || cmd === 'pnpm') return 'pnpm';
  if (cmd.startsWith('docker ') || cmd === 'docker') return 'docker';
  if (cmd.startsWith('kubectl ') || cmd === 'kubectl') return 'kubectl';
  if (cmd.startsWith('terraform ') || cmd === 'terraform') return 'terraform';
  if (cmd.startsWith('python ') || cmd === 'python' || cmd === 'python3') return 'python';
  if (cmd.startsWith('node ') || cmd === 'node') return 'node';
  if (cmd.startsWith('go ') || cmd === 'go') return 'go';
  if (cmd.startsWith('cargo ') || cmd === 'cargo') return 'cargo';
  if (cmd.startsWith('make ') || cmd === 'make') return 'make';
  
  return 'other';
}

module.exports = {
  getOrCreateHashSalt,
  hashWithSalt,
  anonymizePath,
  categorizeCommand
};
