import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const manifestPath = path.join(rootDir, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  throw new Error('manifest.json not found at repository root.');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version ?? 'dev';
const targetDir = path.join(rootDir, 'release', `saul-goodman-${version}-webstore`);

const includeEntries = [
  'manifest.json',
  'CHANGELOG.md',
  '_locales',
  'dist',
  'src/background',
  'src/content',
  'src/popup',
  'src/options',
  'src/report',
  'src/shared',
  'src/block',
  'src/img',
  'src/vendor',
  'store-assets'
];

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

const copyEntry = (entry) => {
  const source = path.join(rootDir, entry);
  if (!fs.existsSync(source)) {
    throw new Error(`Required entry missing: ${entry}`);
  }
  const dest = path.join(targetDir, entry);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(source, dest, { recursive: true });
};

includeEntries.forEach(copyEntry);

const folderName = path.basename(targetDir);
console.log(`✓ Web Store package assembled at ${targetDir}`);
console.log('To create the zip for upload:');
console.log(`  cd release && zip -r ${folderName}.zip ${folderName}`);
console.log('Excluded from package: site/, docs/, node_modules/, release/, tools/, saul-daemon/, vscode-extension/, .git');
