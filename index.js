const express = require('express');
const cors = require('cors');
const axios = require('axios');
const chrono = require('chrono-node');
const { google } = require('googleapis'); // Add googleapis import
const multer = require('multer');
const { createWorker } = require('tesseract.js');

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Use CORS to allow requests from any origin
app.use(cors());

// --- UTILITY FUNCTIONS FOR GOOGLE SHEETS ---
async function getGoogleSheetClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS);
  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}


// --- TASKS ENDPOINTS ---

// GET /ping (for testing connection)
app.get('/ping', (req, res) => {
  console.log('Received a ping request!');
  res.json({ message: '✅ Hello from the Express.js server!' });
});

// POST /add-task (with NLP)
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

  const parsedResult = chrono.parse(taskContent);
  let finalContent = taskContent;
  let dueString = null;
  if (parsedResult.length > 0) {
    const parsedDateText = parsedResult[0].text;
    dueString = parsedDateText;
    finalContent = taskContent.replace(parsedDateText, '').trim();
  }
  
  const payload = { content: finalContent };
  if (dueString) {
    payload.due_string = dueString;
  }

  try {
    const todoistRes = await axios.post('https://api.todoist.com/rest/v2/tasks', payload, {
      headers: { Authorization: `Bearer ${TODOIST_API_TOKEN}`, 'Content-Type': 'application/json' },
    });
    console.log('Task added to Todoist:', todoistRes.data);
    res.status(200).json({ message: 'Task added successfully!', task: todoistRes.data });
  } catch (error) {
    console.error('Error adding task to Todoist:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to add task to Todoist.', details: error.response ? error.response.data : error.message });
  }
});

// POST /sync-tasks (now organizes by project)
app.post('/sync-tasks', async (req, res) => {
  // Security check for internal API key - this endpoint is for frontend use without key
  // We can re-add internal API key for direct curl access later if needed, but not for frontend
  const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN;
  if (!TODOIST_API_TOKEN) {
    console.error('TODOIST_API_TOKEN is not set in environment variables.');
    return res.status(500).json({ error: 'Server configuration error: Todoist API token missing.' });
  }

  try {
    // 1. Create API client instance
    const apiClient = axios.create({
      baseURL: 'https://api.todoist.com/rest/v2',
      headers: { Authorization: `Bearer ${TODOIST_API_TOKEN}` },
    });

    // 2. Fetch all projects and tasks, then filter out completed tasks
    const [projectsRes, tasksRes] = await Promise.all([
      apiClient.get('/projects'),
      apiClient.get('/tasks'),
    ]);
    const projects = projectsRes.data;
    const tasks = tasksRes.data.filter(task => !task.is_completed); // Filter out completed tasks

    // 3. Group tasks by project_id
    const tasksByProject = new Map();
    tasks.forEach(task => {
      if (!tasksByProject.has(task.project_id)) {
        tasksByProject.set(task.project_id, []);
      }
      tasksByProject.get(task.project_id).push(task);
    });

    // 4. Sort projects by their order
    projects.sort((a,b) => a.order - b.order);

    // 5. Return the structured task data grouped by project
    console.log(`Successfully fetched ${tasks.length} tasks from ${projects.length} projects.`);
    
    // Create a simplified structure for the frontend
    const projectData = projects.map(project => {
      const projectTasks = (tasksByProject.get(project.id) || [])
        .sort((a,b) => a.order - b.order)
        .map(task => ({
          id: task.id,
          content: task.content,
          is_completed: task.is_completed,
          due: task.due ? task.due.string : null,
          project_id: task.project_id
        }));
      return {
        id: project.id,
        name: project.name,
        tasks: projectTasks
      };
    });

    res.status(200).json({
      message: `Successfully fetched ${tasks.length} tasks from ${projects.length} projects.`,
      data: projectData // Return structured project and task data
    });

  } catch (error) {
    console.error('Error syncing tasks:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to sync tasks.', details: error.response ? error.response.data : error.message });
  }
});

// POST /complete-task
app.post('/complete-task', async (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ error: 'Task ID is required.' });
  }

  const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN;
  if (!TODOIST_API_TOKEN) {
    console.error('TODOIST_API_TOKEN is not set in environment variables.');
    return res.status(500).json({ error: 'Server configuration error: Todoist API token missing.' });
  }

  const url = `https://api.todoist.com/rest/v2/tasks/${taskId}/close`;

  try {
    await axios.post(url, null, { // No body needed for this request
      headers: { Authorization: `Bearer ${TODOIST_API_TOKEN}` },
    });
    console.log(`Task ${taskId} completed in Todoist.`);
    res.status(200).json({ message: 'Task completed successfully!' });
  } catch (error) {
    console.error(`Error completing task ${taskId} in Todoist:`, error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to complete task.', details: error.response ? error.response.data : error.message });
  }
});

