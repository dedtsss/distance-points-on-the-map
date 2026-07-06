const DEFAULT_CROP_OPTIONS = { xRatio: 0.48, yRatio: 0.68, widthRatio: 0.52, heightRatio: 0.32 };
const DEFAULT_PREPROCESS_OPTIONS = {
  method: 'threshold',
  upscale: 2,
  threshold: 150,
  contrast: 1.5,
  maxWidth: 2200,
  maxHeight: 1800,
  maxPixels: 3_200_000,
};

const DEFAULT_MIN_PARSER_CONFIDENCE = 0.55;
const OVERLAY_OCR_WHITELIST = '0123456789., NSEWnsew+-±m';

const OCR_ROIS = [
  { name: 'bottom_35', crop: { xRatio: 0, yRatio: 0.65, widthRatio: 1, heightRatio: 0.35 } },
  { name: 'bottom_right_45', crop: { xRatio: 0.55, yRatio: 0.55, widthRatio: 0.45, heightRatio: 0.45 } },
  { name: 'bottom_center_60', crop: { xRatio: 0.2, yRatio: 0.4, widthRatio: 0.6, heightRatio: 0.6 } },
  { name: 'full_image', crop: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 }, fallback: true },
];

const OCR_PREPROCESS_VARIANTS = [
  { name: 'original_resized', preprocess: { method: 'original', upscale: 2 } },
  { name: 'grayscale_contrast', preprocess: { method: 'grayscale', upscale: 2, contrast: 1.8 } },
  { name: 'threshold', preprocess: { method: 'threshold', upscale: 2, threshold: 155, contrast: 1.55 } },
  { name: 'inverted_threshold', preprocess: { method: 'inverted_threshold', upscale: 2, threshold: 155, contrast: 1.55 } },
];

const attemptVariant = (roiName, preprocessName) => {
  const roi = OCR_ROIS.find((item) => item.name === roiName);
  const variant = OCR_PREPROCESS_VARIANTS.find((item) => item.name === preprocessName);
  return {
    name: `${roi.name}:${variant.name}`,
    cropName: roi.name,
    preprocessName: variant.name,
    fallback: roi.fallback === true,
    crop: roi.crop,
    preprocess: variant.preprocess,
  };
};

// The sequence covers every requested ROI and preprocessing family without a
// 4×4 Cartesian explosion. Each ROI gets a second visual treatment only when
// earlier candidates did not produce a strong result.
export const OCR_ATTEMPT_VARIANTS = [
  {
    name: 'bottom_right_black_overlay:padded_line_grayscale',
    cropName: 'bottom_right_black_overlay',
    preprocessName: 'grayscale_contrast_4x',
    overlayDetection: true,
    overlayCrop: { heightRatio: 0.4, paddingPx: 6 },
    preprocess: { method: 'grayscale', upscale: 4, contrast: 2.1 },
    pageSegMode: '7',
    whitelist: OVERLAY_OCR_WHITELIST,
  },
  {
    name: 'bottom_right_black_overlay:padded_line_inverted',
    cropName: 'bottom_right_black_overlay',
    preprocessName: 'inverted_grayscale_4x',
    overlayDetection: true,
    overlayCrop: { heightRatio: 0.4, paddingPx: 6 },
    preprocess: { method: 'inverted_grayscale', upscale: 4, contrast: 2.1 },
    pageSegMode: '7',
    whitelist: OVERLAY_OCR_WHITELIST,
  },
  {
    name: 'bottom_right_black_overlay:line_shifted_up',
    cropName: 'bottom_right_black_overlay',
    preprocessName: 'grayscale_contrast_4x',
    overlayDetection: true,
    overlayCrop: { heightRatio: 0.4, paddingPx: 6, offsetYPx: -6 },
    preprocess: { method: 'grayscale', upscale: 4, contrast: 2.1 },
    pageSegMode: '7',
    whitelist: OVERLAY_OCR_WHITELIST,
  },
  {
    name: 'bottom_right_black_overlay:line_shifted_down',
    cropName: 'bottom_right_black_overlay',
    preprocessName: 'inverted_grayscale_4x',
    overlayDetection: true,
    overlayCrop: { heightRatio: 0.4, paddingPx: 6, offsetYPx: 6 },
    preprocess: { method: 'inverted_grayscale', upscale: 4, contrast: 2.1 },
    pageSegMode: '7',
    whitelist: OVERLAY_OCR_WHITELIST,
  },
  ...[120, 150, 180].map((threshold) => ({
    name: `bottom_right_black_overlay:padded_line_threshold_${threshold}`,
    cropName: 'bottom_right_black_overlay',
    preprocessName: `threshold_${threshold}_4x`,
    overlayDetection: true,
    overlayCrop: { heightRatio: 0.4, paddingPx: 6 },
    preprocess: { method: 'threshold', upscale: 4, threshold, contrast: 1.9 },
    pageSegMode: '7',
    whitelist: OVERLAY_OCR_WHITELIST,
  })),
  {
    name: 'bottom_right_black_overlay:top_40_percent',
    cropName: 'bottom_right_black_overlay',
    preprocessName: 'grayscale_contrast_4x',
    overlayDetection: true,
    overlayCrop: { heightRatio: 0.4, paddingPx: 0 },
    preprocess: { method: 'grayscale', upscale: 4, contrast: 2.1 },
    pageSegMode: '7',
    whitelist: OVERLAY_OCR_WHITELIST,
  },
  {
    name: 'bottom_right_black_overlay:left_without_accuracy',
    cropName: 'bottom_right_black_overlay',
    preprocessName: 'grayscale_contrast_4x',
    overlayDetection: true,
    overlayCrop: { heightRatio: 0.4, widthRatio: 0.86, paddingPx: 6 },
    preprocess: { method: 'grayscale', upscale: 4, contrast: 2.1 },
    pageSegMode: '7',
    whitelist: OVERLAY_OCR_WHITELIST,
  },
  {
    name: 'bottom_right_overlay_line:static',
    cropName: 'bottom_right_overlay_line',
    preprocessName: 'inverted_grayscale_4x',
    crop: { xRatio: 0.42, yRatio: 0.745, widthRatio: 0.58, heightRatio: 0.13 },
    preprocess: { method: 'inverted_grayscale', upscale: 4, contrast: 2.1 },
    pageSegMode: '7',
    whitelist: OVERLAY_OCR_WHITELIST,
  },
  attemptVariant('bottom_35', 'original_resized'),
  attemptVariant('bottom_right_45', 'original_resized'),
  attemptVariant('bottom_center_60', 'original_resized'),
  attemptVariant('bottom_35', 'grayscale_contrast'),
  attemptVariant('bottom_right_45', 'threshold'),
  attemptVariant('bottom_center_60', 'inverted_threshold'),
  attemptVariant('bottom_35', 'inverted_threshold'),
  attemptVariant('full_image', 'grayscale_contrast'),
];

