const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>]*)?/i;

const withTimeout = async (operation, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Таймаут запроса');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const findImageUrl = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const match = value.match(IMAGE_URL_RE);
    return match ? match[0] : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageUrl(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === 'object') {
    const priorityKeys = ['url', 'display_url', 'image', 'medium', 'thumb', 'filename', 'path'];

    for (const key of priorityKeys) {
      const found = findImageUrl(value[key]);
      if (found) return found;
    }

    for (const item of Object.values(value)) {
      const found = findImageUrl(item);
      if (found) return found;
    }
  }

  return null;
};

const readResponse = async (response) => {
  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { text, json };
};

const buildResult = ({ provider, strategy, response, body }) => {
  const directUrl = findImageUrl(body.json) || findImageUrl(body.text);

  return {
    provider,
    strategy,
    ok: response.ok && Boolean(directUrl),
    status: response.status,
    statusText: response.statusText,
    directUrl,
    responsePreview: body.text.slice(0, 1200),
  };
};

export async function testUmbPhotosUpload(file, timeoutMs = 30000) {
  const strategies = [
    {
      name: 'Chevereto API JSON: source=file, format=json',
      url: 'https://umbphotos.ag/api/1/upload',
      form: () => {
        const formData = new FormData();
        formData.append('source', file, file.name);
        formData.append('format', 'json');
        return formData;
      },
    },
    {
      name: 'Chevereto API TXT: source=file, format=txt',
      url: 'https://umbphotos.ag/api/1/upload',
      form: () => {
        const formData = new FormData();
        formData.append('source', file, file.name);
        formData.append('format', 'txt');
        return formData;
      },
    },
  ];

  const results = [];

  for (const strategy of strategies) {
    try {
      const response = await withTimeout(
        (signal) => fetch(strategy.url, {
          method: 'POST',
          body: strategy.form(),
          signal,
        }),
        timeoutMs,
      );
      const body = await readResponse(response);
      const result = buildResult({
        provider: 'UMBPhotos',
        strategy: strategy.name,
        response,
        body,
      });
      results.push(result);

      if (result.ok) {
        return { ok: true, directUrl: result.directUrl, results };
      }
    } catch (error) {
      results.push({
        provider: 'UMBPhotos',
        strategy: strategy.name,
        ok: false,
        status: null,
        statusText: '',
        directUrl: null,
        responsePreview: error instanceof Error ? error.message : 'Неизвестная ошибка',
      });
    }
  }

  return { ok: false, directUrl: null, results };
}
