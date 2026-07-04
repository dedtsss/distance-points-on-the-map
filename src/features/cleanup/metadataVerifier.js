import exifr from 'exifr';

const METADATA_KEY_PATTERN = /(gps|latitude|longitude|datetime|createdate|modifydate|make|model|lens|software|artist|copyright|serial|owner|exif|xmp|iptc|icc|thumbnail)/i;

export async function verifyCleanedMetadata(file) {
  try {
    const parsed = await exifr.parse(file, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      xmp: true,
      iptc: true,
      icc: true,
      jfif: false,
      ihdr: false,
      translateValues: false,
      reviveValues: true,
      mergeOutput: true,
    });
    const remainingKeys = Object.keys(parsed || {}).sort();
    return {
      checked: true,
      hasGps: remainingKeys.some((key) => /^(gps|latitude|longitude)/i.test(key)),
      hasExif: remainingKeys.some((key) => METADATA_KEY_PATTERN.test(key)),
      remainingKeys,
    };
  } catch (error) {
    return {
      checked: false,
      hasGps: false,
      hasExif: false,
      remainingKeys: [],
      error: error instanceof Error ? error.message : 'metadata verification failed',
    };
  }
}

export const isMetadataVerificationSafe = (verification) => (
  verification?.checked === true
  && verification.hasGps === false
  && verification.hasExif === false
);