const OCR_CHAR_WHITELIST = '0123456789.,-+ NSEWnsew LATLON:°′″ /';
const DECIMAL_NUMBER_RE = /[-+]?\d{1,3}\.\d{3,10}/g;
const KARELIA_SHORT_DECIMAL_PAIR_RE = /((?:6[0-9]|70)\.\d{2,10})\D{0,30}((?:2[5-9]|3[0-9]|40)\.\d{2,10})/g;

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось загрузить изображение для OCR'));
    };
    image.src = url;
  });
}

export function cropImageRegion(image, options = {}) {
  const cropOptions = { ...DEFAULT_CROP_OPTIONS, ...options };
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Изображение для OCR имеет пустой размер');
  }

  const cropWidth = Math.max(1, Math.min(sourceWidth, Math.round(sourceWidth * cropOptions.widthRatio)));
  const cropHeight = Math.max(1, Math.min(sourceHeight, Math.round(sourceHeight * cropOptions.heightRatio)));
  const cropX = Math.max(0, Math.min(sourceWidth - cropWidth, Math.round(sourceWidth * cropOptions.xRatio)));
  const cropY = Math.max(0, Math.min(sourceHeight - cropHeight, Math.round(sourceHeight * cropOptions.yRatio)));

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D недоступен для OCR');
  }

  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  canvas.sourceBounds = { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
  return canvas;
}

export function cropBottomRight(image, options = {}) {
  const widthRatio = options.widthRatio ?? DEFAULT_CROP_OPTIONS.widthRatio;
  const heightRatio = options.heightRatio ?? DEFAULT_CROP_OPTIONS.heightRatio;
  return cropImageRegion(image, {
    ...options,
    xRatio: 1 - widthRatio - (options.rightPaddingRatio || 0),
    yRatio: 1 - heightRatio - (options.bottomPaddingRatio || 0),
    widthRatio,
    heightRatio,
  });
}

