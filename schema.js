// Single source of truth: used by the settings page (what to store) and the content script (how to recognise fields).
// kw = regex sources tested against NORMALISED text (lowercase, punctuation -> spaces). p = priority when several fields match.
// area = only for multi-line boxes; noArea = never for multi-line boxes.
const JF_SECTIONS = ["Personal", "Address", "Links", "Work", "Education", "Certifications", "Quick answers", "Long answers"];
function F(sec, k, label, p, kw, x) { return Object.assign({ sec, k, label, p, kw, t: "text" }, x || {}); }
const YN = { t: "yesno" };
const JF_FIELDS = [
  F("Personal", "firstName", "First name", 4, ["first\\s*name", "given\\s*name", "fname", "forename"], { ac: ["given-name"] }),
  F("Personal", "lastName", "Last name", 4, ["last\\s*name", "sur\\s*name", "family\\s*name", "lname"], { ac: ["family-name"] }),
  F("Personal", "fullName", "Full name (optional, else first + last)", 2, ["full\\s*name", "your\\s*name", "candidate\\s*name", "applicant\\s*name", "legal\\s*name", "^name$", "^name\\s*\\d*$"], { ac: ["name"] }),
  F("Personal", "email", "Email", 5, ["e\\s*mail", "mail\\s*id"], { ac: ["email"] }),
  F("Personal", "phone", "Phone / mobile", 5, ["phone", "mobile", "tele?phone", "contact\\s*(no|number|num)", "cell\\b", "whats\\s*app"], { ac: ["tel", "tel-national"] }),
  F("Personal", "altPhone", "Alternate phone", 6, ["alternat\\w*\\s*(phone|mobile|contact|number)", "alt\\s*(phone|mobile|contact)", "emergency\\s*contact", "secondary\\s*(phone|mobile)"]),
  F("Personal", "phoneCode", "Country dial code (e.g. +91)", 6, ["country\\s*code", "dial\\s*code", "isd", "phone\\s*code", "calling\\s*code"]),
  F("Personal", "dob", "Date of birth", 5, ["date\\s*of\\s*birth", "birth\\s*date", "dob\\b", "birthday"], { t: "date", ac: ["bday"] }),
  F("Personal", "gender", "Gender", 5, ["gender", "sex\\b"], { t: "sel", opts: ["", "Male", "Female", "Other", "Prefer not to say"] }),
  F("Personal", "nationality", "Nationality", 5, ["nationality", "citizenship"]),

  F("Address", "address", "Current / present address", 1, ["address", "street", "house\\s*(no|number)", "flat\\s*(no|number)?"], { ac: ["street-address", "address-line1"], noArea: false }),
  F("Address", "permanentAddress", "Permanent address", 3, ["permanent\\s*(address|residen\\w*)", "home\\s*address", "native\\s*place"]),
  F("Address", "city", "City", 2, ["city\\b", "town\\b", "current\\s*location", "location"], { ac: ["address-level2"] }),
  F("Address", "district", "District", 3, ["district\\b"]),
  F("Address", "state", "State", 2, ["state\\b", "province", "region\\b"], { ac: ["address-level1"] }),
  F("Address", "zip", "PIN / ZIP code", 3, ["zip", "postal", "pin\\s*code", "pin\\b", "post\\s*code"], { ac: ["postal-code"] }),
  F("Address", "country", "Country", 2, ["country"], { ac: ["country", "country-name"] }),

  F("Links", "linkedin", "LinkedIn URL", 6, ["linked\\s*in"]),
  F("Links", "github", "GitHub URL", 6, ["git\\s*hub"]),
  F("Links", "portfolio", "Portfolio / website", 6, ["portfolio", "personal\\s*(web)?\\s*site", "website", "homepage", "web\\s*site", "blog"], { ac: ["url"] }),

  F("Work", "currentCompany", "Current / last company", 4, ["(current|present|recent|last|previous)\\s*(company|employer|organi[sz]ation)", "employer", "company", "organi[sz]ation"], { ac: ["organization"], noArea: true }),
  F("Work", "jobTitle", "Current job title", 4, ["(current|present)\\s*(job\\s*)?(title|designation|role|position)", "designation", "job\\s*title"], { ac: ["organization-title"], noArea: true }),
  F("Work", "experience", "Total experience (years)", 4, ["(total|overall|relevant|work)?\\s*(years?\\s*of\\s*)?experience", "\\byoe\\b", "years?\\s*of\\s*exp"], { noArea: true }),
  F("Work", "currentCTC", "Current CTC", 6, ["current\\s*(ctc|salary|compensation|package|fixed|annual)", "present\\s*(ctc|salary)", "\\bctc\\b", "\\bcctc\\b"]),
  F("Work", "expectedCTC", "Expected CTC", 7, ["expected\\s*(ctc|salary|compensation|package)", "salary\\s*expectation", "desired\\s*(salary|ctc|compensation)", "\\bectc\\b"]),
  F("Work", "noticePeriod", "Notice period", 6, ["notice", "joining\\s*time", "how\\s*soon\\s*can\\s*you\\s*join", "earliest\\s*(start|join)", "availab\\w*\\s*to\\s*(join|start)"]),
  F("Work", "skills", "Key skills", 3, ["key\\s*skills?", "skills?", "technolog\\w*", "tech\\s*stack"], { noArea: true }),

  F("Education", "college", "College / university", 3, ["college", "universit\\w*", "institut\\w*", "school\\s*name"]),
  F("Education", "degree", "Degree", 3, ["degree", "qualification", "course"]),
  F("Education", "specialization", "Branch / specialization", 3, ["speciali[sz]ation", "branch", "major\\b", "stream\\b", "field\\s*of\\s*study", "discipline"]),
  F("Education", "eduStartDate", "Education start date", 5, ["start\\s*(date|year|month)", "from\\s*(date|year|month)", "admission\\s*(year|date)", "enrolled\\s*(year|date)"]),
  F("Education", "eduEndDate", "Education end date / graduation year", 4, ["graduat\\w*", "passing\\s*year", "year\\s*of\\s*(passing|completion)", "batch", "end\\s*(date|year)", "to\\s*(date|year)"]),
  F("Education", "cgpa", "CGPA / percentage", 3, ["cgpa", "\\bgpa\\b", "percentage", "aggregate", "marks"]),
  F("Education", "tenth", "10th percentage", 4, ["10\\s*th", "\\bx\\s*th\\b", "\\bssc\\b", "matriculation"]),
  F("Education", "twelfth", "12th percentage", 4, ["12\\s*th", "\\bxii\\b", "\\bhsc\\b", "higher\\s*secondary", "intermediate"]),

  F("Certifications", "certName", "Certificate / course name", 4, ["certif\\w*(\\s*(name|title|course))?", "course\\s*name", "credential\\s*(name|title)"]),
  F("Certifications", "certIssuer", "Issuing organisation", 4, ["issu\\w*\\s*(org\\w*|authority|by|from)", "certif\\w*\\s*(provider|org\\w*|issued)", "provider\\b", "issued\\s*by"]),
  F("Certifications", "certUrl", "Certificate URL / credential link", 5, ["certif\\w*\\s*(url|link|credential)", "credential\\s*(url|id|link)", "verify\\s*(url|link)"]),
  F("Certifications", "certYear", "Certificate year", 5, ["certif\\w*\\s*(year|date)", "issued\\s*(year|date|on)", "completion\\s*(year|date)"]),

  F("Quick answers", "workAuth", "Authorized to work in the job's country?", 5, ["authori[sz]ed\\s*to\\s*work", "legally\\s*(authori[sz]ed|eligible|permitted)", "work\\s*authori[sz]ation", "eligible\\s*to\\s*work", "right\\s*to\\s*work", "work\\s*permit"], YN),
  F("Quick answers", "sponsorship", "Need visa sponsorship?", 6, ["sponsor"], YN),
  F("Quick answers", "relocate", "Willing to relocate?", 6, ["relocat"], YN),
  F("Quick answers", "workFromOffice", "Fine working from office / hybrid / on-site?", 6, ["work\\w*\\s*(from|in)\\s*(the\\s*)?office", "hybrid", "on\\s*site", "onsite", "return\\s*to\\s*office"], YN),
  F("Quick answers", "over18", "Are you 18 or older?", 6, ["18\\s*years", "legal\\s*age", "above\\s*18", "at\\s*least\\s*18", "over\\s*18"], YN),
  F("Quick answers", "prevEmployed", "Worked for / applied to this company before?", 6, ["(previously|ever|before)\\s*(worked|employed|applied)", "former\\s*employee", "worked\\s*(for|at|with)\\s*us", "applied\\s*(to|with)\\s*us"], YN),
  F("Quick answers", "source", "How did you hear about us? (e.g. LinkedIn)", 6, ["how\\s*did\\s*you\\s*(hear|find|know|come)", "hear\\s*about", "source\\b", "referr\\w*\\s*source"]),

  F("Long answers", "summary", "About you / professional summary", 6, ["summary", "about\\s*(you|yourself|me)", "tell\\s*us\\s*about\\s*yourself", "introduce\\s*yourself", "profile\\s*(description|summary)", "bio\\b"], { t: "area", area: true, hint: "2-4 sentences" }),
  F("Long answers", "whyJoin", "Why do you want to join us? ({company} is replaced automatically)", 7, ["why\\s.*(join|work|apply|interest|want|choose|us\\b)", "what\\s*(attracts|excites|interests|motivates)", "interest\\s*in\\s*(this|our|the)\\s*(role|company|position|opportunity)", "motivation"], { t: "area", area: true }),
  F("Long answers", "project", "Describe a project you built", 7, ["project", "describe\\s*(a|your)\\s*(recent\\s*)?(experience|work|accomplishment)", "tell\\s*us\\s*about\\s*(a|your)\\s*(recent|work|experience)", "challeng\\w*\\s*(you|faced|solved)"], { t: "area", area: true }),
  F("Long answers", "strengths", "Strengths / why should we hire you", 7, ["strength", "what\\s*makes\\s*you", "why\\s*should\\s*we\\s*(hire|select|choose)", "good\\s*fit", "what\\s*can\\s*you\\s*bring", "value\\s*(would\\s*)?you\\s*add"], { t: "area", area: true }),
  F("Long answers", "coverLetter", "Cover letter / message to hiring team ({company} supported)", 8, ["cover\\s*letter", "message\\s*to\\s*(the\\s*)?(hiring|recruit)", "note\\s*to\\s*(the\\s*)?(hiring|recruit)", "letter\\s*of\\s*(interest|motivation)"], { t: "area", area: true }),
  F("Long answers", "additional", "Anything else (additional information)", 3, ["additional\\s*(info\\w*|comments?|details)", "anything\\s*else", "other\\s*(info\\w*|comments?)", "comments?\\b", "remarks"], { t: "area", area: true })
];
JF_FIELDS.forEach((f) => { f.re = f.kw.map((s) => new RegExp("(?:^|\\s)(?:" + s + ")", "i")); });
const JF_AC = {};
JF_FIELDS.forEach((f) => (f.ac || []).forEach((a) => (JF_AC[a] = f.k)));

