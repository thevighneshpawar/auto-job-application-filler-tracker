import { pdfToText, docxToText } from "./extract.js";

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
}

const $ = (id) => document.getElementById(id);
let profile = {}, timer;

// ---------- Repeatable data stores ----------
let experiences   = [];   // [{expCompany, expTitle, expStartDate, expEndDate, expCurrently, expDescription}]
let educations    = [];   // [{college, degree, specialization, eduStartDate, eduEndDate, cgpa}]
let certifications = [];  // [{certName, certIssuer, certUrl, certYear}]

// ---------- Repeatable section definitions ----------
const REP_SECTIONS = {
  "Work Experience": {
    store: () => experiences,
    setStore: (v) => { experiences = v; },
    storageKey: "experiences",
    cardLabel: (entry) => entry.expCompany || entry.expTitle || "New Entry",
    fields: [
      { k: "expCompany",     label: "Company / Employer",       t: "text",  full: false },
      { k: "expTitle",       label: "Job Title / Designation",  t: "text",  full: false },
      { k: "expStartDate",   label: "Start Date",               t: "month", full: false },
      { k: "expEndDate",     label: "End Date",                 t: "month", full: false },
      { k: "expCurrently",   label: "Currently working here",   t: "check", full: false },
      { k: "expDescription", label: "Role Description / Responsibilities", t: "area", full: true },
    ]
  },
  "Education": {
    store: () => educations,
    setStore: (v) => { educations = v; },
    storageKey: "educations",
    cardLabel: (entry) => entry.college || entry.degree || "New Entry",
    fields: [
      { k: "college",        label: "College / University",     t: "text",  full: false },
      { k: "degree",         label: "Degree",                   t: "text",  full: false },
      { k: "specialization", label: "Branch / Specialization",  t: "text",  full: false },
      { k: "eduStartDate",   label: "Start Date",               t: "month", full: false },
      { k: "eduEndDate",     label: "End Date / Graduation",    t: "month", full: false },
      { k: "cgpa",           label: "CGPA / Percentage",        t: "text",  full: false },
    ]
  },
  "Certifications": {
    store: () => certifications,
    setStore: (v) => { certifications = v; },
    storageKey: "certifications",
    cardLabel: (entry) => entry.certName || "New Certificate",
    fields: [
      { k: "certName",   label: "Certificate / Course Name",  t: "text", full: false },
      { k: "certIssuer", label: "Issuing Organisation",       t: "text", full: false },
      { k: "certUrl",    label: "Certificate URL / Credential Link", t: "text", full: true },
      { k: "certYear",   label: "Year / Date Completed",      t: "text", full: false },
    ]
  }
};

// Sections that are rendered as repeatable cards (skip from flat JF_SECTIONS render)
const REP_SECTION_NAMES = new Set(["Work Experience", "Education", "Certifications"]);
// JF_SECTIONS that map to repeatable (Education and Work are mixed: partial flat + repeatable)
// We only skip rendering of sections that are purely repeatable in our UI
const SKIP_FLAT_SECTIONS = new Set(["Education", "Certifications"]);
// Work section still has flat fields (currentCompany, jobTitle, experience, CTC, noticePeriod, skills)
// but we also show the repeatable experience cards

function build() {
  const host = $("sections"); host.innerHTML = "";

  // Render flat JF_SECTIONS (excluding pure repeatable ones)
  JF_SECTIONS.forEach((s) => {
    if (SKIP_FLAT_SECTIONS.has(s)) return; // rendered as repeatable cards below

    const sec = document.createElement("section");
    sec.innerHTML = `<h2>${s}</h2><div class="grid"></div>`;
    const grid = sec.querySelector(".grid");

    JF_FIELDS.filter((f) => f.sec === s).forEach((f) => {
      const l = document.createElement("label");
      l.textContent = f.label;
      if (f.t === "area" || f.k === "address" || f.k === "permanentAddress") l.className = "full";
      let el;
      if (f.t === "area") { el = document.createElement("textarea"); el.rows = 4; }
      else if (f.t === "yesno" || f.t === "sel") {
        el = document.createElement("select");
        (f.opts || ["", "Yes", "No"]).forEach((o) => {
          const op = document.createElement("option"); op.value = o; op.textContent = o || "— not set —"; el.appendChild(op);
        });
      } else { el = document.createElement("input"); el.type = f.t === "date" ? "date" : "text"; }
      el.id = "f_" + f.k; el.value = profile[f.k] || "";
      el.addEventListener("input", queue); el.addEventListener("change", queue);
      l.appendChild(el); grid.appendChild(l);
    });

    // For the Work section, add a divider + repeatable experience cards after flat fields
    if (s === "Work") {
      const divider = document.createElement("div");
      divider.className = "full";
      divider.style.cssText = "border-top:1px solid #e5e7eb;margin:8px 0;grid-column:1/-1";
      grid.appendChild(divider);
      const expLabel = document.createElement("div");
      expLabel.className = "full";
      expLabel.style.cssText = "font-size:13px;font-weight:700;color:#374151;grid-column:1/-1;margin-bottom:4px";
      expLabel.textContent = "Experience History";
      grid.appendChild(expLabel);
      const expContainer = document.createElement("div");
      expContainer.className = "full rep-section";
      expContainer.id = "rep_Work Experience";
      grid.appendChild(expContainer);
      renderRepSection("Work Experience", expContainer);
    }

    host.appendChild(sec);
  });

  // Render Education as repeatable section
  renderSectionBlock("Education", host);
  // Render Certifications as repeatable section
  renderSectionBlock("Certifications", host);
}

