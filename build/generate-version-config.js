const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

const versionConfig = {
  appVersion: packageJson.version,
  electronVersion: process.versions.electron || '',
  chromeVersion: process.versions.chrome || '',
  nodeVersion: process.versions.node || '',
  vueVersion: packageJson.dependencies?.vue?.replace(/[\^~>=<]/g, '') || '',
  viteVersion: packageJson.devDependencies?.vite?.replace(/[\^~>=<]/g, '') || '',
  typescriptVersion: packageJson.devDependencies?.typescript?.replace(/[\^~>=<]/g, '') || ''
};

const configDir = path.join(__dirname, '..', 'resources', 'config');
const versionFilePath = path.join(configDir, 'version.json');

if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

fs.writeFileSync(versionFilePath, JSON.stringify(versionConfig, null, 2), 'utf-8');
console.log(`Version config generated at: ${versionFilePath}`);
console.log(JSON.stringify(versionConfig, null, 2));
