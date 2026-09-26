# CF2GitHub - Codeforces to GitHub Auto-Sync Extension

**CF2GitHub** is a Chrome extension (Manifest V3) that automatically syncs your Accepted [Codeforces](https://codeforces.com) solutions directly to your personal GitHub repository. Each solution is stored in a clean folder structure accompanied by an auto-generated `README.md`.

---

## ✨ Features

1. **Auto-Detection on Status & Submissions Pages**
   - Monitors status pages (`/contest/*/status`, `/problemset/status`, `/submissions/*`, `/contest/*/my`).
   - Uses a `MutationObserver` to catch submissions as their verdict updates to **Accepted** in real-time.
   - **Smart Time Filter**: Only auto-pushes recent submissions (submitted within ~15 minutes). This prevents bulk-pushing your entire past submission history when loading status pages.
   - Shows floating toast notifications confirming successful GitHub commits.

2. **Manual Push Button on Individual Submission Pages**
   - Adds a floating **"⬆ Push to GitHub"** button on individual submission pages (`/contest/*/submission/*` & `/problemset/submission/*`).
   - Reads problem metadata and source code directly from the page DOM.
   - Acts as a fallback if auto-push was missed, or allows manually pushing older Accepted submissions.

3. **Clean Repository Folder Structure & README Generator**
   - Automatically maps Codeforces language strings to file extensions (`.cpp`, `.java`, `.py`, `.kt`, `.rs`, `.go`, `.js`, `.cs`, etc.).
   - File Path Pattern:  
     `{folderPrefix}/{contestId}{problemIndex}-{slugified-problem-name}/Solution.{ext}`
   - Automatically generates a `README.md` alongside each solution containing:
     - Direct link to the Codeforces problem
     - Submission ID and link
     - Programming language used
     - Verdict ("Accepted")
     - Code block preview

4. **Modern Popup Settings UI**
   - Configurable GitHub Personal Access Token (with visibility toggle).
   - Custom Repository Owner, Repository Name, Branch (default `main`), and Folder Prefix (default `Codeforces`).
   - Quick **"Test Connection"** button to verify GitHub API token and repository access.
   - Auto-push toggle switch to quickly enable or disable automated background sync.

---

## 🚀 Installation & Setup Guide

### Step 1: Create a GitHub Personal Access Token (PAT)
1. Go to [GitHub Developer Settings > Personal Access Tokens](https://github.com/settings/tokens).
2. Click **Generate new token (classic)** or create a **Fine-grained token**.
3. Set Token Permissions:
   - **Classic Token**: Check the `repo` scope (Full control of private/public repositories).
   - **Fine-grained Token**: Grant **Repository permissions > Contents: Read and Write**.
4. Copy the generated token string.

### Step 2: Load Unpacked Extension into Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the directory containing this project repository (`beacon` folder).

### Step 3: Configure Extension Popup
1. Click the **CF2GitHub** icon in the Chrome toolbar.
2. Enter your credentials:
   - **GitHub Personal Access Token**: Paste your token.
   - **Repo Owner**: Your GitHub username or organization name.
   - **Repo Name**: Your target repository (e.g., `Competitive-Programming`).
   - **Branch**: Target branch (default: `main`).
   - **Folder Prefix**: Parent folder in the repository (default: `Codeforces`).
   - **Auto-Push Switch**: Keep enabled for automatic background sync.
3. Click **Test Connection** to verify settings.
4. Click **Save Settings**.

---

## 📂 File Structure

```
├── manifest.json            # Manifest V3 extension configuration
├── common.js                # Shared utilities (language mapping, slugifier, time checker, toast)
├── content-status.js        # Content script for status tables (Auto-push)
├── content-submission.js    # Content script for submission details page (Manual push button)
├── toast.css                # CSS styles for page toast notifications
├── background.js            # Service worker handling GitHub REST Contents API commits
├── popup.html               # Settings UI layout
├── popup.css                # Modern popup UI theme
├── popup.js                 # Popup controller & connection testing
├── icons/                   # Extension icons (16x16, 48x48, 128x128)
└── README.md                # Project documentation
```

---

## ⚠️ Known Limitations & Troubleshooting

- **DOM Selectors**: Codeforces occasionally updates its site layout. If auto-detection stops working, verify that table classes (`table.status-frame-datatable`, `.verdict-accepted`, `#program-source-text`) match the current site markup.
- **Bulk Imports**: The extension deliberately filters out submissions older than ~15 minutes to prevent auto-pushing hundreds of past solutions at once. To sync older solutions, navigate to their individual submission page and click **"⬆ Push to GitHub"**.
- **Token Security**: Your Personal Access Token is stored locally in Chrome's encrypted `chrome.storage.sync` area and is only sent directly to `api.github.com`.
