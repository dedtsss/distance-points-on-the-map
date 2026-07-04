export const PRIMARY_PROVIDERS = Object.freeze(['freeimage', 'ninjabox']);
export const FALLBACK_PROVIDER = 'x0';

export const DEFAULT_PROVIDER_SETTINGS = Object.freeze({
  freeimage: true,
  ninjabox: true,
  includeX0: false,
  fallbackX0: true,
});

export function normalizeProviderSettings(settings = {}) {
  return {
    freeimage: settings.freeimage !== false,
    ninjabox: settings.ninjabox !== false,
    includeX0: settings.includeX0 === true,
    fallbackX0: settings.fallbackX0 !== false,
  };
}

export function validateProviderSettings(settings) {
  const normalized = normalizeProviderSettings(settings);
  const selectedProviders = PRIMARY_PROVIDERS.filter((provider) => normalized[provider]);
  return {
    valid: selectedProviders.length > 0,
    selectedProviders,
    settings: normalized,
    error: selectedProviders.length > 0 ? '' : 'Выберите хотя бы один основной сервис загрузки.',
  };
}

export function providerRequestPolicy(settings) {
  const validation = validateProviderSettings(settings);
  return {
    ...validation,
    providers: validation.selectedProviders.join(','),
    includeX0: validation.settings.includeX0,
    fallback: validation.settings.fallbackX0 ? 'x0' : 'none',
  };
}

const linkFor = (links, provider) => links.find((link) => link.provider === provider)?.url || '';

export function normalizeProviderResult(item, galleryUrl = '', bundlePolicy = {}) {
  const links = Array.isArray(item?.links) ? item.links : [];
  const fallback = links.find((link) => link.provider === FALLBACK_PROVIDER) || null;
  const replaced = fallback?.replaces || [];
  const warnings = [];
  const requestedProviders = Array.isArray(bundlePolicy.providers)
    ? bundlePolicy.providers
    : PRIMARY_PROVIDERS;

  replaced.forEach((provider) => {
    const label = provider === 'freeimage' ? 'Freeimage' : 'Ninjabox';
    warnings.push(`${label} не загрузился, использован x0.at.`);
  });

  requestedProviders.forEach((provider) => {
    if (item?.providers?.[provider]?.ok === false && !replaced.includes(provider)) {
      warnings.push(`${provider === 'freeimage' ? 'Freeimage' : 'Ninjabox'} не загрузился.`);
    }
  });

  const expectedLinkCount = requestedProviders.length + (bundlePolicy.includeX0 ? 1 : 0);
  return {
    freeimageUrl: linkFor(links, 'freeimage'),
    ninjaboxUrl: linkFor(links, 'ninjabox'),
    ninjaboxGalleryUrl: galleryUrl || '',
    fallbackUrl: fallback?.url || '',
    x0Url: linkFor(links, 'x0'),
    uploadWarnings: warnings,
    links,
    providerResults: item?.providers || null,
    requestedProviders,
    includeX0: bundlePolicy.includeX0 === true,
    fallback: bundlePolicy.fallback || 'x0',
    expectedLinkCount,
    complete: expectedLinkCount > 0 && links.length >= expectedLinkCount,
    partial: links.length > 0 && links.length < expectedLinkCount,
  };
}

export function normalizeBundleResult(bundle, entries) {
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  const itemByPhotoId = new Map(items.map((item) => [String(item.photoId), item]));
  const results = new Map();
  const bundlePolicy = {
    providers: Array.isArray(bundle?.selectedProviders) ? bundle.selectedProviders : PRIMARY_PROVIDERS,
    includeX0: bundle?.includeX0 === true,
    fallback: bundle?.fallback || 'x0',
  };

  entries.forEach((entry, index) => {
    const item = itemByPhotoId.get(String(entry.photoId));
    if (!item) {
      results.set(entry.photoId, {
        ...normalizeProviderResult(null, bundle?.ninjaboxGalleryUrl, bundlePolicy),
        technicalError: 'Worker did not return an item for this photoId',
      });
      return;
    }

    const orderMismatch = Number(item.index) !== index || item.fileName !== entry.file.name;
    const normalized = normalizeProviderResult(item, bundle?.ninjaboxGalleryUrl, bundlePolicy);
    if (orderMismatch) {
      normalized.uploadWarnings.push('Ссылки сопоставлены по photoId; порядок ответа отличался.');
    }
    results.set(entry.photoId, {
      ...normalized,
      technicalError: orderMismatch
        ? `Bundle order mismatch: expected ${index}/${entry.file.name}, received ${item.index}/${item.fileName}`
        : '',
    });
  });

  return results;
}