// Keys for repeatable sections (stored as arrays separately from flat profile)
const JF_EXPERIENCE_KEYS = ["expCompany", "expTitle", "expStartDate", "expEndDate", "expCurrently", "expDescription"];
const JF_EDUCATION_KEYS  = ["college", "degree", "specialization", "eduStartDate", "eduEndDate", "cgpa"];
const JF_CERT_KEYS       = ["certName", "certIssuer", "certUrl", "certYear"];

// Shared by the popup and the profile page. extras: { resume, experiences, educations }.
function jfCompleteness(profile, extras) {
  profile = profile || {};
  extras = extras || {};
  var exps = extras.experiences || [];
  var checks = [
    { label: "Name", ok: !!(profile.firstName || profile.lastName || profile.fullName) },
    { label: "Email", ok: !!String(profile.email || "").trim() },
    { label: "Phone", ok: !!String(profile.phone || "").trim() },
    { label: "Location", ok: !!(profile.city || profile.state || profile.country) },
    { label: "A link", ok: !!(profile.linkedin || profile.github || profile.portfolio) },
    { label: "Work", ok: !!(profile.jobTitle || profile.currentCompany || exps.length) },
    { label: "Skills or summary", ok: !!(profile.skills || profile.summary) },
    { label: "Resume file", ok: !!extras.resume }
  ];
  var missing = [];
  var done = 0;
  checks.forEach(function (c) { if (c.ok) done++; else missing.push(c.label); });
  return {
    done: done,
    total: checks.length,
    missing: missing,
    ready: !!(checks[0].ok && checks[1].ok && checks[2].ok)
  };
}
