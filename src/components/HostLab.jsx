import { useState } from 'react';
import { testUmbPhotosUpload } from '../utils/hostLabUpload';

export default function HostLab() {
  const [file, setFile] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setResult(null);
  };

  const runUmbTest = async () => {
    if (!file) {
      setResult({ ok: false, directUrl: null, results: [{ strategy: 'Подготовка', responsePreview: 'Сначала выберите тестовое фото.' }] });
      return;
    }

    setIsTesting(true);
    setResult(null);

    try {
      const nextResult = await testUmbPhotosUpload(file);
      setResult(nextResult);
    } catch (error) {
      setResult({
        ok: false,
        directUrl: null,
        results: [{
          strategy: 'Неперехваченная ошибка',
          responsePreview: error instanceof Error ? error.message : 'Неизвестная ошибка',
        }],
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="panel host-lab">
      <h2>Лаборатория хостингов</h2>
      <p className="muted">
        Тестовый блок. Он не влияет на основную загрузку. Здесь проверяем, можно ли загружать фото на UMBPhotos напрямую из нашего приложения.
      </p>
      <p className="muted small">
        Открытие /api/1/upload в браузере через GET не показатель. Проверка ниже отправляет POST-запрос с файлом.
      </p>

      <label className="field">
        Тестовое фото для UMBPhotos
        <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleFileChange} />
      </label>

      <div className="host-lab-actions">
        <button type="button" onClick={runUmbTest} disabled={isTesting || !file}>
          {isTesting ? 'Проверяем UMBPhotos...' : 'Проверить UMBPhotos'}
        </button>
        <button type="button" disabled title="Добавим после UMBPhotos">
          Проверить NinjaBox позже
        </button>
      </div>

      {result && (
        <div className="host-lab-result">
          <h3>{result.ok ? 'UMBPhotos: загрузка сработала' : 'UMBPhotos: загрузка не подтверждена'}</h3>
          {result.directUrl && (
            <p>
              Прямая ссылка:{' '}
              <a href={result.directUrl} target="_blank" rel="noreferrer">{result.directUrl}</a>
            </p>
          )}
          <div className="host-lab-attempts">
            {result.results.map((item, index) => (
              <div className="host-lab-attempt" key={`${item.strategy}-${index}`}>
                <strong>{index + 1}. {item.strategy}</strong>
                <p>Статус: {item.status || 'нет ответа'} {item.statusText || ''}</p>
                {item.directUrl && <p>Найдена ссылка: {item.directUrl}</p>}
                <pre>{item.responsePreview || 'Пустой ответ'}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
