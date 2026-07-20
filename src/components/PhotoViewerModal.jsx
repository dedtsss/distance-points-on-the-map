import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import './PhotoViewerModal.css';

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
const INITIAL_TRANSFORM = Object.freeze({ x: 0, y: 0, scale: 1 });

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const distanceBetween = (left, right) => Math.hypot(right.x - left.x, right.y - left.y);
const centerBetween = (left, right) => ({ x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 });

export default function PhotoViewerModal({ open, photo, onClose }) {
  const [source, setSource] = useState('');
  const [usingOriginal, setUsingOriginal] = useState(false);
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);
  const stageRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const transformRef = useRef(INITIAL_TRANSFORM);

  const applyTransform = (next) => {
    const normalized = {
      x: Number(next.x) || 0,
      y: Number(next.y) || 0,
      scale: clamp(Number(next.scale) || 1, MIN_SCALE, MAX_SCALE),
    };
    transformRef.current = normalized;
    setTransform(normalized);
  };

  useEffect(() => {
    if (!open || !photo) {
      setSource('');
      setUsingOriginal(false);
      return undefined;
    }

    const fullImage = photo.stableFile || photo.stableBlob || null;
    if (fullImage && globalThis.URL?.createObjectURL) {
      const objectUrl = URL.createObjectURL(fullImage);
      setSource(objectUrl);
      setUsingOriginal(true);
      return () => URL.revokeObjectURL(objectUrl);
    }

    setSource(photo.thumbnailDataUrl || '');
    setUsingOriginal(false);
    return undefined;
  }, [open, photo?.id, photo?.stableFile, photo?.stableBlob, photo?.thumbnailDataUrl]);

  useEffect(() => {
    if (!open) return undefined;
    applyTransform(INITIAL_TRANSFORM);
    pointersRef.current.clear();
    gestureRef.current = null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === '+' || event.key === '=') {
        const current = transformRef.current;
        applyTransform({ ...current, scale: current.scale * 1.25 });
      }
      if (event.key === '-') {
        const current = transformRef.current;
        applyTransform({ ...current, scale: current.scale / 1.25 });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, photo?.id, onClose]);

  if (!open || !photo) return null;

  const startGestureFromPointers = () => {
    const points = [...pointersRef.current.entries()];
    const current = transformRef.current;
    if (points.length === 1) {
      gestureRef.current = {
        type: 'pan',
        pointerId: points[0][0],
        startPoint: points[0][1],
        startTransform: current,
      };
      return;
    }

    if (points.length >= 2) {
      const [first, second] = points;
      const startCenter = centerBetween(first[1], second[1]);
      const rect = stageRef.current?.getBoundingClientRect();
      gestureRef.current = {
        type: 'pinch',
        pointerIds: [first[0], second[0]],
        startDistance: Math.max(1, distanceBetween(first[1], second[1])),
        startCenter,
        stageCenter: rect
          ? { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) }
          : startCenter,
        startTransform: current,
      };
    }
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    startGestureFromPointers();
  };

  const handlePointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.type === 'pan') {
      const currentPoint = pointersRef.current.get(gesture.pointerId);
      if (!currentPoint) return;
      applyTransform({
        ...gesture.startTransform,
        x: gesture.startTransform.x + currentPoint.x - gesture.startPoint.x,
        y: gesture.startTransform.y + currentPoint.y - gesture.startPoint.y,
      });
      return;
    }

    const first = pointersRef.current.get(gesture.pointerIds[0]);
    const second = pointersRef.current.get(gesture.pointerIds[1]);
    if (!first || !second) return;
    const currentDistance = Math.max(1, distanceBetween(first, second));
    const currentCenter = centerBetween(first, second);
    const scaleRatio = currentDistance / gesture.startDistance;
    const nextScale = clamp(gesture.startTransform.scale * scaleRatio, MIN_SCALE, MAX_SCALE);
    const effectiveRatio = nextScale / gesture.startTransform.scale;
    const centerOffset = {
      x: gesture.startCenter.x - gesture.stageCenter.x,
      y: gesture.startCenter.y - gesture.stageCenter.y,
    };
    applyTransform({
      scale: nextScale,
      x: gesture.startTransform.x
        + currentCenter.x - gesture.startCenter.x
        - (centerOffset.x * (effectiveRatio - 1)),
      y: gesture.startTransform.y
        + currentCenter.y - gesture.startCenter.y
        - (centerOffset.y * (effectiveRatio - 1)),
    });
  };

  const finishPointer = (event) => {
    pointersRef.current.delete(event.pointerId);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    gestureRef.current = null;
    startGestureFromPointers();
  };

  const changeScale = (factor) => {
    const current = transformRef.current;
    applyTransform({ ...current, scale: current.scale * factor });
  };

  const handleWheel = (event) => {
    event.preventDefault();
    changeScale(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  return (
    <div
      className="photo-viewer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section className="photo-viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-viewer-title">
        <header className="photo-viewer-header">
          <div>
            <p>Фото {photo.number}</p>
            <h2 id="photo-viewer-title">{photo.displayFileName || photo.internalName || photo.fileName}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть просмотр фотографии">
            <Icon name="close" />
          </button>
        </header>

        <div
          ref={stageRef}
          className="photo-viewer-stage"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onWheel={handleWheel}
          aria-label="Область просмотра. Перетаскивайте одним пальцем, масштабируйте двумя."
        >
          {source ? (
            <img
              className="photo-viewer-image"
              src={source}
              alt={photo.fileName}
              draggable="false"
              style={{ transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})` }}
            />
          ) : (
            <div className="photo-viewer-unavailable">
              <Icon name="image" size={34} />
              <p>Полная копия фотографии уже освобождена из памяти, а превью недоступно.</p>
            </div>
          )}
        </div>

        <footer className="photo-viewer-controls">
          <div className="photo-viewer-zoom-controls">
            <button type="button" className="button-secondary compact-button" onClick={() => changeScale(1 / 1.25)} aria-label="Уменьшить">
              <span aria-hidden="true">−</span>
            </button>
            <output aria-live="polite">{Math.round(transform.scale * 100)}%</output>
            <button type="button" className="button-secondary compact-button" onClick={() => changeScale(1.25)} aria-label="Увеличить">
              <span aria-hidden="true">+</span>
            </button>
            <button type="button" className="button-secondary compact-button" onClick={() => applyTransform(INITIAL_TRANSFORM)}>
              Вписать
            </button>
          </div>
          <p>{usingOriginal ? 'Открыта полная копия из памяти приложения.' : 'Открыто сохранённое превью; полная копия уже очищена.'}</p>
        </footer>
      </section>
    </div>
  );
}
