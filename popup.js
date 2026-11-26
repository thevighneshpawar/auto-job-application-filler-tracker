// Standalone preview when this file is opened outside the extension.
if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
  window.chrome = window.chrome || {};
  chrome.storage = chrome.storage || {};
  chrome.storage.local = {
    get: async (keys) => {
      const res = {};
      const arr = Array.isArray(keys) ? keys : (keys == null ? [] : [keys]);
      arr.forEach((k) => {
        try { res[k] = JSON.parse(localStorage.getItem("jf_" + k)); }
        catch (e) { res[k] = localStorage.getItem("jf_" + k); }
      });
      return res;
    },
    set: async (obj) => {
      Object.entries(obj).forEach(([k, v]) => localStorage.setItem("jf_" + k, JSON.stringify(v)));
    },
    remove: async (keys) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      arr.forEach((k) => localStorage.removeItem("jf_" + k));
    }
  };
  chrome.runtime = chrome.runtime || {
    getURL: (p) => p,
    openOptionsPage: () => window.open("options.html", "_blank"),
    onMessage: { addListener: () => {} },
    sendMessage: async () => ({})
  };
  chrome.tabs = chrome.tabs || {
    create: (opt) => window.open(opt.url, "_blank"),
    query: async () => [{ id: 1, url: window.location.href, title: document.title }],
    sendMessage: async () => { throw new Error("no-tab"); }
  };
}

const $ = (id) => document.getElementById(id);
const st = $("status");
const CLOSED = new Set(["Rejected", "Withdrawn", "Offer Accepted", "Offer Declined", "Ghosted"]);
const BLOCKED = /^(chrome|edge|about|devtools|chrome-extension|view-source):/i;

let agg = { filled: 0, matched: 0, unmatched: new Set(), missing: new Set(), hasProfile: true, reported: false };
let fillWatch = null;
let previewParts = [];
let previewWait = null;
let currentTracking = null;

function setStatus(text, kind) {
  st.className = text ? "msg " + (kind || "muted") : "msg";
  st.setAttribute("role", kind === "err" ? "alert" : "status");
  st.replaceChildren();
  if (!text) return;
  const line = document.createElement("div");
  line.textContent = text;
  st.appendChild(line);
}

