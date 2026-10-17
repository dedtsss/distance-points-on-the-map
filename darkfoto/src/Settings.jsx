import React, { useEffect, useState } from 'react';
import { IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonFooter } from '@ionic/react';

export default function Settings({ open, preferences, onSave, onClose, canRegroup, onRegroup }) {
  const [radius, setRadius] = useState('4');
  const [minimum, setMinimum] = useState('25');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setRadius(String(preferences.radiusMeters)); setMinimum(String(preferences.minimumDistanceMeters)); setError('');
  }, [open, preferences]);
  const save = (regroup = false) => {
    const radiusMeters = Number(radius), minimumDistanceMeters = Number(minimum);
    if (!radius || radiusMeters < 0.5 || radiusMeters > 10 || radiusMeters * 2 % 1
      || !minimum || minimumDistanceMeters < 5 || minimumDistanceMeters > 100 || minimumDistanceMeters % 1) {
      setError('Радиус: 0,5–10 м с шагом 0,5. Минимальное расстояние: 5–100 м с шагом 1.'); return;
    }
    try {
      onSave({ radiusMeters, minimumDistanceMeters });
      if (regroup) onRegroup(); else onClose();
    } catch { setError('Не удалось сохранить настройки. Повторите сохранение.'); }
  };
  return <IonModal className="settings-modal" isOpen={open} onDidDismiss={onClose}>
    <IonHeader><IonToolbar><IonTitle>Настройки</IonTitle></IonToolbar></IonHeader>
    <IonContent><div className="settings-fields">
      <label htmlFor="point-radius">Радиус одной точки, м</label>
      <input id="point-radius" type="number" inputMode="decimal" min="0.5" max="10" step="0.5"
        value={radius} onChange={(event) => setRadius(event.target.value)} />
      <p>Фото с уверенными GPS в пределах радиуса — одна точка. EXIF и OCR равнозначны, время и индекс не разделяют точку.</p>
      <p>Новый радиус применяется к следующим фото. Состав текущих точек сохранится до явной перегруппировки.</p>
      <IonButton expand="block" fill="outline" disabled={!canRegroup} onClick={() => save(true)}>
        Перегруппировать текущую сессию
      </IonButton>
      <label htmlFor="point-minimum">Минимальное расстояние между точками, м</label>
      <input id="point-minimum" type="number" inputMode="numeric" min="5" max="100" step="1"
        value={minimum} onChange={(event) => setMinimum(event.target.value)} />
      <p>Допуск 2 м: от {Math.max(0, Number(minimum) - 2)} до менее {minimum || '…'} м — основные с предупреждением. Ниже — конфликт. Статусы текущих точек пересчитываются сразу после сохранения.</p>
      <p>Настройки сохраняются отдельно от сессии, в том числе после «Начать заново».</p>
      {error && <p role="alert">{error}</p>}
    </div></IonContent>
    <IonFooter><IonToolbar><IonButton onClick={() => save()}>Сохранить</IonButton>
      <IonButton fill="clear" onClick={onClose}>Закрыть</IonButton></IonToolbar></IonFooter>
  </IonModal>;
}