export function detectBottomRightBlackOverlay(image) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const search = {
    x: Math.round(sourceWidth * 0.38),
    y: Math.round(sourceHeight * 0.62),
    width: Math.round(sourceWidth * 0.62),
    height: Math.round(sourceHeight * 0.38),
  };
  const sample = document.createElement('canvas');
  sample.width = 248;
  sample.height = Math.max(80, Math.round(248 * search.height / search.width));
  const context = sample.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D недоступен для overlay detection');
  context.drawImage(image, search.x, search.y, search.width, search.height, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  const isDark = (x, y) => {
    const offset = ((y * sample.width) + x) * 4;
    return ((pixels[offset] * 0.299) + (pixels[offset + 1] * 0.587) + (pixels[offset + 2] * 0.114)) < 72;
  };
  const rowRatios = Array.from({ length: sample.height }, (_, y) => {
    let count = 0;
    for (let x = 0; x < sample.width; x += 1) if (isDark(x, y)) count += 1;
    return count / sample.width;
  });
  let bestStart = -1;
  let bestEnd = -1;
  let runStart = -1;
  for (let y = 0; y <= rowRatios.length; y += 1) {
    if (y < rowRatios.length && rowRatios[y] >= 0.28) {
      if (runStart < 0) runStart = y;
    } else if (runStart >= 0) {
      if (y - runStart > bestEnd - bestStart) [bestStart, bestEnd] = [runStart, y];
      runStart = -1;
    }
  }
  if (bestStart < 0 || bestEnd - bestStart < 5) return { found: false, reason: 'dark_rectangle_not_found' };

  let firstDarkColumn = sample.width;
  for (let x = 0; x < sample.width; x += 1) {
    let count = 0;
    for (let y = bestStart; y < bestEnd; y += 1) if (isDark(x, y)) count += 1;
    if (count / (bestEnd - bestStart) >= 0.45) { firstDarkColumn = x; break; }
  }
  if (firstDarkColumn === sample.width) return { found: false, reason: 'dark_rectangle_left_edge_not_found' };

  const scaleX = search.width / sample.width;
  const scaleY = search.height / sample.height;
  const x = Math.max(0, Math.round(search.x + (firstDarkColumn * scaleX) - (sourceWidth * 0.01)));
  const y = Math.max(0, Math.round(search.y + (bestStart * scaleY)));
  const width = sourceWidth - x;
  const detectedHeight = Math.round((bestEnd - bestStart) * scaleY);
  const height = Math.min(sourceHeight - y, Math.max(24, detectedHeight));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const outputContext = canvas.getContext('2d');
  if (!outputContext) throw new Error('Canvas 2D недоступен для overlay crop');
  outputContext.drawImage(image, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  canvas.sourceBounds = { x, y, width: canvas.width, height: canvas.height };
  return {
    found: true,
    canvas,
    bounds: { x, y, width: canvas.width, height: canvas.height },
    sampleDimensions: { width: sample.width, height: sample.height },
  };
}

export function cropDetectedOverlayLine(image, overlayDetection, options = {}) {
  if (!overlayDetection?.found || !overlayDetection.bounds) {
    throw new Error('Overlay ROI не найден');
  }
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const overlay = overlayDetection.bounds;
  const paddingPx = Math.max(0, Math.min(8, Math.round(Number(options.paddingPx) || 0)));
  const offsetYPx = Math.max(-12, Math.min(12, Math.round(Number(options.offsetYPx) || 0)));
  const widthRatio = Math.max(0.5, Math.min(1, Number(options.widthRatio) || 1));
  const heightRatio = Math.max(0.25, Math.min(0.6, Number(options.heightRatio) || 0.4));
  const x = Math.max(0, overlay.x - paddingPx);
  const y = Math.max(0, overlay.y + offsetYPx - paddingPx);
  const right = Math.min(sourceWidth, overlay.x + Math.round(overlay.width * widthRatio) + paddingPx);
  const bottom = Math.min(sourceHeight, overlay.y + offsetYPx + Math.round(overlay.height * heightRatio) + paddingPx);
  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D недоступен для overlay line crop');
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  canvas.sourceBounds = { x, y, width, height };
  return canvas;
}

export function preprocessForOcr(canvas, options = {}) {
  const preprocessOptions = { ...DEFAULT_PREPROCESS_OPTIONS, ...options };
  const requestedScale = Math.max(1, Math.min(4, Number(preprocessOptions.upscale) || 3));
  const maxWidth = Math.max(800, Number(preprocessOptions.maxWidth) || DEFAULT_PREPROCESS_OPTIONS.maxWidth);
  const maxHeight = Math.max(600, Number(preprocessOptions.maxHeight) || DEFAULT_PREPROCESS_OPTIONS.maxHeight);
  const maxPixels = Math.max(1_000_000, Number(preprocessOptions.maxPixels) || DEFAULT_PREPROCESS_OPTIONS.maxPixels);
  const pixelScale = Math.sqrt(maxPixels / Math.max(1, canvas.width * canvas.height));
  const scale = Math.max(0.25, Math.min(requestedScale, maxWidth / canvas.width, maxHeight / canvas.height, pixelScale));

  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(canvas.width * scale));
  output.height = Math.max(1, Math.round(canvas.height * scale));

  const context = output.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Canvas 2D недоступен для preprocessing OCR');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, 0, 0, output.width, output.height);

  if (preprocessOptions.method === 'original') return output;

  const imageData = context.getImageData(0, 0, output.width, output.height);
  const { data } = imageData;
  const threshold = Number(preprocessOptions.threshold) || DEFAULT_PREPROCESS_OPTIONS.threshold;
  const contrast = Number(preprocessOptions.contrast) || DEFAULT_PREPROCESS_OPTIONS.contrast;

  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
    const contrasted = Math.max(0, Math.min(255, ((gray - 128) * contrast) + 128));
    let value = contrasted;
    if (preprocessOptions.method === 'threshold' || preprocessOptions.method === 'inverted_threshold') {
      value = contrasted >= threshold ? 255 : 0;
    }
    if (preprocessOptions.method === 'inverted_threshold' || preprocessOptions.method === 'inverted_grayscale') value = 255 - value;

    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  context.putImageData(imageData, 0, 0);
  return output;
}

const safeCanvasDataUrl = (canvas) => {
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
};

export async function recognizeTextFromCanvas(canvas, options = {}) {
  const session = options.session || await createSequentialOcrSession(options);
  const ownsSession = !options.session;
  let recognitionTimeoutId = null;

  try {
    await session.worker.setParameters({
      tessedit_char_whitelist: options.whitelist || OCR_CHAR_WHITELIST,
      tessedit_pageseg_mode: String(options.pageSegMode || '6'),
      preserve_interword_spaces: '1',
    });
    const timeoutMs = Math.max(10_000, Number(options.recognitionTimeoutMs) || 45_000);
    const timeout = new Promise((_, reject) => {
      recognitionTimeoutId = globalThis.setTimeout(() => {
        const error = new Error('OCR recognition timed out');
        error.name = 'TimeoutError';
        reject(error);
      }, timeoutMs);
    });
    const result = await Promise.race([session.worker.recognize(canvas), timeout]);
    globalThis.clearTimeout(recognitionTimeoutId);
    return {
      text: result?.data?.text || '',
      confidence: Number(result?.data?.confidence) || 0,
    };
  } finally {
    if (recognitionTimeoutId) globalThis.clearTimeout(recognitionTimeoutId);
    if (ownsSession) await session.terminate();
  }
}