function setStatusLines(lines) {
  const primary = (lines[0] && lines[0].kind) || "muted";
  st.className = "msg " + primary;
  st.setAttribute("role", primary === "err" ? "alert" : "status");
  st.replaceChildren();
  lines.forEach((ln) => {
    if (!ln || !ln.text) return;
    const d = document.createElement("div");
    d.className = "line" + (ln.kind && ln.kind !== primary ? " " + ln.kind : "");
    d.textContent = ln.text;
    st.appendChild(d);
  });
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function paintCompleteness(profile, extras) {
  const c = typeof jfCompleteness === "function"
    ? jfCompleteness(profile, extras)
    : { done: 0, total: 8, missing: ["Name", "Email", "Phone"], ready: false };
  const box = $("complete");
  box.className = "complete " + (!c.ready ? "bad" : c.missing.length ? "warn" : "good");
  $("completeLabel").textContent = c.missing.length ? "Profile" : "Profile ready";
  $("completeMeta").textContent = c.done + " of " + c.total + " ready";
  $("completeBar").style.width = Math.round((100 * c.done) / c.total) + "%";
  $("completeMiss").textContent = c.missing.length
    ? "Still needed: " + c.missing.join(", ")
    : "Name, email, and phone are saved.";
  return c;
}

function paintTracker(apps) {
  apps = apps || [];
  const el = $("trackerSum");
  const text = $("trackerSumText");
  const today = todayKey();
  const open = apps.filter((a) => a.followUp && !CLOSED.has(a.status));
  const due = open.filter((a) => String(a.followUp).slice(0, 10) <= today);
  el.classList.toggle("due", due.length > 0);
  if (!apps.length) {
    text.textContent = "No applications yet. Add one from a job page.";
    return;
  }
  let line = apps.length + " application" + (apps.length === 1 ? "" : "s");
  if (due.length) {
    const first = due.slice().sort((a, b) => String(a.followUp).localeCompare(String(b.followUp)))[0];
    line += " · " + due.length + " follow-up" + (due.length === 1 ? "" : "s") + " due";
    if (first && first.company) line += " · " + first.company;
  } else if (open.length) {
    const next = open.slice().sort((a, b) => String(a.followUp).localeCompare(String(b.followUp)))[0];
    line += " · next follow-up " + (next.company || "a role") + " on " + String(next.followUp).slice(0, 10);
  }
  text.textContent = line;
}

function resetAddBtn() {
  const addBtn = $("addTracker");
  addBtn.disabled = false;
  addBtn.classList.remove("is-done");
  addBtn.textContent = "Add to tracker";
}

function openTracker() {
  chrome.tabs.create({ url: chrome.runtime.getURL("tracker.html") });
}

chrome.storage.local.get(["auto", "profile", "resume", "experiences", "educations", "applications"]).then((d) => {
  $("auto").checked = !!d.auto;
  const c = paintCompleteness(d.profile || {}, {
    resume: d.resume,
    experiences: d.experiences,
    educations: d.educations
  });
  paintTracker(d.applications || []);
  if (!c.ready) setStatus("Add your name, email, and phone in My details. You can still review a page.", "warn");
});

$("auto").onchange = (e) => chrome.storage.local.set({ auto: e.target.checked });
$("opts").onclick = () => chrome.runtime.openOptionsPage();
$("tracker").onclick = openTracker;
$("trackerSum").onclick = openTracker;
$("trackerSum").onkeydown = (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTracker(); }
};

$("toggleRow").addEventListener("click", (e) => {
  if (e.target.closest("#switchLabel")) return;
  $("auto").click();
});

function blockedUrl(url) {
  return !url || BLOCKED.test(url);
}

async function fetchPageTracking() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || blockedUrl(tab.url)) return null;
    let compGuess = "Company";
    try {
      const sub = new URL(tab.url).hostname.replace(/^www\./, "").split(".")[0];
      if (sub) compGuess = sub.charAt(0).toUpperCase() + sub.slice(1);
    } catch (e) {}
    const roleGuess = (tab.title || "Job Application").split(/[-|–—·•:]/)[0].trim() || "Job Application";
    const payload = {
      company: compGuess,
      jobTitle: roleGuess,
      url: tab.url,
      date: new Date().toISOString(),
      status: "Applied",
      notes: "",
      followUp: ""
    };
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { type: "get_page_info" });
      if (resp) {
        if (resp.company) payload.company = resp.company;
        if (resp.jobTitle) payload.jobTitle = resp.jobTitle;
      }
    } catch (e) {}
    return payload;
  } catch (e) {
    return null;
  }
}

fetchPageTracking().then((res) => { if (res) currentTracking = res; });

$("addTracker").onclick = async () => {
  const addBtn = $("addTracker");
  addBtn.disabled = true;
  addBtn.textContent = "Adding…";
  if (!currentTracking) currentTracking = await fetchPageTracking();
  const payload = currentTracking;
  if (!payload || blockedUrl(payload.url)) {
    resetAddBtn();
    setStatus("Open a job posting first. This page can't be added to the tracker.", "err");
    return;
  }
  try {
    const res = await chrome.runtime.sendMessage({ type: "track_application", tracking: payload });
    addBtn.classList.add("is-done");
    addBtn.disabled = true;
    if (res && res.duplicate) {
      addBtn.textContent = "Already tracked";
      setStatus(payload.company + " — " + payload.jobTitle + " is already in your tracker.", "ok");
    } else {
      addBtn.textContent = "Added";
      setStatus("Added " + payload.company + " — " + payload.jobTitle + ". Set a follow-up in the tracker.", "ok");
    }
    const d = await chrome.storage.local.get("applications");
    paintTracker(d.applications || []);
  } catch (e) {
    resetAddBtn();
    setStatus("Could not add this page to the tracker.", "err");
  }
};

