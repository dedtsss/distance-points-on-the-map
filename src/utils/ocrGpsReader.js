const DEFAULT_CROP_OPTIONS = {
  widthRatio: 0.52,
  heightRatio: 0.32,
  rightPaddingRatio: 0,
  bottomPaddingRatio: 0,
};

const DEFAULT_PREPROCESS_OPTIONS = {
  upscale: 3,
  threshold: 145,
  contrast: 1.35,
  invert: true,
};

const DEFAULT_MIN_PARSER_CONFIDENCE = 0.55;

const OCR_ATTEMPT_VARIANTS = [
  {
    name: 'default',
    crop: {},
    preprocess: {},
  },
  {
    name: 'wider_bottom_right',
    crop: { widthRatio: 0.62, heightRatio: 0.36 },
    preprocess: { threshold: 135, contrast: 1.45, invert: true },
  },
  {
    name: 'lower_strip',
    crop: { widthRatio: 0.72, heightRatio: 0.22 },
    preprocess: { threshold: 150, contrast: 1.35, invert: true },
  },
  {
    name: 'no_invert',
    crop: { widthRatio: 0.62, heightRatio: 0.34 },
    preprocess: { threshold: 145, contrast: 1.45, invert: false },
  },
  {
    name: 'light_overlay_high_threshold',
    crop: { widthRatio: 0.62, heightRatio: 0.32 },
    preprocess: { threshold: 210, contrast: 1.2, invert: false },
  },
  {
    name: 'wide_lower_light_overlay',
    crop: { widthRatio: 0.78, heightRatio: 0.24 },
    preprocess: { threshold: 205, contrast: 1.25, invert: false },
  },
];

const OCR_CHAR_WHITELIST = '0123456789.,-+ NSEWnsew°\'": LATlatLONlonIndex№#НомерИндексаиндекса';
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

export function cropBottomRight(image, options = {}) {
  const cropOptions = { ...DEFAULT_CROP_OPTIONS, ...options };
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Изображение для OCR имеет пустой размер');
  }

  const cropWidth = Math.max(1, Math.min(sourceWidth, Math.round(sourceWidth * cropOptions.widthRatio)));
  const cropHeight = Math.max(1, Math.min(sourceHeight, Math.round(sourceHeight * cropOptions.heightRatio)));
  const rightPadding = Math.max(0, Math.round(sourceWidth * cropOptions.rightPaddingRatio));
  const bottomPadding = Math.max(0, Math.round(sourceHeight * cropOptions.bottomPaddingRatio));
  const cropX = Math.max(0, sourceWidth - cropWidth - rightPadding);
  const cropY = Math.max(0, sourceHeight - cropHeight - bottomPadding);

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D недоступен для OCR');
  }

  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return canvas;
}

export function preprocessForOcr(canvas, options = {}) {
  const preprocessOptions = { ...DEFAULT_PREPROCESS_OPTIONS, ...options };
  const scale = Math.max(1, Math.min(4, Number(preprocessOptions.upscale) || 3));

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

  const imageData = context.getImageData(0, 0, output.width, output.height);
  const { data } = imageData;
  const threshold = Number(preprocessOptions.threshold) || DEFAULT_PREPROCESS_OPTIONS.threshold;
  const contrast = Number(preprocessOptions.contrast) || DEFAULT_PREPROCESS_OPTIONS.contrast;

  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] * 0.299) + (data[i + 1] * 0.587) + (data[i + 2] * 0.114);
    const contrasted = Math.max(0, Math.min(255, ((gray - 128) * contrast) + 128));
    let value = contrasted >= threshold ? 255 : 0;

    if (preprocessOptions.invert) {
      value = 255 - value;
    }

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
  const { createWorker } = await import('tesseract.js');
  const logger = (message) => {
    if (typeof options.onProgress === 'function') {
      options.onProgress({
        status: message.status || 'ocr',
        progress: Number.isFinite(message.progress) ? message.progress : 0,
      });
    }
  };

  let worker = null;

  try {
    worker = await createWorker('eng', 1, { logger });
    await worker.setParameters({
      tessedit_char_whitelist: options.whitelist || OCR_CHAR_WHITELIST,
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
    });

    const result = await worker.recognize(canvas);
    return {
      text: result?.data?.text || '',
      confidence: Number(result?.data?.confidence) || 0,
    };
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}

