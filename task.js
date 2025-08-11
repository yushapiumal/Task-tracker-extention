document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const loginScreen = document.getElementById("login-screen");
  const taskScreen = document.getElementById("task-screen");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("login-btn");
  const loginError = document.getElementById("login-error");
  const rememberMe = document.getElementById("remember-me");
  const logoutBtn = document.getElementById("logout-btn");
  const usernameDisplay = document.getElementById("username-display");
  const taskInput = document.getElementById("task-input");
  const searchAddBtn = document.getElementById("search-add-btn");
  const taskList = document.getElementById("task-list");
  const taskCount = document.getElementById("task-count");
  const emptyState = document.getElementById("empty-state");
  const timerContainer = document.getElementById("timer-container");
  const searchAddIcon = document.getElementById("search-add-icon");
  const searchAddText = document.getElementById("search-add-text");
  const taskModal = document.getElementById("task-modal");

  let activeTaskId = null;
  let timers = {};
  let tasks = []; // Store tasks locally
  const reminders = {};

  const API_BASE_URL = "https://dtbl.go.digitable.io:3004/neverdone/api";
  checkAuth();

  // Event Listeners
  loginBtn.addEventListener("click", handleLogin);
  logoutBtn.addEventListener("click", handleLogout);
  searchAddBtn.addEventListener("click", handleSearchAddClick);
  taskInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") addTask();
  });

  function checkAuth() {
    chrome.storage.local.get(
      ["username", "password", "rememberMe", "authData", "activeTask", "tasks"],
      (result) => {
        if (result.authData) {
          showTaskScreen(result.authData.username);
          if (result.rememberMe && result.username && result.password) {
            usernameInput.value = result.username;
            passwordInput.value = result.password;
          }
          tasks = result.tasks || [];
          if (result.activeTask) {
            activeTaskId = result.activeTask.taskId;
            startTimer(activeTaskId, new Date(result.activeTask.startTime));
          }
          loadTasks(result.authData.username);
        } else {
          showLoginScreen();
        }
      }
    );
  }

  function showLoginScreen() {
    loginScreen.classList.remove("hidden");
    taskScreen.classList.add("hidden");
  }

  function showTaskScreen(email) {
    loginScreen.classList.add("hidden");
    taskScreen.classList.remove("hidden");
    usernameDisplay.textContent = email;
    loadTasks(email);
  }

  function handleLogin() {
    const email = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      showError("Please enter both username and password");
      return;
    }

    loginError.classList.add("hidden");

    fetch(`${API_BASE_URL}/users/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.authenticated) {
          const storageData = {
            authData: data,
            rememberMe: rememberMe.checked,
          };

          if (rememberMe.checked) {
            storageData.username = email;
            storageData.password = password;
          }

          chrome.storage.local.set(storageData, () => {
            showTaskScreen(data.username);
          });
        } else {
          showError("Invalid credentials");
        }
      })
      .catch((error) => {
        console.error("Login error:", error);
        showError("Login failed. Please try again.");
      });
  }

  function handleLogout() {
    chrome.storage.local.remove(
      ["email", "password", "rememberMe", "authData", "activeTask", "tasks"],
      () => {
        usernameInput.value = "";
        passwordInput.value = "";
        activeTaskId = null;
        tasks = [];
        Object.keys(timers).forEach((taskId) => stopTimer(taskId));
        showLoginScreen();
      }
    );
  }

  function showError(message) {
    loginError.textContent = message;
    loginError.classList.remove("hidden");
  }

  function loadTasks(email) {
    chrome.storage.local.get(["authData"], (result) => {
      const token = result.authData?.token;

      if (!token) {
        console.error("No token found in local storage.");
        showError("Authentication required. Please sign in again.");
        return;
      }

      fetch(`${API_BASE_URL}/tasks?archived=false&unassigned=false`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      })
        .then((response) => response.json())
        .then((data) => {
          if (data && data.tasks) {
            chrome.storage.local.get(["activeTask"], (result) => {
              const active = result.activeTask;

              // Patch active task startTime
              tasks = data.tasks.map((task) => {
                if (active && task._id === active.taskId) {
                  console.log(`Patching startTime for active task ${task._id}`);
                  return {
                    ...task,
                    status: "inprogress",
                    startTime: active.startTime,
                  };
                }
                return task;
              });

              chrome.storage.local.set({ tasks: tasks }, () => {
                renderTasks(tasks);
              });
            });
          } else {
            tasks = [];
            chrome.storage.local.set({ tasks: tasks }, () => {
              renderTasks([]);
            });
          }
        })
        .catch((error) => {
          console.error("Error loading tasks:", error);
          renderTasks([]);
        });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    taskList = document.getElementById("task-list");
    taskCount = document.getElementById("task-count");
    emptyState = document.getElementById("empty-state");
    timerContainer = document.getElementById("timer-container");

    // Initialize timers after DOM is ready
    initializeTimers();
  });

  function renderTasks(tasks) {
    console.log(
      "renderTasks: Rendering tasks:",
      tasks,
      "activeTaskId:",
      activeTaskId
    );
    taskList.innerHTML = "";

    if (!tasks || tasks.length === 0) {
      emptyState.classList.remove("hidden");
      taskCount.textContent = "0 tasks";
      timerContainer.classList.add("hidden");
      return;
    }

    emptyState.classList.add("hidden");
    taskCount.textContent = `${tasks.length} ${
      tasks.length === 1 ? "task" : "tasks"
    }`;
    timerContainer.classList.remove("hidden");

    tasks.forEach((task) => {
      const li = document.createElement("li");
      li.className = "task-item";
      li.setAttribute("data-id", task._id);

      const isActive = task._id === activeTaskId;
      const actionClass = isActive ? "action-end" : "action-start";
      const actionText = isActive ? "End Task" : "Start";

      let durationDisplay = task.duration
        ? `<span class="task-duration">Worked: ${task.duration}</span>`
        : "";

      li.innerHTML = `
        <div class="task-content">
          <span class="task-title">${task.task}</span>
          <div class="task-meta">
            ${durationDisplay}
          </div>
          <div class="task-timer ${isActive ? "" : "hidden"}" id="timer-${
        task._id
      }">
            <span class="timer-display">00:00:00</span>
          </div>
        </div>
        <button class="task-action-btn ${actionClass}" 
                data-id="${task._id}"
                ${isActive ? "" : activeTaskId ? "disabled" : ""}>
          ${actionText}
        </button>
      `;

      if (isActive) {
        const timerDisplay = li.querySelector(
          `#timer-${task._id} .timer-display`
        );
        const startTime = new Date(task.startTime);

        if (timers[task._id]) {
          clearInterval(timers[task._id].interval);
        }

        timers[task._id] = {
          interval: setInterval(() => {
            const now = new Date();
            const elapsed = Math.floor((now - startTime) / 1000);
            const hours = Math.floor(elapsed / 3600)
              .toString()
              .padStart(2, "0");
            const minutes = Math.floor((elapsed % 3600) / 60)
              .toString()
              .padStart(2, "0");
            const seconds = (elapsed % 60).toString().padStart(2, "0");
            timerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
          }, 1000),
        };
      }

      li.querySelector(".task-action-btn").addEventListener("click", () => {
        console.log(
          "Task button clicked, taskId:",
          task._id,
          "isActive:",
          isActive
        );
        if (isActive) {
          handleEndTask(task._id);
        } else {
          handleStartTask(task._id);
        }
      });

      taskList.appendChild(li);
    });
  }

  function handleStartTask(taskId) {
    console.log(
      "handleStartTask: taskId:",
      taskId,
      "activeTaskId:",
      activeTaskId
    );
    if (activeTaskId) {
      showToast("Please end your current task before starting a new one");
      return;
    }

    const startTime = new Date();
    activeTaskId = taskId;

    tasks = tasks.map((task) =>
      task._id === taskId
        ? { ...task, status: "inprogress", startTime: startTime.toISOString() }
        : task
    );

    chrome.storage.local.set(
      {
        activeTask: { taskId, startTime: startTime.toISOString() },
        tasks,
      },
      () => {
        console.log("Starting timer for taskId:", taskId);
        setTimeout(() => startTimer(taskId, startTime), 100);

        const task = tasks.find((t) => t._id === taskId);
        if (!task) {
          console.error("Task not found for taskId:", taskId);
          return;
        }

        // ✅ START reminder using background script
        chrome.runtime.sendMessage(
          {
            type: "START_TASK_REMINDER",
            taskName: task.task,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error sending START_TASK_REMINDER:",
                chrome.runtime.lastError.message
              );
            } else {
              console.log("Background reminder started:", response);
            }
          }
        );

        renderTasks(tasks);
      }
    );
  }

  function handleEndTask(taskId) {
    console.log("handleEndTask: taskId:", taskId);
    if (!confirm("Are you sure you want to end this task?")) return;

    const endTime = new Date();
    const task = tasks.find((t) => t._id === taskId);
    if (!task) {
      console.error("Task not found for taskId:", taskId);
      return;
    }

    const startTime = timers[taskId]?.startTime || new Date(task.startTime);
    if (isNaN(startTime.getTime())) {
      console.error("Invalid startTime for endTask:", startTime);
      return;
    }

    const duration = calculateDuration(startTime, endTime);

    tasks = tasks.map((task) =>
      task._id === taskId
        ? {
            ...task,
            status: "completed",
            endTime: endTime.toISOString(),
            duration,
          }
        : task
    );

    stopTimer(taskId);

    activeTaskId = null;

    chrome.runtime.sendMessage({ type: "STOP_TASK_REMINDER" }, (response) => {
      console.log("STOP_TASK_REMINDER response:", response);
    });

    chrome.storage.local.set({ tasks }, () => {
      chrome.storage.local.remove("activeTask", () => {
        showToast(`Task completed! Worked for ${duration}`);
        renderTasks(tasks);
      });
    });
  }

  function startTimer(taskId, storedStartTime) {
    console.log(
      "startTimer: taskId:",
      taskId,
      "storedStartTime:",
      storedStartTime
    );
    if (timers[taskId]) {
      clearInterval(timers[taskId].interval);
      delete timers[taskId];
    }

    const timerDisplay = document.querySelector(
      `#timer-${taskId} .timer-display`
    );
    const taskElement = document.querySelector(
      `.task-item[data-id="${taskId}"] .task-timer`
    );

    if (!timerDisplay || !taskElement) {
      console.error(`Timer elements not found for taskId: ${taskId}`);
      return;
    }

    taskElement.classList.remove("hidden");

    const startTime =
      storedStartTime instanceof Date
        ? storedStartTime
        : new Date(storedStartTime);
    if (isNaN(startTime.getTime())) {
      console.error("Invalid startTime for taskId:", taskId);
      return;
    }

    timers[taskId] = {
      startTime,
      interval: setInterval(() => {
        const currentTime = new Date();
        const elapsed = Math.floor((currentTime - startTime) / 1000);
        const hours = Math.floor(elapsed / 3600)
          .toString()
          .padStart(2, "0");
        const minutes = Math.floor((elapsed % 3600) / 60)
          .toString()
          .padStart(2, "0");
        const seconds = (elapsed % 60).toString().padStart(2, "0");
        timerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
      }, 1000),
    };
  }

  function stopTimer(taskId) {
    console.log("stopTimer: taskId:", taskId); // Debug
    if (timers[taskId]) {
      clearInterval(timers[taskId].interval);
      const timerDisplay = document.querySelector(
        `#timer-${taskId} .timer-display`
      );
      const taskElement = document.querySelector(
        `.task-item[data-id="${taskId}"] .task-timer`
      );
      if (timerDisplay) {
        timerDisplay.textContent = "00:00:00";
      }
      if (taskElement) {
        taskElement.classList.add("hidden");
      }
      delete timers[taskId];
    }
  }

  function initializeTimers() {
    console.log("initializeTimers: Checking storage");
    chrome.storage.local.get(["activeTask", "tasks"], (data) => {
      console.log("initializeTimers: Storage data:", data);
      tasks = data.tasks || [];
      renderTasks(tasks);
      if (data.activeTask) {
        const { taskId, startTime } = data.activeTask;
        activeTaskId = taskId;

        console.log("Restoring timer for taskId:", taskId);
        // ✅ Correct: parse startTime correctly
        const parsedStartTime = new Date(startTime);
        if (!isNaN(parsedStartTime.getTime())) {
          startTimer(taskId, parsedStartTime);
        } else {
          console.error("Invalid startTime in storage:", startTime);
        }
      }
    });
  }

  function calculateDuration(startTime, endTime) {
    const diff = (endTime - startTime) / 1000;
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = Math.floor(diff % 60);
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast-message";
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("show");
    }, 10);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  taskInput.addEventListener("input", handleSearchInput);
  searchAddBtn.addEventListener("click", handleSearchAddClick);
  document
    .getElementById("save-task-btn")
    .addEventListener("click", saveTaskFromModal);
  document.getElementById("close-modal-btn").addEventListener("click", () => {
     const priority = document.getElementById("task-priority").value.trim();
  const status = document.getElementById("task-status").value.trim();
  const endDate = document.getElementById("task-end-date").value.trim();
  const note = document.getElementById("task-note").value.trim();
  const client = document.getElementById("task-client").value.trim();
  const project = document.getElementById("task-project").value.trim();

  let errors = [];

  if (!priority) errors.push("Please select a priority.");
  if (!status) errors.push("Please select a status.");
  if (!endDate) errors.push("Please select an end date.");
  if (!note) errors.push("Please enter a note.");
  if (!client) errors.push("Please select a client.");
  if (!project) errors.push("Please select a project.");

  if (errors.length > 0) {
    alert(errors.join("\n")); 
    return; // stop saving
  }


    taskModal.classList.add("hidden");
  });

  searchAddBtn.disabled = true;

  function handleSearchInput() {
    const searchTerm = taskInput.value.trim().toLowerCase();

    if (!searchTerm) {
      renderTasks(tasks);
      searchAddBtn.disabled = true;
      setSearchMode();
      return;
    }

    const filtered = tasks.filter((task) =>
      task.task.toLowerCase().includes(searchTerm)
    );

    renderTasks(filtered);

    if (filtered.length === 0) {
      setAddMode(searchTerm);
      searchAddBtn.disabled = false;
    } else {
      setSearchMode();
      searchAddBtn.disabled = true;
    }
  }

  function handleSearchAddClick() {
    const searchTerm = taskInput.value.trim();
    if (!searchTerm) return;

    const exists = tasks.some(
      (task) => task.task.toLowerCase() === searchTerm.toLowerCase()
    );

    if (exists) {
      showToast("Task already exists");
      return;
    }

    openTaskModal(searchTerm);
  }

  function openTaskModal(taskName) {
    taskModal.classList.remove("hidden");
    taskModal.dataset.taskName = taskName;

    // Reset modal form fields to defaults
    document.getElementById("task-priority").value = "Medium";
    document.getElementById("task-status").value = "pending";
    document.getElementById("task-end-date").value = "";
    document.getElementById("task-note").value = "";
    document.getElementById("task-client").value = "Personal";
    document.getElementById("task-project").value = "General";
  }

