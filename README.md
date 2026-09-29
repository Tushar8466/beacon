# 🏮 Beacon — Codeforces to GitHub Auto-Sync

**Beacon** is a modern, lightweight Chrome extension (Manifest V3) that synchronizes your **Accepted** Codeforces solutions directly to a GitHub repository of your choice.

Every solution is organized into a clean folder structure with an auto-generated `README.md` containing the problem link, submission ID, tags, language, verdict, and full source code — completely hands-free.

---

## ✨ Features

- ⚡ **Automatic Push on Accepted**: Listens to Codeforces status tables via dynamic DOM observers and automatically commits your solution the moment your submission turns green.
- 🔄 **Bulk Sync Manager & Backfill**: An injected control bar on your Codeforces submissions pages that lets you sync all visible Accepted solutions in 1 click with automatic rate-limit throttling.
- ⚡ **Row-Level Sync Buttons**: Instant "⚡ Push" buttons and "✓ Synced" status badges injected directly into Codeforces submission tables.
- ⏱️ **Smart Recency Filter**: Automatic sync only triggers for submissions from the last 15 minutes, ensuring your past history isn't accidentally flooded.
- 🖱️ **Manual "Push to GitHub" Button**: Sleek floating and inline buttons injected into every submission page and modal popup.
- 📁 **Structured Directory Format**: Solutions are stored neatly by contest and problem:
  ```text
  {folderPrefix}/{contestId}{problemIndex}-{problem-name}/
  ├── Solution.{ext}
  └── README.md
  ```
- 🌐 **Multi-Language Detection**: Automatic syntax parsing and extension detection for C++, Python/PyPy, Java, Kotlin, Rust, Go, JavaScript, C#, and more.
- 🎨 **Modern Popup Interface**: Fast setup form with live connection testing, token masking, and a connected view dashboard showing your linked repository and sync toggles.
- 🔒 **Secure & Direct**: Works directly with the official GitHub REST API (v3). Tokens and preferences are stored locally in your browser via `chrome.storage`.

---

## 🛠️ Prerequisites

Before installing Beacon, make sure you have:
1. Google Chrome (or any Chromium browser: Brave, Microsoft Edge, Arc, Opera, Vivaldi).
2. A **GitHub account**.
3. A **GitHub repository** created to store your solutions (e.g., `codeforces-solutions`).
   > **Tip**: Initialize your repo with a `README.md` so that the default branch (e.g., `main`) exists.

---

## 🚀 Setup & Installation Guide

### Step 1: Download the Extension

1. Clone this repository or download it as a ZIP and extract it to a folder on your computer:
   ```bash
   git clone https://github.com/Tushar8466/beacon.git
   ```
2. Note the location of the `beacon` folder containing `manifest.json`.

---

### Step 2: Generate a GitHub Personal Access Token

Beacon needs permission to commit files to your repository on your behalf. You can create either a **Fine-Grained Token** (recommended) or a **Classic Token**.

#### Option A: Fine-Grained Token (Recommended for security)
1. Go to GitHub → Click your **Profile Icon** (top-right) → **Settings**.
2. In the left sidebar, scroll down and click **Developer settings** (at the very bottom).
3. Select **Personal access tokens** → **Fine-grained tokens**.
4. Click **Generate new token**.
5. Configure the token:
   - **Token name**: `Beacon Codeforces Sync`
   - **Expiration**: Choose your preferred duration (e.g., 90 days or Custom).
   - **Repository access**: Choose **Only select repositories** → Select your solutions repository (e.g., `codeforces-solutions`).
   - **Permissions**:
     - Click **Repository permissions**.
     - Find **Contents** and set the access level to **Read and write**.
6. Click **Generate token** and copy the token (starts with `github_pat_...`).

#### Option B: Classic Token
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens).
2. Click **Generate new token** → **Generate new token (classic)**.
3. Set **Note** to `Beacon Codeforces Sync`.
4. Under scopes, check the **`repo`** checkbox (Full control of private repositories).
5. Click **Generate token** and copy the token (starts with `ghp_...`).

---

### Step 3: Load Beacon into Chrome

1. Open Google Chrome and navigate to:
   ```text
   chrome://extensions
   ```
2. In the top-right corner, toggle on **Developer mode**.
3. Click the **Load unpacked** button (top-left).
4. Select the `beacon` directory containing `manifest.json`.
5. Beacon will now appear in your extensions list.
6. Click the **Extensions puzzle icon** in your Chrome toolbar and **pin 📌 Beacon** for easy access.

---

### Step 4: Configure Beacon

1. Click the **Beacon icon** in your Chrome toolbar to open the settings popup.
2. Fill in the configuration fields:

   | Field | Description | Example |
   |---|---|---|
   | **GitHub Personal Access Token** | The token generated in Step 2 | `github_pat_...` or `ghp_...` |
   | **Repository Owner** | Your exact GitHub username or organization | `Tushar8466` |
   | **Repository Name** | The name of your solutions repository | `codeforces-solutions` |
   | **Branch** | The branch to push solutions to | `main` |
   | **Folder Prefix** | Root folder inside the repository | `Codeforces` |
   | **Auto-Push Accepted Solutions** | Toggle automatic background sync | Enabled (`true`) |

3. Click **Test Connection**:
   - Beacon checks that your token is valid and that the repository and branch can be accessed.
   - You should see a green notification: *"Connection successful! Repository accessible."*
