import { createServer } from 'node:http';
import { routeRequest } from './routes/router.js';

const port = Number(process.env.PORT ?? 8787);
const hostname = process.env.HOSTNAME ?? '127.0.0.1';

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const method = request.method ?? 'GET';

  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(method)) {
    response.writeHead(405, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: false, status: 405, error: 'method_not_allowed' }));
    return;
  }

  try {
    const detailKey = process.env.LOGIMAIL_HEALTH_DETAIL_KEY?.trim();
    const result = await routeRequest({
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: url.pathname,
      healthDetailAuthorized: Boolean(detailKey && request.headers['x-logimail-health-key'] === detailKey),
    });
    const status = 'status' in result && typeof result.status === 'number' ? result.status : 200;
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(result));
  } catch {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: false, status: 500, error: 'internal_error' }));
  }
});

server.listen(port, hostname, () => {
  console.log(`LogiMail API listening on http://${hostname}:${port}`);
});