function mergePreviews(parts) {
  const fields = [];
  const missing = new Set();
  const unmatched = new Set();
  let company = "";
  let jobTitle = "";
  let best = -1;
  let hasProfile = false;
  parts.forEach((p) => {
    if (p.hasProfile) hasProfile = true;
    (p.fields || []).forEach((f) => fields.push(f));
    (p.missing || []).forEach((m) => missing.add(m));
    (p.unmatched || []).forEach((m) => unmatched.add(m));
    const n = (p.fields || []).length;
    if (n > best) {
      best = n;
      if (p.company) company = p.company;
      if (p.jobTitle) jobTitle = p.jobTitle;
    }
  });
  const seen = new Set();
  const uniq = [];
  fields.forEach((f) => {
    const id = f.key + "\n" + f.value;
    if (seen.has(id)) return;
    seen.add(id);
    uniq.push(f);
  });
  return {
    company: company || "This page",
    jobTitle: jobTitle || "",
    hasProfile,
    fields: uniq,
    missing: [...missing],
    unmatched: [...unmatched].slice(0, 8)
  };
}

function showHome() {
  $("home").hidden = false;
  $("review").hidden = true;
}

function renderReview(data) {
  const job = $("reviewJob");
  job.replaceChildren();
  job.append(document.createTextNode(data.company || "This page"));
  if (data.jobTitle) {
    const role = document.createElement("span");
    role.textContent = data.jobTitle;
    job.appendChild(role);
  }
  const drafts = data.fields.filter((f) => f.source === "template");
  const note = $("reviewNote");
  if (drafts.length) {
    note.hidden = false;
    note.textContent = drafts.length + " answer" + (drafts.length === 1 ? "" : "s") + " drafted for this job from your profile. Read them before filling.";
  } else note.hidden = true;

  const list = $("reviewList");
  list.replaceChildren();
  if (!data.fields.length) {
    const empty = document.createElement("div");
    empty.className = "side-note";
    empty.textContent = data.hasProfile
      ? "No empty fields on this page matched your profile."
      : "No profile saved yet, so there is nothing to fill.";
    list.appendChild(empty);
  } else {
    data.fields.forEach((f) => {
      const row = document.createElement("div");
      row.className = "review-row";
      const k = document.createElement("div");
      k.className = "k";
      const name = document.createElement("span");
      name.textContent = f.label || f.key;
      const badge = document.createElement("span");
      badge.className = "badge " + (f.source === "template" ? "draft" : "saved");
      badge.textContent = f.source === "template" ? "Draft" : "Saved";
      k.append(name, badge);
      const v = document.createElement("div");
      v.className = "v";
      v.textContent = f.value || "";
      row.append(k, v);
      list.appendChild(row);
    });
  }
  const miss = $("reviewMissing");
  if (data.missing.length) {
    miss.hidden = false;
    miss.textContent = "Skipped, not in your profile: " + data.missing.join(", ");
  } else miss.hidden = true;
  const unmatched = $("reviewUnmatched");
  if (data.unmatched.length) {
    unmatched.hidden = false;
    unmatched.textContent = "Left blank: " + data.unmatched.join("; ");
  } else unmatched.hidden = true;
  const go = $("reviewFill");
  go.disabled = !data.fields.length;
  go.textContent = data.fields.length ? "Fill " + data.fields.length + (data.fields.length === 1 ? " field" : " fields") : "Nothing to fill";
  $("home").hidden = true;
  $("review").hidden = false;
}

function openReview() {
  if (!previewParts.length) {
    showHome();
    setStatus("Can't read this page. Reload it and try again. Browser pages such as chrome:// are blocked.", "err");
    return;
  }
  setStatus("");
  renderReview(mergePreviews(previewParts));
}

