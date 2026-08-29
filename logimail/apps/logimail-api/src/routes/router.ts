import { getHealth } from '../services/ops-agent-service.js';

export type ApiRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  healthDetailAuthorized?: boolean;
};

export async function routeRequest(request: ApiRequest) {
  if (request.method === 'GET' && request.path === '/api/logimail/health') {
    const health = await getHealth();
    if (request.healthDetailAuthorized) return health;
    return { ok: health.ok, service: health.service, status: health.status };
  }

  return { ok: false, status: 404, error: 'not_found' };
}
