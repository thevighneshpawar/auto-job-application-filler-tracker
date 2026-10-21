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
  chrome.storage.onChanged = chrome.storage.onChanged || { addListener: () => {} };
  chrome.runtime = chrome.runtime || {
    getURL: (p) => p,
    openOptionsPage: () => window.open("options.html", "_blank"),
    onMessage: { addListener: () => {} },
    sendMessage: async () => ({})
  };
}

const STATUS_CONFIG = {
  "Wishlist":            { class: "s-wishlist",            icon: "⭐" },
  "Applied":             { class: "s-applied",             icon: "📨" },
  "Under Review":        { class: "s-under-review",        icon: "👀" },
  "Assessment Ongoing":  { class: "s-assessment-ongoing",  icon: "⏳" },
  "Assessment Complete": { class: "s-assessment-complete", icon: "📝" },
  "Phone Screen":        { class: "s-phone-screen",        icon: "📞" },
  "Interview":           { class: "s-interview",           icon: "💬" },
  "Final Round":         { class: "s-final-round",         icon: "🎯" },
  "Offer":               { class: "s-offer",               icon: "🎉" },
  "Counter Offer":       { class: "s-counter-offer",       icon: "🤝" },
  "Offer Accepted":      { class: "s-offer-accepted",      icon: "🚀" },
  "Offer Declined":      { class: "s-offer-declined",      icon: "🙅" },
  "Rejected":            { class: "s-rejected",            icon: "❌" },
  "Withdrawn":           { class: "s-withdrawn",           icon: "↩️" },
  "Ghosted":             { class: "s-ghosted",             icon: "👻" },
};
const STATUSES = Object.keys(STATUS_CONFIG);

let apps = [], filtered = [];

// Initialize
async function load() {
  populateStatusSelects();

  const data = await chrome.storage.local.get(["applications", "general_notes"]);
  apps = data.applications || [];

  // Setup General Notes
  const notesBox = document.getElementById("generalNotesBox");
  if (notesBox) {
    notesBox.value = data.general_notes || "";
  }

  updateStats();
  render();
}

function populateStatusSelects() {
  // Modal status dropdown
  const modalSelect = document.getElementById("modalStatus");
  if (modalSelect) {
    modalSelect.innerHTML = STATUSES.map(
      (s) => `<option value="${s}">${STATUS_CONFIG[s].icon} ${s}</option>`
    ).join("");
  }

  // Filter dropdown in toolbar
  updateFilterDropdown();
}

function updateFilterDropdown() {
  const filterSelect = document.getElementById("statusFilter");
  if (!filterSelect) return;
  const currentVal = filterSelect.value || "ALL";

  filterSelect.innerHTML = `<option value="ALL">All Statuses </option>` +
    STATUSES.map(
      (s) => `<option value="${s}"${s === currentVal ? " selected" : ""}>${STATUS_CONFIG[s].icon} ${s}</option>`
    ).join("");
}

function updateStats() {
  const total = apps.length;
  let assessments = 0;
  let interviews = 0;
  let offers = 0;

  apps.forEach((a) => {
    const s = a.status;
    if (s === "Assessment Ongoing" || s === "Assessment Complete" || s === "Under Review") {
      assessments++;
    } else if (s === "Phone Screen" || s === "Interview" || s === "Final Round") {
      interviews++;
    } else if (s === "Offer" || s === "Counter Offer" || s === "Offer Accepted") {
      offers++;
    }
  });

  document.getElementById("statTotal").textContent = total;
  document.getElementById("statAssessment").textContent = assessments;
  document.getElementById("statInterviews").textContent = interviews;
  document.getElementById("statOffers").textContent = offers;
}

