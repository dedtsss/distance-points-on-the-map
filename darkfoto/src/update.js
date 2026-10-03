import { Capacitor, registerPlugin } from '@capacitor/core';

const update = registerPlugin('DarkFotoUpdate');
const RELEASES = 'https://api.github.com/repos/dedtsss/distance-points-on-the-map/releases?per_page=30';

export const isAndroidUpdateAvailable = () => Capacitor.getPlatform() === 'android';
export const installedVersion = () => update.installedVersion();
export const installRelease = (release) => update.downloadAndInstall({ url: release.url, sha256: release.sha256 || '' });

export function compareVersions(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  }
  return 0;
}

export function selectUpdate(releases, currentVersion) {
  return releases.flatMap((release) => {
    const version = /^darkfoto-v(\d+\.\d+\.\d+)$/.exec(release.tag_name || '')?.[1];
    if (!version || release.draft || release.prerelease || compareVersions(version, currentVersion) <= 0) return [];
    const asset = (release.assets || []).find((item) => item.name?.endsWith('.apk')
      && /^https:\/\/github\.com\/dedtsss\/distance-points-on-the-map\/releases\/download\//.test(item.browser_download_url || ''));
    if (!asset) return [];
    const sha256 = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest || '')?.[1] || '';
    return [{ version, url: asset.browser_download_url, sha256 }];
  }).sort((a, b) => compareVersions(b.version, a.version))[0] || null;
}

export async function checkForUpdate(currentVersion, fetchImpl = fetch) {
  const response = await fetchImpl(RELEASES, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`GitHub Releases: HTTP ${response.status}`);
  return selectUpdate(await response.json(), currentVersion);
}
