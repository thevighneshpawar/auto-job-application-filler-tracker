# Job Filler ⚡

**One-click auto-fill for job applications. Track every application. 100% offline — your data never leaves your browser.**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)](#installation)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](#)
[![Version](https://img.shields.io/badge/Version-2.1.0-blueviolet)](#)
[![License](https://img.shields.io/badge/License-MIT-yellow)](#license)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Offline-brightgreen)](#privacy--security)

---

## 🧠 The Problem

Applying for jobs is exhausting. You fill out the **same fields** — name, email, phone, education, work history, links, cover letters — across **hundreds of portals**: Greenhouse, Lever, Workday, SmartRecruiters, Ashby, BreezyHR, and custom career pages.

Each portal has its own form layout, field naming quirks, and custom input components. You repeatedly copy-paste from your resume, re-type your address, re-select your degree, and re-answer work authorization questions for the 200th time.

Then you lose track. *Did I apply to that company already? What role was it? When is the OA deadline? What salary did we discuss?*

**Job Filler solves all of this.**

---

## ✨ Features & Capabilities

### 🚀 Auto-Fill Any Job Application Form
- **One click** (or keyboard shortcut `Alt+Shift+F`) fills every field on the page: name, email, phone, location, education, work experience, portfolio/GitHub/LinkedIn links, cover letter, and screening questions.
- **Framework-Aware Dispatch**: Simulates native user inputs and synthetic events for seamless compatibility with **React, Angular, Vue, and Workday's** strict form validators.
- **Deep DOM & Shadow DOM Piercing**: Detects form fields inside nested containers, iframes, and open shadow roots.
- **Smart Heuristics**: Matches fields using `name`, `id`, `placeholder`, `aria-label`, `<label>` tags, and surrounding context.
- **Resume Auto-Attach**: Automatically attaches your uploaded resume file (PDF or DOCX) to file input fields labelled "Resume" or "CV".
- **Dynamic Company Templating**: Use `{company}` in your cover letter or custom answers — it automatically resolves to the detected employer name.
- **Non-Destructive & Safe**: Never overwrites existing user input, ignores hidden honeypot fields and sensitive security fields (SSN, Aadhaar, PAN, passwords), and **never auto-submits** forms.

### 📊 Application Tracker Dashboard
- **15 Full-Lifecycle Statuses**:
  `Wishlist` → `Applied` → `Under Review` → `Assessment Ongoing` → `Assessment Complete` → `Phone Screen` → `Interview` → `Final Round` → `Offer` → `Counter Offer` → `Offer Accepted` → `Offer Declined` → `Rejected` → `Withdrawn` → `Ghosted`.
- **Live Metrics Counter**: Real-time counter cards tracking Total Applications, Assessments & Reviews, Interviews in Progress, and Offers.
- **Inline Status Management**: Color-coded, high-contrast status badge dropdowns designed for instant updates.
- **Per-Application Notes**: Record recruiter contacts, interview rounds, salary numbers, and take-home deadlines.
- **Instant Search & Status Filtering**: Real-time multi-term search across company name, job title, and notes, paired with status filter counts.
- **One-Click CSV Export**: Export your complete application pipeline into an Excel/Sheets-compatible `.csv` file.
- **Thank-You Page Detection**: Automatically suggests adding the application to your tracker when you reach confirmation or thank-you pages.

### 📝 Extra Notes & Job Search Scratchpad
A dedicated, persistent workspace located right on your tracker page:
- **Instant Auto-Save**: Saves directly to browser local storage as you type.
- **Quick-Insert Templates**:
  - 🎯 **Interview Prep**: STAR method framework, key projects, and situational answers.
  - ❓ **Recruiter Questions**: High-impact questions to ask interviewers and hiring managers.
  - 💼 **Salary & Offer Notes**: Target base, equity, benefits, and counter-offer strategy.
  - ✅ **Follow-up Checklist**: Post-interview thank-you notes, connection requests, and timeline reminders.

### 📄 100% Local Resume Parsing & Profile Setup
- **Client-Side Document Parsing**: Uses bundled **Mozilla PDF.js** and local DOCX readers to extract resume text offline inside your browser — zero external API calls.
- **Automated Field Extraction**: Intelligent regex algorithms parse name, email, phone, location, skills, education, and links directly from your uploaded resume.
- **Complete Profile Schema**: Configure personal details, address, multiple education degrees, multiple work experiences, certifications, links, and yes/no screening preferences.
- **JSON Backup & Restore**: Export your entire profile data to JSON for easy backup or syncing across devices.

---

## 📦 Installation

Works on all Chromium browsers: **Google Chrome, Microsoft Edge, Brave, Opera, Arc**, and others.

1. **Download / Clone** this repository:
   - Click **Code** → **Download ZIP**, then extract it.

2. Open your browser and navigate to the extensions management page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`

3. Turn on **Developer mode** (toggle in the top-right corner).

4. Click **"Load unpacked"** and select the extension directory (`jf2`, the folder containing `manifest.json`).

5. Click the extension puzzle icon in your toolbar and **pin Job Filler** for quick access.

6. The **My Details** settings page will open automatically upon installation. Upload your resume or fill in your details to get started.

---

## 🚀 How to Use

### 1. Initial Setup (2 minutes)
1. Click the Job Filler icon in your toolbar → **✏️ My Details**.
2. Upload your resume (PDF or DOCX). Your contact info, links, education, and experience will populate automatically.
3. Review and adjust any specific answers (notice period, expected compensation, work authorization, cover letter).
4. Click **Save** (settings auto-save on change).

### 2. Auto-Filling Applications
1. Open any job posting or application form (Greenhouse, Lever, Workday, etc.).
2. Click the Job Filler icon → **"Fill this page"** (or press `Alt+Shift+F`).
3. You can also turn on **"Auto-fill on form load"** in the popup to fill forms automatically as pages finish loading.
4. Filled fields are highlighted with a green border for easy visual confirmation.
5. Review the information, answer any unique custom questions, and click **Submit**.

### 3. Tracking Your Job Search
1. After filling an application, click **"➕ Add to Tracker"** in the popup or in the floating toast notification.
2. Open your tracker anytime: click the Job Filler icon → **📊 Tracker**.
3. Update your application status as you hear back.
4. Add notes, deadlines, and compensation details.
5. Use the **Notes & Scratchpad** for recruiter communication prep and negotiation notes.
6. Export your records anytime with **⬇ Export CSV**.

---

## 🏗️ Project Architecture

```
jf2/
├── manifest.json             # Manifest V3 extension configuration & permissions
├── background.js             # Background service worker (shortcuts, tracker storage, message routing)
├── content.js                # Core content script (DOM traversal, field heuristics, input simulation)
├── schema.js                 # Unified profile schema, field definitions, and regex classifiers
├── parse.js                  # Heuristic resume parser (converts raw resume text into profile fields)
├── extract.js                # Local document text extractor (PDF & DOCX parsing)
├── popup.html / popup.js     # Compact extension popup toolbar UI
├── options.html / options.js # Comprehensive profile editor & resume manager UI
├── tracker.html / tracker.js # Application tracking dashboard & scratchpad UI
├── icons/                    # App icons (16px, 48px, 128px)
├── lib/                      # Bundled Mozilla PDF.js library (Apache 2.0 license)
│   ├── pdf.min.mjs
│   ├── pdf.worker.min.mjs
│   └── pdfjs-LICENSE.txt
├── LICENSE                   # MIT License
└── README.md                 # Complete documentation
```

---

## 🌐 Supported Application Portals

Job Filler works universally on standard HTML forms and has specialized heuristics for:

| Platform | Support Details |
| :--- | :--- |
| **Greenhouse** | Full support including custom combo-boxes, multi-select, and file upload |
| **Lever** | Full support for all standard and custom question types |
| **Workday** | Enhanced support — simulates native pointer, mouse, and keyboard events |
| **SmartRecruiters** | Full support including dropdowns and rich inputs |
| **Ashby** | Full support including modern single-page application forms |
| **Recruitee** | Full support |
| **BreezyHR** | Full support |
| **HackerRank / Assessments** | Company name auto-detection and candidate profile fields |
| **Taleo / Oracle** | Standard form inputs and multi-page flows |
| **iCIMS** | Standard field auto-population |
| **Company Career Portals** | Universal field matching based on labels, placeholders, and ARIA hints |

---

## 🔒 Privacy & Security First

**Job Filler is 100% offline. No servers, no tracking, no data leakage.**

- 🛡️ **Zero Network Requests**: The extension makes zero API calls, carries zero analytics, and sends zero telemetry.
- 💻 **Local Storage Only**: All data (profile, resumes, application history, notes) stays strictly on your computer in `chrome.storage.local`.
- 🔐 **Zero Third-Party Dependency**: Document parsing (PDF.js) is bundled locally with no CDN or cloud endpoints.
- 🚫 **No Auto-Submit**: The extension will never automatically submit a form or agree to terms without your manual review.
- 🛑 **Honeypot & Sensitive Field Shield**: Passwords, CAPTCHAs, SSNs, Aadhaar, and verification codes are explicitly blocked from auto-filling.

### Permissions Explained

| Permission | Purpose |
| :--- | :--- |
| `storage` | Saves your profile details, application tracker records, and scratchpad locally. |
| `unlimitedStorage` | Enables storing your resume file locally without hitting the default 5MB quota. |
| `activeTab` | Allows the extension to interact with the currently active tab when you trigger auto-fill. |
| `tabs` | Reads the active tab URL and page title to auto-detect company names and job titles. |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Alt+Shift+F` | Instant auto-fill on the current active tab |

*You can customize this shortcut anytime by visiting `chrome://extensions/shortcuts` in your browser.*

---

## 📋 Status Progression Lifecycle

```
⭐ Wishlist
  ↓
📨 Applied
  ↓
👀 Under Review
  ↓
⏳ Assessment Ongoing  →  ✅ Assessment Complete
  ↓
📞 Phone Screen
  ↓
🗓️ Interview
  ↓
🎯 Final Round
  ↓
🎉 Offer  →  💼 Counter Offer
  ↓                ↓
🤝 Offer Accepted  👋 Offer Declined
  
❌ Rejected    🚪 Withdrawn    👻 Ghosted
```

---

## 🛠️ Verification & Quality Checklist

Before publishing or packaging:
- [x] **Manifest V3 Compliant**: Configured with service worker, proper permissions, and content scripts.
- [x] **Syntax & Lint Validation**: All JavaScript files validated (`node -c`).
- [x] **High-Contrast Dark Theme**: Native `color-scheme: dark;` support with solid readable dropdown menus.
- [x] **Local PDF.js Integration**: Full offline resume text extraction verified.
- [x] **Keyboard Shortcut**: `Alt+Shift+F` command registered and tested.
- [x] **Data Portability**: Full JSON profile backup/restore and CSV application export working.

---

## 📄 License

This project is open-source under the **[MIT License](LICENSE)**.

The bundled PDF.js library is developed by Mozilla and licensed under the **[Apache 2.0 License](lib/pdfjs-LICENSE.txt)**.

---

<p align="center">
  <b>Built for job seekers who value their time.</b><br>
  <i>Stop copy-pasting. Focus on landing the offer.</i>
</p>
