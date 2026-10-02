import React, { useState } from 'react';
import { readPhoto } from './core/readPhoto.js';
import { splitBatch } from './core/batch.js';
import { cleanImageForUpload } from './core/features/cleanup/cleanImageForUpload.js';
import { formatAllPhotoResultBlocks } from './core/features/export/resultBlockFormatter.js';
import { onionBaseUrl, publishCleanImage, ninjaboxRelayUrl, publishCleanImageToNinjabox } from './core/publisher.js';
import { hasAndroidFolderPicker, pickAndroidFolder, pickAndroidPhotos, readAndroidPhoto, clearAndroidPhotoCache } from './androidFolder.js';
import { checkForUpdate, installRelease, installedVersion, isAndroidUpdateAvailable } from './update.js';
import { recognizeAndroidStamp } from './nativeOcr.js';
import { exportText, isNativeTextExport } from './androidText.js';
import { IonApp, IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonCard,
  IonCardContent, IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption,
  IonSegment, IonSegmentButton, IonBadge, IonList, IonText } from '@ionic/react';

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
          const nativeOcr = files[index].native ? await recognizeAndroidStamp(files[index]) : null;
          const file = await fileAt(index);
          const read = await readPhoto(file, {
            ...(nativeOcr ? { readOcr: async () => nativeOcr } : {}),
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
          console.info('DarkFoto recognition', { photo: index + 1, engine: read.ocrEngine, elapsedMs: read.recognitionMs });
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
  const download = async (action = 'save') => {
    const main = formatAllPhotoResultBlocks(grouped?.main || [], formatOptions);
    const reserve = formatAllPhotoResultBlocks(grouped?.reserve || [], formatOptions);
    const review = grouped?.unresolved.map((photo) => `${photo.fileName}: ${reviewLabels[photo.reviewReason] || photo.reviewReason}`).join('\n') || '';
    const text = `Основные\n\n${main}\n\nРезерв\n\n${reserve}\n\nТребует проверки\n\n${review}\n`;
    try { await exportText(text, action); setStatus('TXT готов.'); }
    catch (error) { setStatus(`TXT: ${errorText(error)}`); }
  };

  const reviewLabels = {
    coordinates_missing: 'Координаты не найдены', index_missing: 'Индекс не найден',
    index_low_confidence: 'Индекс распознан неуверенно', coordinates_low_precision: 'Недостаточная точность координат',
    coordinates_low_confidence: 'Координаты требуют проверки', low_confidence: 'Координаты распознаны неуверенно',
    batch_outlier: 'Координаты отличаются от партии', outside_expected_region: 'Координаты вне ожидаемого региона',
  };
  const reviewById = new Map((grouped?.unresolved || []).map((photo) => [photo.id, photo.reviewReason]));
  const reserveIds = new Set((grouped?.reserve || []).map((photo) => photo.id));

  return <IonApp><IonPage>
    <IonHeader><IonToolbar><IonTitle>DarkFoto</IonTitle></IonToolbar></IonHeader>
    <IonContent className="darkfoto-content">
      <div className="darkfoto-layout">
        <IonSegment value={screen} onIonChange={(event) => event.detail.value === 'about' ? showAbout() : setScreen('photos')}>
          <IonSegmentButton value="photos"><IonLabel>Фото</IonLabel></IonSegmentButton>
          <IonSegmentButton value="about"><IonLabel>О приложении</IonLabel></IonSegmentButton>
        </IonSegment>
        {screen === 'about' ? <IonCard><IonCardContent>
          <h2>О приложении / Обновление</h2>
          <p>Установлена версия: {version ? `${version.versionName} (код ${version.versionCode})` : '—'}</p>
          <p role="status">{updateStatus || 'Обновление не проверено.'}</p>
          {version && <IonButton expand="block" onClick={checkUpdate}>Проверить обновление</IonButton>}
          {candidate && <><p>Новая версия: {candidate.version}</p><IonButton expand="block" onClick={downloadUpdate}>Скачать / Установить</IonButton></>}
        </IonCardContent></IonCard> : <>
          <p className="intro">Выберите фотографии и получите Основные / Резерв. Исходники остаются на устройстве.</p>
          <IonCard><IonCardContent>
            <h2>Фотографии</h2>
            {hasAndroidFolderPicker() ? <div className="action-row">
              <IonButton expand="block" fill="outline" onClick={selectAndroidPhotos} disabled={busy}>Выбрать фото</IonButton>
              <IonButton expand="block" fill="outline" onClick={selectAndroidFolder} disabled={busy}>Выбрать папку</IonButton>
            </div> : <div className="web-pickers">
              <label>Отдельные фото<input type="file" accept="image/*" multiple onChange={select} disabled={busy} /></label>
              <label>Папка с фото<input type="file" accept="image/*" webkitdirectory="" multiple onChange={select} disabled={busy} /></label>
            </div>}
            <p>Выбрано: {files.length}</p>
          </IonCardContent></IonCard>
          <IonCard><IonCardContent>
            <IonList lines="inset">
              <IonItem><IonSelect label="Публикация" labelPlacement="stacked" value={publisher}
                onIonChange={(event) => setPublisher(event.detail.value)} disabled={busy}>
                <IonSelectOption value="none">Только локально</IonSelectOption>
                <IonSelectOption value="onion">Onion</IonSelectOption>
                <IonSelectOption value="ninjabox">NinjaBox</IonSelectOption>
              </IonSelect></IonItem>
              {publisher === 'onion' && <IonItem><IonInput label="Onion адрес" labelPlacement="stacked" type="url"
                value={onion} onIonInput={(event) => setOnion(event.detail.value || '')} disabled={busy} /></IonItem>}
              {publisher === 'ninjabox' && <IonItem><IonInput label="NinjaBox relay HTTPS" labelPlacement="stacked" type="url"
                value={ninjaboxRelay} onIonInput={(event) => setNinjaboxRelay(event.detail.value || '')} disabled={busy} /></IonItem>}
              <IonItem><IonInput label="Цвет" labelPlacement="stacked" value={color}
                onIonInput={(event) => setColor(event.detail.value || '')} /></IonItem>
              <IonItem><IonInput label="Фасовка" labelPlacement="stacked" value={packing}
                onIonInput={(event) => setPacking(event.detail.value || '')} /></IonItem>
              <IonItem><IonTextarea label="Комментарий" labelPlacement="stacked" value={comment}
                onIonInput={(event) => setComment(event.detail.value || '')} /></IonItem>
            </IonList>
            <IonButton className="primary-action" expand="block" onClick={run} disabled={busy || !files.length}>
              {busy ? 'Обработка…' : 'Обработать фото'}
            </IonButton>
            <IonText><p role="status" aria-live="polite">{status}</p></IonText>
          </IonCardContent></IonCard>
          {grouped && <IonCard><IonCardContent>
            <h2>Результат</h2>
            <div className="counts">
              <IonBadge color="success">Основные {grouped.main.length}</IonBadge>
              <IonBadge color="warning">Резерв {grouped.reserve.length}</IonBadge>
              <IonBadge color="danger">Требует проверки {grouped.unresolved.length}</IonBadge>
            </div>
            <div className="action-row"><IonButton expand="block" fill="outline" onClick={() => download('save')}>Сохранить TXT</IonButton>
              {isNativeTextExport() && <IonButton expand="block" fill="outline" onClick={() => download('share')}>Поделиться TXT</IonButton>}</div>
          </IonCardContent></IonCard>}
          {rows.length > 0 && <IonCard><IonCardContent><h2>Фотографии</h2><IonList lines="full">
            {rows.map((photo) => <IonItem key={photo.id}><IonLabel className="photo-result">
              <strong>{photo.fileName}</strong>
              <span>#{photo.indexFromOcr || '—'} · {photo.coordinates
                ? `${photo.coordinates.latitude}, ${photo.coordinates.longitude}` : 'координаты не найдены'}</span>
              <span>{reviewById.has(photo.id) ? `Требует проверки: ${reviewLabels[reviewById.get(photo.id)] || reviewById.get(photo.id)}`
                : !grouped ? 'Распознано' : reserveIds.has(photo.id) ? 'Резерв' : 'Основное'}</span>
              {photo.uploadResult?.links?.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.provider}: {link.url}</a>)}
              {photo.publishError && <span role="alert">Публикация: {photo.publishError}</span>}
            </IonLabel></IonItem>)}
          </IonList></IonCardContent></IonCard>}
        </>}
      </div>
    </IonContent>
  </IonPage></IonApp>;
}
