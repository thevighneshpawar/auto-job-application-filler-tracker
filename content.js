(() => {
  if (window.__jfLoaded) return; window.__jfLoaded = true;
  const SEL = 'input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="combobox"],[role="textbox"],button[aria-haspopup="listbox"]';
  const SKIP_TYPES = new Set(["hidden", "password", "submit", "button", "reset", "image", "range", "color", "checkbox", "search"]);
  const BAD = /captcha|otp|passw|csrf|token|honeypot|search|coupon|promo|aadhaar|aadhar|\bssn\b|\bpan\b|verification/;
  const PLACEHOLDER = /^(select|choose|please|pick|none|\-+|)$|^(select|choose|please select)\b/;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const split = (s) => (s || "").replace(/([a-z])([A-Z])/g, "$1 $2");
  const up = (n) => n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
  const rootOf = (el) => el.getRootNode ? el.getRootNode() : document;

  // ---------- DOM helpers (pierce open shadow roots) ----------
  function deepAll(root, sel, out = []) {
    root.querySelectorAll(sel).forEach((e) => out.push(e));
    root.querySelectorAll("*").forEach((e) => { if (e.shadowRoot) deepAll(e.shadowRoot, sel, out); });
    return out;
  }
  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    if (r.right < -50 || r.bottom < -50 || r.left < -50) return false; // off-screen honeypots
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }
  function fire(el, type, init) {
    const C = /^(pointer)/.test(type) && window.PointerEvent ? PointerEvent : /^(mouse|click)/.test(type) ? MouseEvent : Event;
    el.dispatchEvent(new C(type, Object.assign({ bubbles: true, cancelable: true, composed: true }, init || {})));
  }
  function click(el) { ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((t) => fire(el, t, { view: window })); }
  function nativeSet(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, "value");
    d && d.set ? d.set.call(el, v) : (el.value = v); // bypasses React/Vue value trackers
  }
  const mark = (el) => { try { el.style.outline = "2px solid #22c55e"; el.style.outlineOffset = "1px"; } catch (e) {} };

  // ---------- In-page toast notification ----------
  function showToast(msg, isWarning, trackingPayload) {
    const existing = document.getElementById("__jf_toast");
    if (existing) existing.remove();
    const t = document.createElement("div");
    t.id = "__jf_toast";
    Object.assign(t.style, {
      position: "fixed", top: "16px", right: "16px", zIndex: "2147483647",
      background: isWarning ? "#92400e" : "#1e3a5f",
      color: "#fff", padding: "12px 16px", borderRadius: "10px",
      fontSize: "13px", lineHeight: "1.5", maxWidth: "360px",
      boxShadow: "0 4px 20px rgba(0,0,0,.35)", fontFamily: "system-ui,sans-serif",
      transition: "opacity .4s"
    });

    let bodyHtml = msg;
    if (trackingPayload) {
      bodyHtml += `
        <div style="margin-top:10px;display:flex;gap:8px">
          <button id="__jf_toast_track_btn" style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">
            ➕ Add to Tracker
          </button>
        </div>
      `;
    }
    t.innerHTML = bodyHtml;
    document.body.appendChild(t);

    const btn = t.querySelector("#__jf_toast_track_btn");
    if (btn && trackingPayload) {
      btn.onclick = (e) => {
        e.stopPropagation();
        btn.disabled = true;
        btn.textContent = "Adding…";
        chrome.runtime.sendMessage({
          type: "track_application",
          tracking: trackingPayload
        }).then(() => {
          btn.textContent = "✅ Added to Tracker!";
          btn.style.background = "#15803d";
        }).catch(() => {
          btn.disabled = false;
          btn.textContent = "➕ Add to Tracker";
        });
      };
    }

    // Dismiss on click outside of buttons
    t.addEventListener("click", (e) => {
      if (e.target && e.target.id === "__jf_toast_track_btn") return;
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 400);
    });
    // Auto-dismiss after 12 s
    setTimeout(() => {
      if (t.parentNode) {
        t.style.opacity = "0";
        setTimeout(() => t.remove(), 400);
      }
    }, 12000);
  }

  // ---------- Detect framework/site ----------
  const isWorkday = () => /myworkdayjobs\.com|workday\.com/.test(location.hostname) ||
    !!document.querySelector('[data-automation-id]');
  const isAngularLike = () => !!(document.querySelector('[ng-model],[formcontrolname],[data-reactroot]') ||
    document.querySelector('[class*="ng-"][class*="invalid"]') ||
    isWorkday());

  // ---------- Label discovery ----------
  function wrapperText(el) {
    let n = up(el), depth = 0;
    if (el.type === "radio") {
      while (n && [...n.querySelectorAll("input[type=radio]")].filter((r) => r.name === el.name).length < 2 && depth++ < 5) n = up(n);
      depth = 0;
    }
    while (n && depth++ < 7) {
      const others = [...n.querySelectorAll("input,select,textarea")].filter((c) =>
        c !== el && c.type !== "hidden" && !(el.type === "radio" && c.type === "radio" && c.name === el.name));
      if (others.length) break;
      const c = n.cloneNode(true);
      c.querySelectorAll("select,option,script,style,input,textarea,svg").forEach((x) => x.remove());
      const t = (c.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length > 400) break;
      if (t.length >= 2) return t;
      n = up(n);
    }
    return "";
  }
  function sources(el) {
    const out = [], add = (t, w) => { t = norm(t); if (t) out.push({ t, w }); };
    const radio = el.type === "radio";
    if (!radio) {
      add(el.getAttribute("aria-label"), 3); add(el.placeholder, 3);
      if (el.labels) [...el.labels].forEach((l) => add(l.textContent, 3));
      const lb = el.getAttribute("aria-labelledby");
      if (lb) lb.split(/\s+/).forEach((id) => { const n = (rootOf(el).getElementById && rootOf(el).getElementById(id)) || document.getElementById(id); if (n) add(n.textContent, 3); });
      ["name", "id", "data-automation-id", "data-testid", "data-test", "data-qa", "data-field", "data-name", "title"].forEach((a) => add(split(el.getAttribute(a)), 2));
    }
    add(wrapperText(el), radio ? 3 : 1);
    return out;
  }
  const kindOf = (el) => {
    if (el.tagName === "SELECT") return "select";
    if (el.tagName === "INPUT" && el.type === "radio") return "radio";
    if (el.tagName === "INPUT" && el.type === "file") return "file";
    if (el.tagName === "BUTTON" || (el.getAttribute("role") === "combobox" && el.tagName !== "INPUT")) return "combo";
    if (el.tagName === "INPUT" && el.getAttribute("role") === "combobox") return "comboInput";
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return "text";
    return "rich";
  };
  const isArea = (el, kind) => el.tagName === "TEXTAREA" || kind === "rich";

  // ---------- Matching ----------
  function matchKey(el, kind, srcs) {
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase().split(/\s+/).pop();
    if (ac && JF_AC[ac]) return JF_AC[ac];
    const area = isArea(el, kind);
    let best = null, bs = 0;
    for (const f of JF_FIELDS) {
      if ((f.area && !area) || (f.noArea && area)) continue;
      for (const s of srcs) for (const re of f.re) {
        const m = re.exec(s.t);
        if (m) { const sc = s.w * 100 + f.p * 10 + m[0].trim().length; if (sc > bs) { bs = sc; best = f.k; } }
      }
    }
    if (el.type === "email") return "email";
    if (el.type === "tel" && best !== "altPhone" && best !== "phoneCode") return "phone";
    return best;
  }
  function companyGuess() {
    try {
      const h = location.hostname, seg = location.pathname.split("/").filter(Boolean)[0];
      const q = new URLSearchParams(location.search).get("for") || new URLSearchParams(location.search).get("company");
      if (q) return q;
      if (/greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|recruitee\.com|breezy\.hr/.test(h) && seg && !/^(embed|jobs|apply)$/.test(seg)) return seg.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      if (/myworkdayjobs\.com/.test(h)) return h.split(".")[0].replace(/\b\w/g, (c) => c.toUpperCase());
      if (/hackerrank\.com/.test(h)) {
        const hrComp = document.querySelector('[data-automation="company-name"], .company-name, .header-company');
        if (hrComp && hrComp.textContent.trim()) return hrComp.textContent.trim();
        return "HackerRank";
      }
      const og = document.querySelector('meta[property="og:site_name"]');
      if (og && og.content) return og.content.trim();
      const parts = document.title.split(/[-|–—·•:]/).map((s) => s.replace(/\b(careers?|jobs?|hiring|apply|application|portal|opening|assessment|test|thank you)\b/gi, "").trim()).filter(Boolean);
      if (parts.length > 1) return parts[parts.length - 1];
      // Subdomain fallback (e.g. company.recruitee.com)
      const sub = h.split(".")[0];
      if (sub && sub !== "www" && sub !== "jobs" && sub !== "careers") return sub.charAt(0).toUpperCase() + sub.slice(1);
    } catch (e) {}
    return location.hostname.replace(/^www\./, "");
  }

  function jobTitleGuess() {
    try {
      const h1 = document.querySelector("h1, [class*='job-title' i], [class*='jobTitle' i], [data-automation-id*='jobTitle']");
      if (h1 && h1.textContent.trim().length < 80) return h1.textContent.trim();
      const parts = document.title.split(/[-|–—·•:]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) return parts[0];
    } catch (e) {}
    return "Job Application";
  }
  function dateFor(iso, el) {
    if (el.type === "date") return iso;
    if (el.type === "month") { const m = /^(\d{4})-(\d{2})/.exec(iso); return m ? `${m[1]}-${m[2]}` : iso; }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); if (!m) return iso;
    const ph = (el.placeholder || "").toLowerCase();
    return /^m+/.test(ph) ? `${m[2]}/${m[3]}/${m[1]}` : /^y+/.test(ph) ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}/${m[2]}/${m[1]}`;
  }
  function valueFor(k, p, el) {
    let v = p[k];
    const parts = (p.fullName || "").trim().split(/\s+/);
    if (!v && k === "fullName") v = [p.firstName, p.lastName].filter(Boolean).join(" ");
    if (!v && k === "firstName" && parts[0]) v = parts[0];
    if (!v && k === "lastName" && parts.length > 1) v = parts.slice(1).join(" ");
    if (!v) return "";
    v = String(v);
    if (k === "dob") v = dateFor(v, el);
    if (/\{company\}/.test(v)) v = v.replace(/\{company\}/g, companyGuess() || "your company");
    if (el.type === "number") { const n = parseFloat(v); if (isNaN(n)) return ""; v = String(n); }
    const ml = el.maxLength > 0 ? el.maxLength : 0;
    if (ml && v.length > ml) v = (k === "phone" || k === "altPhone") ? v.replace(/\D/g, "").slice(-ml) : v.slice(0, ml);
    return v;
  }

  // ---------- "Already filled?" ----------
  function filled(el, kind) {
    if (kind === "select") { const o = el.selectedOptions[0]; return el.selectedIndex > 0 && o && o.value !== "" && !PLACEHOLDER.test(norm(o.text)); }
    if (kind === "radio") return [...rootOf(el).querySelectorAll('input[type=radio]')].some((r) => r.name === el.name && r.checked);
    if (kind === "combo") return !PLACEHOLDER.test(norm(el.textContent));
    if (kind === "rich") return !!(el.textContent || "").trim();
    if (kind === "file") return !!(el.files && el.files.length);
    return !!(el.value || "").trim();
  }

  // ---------- Option matching ----------
  function pickBest(items, v, textOf) {
    const nv = norm(v), t0 = v.trim();
    const yes = /^(yes|y|true)$/i.test(t0), no = /^(no|n|false)$/i.test(t0);
    let best = null, bs = 0;
    for (const it of items) {
      const t = norm(textOf(it)); if (!t || PLACEHOLDER.test(t)) continue;
      let s = 0;
      if (yes) s = /^(yes|y)\b/.test(t) ? 3 : 0;
      else if (no) s = /^(no|n|not)\b/.test(t) ? 3 : 0;
      else if (t === nv) s = 4;
      else if (t.startsWith(nv) || (nv.startsWith(t) && t.length > 2)) s = 3;
      else if (t.includes(nv)) s = 2;
      else if (nv.includes(t) && t.length > 2) s = 1;
      if (s > bs) { bs = s; best = it; }
    }
    return best;
  }

  // ---------- Appliers ----------
  // Simulates a full user-like typing interaction for framework compatibility (React, Angular, Workday)
  async function setText(el, v) {
    if (el.isContentEditable) {
      el.focus(); document.execCommand("selectAll", false); document.execCommand("insertText", false, v);
      fire(el, "input"); mark(el); return !!(el.textContent || "").trim();
    }

    // Step 1: focus + pointer events (Workday requires real pointerdown)
    el.focus();
    fire(el, "pointerdown", { view: window });
    fire(el, "mousedown",   { view: window });
    fire(el, "pointerup",   { view: window });
    fire(el, "mouseup",     { view: window });
    fire(el, "click",       { view: window });
    fire(el, "focus");

    // Step 2: clear existing value
    nativeSet(el, "");
    fire(el, "input");

    // Step 3: set value via native setter (bypasses React/Angular tracker)
    nativeSet(el, v);

    // Step 4: fire InputEvent with correct inputType (required by Angular/Workday change detection)
    try {
      el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: v }));
    } catch (e) {
      fire(el, "input");
    }

    // Step 5: fire keydown/keyup for last character (some frameworks listen for keyboard events)
    const lastChar = v.slice(-1);
    if (lastChar) {
      ["keydown", "keypress", "keyup"].forEach((evt) => {
        el.dispatchEvent(new KeyboardEvent(evt, {
          bubbles: true, composed: true, cancelable: true,
          key: lastChar, code: "Key" + lastChar.toUpperCase(),
          charCode: lastChar.charCodeAt(0), keyCode: lastChar.charCodeAt(0)
        }));
      });
    }

    // Step 6: change event
    fire(el, "change");

    await sleep(80);

    // Step 7: fallback — if framework wiped the value, simulate real typing
    if (!el.value) {
      el.focus(); el.select && el.select();
      document.execCommand("insertText", false, v);
      fire(el, "input"); fire(el, "change");
      await sleep(50);
    }

    // Step 8: blur (triggers validation in Angular/Workday)
    fire(el, "blur");
    el.blur && el.blur();
    await sleep(30);

    // Step 9: if still empty after blur, one more attempt using execCommand
    if (!el.value && v) {
      el.focus();
      el.select && el.select();
      document.execCommand("insertText", false, v);
      fire(el, "input"); fire(el, "change");
      fire(el, "blur"); el.blur && el.blur();
    }

    const ok = !!(el.value || "").trim(); if (ok) mark(el); return ok;
  }

  async function setSelect(el, v) {
    const o = pickBest([...el.options], v, (x) => x.text) || pickBest([...el.options], v, (x) => x.value);
    if (!o) return false;
    nativeSet(el, o.value); fire(el, "input"); fire(el, "change"); mark(el); return true;
  }
  function optionLabel(r) {
    return (r.labels && r.labels[0] && r.labels[0].textContent) || (r.nextSibling && r.nextSibling.textContent) || (r.parentElement && r.parentElement.textContent) || r.value || "";
  }
  async function setRadio(el, v) {
    const group = [...rootOf(el).querySelectorAll("input[type=radio]")].filter((r) => r.name === el.name);
    const o = pickBest(group, v, optionLabel); if (!o) return false;
    o.click(); if (!o.checked) { o.checked = true; fire(o, "input"); fire(o, "change"); }
    mark(o.parentElement || o); return true;
  }
  function findOptions(trigger) {
    const id = trigger.getAttribute("aria-controls") || trigger.getAttribute("aria-owns");
    const scope = (id && (rootOf(trigger).getElementById ? rootOf(trigger).getElementById(id) : document.getElementById(id))) || document;
    const sel = '[role="option"],[class*="__option"],[class*="-option"],[data-automation-id*="promptOption"]';
    return deepAll(scope === document ? document : scope, sel).filter(visible);
  }
  async function setCombo(el, v, typed) {
    el.focus(); click(el);
    if (typed) { nativeSet(el, v); fire(el, "input"); }
    let opts = [];
    for (let i = 0; i < 12 && !opts.length; i++) { await sleep(100); opts = findOptions(el); }
    if (!opts.length && typed) { fire(el, "keydown", { key: "ArrowDown" }); await sleep(250); opts = findOptions(el); }
    const best = pickBest(opts, v, (o) => o.textContent);
    if (best) { click(best); await sleep(120); mark(el); return true; }
    if (opts.length) { el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }
    if (typed) { fire(el, "blur"); return !!el.value && el.getAttribute("aria-autocomplete") !== "list"; }
    return false;
  }
  function b64ToFile(r) {
    const bin = atob(r.data.split(",")[1] || ""), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], r.name, { type: r.type || "application/pdf" });
  }
  async function setFile(el, resume) {
    const dt = new DataTransfer(); dt.items.add(b64ToFile(resume));
    el.files = dt.files; fire(el, "input"); fire(el, "change"); mark(el.parentElement || el); return el.files.length > 0;
  }

  // ---------- Orchestration ----------
  function flattenProfile(profile, experiences, educations, certifications) {
    // Merge first entry from repeatable arrays back into the flat profile for content-script matching
    const merged = Object.assign({}, profile);
    if (experiences && experiences.length > 0) {
      const e = experiences[0];
      if (!merged.currentCompany && e.expCompany) merged.currentCompany = e.expCompany;
      if (!merged.jobTitle       && e.expTitle)   merged.jobTitle       = e.expTitle;
    }
    if (educations && educations.length > 0) {
      const e = educations[0];
      if (!merged.college        && e.college)        merged.college        = e.college;
      if (!merged.degree         && e.degree)         merged.degree         = e.degree;
      if (!merged.specialization && e.specialization) merged.specialization = e.specialization;
      if (!merged.eduStartDate   && e.eduStartDate)   merged.eduStartDate   = e.eduStartDate;
      if (!merged.eduEndDate     && e.eduEndDate)     merged.eduEndDate     = e.eduEndDate;
      if (!merged.cgpa           && e.cgpa)           merged.cgpa           = e.cgpa;
      if (!merged.graduationYear && e.eduEndDate)     merged.graduationYear = e.eduEndDate.split("-")[0] || "";
    }
    if (certifications && certifications.length > 0) {
      const c = certifications[0];
      if (!merged.certName   && c.certName)   merged.certName   = c.certName;
      if (!merged.certIssuer && c.certIssuer) merged.certIssuer = c.certIssuer;
      if (!merged.certUrl    && c.certUrl)    merged.certUrl    = c.certUrl;
      if (!merged.certYear   && c.certYear)   merged.certYear   = c.certYear;
    }
    return merged;
  }

  function plan(profile, resume) {
    const items = [], unmatched = [], seenRadio = new Set();
    for (const el of deepAll(document, SEL)) {
      const kind = kindOf(el);
      if (el.disabled || el.readOnly || el.dataset.jfDone) continue;
      if (el.tagName === "INPUT" && SKIP_TYPES.has(el.type)) continue;
      if (el.closest && el.closest('[role="search"]')) continue;
      if (BAD.test(norm(split((el.name || "") + " " + (el.id || ""))))) continue;
      if (kind !== "radio" && kind !== "file" && !visible(el)) continue;
      if (kind === "radio") { const key = (el.name || "") + "|" + (el.form ? [...document.forms].indexOf(el.form) : -1); if (seenRadio.has(key)) continue; seenRadio.add(key); }
      if (filled(el, kind)) continue;
      const srcs = sources(el);
      if (kind === "file") {
        if (resume && srcs.some((s) => /resume|\bcv\b|curriculum/.test(s.t)) && !srcs.some((s) => /cover\s*letter/.test(s.t) && !/resume|\bcv\b/.test(s.t))) items.push({ el, kind, key: "resume" });
        continue;
      }
      const key = matchKey(el, kind, srcs);
      if (!key) { if (kind === "text" || kind === "rich") unmatched.push((srcs[0] ? srcs[0].t : el.name || el.id || "?").slice(0, 60)); continue; }
      const value = key === "resume" ? "x" : valueFor(key, profile, el);
      items.push({ el, kind, key, value, empty: !value });
    }
    return { items, unmatched };
  }
  async function apply(it, resume) {
    const { el, kind, value } = it;
    try {
      if (kind === "file")      return await setFile(el, resume);
      if (kind === "select")    return await setSelect(el, value);
      if (kind === "radio")     return await setRadio(el, value);
      if (kind === "combo")     return await setCombo(el, value, false);
      if (kind === "comboInput") return await setCombo(el, value, true);
      return await setText(el, value);
    } catch (e) { return false; }
  }
  // ---------- Application Submission & Thank-You Detection ----------
  // ---------- Application Submission & Thank-You Detection ----------
  function showThankYouCard(company, jobTitle) {
    if (document.getElementById("__jf_thankyou_card")) return;
    const card = document.createElement("div");
    card.id = "__jf_thankyou_card";
    Object.assign(card.style, {
      position: "fixed", bottom: "24px", right: "24px", zIndex: "2147483647",
      background: "#ffffff", color: "#1f2937", padding: "16px", borderRadius: "12px",
      boxShadow: "0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1)",
      border: "1.5px solid #86efac", fontFamily: "system-ui, -apple-system, sans-serif",
      maxWidth: "340px", fontSize: "13px", lineHeight: "1.4"
    });

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span style="font-weight:700;color:#166534;font-size:14px;display:flex;align-items:center;gap:6px">
          🎉 Application Submitted!
        </span>
        <button id="__jf_card_close" style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:16px;line-height:1;padding:0">✕</button>
      </div>
      <div style="color:#4b5563;margin-bottom:12px;font-size:12px">
        Want to save this application to your tracker sheet?
      </div>
      <div style="margin-bottom:8px">
        <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:2px">Company</label>
        <input id="__jf_card_company" type="text" value="${company || ''}" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;font-size:12px">
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:2px">Job Title / Role</label>
        <input id="__jf_card_title" type="text" value="${jobTitle || ''}" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;font-size:12px">
      </div>
      <div style="display:flex;gap:8px">
        <button id="__jf_card_add" style="flex:1;background:#16a34a;color:#fff;border:none;border-radius:6px;padding:8px;font-weight:600;cursor:pointer;font-size:12px">
          ➕ Add to Tracker
        </button>
        <button id="__jf_card_view" style="background:#f3f4f6;color:#374151;border:none;border-radius:6px;padding:8px 10px;font-weight:600;cursor:pointer;font-size:12px">
          📊 Tracker
        </button>
      </div>
    `;

    document.body.appendChild(card);

    document.getElementById("__jf_card_close").onclick = () => card.remove();
    document.getElementById("__jf_card_view").onclick = () => {
      chrome.runtime.sendMessage({ type: "open_tracker" }).catch(() => {});
    };

    document.getElementById("__jf_card_add").onclick = () => {
      const c = document.getElementById("__jf_card_company").value.trim();
      const t = document.getElementById("__jf_card_title").value.trim();
      chrome.runtime.sendMessage({
        type: "track_application",
        tracking: { company: c || "Unknown Company", jobTitle: t || "Job Application", url: location.href, date: new Date().toISOString(), status: "Applied" }
      }).then(() => {
        card.innerHTML = `
          <div style="text-align:center;padding:12px 0;color:#166534;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px">
            ✅ Added to Tracker!
          </div>
        `;
        setTimeout(() => card.remove(), 2500);
      }).catch(() => {
        card.remove();
      });
    };
  }

  function detectThankYouPage() {
    const text = (document.body ? document.body.innerText || "" : "").toLowerCase();
    const isConfirmation =
      /thank you for (applying|your application|submitting)|application (received|submitted|complete)|your response has been recorded|we have received your application|application confirmation|submission received/i.test(text) ||
      /\/thank[-_]?you|\/application[-_]?submitted|\/confirmation|\/applied/i.test(location.href);

    if (isConfirmation) {
      const company = companyGuess();
      const jobTitle = jobTitleGuess();
      // Present interactive card with Add to Tracker button - do not auto-save without user click
      showThankYouCard(company, jobTitle);
    }
  }

  function attachSubmitListeners() {
    // Removed automatic submission tracking so sites are only tracked when user clicks Add to Tracker
  }

  // ---------- Platform pre-fill detection ----------
  const _platformFilled = new WeakSet();
  function snapshotPlatformFilled() {
    for (const el of deepAll(document, SEL)) {
      const kind = kindOf(el);
      if (el.disabled || el.readOnly) continue;
      if (el.tagName === "INPUT" && SKIP_TYPES.has(el.type)) continue;
      if (filled(el, kind)) _platformFilled.add(el);
    }
  }

  function platformIsParsing() {
    return !!(
      document.querySelector('[class*="parsing" i],[class*="resume-loading" i],[aria-busy="true"]') ||
      document.querySelector('[data-automation-id*="parsing"],[data-automation-id*="resumeLoading"]') ||
      document.querySelector('[class*="spinner"]:not([hidden]):not([style*="display: none"]),[class*="loading"]:not([hidden]):not([style*="display: none"])')
    );
  }

  function waitForFormStability(quietMs, maxWait) {
    quietMs = quietMs || 1000;
    maxWait = maxWait || 10000;
    return new Promise((resolve) => {
      let qTimer = setTimeout(done, quietMs);
      const start = Date.now();
      function done() { obs.disconnect(); resolve(); }
      const obs = new MutationObserver(() => {
        if (Date.now() - start >= maxWait) { done(); return; }
        clearTimeout(qTimer);
        qTimer = setTimeout(done, quietMs);
      });
      obs.observe(document.documentElement, {
        subtree: true, childList: true,
        attributes: true, attributeFilter: ["value", "aria-valuenow"]
      });
    });
  }

  async function waitForPlatformParser(maxWait) {
    maxWait = maxWait || 8000;
    const step = 250, start = Date.now();
    while (platformIsParsing() && Date.now() - start < maxWait) await sleep(step);
  }

  // ---------- Wiring (extension only) ----------
  if (typeof chrome === "undefined" || !chrome.runtime || !chrome.storage) return;

  snapshotPlatformFilled();

  const _origPlan = plan;
  function planSafe(profile, resume) {
    const result = _origPlan(profile, resume);
    const safe = result.items.filter((it) => !_platformFilled.has(it.el));
    const skippedByPlatform = result.items.length - safe.length;
    return { items: safe, unmatched: result.unmatched, skippedByPlatform };
  }

  async function fillAllSafe(profile, resume, opts) {
    opts = opts || {};
    const { items, unmatched, skippedByPlatform } = planSafe(profile || {}, resume);
    const real = items.filter((i) => !i.empty);
    const report = {
      matched: items.length, filled: 0, unmatched, skippedByPlatform: skippedByPlatform || 0,
      missing: [...new Set(items.filter((i) => i.empty).map((i) => i.key))]
    };
    if (opts.auto && real.length < 3) return Object.assign(report, { skipped: true });
    for (const it of real) {
      if (_platformFilled.has(it.el) || filled(it.el, it.kind)) {
        _platformFilled.add(it.el);
        report.skippedByPlatform++;
        continue;
      }
      const ok = await apply(it, resume);
      if (ok) {
        report.filled++;
        it.el.dataset.jfDone = "1";
        const el = it.el;
        const ourValue = el.value;
        setTimeout(() => {
          if (el.value && el.value !== ourValue) {
            _platformFilled.add(el);
            el.dataset.jfDone = "platform";
          }
        }, 2000);
      } else {
        it.el.dataset.jfTry = String((+it.el.dataset.jfTry || 0) + 1);
        if (+it.el.dataset.jfTry >= 2) it.el.dataset.jfDone = "x";
      }
      if (it.kind === "select" || it.kind === "combo" || it.kind === "comboInput") await sleep(300);
    }

    if (!opts.auto && (report.filled > 0 || report.skippedByPlatform > 0)) {
      const onWorkday = isWorkday();
      const onAngular = isAngularLike();
      let msg = "";
      if (report.filled > 0) {
        msg += `<b>${onWorkday || onAngular ? "⚡" : "✅"} Job Filler:</b> Filled <b>${report.filled}</b> field(s) — highlighted in green.`;
      }
      if (report.skippedByPlatform > 0) {
        msg += `${msg ? "<br>" : ""}<span style="font-size:12px;opacity:.9">⏭ Preserved <b>${report.skippedByPlatform}</b> field(s) parsed by the platform.</span>`;
      }
      if ((onWorkday || onAngular) && report.filled > 0) {
        msg += `<br><span style="font-size:12px;opacity:.9">This site uses strict validation — <b>click inside each green field, then Tab out</b> to confirm before submitting. Tap to dismiss.</span>`;
      }
      const trackingPayload = {
        company: companyGuess(),
        jobTitle: (profile && profile.jobTitle) || jobTitleGuess(),
        url: location.href,
        date: new Date().toISOString(),
        status: "Applied"
      };
      if (msg) showToast(msg, onWorkday || onAngular, report.filled > 0 ? trackingPayload : null);
    }

    return report;
  }

  // Register page event watchers
  attachSubmitListeners();
  detectThankYouPage();

  let busy = false;
  async function run(auto) {
    if (busy) return; busy = true;
    try {
      if (auto && document.querySelector('input[type=password]')) return;

      if (auto) {
        await waitForPlatformParser(8000);
        await waitForFormStability(1000, 10000);
        snapshotPlatformFilled();
      }

      const d = await chrome.storage.local.get(["profile", "resume", "experiences", "educations", "certifications"]);
      if (!d.profile) return;
      const merged = flattenProfile(d.profile, d.experiences, d.educations, d.certifications);
      const r = await fillAllSafe(merged, d.resume, { auto });
      if (r.matched || r.filled) {
        const company = companyGuess();
        const jobTitle = merged.jobTitle || jobTitleGuess();
        const trackingPayload = { company, jobTitle, url: location.href, date: new Date().toISOString(), status: "Applied" };

        // Send report to popup (if popup is currently open)
        if (!auto) {
          chrome.runtime.sendMessage({
            type: "report",
            report: r,
            tracking: trackingPayload
          }).catch(() => {});
        }

        // NOTE: Do NOT auto-persist to tracker. Tracking happens only when user clicks 'Add to Tracker'.
      }
    } finally { busy = false; }
  }

  chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (m && m.type === "fill") {
      snapshotPlatformFilled();
      run(false);
    }
    if (m && m.type === "get_page_info") {
      sendResponse({
        company: companyGuess(),
        jobTitle: jobTitleGuess(),
        url: location.href
      });
      return true;
    }
  });

  chrome.storage.local.get(["auto"]).then((d) => {
    if (!d.auto) return;
    let runs = 0, t;
    const kick = () => {
      clearTimeout(t);
      const delay = runs === 0 ? 2000 : 1500;
      t = setTimeout(() => { if (runs++ < 25) run(true); }, delay);
    };
    kick();
    new MutationObserver(kick).observe(document.documentElement, { childList: true, subtree: true });
  });
})();
