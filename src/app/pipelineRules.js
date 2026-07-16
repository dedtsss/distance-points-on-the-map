export const UPLOAD_NON_BLOCKERS = Object.freeze([
  'missing_coordinates',
  'ocr_coordinates_missing',
  'exif_coordinates_missing',
  'distance_conflict',
  'multiple_distance_conflicts',
]);

export const UPLOAD_BLOCKERS = Object.freeze([
  'stable_copy_failed',
  'metadata_cleanup_failed',
  'metadata_verification_failed',
  'original_file_upload_attempt',
  'no_provider_links',
]);

export const UPLOAD_RULES_EXPLANATION = 'Близкие точки и отсутствие координат не блокируют загрузку. Фото не загружается только если не удалось очистить metadata или загрузка на серверы не удалась.';
