chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "fill-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: "fill" }).catch(() => {});
});

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === "install") chrome.runtime.openOptionsPage();
});

// Centralized application logging to chrome.storage.local
chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
  if (m && m.type === "open_tracker") {
    chrome.tabs.create({ url: chrome.runtime.getURL("tracker.html") });
    sendResponse({ ok: true });
    return true;
  }
  if (m && m.type === "track_application" && m.tracking) {
    saveApplication(m.tracking).then(() => {
      sendResponse({ ok: true });
    });
    return true; // Keep sendResponse open for async
  }
});

async function saveApplication(item) {
  try {
    const d = await chrome.storage.local.get("applications");
    const apps = d.applications || [];
    const recent = Date.now() - 30 * 60 * 1000;
    const existingIdx = apps.findIndex((a) => a.url === item.url && new Date(a.date).getTime() > recent);
    if (existingIdx !== -1) {
      if (item.company && item.company !== "Unknown Company" && item.company !== "Company") {
        apps[existingIdx].company = item.company;
      }
      if (item.jobTitle && item.jobTitle !== "Job Application") {
        apps[existingIdx].jobTitle = item.jobTitle;
      }
      await chrome.storage.local.set({ applications: apps });
      return { ok: true, isDupe: true };
    }
    apps.unshift({
      date: item.date || new Date().toISOString(),
      company: item.company || "Unknown Company",
      jobTitle: item.jobTitle || "Job Application",
      url: item.url || "",
      status: item.status || "Applied",
      notes: item.notes || ""
    });
    await chrome.storage.local.set({ applications: apps });
    return { ok: true, isDupe: false };
  } catch (e) {
    console.error("Failed to save application:", e);
    return { ok: false, error: e.message };
  }
}
