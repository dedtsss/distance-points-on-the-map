import { defineConfig, loadEnv } from 'vite';
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

const normalizeBasePath = (value) => {
  const base = String(value || '/').trim();
  if (!base || base === '/') return '/';
  return `/${base.replace(/^\/+|\/+$/g, '')}/`;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: normalizeBasePath(env.VITE_BASE_PATH || '/'),
    define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
  };
});
