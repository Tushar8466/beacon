/**
 * CF2GitHub - Content Script for Codeforces Status / Submissions Pages
 * 
 * Auto-detects Accepted submissions in status tables, checks if they are recent
 * (submitted <= 15 minutes ago), fetches source code, and pushes directly to GitHub.
 */

(function () {
  'use strict';

  const { languageToExtension, isRecentSubmission, slugify, utf8ToBase64, showToast } = window.CF2GitHubUtils || self.CF2GitHubUtils;

  // In-flight processing set to prevent duplicate concurrent fetches
  const processingSubmissions = new Set();

  /**
   * Main initializer: checks autoPush setting, initial table scan, and sets up MutationObserver.
   */
  async function init() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    try {
      const storage = await chrome.storage.local.get(['autoPush', 'pushedSubmissions']);
      const autoPushEnabled = storage.autoPush !== false; // Default to true if unset

      if (!autoPushEnabled) {
        console.log('[CF2GitHub] Auto-push is disabled in extension settings.');
        return;
      }

      const table = findStatusTable();
      if (!table) {
        console.log('[CF2GitHub] Status table not found on page.');
        return;
      }

      // Process existing table rows
      scanTableRows(table);

      // Watch table body for dynamic verdict updates (judging -> Accepted)
      const observer = new MutationObserver(() => {
        scanTableRows(table);
      });

      observer.observe(table, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch (err) {
      console.warn('[CF2GitHub] Context invalidated or initialization deferred:', err);
    }
  }

  /**
   * Finds status table using defensive selectors.
   */
  function findStatusTable() {
    return document.querySelector('table.status-frame-datatable, table.datatable, .status-frame table');
  }

  /**
   * Scans status table rows for recent Accepted submissions.
   */
  async function scanTableRows(table) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    try {
      const storage = await chrome.storage.local.get(['autoPush', 'pushedSubmissions']);
      if (storage.autoPush === false) return;

      const pushedMap = storage.pushedSubmissions || {};
      const rows = table.querySelectorAll('tr[data-submission-id], tbody tr');

      for (const row of rows) {
        parseAndProcessRow(row, pushedMap);
      }
    } catch (err) {
      // Ignore invalidated extension context
    }
  }

  /**
   * Parses single row data and initiates push if valid, recent, and Accepted.
   */
  async function parseAndProcessRow(row, pushedMap) {
    // 1. Extract Submission ID
    let submissionId = row.getAttribute('data-submission-id');
    if (!submissionId) {
      const subLink = row.querySelector('a[href*="/submission/"]');
      if (subLink) {
        const match = subLink.href.match(/\/submission\/(\d+)/);
        if (match) submissionId = match[1];
      }
    }
    if (!submissionId) return;

    // Skip if already pushed or currently being processed
    if (pushedMap[submissionId] || processingSubmissions.has(submissionId)) {
      return;
    }

    // 2. Check Verdict (Must be Accepted / OK)
    const verdictEl = row.querySelector('.verdict-accepted, span.verdict-accepted');
    const isAccepted = !!verdictEl || /accepted|ok/i.test(row.textContent);
    if (!isAccepted) return;

    // Double-check row doesn't say "Running on test" or "In queue"
    const rowText = row.textContent.toLowerCase();
    if (rowText.includes('running') || rowText.includes('queue') || rowText.includes('compiling')) {
      return;
    }

    // 3. Extract & Check Relative Time (Must be recent: <= 15 minutes)
    const timeEl = row.querySelector('.format-time') || row.querySelector('td:nth-child(2)');
    const timeText = timeEl ? timeEl.textContent.trim() : '';
    
    // Check title attribute if present (e.g. title="3 minutes ago")
    const titleTime = timeEl ? timeEl.getAttribute('title') : null;
    const effectiveTime = isRecentSubmission(timeText) ? timeText : (titleTime || timeText);

    if (!isRecentSubmission(effectiveTime)) {
      return;
    }

    // Mark as in-flight
    processingSubmissions.add(submissionId);

    // 4. Extract Problem Info & Language
    const problemLink = row.querySelector('a[href*="/problem/"], a[href*="/problemset/problem/"]');
    if (!problemLink) {
      processingSubmissions.delete(submissionId);
      return;
    }

    const problemHref = problemLink.getAttribute('href');
    const contestMatch = problemHref.match(/(?:contest|problemset\/problem)\/(\d+)\/(?:problem\/)?([A-Za-z0-9]+)/);
    
    let contestId = contestMatch ? contestMatch[1] : '';
    let problemIndex = contestMatch ? contestMatch[2] : '';
    
    const rawProblemText = problemLink.textContent.trim();
    let problemName = rawProblemText;
    
    if (rawProblemText.includes('-')) {
      const parts = rawProblemText.split('-');
      if (!problemIndex) problemIndex = parts[0].trim();
      problemName = parts.slice(1).join('-').trim();
    }

    // Extract Language from row cells
    let language = '';
    const cells = Array.from(row.querySelectorAll('td'));
    for (const cell of cells) {
      const txt = cell.textContent.trim();
      if (/c\+\+|python|java|pypy|kotlin|rust|go|javascript|node|c#|pascal|ruby|haskell/i.test(txt)) {
        language = txt;
        break;
      }
    }
    if (!language && cells.length >= 5) {
      language = cells[4].textContent.trim();
    }

    const submissionUrl = problemHref.includes('problemset') 
      ? `https://codeforces.com/problemset/submission/${contestId}/${submissionId}`
      : `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;

    // 5. Fetch Source Code & Push
    try {
      const code = await fetchSourceCode(submissionUrl);
      if (!code) {
        throw new Error('Failed to extract source code from submission page.');
      }

      showToast(`Pushing solution for ${contestId}${problemIndex} to GitHub...`, 'info', 3000);

      // Check settings
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.sync) {
        processingSubmissions.delete(submissionId);
        showToast('Extension reloaded. Please refresh the page (Cmd+R / F5).', 'error', 6000);
        return;
      }

      const settings = await chrome.storage.sync.get(['githubToken', 'repoOwner', 'repoName', 'branch', 'folderPrefix']);
      const token = settings.githubToken ? settings.githubToken.trim() : '';
      const owner = settings.repoOwner ? settings.repoOwner.trim() : '';
      const repo = settings.repoName ? settings.repoName.trim() : '';
      const branch = settings.branch ? settings.branch.trim() : 'main';
      const prefix = settings.folderPrefix ? settings.folderPrefix.trim().replace(/\/+$/, '') : 'Codeforces';

      if (!token || !owner || !repo) {
        processingSubmissions.delete(submissionId);
        showToast('GitHub settings incomplete. Click CF2GitHub icon to configure token and repo.', 'error', 6000);
        return;
      }

      const slug = slugify(problemName || 'Problem');
      const ext = languageToExtension(language || 'C++');
      const cleanContest = (contestId || '0').toString().trim();
      const cleanIndex = (problemIndex || 'Sol').toString().trim();
      const folderName = `${cleanContest}${cleanIndex}-${slug}`;
      const folderPath = prefix ? `${prefix}/${folderName}` : folderName;

      const codeFilePath = `${folderPath}/Solution.${ext}`;
      const readmeFilePath = `${folderPath}/README.md`;

      const commitMsgCode = `Add solution for Codeforces ${cleanContest}${cleanIndex} - ${problemName} [#${submissionId}]`;
      const codeBase64 = utf8ToBase64(code);

      const codePush = await pushFileToGitHubDirect({
        token, owner, repo, branch, filePath: codeFilePath, contentBase64: codeBase64, commitMessage: commitMsgCode
      });

      processingSubmissions.delete(submissionId);

      if (!codePush.ok) {
        showToast(`Push failed: ${codePush.error}`, 'error', 6000);
        return;
      }

      const problemUrl = cleanContest && cleanIndex 
        ? `https://codeforces.com/contest/${cleanContest}/problem/${cleanIndex}`
        : 'https://codeforces.com';

      const readmeMarkdown = `# Codeforces ${cleanContest}${cleanIndex} - ${problemName}

- **Problem Link**: [${cleanContest}${cleanIndex} - ${problemName}](${problemUrl})
- **Submission ID**: [#${submissionId}](${submissionUrl})
- **Language**: ${language || 'C++'}
- **Verdict**: Accepted

## Solution Code

\`\`\`${ext}
${code}
\`\`\`
`;

      const commitMsgReadme = `Add README for Codeforces ${cleanContest}${cleanIndex} - ${problemName}`;
      const readmeBase64 = utf8ToBase64(readmeMarkdown);

      await pushFileToGitHubDirect({
        token, owner, repo, branch, filePath: readmeFilePath, contentBase64: readmeBase64, commitMessage: commitMsgReadme
      }).catch(err => console.warn('[CF2GitHub] Auto-push README note:', err));

      showToast(`Pushed ${cleanContest}${cleanIndex} - ${problemName} to GitHub!`, 'success');

      // Record in local storage
      const updatedStorage = await chrome.storage.local.get('pushedSubmissions');
      const currentMap = updatedStorage.pushedSubmissions || {};
      currentMap[submissionId] = {
        contestId: cleanContest,
        problemIndex: cleanIndex,
        problemName,
        pushedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ pushedSubmissions: currentMap });

    } catch (err) {
      processingSubmissions.delete(submissionId);
      console.error('[CF2GitHub] Error processing submission:', err);
      showToast(`CF2GitHub error: ${err.message}`, 'error', 6000);
    }
  }

  /**
   * Pushes a single file directly to GitHub REST API with branch fallback retry & 15s timeout safeguard.
   */
  async function pushFileToGitHubDirect({ token, owner, repo, branch, filePath, contentBase64, commitMessage }) {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };

    let existingSha = null;

    try {
      const getUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}${branch ? '?ref=' + encodeURIComponent(branch) : ''}`;
      const getRes = await fetch(getUrl, { headers });
      if (getRes.ok) {
        const json = await getRes.json();
        existingSha = json.sha;
      }
    } catch (e) {
      // Ignore 404
    }

    const putUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`;
    const body = {
      message: commitMessage,
      content: contentBase64
    };

    if (branch && branch.trim()) {
      body.branch = branch.trim();
    }

    if (existingSha) body.sha = existingSha;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      let putRes = await fetch(putUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      // If 404/422 occurred with explicit branch (e.g. repo is empty or default branch is master), retry without branch field
      if (!putRes.ok && (putRes.status === 404 || putRes.status === 422) && body.branch) {
        delete body.branch;
        putRes = await fetch(putUrl, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });
      }

      clearTimeout(timeoutId);

      if (putRes.ok) {
        return { ok: true };
      }

      const errJson = await putRes.json().catch(() => ({}));
      let errorMsg = errJson.message || `HTTP ${putRes.status}`;

      if (putRes.status === 401) {
        errorMsg = 'Invalid GitHub Personal Access Token.';
      } else if (putRes.status === 404) {
        errorMsg = `Repo '${owner}/${repo}' or branch not found. Make sure: 1) Repo exists, 2) Token has 'Contents: Read & Write' permission.`;
      } else if (putRes.status === 422) {
        errorMsg = `GitHub API Error: ${errJson.message || 'Validation error'}`;
      }

      return { ok: false, error: errorMsg };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return { ok: false, error: 'GitHub API request timed out (15s).' };
      }
      return { ok: false, error: `GitHub network error: ${err.message}` };
    }
  }

  /**
   * Fetches submission HTML and extracts source code text.
   */
  async function fetchSourceCode(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status} when fetching submission page`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    const codeEl = doc.querySelector('#program-source-text, pre.prettyprint');
    if (!codeEl) return null;

    return codeEl.textContent;
  }

  // Initialize script after DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
