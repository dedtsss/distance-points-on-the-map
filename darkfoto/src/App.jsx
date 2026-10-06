import React, { useEffect, useRef, useState } from 'react';
import { readPhoto } from './core/readPhoto.js';
import { splitBatch } from './core/batch.js';
import { buildResultText } from './resultSummary.js';
import { DEFAULT_NINJABOX_RELAY_URL, onionBaseUrl, ninjaboxRelayUrl } from './core/publisher.js';
import { outgoingName, publishBatch } from './publishBatch.js';
import { buildGpx, resultBlocksForCopy, validResultPhotos } from './resultExports.js';
import { cleanImageForUpload } from './core/features/cleanup/cleanImageForUpload.js';
import { formatPhotoResultBlock } from './core/features/export/resultBlockFormatter.js';
import { hasAndroidFolderPicker, pickAndroidFolder, pickAndroidPhotos, readAndroidPhoto, clearAndroidPhotoCache,
  saveAndroidRecovery, loadAndroidRecovery, clearAndroidRecovery } from './androidFolder.js';
import { checkForUpdate, clearUpdateState, installRelease, installedVersion, isAndroidUpdateAvailable, startUpdateDownload, updateState } from './update.js';
import { actionProgress, updateButton, updateProgress } from './progress.js';
import { recognizeAndroidStamp } from './nativeOcr.js';
import { copyResultBlocks, copyText, exportGpx, exportText, isNativeTextExport } from './androidText.js';
import { IonApp, IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonCard,
  IonCardContent, IonItem, IonLabel, IonInput, IonTextarea, IonSelect, IonSelectOption,
  IonSegment, IonSegmentButton, IonBadge, IonList, IonText, IonModal, IonProgressBar, IonFooter } from '@ionic/react';
import PhotoViewer from './PhotoViewer.jsx';

const imageFiles = (files) => [...files].filter((file) => file.type.startsWith('image/'))
  .sort((left, right) => (left.webkitRelativePath || left.name).localeCompare(right.webkitRelativePath || right.name));
const errorText = (error) => error instanceof Error ? error.message : String(error);
const WorkProgress = ({ progress }) => progress && <div className="progress-area" role="status" aria-live="polite">
  <span>{progress.label}{progress.itemPercent !== null
    ? ` · ${progress.itemPercent}% ${progress.kind === 'ninjabox' ? 'загрузки' : 'текущего фото'}` : ''}</span>
  <IonProgressBar type={progress.type} value={progress.value} buffer={progress.buffer}
    aria-label={progress.label} />
</div>;