function render(query) {
  const searchInput = document.getElementById("searchBox");
  const filterSelect = document.getElementById("statusFilter");

  const q = (query !== undefined ? query : (searchInput ? searchInput.value : "")).toLowerCase().trim();
  const selectedStatus = filterSelect ? filterSelect.value : "ALL";

  filtered = apps.filter((a) => {
    const matchStatus = (selectedStatus === "ALL") || (a.status === selectedStatus);
    if (!matchStatus) return false;

    if (!q) return true;
    const combined = (
      (a.company || "") + " " +
      (a.jobTitle || "") + " " +
      (a.url || "") + " " +
      (a.status || "") + " " +
      (a.notes || "")
    ).toLowerCase();
    return combined.includes(q);
  });

  filtered.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const body = document.getElementById("appBody");
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="7"><div class="empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      ${q || selectedStatus !== "ALL" ? "No applications match your filter." : "No applications logged yet. Click '＋ Add Application' or use 'Add to Tracker' on job postings!"}
    </div></td></tr>`;
  } else {
    body.innerHTML = filtered.map((a) => {
      const idx = apps.indexOf(a);
      const conf = STATUS_CONFIG[a.status] || STATUS_CONFIG["Applied"];
      const noteHtml = a.notes && a.notes.trim()
        ? `<div class="notes-snippet" data-idx="${idx}" title="${esc(a.notes)}">📝 ${esc(a.notes)}</div>`
        : `<button type="button" class="btn-add-note" data-idx="${idx}">＋ Add note</button>`;

      return `
        <tr data-idx="${idx}">
          <td class="cell-date">${fmtDate(a.date)}</td>
          <td class="cell-company"><b>${esc(a.company || "—")}</b></td>
          <td class="cell-role">${esc(a.jobTitle || "—")}</td>
          <td>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" title="${esc(a.url)}">${esc(shortUrl(a.url))}</a>` : "—"}</td>
          <td>
            <select class="status-select ${conf.class}" data-idx="${idx}">
              ${STATUSES.map((s) => `<option value="${s}"${s === a.status ? " selected" : ""}>${STATUS_CONFIG[s].icon} ${s}</option>`).join("")}
            </select>
          </td>
          <td class="notes-cell-container">${noteHtml}</td>
          <td class="actions-cell">
            <button type="button" class="btn-action-icon btn-edit" data-idx="${idx}" title="Edit details & notes">✏️</button>
            <button type="button" class="btn-action-icon btn-delete" data-idx="${idx}" title="Delete entry">✕</button>
          </td>
        </tr>`;
    }).join("");
  }

  const countLabel = document.getElementById("countLabel");
  if (countLabel) {
    countLabel.textContent = `${filtered.length} of ${apps.length} application${apps.length !== 1 ? "s" : ""}`;
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    return host + (u.pathname.length > 1 ? u.pathname.slice(0, 24) + (u.pathname.length > 24 ? "…" : "") : "");
  } catch {
    return url.slice(0, 30) + (url.length > 30 ? "…" : "");
  }
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

async function save() {
  await chrome.storage.local.set({ applications: apps });
  updateStats();
  updateFilterDropdown();
}

// Event Delegation for Table Body
const appBody = document.getElementById("appBody");

appBody.addEventListener("change", async (e) => {
  if (!e.target.matches(".status-select")) return;
  const idx = +e.target.dataset.idx;
  if (idx < 0 || idx >= apps.length) return;

  const newStatus = e.target.value;
  apps[idx].status = newStatus;
  const conf = STATUS_CONFIG[newStatus] || STATUS_CONFIG["Applied"];
  e.target.className = `status-select ${conf.class}`;

  await save();
  toast(`Status updated: ${newStatus} ✓`);
});

appBody.addEventListener("click", async (e) => {
  // Delete action
  const delBtn = e.target.closest(".btn-delete");
  if (delBtn) {
    const idx = +delBtn.dataset.idx;
    if (idx < 0 || idx >= apps.length) return;
    const item = apps[idx];
    if (!confirm(`Delete application for "${item.company || "this company"}"?`)) return;
    apps.splice(idx, 1);
    await save();
    render();
    toast("Application deleted");
    return;
  }

  // Edit action
  const editBtn = e.target.closest(".btn-edit");
  if (editBtn) {
    const idx = +editBtn.dataset.idx;
    openModal(idx);
    return;
  }

  // Click on notes snippet or add note button
  const noteTrigger = e.target.closest(".notes-snippet") || e.target.closest(".btn-add-note");
  if (noteTrigger) {
    const idx = +noteTrigger.dataset.idx;
    openModal(idx, true);
    return;
  }
});

// Search & Status Filter
document.getElementById("searchBox").addEventListener("input", (e) => render(e.target.value));
document.getElementById("statusFilter").addEventListener("change", () => render());

// Modal Handling
const appModal = document.getElementById("appModal");
const modalForm = document.getElementById("modalForm");
const modalTitle = document.getElementById("modalTitle");
const modalAppIdx = document.getElementById("modalAppIdx");
const modalCompany = document.getElementById("modalCompany");
const modalJobTitle = document.getElementById("modalJobTitle");
const modalUrl = document.getElementById("modalUrl");
const modalDate = document.getElementById("modalDate");
const modalStatus = document.getElementById("modalStatus");
const modalNotes = document.getElementById("modalNotes");

function openModal(idx = -1, focusNotes = false) {
  modalAppIdx.value = idx;

  if (idx >= 0 && apps[idx]) {
    const a = apps[idx];
    modalTitle.textContent = "Edit Job Application";
    modalCompany.value = a.company || "";
    modalJobTitle.value = a.jobTitle || "";
    modalUrl.value = a.url || "";
    modalDate.value = a.date ? a.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    modalStatus.value = a.status || "Applied";
    modalNotes.value = a.notes || "";
  } else {
    modalTitle.textContent = "Add Job Application";
    modalCompany.value = "";
    modalJobTitle.value = "";
    modalUrl.value = "";
    modalDate.value = new Date().toISOString().slice(0, 10);
    modalStatus.value = "Applied";
    modalNotes.value = "";
  }

  appModal.style.display = "flex";

  setTimeout(() => {
    if (focusNotes) {
      modalNotes.focus();
    } else if (idx < 0) {
      modalCompany.focus();
    }
  }, 50);
}

function closeModal() {
  appModal.style.display = "none";
}

document.getElementById("btnAdd").addEventListener("click", () => openModal(-1));
document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
document.getElementById("modalCancelBtn").addEventListener("click", closeModal);

// Close on backdrop click
appModal.addEventListener("click", (e) => {
  if (e.target === appModal) closeModal();
});

// Close on Escape key
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && appModal.style.display === "flex") {
    closeModal();
  }
});

// Save Application from Modal
modalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const idx = +modalAppIdx.value;
  const company = modalCompany.value.trim();
  const jobTitle = modalJobTitle.value.trim();
  const url = modalUrl.value.trim();
  const dateVal = modalDate.value;
  const dateIso = dateVal ? new Date(dateVal + "T12:00:00").toISOString() : new Date().toISOString();
  const status = modalStatus.value || "Applied";
  const notes = modalNotes.value.trim();

  if (!company || !jobTitle) {
    alert("Please provide both Company Name and Job Title.");
    return;
  }

  if (idx >= 0 && apps[idx]) {
    apps[idx].company = company;
    apps[idx].jobTitle = jobTitle;
    apps[idx].url = url;
    apps[idx].date = dateIso;
    apps[idx].status = status;
    apps[idx].notes = notes;
    toast("Application updated ✓");
  } else {
    apps.unshift({
      date: dateIso,
      company,
      jobTitle,
      url,
      status,
      notes
    });
    toast("Application added ✓");
  }

  await save();
  render();
  closeModal();
});

// Clear All Applications
document.getElementById("btnClearAll").addEventListener("click", async () => {
  if (!apps.length) {
    toast("Nothing to clear.");
    return;
  }
  if (!confirm(`Delete all ${apps.length} application(s)? This cannot be undone.`)) return;
  apps = [];
  await save();
  render();
  toast("All entries cleared");
});

// Download as CSV with Notes
document.getElementById("btnExcel").addEventListener("click", () => {
  if (!apps.length) {
    toast("No applications to export.");
    return;
  }
  const headers = ["Date Applied", "Company", "Job Title", "URL", "Status", "Notes"];
  const rows = [...apps].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).map((a) => [
    fmtDate(a.date),
    a.company  || "",
    a.jobTitle || "",
    a.url      || "",
    a.status   || "Applied",
    a.notes    || ""
  ]);
  const csvRows = [headers, ...rows].map((r) =>
    r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
  );
  const csv = "\uFEFF" + csvRows.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `job-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  toast("Downloading CSV with notes ✓");
});

