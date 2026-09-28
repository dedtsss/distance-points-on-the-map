import { Capacitor, registerPlugin } from '@capacitor/core';

const folder = registerPlugin('DarkFotoFolder');
export const hasAndroidFolderPicker = () => Capacitor.getPlatform() === 'android';

export async function pickAndroidFolder() {
  const result = await folder.pickFolder();
  return result.files.map((item) => ({ ...item, native: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function readAndroidPhoto(item) {
  const { base64 } = await folder.readPhoto({ id: item.id });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], item.name, { type: item.type });
}