export default function App() {
  const [files, setFiles] = useState([]);
  const [onion, setOnion] = useState('');
  const [publisher, setPublisher] = useState('none');
  const ninjaboxRelay = import.meta.env.VITE_NINJABOX_RELAY_URL || DEFAULT_NINJABOX_RELAY_URL;
  const [screen, setScreen] = useState('photos');
  const [version, setVersion] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('');
  const [nativeUpdate, setNativeUpdate] = useState(null);
  const [session, setSession] = useState('');
  const [comment, setComment] = useState('');
  const [color, setColor] = useState('');
  const [packing, setPacking] = useState('');
  const [rows, setRows] = useState([]);
  const [split, setSplit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [txtOpen, setTxtOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [copyBusy, setCopyBusy] = useState(false);
  const [workProgress, setWorkProgress] = useState(null);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [previews, setPreviews] = useState({});
  const previewsRef = useRef({});
  const restoredRef = useRef(false);
  const [viewer, setViewer] = useState(null);

  const rememberPreview = (id, file) => {
    const old = previewsRef.current[id];
    if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(file);
    previewsRef.current[id] = url;
    setPreviews({ ...previewsRef.current });
  };
  const clearPreviews = () => {
    Object.values(previewsRef.current).forEach((url) => URL.revokeObjectURL(url));
    previewsRef.current = {};
    setPreviews({});
  };
  useEffect(() => () => Object.values(previewsRef.current).forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    let active = true;
    loadAndroidRecovery().then(async (saved) => {
      if (!saved || !active) return;
      setFiles(saved.files);
      restoredRef.current = true;
      setRows(saved.rows);
      setSplit(splitBatch(saved.rows));
      setPublisher(saved.publisher);
      setOnion(saved.onion || '');
      setSession(saved.session || '');
      setComment(saved.comment || '');
      setColor(saved.color || '');
      setPacking(saved.packing || '');
      setResumeAvailable(true);
      const completed = saved.rows.filter((row) => row.uploadResult?.links?.some((link) => link.provider === saved.publisher)).length;
      setStatus(`${completed} из ${saved.rows.length} готовы · продолжить с ${Math.min(completed + 1, saved.rows.length)}-й`);
      for (const [index, row] of saved.rows.entries()) {
        if (!active) break;
        try {
          const file = await readAndroidPhoto(saved.files[index]);
          const cleaned = await cleanImageForUpload(file, { orientation: row.orientation,
            preferredFilename: outgoingName(row, index + 1) });
          if (active) rememberPreview(row.id, cleaned.ok ? cleaned.file : file);
        } catch { /* A missing preview does not hide the recovered link. */ }
      }
    }).catch((error) => { if (active) setStatus(`Восстановление: ${errorText(error)}`); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (screen !== 'about' || !isAndroidUpdateAvailable()) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const state = await updateState();
        if (!active) return;
        setNativeUpdate(state);
        if (state.state === 'ready_to_install')
          setUpdateStatus((current) => current.includes('Разрешите установку') ? '' : current);
        if (state.state === 'failed') setUpdateStatus('');
        setCandidate(state.url && state.version
          ? { version: state.version, url: state.url, sha256: state.sha256 } : null);
      } catch (error) { if (active) setUpdateStatus(errorText(error)); }
    };
    poll();
    const timer = setInterval(() => { if (!document.hidden) poll(); }, 1000);
    const resume = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', resume);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [screen]);

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
      setNativeUpdate(await (next ? updateState(next) : clearUpdateState()));
      setUpdateStatus(next ? '' : 'Обновлений нет.');
    } catch (error) { setUpdateStatus(`Проверка не удалась: ${errorText(error)}`); }
  };

  const downloadUpdate = async () => {
    setUpdateStatus('');
    try {
      const current = await updateState(candidate);
      const result = ['ready_to_install', 'permission_required'].includes(current.state)
        ? await installRelease() : await startUpdateDownload(candidate);
      setNativeUpdate(result);
      if (result.state === 'permission_required') setUpdateStatus('Разрешите установку из DarkFoto в Android. APK сохранён.');
      else if (result.state === 'ready_to_install') setUpdateStatus('APK проверен. Подтвердите установку в Android.');
    } catch (error) { setUpdateStatus(`Обновление отклонено: ${errorText(error)}`); }
  };

  const select = (event) => {
    clearPreviews();
    restoredRef.current = false;
    setFiles(imageFiles(event.target.files || []));
    setRows([]);
    setSplit(null);
    setResumeAvailable(false);
  };

  const selectAndroidFolder = async () => {
    try {
      const picked = await pickAndroidFolder();
      await clearAndroidRecovery();
      clearPreviews();
      setFiles(picked);
      restoredRef.current = false;
      setRows([]);
      setSplit(null);
      setResumeAvailable(false);
    } catch (error) { setStatus(`Папка: ${errorText(error)}`); }
  };

  const selectAndroidPhotos = async () => {
    try {
      const picked = await pickAndroidPhotos();
      await clearAndroidRecovery();
      clearPreviews();
      setFiles(picked);
      restoredRef.current = false;
      setRows([]);
      setSplit(null);
      setResumeAvailable(false);
    } catch (error) { setStatus(`Фото: ${errorText(error)}`); }
  };

  const fileAt = (index) => files[index].native ? readAndroidPhoto(files[index]) : files[index];

  const recoveryState = (current) => ({
    files: files.map(({ id, name, type, size, native }) => ({ id, name, type, size, native })),
    rows: current, publisher, onion, session, comment, color, packing,
  });

  useEffect(() => {
    if (!resumeAvailable || busy || !files.length || files.length !== rows.length) return undefined;
    const timer = setTimeout(() => {
      saveAndroidRecovery(recoveryState(rows)).catch((error) => setStatus(`Сохранение состояния: ${errorText(error)}`));
    }, 300);
    return () => clearTimeout(timer);
  }, [resumeAvailable, busy, files, rows, publisher, onion, session, comment, color, packing]);

  const publishCurrent = async (current, destination, includePhotos) => {
    await saveAndroidRecovery(recoveryState(current), includePhotos);
    setResumeAvailable(true);
    const publication = await publishBatch(current, new Set(splitBatch(current).unresolved.map((photo) => photo.id)), {
      publisher, destination, fileAt, onStatus: setStatus,
      onCleaned: (row, cleaned) => rememberPreview(row.id, cleaned),
      onRows: async (updated) => {
        await saveAndroidRecovery(recoveryState(updated));
        setRows(updated);
      },
      onProgress: (stage, completed, total, fraction) =>
        setWorkProgress(actionProgress(stage, completed, total, fraction)),
    });
    const completed = current.filter((row) => row.uploadResult?.links?.some((link) => link.provider === publisher)).length;
    if (completed === current.length) {
      await clearAndroidRecovery();
      setResumeAvailable(false);
      if (restoredRef.current) setFiles([]);
    }
    setStatus(publication.failures
      ? `Готово ${completed} из ${current.length}. Ошибок публикации: ${publication.failures}.${publication.stopped ? ' NinjaBox остановлен.' : ''}`
      : completed === current.length ? 'Обработка завершена.' : `Готово ${completed} из ${current.length}. Можно продолжить публикацию.`);
  };

  const resumePublication = async () => {
    setBusy(true);
    try {
      const destination = publisher === 'onion' ? onionBaseUrl(onion) : ninjaboxRelayUrl(ninjaboxRelay);
      await publishCurrent([...rows], destination, false);
    } catch (error) { setStatus(`Продолжение: ${errorText(error)}`); }
    finally { setBusy(false); setWorkProgress(null); }
  };

  const run = async () => {
    setBusy(true);
    setRows([]);
    setSplit(null);
    clearPreviews();
    const current = [];
    try {
      const destination = publisher === 'onion' ? onionBaseUrl(onion)
        : publisher === 'ninjabox' ? ninjaboxRelayUrl(ninjaboxRelay) : null;
      for (let index = 0; index < files.length; index += 1) {
        setStatus(`Распознавание ${index + 1}/${files.length}`);
        setWorkProgress(actionProgress('recognition', index, files.length));
        try {
          const nativeOcr = files[index].native ? await recognizeAndroidStamp(files[index]) : null;
          const file = await fileAt(index);
          rememberPreview(String(index + 1), file);
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
        setWorkProgress(actionProgress('recognition', index + 1, files.length));
      }
      const resolved = splitBatch(current);
      setSplit(resolved);
      if (destination) {
        await publishCurrent(current, destination, true);
      } else {
        setStatus('Обработка завершена.');
      }
    } catch (error) { setStatus(`Ошибка: ${errorText(error)}`); }
    finally {
      if (hasAndroidFolderPicker()) {
        try { await clearAndroidPhotoCache(); } catch { /* Android cache is also cleared on plugin destroy. */ }
      }
      setBusy(false);
      setWorkProgress(null);
    }
  };

  const reviewLabels = {
    coordinates_missing: 'Координаты не найдены', index_missing: 'Индекс не найден',
    index_low_confidence: 'Индекс распознан неуверенно', coordinates_low_precision: 'Недостаточная точность координат',
    coordinates_low_confidence: 'Координаты требуют проверки', low_confidence: 'Координаты распознаны неуверенно',
    batch_outlier: 'Координаты отличаются от партии', outside_expected_region: 'Координаты вне ожидаемого региона',
  };
  const grouped = split ? splitBatch(rows) : null;
  const normalizedSession = session.trim();
  const formatOptions = { description: comment, color, packing, session: normalizedSession };
  const validPhotos = validResultPhotos(grouped);
  const mainBlocks = resultBlocksForCopy({ main: grouped?.main, reserve: [] }, formatOptions);
  const reserveBlocks = resultBlocksForCopy({ main: [], reserve: grouped?.reserve }, formatOptions);
  const txtText = grouped ? buildResultText({
    grouped, formatOptions, session: normalizedSession, reviewLabels,
  }) : '';
  const download = async (action = 'save') => {
    try { await exportText(txtText, action, normalizedSession); setStatus('TXT готов.'); }
    catch (error) { setStatus(`TXT: ${errorText(error)}`); }
  };
  const copyPreview = async () => {
    try {
      await copyText(txtText);
      setCopyStatus('Скопировано.');
    } catch (error) { setCopyStatus(`Не удалось скопировать: ${errorText(error)}`); }
  };
  const copyBlocks = async (blocks, label) => {
    setCopyBusy(true);
    setWorkProgress(actionProgress('clipboard', 0, blocks.length));
    setCopyStatus(`${label}: 0/${blocks.length}`);
    try {
      const count = await copyResultBlocks(blocks,
        (copied, total) => {
          setCopyStatus(`${label}: ${copied}/${total}`);
          setWorkProgress(actionProgress('clipboard', copied, total));
        });
      setCopyStatus(`${label}: скопировано ${count}. История буфера зависит от клавиатуры.`);
    } catch (error) { setCopyStatus(`Не удалось скопировать блоки: ${errorText(error)}`); }
    finally { setCopyBusy(false); setWorkProgress(null); }
  };
  const copyOne = async (photo) => {
    try {
      await copyText(formatPhotoResultBlock(photo, formatOptions));
      setCopyStatus(`Скопирован блок #${photo.indexFromOcr}`);
    } catch (error) { setCopyStatus(`Не удалось скопировать: ${errorText(error)}`); }
  };
  const gpx = async (action) => {
    try {
      await exportGpx(buildGpx(grouped, normalizedSession), action, normalizedSession);
      setStatus('GPX готов.');
    } catch (error) { setStatus(`GPX: ${errorText(error)}`); }
  };
  const validById = new Map(validPhotos.map((photo) => [photo.id, photo]));
  const reviewById = new Map((grouped?.unresolved || []).map((photo) => [photo.id, photo.reviewReason]));
  const reserveIds = new Set((grouped?.reserve || []).map((photo) => photo.id));
  const photoStatus = (photo) => reviewById.has(photo.id)
    ? { kind: 'review', text: `Требует проверки: ${reviewLabels[reviewById.get(photo.id)] || reviewById.get(photo.id)}` }
    : !grouped ? { kind: 'recognized', text: 'Распознано' }
      : reserveIds.has(photo.id) ? { kind: 'reserve', text: 'Резерв' }
        : { kind: 'main', text: 'Основное' };
  const updateBar = updateProgress(nativeUpdate);
  const updateAction = updateButton(nativeUpdate?.state, candidate?.version);
  const nativeStatus = {
    idle: candidate ? `Доступна версия ${candidate.version}` : 'Обновление не проверено.',
    downloading: 'Загрузка обновления', paused: 'Загрузка приостановлена Android; ожидается возобновление',
    completed: 'Загрузка завершена. Проверка APK…', verifying: 'Проверка APK…',
    ready_to_install: 'APK проверен и готов к установке.',
    permission_required: 'APK проверен. Разрешите установку из DarkFoto.',
    failed: nativeUpdate?.error || 'Загрузка не удалась.',
  }[nativeUpdate?.state];

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
          <p role="status">{updateStatus || nativeStatus || 'Обновление не проверено.'}</p>
          {updateBar?.active && <div className="progress-area" role="status" aria-label="Загрузка обновления">
            <span>{updateBar.label}</span>
            <IonProgressBar type={updateBar.type} value={updateBar.value} aria-label={updateBar.label} />
          </div>}
          {version && <IonButton expand="block" onClick={checkUpdate}>Проверить обновление</IonButton>}
          {candidate && <><p>Новая версия: {candidate.version}</p>
            {updateAction && <IonButton expand="block" onClick={downloadUpdate}>{updateAction}</IonButton>}</>}
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
                interface="action-sheet" interfaceOptions={{ header: 'Публикация', cssClass: 'publication-sheet' }}
                onIonChange={(event) => setPublisher(event.detail.value)} disabled={busy || resumeAvailable}>
                <IonSelectOption value="none">Только локально</IonSelectOption>
                <IonSelectOption value="onion">Onion</IonSelectOption>
                <IonSelectOption value="ninjabox">NinjaBox</IonSelectOption>
              </IonSelect></IonItem>
              {publisher === 'onion' && <IonItem><IonInput label="Onion адрес" labelPlacement="stacked" type="url"
                value={onion} onIonInput={(event) => setOnion(event.detail.value || '')} disabled={busy || resumeAvailable} /></IonItem>}
              {publisher === 'ninjabox' && <IonItem><IonLabel className="publisher-note">
                NinjaBox: публичная публикация через встроенный relay. Для анонимного режима используйте Onion.
              </IonLabel></IonItem>}
              <IonItem><IonInput label="Сессия" labelPlacement="stacked" value={session}
                placeholder="Например 17 или Север-2" onIonInput={(event) => setSession(event.detail.value || '')} /></IonItem>
              <IonItem><IonInput label="Цвет" labelPlacement="stacked" value={color}
                onIonInput={(event) => setColor(event.detail.value || '')} /></IonItem>
              <IonItem><IonInput label="Фасовка" labelPlacement="stacked" value={packing}
                onIonInput={(event) => setPacking(event.detail.value || '')} /></IonItem>
              <IonItem><IonTextarea label="Комментарий" labelPlacement="stacked" value={comment}
                onIonInput={(event) => setComment(event.detail.value || '')} /></IonItem>
            </IonList>
            <IonButton className="primary-action" expand="block"
              onClick={resumeAvailable ? resumePublication : run} disabled={busy || !files.length}>
              {busy ? 'Обработка…' : resumeAvailable ? 'Продолжить публикацию' : 'Обработать фото'}
            </IonButton>
            <IonText><p role="status" aria-live="polite">{status}</p></IonText>
            {workProgress?.kind !== 'clipboard' && <WorkProgress progress={workProgress} />}
          </IonCardContent></IonCard>
          {grouped && <IonCard><IonCardContent>
            <h2>Результат</h2>
            {normalizedSession && <p className="session-summary">Сессия: <strong>{normalizedSession}</strong></p>}
            <div className="counts">
              <IonBadge color="success">Основные {grouped.main.length}</IonBadge>
              <IonBadge color="warning">Резерв {grouped.reserve.length}</IonBadge>
              <IonBadge color="danger">Требует проверки {grouped.unresolved.length}</IonBadge>
            </div>
            <div className="export-groups">
              <div><strong>TXT</strong><div className="compact-actions">
                <IonButton fill="clear" onClick={() => { setCopyStatus(''); setTxtOpen(true); }}>Посмотреть</IonButton>
                <IonButton fill="clear" onClick={() => download('save')}>Сохранить</IonButton>
                {isNativeTextExport() && <IonButton fill="clear" onClick={() => download('share')}>Поделиться</IonButton>}
              </div></div>
              <div><strong>GPX</strong><div className="compact-actions">
                <IonButton fill="clear" onClick={() => gpx('save')} disabled={!validPhotos.length}>Экспорт</IonButton>
                {isNativeTextExport() && <IonButton fill="clear" onClick={() => gpx('share')}
                  disabled={!validPhotos.length}>Поделиться</IonButton>}
              </div></div>
            </div>
            <p className="copy-explanation">Каждый блок копируется автоматически отдельным событием буфера обмена.</p>
            <div className="group-copy-actions">
              <IonButton fill="outline" onClick={() => copyBlocks(mainBlocks, 'Основные')}
                disabled={!mainBlocks.length || copyBusy}>Копировать основные по одному</IonButton>
              <IonButton fill="outline" onClick={() => copyBlocks(reserveBlocks, 'Резерв')}
                disabled={!reserveBlocks.length || copyBusy}>Копировать резерв по одному</IonButton>
            </div>
            {copyStatus && <IonText><p role="status" aria-live="polite">{copyStatus}</p></IonText>}
            {workProgress?.kind === 'clipboard' && <WorkProgress progress={workProgress} />}
          </IonCardContent></IonCard>}
          {rows.length > 0 && <IonCard><IonCardContent><h2>Фотографии</h2><div className="result-photo-list">
            {rows.map((photo) => {
              const state = photoStatus(photo);
              return <article key={photo.id} className="result-photo-card">
                <button type="button" className="photo-thumbnail" onClick={() => setViewer(photo.id)}
                  disabled={!previews[photo.id]} aria-label={`Открыть фото ${photo.indexFromOcr || photo.fileName}`}>
                  {previews[photo.id] && <img src={previews[photo.id]} alt="" />}
                </button>
                <div className="photo-detail">
                  <strong className="photo-identity">{photo.indexFromOcr ? `#${photo.indexFromOcr}` : `Фото ${photo.number}`}</strong>
                  <span className="photo-filename">{photo.fileName}</span>
                  <span className="photo-coordinates">{photo.coordinates
                    ? `${photo.coordinates.latitude}, ${photo.coordinates.longitude}` : 'Координаты не найдены'}</span>
                  <span className={`photo-state photo-state-${state.kind}`}>{state.text}</span>
                  {photo.uploadResult?.links?.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.provider}: открыть ссылку</a>)}
                  {photo.publishError && <span role="alert">Публикация: {photo.publishError}</span>}
                  {validById.has(photo.id) && <IonButton size="small" fill="clear"
                    onClick={() => copyOne(validById.get(photo.id))}>Копировать блок</IonButton>}
                </div>
              </article>;
            })}
          </div></IonCardContent></IonCard>}
        </>}
      </div>
    </IonContent>
    <IonModal isOpen={txtOpen} onDidDismiss={() => setTxtOpen(false)}>
      <IonHeader><IonToolbar><IonTitle>TXT результат</IonTitle></IonToolbar></IonHeader>
      <IonContent className="txt-modal-content">
        <div className="txt-preview-wrap">
          <pre className="txt-preview" aria-label="TXT результат">{txtText}</pre>
        </div>
      </IonContent>
      <IonFooter><IonToolbar className="txt-actions"><div className="action-row">
        <IonButton onClick={copyPreview}>Копировать</IonButton>
        <IonButton fill="outline" onClick={() => setTxtOpen(false)}>Закрыть</IonButton>
      </div>{copyStatus && <span role="status">{copyStatus}</span>}</IonToolbar></IonFooter>
    </IonModal>
    <PhotoViewer src={viewer ? previews[viewer] : null} open={!!viewer} onClose={() => setViewer(null)} />
  </IonPage></IonApp>;
}
