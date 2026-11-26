// Local answer drafts. No network. Placeholders in saved text:
// {company} {role} {name} {title} {skills} {experience} {employer} {summary}
var JF_DRAFT_KEYS = { summary: 1, whyJoin: 1, project: 1, strengths: 1, coverLetter: 1, additional: 1 };

function jfAnswerContext(profile, company, role) {
  profile = profile || {};
  var name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  if (!name) name = String(profile.fullName || "").trim();
  var skills = String(profile.skills || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 5).join(", ");
  return {
    company: String(company || "").trim() || "this company",
    role: String(role || "").trim() || "this role",
    name: name,
    title: String(profile.jobTitle || "").trim(),
    skills: skills,
    experience: String(profile.experience || "").trim(),
    employer: String(profile.currentCompany || "").trim(),
    summary: String(profile.summary || "").trim()
  };
}

function jfApplyPlaceholders(text, profile, company, role) {
  var c = jfAnswerContext(profile, company, role);
  return String(text || "").replace(/\{(company|role|name|title|skills|experience|employer|summary)\}/gi, function (_, k) {
    return c[k.toLowerCase()] || "";
  });
}

function jfTidy(s) {
  return String(s || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

function jfExpPhrase(experience) {
  if (!experience) return "";
  if (/^\d+(\.\d+)?$/.test(experience)) return experience + " years of experience";
  return experience;
}

function jfWho(c) {
  var exp = jfExpPhrase(c.experience);
  var line = "";
  if (c.title && exp) line = c.title + " with " + exp;
  else if (c.title) line = c.title;
  else if (exp) line = exp;
  if (c.employer) line = line ? line + " at " + c.employer : "currently at " + c.employer;
  if (c.skills) line = line ? line + ", focused on " + c.skills : "focused on " + c.skills;
  return line;
}

function jfIntro(c) {
  var who = jfWho(c);
  if (!who) return c.name ? "I'm " + c.name : "";
  if (/^(focused on|currently at)\b/i.test(who)) {
    return c.name ? "I'm " + c.name + ", " + who : "I'm " + who;
  }
  var art = /^[aeiou]/i.test(who) ? "an" : "a";
  return c.name ? "I'm " + c.name + ", " + art + " " + who : "I'm " + art + " " + who;
}

function jfHasSignal(c) {
  return !!(c.title || c.skills || c.experience || c.employer || c.summary || c.name);
}

// Returns { text, source } for long answers, or null for every other field.
// source is "saved" when the profile already has text, "template" when this drafted it.
function jfDraftAnswer(key, profile, company, role) {
  if (!JF_DRAFT_KEYS[key]) return null;
  profile = profile || {};
  var saved = String(profile[key] || "").trim();
  if (saved) return { text: jfTidy(jfApplyPlaceholders(saved, profile, company, role)), source: "saved" };
  if (key === "project" || key === "additional") return { text: "", source: "empty" };
  var c = jfAnswerContext(profile, company, role);
  if (!jfHasSignal(c)) return { text: "", source: "empty" };
  var intro = jfIntro(c);
  var text = "";
  if (key === "whyJoin") {
    text = "I'm applying for the " + c.role + " role at " + c.company + ".";
    if (intro) text += " " + intro + ".";
    if (c.summary) text += " " + c.summary;
  } else if (key === "coverLetter") {
    text = "Hello " + c.company + " team,\n\nI'm applying for the " + c.role + " role.";
    if (intro) text += " " + intro + ".";
    if (c.summary) text += "\n\n" + c.summary;
    text += "\n\nThank you for considering my application.";
  } else if (key === "strengths") {
    text = "For the " + c.role + " role at " + c.company + ", what I bring";
    text += intro ? ": " + intro + "." : " is careful, practical work.";
    if (c.summary) text += " " + c.summary;
  } else if (key === "summary") {
    text = intro ? intro + "." : "";
  }
  text = jfTidy(text);
  return { text: text, source: text ? "template" : "empty" };
}
