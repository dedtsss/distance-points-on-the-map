import React, { useState } from 'react';
import { readPhoto } from './core/readPhoto.js';
import { splitBatch } from './core/batch.js';
import { cleanImageForUpload } from './core/features/cleanup/cleanImageForUpload.js';
import { formatAllPhotoResultBlocks } from './core/features/export/resultBlockFormatter.js';
import { onionBaseUrl, publishCleanImage } from './core/publisher.js';
import { hasAndroidFolderPicker, pickAndroidFolder, readAndroidPhoto } from './androidFolder.js';

const imageFiles = (files) => [...files].filter((file) => file.type.startsWith('image/'))
  .sort((left, right) => (left.webkitRelativePath || left.name).localeCompare(right.webkitRelativePath || right.name));
const errorText = (error) => error instanceof Error ? error.message : String(error);

export default function App() {
  const [files, setFiles] = useState([]);
  const [onion, setOnion] = useState('');
  const [comment, setComment] = useState('');
  const [color, setColor] = useState('');
  const [packing, setPacking] = useState('');
  const [rows, setRows] = useState([]);
  const [split, setSplit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

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

  const fileAt = (index) => files[index].native ? readAndroidPhoto(files[index]) : files[index];

  const run = async () => {
    setBusy(true);
    setRows([]);
    setSplit(null);
    const current = [];
    try {
      const destination = onion.trim() ? onionBaseUrl(onion) : null;
      for (let index = 0; index < files.length; index += 1) {
        const file = await fileAt(index);
        setStatus(`Распознавание ${index + 1}/${files.length}`);
        const read = await readPhoto(file);
        current.push({
          id: String(index + 1), number: index + 1, fileName: file.name,
          ...read, uploadResult: { providerOrder: ['onion'], links: [] },
        });
        setRows([...current]);
      }
      const resolved = splitBatch(current);
      setSplit(resolved);
      if (destination) {
        for (let index = 0; index < current.length; index += 1) {
          setStatus(`Очистка и публикация ${index + 1}/${files.length}`);
          const clean = await cleanImageForUpload(await fileAt(index), {
            orientation: current[index].orientation,
            preferredFilename: `photo-${crypto.randomUUID()}`,
          });
          if (!clean.ok) {
            current[index].publishError = clean.error;
          } else {
            try {
              const url = await publishCleanImage(clean.file, destination);
              current[index].uploadResult.links = [{ provider: 'onion', url }];
            } catch (error) { current[index].publishError = errorText(error); }
          }
          setRows([...current]);
        }
      }
      setStatus(destination ? 'Готово' : 'Обработка завершена. Укажите Onion адрес для публикации.');
    } catch (error) { setStatus(`Ошибка: ${errorText(error)}`); }
    finally { setBusy(false); }
  };

  const grouped = split ? splitBatch(rows) : null;
  const formatOptions = { description: comment, color, packing };
  const download = () => {
    const main = formatAllPhotoResultBlocks(grouped?.main || [], formatOptions);
    const reserve = formatAllPhotoResultBlocks(grouped?.reserve || [], formatOptions);
    const blob = new Blob([`Main\n\n${main}\n\nReserve\n\n${reserve}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'darkfoto-result.txt';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <main>
    <h1>DarkFoto</h1>
    <p>Выберите фотографии, проверьте распознавание и получите Main / Reserve. Исходники остаются на устройстве.</p>
    <section>
      {hasAndroidFolderPicker() && <button type="button" onClick={selectAndroidFolder} disabled={busy}>Выбрать папку Android</button>}
      <label>Папка с фото <input type="file" accept="image/*" webkitdirectory="" multiple onChange={select} disabled={busy} /></label>
      <label>Отдельные фото <input type="file" accept="image/*" multiple onChange={select} disabled={busy} /></label>
      <small>Выбрано: {files.length}</small>
    </section>
    <section>
      <label>Onion адрес для публикации <input type="url" placeholder="http://… .onion/" value={onion} onChange={(event) => setOnion(event.target.value)} disabled={busy} autoComplete="off" /></label>
      <small>Маршрут Tor/Orbot должен уже работать. Без адреса обработка остаётся локальной.</small>
      <label>Цвет <input value={color} onChange={(event) => setColor(event.target.value)} /></label>
      <label>Фасовка <input value={packing} onChange={(event) => setPacking(event.target.value)} /></label>
      <label>Комментарий <textarea value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <button type="button" onClick={run} disabled={busy || !files.length}>{busy ? 'Обработка…' : 'Обработать'}</button>
      <output aria-live="polite">{status}</output>
    </section>
    {grouped && <section>
      <h2>Main: {grouped.main.length} · Reserve: {grouped.reserve.length}</h2>
      <p>Конфликтов до разделения: {grouped.recommendation.conflictCount}. Осталось: {grouped.remainingConflicts.length}. Стратегия: {grouped.recommendation.strategy}.</p>
      {grouped.unresolved.length > 0 && <p role="alert">Требуют проверки координат: {grouped.unresolved.map((photo) => photo.fileName).join(', ')}</p>}
      <button type="button" onClick={download}>Скачать TXT</button>
      <h3>Main</h3><pre>{formatAllPhotoResultBlocks(grouped.main, formatOptions)}</pre>
      <h3>Reserve</h3><pre>{formatAllPhotoResultBlocks(grouped.reserve, formatOptions)}</pre>
    </section>}
    {rows.length > 0 && <section><h2>Проверка фото</h2><ol>{rows.map((photo) => <li key={photo.id}>
      <strong>{photo.fileName}</strong>: #{photo.indexFromOcr || 'не распознан'} · {photo.coordinates ? `${photo.coordinates.latitude}, ${photo.coordinates.longitude}` : 'координаты не найдены'} ({photo.gpsSource}, {photo.coordinateQuality})
      {photo.publishError && <p role="alert">Публикация: {photo.publishError}</p>}
      {photo.warnings.length > 0 && <small>{photo.warnings.join('; ')}</small>}
    </li>)}</ol></section>}
  </main>;
}
