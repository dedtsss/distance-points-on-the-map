import { formatFileSize } from '../utils/format';

export default function PhotoPicker({ photos, onSelect, disabled, isBuffering }) {
  return (
    <section className="picker-card" aria-labelledby="picker-title">
      <div>
        <p className="section-kicker">Шаг 1</p>
        <h2 id="picker-title">Выберите фотографии</h2>
        <p className="section-copy">
          Файлы сразу копируются во внутренний буфер браузера. Исходные фотографии на устройстве не изменяются.
        </p>
      </div>

      <label className={`file-button${disabled ? ' is-disabled' : ''}`}>
        <input
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          multiple
          onChange={onSelect}
          disabled={disabled}
        />
        {isBuffering ? 'Подготовка файлов…' : 'Выбрать фото'}
      </label>

      {photos.length > 0 && (
        <ol className="selected-files" aria-label="Выбранные фотографии">
          {photos.map((photo) => (
            <li key={photo.id}>
              <span><strong>{photo.number}.</strong> {photo.fileName}</span>
              <span>{formatFileSize(photo.size)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
