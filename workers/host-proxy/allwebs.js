const ALLWEBS_UPLOAD_URL = 'https://allwebs.ru/api/1/upload';
const ALLWEBS_ALLOWED_HOSTS = ['allwebs.ru'];

const decodeHtml = (value) => String(value || '')
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#039;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

const isAllowedUrl = (url, allowedHosts = ALLWEBS_ALLOWED_HOSTS) => {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return allowedHosts.some((allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`));
  } catch {
    return false;
  }
};

const findUrl = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const decoded = decodeHtml(value);
    const urls = decoded.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    return urls.find((url) => isAllowedUrl(url)) || null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = findUrl(item);
      if (found) return found;
    }
  }

  return null;
};

export async function uploadAllwebs(file, env) {
  const apiKey = env.ALLWEBS_API_KEY;
  if (!apiKey) {
    throw new Error('ALLWEBS_API_KEY is not configured in Cloudflare Worker secrets');
  }

  const formData = new FormData();
  formData.append('source', file, file.name || 'upload.jpg');
  formData.append('format', 'json');

  const response = await fetch(ALLWEBS_UPLOAD_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json,text/plain,*/*',
    },
    body: formData,
  });

  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  const directUrl = findUrl(data) || findUrl(text);

  return {
    directUrl,
    attempts: [{
      name: 'Allwebs API upload',
      result: {
        ok: response.ok && Boolean(directUrl),
        status: response.status,
        statusText: response.statusText,
        directUrl,
        responsePreview: text.slice(0, 1600),
      },
    }],
  };
}