const normalizeDigitOcrMistakes = (value) => value
  .replace(/([0-9])[OoОо](?=[0-9])/g, (_, digit) => `${digit}0`)
  .replace(/\b[OoОо](?=[0-9])/g, '0')
  .replace(/([0-9])[lI|](?=[0-9])/g, (_, digit) => `${digit}1`)
  .replace(/\b[lI|](?=[0-9])/g, '1');

const normalizeOcrText = (text) => {
  let value = String(text || '').normalize('NFKC');

  value = value
    .replace(/[−–—]/g, '-')
    .replace(/[º˚]/g, '°')
    .replace(/[;]+/g, ',');
  value = normalizeDigitOcrMistakes(value);
  value = value
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();

  return value;
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

const parseIndex = (normalizedText) => {
  const labeled = normalizedText.match(
    /(?:номер\s+индекса|номер\s+index|index\s+number|индекс(?:а)?|index|idx|id)\s*[:=\-]?\s*([A-Za-zА-Яа-я]?\d{1,6})/i,
  );
  if (labeled) {
    return labeled[1];
  }

  const symbolLabeled = normalizedText.match(/(?:№|#)\s*(\d{3,6})/);
  if (symbolLabeled) {
    return symbolLabeled[1];
  }

  const firstCoordinateIndex = normalizedText.search(DECIMAL_NUMBER_RE);
  const afterCoordinatesSource = firstCoordinateIndex >= 0
    ? normalizedText.slice(firstCoordinateIndex)
    : normalizedText;
  const textAfterCoordinates = stripCoordinateNumbers(afterCoordinatesSource);
  const standaloneAfterCoordinates = textAfterCoordinates.match(/(?:^|\s|#)(\d{3,6})(?![.,]\d)(?=\s|$|[#.,;:])/);

  if (standaloneAfterCoordinates) {
    return standaloneAfterCoordinates[1];
  }

  if (firstCoordinateIndex > 0) {
    const prefix = normalizedText.slice(0, firstCoordinateIndex);
    const fallback = prefix.match(/(?:^|\s)(\d{3,5})(?=\s|$)/);
    if (fallback) {
      return fallback[1];
    }
  }

  return null;
};

const scoreCandidate = ({ latitude, longitude, baseConfidence, warnings }) => {
  let confidence = baseConfidence;

  if (isKareliaLike(latitude, longitude)) {
    confidence += 0.16;
  }

  if (warnings.length === 0) {
    confidence += 0.04;
  }

  return Math.max(0, Math.min(0.95, Number(confidence.toFixed(2))));
};

const addCandidate = (candidates, latitude, longitude, source, baseConfidence, warnings = []) => {
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
      confidence: scoreCandidate({ latitude: lat, longitude: lon, baseConfidence, warnings: candidateWarnings }),
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
      confidence: scoreCandidate({
        latitude: lon,
        longitude: lat,
        baseConfidence: baseConfidence + 0.05,
        warnings: swapWarnings,
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

export function parseGpsFromOcrText(text, options = {}) {
  const minimumConfidence = Number.isFinite(Number(options.minimumConfidence))
    ? Number(options.minimumConfidence)
    : DEFAULT_MIN_PARSER_CONFIDENCE;
  const rawText = String(text || '');
  const normalizedText = normalizeOcrText(rawText);
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
    addCandidate(candidates, toNumber(labelPair[1]), toNumber(labelPair[2]), 'labels', 0.68);
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
    );
  }

  const directionAfter = normalizedText.match(
    /([-+]?\d{1,3}\.\d{3,10})\s*([NS])\D{0,36}([-+]?\d{1,3}\.\d{3,10})\s*([EW])/i,
  );
  if (directionAfter) {
    addCandidate(
      candidates,
      withDirection(directionAfter[1], directionAfter[2]),
      withDirection(directionAfter[3], directionAfter[4]),
      'direction_after',
      0.72,
    );
  }

  collectDecimalPairs(normalizedText).forEach(([latitude, longitude]) => {
    addCandidate(candidates, toNumber(latitude), toNumber(longitude), 'decimal_pair', 0.52);
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
      confidence: 0,
      candidates: [],
      chosenCandidate: null,
      warnings: [...new Set([...warnings, 'coordinates_not_found'])],
    };
  }

  const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
  const resultWarnings = new Set([...warnings, ...best.warnings]);

  if (!isKareliaLike(best.latitude, best.longitude)) {
    resultWarnings.add('outside_expected_region');
  }

  if (isZeroZeroLatLon(best.latitude, best.longitude)) {
    resultWarnings.add('zero_zero_placeholder');
    return {
      ok: false,
      latitude: null,
      longitude: null,
      indexFromOcr,
      rawText,
      normalizedText,
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
    confidence: best.confidence,
    candidates,
    chosenCandidate: best,
    warnings: [...resultWarnings],
  };
}

export async function readGpsFromImageOcr(file, options = {}) {
  try {
    const debugEnabled = options.debug === true;
    const variants = Array.isArray(options.variants) && options.variants.length > 0
      ? options.variants
      : OCR_ATTEMPT_VARIANTS;
    const maxAttempts = Math.max(1, Number(options.maxAttempts) || variants.length);
    const attempts = [];
    let bestRejected = null;

    options.onProgress?.({ status: 'loading_image', progress: 0 });
    const image = await loadImageFromFile(file);

    for (let index = 0; index < Math.min(maxAttempts, variants.length); index += 1) {
      const variant = variants[index];
      const attemptProgressBase = index / variants.length;
      const cropOptions = {
        ...variant.crop,
        ...(index === 0 ? options.crop : {}),
      };
      const preprocessOptions = {
        ...variant.preprocess,
        ...(index === 0 ? options.preprocess : {}),
      };

      options.onProgress?.({
        status: `cropping:${variant.name}`,
        progress: Math.min(0.08 + attemptProgressBase * 0.15, 0.85),
      });
      const crop = cropBottomRight(image, cropOptions);
      const prepared = preprocessForOcr(crop, preprocessOptions);
      options.onProgress?.({
        status: `recognizing:${variant.name}`,
        progress: Math.min(0.12 + attemptProgressBase * 0.2, 0.9),
      });
      const recognized = await recognizeTextFromCanvas(prepared, options);
      const parsed = parseGpsFromOcrText(recognized.text, {
        minimumConfidence: options.minimumConfidence,
      });
      const ocrConfidence = Math.max(0, Math.min(0.99, recognized.confidence / 100));
      const attempt = {
        name: variant.name,
        ok: parsed.ok,
        rawText: parsed.rawText,
        normalizedText: parsed.normalizedText,
        parserConfidence: parsed.confidence,
        ocrConfidence,
        candidates: parsed.candidates || [],
        chosenCandidate: parsed.chosenCandidate || null,
        warnings: parsed.warnings || [],
        cropPreview: debugEnabled ? safeCanvasDataUrl(crop) : '',
        processedPreview: debugEnabled ? safeCanvasDataUrl(prepared) : '',
      };
      attempts.push(attempt);

      const rejectedScore = parsed.confidence || (parsed.candidates?.length ? 0.1 : 0);
      if (!bestRejected || rejectedScore > (bestRejected.confidence || 0)) {
        bestRejected = {
          ...parsed,
          confidence: rejectedScore,
          ocrConfidence,
          ocrStatus: parsed.candidates?.length ? 'suspect' : 'missing',
          cropPreview: attempt.cropPreview,
          processedPreview: attempt.processedPreview,
        };
      }

      if (parsed.ok) {
        return {
          ...parsed,
          confidence: Math.max(parsed.confidence, Number(ocrConfidence.toFixed(2))),
          ocrConfidence,
          ocrStatus: 'found',
          attempts,
          cropPreview: attempt.cropPreview,
          processedPreview: attempt.processedPreview,
        };
      }
    }

    return {
      ...(bestRejected || {
        ok: false,
        latitude: null,
        longitude: null,
        indexFromOcr: null,
        rawText: '',
        normalizedText: '',
        confidence: 0,
        ocrConfidence: 0,
        ocrStatus: 'missing',
        warnings: ['coordinates_not_found'],
      }),
      ok: false,
      latitude: null,
      longitude: null,
      attempts,
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
      attempts: [],
      cropPreview: '',
      processedPreview: '',
      warnings: [
        'ocr_error',
        error instanceof Error ? error.message : 'Ошибка OCR',
      ],
    };
  }
}
