import { buildPhotoResultBlocks, formatAllPhotoResultBlocks } from './resultBlockFormatter.js';
import { isActivePhoto } from '../session/sessionDomain.js';

const filenamePart = (value, fallback) => String(value || '')
  .normalize('NFKC')
  .replace(/[\\/:*?"<>|]+/g, '-')
  .replace(/\s+/g, '')
  .replace(/-+/g, '-')
  .replace(/^[-.]+|[-.]+$/g, '')
  .slice(0, 80) || fallback;

export function activeSessionPhotos(photos = []) {
  return (photos || []).filter(isActivePhoto);
}

export function buildSessionTxtFileName(session = {}, activeCount = 0) {
  const number = String(Math.max(0, Number(session.sessionNumber) || 0)).padStart(4, '0');
  const packing = filenamePart(session.packing, 'без-фасовки');
  const color = filenamePart(session.color, 'без-цвета');
  const count = Math.max(0, Number(activeCount) || 0);
  return `${number}_${packing}_${color}_${count}.txt`;
}

export function buildSessionTextExport(session = {}) {
  const activePhotos = activeSessionPhotos(session.photos);
  const options = {
    description: session.description || '',
    color: session.color || '',
    packing: session.packing || '',
  };
  return {
    fileName: buildSessionTxtFileName(session, activePhotos.length),
    content: formatAllPhotoResultBlocks(activePhotos, options),
    blocks: buildPhotoResultBlocks(activePhotos, options),
    activeCount: activePhotos.length,
    mimeType: 'text/plain;charset=utf-8',
  };
}

export function downloadSessionTextExport(exportData, options = {}) {
  const documentObject = options.documentObject || globalThis.document;
  const urlObject = options.urlObject || globalThis.URL;
  if (!documentObject?.createElement || !documentObject?.body || !urlObject?.createObjectURL) {
    throw new Error('Скачивание TXT недоступно в этом браузере.');
  }
  const blob = new Blob([exportData.content], { type: exportData.mimeType });
  const href = urlObject.createObjectURL(blob);
  const anchor = documentObject.createElement('a');
  anchor.href = href;
  anchor.download = exportData.fileName;
  anchor.hidden = true;
  documentObject.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => urlObject.revokeObjectURL?.(href), 1000);
  return exportData;
}
