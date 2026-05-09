const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>]*)?/i;
const ANY_URL_RE = /https?:\/\/[^\s"'<>]+/i;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (payload, status = 200) => new Response(JSON.stringify(payload, null, 2), {
  status,
  headers: {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
  },
});

const findUrl = (value, imageOnly = true) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const match = value.match(imageOnly ? IMAGE_URL_RE : ANY_URL_RE);
    return match ? match[0] : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item, imageOnly);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = findUrl(item, imageOnly);
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

const postForm = async ({ url, formData, headers = {}, imageOnly = true }) => {
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GPS-Checker-Proxy/0.1)',
      ...headers,
    },
  });

  const body = await readBody(response);
  const directUrl = findUrl(body.data, imageOnly) || findUrl(body.text, imageOnly);

  return {
    ok: response.ok && Boolean(directUrl),
    status: response.status,
    statusText: response.statusText,
    directUrl,
    responsePreview: body.text.slice(0, 1600),
  };
};

const uploadUmbPhotos = async (file) => {
  const uploadFile = makeUploadFile(file, file.name);
  const attempts = [];

  const apiJson = new FormData();
  apiJson.append('source', uploadFile, uploadFile.name);
  apiJson.append('format', 'json');
  attempts.push({
    name: 'UMBPhotos Chevereto API JSON',
    result: await postForm({
      url: 'https://umbphotos.ag/api/1/upload',
      formData: apiJson,
      imageOnly: true,
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
    }).catch((error) => ({ ok: false, status: null, statusText: '', directUrl: null, responsePreview: String(error?.message || error) })),
  });

  if (attempts.at(-1).result.ok) return { directUrl: attempts.at(-1).result.directUrl, attempts };

  throw new Error(`UMBPhotos upload failed. Attempts: ${JSON.stringify(attempts)}`);
};

const uploadNinjaBox = async (file) => {
  const uploadFile = makeUploadFile(file, file.name);
  const attempts = [];
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
    }).catch((error) => ({ ok: false, status: null, statusText: '', directUrl: null, responsePreview: String(error?.message || error) }));

    attempts.push({ name: strategy.name, result });

    if (result.ok) {
      return { directUrl: result.directUrl, attempts };
    }
  }

  throw new Error(`NinjaBox upload failed. Attempts: ${JSON.stringify(attempts)}`);
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Use POST multipart/form-data with fields: target, file' }, 405);
    }

    try {
      const formData = await request.formData();
      const target = String(formData.get('target') || '').toLowerCase();
      const file = formData.get('file');

      if (!(file instanceof File)) {
        return json({ ok: false, error: 'No file field found' }, 400);
      }

      let result;

      if (target === 'umb' || target === 'umbphotos') {
        result = await uploadUmbPhotos(file);
      } else if (target === 'ninja' || target === 'ninjabox') {
        result = await uploadNinjaBox(file);
      } else {
        return json({ ok: false, error: 'Unknown target. Use umbphotos or ninjabox.' }, 400);
      }

      return json({ ok: true, target, url: result.directUrl, attempts: result.attempts });
    } catch (error) {
      return json({ ok: false, error: error?.message || 'Unknown proxy error' }, 502);
    }
  },
};
