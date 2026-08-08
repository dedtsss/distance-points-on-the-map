import { restoreSessionPhotos, serializePhotoForSession } from './sessionStore.js';
import {
  SESSION_SCHEMA_VERSION,
  createSession,
  getSessionMetrics,
  updateSessionRecord,
} from './sessionDomain.js';

export const SESSION_REPOSITORY_KEY = 'dark-cat-crm-sessions-v1';
export const SESSION_REPOSITORY_BACKEND = 'localStorage';

const emptyCollection = () => ({
  schemaVersion: SESSION_SCHEMA_VERSION,
  nextSessionNumber: 1,
  sessions: [],
});

const safeStorage = (storage) => storage || globalThis.localStorage;

const normalizedNumber = (value, fallback) => Math.max(1, Math.floor(Number(value) || fallback));

const serializeSession = (session) => {
  const serializedPhotos = (session?.photos || []).map(serializePhotoForSession);
  const normalized = createSession({ ...session, photos: serializedPhotos });
  return {
    ...normalized,
    photos: serializedPhotos,
    ...getSessionMetrics(serializedPhotos),
  };
};

const normalizeCollection = (value) => {
  if (!value || !Array.isArray(value.sessions)) return emptyCollection();
  const sessions = value.sessions
    .filter((session) => session?.sessionId)
    .map((session, index) => serializeSession({
      ...session,
      sessionNumber: normalizedNumber(session.sessionNumber, index + 1),
    }));
  const maxNumber = Math.max(0, ...sessions.map((session) => session.sessionNumber));
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    nextSessionNumber: Math.max(maxNumber + 1, normalizedNumber(value.nextSessionNumber, maxNumber + 1)),
    sessions,
  };
};

export function loadSessionCollection(storage) {
  try {
    const parsed = JSON.parse(safeStorage(storage)?.getItem(SESSION_REPOSITORY_KEY) || 'null');
    return normalizeCollection(parsed);
  } catch {
    return emptyCollection();
  }
}

export function saveSessionCollection(collection, storage) {
  const normalized = normalizeCollection(collection);
  safeStorage(storage)?.setItem(SESSION_REPOSITORY_KEY, JSON.stringify(normalized));
  return normalized;
}

export function listStoredSessions(storage) {
  return loadSessionCollection(storage).sessions
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
}

export function getNextSessionNumber(storage) {
  return loadSessionCollection(storage).nextSessionNumber;
}

export function saveSessionRecord(session, storage) {
  const collection = loadSessionCollection(storage);
  const existing = collection.sessions.find((item) => item.sessionId === session?.sessionId);
  const sessionNumber = existing?.sessionNumber || normalizedNumber(session?.sessionNumber, collection.nextSessionNumber);
  const next = serializeSession(updateSessionRecord(existing || createSession({
    ...session,
    sessionNumber,
  }), {
    ...session,
    sessionNumber,
    createdAt: existing?.createdAt || session?.createdAt,
  }));
  const sessions = existing
    ? collection.sessions.map((item) => item.sessionId === next.sessionId ? next : item)
    : [...collection.sessions, next];
  const saved = saveSessionCollection({
    ...collection,
    nextSessionNumber: Math.max(collection.nextSessionNumber, sessionNumber + 1),
    sessions,
  }, storage);
  return saved.sessions.find((item) => item.sessionId === next.sessionId) || next;
}

export function createStoredSession(input = {}, storage) {
  const collection = loadSessionCollection(storage);
  return saveSessionRecord(createSession({
    ...input,
    sessionNumber: collection.nextSessionNumber,
  }), storage);
}

export function deleteStoredSession(sessionId, storage) {
  const collection = loadSessionCollection(storage);
  const next = saveSessionCollection({
    ...collection,
    sessions: collection.sessions.filter((session) => session.sessionId !== sessionId),
  }, storage);
  return next.sessions;
}

export function restoreStoredSession(session) {
  if (!session) return null;
  return {
    ...session,
    photos: restoreSessionPhotos(session),
  };
}

export function sessionStorageDiagnostics(storage) {
  try {
    const collection = loadSessionCollection(storage);
    return {
      backend: SESSION_REPOSITORY_BACKEND,
      schemaVersion: collection.schemaVersion,
      sessionCount: collection.sessions.length,
      nextSessionNumber: collection.nextSessionNumber,
      persistent: true,
    };
  } catch (error) {
    return {
      backend: SESSION_REPOSITORY_BACKEND,
      persistent: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
