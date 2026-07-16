const GENERIC_BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const JSON_ACCEPT = 'application/json,text/plain,*/*';
const TEXT_ACCEPT = 'text/plain,application/json;q=0.9,*/*;q=0.8';

const IMAGE_EXTENSION_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const FORBIDDEN_OUTBOUND_HEADER_NAMES = [
  'authorization',
  'cookie',
  'cf-access-client-id',
  'cf-access-client-secret',
  'cf-authorization',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'true-client-ip',
  'forwarded',
];

const baseBrowserHeaders = () => ({
  'User-Agent': GENERIC_BROWSER_USER_AGENT,
  'Accept-Language': 'en-US,en;q=0.9',
  DNT: '1',
});

export function buildProviderHeaders(provider, mode = 'generic_browser') {
  const normalizedProvider = String(provider || '').toLowerCase();
  const normalizedMode = String(mode || 'generic_browser').toLowerCase();
  const headers = baseBrowserHeaders();

  if (normalizedMode === 'api' && normalizedProvider === 'x0') {
    headers.Accept = TEXT_ACCEPT;
  } else if (normalizedMode === 'api') {
    headers.Accept = JSON_ACCEPT;
  } else {
    headers.Accept = HTML_ACCEPT;
  }

  if (normalizedProvider === 'ninjabox' && normalizedMode === 'html_upload') {
    headers.Referer = 'https://ninjabox.org/';
  }

  return headers;
}

const randomToken = () => {
  const bytes = new Uint8Array(6);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (bytes.some(Boolean)) {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0').slice(0, 12);
};

const extensionForFile = (file) => {
  const type = String(file?.type || '').toLowerCase();
  return IMAGE_EXTENSION_BY_TYPE[type] || 'jpg';
};

export function providerUploadFileName(file, token = randomToken()) {
  return `image-${token}.${extensionForFile(file)}`;
}

export function toProviderUploadFile(file, token) {
  const outboundName = providerUploadFileName(file, token);
  return new File([file], outboundName, {
    type: file?.type || 'application/octet-stream',
    lastModified: Number(file?.lastModified) || Date.now(),
  });
}

export function formDataPrivacyFields(formData) {
  return [...formData.entries()].map(([name, value]) => {
    if (value instanceof File) {
      return {
        name,
        kind: 'file',
        filename: value.name,
        type: value.type || '',
        size: value.size,
      };
    }
    return {
      name,
      kind: 'field',
      valueType: typeof value,
    };
  });
}

export function buildProviderPrivacyAudit(provider, mode, headers, formFields = []) {
  const headerNames = Object.keys(headers || {});
  const forbiddenHeaderNames = headerNames.filter((name) => (
    FORBIDDEN_OUTBOUND_HEADER_NAMES.includes(String(name).toLowerCase())
  ));
  return {
    provider,
    mode,
    headers: Object.fromEntries(Object.entries(headers || {}).map(([name, value]) => [name, String(value)])),
    forbiddenHeaderNames,
    formFields: formFields.map((field) => ({
      name: field.name,
      kind: field.kind,
      filename: field.filename || null,
      type: field.type || null,
      size: Number.isFinite(field.size) ? field.size : null,
      valueType: field.valueType || null,
    })),
  };
}

export function assertProviderHeadersPrivate(headers) {
  const audit = buildProviderPrivacyAudit('provider', 'audit', headers);
  return audit.forbiddenHeaderNames.length === 0
    && !Object.values(headers || {}).some((value) => /GPS-Checker-Map-Photo/i.test(String(value)));
}
