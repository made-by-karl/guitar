// WebCodecs requires a secure context. Localhost is trustworthy, unlike the
// Docker service hostname. Keep production browser security settings intact.
const http = require('node:http');
const upstream = new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4200');
const server = http.createServer((incoming, outgoing) => {
  const request = http.request(new URL(incoming.url, upstream), {
    method: incoming.method,
    headers: { ...incoming.headers, host: upstream.host }
  }, response => {
    outgoing.writeHead(response.statusCode, response.headers);
    response.pipe(outgoing);
  });
  request.on('error', () => { outgoing.writeHead(502); outgoing.end('App unavailable'); });
  incoming.once('aborted', () => request.destroy());
  outgoing.once('close', () => request.destroy());
  incoming.pipe(request);
});
server.listen(4201, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
