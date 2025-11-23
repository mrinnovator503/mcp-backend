const express = require('express');
const cors = require('cors');
const axios = require('axios');
const chrono = require('chrono-node');

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// Use CORS to allow requests from any origin
app.use(cors());

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


// --- SERVER LISTENER ---

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Express server listening on port ${PORT}`);
});