$("fill").onclick = async () => {
  previewParts = [];
  clearInterval(previewWait);
  setStatus("Reading this page…", "muted");
  $("fill").disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || blockedUrl(tab.url)) throw new Error("blocked");
    await chrome.tabs.sendMessage(tab.id, { type: "preview" });
  } catch (e) {
    $("fill").disabled = false;
    setStatus("Can't read this page. Reload it and try again. Browser pages such as chrome:// are blocked.", "err");
    return;
  }
  const started = Date.now();
  previewWait = setInterval(() => {
    const waited = Date.now() - started;
    if ((previewParts.length && waited > 500) || waited > 1500) {
      clearInterval(previewWait);
      $("fill").disabled = false;
      openReview();
    }
  }, 80);
};

$("reviewBack").onclick = () => {
  showHome();
  setStatus("");
};

function renderAgg() {
  if (!agg.reported) return;
  if (agg.failed && !agg.filled) {
    setStatus("Something went wrong while filling. Reload the page and review again.", "err");
    return;
  }
  if (agg.hasProfile === false && !agg.filled) {
    setStatus("No profile saved yet. Open My details and add your name, email, and phone.", "err");
    return;
  }
  if (!agg.filled) {
    const lines = [{
      kind: "warn",
      text: agg.missing.size
        ? "Nothing was written. Matching fields are empty in your profile."
        : "No empty fields matched your profile. Open the application form, then review again."
    }];
    if (agg.missing.size) lines.push({ kind: "warn", text: "Not in your profile: " + [...agg.missing].join(", ") });
    if (agg.unmatched.size) lines.push({ kind: "muted", text: "Left blank: " + [...agg.unmatched].slice(0, 8).join("; ") });
    setStatusLines(lines);
    return;
  }
  const lines = [{
    kind: "ok",
    text: "Filled " + agg.filled + " field" + (agg.filled === 1 ? "" : "s") + ". They're outlined in green. Check them, then submit the form yourself."
  }];
  if (agg.missing.size) lines.push({ kind: "warn", text: "Not in your profile: " + [...agg.missing].join(", ") });
  if (agg.unmatched.size) lines.push({ kind: "muted", text: "Left blank: " + [...agg.unmatched].slice(0, 8).join("; ") });
  setStatusLines(lines);
}

$("reviewFill").onclick = async () => {
  agg = { filled: 0, matched: 0, unmatched: new Set(), missing: new Set(), hasProfile: true, reported: false, failed: false };
  showHome();
  setStatus("Filling…", "muted");
  clearTimeout(fillWatch);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || blockedUrl(tab.url)) throw new Error("blocked");
    await chrome.tabs.sendMessage(tab.id, { type: "fill" });
  } catch (e) {
    setStatus("Can't run on this page. Reload the tab and try again. Browser pages such as chrome:// are blocked.", "err");
    return;
  }
  fillWatch = setTimeout(() => {
    if (!agg.reported) setStatus("No form fields found. If the form is inside a step or popup, open it first, then review again.", "warn");
  }, 4000);
};

chrome.runtime.onMessage.addListener((m) => {
  if (m && m.type === "preview_report" && m.preview) {
    previewParts.push(m.preview);
    return;
  }
  if (!m || m.type !== "report") return;
  const r = m.report || {};
  agg.reported = true;
  agg.hasProfile = r.hasProfile !== false && agg.hasProfile;
  if (r.hasProfile === false) agg.hasProfile = false;
  if (r.failed) agg.failed = true;
  agg.filled += r.filled || 0;
  agg.matched += r.matched || 0;
  (r.unmatched || []).forEach((x) => agg.unmatched.add(x));
  (r.missing || []).forEach((x) => agg.missing.add(x));
  if (m.tracking) currentTracking = Object.assign({}, currentTracking || {}, m.tracking);
  clearTimeout(fillWatch);
  renderAgg();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("review").hidden) {
    showHome();
    setStatus("");
  }
});
