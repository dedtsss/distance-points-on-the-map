import { Capacitor, registerPlugin } from '@capacitor/core';

const textPlugin = registerPlugin('DarkFotoText');
export const isNativeTextExport = () => Capacitor.getPlatform() === 'android';

export const textFilename = (session = '') => {
  const safe = String(session || '').trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.\s]+|[_\.\s]+$/g, '')
    .slice(0, 64);
  return safe ? `DarkFotoResult_${safe}.txt` : 'DarkFotoResult.txt';
};
export const gpxFilename = (session = '') => textFilename(session).replace(/\.txt$/, '.gpx');

export async function copyText(text) {
  const value = String(text || '');
  if (isNativeTextExport()) return textPlugin.copyText({ text: value });
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

export async function copyResultBlocks(blocks, onProgress = () => {}) {
  if (!blocks.length) return 0;
  if (!isNativeTextExport()) {
    await copyText(blocks.join('\n\n'));
    onProgress(blocks.length, blocks.length);
    return blocks.length;
  }
  const listener = await textPlugin.addListener('copyProgress', ({ count, total }) => onProgress(count, total));
  try {
    const result = await textPlugin.copyBlocks({ blocks });
    return result.count;
  } finally { await listener.remove(); }
}

const downloadBrowserFile = (text, filename, type) => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function exportGpx(gpx, action = 'save', session = '') {
  const filename = gpxFilename(session);
  if (isNativeTextExport()) {
    if (action === 'share') return textPlugin.shareGpx({ text: gpx, filename });
    return textPlugin.saveGpx({ text: gpx, filename });
  }
  downloadBrowserFile(gpx, filename, 'application/gpx+xml');
}

export async function exportText(text, action = 'save', session = '') {
  const filename = textFilename(session);
  if (isNativeTextExport()) {
    if (action === 'share') return textPlugin.shareText({ text, filename });
    return textPlugin.saveText({ text, filename });
  }
  downloadBrowserFile(text, filename, 'text/plain;charset=utf-8');
}
