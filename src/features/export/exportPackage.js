import { activeSessionPhotos } from './sessionTextExport.js';
import { formatAllPhotoResultBlocks } from './resultBlockFormatter.js';

export const EXPORT_PACKAGE_SCHEMA_VERSION = 1;

export function buildExportPackage(session = {}) {
  const activeItems = activeSessionPhotos(session.photos).map((photo) => ({
    id: photo.id || photo.photoId || '',
    photoNumber: Number(photo.number) || 0,
    index: photo.indexFromOcr || null,
    coordinates: photo.coordinates || null,
    coordinateSource: photo.gpsSource || 'unavailable',
    uploadLinks: (photo.uploadResult?.links || []).map((link) => ({
      provider: link.provider,
      url: link.url,
      directUrl: link.directUrl || null,
    })),
    fileName: photo.fileName || '',
  }));
  const formatOptions = {
    description: session.description || '',
    color: session.color || '',
    packing: session.packing || '',
  };
  return {
    schemaVersion: EXPORT_PACKAGE_SCHEMA_VERSION,
    version: `dark-cat-export-package/${EXPORT_PACKAGE_SCHEMA_VERSION}`,
    sessionId: session.sessionId || '',
    sessionNumber: Number(session.sessionNumber) || 0,
    packing: session.packing || '',
    color: session.color || '',
    activeCount: activeItems.length,
    items: activeItems,
    formattedText: formatAllPhotoResultBlocks(activeSessionPhotos(session.photos), formatOptions),
  };
}

/** A future transport must implement send(package); no fake delivery is exposed. */
export function createExportTransportAdapter(send) {
  return {
    available: typeof send === 'function',
    async send(exportPackage) {
      if (typeof send !== 'function') throw new Error('Внешняя интеграция пока не подключена.');
      return send(exportPackage);
    },
  };
}
