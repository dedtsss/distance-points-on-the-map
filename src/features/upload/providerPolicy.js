export const PRIMARY_PROVIDERS = Object.freeze(['freeimage', 'ninjabox']);
export const FALLBACK_PROVIDER = 'x0';

const linkFor = (links, provider) => links.find((link) => link.provider === provider)?.url || '';

export function normalizeProviderResult(item, galleryUrl = '') {
  const links = Array.isArray(item?.links) ? item.links : [];
  const fallback = links.find((link) => link.provider === FALLBACK_PROVIDER) || null;
  const replaced = fallback?.replaces || [];
  const warnings = [];

  replaced.forEach((provider) => {
    const label = provider === 'freeimage' ? 'Freeimage' : 'Ninjabox';
    warnings.push(`${label} не загрузился, использован x0.at.`);
  });

  PRIMARY_PROVIDERS.forEach((provider) => {
    if (item?.providers?.[provider]?.ok === false && !replaced.includes(provider)) {
      warnings.push(`${provider === 'freeimage' ? 'Freeimage' : 'Ninjabox'} не загрузился.`);
    }
  });

  return {
    freeimageUrl: linkFor(links, 'freeimage'),
    ninjaboxUrl: linkFor(links, 'ninjabox'),
    ninjaboxGalleryUrl: galleryUrl || '',
    fallbackUrl: fallback?.url || '',
    uploadWarnings: warnings,
    links,
    providerResults: item?.providers || null,
    complete: links.length >= 2,
    partial: links.length === 1,
  };
}

export function normalizeBundleResult(bundle, entries) {
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  const itemByPhotoId = new Map(items.map((item) => [String(item.photoId), item]));
  const results = new Map();

  entries.forEach((entry, index) => {
    const item = itemByPhotoId.get(String(entry.photoId));
    if (!item) {
      results.set(entry.photoId, {
        ...normalizeProviderResult(null, bundle?.ninjaboxGalleryUrl),
        technicalError: 'Worker did not return an item for this photoId',
      });
      return;
    }

    const orderMismatch = Number(item.index) !== index || item.fileName !== entry.file.name;
    if (orderMismatch) {
      results.set(entry.photoId, {
        ...normalizeProviderResult(null, bundle?.ninjaboxGalleryUrl),
        providerResults: item.providers || null,
        technicalError: `Bundle order mismatch: expected ${index}/${entry.file.name}, received ${item.index}/${item.fileName}`,
      });
      return;
    }
    results.set(entry.photoId, {
      ...normalizeProviderResult(item, bundle?.ninjaboxGalleryUrl),
      technicalError: '',
    });
  });

  return results;
}
