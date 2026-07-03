import { uploadFreeimage } from './freeimage.js';
import { uploadNinjabox } from './ninjabox.js';
import { uploadX0 } from './x0.js';

const MAX_FILES = 20;
const PROVIDER_CONCURRENCY = 2;

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

const errorMessage = (error) => (error instanceof Error ? error.message : String(error || 'Unknown upload error'));

const failedProvider = (provider, error) => ({
  provider,
  ok: false,
  url: null,
  directUrl: null,
  error: errorMessage(error),
});

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const uploadIndividually = (files, provider, upload) => mapWithConcurrency(
  files,
  PROVIDER_CONCURRENCY,
  async (file) => {
    try {
      return await upload(file);
    } catch (error) {
      return failedProvider(provider, error);
    }
  },
);

export function composeBundleItem({ index, photoId, fileName, freeimage, ninjabox, fallback = null }) {
  const links = [];
  if (freeimage.ok) {
    links.push({ provider: 'freeimage', role: 'primary', url: freeimage.url, directUrl: freeimage.directUrl });
  }
  if (ninjabox.ok) {
    links.push({ provider: 'ninjabox', role: 'secondary', url: ninjabox.url, directUrl: ninjabox.directUrl });
  }
  if (fallback?.ok) {
    links.push({
      provider: 'x0',
      role: 'fallback',
      url: fallback.url,
      directUrl: fallback.directUrl,
      replaces: [
        ...(!freeimage.ok ? ['freeimage'] : []),
        ...(!ninjabox.ok ? ['ninjabox'] : []),
      ],
    });
  }
  return {
    index,
    photoId,
    fileName,
    ok: links.length >= 2,
    partial: links.length === 1,
    links,
    providers: { freeimage, ninjabox, x0: fallback },
  };
}

async function uploadBundle(files, photoIds) {
  const ninjaPromise = uploadNinjabox(files)
    .catch((error) => ({ ok: false, provider: 'ninjabox', galleryUrl: null, items: [], error: errorMessage(error) }));
  const freeimagePromise = uploadIndividually(files, 'freeimage', uploadFreeimage);
  const [ninjabox, freeimage] = await Promise.all([ninjaPromise, freeimagePromise]);

  const primaryResults = files.map((file, index) => ({
    file,
    index,
    photoId: photoIds[index] || String(index),
    freeimage: freeimage[index],
    ninjabox: ninjabox.ok && ninjabox.items[index]
      ? { provider: 'ninjabox', ok: true, ...ninjabox.items[index], error: null }
      : failedProvider('ninjabox', ninjabox.error || `Ninjabox returned no link for file ${index + 1}`),
  }));

  const fallbackIndexes = primaryResults
    .filter((item) => !item.freeimage.ok || !item.ninjabox.ok)
    .map((item) => item.index);
  const fallbackFiles = fallbackIndexes.map((index) => files[index]);
  const fallbackUploads = await uploadIndividually(fallbackFiles, 'x0', uploadX0);
  const fallbackByIndex = new Map(fallbackIndexes.map((index, offset) => [index, fallbackUploads[offset]]));

  const items = primaryResults.map((item) => composeBundleItem({
    index: item.index,
    photoId: item.photoId,
    fileName: item.file.name,
    freeimage: item.freeimage,
    ninjabox: item.ninjabox,
    fallback: fallbackByIndex.get(item.index) || null,
  }));

  return {
    ok: items.every((item) => item.ok),
    target: 'bundle',
    providerOrder: ['freeimage', 'ninjabox', 'x0'],
    ninjaboxGalleryUrl: ninjabox.galleryUrl || null,
    completeCount: items.filter((item) => item.ok).length,
    partialCount: items.filter((item) => item.partial).length,
    failedCount: items.filter((item) => item.links.length === 0).length,
    items,
  };
}

const getFiles = (formData) => {
  const batchFiles = formData.getAll('files').filter((item) => item instanceof File);
  const singleFile = formData.get('file');
  if (batchFiles.length > 0) return batchFiles;
  return singleFile instanceof File ? [singleFile] : [];
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Use POST multipart/form-data.' }, 405);
    }

    try {
      const formData = await request.formData();
      const target = String(formData.get('target') || 'bundle').toLowerCase();
      const files = getFiles(formData);

      if (files.length === 0) return json({ ok: false, error: 'No upload files found.' }, 400);
      if (files.length > MAX_FILES) return json({ ok: false, error: `Maximum ${MAX_FILES} files per request.` }, 400);

      if (target === 'bundle') {
        const photoIds = formData.getAll('photoId').map(String);
        return json(await uploadBundle(files, photoIds));
      }
      if (target === 'freeimage') {
        return json(await uploadFreeimage(files[0]));
      }
      if (target === 'ninjabox') {
        return json(await uploadNinjabox(files));
      }
      if (target === 'x0') {
        return json(await uploadX0(files[0]));
      }

      return json({ ok: false, error: 'Unknown target. Use bundle, freeimage, ninjabox, or x0.' }, 400);
    } catch (error) {
      return json({ ok: false, error: errorMessage(error) }, 502);
    }
  },
};
