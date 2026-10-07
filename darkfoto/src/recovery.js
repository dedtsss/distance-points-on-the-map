import { pointMembers } from './core/photoPoints.js';

// Accept 0.3.6 flat manifests unchanged; never regroup completed old links.
export function validateRecovery(state) {
  if (!Array.isArray(state?.files) || !Array.isArray(state?.rows)
    || !state.files.length || state.files.length > 100 || !state.rows.length
    || !['ninjabox', 'onion', 'none'].includes(state.publisher)) throw new Error('Recovery manifest invalid');
  const members = state.rows.flatMap(pointMembers);
  const numbers = members.map((member) => member.number).sort((a, b) => a - b);
  if (numbers.length !== state.files.length || numbers.some((number, index) => number !== index + 1)
    || new Set(members.map((member) => member.id)).size !== members.length
    || state.rows.some((point) => point.members && !point.members.length)) throw new Error('Recovery manifest invalid');
  return state;
}