function loadClients() {
  const clientSelect = document.getElementById("task-client");
  if (!clientSelect) {
    console.error("Client select element not found!");
    return;
  }

  chrome.storage.local.get(["authData"], async (result) => {
    const token = result.authData?.token;
    if (!token) {
      console.error("No auth token found");
      clientSelect.innerHTML = '<option value="">No token found</option>';
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/clients/get-clients`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const clients = await response.json();

      clientSelect.innerHTML =
        '<option value="">-- Select Client --</option>';
      clients.forEach((client) => {
        const option = document.createElement("option");
        option.value = client._id;
        option.textContent = client.name;
        clientSelect.appendChild(option);
      });
    } catch (error) {
      console.error("Error loading clients:", error);
      clientSelect.innerHTML =
        '<option value="">Error loading clients</option>';
    }
  });
}


  async function loadProjects() {
  const projectSelect = document.getElementById("task-project");
  if (!projectSelect) {
    console.error("Project select element not found!");
    return;
  }

  chrome.storage.local.get(["authData"], async (result) => {
    const token = result.authData?.token;
    if (!token) {
      console.error("No auth token found");
      projectSelect.innerHTML = '<option value="">No token found</option>';
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/settings/get-projects`, 
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const projects = await response.json();

      projectSelect.innerHTML =
        '<option value="">-- Select Project --</option>';
      projects.forEach((project) => {
        const option = document.createElement("option");
        option.value = project._id;
        option.textContent = project.name;
        projectSelect.appendChild(option);
      });
    } catch (error) {
      console.error("Error loading projects:", error);
      projectSelect.innerHTML =
        '<option value="">Error loading projects</option>';
    }
  });
}


  function openTaskModal(taskName) {
    const taskModal = document.getElementById("task-modal");
    console.log("Modal element:", taskModal);

    const clientSelect = document.getElementById("task-client");
    const projectSelect = document.getElementById("task-project");
    console.log("Client select:", clientSelect);
    console.log("Project select:", projectSelect);

    taskModal.classList.remove("hidden");
    taskModal.dataset.taskName = taskName;

    loadClients();
    loadProjects();

    document.getElementById("task-priority").value = "Medium";
    document.getElementById("task-status").value = "pending";
    document.getElementById("task-end-date").value = "";
    document.getElementById("task-note").value = "";
  }

  function saveTaskFromModal() {
    const taskName = taskModal.dataset.taskName;
    const priority = document.getElementById("task-priority").value;
    const status = document.getElementById("task-status").value;
    const endDate = document.getElementById("task-end-date").value || null;
    const notes = document.getElementById("task-note").value;
    const clientSelect = document.getElementById("task-client");
    const clientName =
      clientSelect.options[clientSelect.selectedIndex].textContent;
    const projectSelect = document.getElementById("task-project");
    const projectName =
      projectSelect.options[projectSelect.selectedIndex].textContent;
    addTask(
      taskName,
      priority,
      status,
      endDate,
      notes,
      clientName,
      projectName
    );

    taskModal.classList.add("hidden");
  }

  function setSearchMode() {
    searchAddIcon.className = "fas fa-search";
    searchAddText.textContent = "";
  }

  function setAddMode(term) {
    searchAddIcon.className = "fas fa-plus";
    searchAddText.textContent = ` Add "${term}"`;
  }

  function addTask(
    taskName,
    priority = "Medium",
    status = "pending",
    endDate = null,
    notes = "",
    client = "Personal",
    project = "General"
  ) {
    chrome.storage.local.get(["authData"], (result) => {
      if (!result.authData) {
        showError("Please login again");
        showLoginScreen();
        return;
      }

      const username = result.authData.username;

      const payload = {
        task: taskName,
        priority,
        assigner: username,
        assignee: username,
        status,
        start_date: new Date().toISOString(),
        end_date: endDate,
        notes,
        client, // just the name string
        project, // just the name string
      };

      fetch(`${API_BASE_URL}/tasks/add-tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${result.authData.token}`,
        },

        body: JSON.stringify(payload),
      })
        .then((response) => response.json())
        .then((data) => {
          tasks.push(data);
          chrome.storage.local.set({ tasks }, () => {
            taskInput.value = "";
            setSearchMode();
            searchAddBtn.disabled = true;
            renderTasks(tasks);
            showToast("Task added successfully!");
          });
        })
        .catch((error) => {
          console.error("Error adding task:", error);
          showToast("Failed to add task. Please try again.");
        });
    });
  }
});

// Endpoint: POST /api/tasks/start-work-log
// {
//   "taskId": "64b8f79e2a7e8b2e0f5c1234",
//   "startTime": "2025-07-11T13:30:00.000Z"
// }

// Endpoint: POST /api/tasks/end-work-log
// {
//   "taskId": "64b8f79e2a7e8b2e0f5c1234",
//   "endTime": "2025-07-11T15:30:00.000Z"
// }

//       headers: {
//         "Authorization": `Bearer ${token}`
//       },
