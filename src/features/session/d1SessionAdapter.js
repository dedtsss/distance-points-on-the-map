import { serializePhotoForSession } from './sessionStore.js';

export const D1_LOCAL_MIGRATION_KEY = 'dark-cat-d1-local-migration-v1';

const removeBrowserOnlyState = (session = {}) => ({
  ...session,
  photos: (session.photos || []).map((photo) => {
    const serialized = serializePhotoForSession(photo);
    return {
      ...serialized,
      // D1 is metadata/link storage, never an image/blob store.
      thumbnailDataUrl: null,
    };
  }),
});

const parseResponse = async (response) => {
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.error || `Session API request failed (${response.status}).`);
    error.status = response.status;
    error.remote = true;
    throw error;
  }
  return payload || {};
};

const normalizeRequest = (request) => {
  if (typeof request !== 'function') return null;
  return async (path, options = {}) => {
    const response = await request(path, {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    if (response && typeof response.json === 'function' && 'ok' in response) return parseResponse(response);
    return response;
  };
};

export function createD1SessionAdapter(request = globalThis.fetch?.bind(globalThis)) {
  const invoke = normalizeRequest(request);
  return {
    backend: 'd1',
    available: Boolean(invoke),
    async listSessions() {
      if (!invoke) throw new Error('D1 adapter is not provisioned.');
      return invoke('/api/sessions');
    },
    async getSession(sessionId) {
      if (!invoke) throw new Error('D1 adapter is not provisioned.');
      const payload = await invoke(`/api/sessions/${encodeURIComponent(sessionId)}`);
      return payload.session;
    },
    async saveSession(session) {
      if (!invoke) throw new Error('D1 adapter is not provisioned.');
      const payload = await invoke(`/api/sessions/${encodeURIComponent(session.sessionId)}`, {
        method: 'PUT',
        body: JSON.stringify(removeBrowserOnlyState(session)),
      });
      return payload.session;
    },
    async deleteSession(sessionId) {
      if (!invoke) throw new Error('D1 adapter is not provisioned.');
      return invoke(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    },
    async dashboard() {
      if (!invoke) throw new Error('D1 adapter is not provisioned.');
      const payload = await invoke('/api/dashboard');
      return payload.dashboard;
    },
  };
}

export function readD1MigrationMarker(storage = globalThis.localStorage) {
  try { return JSON.parse(storage?.getItem(D1_LOCAL_MIGRATION_KEY) || 'null'); } catch { return null; }
}

export function writeD1MigrationMarker(marker, storage = globalThis.localStorage) {
  storage?.setItem(D1_LOCAL_MIGRATION_KEY, JSON.stringify(marker));
  return marker;
}
