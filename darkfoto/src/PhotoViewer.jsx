import React, { useRef, useState } from 'react';
import { IonButton, IonContent, IonFooter, IonHeader, IonModal, IonTitle, IonToolbar } from '@ionic/react';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export default function PhotoViewer({ src, open, onClose }) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(0);
  const update = (next) => { viewRef.current = next; setView(next); };
  const reset = () => update({ scale: 1, x: 0, y: 0 });
  const zoom = (factor) => update({ ...viewRef.current, scale: Math.max(1, Math.min(6, viewRef.current.scale * factor)) });
  const start = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const values = [...pointers.current.values()];
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
    pointers.current.delete(event.pointerId);
    const values = [...pointers.current.values()];
    gesture.current = { view: { ...viewRef.current }, points: values,
      distance: values.length === 2 ? distance(values[0], values[1]) : 0 };
    if (event.type === 'pointerup' && values.length === 0) {
      const now = Date.now();
      if (now - lastTap.current < 320) { viewRef.current.scale > 1 ? reset() : zoom(2); lastTap.current = 0; }
      else lastTap.current = now;
    }
  };
  return <IonModal isOpen={open} onDidDismiss={() => { reset(); onClose(); }} className="image-viewer-modal">
    <IonHeader><IonToolbar><IonTitle>Фотография</IonTitle></IonToolbar></IonHeader>
    <IonContent className="image-viewer-content">
      <div className="image-gesture-area" onPointerDown={start} onPointerMove={move}
        onPointerUp={end} onPointerCancel={end}>
        {src && <img src={src} alt="Выбранная фотография" draggable="false"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} />}
      </div>
    </IonContent>
    <IonFooter><IonToolbar><div className="viewer-actions">
      <IonButton fill="outline" onClick={() => zoom(1 / 1.5)} aria-label="Уменьшить">−</IonButton>
      <IonButton fill="outline" onClick={() => zoom(1.5)} aria-label="Увеличить">+</IonButton>
      <IonButton fill="outline" onClick={reset}>Сбросить</IonButton>
      <IonButton onClick={onClose}>Закрыть</IonButton>
    </div></IonToolbar></IonFooter>
  </IonModal>;
}
