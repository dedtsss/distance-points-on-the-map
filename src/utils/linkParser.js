const URL_RE = /https?:\/\/[^\s"'<>]+/gi;

const decodeHtml = (value) => String(value || '')
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#039;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

const isLikelyFileAsset = (url) => /\.(?:css|js|svg|ico|woff2?|ttf|map)(?:[?#].*)?$/i.test(url);

const normalizeUrl = (url) => {
  try {
    const parsed = new URL(decodeHtml(url));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
};

export function parseNinjaBoxLinks(input) {
  const text = decodeHtml(input || '');
  const rawLinks = [...text.matchAll(URL_RE)].map((match) => match[0]);
  const links = [];
  const seen = new Set();

  for (const rawLink of rawLinks) {
    const normalized = normalizeUrl(rawLink);
    if (!normalized || seen.has(normalized)) continue;

    let host = '';
    try {
      host = new URL(normalized).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }

    if (host !== 'ninjabox.org' && !host.endsWith('.ninjabox.org')) continue;
    if (isLikelyFileAsset(normalized)) continue;

    seen.add(normalized);
    links.push(normalized);
  }

  return links;
}

export function applyLinksByOrder(photos, links) {
  let index = 0;

  return photos.map((photo) => {
    if (index >= links.length) return photo;

    const nextLink = links[index];
    index += 1;

    return {
      ...photo,
      uploadedUrl: nextLink,
      uploadStatus: 'ссылка вставлена вручную',
      uploadError: '',
      hostingUsed: 'NinjaBox вручную',
    };
  });
}
