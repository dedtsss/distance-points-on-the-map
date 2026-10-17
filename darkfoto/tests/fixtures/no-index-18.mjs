// Entirely synthetic coordinates, names and capture times. No owner media/data.
// Nine consecutive coordinate groups, including a distinct pair about 9 m apart.
const sizes = [3, 2, 1, 2, 3, 1, 2, 2, 2];
export const noIndex18 = sizes.flatMap((size, group) => Array.from({ length: size }, (_, member) => ({
  fileName: `synthetic-point-${group + 1}-photo-${member + 1}.jpg`,
  coordinates: { latitude: 64.12345 + (group === 1 ? 0.00008 : group * 0.001), longitude: 30.54321 },
  captureTimeMs: Date.UTC(2026, 0, 1, 12) + group * 600_000 + member * 180_000,
  captureTimeSource: 'exif', gpsSource: 'exif', gpsStatus: 'done', gpsConfidence: 1,
  coordinateQuality: 'confident', indexFromOcr: null, indexStatus: 'disabled', indexMode: false,
  orientation: 1, uploadResult: { links: [] },
}))).map((photo, i) => ({ ...photo, id: String(i + 1), number: i + 1 }));
