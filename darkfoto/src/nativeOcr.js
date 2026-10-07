import { Capacitor, registerPlugin } from '@capacitor/core';
import { parseFixedOverlayCoordinates, parseFixedOverlayIndex } from './core/features/gps/fixedOverlayOcr.js';
import { parseGpsFromOcrText } from './core/utils/ocrGpsReader.js';
import { parseAccuracy } from './core/captureTime.js';

const folder = registerPlugin('DarkFotoFolder');
export const NATIVE_PASS_TIMEOUT_MS = 5500;
export const FALLBACK_TIMEOUT_MS = 4000;

const withDeadline = (promise, ms, label) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
  })]).finally(() => clearTimeout(timer));
};

// Only a lower stamp line can supply an index. Coordinates, dates and time are excluded.
export function parseNativeStamp(pass) {
  const generic = pass?.profile === 'gray' ? parseGpsFromOcrText(pass?.text) : null;
  const coordinates = parseFixedOverlayCoordinates(pass?.text) || (generic?.ok ? generic : null);
  const indexLines = (pass?.lines || []).filter((line) => Number(line.topRatio) >= 0.44);
  const indexes = indexLines.flatMap((line) => {
    const value = String(line.text || '').trim();
    if (/[./]\d{1,2}[./]\d{2,4}|\d{1,2}:\d{2}/.test(value)) return [];
    if (pass?.profile !== 'gray' && /^(?:[#№]\s*)?\d{4,5}$/.test(value)
      && !/^(?:19|20)\d\d$/.test(value)) return [parseFixedOverlayIndex(value)];
    if (/(?:индекс|index|idx|н[оo]мер|n[o0])\D{0,8}\d{4,5}\s*$/i.test(value)) return [parseFixedOverlayIndex(value)];
    if (pass?.profile === 'black' && !/[.,]\d{2,}|\d{1,2}:\d{2}/.test(value)
      && /\d{4,5}\s*$/.test(value) && !/(?:19|20)\d\d\s*$/.test(value)) {
      return [parseFixedOverlayIndex(value)];
    }
    return [];
  }).filter(Boolean);
  const index = new Set(indexes).size === 1 ? indexes[0] : null;
  return {
    accuracyMeters: parseAccuracy(pass?.text),
    ok: Boolean(coordinates),
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    indexFromOcr: index,
    indexStatus: index ? 'found' : 'missing',
    confidence: coordinates ? 0.97 : 0,
    ocrStatus: coordinates ? 'confident' : 'missing',
    coordinateQuality: coordinates ? 'confident' : 'missing',
    warnings: [!coordinates && 'coordinates_not_found', !index && 'index_not_found'].filter(Boolean),
    ocrEngine: 'native_mlkit',
    nativeElapsedMs: Number(pass?.elapsedMs) || 0,
  };
}

export const mergeNativePasses = (first, second) => {
  if (!second) return first;
  const coordinates = first.ok ? first : second;
  const index = first.indexStatus === 'found' ? first : second;
  const conflict = first.indexStatus === 'found' && second.indexStatus === 'found'
    && first.indexFromOcr !== second.indexFromOcr;
  return {
    ...coordinates,
    indexFromOcr: index.indexFromOcr,
    indexStatus: conflict ? 'uncertain' : index.indexStatus,
    warnings: [!coordinates.ok && 'coordinates_not_found', conflict ? 'index_conflict'
      : index.indexStatus !== 'found' && 'index_not_found'].filter(Boolean),
    nativeElapsedMs: first.nativeElapsedMs + second.nativeElapsedMs,
  };
};

async function boundedTesseract(roi, timeoutMs = FALLBACK_TIMEOUT_MS) {
  if (!roi) throw new Error('fallback_roi_missing');
  let worker;
  let expired = false;
  const operation = (async () => {
    const { createWorker } = await import('tesseract.js');
    const assets = new URL('ocr/', document.baseURI).href;
    const pending = createWorker('eng', 1, {
      workerPath: `${assets}worker.min.js`, corePath: assets,
      langPath: assets.replace(/\/$/, ''), workerBlobURL: false,
      gzip: Capacitor.getPlatform() !== 'android',
    });
    worker = await pending;
    if (expired) { await worker.terminate(); throw new Error('fallback_timeout'); }
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const image = new Image();
    image.src = roi;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const result = await worker.recognize(canvas);
    return result.data.text || '';
  })();
  try { return await withDeadline(operation, timeoutMs, 'fallback'); }
  finally {
    expired = true;
    if (worker) worker.terminate().catch(() => {});
    else operation.catch(() => {});
  }
}

export async function recognizeAndroidStamp(item, options = {}) {
  const started = performance.now();
  let first;
  let second;
  let nativeError;
  const diagnostics = () => options.debug ? { debugPasses: [first, second].filter(Boolean).map((pass) => ({
    profile: pass.profile, text: pass.text, lines: pass.lines, ocrError: pass.ocrError,
    elapsedMs: pass.elapsedMs,
  })) } : {};
  try {
    first = await withDeadline(folder.recognizePhoto({ id: item.id }), NATIVE_PASS_TIMEOUT_MS, 'native');
    let parsed = parseNativeStamp(first);
    if (!parsed.ok || parsed.indexStatus !== 'found') {
      try {
        second = await withDeadline(folder.recognizePhoto({ id: item.id, alternate: true }), 2500, 'native_alternate');
        parsed = mergeNativePasses(parsed, parseNativeStamp(second));
      } catch (error) { nativeError = error; }
    }
    if (parsed.ok && parsed.indexStatus === 'found') return { ...parsed, ...diagnostics(),
      recognitionMs: Math.round(performance.now() - started) };
    // Fallback receives only the prepared native crop and a four-second product deadline.
    try {
      const text = await (options.fallback || boundedTesseract)(first.roi, FALLBACK_TIMEOUT_MS);
      parsed = mergeNativePasses(parsed, parseNativeStamp({ text, profile: first.profile,
        lines: text.split(/\n/).map((line, index, all) => ({
        text: line, topRatio: index / Math.max(1, all.length),
      })) }));
    } catch (error) { nativeError = error; }
    return { ...parsed, ...diagnostics(), ocrEngine: 'native_mlkit+tesseract_fallback',
      recognitionMs: Math.round(performance.now() - started),
      warnings: [...parsed.warnings, ...(nativeError ? [String(nativeError.message || nativeError)] : [])] };
  } catch (error) {
    return { ok: false, indexStatus: 'missing', indexFromOcr: null, ocrStatus: 'error',
      warnings: [`native_ocr_error: ${error.message || error}`], ocrEngine: 'native_mlkit',
      recognitionMs: Math.round(performance.now() - started) };
  }
}
