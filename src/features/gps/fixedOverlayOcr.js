import {
  createSequentialOcrSession,
  detectBlackBottomRightOverlay,
  loadImageFromFile,
  recognizeTextFromCanvas,
} from '../../utils/ocrGpsReader.js';

export const FIXED_OVERLAY_PROFILE = Object.freeze({
  name: 'gps-camera-black-overlay-v1',
  coordinates: Object.freeze({ xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 0.42 }),
  index: Object.freeze({ xRatio: 0.62, yRatio: 0.45, widthRatio: 0.38, heightRatio: 0.30 }),
  scale: 3,
});

const COORDINATE_WHITELIST = '0123456789.,NSEWnsew+-±mм';
const INDEX_WHITELIST = '0123456789';

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

const safeDataUrl = (canvas) => {
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
};

export const relativeBoundsWithin = (outer, relative) => {
  const xRatio = clamp(Number(relative.xRatio) || 0, 0, 1);
  const yRatio = clamp(Number(relative.yRatio) || 0, 0, 1);
  const widthRatio = clamp(Number(relative.widthRatio) || 0, 0, 1 - xRatio);
  const heightRatio = clamp(Number(relative.heightRatio) || 0, 0, 1 - yRatio);
  return {
    x: Math.round(outer.x + (outer.width * xRatio)),
    y: Math.round(outer.y + (outer.height * yRatio)),
    width: Math.max(1, Math.round(outer.width * widthRatio)),
    height: Math.max(1, Math.round(outer.height * heightRatio)),
  };
};

const cropBounds = (image, bounds) => {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const x = clamp(Math.round(bounds.x), 0, Math.max(0, sourceWidth - 1));
  const y = clamp(Math.round(bounds.y), 0, Math.max(0, sourceHeight - 1));
  const right = clamp(Math.round(bounds.x + bounds.width), x + 1, sourceWidth);
  const bottom = clamp(Math.round(bounds.y + bounds.height), y + 1, sourceHeight);
  const canvas = document.createElement('canvas');
  canvas.width = right - x;
  canvas.height = bottom - y;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D недоступен для fixed overlay crop');
  context.drawImage(image, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  canvas.sourceBounds = { x, y, width: canvas.width, height: canvas.height };
  return canvas;
};

export const prepareNearestAutocontrast = (canvas, scale = FIXED_OVERLAY_PROFILE.scale) => {
  const requestedScale = clamp(Math.round(Number(scale) || 3), 1, 4);
  const output = document.createElement('canvas');
  output.width = Math.max(1, canvas.width * requestedScale);
  output.height = Math.max(1, canvas.height * requestedScale);
  const context = output.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D недоступен для fixed overlay preprocessing');
  context.imageSmoothingEnabled = false;
  context.drawImage(canvas, 0, 0, output.width, output.height);

  const imageData = context.getImageData(0, 0, output.width, output.height);
  const { data } = imageData;
  let minimum = 255;
  let maximum = 0;
  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round((data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114));
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
    minimum = Math.min(minimum, gray);
    maximum = Math.max(maximum, gray);
  }

  const range = Math.max(1, maximum - minimum);
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.round(((data[index] - minimum) * 255) / range);
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }
  context.putImageData(imageData, 0, 0);
  return output;
};

