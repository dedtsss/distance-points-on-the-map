/**
 * Boundary for the production D1 repository. The frontend deliberately uses
 * the local repository until a Worker binding and authenticated API are
 * provisioned; it never pretends that a remote save succeeded.
 */
export function createD1SessionAdapter(request) {
  return {
    backend: 'd1',
    available: typeof request === 'function',
    async listSessions() {
      if (typeof request !== 'function') throw new Error('D1 adapter is not provisioned.');
      return request('/api/sessions');
    },
    async saveSession(session) {
      if (typeof request !== 'function') throw new Error('D1 adapter is not provisioned.');
      return request(`/api/sessions/${encodeURIComponent(session.sessionId)}`, {
        method: 'PUT',
        body: JSON.stringify(session),
      });
    },
  };
}
