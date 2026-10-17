import React, { useEffect, useRef, useState } from 'react';
import { IonButton, IonContent, IonFooter, IonHeader, IonItem, IonLabel, IonList, IonModal, IonSearchbar, IonTitle, IonToolbar } from '@ionic/react';
import { pointMembers } from './core/photoPoints.js';

// Decode a bounded local thumbnail only when its row enters the picker viewport.
// Never fetch an original from the native bridge again or render it full-size.
function Thumbnail({ src, name }) {
  const host = useRef(null);
  const [thumbnail, setThumbnail] = useState(null);
  useEffect(() => {
    if (!src) return undefined;
    let active = true, url;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      try {
        const bitmap = await createImageBitmap(await (await fetch(src)).blob(),
          { resizeWidth: 160, resizeQuality: 'low' });
        if (!active) { bitmap.close(); return; }
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
        const scale = Math.max(160 / bitmap.width, 160 / bitmap.height);
        canvas.getContext('2d').drawImage(bitmap, (160 - bitmap.width * scale) / 2, (160 - bitmap.height * scale) / 2,
          bitmap.width * scale, bitmap.height * scale); bitmap.close();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .75));
        if (active && blob) { url = URL.createObjectURL(blob); setThumbnail(url); }
      } catch { /* Keep the labeled placeholder when a local preview is unavailable. */ }
    });
    observer.observe(host.current);
    return () => { active = false; observer.disconnect(); if (url) URL.revokeObjectURL(url); };
  }, [src]);
  return <span className="destination-thumbnail" ref={host}>
    {thumbnail ? <img src={thumbnail} alt={name} width="80" height="80" decoding="async" /> : <span aria-label={name}>Фото</span>}
  </span>;
}

export default function DestinationPicker({ action, source, targets, previews, label, status, coordinates, search, onSearch, onChoose, onClose }) {
  const sourceMembers = source ? pointMembers(source).filter((member) => action?.kind === 'merge' || member.id === action?.memberId) : [];
  const strip = (members) => <div className="destination-strip">{members.slice(0, 4).map((member) =>
    <Thumbnail key={member.id} src={previews[member.id]} name={member.fileName || `Фото ${member.number}`} />)}
    {members.length > 4 && <span>+{members.length - 4}</span>}</div>;
  return <IonModal className="move-photo-modal" isOpen={!!action} onDidDismiss={onClose}>
    <IonHeader><IonToolbar><IonTitle>{action?.kind === 'merge' ? 'Объединить точки' : 'Переместить фото'}</IonTitle></IonToolbar>
      {source && <div className="destination-source"><strong>Из {label(source)}</strong>{strip(sourceMembers)}</div>}
      <IonSearchbar value={search} placeholder="Индекс или точка" aria-label="Найти точку" onIonInput={(event) => onSearch(event.detail.value || '')} />
    </IonHeader>
    <IonContent><IonList>
      {['main', 'reserve', 'review'].map((kind) => {
        const items = targets.filter((point) => status(point).kind === kind);
        return items.length > 0 && <section key={kind} aria-label={kind === 'main' ? 'Основные' : kind === 'reserve' ? 'Резерв' : 'Требует проверки'}>
          <h3>{kind === 'main' ? 'Основные' : kind === 'reserve' ? 'Резерв' : 'Требует проверки'}</h3>
          {items.map((point) => <IonItem key={point.id} button data-destination-id={point.id} onClick={() => onChoose(point.id)}>
            <IonLabel><strong>{label(point)}</strong><p>{status(point).text} · {pointMembers(point).length} фото</p>
              <p>{coordinates(point.coordinates)}</p>{strip(pointMembers(point))}</IonLabel>
          </IonItem>)}
        </section>;
      })}
      {!targets.length && <IonItem><IonLabel>Точки не найдены</IonLabel></IonItem>}
    </IonList></IonContent>
    <IonFooter><IonToolbar><IonButton expand="block" fill="outline" onClick={onClose}>Отмена</IonButton></IonToolbar></IonFooter>
  </IonModal>;
}