const normalizeCoordinateToken = (token, kind) => {
  const compact = String(token || '')
    .replace(/[,;:]/g, '.')
    .replace(/\s+/g, '');

  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 2)}.${compact.slice(2)}`;
  }

  if (kind === 'latitude' && /^\d\.\d{6,8}$/.test(compact)) {
    return `6${compact}`;
  }

  if (/^\d{2}\.\d{3,10}$/.test(compact)) return compact;
  return null;
};

export const parseFixedOverlayCoordinates = (text) => {
  const normalizedText = String(text || '')
    .normalize('NFKC')
    .replace(/[−–—]/g, '-')
    .replace(/(\d)\s+(?=\d)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  const match = normalizedText.match(/([0-9][0-9\s.,:;]{3,14})\s*N\D{0,24}([0-9][0-9\s.,:;]{3,14})\s*E/i);
  if (!match) return null;

  const latitudeText = normalizeCoordinateToken(match[1], 'latitude');
  const longitudeText = normalizeCoordinateToken(match[2], 'longitude');
  if (!latitudeText || !longitudeText) return null;

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < 60 || latitude > 70 || longitude < 25 || longitude > 40) return null;

  return {
    latitude,
    longitude,
    latitudeText,
    longitudeText,
    normalizedText: `${latitudeText}N ${longitudeText}E`,
  };
};

export const parseFixedOverlayIndex = (text) => {
  const normalizedText = String(text || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  const matches = normalizedText.match(/\d{4,5}/g) || [];
  return matches.length === 1 ? matches[0] : null;
};

const fixedCoordinateCandidate = (parsed) => ({
  latitude: parsed.latitude,
  longitude: parsed.longitude,
  coordinateText: {
    latitude: parsed.latitudeText,
    longitude: parsed.longitudeText,
  },
  coordinatePrecision: {
    latitude: parsed.latitudeText.split('.')[1]?.length || 0,
    longitude: parsed.longitudeText.split('.')[1]?.length || 0,
  },
  coordinateQuality: null,
  source: 'fixed_camera_overlay',
  warnings: [],
  correctionCount: 0,
  contextStrength: 0.25,
  confidence: 0.97,
});

export async function readFixedOverlayProfile(file, options = {}) {
  const loadImage = options.dependencies?.loadImage || loadImageFromFile;
  const detectOverlay = options.dependencies?.detectOverlay || detectBlackBottomRightOverlay;
  const createSession = options.dependencies?.createSession || createSequentialOcrSession;
  const recognize = options.dependencies?.recognize || recognizeTextFromCanvas;
  let image = null;
  let session = null;

  try {
    options.onProgress?.({ status: 'fixed_overlay:loading_image', progress: 0 });
    image = await loadImage(file);
    const overlay = detectOverlay(image);
    if (!overlay?.found || !overlay.bounds) {
      return {
        matched: false,
        reason: overlay?.reason || 'fixed_overlay_not_found',
        attempts: [],
        indexAttempts: [],
      };
    }

    session = await createSession(options);
    const coordinateBounds = relativeBoundsWithin(overlay.bounds, FIXED_OVERLAY_PROFILE.coordinates);
    const coordinateCrop = cropBounds(image, coordinateBounds);
    const coordinatePrepared = prepareNearestAutocontrast(coordinateCrop);
    options.onProgress?.({ status: 'fixed_overlay:coordinates', progress: 0.35 });
    const coordinateRecognition = await recognize(coordinatePrepared, {
      ...options,
      session,
      whitelist: COORDINATE_WHITELIST,
      pageSegMode: '7',
      recognitionTimeoutMs: 20_000,
    });
    const parsedCoordinates = parseFixedOverlayCoordinates(coordinateRecognition.text);
    const coordinateOcrConfidence = Math.max(0, Math.min(0.99, Number(coordinateRecognition.confidence) / 100));
    const coordinateAttempt = {
      name: `${FIXED_OVERLAY_PROFILE.name}:coordinates`,
      cropName: 'fixed_coordinate_line',
      detectorName: 'black_bottom_right_overlay',
      cropBounds: coordinateCrop.sourceBounds,
      cropDimensions: { width: coordinateCrop.width, height: coordinateCrop.height },
      preparedDimensions: { width: coordinatePrepared.width, height: coordinatePrepared.height },
      preprocessingMethod: 'nearest_autocontrast_3x',
      pageSegMode: '7',
      overlayDetected: true,
      overlayDetection: {
        found: true,
        detectorName: 'black_bottom_right_overlay',
        bounds: overlay.bounds,
      },
      rawText: coordinateRecognition.text || '',
      normalizedText: parsedCoordinates?.normalizedText || '',
      parserConfidence: parsedCoordinates ? 0.97 : 0,
      ocrConfidence: coordinateOcrConfidence,
      correctionCount: 0,
      warnings: parsedCoordinates ? [] : ['coordinates_not_found'],
      rejectionReason: parsedCoordinates ? null : 'coordinates_not_found',
      cropPreview: options.debug === true ? safeDataUrl(coordinateCrop) : '',
      processedPreview: options.debug === true ? safeDataUrl(coordinatePrepared) : '',
      score: parsedCoordinates ? 0.97 : 0,
    };

    if (!parsedCoordinates) {
      return {
        matched: false,
        reason: 'fixed_coordinates_not_found',
        attempts: [coordinateAttempt],
        indexAttempts: [],
      };
    }

    const indexBounds = relativeBoundsWithin(overlay.bounds, FIXED_OVERLAY_PROFILE.index);
    const indexCrop = cropBounds(image, indexBounds);
    const indexPrepared = prepareNearestAutocontrast(indexCrop);
    options.onProgress?.({ status: 'fixed_overlay:index', progress: 0.75 });
    const indexRecognition = await recognize(indexPrepared, {
      ...options,
      session,
      whitelist: INDEX_WHITELIST,
      pageSegMode: '8',
      recognitionTimeoutMs: 20_000,
    });
    const indexFromOcr = parseFixedOverlayIndex(indexRecognition.text);
    const indexOcrConfidence = Math.max(0, Math.min(0.99, Number(indexRecognition.confidence) / 100));
    const indexCandidate = indexFromOcr ? {
      value: indexFromOcr,
      indexFromOcr,
      status: 'found',
      source: 'fixed_camera_overlay',
      rawText: indexRecognition.text || '',
      normalizedText: indexFromOcr,
      token: indexFromOcr,
      ocrConfidence: indexOcrConfidence,
      cropBounds: indexCrop.sourceBounds,
      cropName: 'fixed_index_value',
      attemptName: `${FIXED_OVERLAY_PROFILE.name}:index`,
      isolatedLine: true,
      labeled: true,
      correctionCount: 0,
      score: 0.97,
    } : null;
    const indexAttempt = {
      name: `${FIXED_OVERLAY_PROFILE.name}:index`,
      cropName: 'fixed_index_value',
      detectorName: 'black_bottom_right_overlay',
      cropBounds: indexCrop.sourceBounds,
      cropDimensions: { width: indexCrop.width, height: indexCrop.height },
      preparedDimensions: { width: indexPrepared.width, height: indexPrepared.height },
      preprocessingMethod: 'nearest_autocontrast_3x',
      pageSegMode: '8',
      overlayDetected: true,
      overlayBounds: overlay.bounds,
      rawText: indexRecognition.text || '',
      normalizedText: indexFromOcr || '',
      ocrConfidence: indexOcrConfidence,
      indexCandidates: indexCandidate ? [indexCandidate] : [],
      cropPreview: options.debug === true ? safeDataUrl(indexCrop) : '',
      processedPreview: options.debug === true ? safeDataUrl(indexPrepared) : '',
      rejectionReason: indexCandidate ? null : 'index_not_found',
      warnings: indexCandidate ? [] : ['index_not_found'],
    };

    const coordinateCandidate = fixedCoordinateCandidate(parsedCoordinates);
    return {
      matched: true,
      result: {
        ok: true,
        latitude: parsedCoordinates.latitude,
        longitude: parsedCoordinates.longitude,
        indexFromOcr,
        indexStatus: indexFromOcr ? 'found' : 'missing',
        indexAttempts: [indexAttempt],
        indexCandidates: indexCandidate ? [indexCandidate] : [],
        chosenIndexCandidate: indexCandidate,
        indexCropBounds: indexCandidate ? indexCrop.sourceBounds : null,
        indexOcrConfidence,
        rawText: coordinateRecognition.text || '',
        normalizedText: parsedCoordinates.normalizedText,
        correctionCount: 0,
        confidence: 0.97,
        ocrConfidence: coordinateOcrConfidence,
        ocrStatus: 'confident',
        coordinateQuality: null,
        coordinatePrecision: coordinateCandidate.coordinatePrecision,
        coordinateText: coordinateCandidate.coordinateText,
        candidates: [coordinateCandidate],
        chosenCandidate: coordinateCandidate,
        attempts: [coordinateAttempt],
        cropPreview: coordinateAttempt.cropPreview,
        processedPreview: coordinateAttempt.processedPreview,
        warnings: indexFromOcr ? [] : ['index_not_found'],
      },
    };
  } catch (error) {
    return {
      matched: false,
      reason: error instanceof Error ? error.message : String(error),
      attempts: [],
      indexAttempts: [],
    };
  } finally {
    await session?.terminate?.();
    image = null;
  }
}
