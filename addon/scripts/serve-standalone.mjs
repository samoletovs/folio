import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { addonRoot, isMainModule } from './paths.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' http://127.0.0.1:11434; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

export async function createStandaloneServer(directory = join(addonRoot, 'dist-web')) {
  const root = await realpath(directory);
  if (!(await stat(join(root, 'index.html'))).isFile()) throw new Error('Build the standalone app with npm run build:standalone first.');
  const server = createServer(async (request, response) => {
    const fail = (status, message) => { response.writeHead(status, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }); response.end(message); };
    const address = server.address();
    if (!address || typeof address === 'string' || request.headers.host !== `127.0.0.1:${address.port}`) { fail(421, 'Use the exact local folio address.'); return; }
    if (request.method !== 'GET' && request.method !== 'HEAD') { fail(405, 'Only static local files are served.'); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${request.headers.host}`).pathname); }
    catch { fail(400, 'Invalid local path.'); return; }
    if (pathname.includes('\\') || pathname.includes('\0') || (pathname !== '/' && !pathname.startsWith('/assets/'))) { fail(404, 'Not found.'); return; }
    const candidate = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`);
    try {
      const file = await realpath(candidate);
      const rel = relative(root, file);
      const type = TYPES[extname(file)];
      if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || !type || !(await stat(file)).isFile()) {
        fail(404, 'Not found.'); return;
      }
      const bytes = await readFile(file);
      response.writeHead(200, { ...HEADERS, 'Content-Type': type, 'Content-Length': bytes.byteLength });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') fail(404, 'Not found.');
      else { console.error('A local static asset could not be read. Rebuild folio and check file permissions.'); fail(500, 'Local asset unavailable.'); }
    }
  });
  return server;
}
if (isMainModule(import.meta.url)) {
  try {
    const server = await createStandaloneServer();
    server.on('error', () => { console.error('Cannot start folio on 127.0.0.1:4179. Stop the existing folio server or free that port.'); process.exitCode = 1; });
    server.listen(4179, '127.0.0.1', () => console.log('folio is running locally at http://127.0.0.1:4179/ (financial data stays in encrypted browser storage).'));
    const stop = () => { server.close(); server.closeAllConnections(); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch { console.error('Standalone files are unavailable. Run npm run build:standalone before npm start.'); process.exitCode = 1; }
}