// POST /reopen-task
app.post('/reopen-task', async (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ error: 'Task ID is required.' });
  }

  const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN;
  if (!TODOIST_API_TOKEN) {
    console.error('TODOIST_API_TOKEN is not set in environment variables.');
    return res.status(500).json({ error: 'Server configuration error: Todoist API token missing.' });
  }

  const url = `https://api.todoist.com/rest/v2/tasks/${taskId}/reopen`;

  try {
    await axios.post(url, null, { // No body needed for this request
      headers: { Authorization: `Bearer ${TODOIST_API_TOKEN}` },
    });
    console.log(`Task ${taskId} re-opened in Todoist.`);
    res.status(200).json({ message: 'Task re-opened successfully!' });
  } catch (error) {
    console.error(`Error reopening task ${taskId} in Todoist:`, error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to re-open task.', details: error.response ? error.response.data : error.message });
  }
});

// POST /log-expense (manual entry)
app.post('/log-expense', async (req, res) => {
  const { item, amount, category, paymentMethod, notes } = req.body;
  if (!item || !amount) {
    return res.status(400).json({ error: 'Item and Amount are required.' });
  }

  const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const GOOGLE_SHEETS_CREDENTIALS = process.env.GOOGLE_SHEETS_CREDENTIALS;

  if (!GOOGLE_SHEET_ID || !GOOGLE_SHEETS_CREDENTIALS) {
    console.error('Google Sheets credentials or sheet ID missing.');
    return res.status(500).json({ error: 'Server configuration error: Google Sheets credentials missing.' });
  }

  try {
    const sheets = await getGoogleSheetClient();
    const now = new Date();
    const timestamp = now.toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(',', ''); // Format as DD/MM/YYYY HH:MM:SS, remove comma

    const values = [
      [
        timestamp,
        category || '', // Use provided category or empty string
        item,
        amount,
        paymentMethod || '', // Use provided payment method or empty string
        notes || '' // Use provided notes or empty string
      ]
    ];

    const range = 'A:F'; // Let the API default to the first visible sheet

    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: { values: values },
    });

    console.log('Expense logged to Google Sheet:', values);
    res.status(200).json({ message: 'Expense logged successfully!' });
  } catch (error) {
    console.error('Error logging expense to Google Sheet:', error.message);
    res.status(500).json({ error: 'Failed to log expense.', details: error.message });
  }
});

// POST /log-expense-image (OCR entry)
const upload = multer({ storage: multer.memoryStorage() });
app.post('/log-expense-image', upload.single('expenseImage'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  console.log('Received image for OCR processing...');

  try {
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(req.file.buffer);
    await worker.terminate();

    console.log('OCR Result:', text);

    // Smarter parsing logic
    const numbers = (text.match(/[\d,]+\.?\d*/g) || [])
      .map(s => s.replace(/,/g, '')) // Remove commas
      .filter(s => s.length > 0 && s.length < 12) // Filter out empty strings and very long numbers (like IDs)
      .map(s => parseFloat(s))
      .filter(n => !isNaN(n) && n > 0); // Filter out non-numbers and zeros

    if (numbers.length === 0) {
      throw new Error('No valid numbers found in the image text.');
    }

    // Assume the largest number found is the amount
    const amount = Math.max(...numbers);
    
    if (!amount) {
      throw new Error('Could not automatically detect a valid expense amount from image.');
    }

    // Now, log it to Google Sheets
    const sheets = await getGoogleSheetClient();
    const now = new Date();
    const timestamp = now.toLocaleString('en-IN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).replace(',', '');

    const values = [[timestamp, 'Auto-detect', 'Auto-detected from Image', amount, 'UPI', 'OCR Scan']];
    const range = 'A:F';

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: { values: values },
    });

    console.log('OCR expense logged to Google Sheet:', values);
    res.status(200).json({ message: 'Expense successfully logged via OCR!', detectedAmount: amount });

  } catch (error) {
    console.error('Error during OCR processing or logging:', error.message);
    res.status(500).json({ error: 'Failed to process image and log expense.', details: error.message });
  }
});


// --- SERVER LISTENER ---

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Express server listening on port ${PORT}`);
});
