const http = require('http');

const server = http.createServer((req, res) => {
  // Check if the request is for the /ping endpoint
  if (req.url === '/ping' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*' // Manually add CORS header for simplicity
    });
    res.end(JSON.stringify({ message: '✅ Hello from the native Node.js server!' }));
  } else {
    // For any other path, respond with 404 Not Found
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Native Node.js server listening on port ${PORT}`);
});