// Extra Notes & Scratchpad Auto-Save
let notesDebounce = null;
const generalNotesBox = document.getElementById("generalNotesBox");
const notesSavedIndicator = document.getElementById("notesSavedIndicator");

if (generalNotesBox) {
  generalNotesBox.addEventListener("input", () => {
    if (notesSavedIndicator) {
      notesSavedIndicator.textContent = "Saving…";
      notesSavedIndicator.classList.add("saving");
    }
    clearTimeout(notesDebounce);
    notesDebounce = setTimeout(async () => {
      await chrome.storage.local.set({ general_notes: generalNotesBox.value });
      if (notesSavedIndicator) {
        notesSavedIndicator.textContent = "✓ Auto-saved";
        notesSavedIndicator.classList.remove("saving");
      }
    }, 400);
  });
}

// Quick Templates for Scratchpad
function insertTemplate(tplText) {
  if (!generalNotesBox) return;
  const current = generalNotesBox.value.trim();
  generalNotesBox.value = current ? current + "\n\n" + tplText : tplText;
  generalNotesBox.dispatchEvent(new Event("input"));
  generalNotesBox.scrollTop = generalNotesBox.scrollHeight;
  generalNotesBox.focus();
  toast("Template added to notes ✓");
}

document.getElementById("btnTplPrep")?.addEventListener("click", () => {
  insertTemplate(`--- 🎯 Interview Prep Notes ---
• Role & Team: 
• Top 3 projects to highlight:
  1. 
  2. 
  3. 
• Technical topics / System Design focus: 
• Behavioral stories (STAR method: Situation, Task, Action, Result): `);
});

