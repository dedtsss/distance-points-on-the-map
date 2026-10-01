import { Capacitor, registerPlugin } from '@capacitor/core';

const folder = registerPlugin('DarkFotoFolder');
export const hasAndroidFolderPicker = () => Capacitor.getPlatform() === 'android';

export async function pickAndroidFolder() {
  const result = await folder.pickFolder();
  return result.files.map((item) => ({ ...item, native: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function pickAndroidPhotos() {
  const result = await folder.pickPhotos();
  return result.files.map((item) => ({ ...item, native: true }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function readAndroidPhoto(item) {
  const { uri, size } = await folder.readPhoto({ id: item.id });
  if (!uri?.startsWith('file://') || size <= 0 || size > 25 * 1024 * 1024) {
    throw new Error('Android photo cache returned an invalid file');
  }
  const response = await fetch(Capacitor.convertFileSrc(uri), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Android photo cache: HTTP ${response.status}`);
  const blob = await response.blob();
  if (blob.size !== size) throw new Error('Android photo cache size mismatch');
  return new File([blob], item.name, { type: item.type || blob.type || 'image/jpeg' });
}

export async function clearAndroidPhotoCache() {
  await folder.clearPhotoCache();
}
