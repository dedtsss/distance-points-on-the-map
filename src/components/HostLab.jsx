import { useState } from 'react';
import { testNinjaBoxUpload, testUmbPhotosUpload } from '../utils/hostLabUpload';

const HOST_LABELS = {
  umb: 'UMBPhotos',
  ninja: 'NinjaBox',
};

export default function HostLab() {
  const [file, setFile] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [activeHost, setActiveHost] = useState('');
  const [result, setResult] = useState(null);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setResult(null);
  };

  const runTest = async (host) => {
    if (!file) {
      setResult({
        hostLabel: HOST_LABELS[host],
        ok: false,
        directUrl: null,
        results: [{ strategy: 'Подготовка', responsePreview: 'Сначала выберите тестовое фото.' }],
      });
      return;
    }

    setIsTesting(true);
    setActiveHost(host);
    setResult(null);

    try {
      const nextResult = host === 'umb'
        ? await testUmbPhotosUpload(file)
        : await testNinjaBoxUpload(file);
      setResult({ ...nextResult, hostLabel: HOST_LABELS[host] });
    } catch (error) {
      setResult({
        hostLabel: HOST_LABELS[host],
        ok: false,
        directUrl: null,
        results: [{
          strategy: 'Неперехваченная ошибка',
          responsePreview: error instanceof Error ? error.message : 'Неизвестная ошибка',
        }],
      });
    } finally {
      setIsTesting(false);
      setActiveHost('');
    }
  };

  return (
    <section className="panel host-lab">
      <h2>Лаборатория хостингов</h2>
      <p className="muted">
        Тестовый блок. Он не влияет на основную загрузку. Здесь проверяем, можно ли загружать фото на UMBPhotos и NinjaBox напрямую из нашего приложения.
      </p>
      <p className="muted small">
        Ручная загрузка на сайте и загрузка из нашего домена — разные сценарии. Если будет Failed to fetch, это обычно CORS или блокировка кросс-доменного POST.
      </p>

      <label className="field">
        Тестовое фото для проверки хостинга
        <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" onChange={handleFileChange} />
      </label>

      <div className="host-lab-actions">
        <button type="button" onClick={() => runTest('umb')} disabled={isTesting || !file}>
          {isTesting && activeHost === 'umb' ? 'Проверяем UMBPhotos...' : 'Проверить UMBPhotos'}
        </button>
        <button type="button" onClick={() => runTest('ninja')} disabled={isTesting || !file}>
          {isTesting && activeHost === 'ninja' ? 'Проверяем NinjaBox...' : 'Проверить NinjaBox'}
        </button>
      </div>

      {result && (
        <div className="host-lab-result">
          <h3>{result.ok ? `${result.hostLabel}: загрузка сработала` : `${result.hostLabel}: загрузка не подтверждена`}</h3>
          {result.directUrl && (
            <p>
              Найденная ссылка:{' '}
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
