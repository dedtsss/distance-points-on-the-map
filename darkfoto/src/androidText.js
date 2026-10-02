import { Capacitor, registerPlugin } from '@capacitor/core';

const textPlugin = registerPlugin('DarkFotoText');
export const isNativeTextExport = () => Capacitor.getPlatform() === 'android';

export async function exportText(text, action = 'save') {
  if (isNativeTextExport()) {
    if (action === 'share') return textPlugin.shareText({ text });
    return textPlugin.saveText({ text });
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'darkfoto-result.txt';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
