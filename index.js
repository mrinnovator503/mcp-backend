const express = require('express');
const cors = require('cors'); // To handle requests from other domains

const app = express();

// Use CORS to allow requests from any origin (for debugging)
app.use(cors());

// Our simple test endpoint
app.get('/ping', (req, res) => {
  console.log('Received a ping request!');
  res.json({ message: '✅ Hello from the live MCP backend on Glitch!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP Server listening on port ${PORT}`);
});
