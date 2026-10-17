import { pointMembers } from './core/photoPoints.js';

// Old completed manifests remain readable. New manifests also cover selection
// and field-only work; saved logical rows are never sent through groupPhotos.
export function validateRecovery(state) {
  const versioned = state?.schemaVersion === 1;
  if (state?.schemaVersion != null && !versioned) throw new Error('Recovery manifest invalid');
  if (!Array.isArray(state?.files) || !Array.isArray(state?.rows)
    || state.files.length > 100 || (!versioned && (!state.files.length || !state.rows.length))
    || !['ninjabox', 'onion', 'none'].includes(state.publisher)) throw new Error('Recovery manifest invalid');
  if (versioned && (!['selected', 'reviewing', 'processed'].includes(state.phase)
    || typeof state.indexMode !== 'boolean'
    || !['photos', 'map', 'about'].includes(state.screen)
    || ['session', 'color', 'packing', 'comment', 'onion'].some((key) => typeof state[key] !== 'string')
    || state.files.some((file) => !file.native || !/^[A-Za-z0-9-]{1,64}$/.test(file.id) || typeof file.name !== 'string')
    || new Set(state.files.map((file) => file.id)).size !== state.files.length
    || (state.phase === 'selected' ? state.rows.length !== 0 : !state.rows.length))) throw new Error('Recovery manifest invalid');
  if (versioned && state.phase === 'selected') return state;
  const validLinks = (links) => links == null || Array.isArray(links)
    && links.every((link) => typeof link?.url === 'string' && typeof link.provider === 'string');
  if (state.rows.some((point) => !point || point.members != null && !Array.isArray(point.members)
    || point.excludedMembers != null && !Array.isArray(point.excludedMembers)
    || point.memberUndo != null && !Array.isArray(point.memberUndo)
    || !validLinks(point.uploadResult?.links) || !validLinks(point.uploadResult?.staleLinks))) throw new Error('Recovery manifest invalid');
  const members = state.rows.flatMap((point) => [...pointMembers(point), ...(point.excludedMembers || [])]);
  const numbers = members.map((member) => member.number).sort((a, b) => a - b);
  if (numbers.length !== state.files.length || numbers.some((number, index) => number !== index + 1)
    || members.some((member) => typeof member.id !== 'string' || !member.id
      || member.fileName != null && typeof member.fileName !== 'string')
    || new Set(members.map((member) => member.id)).size !== members.length
    || new Set(state.rows.map((point) => point.id)).size !== state.rows.length
    || state.rows.some((point) => !point.id || point.members && !point.members.length
      || point.emptyFromMove && (!point.removed || point.members?.length !== 1)
      || point.statusOverride != null && !['main', 'reserve'].includes(point.statusOverride)
      || point.manualRepresentativeId && !pointMembers(point).some((member) => member.id === point.manualRepresentativeId)
        && !point.emptyFromMove)) throw new Error('Recovery manifest invalid');
  return state;
}

// One serialized writer: coalesce edits, flush on backgrounding, and drain any
// in-flight save before reset so it cannot resurrect a cleared job.
export function createRecoveryWriter({ save, clear, onError, delay = 300 }) {
  let pending = null;
  let timer;
  let chain = Promise.resolve();
  const flush = () => {
    clearTimeout(timer);
    if (!pending) return chain;
    const snapshot = pending;
    pending = null;
    chain = chain.then(() => save(snapshot, true)).catch(onError);
    return chain;
  };
  return {
    schedule(state) {
      pending = JSON.parse(JSON.stringify(validateRecovery(state)));
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush,
    async clear() {
      clearTimeout(timer); pending = null;
      await chain;
      await clear();
    },
    cancel() { clearTimeout(timer); pending = null; },
  };
}
