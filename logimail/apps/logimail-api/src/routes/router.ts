import { getHealth } from '../services/ops-agent-service.js';

export type ApiRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
};

export function routeRequest(request: ApiRequest) {
  if (request.method === 'GET' && request.path === '/api/logimail/health') {
    return getHealth();
  }

  return { ok: false, status: 404, error: 'not_found' };
}
