# 🏮 Beacon — Codeforces to GitHub Auto-Sync

**Beacon** is a Chrome extension (Manifest V3) that watches your Codeforces
submissions and, the moment one is **Accepted**, automatically pushes the
source code to a GitHub repository of your choice — organized into a clean
folder structure with an auto-generated `README.md` for every solution.

Like a lighthouse guiding a ship home, Beacon makes sure every solved
problem finds its way safely into your GitHub history — no copy-pasting,
no forgetting to commit.

---

## ✨ Features

- **Auto-push on Accepted** — watches your status/submissions pages and
  detects the moment a *recent* submission turns green. No manual step
  needed for solutions you just solved.
- **Smart recency filter** — only auto-pushes submissions from the last
  ~15 minutes, so opening your submission history doesn't flood your repo
  with hundreds of old solutions at once.
- **Manual "Push to GitHub" button** — appears next to any submission's
  source code (including inline/expanded views), so you can push older
  solutions on demand or use it as a reliable fallback.
- **Clean repo structure** — solutions are filed under:
  ```
  {folderPrefix}/{contestId}{problemIndex}-{slugified-problem-name}/Solution.{ext}
  ```
  with an auto-written `README.md` alongside each one, containing the
  problem link, language, verdict, and submission link.
- **Broad language support** — auto-detects the right file extension for
  C++, Python/PyPy, Java, Kotlin, Rust, Go, JavaScript, C#, and more.
- **Simple settings popup** — GitHub token, repo owner/name, branch, and
  folder prefix, plus a one-click "Test Connection" button.

---

## 🚀 Installation

1. Download or clone this extension's folder onto your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `beacon` folder.
5. Pin the extension and click its icon to open settings.

---

## ⚙️ Setup

### 1. Create a GitHub Personal Access Token
- **Classic token**: [github.com/settings/tokens](https://github.com/settings/tokens)
  → generate new token → check the **`repo`** scope.
- **Fine-grained token**: scope it to one repository with
  **Contents: Read and write** permission.

### 2. Pick or create a GitHub repo
Somewhere to hold your solutions, e.g. `codeforces-solutions`.

### 3. Configure the popup
Open the Beacon icon and fill in:
| Field | Example |
|---|---|
| GitHub Personal Access Token | `ghp_...` or `github_pat_...` |
| Repo Owner | your GitHub username |
| Repo Name | `codeforces-solutions` |
| Branch | `main` |
| Folder Prefix | `Codeforces` |
| Auto-Push Accepted Solutions | on |

Click **Test Connection** to confirm Beacon can see your repo, then
**Save Settings**.

### 4. Solve problems as usual
Once a submission is Accepted, watch for the toast notification confirming
the push — or click **Push to GitHub** manually if you'd rather trigger it
yourself.

---

## 🧠 How it works

- **`content-status.js`** watches the submissions/status table with a
  `MutationObserver` (since Codeforces updates verdicts live via JS
  without a page reload). When a row turns Accepted *and* its "when"
  column says something recent (e.g. "3 minutes ago"), it fetches that
  submission's page, extracts the source code, and messages the
  background script.
- **`content-submission.js`** injects a floating/inline **"Push to
  GitHub"** button wherever a source-code block appears — including
  inside Codeforces's inline "expanded submission" view (which loads in
  an iframe, so this script runs with `all_frames: true` to reach it).
- **`background.js`** is the service worker that talks to the GitHub
  REST Contents API: it checks whether the target file already exists
  (to update vs. create), then commits the solution and a companion
  README.

---

## ⚠️ Known limitations

- **Codeforces can change its markup.** Selectors are written defensively,
  but if auto-detection or the push button stop appearing after a
  Codeforces redesign, check (via DevTools):
  - the status table still has rows you can select (e.g. via
    `data-submission-id` or similar),
  - the verdict element still identifies "Accepted" somehow,
  - the source code block still exposes its text (e.g. via
    `#program-source-text` or a `<pre>` element).
- **No bulk import** of your entire past submission history yet — use the
  manual button one submission at a time to backfill older solutions.
- **Recency window is fixed at ~15 minutes** by default for auto-push;
  adjust this in `common.js` if you want a longer or shorter window.
- Your GitHub token is stored in `chrome.storage.sync`, which syncs
  across Chrome browsers you're signed into. Use a repo-scoped
  fine-grained token if that's a concern.

---

## 📂 File structure

| File | Purpose |
|---|---|
| `manifest.json` | Extension configuration (Manifest V3) |
| `common.js` | Shared helpers: language → extension mapping, recency check, slugify, base64 encoding, toast notifications |
| `content-status.js` | Auto-detects fresh Accepted submissions and triggers a push |
| `content-submission.js` | Injects the manual "Push to GitHub" button |
| `background.js` | Talks to the GitHub REST API to create/update files |
| `popup.html` / `popup.js` / `popup.css` | Settings UI |
| `toast.css` | Styling for in-page toast notifications |

---

## 🛠️ Troubleshooting

**Button doesn't appear:** the code viewer may be inside an iframe (check
via right-click → Inspect → look for a "This Frame" context menu option).
Make sure every entry in `content_scripts` in `manifest.json` has
`"all_frames": true`.

**Push button stuck on "Pushing...":** open `chrome://extensions`, click
the **service worker** link under Beacon, and check its Console/Network
tabs for the actual error — this is where background script failures
show up, not the page's own DevTools console.

**"Repository not found" on Test Connection:** double-check Repo Owner is
your exact GitHub handle (not your display name) and that your token has
access to that repository.