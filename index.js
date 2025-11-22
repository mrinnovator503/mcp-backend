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

// Listen for requests
const listener = app.listen(process.env.PORT, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});