export async function createSequentialOcrSession(options = {}) {
  const { createWorker } = await import('tesseract.js');
  const logger = (message) => options.onProgress?.({
    status: message.status || 'ocr',
    progress: Number.isFinite(message.progress) ? message.progress : 0,
  });
  const worker = await createWorker('eng', 1, { logger });
  await worker.setParameters({
    tessedit_char_whitelist: options.whitelist || OCR_CHAR_WHITELIST,
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
  });
  return {
    worker,
    terminate: () => worker.terminate().catch(() => {}),
  };
}

const normalizeDigitOcrMistakes = (value) => {
  let correctionCount = 0;
  const text = value.replace(/[0-9OoОоIl|SBbs.,+\-]+/g, (token) => {
    if (!/\d/.test(token)) return token;
    return [...token].map((character, index) => {
      let replacement = character;
      if (/[OoОо]/.test(character)) replacement = '0';
      if (/[Il|]/.test(character)) replacement = '1';
      if (/[Bb]/.test(character)) replacement = '8';
      if (/[Ss]/.test(character) && index > 0 && index < token.length - 1) replacement = '5';
      if (replacement !== character) correctionCount += 1;
      return replacement;
    }).join('');
  });
  return { text, correctionCount };
};

const normalizeDirectionalOcrMistakes = (value) => {
  let correctionCount = 0;
  const text = value.replace(
    /([-+]?\d{1,3}[.,]\d{3,10})\s*([NSM])\s*([-+]?\d{1,3}[.,]\d{3,10})\s*([EW£])/gi,
    (match, latitude, latitudeDirection, longitude, longitudeDirection) => {
      const normalizedLatitudeDirection = String(latitudeDirection).toUpperCase() === 'M'
        ? 'N'
        : String(latitudeDirection).toUpperCase();
      const normalizedLongitudeDirection = longitudeDirection === '£'
        ? 'E'
        : String(longitudeDirection).toUpperCase();
      if (normalizedLatitudeDirection !== String(latitudeDirection).toUpperCase()) correctionCount += 1;
      if (normalizedLongitudeDirection !== String(longitudeDirection).toUpperCase()) correctionCount += 1;
      return `${latitude}${normalizedLatitudeDirection} ${longitude}${normalizedLongitudeDirection}`;
    },
  );
  return { text, correctionCount };
};

const normalizeOcrText = (text) => {
  let value = String(text || '').normalize('NFKC');

  value = value
    .replace(/[−–—]/g, '-')
    .replace(/[º˚]/g, '°')
    .replace(/[;]+/g, ',');
  const directional = normalizeDirectionalOcrMistakes(value);
  value = directional.text;
  const corrected = normalizeDigitOcrMistakes(value);
  value = corrected.text;
  value = value
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();

  return { text: value, correctionCount: corrected.correctionCount + directional.correctionCount };
};

const toNumber = (value) => Number(String(value).replace(',', '.'));

const isValidLatLon = (latitude, longitude) => (
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180
);

const isZeroZeroLatLon = (latitude, longitude) => (
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && Math.abs(latitude) < 0.000001
  && Math.abs(longitude) < 0.000001
);

const isKareliaLike = (latitude, longitude) => (
  latitude >= 60
  && latitude <= 70
  && longitude >= 25
  && longitude <= 40
);

const withDirection = (value, direction) => {
  const numeric = Math.abs(toNumber(value));
  const ref = String(direction || '').toUpperCase();

  if (ref === 'S' || ref === 'W') {
    return -numeric;
  }

  return numeric;
};

const stripCoordinateNumbers = (text) => text
  .replace(/[NS]\s*[-+]?\d{1,3}\.\d{2,10}\s*[EW]\s*[-+]?\d{1,3}\.\d{2,10}/gi, ' ')
  .replace(/[-+]?\d{1,3}\.\d{2,10}\s*[NS]?\s*[, ]+\s*[-+]?\d{1,3}\.\d{2,10}\s*[EW]?/gi, ' ');

const normalizeIndexCandidate = (value) => {
  const index = String(value || '').trim();

  if (!index || /^0+$/.test(index)) {
    return null;
  }

  return index;
};

