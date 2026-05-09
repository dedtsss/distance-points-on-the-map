const IMAGE_URL_RE = /https?:\/\/[^\s"'<>]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>]*)?/i;
const URL_RE = /https?:\/\/[^\s"'<>]+/i;

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

const findUrl = (value, imageOnly = true) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const match = value.match(imageOnly ? IMAGE_URL_RE : URL_RE);
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
    const priorityKeys = ['url', 'directUrl', 'display_url', 'image', 'medium', 'thumb', 'filename', 'path', 'link'];

    for (const key of priorityKeys) {
      const found = findUrl(value[key], imageOnly);
      if (found) return found;
    }

    for (const item of Object.values(value)) {
      const found = findUrl(item, imageOnly);
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

const buildResult = ({ provider, strategy, response, body, imageOnly = true }) => {
  const directUrl = findUrl(body.json, imageOnly) || findUrl(body.text, imageOnly);

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

const runStrategies = async ({ provider, strategies, timeoutMs, imageOnly = true }) => {
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
        provider,
        strategy: strategy.name,
        response,
        body,
        imageOnly,
      });
      results.push(result);

      if (result.ok) {
        return { ok: true, directUrl: result.directUrl, results };
      }
    } catch (error) {
      results.push({
        provider,
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

  return runStrategies({ provider: 'UMBPhotos', strategies, timeoutMs, imageOnly: true });
}

export async function testNinjaBoxUpload(file, timeoutMs = 30000) {
  const strategies = [
    {
      name: 'NinjaBox root: files[]',
      url: 'https://ninjabox.org/',
      form: () => {
        const formData = new FormData();
        formData.append('files[]', file, file.name);
        formData.append('delete_after_days', '180');
        return formData;
      },
    },
    {
      name: 'NinjaBox root: file',
      url: 'https://ninjabox.org/',
      form: () => {
        const formData = new FormData();
        formData.append('file', file, file.name);
        formData.append('delete_after_days', '180');
        return formData;
      },
    },
    {
      name: 'NinjaBox /upload: files[]',
      url: 'https://ninjabox.org/upload',
      form: () => {
        const formData = new FormData();
        formData.append('files[]', file, file.name);
        formData.append('delete_after_days', '180');
        return formData;
      },
    },
    {
      name: 'NinjaBox /api/upload: file',
      url: 'https://ninjabox.org/api/upload',
      form: () => {
        const formData = new FormData();
        formData.append('file', file, file.name);
        formData.append('delete_after_days', '180');
        return formData;
      },
    },
  ];

  return runStrategies({ provider: 'NinjaBox', strategies, timeoutMs, imageOnly: false });
}
