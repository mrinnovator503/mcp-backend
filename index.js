const express = require('express');
const cors = require('cors');

const app = express();

// Use CORS to allow requests from any origin
app.use(cors());

// Our simple test endpoint
app.get('/ping', (req, res) => {
  console.log('Received a ping request!');
  res.json({ message: '✅ Hello from the Express.js server!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Express server listening on port ${PORT}`);
});
