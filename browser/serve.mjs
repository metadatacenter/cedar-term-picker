/**
 * A static server for the built bundle, and nothing more.
 *
 * The tests drive what ships rather than what `ng serve` assembles: a build that breaks the bundle
 * while leaving the dev server working is exactly the failure worth catching, and this session met
 * its cousin — a browser holding a stale bundle while the source was already fixed.
 *
 * Hand-written rather than a dependency, because twenty lines that serve four files are cheaper to
 * keep than a package to audit.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../dist/cedar-term-picker/browser/', import.meta.url).pathname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
};

createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  const file = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  try {
    const body = await readFile(join(root, file));
    // No caching: a test run straight after a rebuild must not be served the previous build.
    response.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
}).listen(Number(process.env.PORT ?? 4599));
