import { useEffect, useMemo, useRef, useState } from 'react';
import { buildMapModel } from '../features/map/mapModel.js';
import { photoLinksInRequestedOrder } from '../features/links/linkFormatter.js';
import { formatCoordinates } from '../utils/format.js';
import { formatDistanceMeters } from '../utils/geoDistance.js';
import EmptyState from './EmptyState.jsx';
import FilterBar from './FilterBar.jsx';
import Icon from './Icon.jsx';
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

const markerClass = (point, selected) => {
  if (selected) return 'selected';
  if (point.lowPrecision) return 'low-precision';
  if (point.suspicious) return 'suspicious';
  if (point.distanceStatus === 'too_close') return 'conflict';
  if (point.strict) return 'strict';
  return 'neutral';
};

const matchesFilter = (point, filter) => {
  if (filter === 'strict') return point.strict;
  if (filter === 'low_precision') return point.lowPrecision;
  if (filter === 'suspicious') return point.suspicious;
  if (filter === 'conflicts') return point.distanceStatus === 'too_close';
  return true;
};

export default function MapPanel({
  photos,
  thresholdMeters,
  providerSettings,
  focusPhotoId,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const [panelOpen, setPanelOpen] = useState(() => (
    typeof window === 'undefined' ? true : !window.matchMedia('(max-width: 860px)').matches
  ));
  const [filter, setFilter] = useState('all');
  const [selectedPointId, setSelectedPointId] = useState(focusPhotoId || null);
  const model = useMemo(() => buildMapModel(photos, thresholdMeters), [photos, thresholdMeters]);
  const filteredPoints = model.points.filter((point) => matchesFilter(point, filter));
  const selectedPoint = model.points.find((point) => point.id === selectedPointId) || filteredPoints[0] || model.points[0] || null;
  const filterOptions = [
    { value: 'all', label: 'Все', count: model.points.length },
    { value: 'strict', label: 'ОК', count: model.points.filter((point) => point.strict).length },
    { value: 'low_precision', label: 'Low precision', count: model.points.filter((point) => point.lowPrecision).length },
    { value: 'suspicious', label: 'Проверка', count: model.points.filter((point) => point.suspicious).length },
    { value: 'conflicts', label: 'Конфликты', count: model.points.filter((point) => point.distanceStatus === 'too_close').length },
  ];

  useEffect(() => {
    if (focusPhotoId) setSelectedPointId(focusPhotoId);
  }, [focusPhotoId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const query = window.matchMedia('(max-width: 860px)');
    const syncPanel = () => setPanelOpen(!query.matches);
    syncPanel();
    query.addEventListener('change', syncPanel);
    return () => query.removeEventListener('change', syncPanel);
  }, []);

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
      markersRef.current = new Map();
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
            color: line.conflict ? '#ffb4ab' : '#6ddbd3',
            weight: line.conflict ? 4 : 2,
            opacity: line.conflict ? 0.95 : 0.62,
            dashArray: line.conflict ? '0' : '6 8',
          },
        )
          .bindTooltip(`${line.pointALabel} - ${line.pointBLabel}: ${formatDistanceMeters(line.distanceMeters)} м`)
          .addTo(layerGroup);
      });

      const labelsPermanent = typeof window === 'undefined'
        ? true
        : !window.matchMedia('(max-width: 640px)').matches;

      model.points.forEach((point) => {
        if (!matchesFilter(point, filter)) return;
        const selected = point.id === selectedPointId;
        const icon = L.divIcon({
          className: `map-marker map-marker-${markerClass(point, selected)}`,
          html: '<span></span>',
          iconSize: selected ? [24, 24] : [18, 18],
          iconAnchor: selected ? [12, 12] : [9, 9],
        });
        const marker = L.marker([point.coordinates.latitude, point.coordinates.longitude], { icon })
          .bindTooltip(point.label, {
            permanent: labelsPermanent,
            direction: 'right',
            className: 'map-label',
            offset: [10, ((point.order % 5) - 2) * 18],
          })
          .bindPopup(popupHtml(point.photo, providerSettings))
          .on('click', () => setSelectedPointId(point.id))
          .addTo(layerGroup);
        markersRef.current.set(point.id, marker);
      });

      const boundsSource = filteredPoints.length > 0 ? filteredPoints : model.points;
      const bounds = L.latLngBounds(boundsSource.map((point) => [point.coordinates.latitude, point.coordinates.longitude]));
      if (bounds.isValid()) mapRef.current.fitBounds(bounds.pad(0.2), { maxZoom: 17 });
      const focused = selectedPointId ? model.points.find((point) => point.id === selectedPointId) : null;
      if (focused) {
        mapRef.current.panTo([focused.coordinates.latitude, focused.coordinates.longitude]);
        markersRef.current.get(focused.id)?.openTooltip();
      }
    }

    renderMap();
    return () => {
      cancelled = true;
      if (layerGroup && mapRef.current) mapRef.current.removeLayer(layerGroup);
    };
  }, [model, providerSettings, focusPhotoId, filter, filteredPoints, selectedPointId]);

  useEffect(() => () => {
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, []);

  if (model.points.length === 0) {
    return <EmptyState title="Нет точек для отображения" icon="map">Сначала распознайте координаты.</EmptyState>;
  }

  return (
    <section className={`map-panel${panelOpen ? ' panel-open' : ' panel-collapsed'}`}>
      <div className="map-toolbar">
        <div className="map-legend" aria-label="Легенда карты">
          <StatusChip tone="success">confident/manual</StatusChip>
          <StatusChip tone="warning">low_precision</StatusChip>
          <StatusChip tone="error">конфликт &lt; {thresholdMeters} м</StatusChip>
        </div>
        <button type="button" className="button-secondary compact-button" onClick={() => setPanelOpen((value) => !value)}>
          <Icon name={panelOpen ? 'chevronRight' : 'chevronLeft'} size={16} />
          {panelOpen ? 'Скрыть точки' : 'Показать точки'}
        </button>
      </div>
      <div className="map-workspace">
        <div className="map-canvas" ref={containerRef} aria-label="Карта точек" />
        <aside className="map-side-panel" aria-label="Точки на карте">
          <div className="map-panel-head">
            <div>
              <p className="page-eyebrow">Точки</p>
              <h3>{filteredPoints.length} из {model.points.length}</h3>
            </div>
            <button type="button" className="icon-button map-sheet-close" onClick={() => setPanelOpen(false)} aria-label="Скрыть список точек">
              <Icon name="close" />
            </button>
          </div>
          <FilterBar label="Фильтр точек" options={filterOptions} value={filter} onChange={setFilter} />
          {selectedPoint && (
            <article className="selected-point-card">
              <h3>{selectedPoint.label}</h3>
              <dl>
                <div><dt>Файл</dt><dd>{selectedPoint.photo.displayFileName || selectedPoint.photo.fileName}</dd></div>
                <div><dt>Координаты</dt><dd>{formatCoordinates(selectedPoint.coordinates)}</dd></div>
                <div><dt>Качество</dt><dd>{selectedPoint.photo.coordinateQuality || 'missing'}</dd></div>
                <div><dt>Расстояние</dt><dd>{selectedPoint.photo.distanceStatus || 'pending'}</dd></div>
              </dl>
            </article>
          )}
          <div className="point-list">
            {filteredPoints.length === 0 ? (
              <EmptyState title="Нет точек по фильтру" icon="search">Измените фильтр карты.</EmptyState>
            ) : filteredPoints.map((point) => (
              <button
                type="button"
                key={point.id}
                className={`point-list-item${point.id === selectedPoint?.id ? ' is-selected' : ''}`}
                onClick={() => setSelectedPointId(point.id)}
              >
                <span className={`point-dot point-dot-${markerClass(point, false)}`} aria-hidden="true" />
                <span>
                  <strong>{point.label}</strong>
                  <small>{point.photo.displayFileName || point.photo.fileName}</small>
                </span>
                <StatusChip tone={point.distanceStatus === 'too_close' ? 'error' : point.lowPrecision || point.suspicious ? 'warning' : 'success'}>
                  {point.distanceStatus === 'too_close' ? 'конфликт' : point.photo.coordinateQuality || 'ok'}
                </StatusChip>
              </button>
            ))}
          </div>
          <section className="map-conflicts">
            <h3>Конфликты расстояний</h3>
            {model.conflicts.length === 0 ? <p>Конфликтов нет.</p> : (
              <ul>
                {model.conflicts.map((line) => (
                  <li key={line.id}>{line.pointALabel} - {line.pointBLabel}: {formatDistanceMeters(line.distanceMeters)} м</li>
                ))}
              </ul>
            )}
            {model.missingCoordinates.length > 0 && <p>Без координат: {model.missingCoordinates.length}</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}
