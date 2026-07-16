import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageJson = require('./package.json');
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const git = (command, fallback) => {
  try { return execSync(command, { cwd: repoRoot, encoding: 'utf8' }).trim(); } catch { return fallback; }
};
const dirtyStatus = () => {
  const trackedChanges = git('git status --porcelain --untracked-files=no', '');
  const untrackedChanges = git('git ls-files --others --exclude-standard', '')
    .split('\n')
    .filter(Boolean)
    .filter((file) => !['dist/', 'output/'].some((prefix) => file.startsWith(prefix)))
    .filter((file) => !/^vite\.config\.[a-z0-9.-]*timestamp-[a-z0-9.-]+\.mjs$/i.test(file));
  return trackedChanges !== '' || untrackedChanges.length > 0;
};
const buildInfo = {
  version: packageJson.version,
  timestamp: new Date().toISOString(),
  branch: git('git branch --show-current', 'unknown'),
  commit: git('git rev-parse --short HEAD', 'unknown'),
  dirty: dirtyStatus(),
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