document.getElementById("btnTplQuestions")?.addEventListener("click", () => {
  insertTemplate(`--- ❓ Questions to Ask Interviewers ---
1. What does high performance and success look like in this role in the first 90 days?
2. What are the biggest technical or architectural challenges the team is tackling now?
3. How does the team balance technical debt reduction with product shipping speed?
4. What does the typical engineering mentorship and career progression path look like?`);
});

document.getElementById("btnTplSalary")?.addEventListener("click", () => {
  insertTemplate(`--- 💰 Salary & Counter Offer Notes ---
• Current Target Base Salary: 
• Target Total Compensation (Base + Bonus + Equity): 
• Initial Company Offer: 
• Counter Offer Proposal: 
• Key Leverage & Justification Points: 
• Additional Perks (Sign-on bonus, extra PTO, remote flexibility): `);
});

document.getElementById("btnTplChecklist")?.addEventListener("click", () => {
  insertTemplate(`--- ✅ Follow-up & Application Checklist ---
• [ ] Connect with recruiter & hiring manager on LinkedIn
• [ ] Send personalized thank-you email within 24 hours of interview
• [ ] Complete Take-Home / Coding Assessment before deadline
• [ ] Follow up if no response within 5-7 business days`);
});

// Storage sync listener
chrome.storage.onChanged.addListener((changes) => {
  if (changes.applications) {
    apps = changes.applications.newValue || [];
    updateStats();
    updateFilterDropdown();
    render();
  }
  if (changes.general_notes && generalNotesBox && document.activeElement !== generalNotesBox) {
    generalNotesBox.value = changes.general_notes.newValue || "";
  }
});

load();
