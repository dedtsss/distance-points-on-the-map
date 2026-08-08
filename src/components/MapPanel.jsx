import { useEffect, useMemo, useRef, useState } from 'react';
import { photoLinksInRequestedOrder } from '../features/links/linkFormatter.js';
import {
  MAP_LAYER_OPTIONS,
  getMapLayerDefinition,
  loadMapLayerId,
  saveMapLayerId,
} from '../features/map/baseLayers.js';
import { buildMapModel } from '../features/map/mapModel.js';
import { indexDisplayText } from '../features/points/pointIdentity.js';
import { isReservePhoto } from '../features/session/sessionDomain.js';
import { formatCoordinates } from '../utils/format.js';
import { formatDistanceMeters } from '../utils/geoDistance.js';
import EmptyState from './EmptyState.jsx';
import FilterBar from './FilterBar.jsx';
import Icon from './Icon.jsx';
import StatusChip from './StatusChip.jsx';
import './MapPanel.css';

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
  const thumbnail = String(photo.thumbnailDataUrl || '').startsWith('data:image/')
    ? `<img class="map-popup-thumbnail" src="${escapeHtml(photo.thumbnailDataUrl)}" alt="Миниатюра точки">`
    : '';
  return `
    <div class="map-popup">
      <strong>${escapeHtml(photo.pointLabel || `Фото ${photo.number}`)}</strong>
      ${thumbnail}
      <dl>
        <div><dt>Индекс</dt><dd>${escapeHtml(indexDisplayText(photo))}</dd></div>
        <div><dt>Файл</dt><dd>${escapeHtml(photo.displayFileName || photo.fileName || '')}</dd></div>
        <div><dt>Координаты</dt><dd>${escapeHtml(formatCoordinates(photo.coordinates))}</dd></div>
        <div><dt>Качество</dt><dd>${escapeHtml(photo.coordinateQuality || 'missing')}</dd></div>
        <div><dt>Расстояние</dt><dd>${escapeHtml(photo.distanceStatus || 'pending')}</dd></div>
        <div><dt>Статус</dt><dd>${isReservePhoto(photo) ? 'RESERVE' : 'ACTIVE'}</dd></div>
      </dl>
      ${linkList}
    </div>
  `;
};

const pointHasConflict = (point) => point.distanceStatus === 'too_close';

const markerClassName = (point, selected = false) => [
  'map-marker',
  pointHasConflict(point) ? 'is-conflict' : '',
  point.reserve ? 'is-reserve' : '',
  selected ? 'is-selected' : '',
].filter(Boolean).join(' ');

const pointDotClassName = (point, selected = false) => [
  'point-dot',
  pointHasConflict(point) ? 'is-conflict' : '',
  point.reserve ? 'is-reserve' : '',
  selected ? 'is-selected' : '',
].filter(Boolean).join(' ');

const createMarkerIcon = (L, point, selected = false) => L.divIcon({
  className: markerClassName(point, selected),
  html: '<span></span>',
  iconSize: selected ? [26, 26] : [18, 18],
  iconAnchor: selected ? [13, 13] : [9, 9],
});

const conflictLineTooltip = (line, thresholdMeters) => (
  `${line.pointALabel} - ${line.pointBLabel}: ${formatDistanceMeters(line.distanceMeters)} м; порог ${formatDistanceMeters(thresholdMeters)} м`
);

const matchesFilter = (point, filter) => {
  if (filter === 'strict') return point.strict;
  if (filter === 'low_precision') return point.lowPrecision;
  if (filter === 'suspicious') return point.suspicious;
  if (filter === 'conflicts') return point.distanceStatus === 'too_close';
  if (filter === 'reserve') return point.reserve;
  return true;
};

