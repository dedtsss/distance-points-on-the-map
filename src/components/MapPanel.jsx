import { useEffect, useMemo, useRef } from 'react';
import { buildMapModel } from '../features/map/mapModel.js';
import { photoLinksInRequestedOrder } from '../features/links/linkFormatter.js';
import { formatCoordinates } from '../utils/format.js';
import { formatDistanceMeters } from '../utils/geoDistance.js';
import EmptyState from './EmptyState.jsx';
import StatusChip from './StatusChip.jsx';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const popupHtml = (photo, providerSettings) => {
  const links = photoLinksInRequestedOrder(photo, providerSettings);
  const linkList = links.length
    ? `<ul>${links.map((url) => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a></li>`).join('')}</ul>`
    : '<p>Ссылок пока нет</p>';
  return `
    <div class="map-popup">
      <strong>${escapeHtml(photo.pointLabel || `Фото ${photo.number}`)}</strong>
      <dl>
        <div><dt>Индекс</dt><dd>${escapeHtml(photo.indexFromOcr || 'не найден')}</dd></div>
        <div><dt>Файл</dt><dd>${escapeHtml(photo.displayFileName || photo.fileName || '')}</dd></div>
        <div><dt>Координаты</dt><dd>${escapeHtml(formatCoordinates(photo.coordinates))}</dd></div>
        <div><dt>Качество</dt><dd>${escapeHtml(photo.coordinateQuality || 'missing')}</dd></div>
        <div><dt>Расстояние</dt><dd>${escapeHtml(photo.distanceStatus || 'pending')}</dd></div>
      </dl>
      ${linkList}
    </div>
  `;
};

const markerClass = (point) => {
  if (point.lowPrecision) return 'low-precision';
  if (point.suspicious) return 'suspicious';
  if (point.distanceStatus === 'too_close') return 'conflict';
  if (point.strict) return 'strict';
  return 'neutral';
};

function PointList({ title, items, emptyText }) {
  return (
    <section className="map-list-card">
      <h3>{title}</h3>
      {items.length === 0 ? <p>{emptyText}</p> : (
        <ul>
          {items.map((item) => {
            const photo = item.photo || item;
            return <li key={photo.id}>{photo.pointLabel || `Фото ${photo.number}`}</li>;
          })}
        </ul>
      )}
    </section>
  );
}

export default function MapPanel({
  photos,
  thresholdMeters,
  providerSettings,
  focusPhotoId,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const model = useMemo(() => buildMapModel(photos, thresholdMeters), [photos, thresholdMeters]);

  useEffect(() => {
    let cancelled = false;
    let layerGroup = null;

    async function renderMap() {
      if (!containerRef.current || model.points.length === 0) return;
      const leaflet = await import('leaflet');
      const L = leaflet.default || leaflet;
      if (cancelled) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(mapRef.current);
      }

      layerGroup = L.layerGroup().addTo(mapRef.current);
      model.lines.forEach((line) => {
        const pointA = model.points.find((point) => point.id === line.pointAId);
        const pointB = model.points.find((point) => point.id === line.pointBId);
        if (!pointA || !pointB) return;
        L.polyline(
          [
            [pointA.coordinates.latitude, pointA.coordinates.longitude],
            [pointB.coordinates.latitude, pointB.coordinates.longitude],
          ],
          {
            color: line.conflict ? '#ba1a1a' : '#006a6a',
            weight: line.conflict ? 4 : 2,
            opacity: line.conflict ? 0.92 : 0.55,
            dashArray: line.conflict ? '0' : '6 8',
          },
        )
          .bindTooltip(`${line.pointALabel} - ${line.pointBLabel}: ${formatDistanceMeters(line.distanceMeters)} м`)
          .addTo(layerGroup);
      });

      model.points.forEach((point) => {
        const icon = L.divIcon({
          className: `map-marker map-marker-${markerClass(point)}`,
          html: '<span></span>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        L.marker([point.coordinates.latitude, point.coordinates.longitude], { icon })
          .bindTooltip(point.label, {
            permanent: true,
            direction: 'right',
            className: 'map-label',
            offset: [10, ((point.order % 5) - 2) * 18],
          })
          .bindPopup(popupHtml(point.photo, providerSettings))
          .addTo(layerGroup);
      });

      const bounds = L.latLngBounds(model.points.map((point) => [point.coordinates.latitude, point.coordinates.longitude]));
      if (bounds.isValid()) mapRef.current.fitBounds(bounds.pad(0.2), { maxZoom: 17 });
      const focused = focusPhotoId ? model.points.find((point) => point.id === focusPhotoId) : null;
      if (focused) mapRef.current.panTo([focused.coordinates.latitude, focused.coordinates.longitude]);
    }

    renderMap();
    return () => {
      cancelled = true;
      if (layerGroup && mapRef.current) mapRef.current.removeLayer(layerGroup);
    };
  }, [model, providerSettings, focusPhotoId]);

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, []);

  if (model.points.length === 0) {
    return <EmptyState title="Нет точек для отображения.">Сначала распознай координаты.</EmptyState>;
  }

  return (
    <section className="map-panel">
      <div className="map-canvas" ref={containerRef} aria-label="Карта точек" />
      <div className="map-legend" aria-label="Легенда карты">
        <StatusChip tone="success">confident/manual</StatusChip>
        <StatusChip tone="warning">low_precision</StatusChip>
        <StatusChip tone="error">конфликт &lt; {thresholdMeters} м</StatusChip>
      </div>
      <div className="map-lists">
        <PointList title="Найденные точки" items={model.points} emptyText="Нет точек." />
        <PointList title="Без координат" items={model.missingCoordinates} emptyText="Все фото имеют координаты." />
        <PointList title="Low precision" items={model.lowPrecision} emptyText="Нет low_precision точек." />
        <PointList title="Suspicious" items={model.suspicious} emptyText="Нет suspicious точек." />
        <section className="map-list-card">
          <h3>Конфликты расстояний</h3>
          {model.conflicts.length === 0 ? <p>Конфликтов нет.</p> : (
            <ul>
              {model.conflicts.map((line) => (
                <li key={line.id}>
                  {line.pointALabel} - {line.pointBLabel}: {formatDistanceMeters(line.distanceMeters)} м
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
