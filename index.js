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

// POST /sync-tasks (now organizes by project and is secured)
app.post('/sync-tasks', async (req, res) => {
  // Security check for internal API key
  const internalApiKey = req.header('x-internal-api-key');
  if (!internalApiKey || internalApiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid internal API key.' });
  }

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

    // 2. Fetch all projects and tasks in parallel
    const [projectsRes, tasksRes] = await Promise.all([
      apiClient.get('/projects'),
      apiClient.get('/tasks'),
    ]);
    const projects = projectsRes.data;
    const tasks = tasksRes.data;

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

    // 5. Format tasks into a markdown string, organized by project
    let markdownContent = '# My Tasks (Synced)\n\n';
    projects.forEach(project => {
      markdownContent += `## ${project.name}\n\n`;
      const projectTasks = tasksByProject.get(project.id) || [];
      if (projectTasks.length === 0) {
        markdownContent += 'No tasks in this project.\n\n';
      } else {
        projectTasks.sort((a,b) => a.order - b.order).forEach(task => {
          let taskLine = `- [ ] ${task.content}`;
          if (task.due) {
            taskLine += ` (Due: ${task.due.string})`;
          }
          markdownContent += taskLine + '\n';
        });
        markdownContent += '\n';
      }
    });

    // 6. Return the markdown content in the response
    console.log(`Successfully formatted ${tasks.length} tasks from ${projects.length} projects.`);
    res.status(200).json({
      message: `Successfully formatted ${tasks.length} tasks from ${projects.length} projects.`,
      markdown: markdownContent
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
