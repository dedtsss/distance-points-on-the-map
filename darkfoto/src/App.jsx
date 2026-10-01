import React, { useState } from 'react';
import { readPhoto } from './core/readPhoto.js';
import { splitBatch } from './core/batch.js';
import { cleanImageForUpload } from './core/features/cleanup/cleanImageForUpload.js';
import { formatAllPhotoResultBlocks } from './core/features/export/resultBlockFormatter.js';
import { onionBaseUrl, publishCleanImage, ninjaboxRelayUrl, publishCleanImageToNinjabox } from './core/publisher.js';
import { hasAndroidFolderPicker, pickAndroidFolder, pickAndroidPhotos, readAndroidPhoto, clearAndroidPhotoCache } from './androidFolder.js';
import { checkForUpdate, installRelease, installedVersion, isAndroidUpdateAvailable } from './update.js';

const imageFiles = (files) => [...files].filter((file) => file.type.startsWith('image/'))
  .sort((left, right) => (left.webkitRelativePath || left.name).localeCompare(right.webkitRelativePath || right.name));
const errorText = (error) => error instanceof Error ? error.message : String(error);

export default function App() {
  const [files, setFiles] = useState([]);
  const [onion, setOnion] = useState('');
  const [publisher, setPublisher] = useState('none');
  const [ninjaboxRelay, setNinjaboxRelay] = useState(import.meta.env.VITE_NINJABOX_RELAY_URL || '');
  const [screen, setScreen] = useState('photos');
  const [version, setVersion] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('');
  const [comment, setComment] = useState('');
  const [color, setColor] = useState('');
  const [packing, setPacking] = useState('');
  const [rows, setRows] = useState([]);
  const [split, setSplit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const showAbout = async () => {
    setScreen('about');
    if (!isAndroidUpdateAvailable()) { setUpdateStatus('Обновление доступно в Android-приложении.'); return; }
    try { setVersion(await installedVersion()); }
    catch (error) { setUpdateStatus(errorText(error)); }
  };

  const checkUpdate = async () => {
    setUpdateStatus('Проверка обновлений…');
    try {
      const next = await checkForUpdate(version.versionName);
      setCandidate(next);
      setUpdateStatus(next ? `Доступна версия ${next.version}` : 'Обновлений нет.');
    } catch (error) { setUpdateStatus(`Проверка не удалась: ${errorText(error)}`); }
  };

  const downloadUpdate = async () => {
    setUpdateStatus('Загрузка и проверка APK…');
    try {
      const result = await installRelease(candidate);
      setUpdateStatus(result.permissionRequired
        ? 'Разрешите установку из DarkFoto в Android, затем нажмите «Скачать / Установить» снова.'
        : 'APK проверен. Подтвердите установку в Android.');
    } catch (error) { setUpdateStatus(`Обновление отклонено: ${errorText(error)}`); }
  };

  const select = (event) => {
    setFiles(imageFiles(event.target.files || []));
    setRows([]);
    setSplit(null);
  };

  const selectAndroidFolder = async () => {
    try {
      setFiles(await pickAndroidFolder());
      setRows([]);
      setSplit(null);
    } catch (error) { setStatus(`Папка: ${errorText(error)}`); }
  };

  const selectAndroidPhotos = async () => {
    try {
      setFiles(await pickAndroidPhotos());
      setRows([]);
      setSplit(null);
    } catch (error) { setStatus(`Фото: ${errorText(error)}`); }
  };

  const fileAt = (index) => files[index].native ? readAndroidPhoto(files[index]) : files[index];

  const run = async () => {
    setBusy(true);
    setRows([]);
    setSplit(null);
    const current = [];
    try {
      const destination = publisher === 'onion' ? onionBaseUrl(onion)
        : publisher === 'ninjabox' ? ninjaboxRelayUrl(ninjaboxRelay) : null;
      for (let index = 0; index < files.length; index += 1) {
        setStatus(`Распознавание ${index + 1}/${files.length}`);
        try {
          const file = await fileAt(index);
          const read = await readPhoto(file, {
            onProgress: ({ status: ocrStatus, progress }) => {
              const percent = Number.isFinite(progress) ? ` ${Math.round(progress * 100)}%` : '';
              const stage = String(ocrStatus || 'ocr')
                .replace('ocr:initializing', 'OCR запуск')
                .replace('ocr:ready', 'OCR готов')
                .replace('loading tesseract core', 'ядро OCR')
                .replace('initializing tesseract', 'инициализация OCR')
                .replace('loading language traineddata', 'язык OCR')
                .replace('initializing api', 'OCR API')
                .replace('recognizing text', 'распознавание');
              setStatus(`Распознавание ${index + 1}/${files.length} · ${stage}${percent}`);
            },
          });
          current.push({
            id: String(index + 1), number: index + 1, fileName: file.name,
            ...read, uploadResult: { providerOrder: [publisher], links: [] },
          });
        } catch (error) {
          current.push({
            id: String(index + 1), number: index + 1, fileName: files[index].name,
            coordinates: null, indexFromOcr: null, indexStatus: 'missing',
            gpsStatus: 'missing', coordinateQuality: 'missing', gpsSource: 'missing',
            warnings: [`photo_error: ${errorText(error)}`], uploadResult: { providerOrder: [publisher], links: [] },
          });
        }
        setRows([...current]);
      }
      const resolved = splitBatch(current);
      setSplit(resolved);
      if (destination) {
        for (let index = 0; index < current.length; index += 1) {
          if (resolved.unresolved.some((photo) => photo.id === current[index].id)) continue;
          setStatus(`Очистка и публикация ${index + 1}/${files.length}`);
          try {
            const clean = await cleanImageForUpload(await fileAt(index), {
              orientation: current[index].orientation,
              preferredFilename: `photo-${crypto.randomUUID()}`,
            });
            if (!clean.ok) throw new Error(clean.error);
            const url = publisher === 'onion'
              ? await publishCleanImage(clean.file, destination)
              : await publishCleanImageToNinjabox(clean.file, destination);
            current[index].uploadResult.links = [{ provider: publisher, url }];
          } catch (error) { current[index].publishError = errorText(error); }
          setRows([...current]);
        }
      }
      setStatus('Обработка завершена.');
    } catch (error) { setStatus(`Ошибка: ${errorText(error)}`); }
    finally {
      if (hasAndroidFolderPicker()) {
        try { await clearAndroidPhotoCache(); } catch { /* Android cache is also cleared on plugin destroy. */ }
      }
      setBusy(false);
    }
  };

  const grouped = split ? splitBatch(rows) : null;
  const formatOptions = { description: comment, color, packing };
  const download = () => {
    const main = formatAllPhotoResultBlocks(grouped?.main || [], formatOptions);
    const reserve = formatAllPhotoResultBlocks(grouped?.reserve || [], formatOptions);
    const review = grouped?.unresolved.map((photo) => photo.fileName).join('\n') || '';
    const blob = new Blob([`Main\n\n${main}\n\nReserve\n\n${reserve}\n\nNeeds review / Error\n\n${review}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'darkfoto-result.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <main>
    <h1>DarkFoto</h1>
    <nav><button type="button" onClick={() => setScreen('photos')}>Фото</button>{' '}
      <button type="button" onClick={showAbout}>О приложении / Обновление</button></nav>
    {screen === 'about' ? <section>
      <h2>О приложении</h2>
      <p>DarkFoto</p>
      <p>Установлена версия: {version ? `${version.versionName} (код ${version.versionCode})` : '—'}</p>
      <p role="status">{updateStatus || 'Обновление не проверено.'}</p>
      {version && <button type="button" onClick={checkUpdate}>Проверить обновление</button>}
      {candidate && <p>Новая версия: {candidate.version} <button type="button" onClick={downloadUpdate}>Скачать / Установить</button></p>}
    </section> : <>
    <p>Выберите фотографии, проверьте распознавание и получите Main / Reserve. Исходники остаются на устройстве.</p>
    <section>
      {hasAndroidFolderPicker() && <button type="button" onClick={selectAndroidFolder} disabled={busy}>Выбрать папку Android</button>}
      {hasAndroidFolderPicker() && <button type="button" onClick={selectAndroidPhotos} disabled={busy}>Выбрать фото Android</button>}
      {!hasAndroidFolderPicker() && <><label>Папка с фото <input type="file" accept="image/*" webkitdirectory="" multiple onChange={select} disabled={busy} /></label>
        <label>Отдельные фото <input type="file" accept="image/*" multiple onChange={select} disabled={busy} /></label></>}
      <small>Выбрано: {files.length}</small>
    </section>
    <section>
      <label>Публикация <select value={publisher} onChange={(event) => setPublisher(event.target.value)} disabled={busy}>
        <option value="none">Только локально</option><option value="onion">Onion</option><option value="ninjabox">NinjaBox</option>
      </select></label>
      {publisher === 'onion' && <><label>Onion адрес <input type="url" placeholder="http://… .onion/" value={onion} onChange={(event) => setOnion(event.target.value)} disabled={busy} autoComplete="off" /></label>
        <small>Маршрут Tor/Orbot должен уже работать. Ошибка соединения не переключает сервис.</small></>}
      {publisher === 'ninjabox' && <><label>NinjaBox relay HTTPS <input type="url" placeholder="https://…/v1/ninjabox" value={ninjaboxRelay} onChange={(event) => setNinjaboxRelay(event.target.value)} disabled={busy} autoComplete="off" /></label>
        <small>Публичный внешний хост. Отправляются только очищенные JPEG-копии.</small></>}
      <label>Цвет <input value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <label>Фасовка <input value={packing} onChange={(event) => setPacking(event.target.value)} /></label>
      <label>Комментарий <textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <button type="button" onClick={run} disabled={busy || !files.length}>{busy ? 'Обработка…' : 'Обработать'}</button>
      <output aria-live="polite">{status}</output>
    </section>
    {grouped && <section>
      <h2>Main: {grouped.main.length} · Reserve: {grouped.reserve.length} · Needs review / Error: {grouped.unresolved.length}</h2>
      <p>Конфликтов до разделения: {grouped.recommendation.conflictCount}. Осталось: {grouped.remainingConflicts.length}. Стратегия: {grouped.recommendation.strategy}.</p>
      {grouped.unresolved.length > 0 && <p role="alert">Требуют проверки индекса или координат: {grouped.unresolved.map((photo) => photo.fileName).join(', ')}</p>}
      <button type="button" onClick={download}>Скачать TXT</button>
      <h3>Main</h3><pre>{formatAllPhotoResultBlocks(grouped.main, formatOptions)}</pre>
      <h3>Reserve</h3><pre>{formatAllPhotoResultBlocks(grouped.reserve, formatOptions)}</pre>
    </section>}
    {rows.length > 0 && <section><h2>Проверка фото</h2><ol>{rows.map((photo) => <li key={photo.id}>
      <strong>{photo.fileName}</strong>: #{photo.indexFromOcr || 'не распознан'} · {photo.coordinates ? `${photo.coordinates.latitude}, ${photo.coordinates.longitude}` : 'координаты не найдены'} ({photo.gpsSource}, {photo.coordinateQuality})
      {photo.uploadResult?.links?.map((link) => <p key={link.url}><a href={link.url} target="_blank" rel="noreferrer">{link.provider}: {link.url}</a></p>)}
      {photo.publishError && <p role="alert">Публикация: {photo.publishError}</p>}
      {photo.warnings.length > 0 && <small>{photo.warnings.join('; ')}</small>}
    </li>)}</ol></section>}
  </>}
  </main>;
}