const parseIndex = (normalizedText) => {
  const labeled = normalizedText.match(
    /(?:номер\s+индекса|номер\s+index|index\s+number|индекс(?:а)?|index|idx|id)\s*[:=\-]?\s*([A-Za-zА-Яа-я]?\d{1,6})/i,
  );
  if (labeled) {
    return normalizeIndexCandidate(labeled[1]);
  }

  const symbolLabeled = normalizedText.match(/(?:№|#)\s*(\d{3,6})/);
  if (symbolLabeled) {
    return normalizeIndexCandidate(symbolLabeled[1]);
  }

  const firstCoordinateIndex = normalizedText.search(DECIMAL_NUMBER_RE);
  const afterCoordinatesSource = firstCoordinateIndex >= 0
    ? normalizedText.slice(firstCoordinateIndex)
    : normalizedText;
  const textAfterCoordinates = stripCoordinateNumbers(afterCoordinatesSource);
  const standaloneAfterCoordinates = textAfterCoordinates.match(/(?:^|\s|#)(\d{3,6})(?![.,]\d)(?=\s|$|[#.,;:])/);

  if (standaloneAfterCoordinates) {
    return normalizeIndexCandidate(standaloneAfterCoordinates[1]);
  }

  if (firstCoordinateIndex > 0) {
    const prefix = normalizedText.slice(0, firstCoordinateIndex);
    const fallback = prefix.match(/(?:^|\s)(\d{3,5})(?=\s|$)/);
    if (fallback) {
      return normalizeIndexCandidate(fallback[1]);
    }
  }

  return null;
};

const scoreCandidate = ({ latitude, longitude, baseConfidence, warnings, correctionCount = 0, contextStrength = 0 }) => {
  let confidence = baseConfidence;

  confidence += contextStrength;
  if (isKareliaLike(latitude, longitude)) confidence += 0.06;

  if (warnings.length === 0) confidence += 0.04;
  confidence -= Math.min(0.2, correctionCount * 0.035);

  return Math.max(0, Math.min(0.95, Number(confidence.toFixed(2))));
};

const addCandidate = (candidates, latitude, longitude, source, baseConfidence, warnings = [], metadata = {}) => {
  const lat = Number(latitude);
  const lon = Number(longitude);

  if (isValidLatLon(lat, lon)) {
    const candidateWarnings = isZeroZeroLatLon(lat, lon)
      ? [...new Set([...warnings, 'zero_zero_placeholder'])]
      : warnings;

    candidates.push({
      latitude: lat,
      longitude: lon,
      source,
      warnings: candidateWarnings,
      correctionCount: metadata.correctionCount || 0,
      contextStrength: metadata.contextStrength || 0,
      confidence: scoreCandidate({
        latitude: lat,
        longitude: lon,
        baseConfidence,
        warnings: candidateWarnings,
        correctionCount: metadata.correctionCount,
        contextStrength: metadata.contextStrength,
      }),
    });
  }

  const swappedLooksBetter = isValidLatLon(lon, lat)
    && (!isValidLatLon(lat, lon) || (!isKareliaLike(lat, lon) && isKareliaLike(lon, lat)));

  if (swappedLooksBetter) {
    const swapWarnings = [...new Set([...warnings, 'coordinates_swapped'])];
    candidates.push({
      latitude: lon,
      longitude: lat,
      source,
      warnings: swapWarnings,
      correctionCount: metadata.correctionCount || 0,
      contextStrength: metadata.contextStrength || 0,
      confidence: scoreCandidate({
        latitude: lon,
        longitude: lat,
        baseConfidence: baseConfidence + 0.05,
        warnings: swapWarnings,
        correctionCount: metadata.correctionCount,
        contextStrength: metadata.contextStrength,
      }),
    });
  }
};

const collectDecimalPairs = (normalizedText) => {
  const matches = [...normalizedText.matchAll(DECIMAL_NUMBER_RE)];
  const pairs = [];

  for (let i = 0; i < matches.length - 1; i += 1) {
    const first = matches[i];
    const second = matches[i + 1];
    const between = normalizedText.slice(first.index + first[0].length, second.index);

    if (between.length <= 45) {
      pairs.push([first[0], second[0]]);
    }
  }

  return pairs;
};

const hasLowPrecisionCoordinate = (value) => {
  const decimals = String(value || '').split('.')[1] || '';
  return decimals.length > 0 && decimals.length < 3;
};

const collectKareliaShortDecimalPairs = (normalizedText) => (
  [...normalizedText.matchAll(KARELIA_SHORT_DECIMAL_PAIR_RE)]
    .map((match) => [match[1], match[2]])
);

const degreesMinutesToDecimal = (degrees, minutes, direction) => withDirection(
  Math.abs(toNumber(degrees)) + (toNumber(minutes) / 60),
  direction,
);

const degreesMinutesSecondsToDecimal = (degrees, minutes, seconds, direction) => withDirection(
  Math.abs(toNumber(degrees)) + (toNumber(minutes) / 60) + (toNumber(seconds) / 3600),
  direction,
);

export function parseGpsFromOcrText(text, options = {}) {
  const minimumConfidence = Number.isFinite(Number(options.minimumConfidence))
    ? Number(options.minimumConfidence)
    : DEFAULT_MIN_PARSER_CONFIDENCE;
  const rawText = String(text || '');
  const normalized = normalizeOcrText(rawText);
  const normalizedText = normalized.text;
  const correctionCount = normalized.correctionCount;
  const warnings = [];
  const indexFromOcr = parseIndex(normalizedText);
  const candidates = [];
  const decimalMatches = normalizedText.match(DECIMAL_NUMBER_RE) || [];

  if (!normalizedText) {
    warnings.push('ocr_text_empty');
  }

  const labelPair = normalizedText.match(
    /(?:lat(?:itude)?|широта)\D{0,24}([-+]?\d{1,3}\.\d{3,10})\D{0,48}(?:lon(?:gitude)?|lng|long|долгота)\D{0,24}([-+]?\d{1,3}\.\d{3,10})/i,
  );
  if (labelPair) {
    addCandidate(candidates, toNumber(labelPair[1]), toNumber(labelPair[2]), 'labels', 0.68, [], {
      correctionCount,
      contextStrength: 0.18,
    });
  }

  const overlayDirectionPair = normalizedText.match(
    /([-+]?\d{1,3}\.\d{3,10})\s*([NS])\s*([-+]?\d{1,3}\.\d{3,10})\s*([EW])/i,
  );
  if (overlayDirectionPair) {
    addCandidate(
      candidates,
      withDirection(overlayDirectionPair[1], overlayDirectionPair[2]),
      withDirection(overlayDirectionPair[3], overlayDirectionPair[4]),
      'overlay_direction_pair',
      0.76,
      [],
      { correctionCount, contextStrength: 0.18 },
    );
  }

  const directionBefore = normalizedText.match(
    /([NS])\s*([-+]?\d{1,3}\.\d{3,10})\D{0,36}([EW])\s*([-+]?\d{1,3}\.\d{3,10})/i,
  );
  if (directionBefore) {
    addCandidate(
      candidates,
      withDirection(directionBefore[2], directionBefore[1]),
      withDirection(directionBefore[4], directionBefore[3]),
      'direction_before',
      0.72,
      [],
      { correctionCount, contextStrength: 0.18 },
    );
  }

  const directionAfter = normalizedText.match(
    /([-+]?\d{1,3}\.\d{3,10})\s*([NS])\D{0,36}([-+]?\d{1,3}\.\d{3,10})\s*([EW])/i,
  );
  if (directionAfter && !overlayDirectionPair) {
    addCandidate(
      candidates,
      withDirection(directionAfter[1], directionAfter[2]),
      withDirection(directionAfter[3], directionAfter[4]),
      'direction_after',
      0.72,
      [],
      { correctionCount, contextStrength: 0.18 },
    );
  }

  const dmsPair = normalizedText.match(
    /([-+]?\d{1,3})\s*°?\s*(\d{1,2})\s*[′']\s*(\d{1,2}(?:\.\d+)?)\s*[″"]?\s*([NS])\D{0,36}([-+]?\d{1,3})\s*°?\s*(\d{1,2})\s*[′']\s*(\d{1,2}(?:\.\d+)?)\s*[″"]?\s*([EW])/i,
  );
  if (dmsPair) {
    addCandidate(
      candidates,
      degreesMinutesSecondsToDecimal(dmsPair[1], dmsPair[2], dmsPair[3], dmsPair[4]),
      degreesMinutesSecondsToDecimal(dmsPair[5], dmsPair[6], dmsPair[7], dmsPair[8]),
      'degrees_minutes_seconds',
      0.72,
      [],
      { correctionCount, contextStrength: 0.2 },
    );
  }

  const spaceDmsPair = normalizedText.match(
    /([-+]?\d{1,3})\s+(\d{1,2})\s+(\d{1,2}(?:\.\d+)?)\s*([NS])\D{0,24}([-+]?\d{1,3})\s+(\d{1,2})\s+(\d{1,2}(?:\.\d+)?)\s*([EW])/i,
  );
  if (spaceDmsPair) {
    addCandidate(
      candidates,
      degreesMinutesSecondsToDecimal(spaceDmsPair[1], spaceDmsPair[2], spaceDmsPair[3], spaceDmsPair[4]),
      degreesMinutesSecondsToDecimal(spaceDmsPair[5], spaceDmsPair[6], spaceDmsPair[7], spaceDmsPair[8]),
      'space_degrees_minutes_seconds',
      0.7,
      [],
      { correctionCount, contextStrength: 0.2 },
    );
  }

  const degreesMinutesPair = normalizedText.match(
    /([-+]?\d{1,3})\s*°\s*(\d{1,2}(?:\.\d+)?)\s*[′']?\s*([NS])\D{0,36}([-+]?\d{1,3})\s*°\s*(\d{1,2}(?:\.\d+)?)\s*[′']?\s*([EW])/i,
  );
  if (degreesMinutesPair) {
    addCandidate(
      candidates,
      degreesMinutesToDecimal(degreesMinutesPair[1], degreesMinutesPair[2], degreesMinutesPair[3]),
      degreesMinutesToDecimal(degreesMinutesPair[4], degreesMinutesPair[5], degreesMinutesPair[6]),
      'degrees_decimal_minutes',
      0.7,
      [],
      { correctionCount, contextStrength: 0.2 },
    );
  }

  collectDecimalPairs(normalizedText).forEach(([latitude, longitude]) => {
    addCandidate(candidates, toNumber(latitude), toNumber(longitude), 'decimal_pair', 0.52, [], {
      correctionCount,
      contextStrength: 0,
    });
  });

  collectKareliaShortDecimalPairs(normalizedText).forEach(([latitude, longitude]) => {
    const warningsForCandidate = hasLowPrecisionCoordinate(latitude) || hasLowPrecisionCoordinate(longitude)
      ? ['low_precision_coordinate']
      : [];
    addCandidate(
      candidates,
      toNumber(latitude),
      toNumber(longitude),
      'karelia_short_decimal_pair',
      0.56,
      warningsForCandidate,
      { correctionCount, contextStrength: 0 },
    );
  });

  if (candidates.length === 0) {
    if (decimalMatches.length === 1) {
      warnings.push('only_one_coordinate_found');
    }

    return {
      ok: false,
      latitude: null,
      longitude: null,
      indexFromOcr,
      rawText,
      normalizedText,
      correctionCount,
      confidence: 0,
      candidates: [],
      chosenCandidate: null,
      warnings: [...new Set([...warnings, 'coordinates_not_found'])],
    };
  }

  const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
  const resultWarnings = new Set([...warnings, ...best.warnings]);

  if (isZeroZeroLatLon(best.latitude, best.longitude)) {
    resultWarnings.add('zero_zero_placeholder');
    return {
      ok: false,
      latitude: null,
      longitude: null,
      indexFromOcr,
      rawText,
      normalizedText,
      correctionCount,
      confidence: best.confidence,
      candidates,
      chosenCandidate: best,
      warnings: [...resultWarnings],
    };
  }

  if (best.confidence < minimumConfidence) {
    resultWarnings.add('low_confidence');
    return {
      ok: false,
      latitude: null,
      longitude: null,
      indexFromOcr,
      rawText,
      normalizedText,
      correctionCount,
      confidence: best.confidence,
      candidates,
      chosenCandidate: best,
      warnings: [...resultWarnings],
    };
  }

  return {
    ok: true,
    latitude: best.latitude,
    longitude: best.longitude,
    indexFromOcr,
    rawText,
    normalizedText,
    correctionCount,
    confidence: best.confidence,
    candidates,
    chosenCandidate: best,
    warnings: [...resultWarnings],
  };
}

export const scoreOcrAttempt = (attempt) => {
  const parserConfidence = Number(attempt?.parserConfidence) || 0;
  const ocrConfidence = Number(attempt?.ocrConfidence) || 0;
  const correctionPenalty = Math.min(0.18, (Number(attempt?.correctionCount) || 0) * 0.03);
  const warningPenalty = (attempt?.warnings || []).includes('low_precision_coordinate') ? 0.08 : 0;
  return Math.max(0, Math.min(0.99, Number((
    (parserConfidence * 0.78) + (ocrConfidence * 0.22) - correctionPenalty - warningPenalty
  ).toFixed(3))));
};

export function selectBestOcrAttempt(attempts) {
  return [...(attempts || [])]
    .filter((attempt) => attempt?.parsed?.chosenCandidate)
    .map((attempt) => ({ ...attempt, score: scoreOcrAttempt(attempt) }))
    .sort((left, right) => (
      right.score - left.score
      || (left.correctionCount || 0) - (right.correctionCount || 0)
      || (right.parserConfidence || 0) - (left.parserConfidence || 0)
    ))[0] || null;
}

const qualityForAttempt = (attempt) => {
  if (!attempt?.parsed?.ok) return attempt?.parsed?.chosenCandidate ? 'suspect' : 'missing';
  return attempt.score >= 0.76 && (attempt.correctionCount || 0) <= 1 ? 'confident' : 'uncertain';
};

export async function readGpsFromImageOcr(file, options = {}) {
  const debugEnabled = options.debug === true;
  const variants = Array.isArray(options.variants) && options.variants.length > 0
    ? options.variants
    : OCR_ATTEMPT_VARIANTS;
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || variants.length);
  const timeBudgetMs = Math.max(20_000, Number(options.timeBudgetMs) || 75_000);
  const startedAt = Date.now();
  const attempts = [];
  let image = null;
  let session = null;
  let overlayDetection = null;
  let overlayDetectionAttempted = false;
  let overlayFailureRecorded = false;

  try {
    options.onProgress?.({ status: 'loading_image', progress: 0 });
    image = await (options.dependencies?.loadImage || loadImageFromFile)(file);
    session = await (options.dependencies?.createSession || createSequentialOcrSession)(options);

    for (let index = 0; index < Math.min(maxAttempts, variants.length); index += 1) {
      const variant = variants[index];
      if (Date.now() - startedAt >= timeBudgetMs) {
        attempts.push({
          name: 'time_budget',
          cropName: null,
          preprocessingMethod: null,
          parsed: null,
          parseResult: null,
          warnings: ['ocr_time_budget_exhausted'],
          rejectionReason: 'ocr_time_budget_exhausted',
          score: 0,
        });
        break;
      }
      const currentBest = selectBestOcrAttempt(attempts);
      if (variant.fallback && currentBest?.parsed?.ok) break;

      const attemptProgressBase = index / Math.min(maxAttempts, variants.length);
      const cropOptions = { ...variant.crop, ...(index === 0 ? options.crop : {}) };
      const preprocessOptions = { ...variant.preprocess, ...(index === 0 ? options.preprocess : {}) };
      let crop = null;
      let prepared = null;

      try {
        options.onProgress?.({ status: `cropping:${variant.name}`, progress: attemptProgressBase });
        if (variant.overlayDetection) {
          if (!overlayDetectionAttempted) {
            overlayDetection = (options.dependencies?.detectOverlay || detectBottomRightBlackOverlay)(image);
            overlayDetectionAttempted = true;
            options.onProgress?.({
              status: overlayDetection.found ? 'overlay:found' : 'overlay:not_found',
              progress: attemptProgressBase,
            });
          }
          if (!overlayDetection.found) {
            if (!overlayFailureRecorded) attempts.push({
              name: variant.name,
              cropName: variant.cropName,
              overlayDetected: false,
              overlayDetection,
              cropDimensions: null,
              preparedDimensions: null,
              preprocessingMethod: variant.preprocessName,
              rawText: '',
              normalizedText: '',
              parserConfidence: 0,
              ocrConfidence: 0,
              correctionCount: 0,
              parsed: null,
              parseResult: null,
              warnings: ['overlay_not_found'],
              rejectionReason: overlayDetection.reason || 'overlay_not_found',
              score: 0,
            });
            overlayFailureRecorded = true;
            continue;
          }
          crop = (options.dependencies?.cropOverlay || cropDetectedOverlayLine)(
            image,
            overlayDetection,
            variant.overlayCrop,
          );
        } else {
          crop = (options.dependencies?.crop || cropImageRegion)(image, cropOptions);
        }
        prepared = (options.dependencies?.preprocess || preprocessForOcr)(crop, preprocessOptions);
        options.onProgress?.({ status: `recognizing:${variant.name}`, progress: attemptProgressBase });
        const recognized = await (options.dependencies?.recognize || recognizeTextFromCanvas)(prepared, {
          ...options,
          session,
          whitelist: variant.whitelist || OCR_CHAR_WHITELIST,
          pageSegMode: variant.pageSegMode || '6',
        });
        const parsed = parseGpsFromOcrText(recognized.text, { minimumConfidence: options.minimumConfidence });
        const ocrConfidence = Math.max(0, Math.min(0.99, Number(recognized.confidence) / 100));
        const attempt = {
          name: variant.name,
          cropName: variant.cropName || variant.name,
          cropBounds: crop.sourceBounds || null,
          cropDimensions: { width: crop.width, height: crop.height },
          preparedDimensions: { width: prepared.width, height: prepared.height },
          preprocessingMethod: variant.preprocessName || preprocessOptions.method,
          pageSegMode: variant.pageSegMode || '6',
          overlayDetected: variant.overlayDetection ? true : null,
          overlayDetection: variant.overlayDetection ? {
            found: true,
            bounds: overlayDetection.bounds,
            sampleDimensions: overlayDetection.sampleDimensions,
          } : null,
          rawText: parsed.rawText,
          normalizedText: parsed.normalizedText,
          parserConfidence: parsed.confidence,
          ocrConfidence,
          correctionCount: parsed.correctionCount || 0,
          parsed,
          parseResult: parsed.chosenCandidate,
          warnings: parsed.warnings || [],
          rejectionReason: parsed.ok ? null : parsed.chosenCandidate ? 'parser_low_confidence' : 'coordinates_not_found',
          cropPreview: debugEnabled ? safeCanvasDataUrl(crop) : '',
          processedPreview: debugEnabled ? safeCanvasDataUrl(prepared) : '',
        };
        attempt.score = scoreOcrAttempt(attempt);
        attempts.push(attempt);

        if (parsed.ok && attempt.score >= 0.78 && attempt.correctionCount <= 1) break;
      } catch (error) {
        attempts.push({
          name: variant.name,
          cropName: variant.cropName || variant.name,
          cropBounds: crop?.sourceBounds || null,
          cropDimensions: crop ? { width: crop.width, height: crop.height } : null,
          preparedDimensions: prepared ? { width: prepared.width, height: prepared.height } : null,
          preprocessingMethod: variant.preprocessName || preprocessOptions.method,
          pageSegMode: variant.pageSegMode || '6',
          overlayDetected: variant.overlayDetection ? Boolean(overlayDetection?.found) : null,
          rawText: '',
          normalizedText: '',
          parserConfidence: 0,
          ocrConfidence: 0,
          correctionCount: 0,
          parsed: null,
          parseResult: null,
          warnings: ['ocr_attempt_error'],
          rejectionReason: error instanceof Error ? error.message : String(error),
          score: 0,
        });
        if (error?.name === 'TimeoutError') {
          await session?.terminate?.();
          session = await (options.dependencies?.createSession || createSequentialOcrSession)(options);
        }
      }
    }

    const best = selectBestOcrAttempt(attempts);
    if (best?.parsed?.ok) {
      return {
        ...best.parsed,
        confidence: best.score,
        ocrConfidence: best.ocrConfidence,
        ocrStatus: qualityForAttempt(best),
        attempts,
        cropPreview: best.cropPreview || '',
        processedPreview: best.processedPreview || '',
      };
    }

    return {
      ...(best?.parsed || {}),
      ok: false,
      latitude: null,
      longitude: null,
      indexFromOcr: best?.parsed?.indexFromOcr || null,
      rawText: best?.rawText || '',
      normalizedText: best?.normalizedText || '',
      confidence: best?.score || 0,
      ocrConfidence: best?.ocrConfidence || 0,
      ocrStatus: best?.parsed?.chosenCandidate ? 'suspect' : 'missing',
      candidates: best?.parsed?.candidates || [],
      chosenCandidate: best?.parsed?.chosenCandidate || null,
      attempts,
      cropPreview: best?.cropPreview || '',
      processedPreview: best?.processedPreview || '',
      warnings: best?.warnings || ['coordinates_not_found'],
    };
  } catch (error) {
    return {
      ok: false,
      latitude: null,
      longitude: null,
      indexFromOcr: null,
      rawText: '',
      normalizedText: '',
      confidence: 0,
      ocrConfidence: 0,
      ocrStatus: 'error',
      candidates: [],
      chosenCandidate: null,
      attempts,
      cropPreview: '',
      processedPreview: '',
      warnings: ['ocr_error', error instanceof Error ? error.message : 'Ошибка OCR'],
    };
  } finally {
    await session?.terminate?.();
    image = null;
  }
}