4. Click **Save Settings**:
   - The popup switches to the **Connected View**, displaying your linked repository, an open repository shortcut, and quick toggles.

---

## 💻 How to Use

### 1. Automatic Syncing
1. Open Codeforces and solve any problem during a contest, gym, or problemset.
2. Go to the **Status** page or **My Submissions** tab.
3. As soon as your submission status turns to **Accepted**, Beacon:
   - Fetches the source code.
   - Detects the programming language.
   - Commits `Solution.{ext}` and `README.md` to GitHub.
   - Displays a confirmation toast notification in the corner of your browser.

### 2. Manual Push (Single Submissions)
1. Open any submission on Codeforces (either on its dedicated `/submission/<id>` page or via the popup code viewer).
2. Click the floating or inline **"Push to GitHub"** button.

### 3. Bulk Backfill (Syncing Multiple Past Submissions)
If you already solved problems on Codeforces and want to sync them all to GitHub:
1. Open the Beacon popup and click **Open ↗** under **Sync Past Submissions** (or navigate directly to `https://codeforces.com/submissions/<your-handle>`).
2. Beacon automatically scans the page and displays the **Beacon Sync Manager** bar directly above the submissions table.
3. It detects all Accepted submissions on the page, showing how many are already synced vs. pending.
4. Click **⚡ Sync Visible Solutions**:
   - Beacon fetches and commits each solution sequentially.
   - Built-in rate-limiting pauses prevent exceeding GitHub or Codeforces API thresholds.
   - Live progress indicator tracks each submission (`Syncing 1 of 10...`).
5. You can also click the individual **⚡ Push** button on any table row to sync just that specific submission!

---

## 📁 Repository Structure Example

After pushing solutions, your GitHub repository will look like this:

```text
codeforces-solutions/
└── Codeforces/
    ├── 1927A-make-it-white/
    │   ├── README.md
    │   └── Solution.cpp
    └── 1927B-following-the-string/
        ├── README.md
        └── Solution.py
```

### Auto-Generated `README.md` Example

```markdown
# Codeforces 1927A - Make it White

- **Problem Link**: [1927A - Make it White](https://codeforces.com/contest/1927/problem/A)
- **Submission ID**: [#245678901](https://codeforces.com/contest/1927/submission/245678901)
- **Language**: GNU C++20 (64)
- **Verdict**: Accepted

## Solution Code

```cpp
#include <iostream>
#include <string>
using namespace std;

int main() {
    // ...
}
```
```

---

## ❓ Troubleshooting & FAQs

### 1. "Push failed: Extension context invalidated"
- **Why**: When you reload or update an extension in `chrome://extensions`, any Codeforces tabs you already had open lose connection to the old extension process.
- **Solution**: Simply **refresh the Codeforces page (`F5` or `Cmd + R`)**.

### 2. "Repo 'owner/repo' or branch 'main' not found" (404)
- **Check Repository Name**: Make sure there are no typos in the repository owner or repository name.
- **Ensure Branch Exists**: If you just created a brand new empty repo on GitHub without checking "Add a README file", the `main` branch does not exist yet. Create a file or initialize a README on GitHub first.
- **Fine-Grained Token Permissions**: Ensure the token has **Repository Permissions → Contents: Read and write**. Without the "Contents" permission, GitHub responds with a 404 for security.

### 3. "Invalid GitHub Personal Access Token" (401)
- Your token might be expired or copied incorrectly. Generate a fresh token in GitHub Developer Settings and update it in Beacon.

### 4. Push button does not appear on Codeforces
- Refresh the submission page.
- If viewing source code inside an inline frame/lightbox, ensure the extension has permission to run on all frames (`all_frames: true` in `manifest.json`).

---

## 🏗️ Architecture & Codebase Overview

| File | Purpose |
|---|---|
| [`manifest.json`](file:///Users/tusharsingla22222gmail.com/Documents/beacon/manifest.json) | Manifest V3 metadata, permissions, host permissions, and script registration |
| [`popup.html`](file:///Users/tusharsingla22222gmail.com/Documents/beacon/popup.html) | Settings popup interface (dual-state: setup form and connected dashboard) |
| [`popup.css`](file:///Users/tusharsingla22222gmail.com/Documents/beacon/popup.css) | Custom styling, animations, tokens, and responsive layout for the popup |
| [`popup.js`](file:///Users/tusharsingla22222gmail.com/Documents/beacon/popup.js) | Form state management, connection testing, storage sync, and view toggling |
| [`content-submission.js`](file:///Users/tusharsingla22222gmail.com/Documents/beacon/content-submission.js) | Detects code viewer elements and injects floating/inline "Push to GitHub" buttons |
| [`content-status.js`](file:///Users/tusharsingla22222gmail.com/Documents/beacon/content-status.js) | Scans status tables for Accepted verdicts with recency verification and triggers sync |
| [`common.js`](file:///Users/tusharsingla22222gmail.com/Documents/beacon/common.js) | Shared utilities: language parsing, recency calculator, base64 encoder, and slug generator |
| [`toast.css`](file:///Users/tusharsingla22222gmail.com/Documents/beacon/toast.css) | Isolated styles for page-injected Beacon notifications |
| [`background.js`](file:///Users/tusharsingla22222gmail.com/Documents/beacon/background.js) | Background service worker for handling async extension messaging |

---

## 📄 License

MIT License. Feel free to customize and extend for your competitive programming workflow!