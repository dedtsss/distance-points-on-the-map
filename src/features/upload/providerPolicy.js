export const PRIMARY_PROVIDER = 'ninjabox';
export const FALLBACK_PROVIDERS = Object.freeze(['freeimage', 'x0']);
export const PROVIDER_CHAIN = Object.freeze([PRIMARY_PROVIDER, ...FALLBACK_PROVIDERS]);

export const DEFAULT_PROVIDER_SETTINGS = Object.freeze({
  ninjabox: true,
  fallbackFreeimage: true,
  fallbackX0: true,
});

const providerLabel = (provider) => ({
  ninjabox: 'NinjaBox',
  freeimage: 'Freeimage',
  x0: 'x0.at',
}[provider] || provider);

export function normalizeProviderSettings(settings = {}) {
  const fallbackFreeimage = settings.fallbackFreeimage !== undefined
    ? settings.fallbackFreeimage !== false
    : settings.freeimage !== false;
  return {
    ninjabox: settings.ninjabox !== false,
    fallbackFreeimage,
    fallbackX0: settings.fallbackX0 !== false,
  };
}

export function validateProviderSettings(settings) {
  const normalized = normalizeProviderSettings(settings);
  return {
    valid: normalized.ninjabox,
    selectedProviders: normalized.ninjabox ? [PRIMARY_PROVIDER] : [],
    providerOrder: normalized.ninjabox
      ? [
        PRIMARY_PROVIDER,
        ...(normalized.fallbackFreeimage ? ['freeimage'] : []),
        ...(normalized.fallbackX0 ? ['x0'] : []),
      ]
      : [],
    settings: normalized,
    error: normalized.ninjabox ? '' : 'NinjaBox должен оставаться основным сервисом загрузки.',
  };
}

export function providerRequestPolicy(settings) {
  const validation = validateProviderSettings(settings);
  return {
    ...validation,
    mode: 'chain',
    providers: validation.providerOrder.join(','),
    providerOrder: validation.providerOrder,
  };
}

const linkFor = (links, provider) => links.find((link) => link.provider === provider)?.url || '';

export function normalizeProviderResult(item, galleryUrl = '', bundlePolicy = {}) {
  const links = Array.isArray(item?.links) ? item.links : [];
  const providerOrder = Array.isArray(item?.providerOrder)
    ? item.providerOrder
    : Array.isArray(bundlePolicy.providerOrder)
      ? bundlePolicy.providerOrder
      : PROVIDER_CHAIN;
  const attempts = Array.isArray(item?.attempts) ? item.attempts : [];
  const selectedProvider = item?.selectedProvider || links[0]?.provider || '';
  const warnings = attempts
    .filter((attempt) => attempt?.ok === false)
    .map((attempt) => `${providerLabel(attempt.provider)} не загрузился${attempt.error ? `: ${attempt.error}` : ''}.`);

  if (selectedProvider && selectedProvider !== providerOrder[0]) {
    warnings.push(`Использован резервный хостинг ${providerLabel(selectedProvider)}.`);
  }

  return {
    freeimageUrl: linkFor(links, 'freeimage'),
    ninjaboxUrl: linkFor(links, 'ninjabox'),
    ninjaboxGalleryUrl: selectedProvider === 'ninjabox' ? galleryUrl || item?.galleryUrl || '' : '',
    fallbackUrl: selectedProvider && selectedProvider !== PRIMARY_PROVIDER ? links[0]?.url || '' : '',
    x0Url: linkFor(links, 'x0'),
    uploadWarnings: warnings,
    links,
    providerResults: item?.providers || null,
    attempts,
    providerOrder,
    selectedProvider,
    expectedLinkCount: 1,
    complete: links.length === 1,
    partial: false,
  };
}

export function normalizeBundleResult(bundle, entries) {
  const items = Array.isArray(bundle?.items) ? bundle.items : [];
  const itemByPhotoId = new Map(items.map((item) => [String(item.photoId), item]));
  const results = new Map();
  const bundlePolicy = {
    providerOrder: Array.isArray(bundle?.providerOrder) ? bundle.providerOrder : PROVIDER_CHAIN,
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