export default function MapPanel({
  photos,
  thresholdMeters,
  providerSettings,
  focusPhotoId,
  mapLayerId: preferredMapLayerId,
  onMapLayerChange,
  recommendation,
  onApplyRecommendation,
  onToggleReserve,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const baseLayerGroupRef = useRef(null);
  const layerGroupRef = useRef(null);
  const markersRef = useRef(new Map());
  const selectedPointRef = useRef(null);
  const fittedPointsKeyRef = useRef('');
  const lastFocusPhotoIdRef = useRef(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [mapLayerId, setMapLayerId] = useState(() => preferredMapLayerId || loadMapLayerId());
  const [mapLayerError, setMapLayerError] = useState('');
  const [panelOpen, setPanelOpen] = useState(() => (
    typeof window === 'undefined' ? true : !window.matchMedia('(max-width: 860px)').matches
  ));
  const [filter, setFilter] = useState('all');
  const [selectedPointId, setSelectedPointId] = useState(focusPhotoId || null);
  const model = useMemo(() => buildMapModel(photos, thresholdMeters), [photos, thresholdMeters]);
  const activeMapLayer = useMemo(() => getMapLayerDefinition(mapLayerId), [mapLayerId]);
  const filteredPoints = useMemo(() => (
    model.points.filter((point) => matchesFilter(point, filter))
  ), [filter, model.points]);
  const selectedPoint = model.points.find((point) => point.id === selectedPointId)
    || filteredPoints[0]
    || model.points[0]
    || null;
  const visiblePointIds = useMemo(() => new Set(filteredPoints.map((point) => point.id)), [filteredPoints]);
  const layerDataKey = useMemo(() => JSON.stringify({
    filter,
    points: filteredPoints.map((point) => ({
      id: point.id,
      latitude: point.coordinates.latitude,
      longitude: point.coordinates.longitude,
      label: point.label,
      conflict: pointHasConflict(point),
      fileName: point.photo.displayFileName || point.photo.fileName || '',
      index: point.photo.indexFromOcr || '',
      indexStatus: point.photo.indexStatus || '',
      reserve: point.reserve,
    })),
    conflicts: model.conflicts
      .filter((line) => visiblePointIds.has(line.pointAId) && visiblePointIds.has(line.pointBId))
      .map((line) => ({ id: line.id, distanceMeters: line.distanceMeters })),
    providerSettings,
  }), [filter, filteredPoints, model.conflicts, providerSettings, visiblePointIds]);
  const fitPointsKey = useMemo(() => JSON.stringify(model.points.map((point) => ({
    id: point.id,
    latitude: point.coordinates.latitude,
    longitude: point.coordinates.longitude,
  }))), [model.points]);
  const filterOptions = [
    { value: 'all', label: 'Все', count: model.points.length },
    { value: 'strict', label: 'ОК', count: model.points.filter((point) => point.strict).length },
    { value: 'low_precision', label: 'Low precision', count: model.points.filter((point) => point.lowPrecision).length },
    { value: 'suspicious', label: 'Проверка', count: model.points.filter((point) => point.suspicious).length },
    { value: 'conflicts', label: 'Конфликты', count: model.points.filter((point) => point.distanceStatus === 'too_close').length },
    { value: 'reserve', label: 'RESERVE', count: model.points.filter((point) => point.reserve).length },
  ];

  const fitToPoints = (points) => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !points.length) return;
    const bounds = L.latLngBounds(points.map((point) => [point.coordinates.latitude, point.coordinates.longitude]));
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.2), { maxZoom: 17 });
  };

  const fitVisiblePoints = () => fitToPoints(filteredPoints.length > 0 ? filteredPoints : model.points);

  const handleMapLayerChange = (value) => {
    const next = saveMapLayerId(value);
    setMapLayerId(next);
    onMapLayerChange?.(next);
    setMapLayerError('');
  };

  useEffect(() => {
    if (preferredMapLayerId && preferredMapLayerId !== mapLayerId) setMapLayerId(preferredMapLayerId);
  }, [preferredMapLayerId, mapLayerId]);

  useEffect(() => {
    if (focusPhotoId) setSelectedPointId(focusPhotoId);
  }, [focusPhotoId]);

  useEffect(() => {
    if (!selectedPointId && filteredPoints[0]) setSelectedPointId(filteredPoints[0].id);
  }, [filteredPoints, selectedPointId]);

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

    async function createMap() {
      if (!containerRef.current || mapRef.current || model.points.length === 0) return;
      const leaflet = await import('leaflet');
      const L = leaflet.default || leaflet;
      if (cancelled) return;

      leafletRef.current = L;
      mapRef.current = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      });
      if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1') {
        window.__gpsCheckerMap = mapRef.current;
      }
      setLeafletReady(true);
    }

    createMap();
    return () => {
      cancelled = true;
    };
  }, [model.points.length]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!leafletReady || !L || !map) return undefined;

    if (baseLayerGroupRef.current) map.removeLayer(baseLayerGroupRef.current);
    const group = L.layerGroup();
    let tileErrors = 0;
    let tileLoads = 0;

    activeMapLayer.layers.forEach((layerConfig) => {
      const tileLayer = L.tileLayer(layerConfig.url, {
        ...layerConfig.options,
        crossOrigin: true,
      });
      tileLayer.on('tileload', () => {
        tileLoads += 1;
        if (tileLoads > 0) setMapLayerError('');
      });
      tileLayer.on('tileerror', () => {
        tileErrors += 1;
        if (tileErrors >= 4 && tileLoads === 0) {
          setMapLayerError(`Слой «${activeMapLayer.label}» сейчас не загружается. Переключитесь на «Схема».`);
        }
      });
      tileLayer.addTo(group);
    });

    group.addTo(map);
    baseLayerGroupRef.current = group;
    saveMapLayerId(activeMapLayer.id);

    if (typeof window !== 'undefined' && window.__gpsCheckerMap === map) {
      window.__gpsCheckerMapLayer = activeMapLayer.id;
    }

    return () => {
      if (mapRef.current && baseLayerGroupRef.current === group) {
        mapRef.current.removeLayer(group);
        baseLayerGroupRef.current = null;
      }
    };
  }, [activeMapLayer, leafletReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!leafletReady || !L || !map || model.points.length === 0) return undefined;

    if (layerGroupRef.current) map.removeLayer(layerGroupRef.current);
    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    markersRef.current = new Map();

    model.conflicts.forEach((line) => {
      if (!visiblePointIds.has(line.pointAId) || !visiblePointIds.has(line.pointBId)) return;
      const pointA = model.points.find((point) => point.id === line.pointAId);
      const pointB = model.points.find((point) => point.id === line.pointBId);
      if (!pointA || !pointB) return;
      L.polyline(
        [
          [pointA.coordinates.latitude, pointA.coordinates.longitude],
          [pointB.coordinates.latitude, pointB.coordinates.longitude],
        ],
        {
          color: '#ff5449',
          weight: 5,
          opacity: 0.96,
          dashArray: null,
          lineCap: 'round',
          lineJoin: 'round',
        },
      )
        .bindTooltip(conflictLineTooltip(line, model.thresholdMeters))
        .addTo(layerGroup);
    });

    const labelsPermanent = typeof window === 'undefined'
      ? true
      : !window.matchMedia('(max-width: 640px)').matches;

    filteredPoints.forEach((point) => {
      const marker = L.marker([point.coordinates.latitude, point.coordinates.longitude], {
        icon: createMarkerIcon(L, point, false),
      })
        .bindTooltip(point.label, {
          permanent: labelsPermanent,
          direction: 'right',
          className: 'map-label',
          offset: [10, ((point.order % 5) - 2) * 18],
        })
        .bindPopup(popupHtml(point.photo, providerSettings), { autoPan: false })
        .on('click', () => setSelectedPointId(point.id))
        .addTo(layerGroup);
      markersRef.current.set(point.id, marker);
    });

    if (fittedPointsKeyRef.current !== fitPointsKey) {
      fittedPointsKeyRef.current = fitPointsKey;
      fitToPoints(model.points);
    }

    return () => {
      if (mapRef.current && layerGroupRef.current === layerGroup) {
        mapRef.current.removeLayer(layerGroup);
        layerGroupRef.current = null;
      }
    };
  }, [leafletReady, layerDataKey, fitPointsKey, model, filteredPoints, providerSettings, visiblePointIds]);

  useEffect(() => {
    const L = leafletRef.current;
    if (!leafletReady || !L) return;

    const previousId = selectedPointRef.current;
    const previousPoint = model.points.find((point) => point.id === previousId);
    const previousMarker = previousId ? markersRef.current.get(previousId) : null;
    if (previousMarker && previousPoint) previousMarker.setIcon(createMarkerIcon(L, previousPoint, false));

    const marker = selectedPoint ? markersRef.current.get(selectedPoint.id) : null;
    if (marker && selectedPoint) {
      marker.setIcon(createMarkerIcon(L, selectedPoint, true));
      marker.openTooltip();
    }
    selectedPointRef.current = selectedPoint?.id || null;
  }, [leafletReady, layerDataKey, model.points, selectedPoint]);

  useEffect(() => {
    if (!focusPhotoId || lastFocusPhotoIdRef.current === focusPhotoId) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    const focused = model.points.find((point) => point.id === focusPhotoId);
    if (!leafletReady || !L || !map || !focused) return;
    lastFocusPhotoIdRef.current = focusPhotoId;
    const latLng = L.latLng(focused.coordinates.latitude, focused.coordinates.longitude);
    if (!map.getBounds().pad(-0.08).contains(latLng)) {
      map.panInside(latLng, { padding: [80, 80], animate: true });
    }
  }, [focusPhotoId, leafletReady, model.points]);

  useEffect(() => () => {
    if (typeof window !== 'undefined' && window.__gpsCheckerMap === mapRef.current) {
      delete window.__gpsCheckerMap;
      delete window.__gpsCheckerMapLayer;
    }
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
          <StatusChip tone="neutral">обычная точка</StatusChip>
          <StatusChip tone="error">конфликт &lt; {thresholdMeters} м</StatusChip>
          <StatusChip tone="warning">RESERVE</StatusChip>
          <StatusChip tone="info">выбранная точка</StatusChip>
        </div>
        <div className="map-toolbar-actions">
          <label className="map-layer-field">
            <span>Слой карты</span>
            <select
              value={mapLayerId}
              onChange={(event) => handleMapLayerChange(event.target.value)}
              aria-label="Слой карты"
            >
              {MAP_LAYER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="button-secondary compact-button" onClick={fitVisiblePoints}>
            <Icon name="target" size={16} />
            Показать все точки
          </button>
          <button type="button" className="button-secondary compact-button" onClick={() => setPanelOpen((value) => !value)}>
            <Icon name={panelOpen ? 'chevronRight' : 'chevronLeft'} size={16} />
            {panelOpen ? 'Скрыть точки' : 'Показать точки'}
          </button>
        </div>
      </div>
      <p className="map-layer-description">{activeMapLayer.description}</p>
      {mapLayerError && <p className="map-layer-error" role="status">{mapLayerError}</p>}
      <div className="map-workspace">
        <div className="map-canvas" ref={containerRef} aria-label={`Карта точек: ${activeMapLayer.label}`} />
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
                <div><dt>Индекс</dt><dd>{indexDisplayText(selectedPoint.photo)}</dd></div>
                <div><dt>Файл</dt><dd>{selectedPoint.photo.displayFileName || selectedPoint.photo.fileName}</dd></div>
                <div><dt>Координаты</dt><dd>{formatCoordinates(selectedPoint.coordinates)}</dd></div>
                <div><dt>Качество</dt><dd>{selectedPoint.photo.coordinateQuality || 'missing'}</dd></div>
                <div><dt>Расстояние</dt><dd>{selectedPoint.photo.distanceStatus || 'pending'}</dd></div>
                <div><dt>Статус</dt><dd>{selectedPoint.reserve ? 'RESERVE' : 'ACTIVE'}</dd></div>
              </dl>
              {selectedPoint.photo.thumbnailDataUrl && <img className="selected-point-thumbnail" src={selectedPoint.photo.thumbnailDataUrl} alt="Локальная миниатюра точки" />}
              {model.conflicts.filter((line) => line.pointAId === selectedPoint.id || line.pointBId === selectedPoint.id).length > 0 && (
                <ul className="selected-point-conflicts">
                  {model.conflicts.filter((line) => line.pointAId === selectedPoint.id || line.pointBId === selectedPoint.id).map((line) => (
                    <li key={line.id}>{line.pointAId === selectedPoint.id ? line.pointBLabel : line.pointALabel}: {formatDistanceMeters(line.distanceMeters)} м</li>
                  ))}
                </ul>
              )}
              {onToggleReserve && (
                <button type="button" className="button-secondary compact-button" onClick={() => onToggleReserve(selectedPoint.id, !selectedPoint.reserve)}>
                  {selectedPoint.reserve ? 'Вернуть в ACTIVE' : 'В RESERVE'}
                </button>
              )}
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
                <span className={pointDotClassName(point, point.id === selectedPoint?.id)} aria-hidden="true" />
                <span>
                  <strong>{point.label}</strong>
                  <small>{indexDisplayText(point.photo)} · {point.photo.displayFileName || point.photo.fileName}</small>
                </span>
                <StatusChip tone={point.reserve ? 'warning' : point.distanceStatus === 'too_close' ? 'error' : point.lowPrecision || point.suspicious ? 'warning' : 'success'}>
                  {point.reserve ? 'RESERVE' : point.distanceStatus === 'too_close' ? 'конфликт' : point.photo.coordinateQuality || 'ok'}
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
            {recommendation?.conflictCount > 0 && (
              <div className="conflict-recommendation">
                <strong>{recommendation.strategy === 'exact-minimum' ? 'Минимальная рекомендация' : 'Bounded-рекомендация'}</strong>
                <p>{recommendation.message}</p>
                <p>В RESERVE: {recommendation.reservePhotoIds.length}; ACTIVE останется: {recommendation.activeAfterCount}.</p>
                <button type="button" onClick={() => onApplyRecommendation?.(recommendation)} disabled={!recommendation.reservePhotoIds.length}>Принять рекомендацию</button>
              </div>
            )}
            {model.missingCoordinates.length > 0 && <p>Без координат: {model.missingCoordinates.length}</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}
