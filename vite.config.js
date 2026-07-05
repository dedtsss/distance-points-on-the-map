import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('./package.json');
const git = (command, fallback) => {
  try { return execSync(command, { encoding: 'utf8' }).trim(); } catch { return fallback; }
};
const buildInfo = {
  version: packageJson.version,
  timestamp: new Date().toISOString(),
  branch: git('git branch --show-current', 'unknown'),
  commit: git('git rev-parse --short HEAD', 'unknown'),
  dirty: git('git status --porcelain', '') !== '',
  features: { providerSettings: true, sessionRestore: true, previews: true, multiPassOcr: true },
};

export default defineConfig({
  plugins: [react()],
  base: '/distance-points-on-the-map/',
  define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
});
