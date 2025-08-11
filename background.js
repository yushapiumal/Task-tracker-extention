let reminderIntervalId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "START_TASK_REMINDER") {
    if (reminderIntervalId) {
      clearInterval(reminderIntervalId);
    }

    const taskName = message.taskName;

    reminderIntervalId = setInterval(() => {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon48.png",
        title: "Task Reminder",
        message: `You are working on "${taskName}"`,
        priority: 2,
      });
    },0.1 * 60 * 1000);

    console.log(`Started reminder for task "${taskName}" every 10 minutes.`);
    sendResponse({ status: "reminder started" });
    return true;
  }

  if (message.type === "STOP_TASK_REMINDER") {
    if (reminderIntervalId) {
      clearInterval(reminderIntervalId);
      reminderIntervalId = null;
      console.log("Stopped task reminder.");
    }
    sendResponse({ status: "reminder stopped" });
    return true;
  }
});
