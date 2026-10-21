// Environment shim: enable standalone preview & testing outside extension context
if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
  window.chrome = window.chrome || {};
  chrome.storage = chrome.storage || {};
  chrome.storage.local = {
    get: async (keys) => {
      const res = {};
      const arr = Array.isArray(keys) ? keys : [keys];
      arr.forEach(k => {
        try { res[k] = JSON.parse(localStorage.getItem("jf_" + k)); }
        catch (e) { res[k] = localStorage.getItem("jf_" + k); }
      });
      return res;
    },
    set: async (obj) => {
      Object.entries(obj).forEach(([k, v]) => {
        localStorage.setItem("jf_" + k, JSON.stringify(v));
      });
    },
    remove: async (keys) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      arr.forEach(k => localStorage.removeItem("jf_" + k));
    },
    clear: async () => {
      Object.keys(localStorage).filter(k => k.startsWith("jf_")).forEach(k => localStorage.removeItem(k));
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
    sendMessage: async () => ({})
  };
}

const $ = (id) => document.getElementById(id);
const st = $("status");
let agg = { filled: 0, matched: 0, unmatched: new Set(), missing: new Set() };

chrome.storage.local.get(["auto", "profile"]).then((d) => {
  $("auto").checked = !!d.auto;
  if (!d.profile || !Object.values(d.profile).some(Boolean)) {
    st.innerHTML = '<span class="warn">No details saved yet. Click "My Details" first.</span>';
  }
});

$("auto").onchange   = (e) => chrome.storage.local.set({ auto: e.target.checked });
$("opts").onclick    = () => chrome.runtime.openOptionsPage();
$("tracker").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("tracker.html") });


// Toggle row: clicking the row toggles the checkbox
document.addEventListener("DOMContentLoaded", () => {
  const toggleRow = document.getElementById("toggleRow");
  if (toggleRow) {
    toggleRow.addEventListener("click", (e) => {
      // If the click is on the switch itself, the native label toggles the checkbox
      if (e.target.closest("#switchLabel")) return;
      const chk = document.getElementById("auto");
      if (chk) {
        chk.click();
      }
    });
  }
});
let currentTracking = null;

async function fetchPageTracking() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return null;

    let compGuess = "";
    try {
      const u = new URL(tab.url);
      const sub = u.hostname.replace(/^www\./, "").split(".")[0];
      compGuess = sub ? sub.charAt(0).toUpperCase() + sub.slice(1) : "Company";
    } catch (e) {
      compGuess = "Company";
    }
    const roleGuess = (tab.title || "Job Application").split(/[-|–—·•:]/)[0].trim() || "Job Application";

    const payload = {
      company: compGuess,
      jobTitle: roleGuess,
      url: tab.url,
      date: new Date().toISOString(),
      status: "Applied",
      notes: ""
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

const addBtn = $("addTracker") || $("trackCurrent");
if (addBtn) {
  addBtn.onclick = async () => {
    addBtn.disabled = true;
    addBtn.textContent = "Adding…";

    if (!currentTracking) {
      currentTracking = await fetchPageTracking();
    }

    const payload = currentTracking || {
      company: "Company",
      jobTitle: "Job Application",
      url: "",
      date: new Date().toISOString(),
      status: "Applied",
      notes: ""
    };

    try {
      await chrome.runtime.sendMessage({
        type: "track_application",
        tracking: payload
      });
      addBtn.textContent = "✅ Added to Tracker!";
      addBtn.style.background = "#dcfce7";
      addBtn.style.borderColor = "#86efac";
      st.innerHTML = `<span class="ok">✅ Added to Tracker: <b>${payload.company}</b> (${payload.jobTitle})</span>`;
    } catch (e) {
      addBtn.disabled = false;
      addBtn.textContent = "➕ Add to Tracker";
      st.innerHTML = '<span class="warn">Could not add to tracker.</span>';
    }
  };
}

chrome.runtime.onMessage.addListener((m) => {
  if (!m || m.type !== "report") return;
  const r = m.report;
  agg.filled  += r.filled;
  agg.matched += r.matched;
  (r.unmatched || []).forEach((x) => agg.unmatched.add(x));
  (r.missing   || []).forEach((x) => agg.missing.add(x));

  if (m.tracking) {
    currentTracking = Object.assign({}, currentTracking || {}, m.tracking);
  }

  // NOTE: Never automatically log to tracker. Only when user clicks "Add to Tracker".
  render();
});

function render() {
  let h = `<div class="ok"><b>${agg.filled}</b> field(s) filled. Review them (green outline), then submit yourself.</div>`;
  if (agg.missing.size)   h += `<div class="warn">Not saved in your profile yet: ${[...agg.missing].join(", ")}</div>`;
  if (agg.unmatched.size) h += `<div class="muted">Left blank (not recognised): ${[...agg.unmatched].slice(0, 8).join("; ")}</div>`;
  st.innerHTML = h;
}

$("fill").onclick = async () => {
  agg = { filled: 0, matched: 0, unmatched: new Set(), missing: new Set() };
  st.innerHTML = '<span class="muted">Filling…</span>';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "fill" });
  } catch (e) {
    st.innerHTML = '<span class="warn">Can\'t run on this page. Reload the tab and try again (browser pages like chrome:// are blocked).</span>';
    return;
  }
  setTimeout(() => {
    if (!agg.matched && !agg.filled) {
      st.innerHTML = '<span class="warn">No form fields found. If the form is inside a step or popup, open it first, then click again.</span>';
    }
  }, 4000);
};
