// Heuristic resume parser. Pure function: text in, profile fields out. Runs locally; no network.
(function (root) {
  const STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu and Kashmir","Chandigarh","Puducherry"];
  const H = {
    summary: /^(?:professional\s+)?(?:summary|profile|objective|career\s+objective|about(?:\s+me)?)$/i,
    education: /^(?:educational?\s+)?(?:education(?:al)?(?:\s+(?:qualifications?|background|details))?|academics?|academic\s+(?:details|qualifications?|background)|qualifications?)$/i,
    skills: /^(?:(?:technical|key|core|it)\s+)?skills(?:\s+(?:&|and)\s+(?:tools|technologies))?$|^(?:technical\s+(?:expertise|proficiency)|core\s+competencies|technologies|tech\s+stack|tools(?:\s+(?:&|and)\s+technologies)?)$/i,
    experience: /^(?:(?:work|professional|relevant|industry)\s+)?(?:experience|employment(?:\s+history)?|work\s+history)$|^internships?(?:\s+experience)?$/i,
    projects: /^(?:(?:academic|personal|key|major|notable)\s+)?projects?$/i,
    other: /^(?:certifications?|achievements?|awards?|interests?|hobbies|languages?|declaration|references?|extra[\s-]?curricular(?:\s+activities)?|activities|publications|personal\s+(?:details|information)|courses?)$/i
  };
  const MON = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const clean = (l) => l.replace(/[\u00a0\t]+/g, " ").replace(/\s+/g, " ").trim();
  const unbullet = (l) => l.replace(/^[•●▪■◦\-–—*·➢➤✓>]+\s*/, "").trim();
  const cap = (s) => s.replace(/\b([a-z])([a-z]*)/gi, (_, a, b) => a.toUpperCase() + b.toLowerCase());
  const stripDates = (s) => s.replace(/\(?\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*,?\s*)?(?:19|20)\d{2}\b\s*(?:[-–—]|to)?\s*(?:(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*,?\s*)?(?:19|20)\d{2}|present|current|ongoing)?\)?/gi, "").replace(/\b(?:cgpa|gpa)\b.*$/i, "").replace(/[|,–—-]\s*$/g, "").trim();

  function sectionize(lines) {
    const sec = { header: [] }; let cur = "header";
    for (const l of lines) {
      const t = l.replace(/[:：|#_=\-–—•●▪■]+/g, " ").replace(/\s+/g, " ").trim();
      let hit = null;
      if (t && t.length <= 40) for (const k in H) if (H[k].test(t)) { hit = k; break; }
      if (hit) { cur = hit; sec[cur] = sec[cur] || []; continue; }
      (sec[cur] = sec[cur] || []).push(l);
    }
    return sec;
  }
  function monthIdx(s, endish) {
    s = s.toLowerCase();
    if (/present|current|till|ongoing|now/.test(s)) { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); }
    const y = +(/(\d{4})/.exec(s) || [])[1]; if (!y) return null;
    const m1 = /^(?:\s*)([a-z]{3})/.exec(s), m2 = /(\d{1,2})\s*[\/\-]\s*\d{4}/.exec(s);
    const m = m1 && MON[m1[1]] ? MON[m1[1]] : m2 ? +m2[1] : endish ? 12 : 1;
    return y * 12 + (m - 1);
  }
  function experienceYears(lines) {
    const mo = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s*,?\\s*\\d{4}", num = "\\d{1,2}\\s*[\\/\\-]\\s*\\d{4}";
    const pt = `(${mo}|${num}|\\d{4})`, end = `(${mo}|${num}|\\d{4}|present|current|till\\s*date|ongoing|now)`;
    const re = new RegExp(pt + "\\s*(?:-|–|—|to)\\s*" + end, "ig"), iv = []; let m;
    const text = lines.join("\n"), now = new Date().getFullYear() * 12 + new Date().getMonth();
    while ((m = re.exec(text))) {
      const a = monthIdx(m[1], false); let b = monthIdx(m[2], true);
      if (a == null || b == null) continue; if (b > now) b = now; if (b >= a) iv.push([a, b + 1]);
    }
    iv.sort((x, y) => x[0] - y[0]); let total = 0, cs = null, ce = null;
    for (const [s, e] of iv) { if (cs === null) { cs = s; ce = e; } else if (s <= ce) ce = Math.max(ce, e); else { total += ce - cs; cs = s; ce = e; } }
    if (cs !== null) total += ce - cs;
    const yrs = total / 12; return yrs >= 0.5 ? String(+yrs.toFixed(1)) : "";
  }
  const DEGREES = [
    /\bB\.?\s?Tech\b\.?/i, /\bB\.\s?E\b\.?|\bBE\b/, /\bB\.?\s?Sc\b\.?/i, /\bB\.?C\.?A\b\.?/, /\bB\.?\s?Com\b\.?/i, /\bBBA\b/,
    /\bM\.?\s?Tech\b\.?/i, /\bM\.?\s?Sc\b\.?/i, /\bM\.?C\.?A\b\.?/, /\bMBA\b/,
    /Bachelor(?:'s)?\s+of\s+[A-Za-z&. ]+?(?=\s+in\b|\s*[,(|–-]|$)/i, /Master(?:'s)?\s+of\s+[A-Za-z&. ]+?(?=\s+in\b|\s*[,(|–-]|$)/i, /\bDiploma\b/i
  ];
  const BRANCH = /computer\s+science(?:\s*(?:and|&)\s*engineering)?|information\s+technology|electronics(?:\s*(?:and|&)\s*(?:communication|telecommunication)s?)?(?:\s+engineering)?|electrical(?:\s*(?:and|&)\s*electronics)?(?:\s+engineering)?|mechanical(?:\s+engineering)?|civil(?:\s+engineering)?|artificial\s+intelligence[a-z\s&]*|data\s+science|\bCSE\b|\bECE\b|\bEEE\b/i;
  const COLLEGE = /universit|college|institut|polytechnic|school\s+of|academy|\bIIT\b|\bNIT\b|\bIIIT\b/i;

  function parseResume(text) {
    const lines = text.replace(/\r/g, "").split("\n").map(clean).filter(Boolean);
    const sec = sectionize(lines), out = {};
    const head = lines.slice(0, 15).join("\n"), all = lines.join("\n");
    // contact
    const em = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(all); if (em) out.email = em[0];
    const noEm = head.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, " ");
    const ph = /(?:\+\s?91[\s-]?|\b0)?[6-9]\d{4}[\s-]?\d{5}\b/.exec(noEm) || /(?:\+\s?91[\s-]?|\b0)?[6-9]\d{4}[\s-]?\d{5}\b/.exec(all);
    if (ph) out.phone = ph[0].replace(/\D/g, "").slice(-10);
    const li = /(?:https?:\/\/)?(?:www\.|[a-z]{2}\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9\-_%]+/i.exec(all); if (li) out.linkedin = (/^http/i.test(li[0]) ? "" : "https://") + li[0].replace(/^http:/i, "https:");
    const gh = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)/i.exec(all); if (gh && !/^(orgs|topics|features)$/i.test(gh[1])) out.github = "https://github.com/" + gh[1];
    const urls = noEm.match(/\b(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s,;)|]*)?/gi) || [];
    const site = urls.find((u) => !/linkedin|github|gmail|yahoo|outlook|hotmail|\.(pdf|docx?)$/i.test(u) && (/^(https?:|www\.)/i.test(u) || /\.(vercel\.app|netlify\.app|github\.io|web\.app|dev|io|me|tech|xyz)\b/i.test(u)));
    if (site) out.portfolio = /^https?:/i.test(site) ? site : "https://" + site;
    // name
    const BADNAME = /resume|curriculum|vitae|\bcv\b|profile|summary|objective|engineer|developer|email|phone|contact|address|github|linkedin|student|fresher/i;
    for (const l of lines.slice(0, 6)) {
      if (/[@\d]/.test(l) || BADNAME.test(l)) continue;
      const w = l.replace(/[^A-Za-z .'-]/g, " ").trim().split(/\s+/).filter(Boolean);
      if (w.length >= 2 && w.length <= 4 && w.every((x) => /^[A-Za-z][A-Za-z.'-]*$/.test(x))) {
        const nm = (l === l.toUpperCase() ? cap(w.join(" ")) : w.join(" "));
        const p = nm.split(" "); out.firstName = p[0]; out.lastName = p.slice(1).join(" "); break;
      }
    }
    // location
    const st = new RegExp("([A-Za-z .]{2,30}?)\\s*,\\s*(" + STATES.join("|") + ")\\b", "i").exec(head);
    if (st) { out.city = st[1].trim().split(/[|•,]/).pop().trim(); out.state = cap(st[2]); out.country = "India"; }
    else { const s2 = new RegExp("\\b(" + STATES.join("|") + ")\\b", "i").exec(head); if (s2) { out.state = cap(s2[1]); out.country = "India"; } }
    const pin = /\b[1-9]\d{5}\b/.exec(noEm.replace(/(?:\+?91)?[\s-]?[6-9]\d{4}[\s-]?\d{5}/g, " ")); if (pin) out.zip = pin[0];
    // personal details
    const dob = /(?:d\.?o\.?b\.?|date\s+of\s+birth|birth\s*date)\s*[:\-–]?\s*(\d{1,2})\s*[\/\-. ]\s*(\d{1,2}|[A-Za-z]{3,9})\s*[\/\-., ]\s*(\d{4})/i.exec(all);
    if (dob) { const mm = /^\d+$/.test(dob[2]) ? +dob[2] : MON[dob[2].slice(0, 3).toLowerCase()]; if (mm) out.dob = `${dob[3]}-${String(mm).padStart(2, "0")}-${String(+dob[1]).padStart(2, "0")}`; }
    const gd = /\b(?:gender|sex)\s*[:\-–]\s*(male|female|other)/i.exec(all); if (gd) out.gender = cap(gd[1]);
    const nt = /nationality\s*[:\-–]\s*([A-Za-z]+)/i.exec(all); if (nt) out.nationality = cap(nt[1]);
    // education
    const edu = sec.education || [];
    let di = -1, deg = "";
    for (let i = 0; i < edu.length && di < 0; i++) for (const re of DEGREES) { const m = re.exec(edu[i]); if (m) { di = i; deg = m[0].trim(); break; } }
    if (di >= 0) {
      out.degree = deg;
      const blk = edu.slice(Math.max(0, di - 1), di + 3), btxt = blk.join(" ");
      const br = BRANCH.exec(edu.slice(di, di + 2).join(" ")); if (br) out.specialization = cap(br[0].trim());
      let ci = blk.findIndex((l) => COLLEGE.test(l) && !/higher\s+secondary|junior\s+college|\b(?:10|12)th\b/i.test(l));
      if (ci >= 0) { const segs = blk[ci].split(/\s*[|•]\s*|\s+[-–—]\s+/).filter((s) => COLLEGE.test(s)); const c = stripDates((segs[0] || blk[ci])); if (c.length > 3) out.college = c; }
      const yrs = (btxt.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number); if (yrs.length) out.graduationYear = String(Math.max(...yrs));
      const cg = /(?:cgpa|gpa|c\.g\.p\.a)\s*[:\-–]?\s*(\d{1,2}(?:\.\d{1,2})?)/i.exec(btxt) || /(\d{1,2}(?:\.\d{1,2})?)\s*\/\s*10\b/.exec(btxt);
      if (cg) out.cgpa = cg[1]; else { const pc = /(\d{2}(?:\.\d{1,2})?)\s*%/.exec(btxt); if (pc) out.cgpa = pc[1] + "%"; }
    }
    const pool = (edu.length ? edu : lines);
    for (let i = 0; i < pool.length; i++) {
      const w = pool[i] + " " + (pool[i + 1] || ""), pcx = /(\d{2}(?:\.\d{1,2})?)\s*%|(?:cgpa|gpa)\s*[:\-–]?\s*(\d{1,2}(?:\.\d{1,2})?)/i.exec(w);
      if (!pcx) continue; const val = pcx[1] ? pcx[1] + "%" : pcx[2];
      if (!out.twelfth && /\b(?:12th|HSC|XII|Class\s*XII|Higher\s+Secondary|Intermediate|Senior\s+Secondary)\b/i.test(pool[i])) out.twelfth = val;
      else if (!out.tenth && /\b(?:10th|SSC|Class\s*X|Matriculation|Secondary\s+School)\b/i.test(pool[i])) out.tenth = val;
    }
    // work
    const exp = sec.experience || [];
    const yrs = experienceYears(exp); if (yrs) out.experience = yrs;
    const TITLE = /engineer|developer|intern|analyst|consultant|manager|associate|designer|trainee|architect|lead|programmer|tester|specialist|administrator|executive/i;
    const cand = exp.map(unbullet).filter((l) => l.length > 2 && l.length < 90 && !/^[•●▪\-*]/.test(l)).slice(0, 4).map(stripDates).filter(Boolean).slice(0, 2);
    if (cand.length === 2 && exp.length) {
      const [a, b] = cand, ta = TITLE.test(a), tb = TITLE.test(b);
      const split = (s) => s.split(/\s*[|,@]\s*|\s+at\s+|\s+[-–—]\s+/).map((x) => x.trim()).filter(Boolean);
      if (ta !== tb) { out.jobTitle = split(ta ? a : b)[0]; out.currentCompany = split(ta ? b : a)[0]; }
      else if (/\s(?:at|@)\s|\s[|–—-]\s/.test(a)) { const p = split(a); if (p.length >= 2) { const ti = TITLE.test(p[0]); out.jobTitle = ti ? p[0] : p[1]; out.currentCompany = ti ? p[1] : p[0]; } }
    }
    const sk = (sec.skills || []).map((l) => unbullet(l).replace(/^[A-Za-z &/+]{2,30}:\s*/, "")).filter(Boolean);
    if (sk.length) out.skills = [...new Set(sk.join(", ").split(/\s*,\s*/).filter(Boolean))].join(", ").slice(0, 400);
    if (sec.summary && sec.summary.length) out.summary = sec.summary.map(unbullet).join(" ").slice(0, 700);
    if (sec.projects && sec.projects.length) out.project = sec.projects.slice(0, 5).map(unbullet).join(". ").replace(/\.\./g, ".").slice(0, 600);
    Object.keys(out).forEach((k) => { if (!out[k]) delete out[k]; });
    return out;
  }
  root.parseResume = parseResume;
  if (typeof module !== "undefined") module.exports = { parseResume };
})(typeof window !== "undefined" ? window : globalThis);
