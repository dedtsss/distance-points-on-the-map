const padPhotoNumber = (number) => String(Math.max(1, Number(number) || 1)).padStart(3, '0');

const normalizeIndexCharacters = (value) => String(value || '')
  .normalize('NFKC')
  .replace(/[OoОо]/g, '0')
  .replace(/[Il|]/g, '1')
  .replace(/[Bb]/g, '8')
  .replace(/[Ss]/g, '5');

export function normalizeIndexValue(value) {
  const normalized = normalizeIndexCharacters(value);
  const match = normalized.match(/(?:^|\D)(\d{4,5})(?!\d)/);
  if (!match) return null;
  return match[1];
}

export function indexDisplayText(photo = {}) {
  const index = normalizeIndexValue(photo.indexFromOcr ?? photo.index);
  if (!index) return 'Индекс не найден';
  if (photo.indexStatus === 'uncertain') return `Индекс: ${index} — проверить`;
  return `Индекс: ${index}`;
}

export function buildPointIdentity(photo = {}) {
  const indexFromOcr = normalizeIndexValue(photo.indexFromOcr ?? photo.index);
  const number = Number(photo.number) || 1;
  const requestedStatus = photo.indexStatus;
  const indexStatus = indexFromOcr
    ? (requestedStatus === 'manual' || requestedStatus === 'uncertain' ? requestedStatus : 'found')
    : 'missing';
  const internalName = indexFromOcr
    ? `index-${indexFromOcr}`
    : `photo-${padPhotoNumber(number)}-no-index`;

  return {
    indexFromOcr,
    indexStatus,
    pointLabel: indexFromOcr || `Фото ${number}`,
    internalName,
    displayName: internalName,
    displayFileName: `${internalName}.jpg`,
  };
}

export function applyPointIdentity(photo = {}) {
  return {
    ...photo,
    ...buildPointIdentity(photo),
  };
}

export function pointIdentityPatch(photo = {}) {
  const identity = buildPointIdentity(photo);
  return {
    indexFromOcr: identity.indexFromOcr,
    indexStatus: identity.indexStatus,
    pointLabel: identity.pointLabel,
    internalName: identity.internalName,
    displayName: identity.displayName,
    displayFileName: identity.displayFileName,
  };
}
