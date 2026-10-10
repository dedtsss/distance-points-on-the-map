import React, { useEffect, useRef, useState } from 'react';
import { IonButton, IonContent, IonFooter, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/react';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export default function PhotoViewer({ src, open, onClose, index = 0, total = 1, onNavigate }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(0);
  const swiping = useRef(null);
  const update = (next) => { viewRef.current = next; setView(next); };
  const reset = () => update({ scale: 1, x: 0, y: 0 });
  useEffect(() => { reset(); pointers.current.clear(); gesture.current = null;
    swiping.current = null; lastTap.current = 0; }, [src, open]);
  const zoom = (factor) => update({ ...viewRef.current, scale: Math.max(1, Math.min(6, viewRef.current.scale * factor)) });
  const start = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const values = [...pointers.current.values()];
    swiping.current = values.length === 1 && viewRef.current.scale === 1
      ? { x: event.clientX, y: event.clientY } : null;
    gesture.current = { view: { ...viewRef.current }, points: values,
      distance: values.length === 2 ? distance(values[0], values[1]) : 0 };
  };
  const move = (event) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const values = [...pointers.current.values()];
    const initial = gesture.current;
    if (!initial || values.length !== initial.points.length) return;
    if (values.length === 2 && initial.distance > 0) {
      const scale = Math.max(1, Math.min(6, initial.view.scale * distance(values[0], values[1]) / initial.distance));
      const center = (points) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
      const from = center(initial.points); const to = center(values);
      update({ scale, x: initial.view.x + to.x - from.x, y: initial.view.y + to.y - from.y });
    } else if (values.length === 1 && initial.view.scale > 1) {
      update({ ...initial.view, x: initial.view.x + values[0].x - initial.points[0].x,
        y: initial.view.y + values[0].y - initial.points[0].y });
    }
  };
  const end = (event) => {
    const from = swiping.current;
    const initial = gesture.current;
    const dx = from ? event.clientX - from.x : 0;
    const dy = from ? event.clientY - from.y : 0;
    const travelled = initial?.points.length === 1
      ? distance(initial.points[0], { x: event.clientX, y: event.clientY }) : Infinity;
    pointers.current.delete(event.pointerId);
    const values = [...pointers.current.values()];
    gesture.current = { view: { ...viewRef.current }, points: values,
      distance: values.length === 2 ? distance(values[0], values[1]) : 0 };
    swiping.current = null;
    if (event.type === 'pointerup' && values.length === 0 && from
      && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      onNavigate?.(dx < 0 ? 1 : -1); lastTap.current = 0;
    } else if (event.type === 'pointerup' && values.length === 0 && travelled < 10) {
      const now = Date.now();
      if (now - lastTap.current < 320) { viewRef.current.scale > 1 ? reset() : zoom(2); lastTap.current = 0; }
      else lastTap.current = now;
    }
  };
  return <IonModal isOpen={open} onDidDismiss={() => { reset(); onClose(); }} className="image-viewer-modal">
    <IonHeader><IonToolbar><IonTitle>Фотография {index + 1}/{total}</IonTitle></IonToolbar></IonHeader>
    <IonContent className="image-viewer-content">
      <div className="image-gesture-area" tabIndex={0} aria-label="Просмотр фото точки" onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') onNavigate?.(-1);
        if (event.key === 'ArrowRight') onNavigate?.(1);
      }} onPointerDown={start} onPointerMove={move}
        onPointerUp={end} onPointerCancel={end}>
        {src && <img src={src} alt="Выбранная фотография" draggable="false"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} />}
      </div>
    </IonContent>
    <IonFooter><IonToolbar><div className="viewer-actions">
      {total > 1 && <><IonButton fill="clear" disabled={index <= 0} onClick={() => onNavigate?.(-1)} aria-label="Предыдущее фото">‹</IonButton>
        <IonButton fill="clear" disabled={index >= total - 1} onClick={() => onNavigate?.(1)} aria-label="Следующее фото">›</IonButton></>}
      <IonButton fill="outline" onClick={() => zoom(1 / 1.5)} aria-label="Уменьшить">−</IonButton>
      <IonButton fill="outline" onClick={() => zoom(1.5)} aria-label="Увеличить">+</IonButton>
      <IonButton fill="outline" onClick={reset}>Сбросить</IonButton>
      <IonButton onClick={onClose}>Закрыть</IonButton>
    </div></IonToolbar></IonFooter>
  </IonModal>;
}
