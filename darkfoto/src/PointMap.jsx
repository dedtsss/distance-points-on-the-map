import React, { useEffect, useRef, useState } from 'react';
import { Map as LibreMap, Marker, NavigationControl, AttributionControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE, MAP_LOAD_TIMEOUT_MS, sessionMapBounds, nearbyMapPoints } from './sessionMap.js';

setWorkerUrl(workerUrl);
const symbols = { main: 'О', reserve: 'Р', review: '!', recognized: '•' };

export default function PointMap({ points, visible, onOpenPoint }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef(new Map());
  const currentPoints = useRef(points);
  currentPoints.current = points;
  const camera = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState('loading');
  const [started, setStarted] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const preview = useRef(null);
  const hasPoints = points.length > 0;
  const selected = points.find((point) => point.id === selectedId);
  const nearby = nearbyMapPoints(points, selectedId);
  useEffect(() => {
    if (!hasPoints) setStarted(false);
    else if (visible) setStarted(true);
  }, [visible, hasPoints]);
  useEffect(() => {
    if (selectedId && !points.some((point) => point.id === selectedId)) setSelectedId(null);
  }, [points, selectedId]);
  useEffect(() => {
    if (visible) preview.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [selectedId]);

  const fit = (map = mapRef.current) => {
    const bounds = sessionMapBounds(currentPoints.current);
    if (map && bounds) map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 0 });
  };

  useEffect(() => {
    // Keep a visited map mounted across tabs and ordinary edits. Only retry or
    // an empty session destroys it; remember its viewport for those cases too.
    if (!hasPoints) { camera.current = null; return undefined; }
    if (!started) return undefined;
    let map, timer;
    setPhase('loading');
    const fail = () => { clearTimeout(timer); setPhase('error'); };
    try {
      map = new LibreMap({ container: container.current, style: MAP_STYLE,
        ...(camera.current || { center: [0, 0], zoom: 1 }), attributionControl: false });
      mapRef.current = map;
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new AttributionControl({ compact: false, customAttribution:
        '<a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a> | <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>' }), 'bottom-right');
      if (!camera.current) fit(map);
      map.on('moveend', () => { camera.current = { center: map.getCenter().toArray(), zoom: map.getZoom() }; });
      map.on('error', fail);
      map.on('load', () => { clearTimeout(timer); setPhase((phase) => phase === 'error' ? phase : 'ready'); });
      map.on('webglcontextlost', fail);
      timer = setTimeout(fail, MAP_LOAD_TIMEOUT_MS);
    } catch { fail(); }
    return () => {
      clearTimeout(timer);
      markers.current.forEach((marker) => marker.remove()); markers.current.clear();
      if (map) { camera.current = { center: map.getCenter().toArray(), zoom: map.getZoom() }; map.remove(); }
      mapRef.current = null;
    };
  }, [hasPoints, started, attempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ids = new Set(points.map((point) => point.id));
    for (const [id, marker] of markers.current) {
      if (!ids.has(id)) { marker.remove(); markers.current.delete(id); }
    }
    for (const point of points) {
      let marker = markers.current.get(point.id);
      if (!marker) {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.pointId = point.id;
        button.addEventListener('click', () => setSelectedId(point.id));
        marker = new Marker({ element: button }).setLngLat([point.longitude, point.latitude]).addTo(map);
        markers.current.set(point.id, marker);
      }
      const element = marker.getElement();
      for (const kind of Object.keys(symbols)) element.classList.remove(`session-map-marker-${kind}`);
      element.classList.add('session-map-marker', `session-map-marker-${point.status.kind}`);
      element.textContent = `${symbols[point.status.kind] || '•'} ${point.label}`;
      element.setAttribute('aria-label', `${point.label} · ${point.status.text} · ${point.count} фото`);
      element.setAttribute('aria-pressed', String(point.id === selectedId));
      marker.setLngLat([point.longitude, point.latitude]);
    }
  }, [points, selectedId, hasPoints, started, attempt]);

  useEffect(() => {
    if (!visible || !mapRef.current) return undefined;
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(container.current); mapRef.current.resize();
    return () => observer.disconnect();
  }, [visible, hasPoints, started, attempt]);

  return <section className="session-map" aria-label="Карта текущей сессии" hidden={!visible}>
    <div className="map-heading"><h2>Карта</h2>
      {hasPoints && <button type="button" className="map-button" onClick={() => fit()}>Показать все</button>}</div>
    {!hasPoints ? <p className="map-empty" role="status">В текущей сессии нет активных точек с координатами. Добавьте и обработайте фото во вкладке «Точки».</p> : <>
      <p className="map-legend"><span className="map-key-main">О · Основные</span><span className="map-key-reserve">Р · Резерв</span><span className="map-key-review">! · Проверка</span></p>
      <div className="map-frame">
        <div ref={container} className="map-canvas" aria-label="OpenFreeMap Dark" />
        {phase === 'loading' && <p className="map-loading" role="status">Загрузка карты…</p>}
      </div>
      {phase === 'error' && <div className="map-error" role="alert"><p>Не удалось загрузить карту полностью. Проверьте подключение к интернету и повторите попытку.</p>
        <button type="button" className="map-button" onClick={() => setAttempt((value) => value + 1)}>Повторить загрузку карты</button></div>}
      {selected ? <article ref={preview} className="map-preview" aria-live="polite" aria-label={`Предпросмотр точки ${selected.label}`}>
        {selected.thumbnail && <img src={selected.thumbnail} alt="Фото представителя точки" />}
        <div><strong>{selected.label}</strong><span className={`photo-state photo-state-${selected.status.kind}`}>{selected.status.text}</span>
          <p>{selected.count} фото · {selected.latitude}, {selected.longitude}</p>
          {nearby.length > 1 && <label className="map-nearby">Близкие точки (до 25 м)
            <select value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
              {nearby.map((point) => <option key={point.id} value={point.id}>{point.label} · {point.status.kind === 'review' ? 'Проверка' : point.status.text}</option>)}
            </select></label>}
          <button type="button" className="map-button" onClick={() => onOpenPoint(selected.id)}>Открыть точку</button>
          <button type="button" className="map-button map-dismiss" onClick={() => setSelectedId(null)}>Закрыть</button></div>
      </article> : <p className="map-hint">Нажмите на маркер, чтобы увидеть точку. На карте: {points.length}.</p>}
    </>}
  </section>;
}
