import { uploadAllwebs } from './allwebs.js';

// GPS Checker upload proxy. Version marker: 2026-06-02-imgbb-target.
const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>]*)?/gi;
const ANY_URL_RE = /https?:\/\/[^\s"'<>]+/gi;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
};

const json = (payload, status = 200) => new Response(JSON.stringify(payload, null, 2), {
  status,
  headers: {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
  },
});

const decodeHtml = (value) => String(value || '')
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#039;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

const absoluteUrl = (base, value) => {
  try {
    return new URL(decodeHtml(value || ''), base).toString();
  } catch {
    return base;
  }
};

const summarizeAttempts = (attempts) => attempts.map((attempt) => ({
  name: attempt.name,
  status: attempt.result?.status ?? null,
  statusText: attempt.result?.statusText || '',
  directUrl: attempt.result?.directUrl || null,
  responsePreview: String(attempt.result?.responsePreview || '').slice(0, 600),
}));

const isAllowedUrl = (url, allowedHosts = []) => {
  if (!url) return false;
  if (allowedHosts.length === 0) return true;

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return allowedHosts.some((allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`));
  } catch {
    return false;
  }
};

const findUrlInString = (value, { imageOnly = true, allowedHosts = [] } = {}) => {
  const text = String(value || '');
  const regexp = imageOnly ? IMAGE_URL_RE : ANY_URL_RE;
  regexp.lastIndex = 0;

  for (const match of text.matchAll(regexp)) {
    const candidate = decodeHtml(match[0]);
    if (isAllowedUrl(candidate, allowedHosts)) {
      return candidate;
    }
  }

  return null;
};

const findUrl = (value, options = {}) => {
  if (!value) return null;

  if (typeof value === 'string') {
    return findUrlInString(value, options);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item, options);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = findUrl(item, options);
      if (found) return found;
    }
  }

  return null;
};

const readBody = async (response) => {
  const text = await response.text();
  let data = null;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  return { text, data };
};

const makeUploadFile = (file, filename) => new File([file], filename || file.name || 'upload.jpg', {
  type: file.type || 'image/jpeg',
});

const extractCookies = (response) => {
  const cookie = response.headers.get('set-cookie');
  if (!cookie) return '';
  return cookie
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
};

const extractUploadForm = (html, pageUrl) => {
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((match) => match[0]);
  const form = forms.find((item) => /type=["']?file/i.test(item)) || forms[0] || '';

  if (!form) {
    return null;
  }

  const actionMatch = form.match(/action=["']([^"']*)["']/i);
  const methodMatch = form.match(/method=["']([^"']*)["']/i);
  const fileNameMatch = form.match(/<input[^>]+type=["']?file["']?[^>]*>/i)?.[0]?.match(/name=["']([^"']+)["']/i);

  const hiddenInputs = [...form.matchAll(/<input[^>]+type=["']?hidden["']?[^>]*>/gi)].map((match) => {
    const input = match[0];
    const name = input.match(/name=["']([^"']+)["']/i)?.[1];
    const value = input.match(/value=["']([^"']*)["']/i)?.[1] || '';
    return name ? { name: decodeHtml(name), value: decodeHtml(value) } : null;
  }).filter(Boolean);

  return {
    action: absoluteUrl(pageUrl, actionMatch?.[1] || pageUrl),
    method: (methodMatch?.[1] || 'POST').toUpperCase(),
    fileField: decodeHtml(fileNameMatch?.[1] || 'source'),
    hiddenInputs,
  };
};

const postForm = async ({ url, formData, headers = {}, imageOnly = true, allowedHosts = [] }) => {
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: {
      ...COMMON_HEADERS,
      ...headers,
    },
  });

  const body = await readBody(response);
  const findOptions = { imageOnly, allowedHosts };
  const directUrl = findUrl(body.data, findOptions) || findUrl(body.text, findOptions);

  return {
    ok: response.ok && Boolean(directUrl),
    status: response.status,
    statusText: response.statusText,
    directUrl,
    responsePreview: body.text.slice(0, 1600),
  };
};

const uploadThroughParsedForm = async ({ pageUrl, file, imageOnly = true, name, allowedHosts = [] }) => {
  const pageResponse = await fetch(pageUrl, { headers: COMMON_HEADERS });
  const cookie = extractCookies(pageResponse);
  const html = await pageResponse.text();
  const uploadForm = extractUploadForm(html, pageUrl);

  if (!uploadForm) {
    return {
      ok: false,
      status: pageResponse.status,
      statusText: 'Upload form not found',
      directUrl: null,
      responsePreview: html.slice(0, 1200),
    };
  }

  const uploadFile = makeUploadFile(file, file.name);
  const formData = new FormData();

  for (const item of uploadForm.hiddenInputs) {
    formData.append(item.name, item.value);
  }

  formData.append(uploadForm.fileField, uploadFile, uploadFile.name);

  const result = await postForm({
    url: uploadForm.action,
    formData,
    headers: {
      Referer: pageUrl,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    imageOnly,
    allowedHosts,
  });

  return {
    ...result,
    responsePreview: `${name}: action=${uploadForm.action}; fileField=${uploadForm.fileField}; hidden=${uploadForm.hiddenInputs.map((i) => i.name).join(', ')}\n\n${result.responsePreview}`,
  };
};


const isValidHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const uploadImgBB = async (file, env) => {
  const apiKey = String(env?.IMGBB_API_KEY || '').trim();

  if (!apiKey) {
    return {
      ok: false,
      target: 'imgbb',
      error: 'IMGBB_API_KEY is not configured in Cloudflare Worker secrets',
      status: 400,
    };
  }

  const uploadFile = makeUploadFile(file, file.name);
  const formData = new FormData();
  formData.append('key', apiKey);
  formData.append('image', uploadFile, uploadFile.name);

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData,
  });
  const body = await readBody(response);
  const data = body.data;

  if (!response.ok || !data?.success) {
    return {
      ok: false,
      target: 'imgbb',
      error: data?.error?.message || `ImgBB upload failed with HTTP ${response.status}`,
      status: response.status || 400,
    };
  }

  const uploadedUrl = data?.data?.url || '';
  const displayUrl = data?.data?.display_url || '';

  if (!isValidHttpUrl(uploadedUrl) && !isValidHttpUrl(displayUrl)) {
    return {
      ok: false,
      target: 'imgbb',
      error: 'ImgBB upload response did not include a valid image URL',
      status: 400,
    };
  }

  return {
    ok: true,
    target: 'imgbb',
    url: uploadedUrl || displayUrl,
    viewerUrl: data?.data?.url_viewer || '',
    displayUrl,
    deleteUrl: data?.data?.delete_url || '',
    raw: data,
  };
};

const uploadUmbPhotos = async (file) => {
  const uploadFile = makeUploadFile(file, file.name);
  const attempts = [];
  const allowedHosts = ['umbphotos.ag'];

  attempts.push({
    name: 'UMBPhotos parsed homepage form',
    result: await uploadThroughParsedForm({
      pageUrl: 'https://umbphotos.ag/',
      file: uploadFile,
      imageOnly: true,
      allowedHosts,
      name: 'UMBPhotos parsed homepage form',
    }).catch((error) => ({ ok: false, status: null, statusText: '', directUrl: null, responsePreview: String(error?.message || error) })),
  });

  if (attempts.at(-1).result.ok) return { directUrl: attempts.at(-1).result.directUrl, attempts };

  const apiJson = new FormData();
  apiJson.append('source', uploadFile, uploadFile.name);
  apiJson.append('format', 'json');
  attempts.push({
    name: 'UMBPhotos Chevereto API JSON',
    result: await postForm({
      url: 'https://umbphotos.ag/api/1/upload',
      formData: apiJson,
      imageOnly: true,
      allowedHosts,
    }).catch((error) => ({ ok: false, status: null, statusText: '', directUrl: null, responsePreview: String(error?.message || error) })),
  });

  if (attempts.at(-1).result.ok) return { directUrl: attempts.at(-1).result.directUrl, attempts };

  const apiTxt = new FormData();
  apiTxt.append('source', uploadFile, uploadFile.name);
  apiTxt.append('format', 'txt');
  attempts.push({
    name: 'UMBPhotos Chevereto API TXT',
    result: await postForm({
      url: 'https://umbphotos.ag/api/1/upload',
      formData: apiTxt,
      imageOnly: true,
      allowedHosts,
    }).catch((error) => ({ ok: false, status: null, statusText: '', directUrl: null, responsePreview: String(error?.message || error) })),
  });

  if (attempts.at(-1).result.ok) return { directUrl: attempts.at(-1).result.directUrl, attempts };

  const summary = summarizeAttempts(attempts);
  throw new Error(`UMBPhotos upload failed: ${JSON.stringify(summary)}`);
};

const uploadNinjaBox = async (file) => {
  const uploadFile = makeUploadFile(file, file.name);
  const attempts = [];
  const allowedHosts = ['ninjabox.org'];

  attempts.push({
    name: 'NinjaBox parsed homepage form',
    result: await uploadThroughParsedForm({
      pageUrl: 'https://ninjabox.org/',
      file: uploadFile,
      imageOnly: false,
      allowedHosts,
      name: 'NinjaBox parsed homepage form',
    }).catch((error) => ({ ok: false, status: null, statusText: '', directUrl: null, responsePreview: String(error?.message || error) })),
  });

  if (attempts.at(-1).result.ok) return { directUrl: attempts.at(-1).result.directUrl, attempts };

  const strategies = [
    { name: 'NinjaBox root files[]', url: 'https://ninjabox.org/', field: 'files[]' },
    { name: 'NinjaBox root file', url: 'https://ninjabox.org/', field: 'file' },
    { name: 'NinjaBox /upload files[]', url: 'https://ninjabox.org/upload', field: 'files[]' },
    { name: 'NinjaBox /api/upload file', url: 'https://ninjabox.org/api/upload', field: 'file' },
  ];

  for (const strategy of strategies) {
    const formData = new FormData();
    formData.append(strategy.field, uploadFile, uploadFile.name);
    formData.append('delete_after_days', '180');

    const result = await postForm({
      url: strategy.url,
      formData,
      imageOnly: false,
      allowedHosts,
    }).catch((error) => ({ ok: false, status: null, statusText: '', directUrl: null, responsePreview: String(error?.message || error) }));

    attempts.push({ name: strategy.name, result });

    if (result.ok) {
      return { directUrl: result.directUrl, attempts };
    }
  }

  const summary = summarizeAttempts(attempts);
  throw new Error(`NinjaBox upload failed: ${JSON.stringify(summary)}`);
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Use POST multipart/form-data with fields: target, file' }, 405);
    }

    let target = '';

    try {
      const formData = await request.formData();
      target = String(formData.get('target') || '').toLowerCase();
      const file = formData.get('file');

      if (!(file instanceof File)) {
        return json({ ok: false, error: 'No file field found' }, 400);
      }

      let result;

      if (target === 'imgbb') {
        result = await uploadImgBB(file, env);
        return json(result, result.ok ? 200 : result.status);
      }

      if (target === 'allwebs') {
        result = await uploadAllwebs(file, env);
      } else if (target === 'umb' || target === 'umbphotos') {
        result = await uploadUmbPhotos(file);
      } else if (target === 'ninja' || target === 'ninjabox') {
        result = await uploadNinjaBox(file);
      } else {
        return json({ ok: false, target, error: 'Unknown target. Use imgbb, allwebs, umbphotos or ninjabox.', status: 400 }, 400);
      }

      return json({ ok: true, target, url: result.directUrl, attempts: summarizeAttempts(result.attempts) });
    } catch (error) {
      return json({ ok: false, target, error: error?.message || 'Unknown proxy error', status: 502 }, 502);
    }
  },
};