function renderSectionBlock(name, host) {
  const sec = document.createElement("section");
  sec.innerHTML = `<h2>${name}</h2>`;
  const container = document.createElement("div");
  container.className = "rep-section";
  container.id = `rep_${name}`;
  sec.appendChild(container);
  renderRepSection(name, container);
  host.appendChild(sec);
}

function renderRepSection(name, container) {
  const def = REP_SECTIONS[name];
  container.innerHTML = "";
  const store = def.store();

  store.forEach((entry, idx) => {
    container.appendChild(makeCard(name, entry, idx));
  });

  const addBtn = document.createElement("button");
  addBtn.className = "add-btn";
  addBtn.innerHTML = `<span style="font-size:18px;line-height:1">＋</span> Add ${name === "Work Experience" ? "Experience" : name === "Education" ? "Education" : "Certification"}`;
  addBtn.addEventListener("click", () => {
    def.store().push({});
    renderRepSection(name, container);
    saveRepData(name);
  });
  container.appendChild(addBtn);
}

function makeCard(name, entry, idx) {
  const def = REP_SECTIONS[name];
  const card = document.createElement("div");
  card.className = "rep-card";

  const header = document.createElement("div");
  header.className = "card-header";
  const titleEl = document.createElement("span");
  titleEl.className = "card-title";
  titleEl.textContent = `${name === "Work Experience" ? "Experience" : name === "Education" ? "Education" : "Certification"} #${idx + 1}`;
  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-btn";
  removeBtn.textContent = "✕ Remove";
  removeBtn.addEventListener("click", () => {
    def.store().splice(idx, 1);
    const container = document.getElementById(`rep_${name}`);
    renderRepSection(name, container);
    saveRepData(name);
  });
  header.appendChild(titleEl); header.appendChild(removeBtn);
  card.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "grid";

  def.fields.forEach((fd) => {
    if (fd.t === "check") {
      const row = document.createElement("div");
      row.className = "check-row";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.id = `rep_${name}_${idx}_${fd.k}`;
      cb.checked = !!(entry[fd.k]);
      cb.addEventListener("change", () => {
        def.store()[idx][fd.k] = cb.checked;
        // Toggle end date field visibility
        const endInput = document.getElementById(`rep_${name}_${idx}_expEndDate`);
        if (endInput) { endInput.disabled = cb.checked; endInput.style.opacity = cb.checked ? "0.4" : "1"; }
        saveRepData(name);
      });
      const lbl = document.createElement("label");
      lbl.htmlFor = cb.id; lbl.textContent = fd.label;
      row.appendChild(cb); row.appendChild(lbl);
      grid.appendChild(row);
      return;
    }

    const l = document.createElement("label");
    if (fd.full) l.className = "full";
    l.textContent = fd.label;
    let el;
    if (fd.t === "area") { el = document.createElement("textarea"); el.rows = 3; }
    else { el = document.createElement("input"); el.type = fd.t || "text"; }
    el.id = `rep_${name}_${idx}_${fd.k}`;
    el.value = entry[fd.k] || "";
    // Disable end date if currently working
    if (fd.k === "expEndDate" && entry.expCurrently) { el.disabled = true; el.style.opacity = "0.4"; }
    el.addEventListener("input", () => { def.store()[idx][fd.k] = el.value; saveRepData(name); });
    el.addEventListener("change", () => { def.store()[idx][fd.k] = el.value; saveRepData(name); });
    l.appendChild(el); grid.appendChild(l);
  });

  card.appendChild(grid);
  return card;
}

async function saveRepData(name) {
  const def = REP_SECTIONS[name];
  const data = {};
  data[def.storageKey] = def.store();
  await chrome.storage.local.set(data);
  flash();
}

