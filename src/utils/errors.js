export const USER_ERRORS = Object.freeze({
  CLEANUP_FAILED: 'Не удалось очистить metadata. Фото не загружено.',
  UPLOAD_FAILED: 'Не удалось загрузить фото. Повторите попытку.',
  BUFFER_FAILED: 'Не удалось подготовить выбранный файл.',
});

export const technicalErrorMessage = (error) => (
  error instanceof Error ? error.message : String(error || 'Unknown error')
);
