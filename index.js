const express = require('express');
const cors = require('cors');
const axios = require('axios');
const chrono = require('chrono-node'); // Import chrono-node

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Use CORS to allow requests from any origin
app.use(cors());

// Our simple test endpoint
app.get('/ping', (req, res) => {
  console.log('Received a ping request!');
  res.json({ message: '✅ Hello from the Express.js server!' });
});

// Updated endpoint to add a task to Todoist with NLP
app.post('/add-task', async (req, res) => {
  const { taskContent } = req.body;

  if (!taskContent) {
    return res.status(400).json({ error: 'Task content is required.' });
  }

  const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN;

  if (!TODOIST_API_TOKEN) {
    console.error('TODOIST_API_TOKEN is not set in environment variables.');
    return res.status(500).json({ error: 'Server configuration error: Todoist API token missing.' });
  }

  // Use chrono-node to parse the date
  const parsedResult = chrono.parse(taskContent);

  let finalContent = taskContent;
  let dueString = null;

  if (parsedResult.length > 0) {
    const parsedDateText = parsedResult[0].text;
    dueString = parsedDateText;
    finalContent = taskContent.replace(parsedDateText, '').trim();
  }
  
  const payload = {
    content: finalContent,
  };

  if (dueString) {
    payload.due_string = dueString;
  }

  try {
    const todoistRes = await axios.post(
      'https://api.todoist.com/rest/v2/tasks',
      payload,
      {
        headers: {
          Authorization: `Bearer ${TODOIST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Task added to Todoist:', todoistRes.data);
    res.status(200).json({ message: 'Task added successfully!', task: todoistRes.data });
  } catch (error) {
    console.error('Error adding task to Todoist:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to add task to Todoist.', details: error.response ? error.response.data : error.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Express server listening on port ${PORT}`);
});
