import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  tone = 'danger',
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const timer = globalThis.setTimeout(() => cancelRef.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.();
      if (event.key !== 'Tab') return;
      const focusable = [...document.querySelectorAll('.confirm-dialog button')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel?.();
    }}>
      <section className={`confirm-dialog confirm-dialog-${tone}`} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="dialog-icon" aria-hidden="true">
          <Icon name={tone === 'danger' ? 'warning' : 'info'} size={24} />
        </div>
        <div>
          <h2 id="confirm-title">{title}</h2>
          {children && <p>{children}</p>}
          <div className="dialog-actions">
            <button type="button" className="button-secondary" onClick={onCancel} ref={cancelRef}>{cancelLabel}</button>
            <button type="button" className={tone === 'danger' ? 'danger-button' : ''} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
