const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

const isValidUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const readJsonBody = async (response) => {
  const text = await response.text();

  try {
    return {
      data: JSON.parse(text),
      text,
    };
  } catch {
    return {
      data: null,
      text,
    };
  }
};

export async function uploadImgBB(file, env) {
  const apiKey = env.IMGBB_API_KEY;

  if (!apiKey) {
    const error = new Error('IMGBB_API_KEY is not configured in Cloudflare Worker secrets');
    error.status = 502;
    throw error;
  }

  const formData = new FormData();
  formData.append('key', apiKey);
  formData.append('image', file, file.name || 'upload.jpg');

  const response = await fetch(IMGBB_UPLOAD_URL, {
    method: 'POST',
    body: formData,
  });
  const body = await readJsonBody(response);
  const result = body.data || {};
  const image = result.data || {};
  const url = image.url || '';
  const displayUrl = image.display_url || '';

  if (!response.ok || !result.success || (!isValidUrl(url) && !isValidUrl(displayUrl))) {
    const errorText = result?.error?.message
      || response.statusText
      || body.text.slice(0, 240)
      || 'ImgBB upload failed';
    const error = new Error(errorText);
    error.status = response.status || 502;
    throw error;
  }

  return {
    ok: true,
    target: 'imgbb',
    url: isValidUrl(url) ? url : displayUrl,
    viewerUrl: image.url_viewer || '',
    displayUrl,
    deleteUrl: image.delete_url || '',
    raw: result,
  };
}
