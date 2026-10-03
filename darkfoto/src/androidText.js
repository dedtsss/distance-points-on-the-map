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

export async function exportText(text, action = 'save', session = '') {
  const filename = textFilename(session);
  if (isNativeTextExport()) {
    if (action === 'share') return textPlugin.shareText({ text, filename });
    return textPlugin.saveText({ text, filename });
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
