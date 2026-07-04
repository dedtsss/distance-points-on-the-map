import { normalizeProviderSettings } from '../upload/providerPolicy.js';

const directLink = (result, provider) => result?.links?.find((link) => link.provider === provider)?.url || '';

export function photoLinksInRequestedOrder(photo, providerSettings) {
  const result = photo?.uploadResult;
  if (!result) return [];
  const settings = normalizeProviderSettings(providerSettings || {
    freeimage: result.requestedProviders?.includes('freeimage'),
    ninjabox: result.requestedProviders?.includes('ninjabox'),
    includeX0: result.includeX0,
    fallbackX0: result.fallback !== 'none',
  });
  const fallback = result.links?.find((link) => link.provider === 'x0') || null;
  const replaces = fallback?.replaces || [];
  const urls = [];

  for (const provider of ['freeimage', 'ninjabox']) {
    if (!settings[provider]) continue;
    const url = directLink(result, provider) || (replaces.includes(provider) ? fallback?.url : '');
    if (url) urls.push(url);
  }

  if (settings.includeX0) {
    const x0Url = directLink(result, 'x0');
    if (x0Url) urls.push(x0Url);
  }

  return urls;
}

export function formatAllLinks(photos, providerSettings) {
  return (photos || [])
    .map((photo) => photoLinksInRequestedOrder(photo, providerSettings).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}
