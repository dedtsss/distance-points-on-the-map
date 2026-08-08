import { loadSessionCollection } from './sessionRepository.js';
import { D1_LOCAL_MIGRATION_KEY, readD1MigrationMarker, writeD1MigrationMarker } from './d1SessionAdapter.js';

export function findLocalSessionsForD1Import(remoteSessions = [], storage = globalThis.localStorage) {
  const remoteIds = new Set((remoteSessions || []).map((session) => session.sessionId));
  return loadSessionCollection(storage).sessions.filter((session) => !remoteIds.has(session.sessionId));
}

export async function importLocalSessionsToD1({ sessions = [], adapter, storage = globalThis.localStorage, onProgress } = {}) {
  if (!adapter?.saveSession) throw new Error('D1 session adapter is unavailable.');
  const candidates = sessions.filter(Boolean);
  const imported = [];
  for (const session of candidates) {
    const remote = await adapter.saveSession(session);
    imported.push(remote || session);
    onProgress?.(imported.length, candidates.length, remote || session);
  }
  writeD1MigrationMarker({
    version: 1,
    completedAt: new Date().toISOString(),
    sessionIds: candidates.map((session) => session.sessionId),
  }, storage);
  return imported;
}

export function isD1MigrationComplete(storage = globalThis.localStorage) {
  return Boolean(readD1MigrationMarker(storage)?.completedAt);
}

export { D1_LOCAL_MIGRATION_KEY };
