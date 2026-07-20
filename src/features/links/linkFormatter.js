const DEFAULT_ORDER = ['ninjabox', 'freeimage', 'x0'];

export function photoLinksInRequestedOrder(photo) {
  const result = photo?.uploadResult;
  if (!result || !Array.isArray(result.links)) return [];
  const order = Array.isArray(result.providerOrder) && result.providerOrder.length > 0
    ? result.providerOrder
    : Array.isArray(result.requestedProviders) && result.requestedProviders.length > 0
      ? [...result.requestedProviders, 'x0']
      : DEFAULT_ORDER;
  const priority = new Map(order.map((provider, index) => [provider, index]));
  return [...result.links]
    .filter((link) => String(link?.url || '').trim())
    .sort((left, right) => (
      (priority.get(left.provider) ?? order.length) - (priority.get(right.provider) ?? order.length)
    ))
    .map((link) => String(link.url).trim());
}

export function formatAllLinks(photos) {
  return (photos || [])
    .map((photo) => photoLinksInRequestedOrder(photo).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}
