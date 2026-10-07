import { Capacitor, registerPlugin } from '@capacitor/core';
import { validateRecovery } from './recovery.js';

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
  return new File([blob], item.name, { type: item.type || blob.type || 'image/jpeg', lastModified: item.lastModified || 0 });
}

export async function clearAndroidPhotoCache() {
  await folder.clearPhotoCache();
}

export async function saveAndroidRecovery(state, includePhotos = false) {
  if (!hasAndroidFolderPicker()) return;
  await folder.saveRecovery({ payload: JSON.stringify(state),
    ...(includePhotos ? { ids: state.files.map((file) => file.id) } : {}) });
}

export async function loadAndroidRecovery() {
  if (!hasAndroidFolderPicker()) return null;
  const { payload } = await folder.loadRecovery();
  if (!payload) return null;
  const state = validateRecovery(JSON.parse(payload));
  await folder.restoreRecoveryPhotos({ ids: state.files.map((file) => file.id) });
  return state;
}

export async function clearAndroidRecovery() {
  if (hasAndroidFolderPicker()) await folder.clearRecovery();
}