function collect() {
  const p = {};
  JF_FIELDS.forEach((f) => {
    const el = $("f_" + f.k);
    if (el) p[f.k] = el.value.trim();
  });
  return p;
}
function queue() { clearTimeout(timer); timer = setTimeout(async () => { profile = collect(); await chrome.storage.local.set({ profile }); flash(); }, 350); }
function flash() { const s = $("saved"); s.style.opacity = 1; setTimeout(() => (s.style.opacity = 0), 900); }
function showResume(r) { $("resumeInfo").textContent = r ? `${r.name} (${Math.round(r.size / 1024)} KB)` : "No resume saved"; }

async function bufToText(buf, name) {
  name = name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdfjs = await import("./lib/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.mjs");
    return pdfToText(pdfjs, buf);
  }
  if (name.endsWith(".docx")) return docxToText(buf);
  throw new Error("unsupported");
}
function dataUrlToBuf(u) { const b = atob(u.split(",")[1] || ""), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a.buffer; }
const say = (h) => ($("importInfo").innerHTML = h);

async function importFromResume(buf, name, overwrite) {
  say("Reading your resume…");
  let text;
  try { text = await bufToText(buf, name); }
  catch (e) { say(e.message === "unsupported" ? "Resume saved for uploads. I can only read details from PDF or DOCX files, so please fill the form below by hand." : "Couldn't read this file (scanned image PDFs have no text). Resume is still saved for uploads."); return; }
  if (text.replace(/\s/g, "").length < 80) { say("This PDF has no readable text (probably a scanned image). Resume is saved for uploads; please fill details by hand."); return; }
  const parsed = parseResume(text), got = [], skipped = [];
  for (const [k, v] of Object.entries(parsed)) {
    const el = $("f_" + k); if (!el) continue;
    if (el.value && !overwrite) { skipped.push(k); continue; }
    el.value = v; if (el.value === v) got.push(k); else el.value = "";
  }
  if (got.length) queue();
  const lab = (k) => (JF_FIELDS.find((f) => f.k === k) || {}).label || k;
  say(`<b>Filled ${got.length} field(s) from your resume.</b> Please review them below, as automatic reading can make mistakes.` +
    (skipped.length ? `<br>Kept your existing values for: ${skipped.map(lab).join(", ")}.` : "") +
    `<br>Not found, fill by hand: ${["address","currentCTC","expectedCTC","noticePeriod"].filter((k) => !parsed[k]).map(lab).join(", ")}, plus the Quick answers and Long answers sections.`);
}

$("resumeFile").onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  if (f.size > 8 * 1024 * 1024) { alert("Please use a file under 8 MB."); return; }
  const fr = new FileReader();
  fr.onload = async () => {
    const r = { name: f.name, type: f.type, size: f.size, data: fr.result };
    await chrome.storage.local.set({ resume: r }); showResume(r); flash();
    importFromResume(await f.arrayBuffer(), f.name, false);
  };
  fr.readAsDataURL(f);
};
$("reparse").onclick = async () => {
  const d = await chrome.storage.local.get("resume");
  if (!d.resume) { say("Upload a resume first."); return; }
  if (confirm("Re-read the resume and overwrite the matching fields below?")) importFromResume(dataUrlToBuf(d.resume.data), d.resume.name, true);
};
$("resumeClear").onclick = async () => { await chrome.storage.local.remove("resume"); showResume(null); };
$("exp").onclick = () => {
  const full = { profile: collect(), experiences, educations, certifications };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(full, null, 2)], { type: "application/json" }));
  a.download = "job-filler-details.json"; a.click();
};
$("imp").onclick = () => $("impFile").click();
$("impFile").onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(async (t) => {
    try {
      const parsed = JSON.parse(t);
      // Support both old flat format and new format with arrays
      profile = parsed.profile || parsed;
      if (parsed.experiences) experiences = parsed.experiences;
      if (parsed.educations)  educations  = parsed.educations;
      if (parsed.certifications) certifications = parsed.certifications;
      await chrome.storage.local.set({ profile, experiences, educations, certifications });
      build(); flash();
    } catch (x) { alert("Not a valid backup file."); }
  });
};
$("wipe").onclick = async () => {
  if (confirm("Delete your saved details and resume from this browser?")) {
    await chrome.storage.local.clear();
    profile = {}; experiences = []; educations = []; certifications = [];
    build(); showResume(null);
  }
};

// Init
chrome.storage.local.get(["profile", "resume", "experiences", "educations", "certifications"]).then((d) => {
  profile        = d.profile        || {};
  experiences    = d.experiences    || [];
  educations     = d.educations     || [];
  certifications = d.certifications || [];
  build();
  showResume(d.resume);
});
