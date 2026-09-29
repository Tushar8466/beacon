/**
 * Beacon — Content Script for Codeforces Status / Submissions Pages
 * 
 * 1. Auto-detects recent Accepted submissions (<= 15 min) and syncs to GitHub.
 * 2. Injects a modern Beacon Bulk Sync Bar above status tables to backfill older submissions.
 * 3. Injects individual "⚡ Push" buttons and "✓ Synced" badges directly into table rows.
 */

(function () {
  'use strict';

  const { languageToExtension, isRecentSubmission, slugify, utf8ToBase64, showToast } = window.CF2GitHubUtils || self.CF2GitHubUtils;

  // In-flight processing set to prevent duplicate concurrent fetches
  const processingSubmissions = new Set();
  let isBulkSyncing = false;

  /**
   * Main initializer: checks settings, table scan, and sets up MutationObserver.
   */
  async function init() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    try {
      detectAndStoreHandle();

      const table = findStatusTable();
      if (!table) {
        return;
      }

      // Initial scan and render
      await scanAndRenderTable(table);

      // Watch table body for dynamic verdict updates (judging -> Accepted)
      const observer = new MutationObserver(() => {
        if (!isBulkSyncing) {
          scanAndRenderTable(table);
        }
      });

      observer.observe(table, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch (err) {
      console.warn('[Beacon] Status page observer initialization note:', err);
    }
  }

  /**
   * Detects current user handle and stores it for the popup backfill shortcut.
   */
  function detectAndStoreHandle() {
    try {
      const userLink = document.querySelector('.lang-chooser a[href^="/profile/"], #header a[href^="/profile/"], a[href^="/profile/"]');
      if (userLink) {
        const href = userLink.getAttribute('href');
        const match = href.match(/\/profile\/([A-Za-z0-9_-]+)/);
        if (match && match[1]) {
          chrome.storage.local.set({ cfHandle: match[1] });
          return match[1];
        }
      }
      const subMatch = window.location.pathname.match(/\/submissions\/([A-Za-z0-9_-]+)/);
      if (subMatch && subMatch[1]) {
        chrome.storage.local.set({ cfHandle: subMatch[1] });
        return subMatch[1];
      }
    } catch (e) {}
    return null;
  }

  /**
   * Finds status table using defensive selectors.
   */
  function findStatusTable() {
    return document.querySelector('table.status-frame-datatable, table.datatable, .status-frame table');
  }

  /**
   * Extracts submission metadata from a table row.
   */
  function extractRowMetadata(row) {
    let submissionId = row.getAttribute('data-submission-id');
    if (!submissionId) {
      const subLink = row.querySelector('a[href*="/submission/"]');
      if (subLink) {
        const match = subLink.href.match(/\/submission\/(\d+)/);
        if (match) submissionId = match[1];
      }
    }
    if (!submissionId) return null;

    // Check Verdict (Must be Accepted / OK)
    const verdictEl = row.querySelector('.verdict-accepted, span.verdict-accepted');
    const isAccepted = !!verdictEl || /accepted|ok/i.test(row.textContent);
    if (!isAccepted) return null;

    // Filter out rows still judging/compiling
    const rowText = row.textContent.toLowerCase();
    if (rowText.includes('running') || rowText.includes('queue') || rowText.includes('compiling')) {
      return null;
    }

    // Problem Info
    const problemLink = row.querySelector('a[href*="/problem/"], a[href*="/problemset/problem/"]');
    if (!problemLink) return null;

    const problemHref = problemLink.getAttribute('href');
    const contestMatch = problemHref.match(/(?:contest|problemset\/problem|gym)\/(\d+)\/(?:problem\/)?([A-Za-z0-9]+)/);

    let contestId = contestMatch ? contestMatch[1] : '';
    let problemIndex = contestMatch ? contestMatch[2] : '';

    const rawProblemText = problemLink.textContent.trim();
    let problemName = rawProblemText;

    if (rawProblemText.includes('-')) {
      const parts = rawProblemText.split('-');
      if (!problemIndex) problemIndex = parts[0].trim();
      problemName = parts.slice(1).join('-').trim();
    }

    // Extract Language
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

    // Submission URL
    const submissionUrl = problemHref.includes('problemset')
      ? `https://codeforces.com/problemset/submission/${contestId}/${submissionId}`
      : `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;

    // Relative Time
    const timeEl = row.querySelector('.format-time') || row.querySelector('td:nth-child(2)');
    const timeText = timeEl ? timeEl.textContent.trim() : '';
    const titleTime = timeEl ? timeEl.getAttribute('title') : null;
    const effectiveTime = isRecentSubmission(timeText) ? timeText : (titleTime || timeText);

    return {
      submissionId,
      contestId,
      problemIndex,
      problemName,
      language,
      submissionUrl,
      effectiveTime,
      isRecent: isRecentSubmission(effectiveTime)
    };
  }

  /**
   * Scans status table, injects/updates the Beacon Sync Bar, and handles row badges.
   */
  async function scanAndRenderTable(table) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    try {
      const storage = await chrome.storage.local.get(['autoPush', 'pushedSubmissions']);
      const autoPushEnabled = storage.autoPush !== false;
      const pushedMap = storage.pushedSubmissions || {};

      const rows = table.querySelectorAll('tr[data-submission-id], tbody tr');
      const acceptedItems = [];

      for (const row of rows) {
        const meta = extractRowMetadata(row);
        if (!meta) continue;

        acceptedItems.push({ row, meta });

        // Update row-level badge/action
        updateRowBadge(row, meta, pushedMap);

        // Auto-push if recent, enabled, and not already pushed
        if (autoPushEnabled && meta.isRecent && !pushedMap[meta.submissionId] && !processingSubmissions.has(meta.submissionId)) {
          processingSubmissions.add(meta.submissionId);
          pushSubmissionCore(meta, true).finally(() => {
            processingSubmissions.delete(meta.submissionId);
          });
        }
      }

      // Inject or update the Beacon Sync Bar above the table
      renderSyncBar(table, acceptedItems, pushedMap);

    } catch (err) {
      // Ignore invalidated extension context
    }
  }

  /**
   * Renders the Beacon Sync Bar above the status table.
   */
  function renderSyncBar(table, acceptedItems, pushedMap) {
    if (acceptedItems.length === 0) return;

    let syncBar = document.getElementById('beacon-sync-bar');
    if (!syncBar) {
      syncBar = document.createElement('div');
      syncBar.id = 'beacon-sync-bar';
      syncBar.className = 'beacon-sync-bar';

      // Insert directly before the table or its parent wrapper
      const targetParent = table.closest('.datatable') || table;
      targetParent.parentNode.insertBefore(syncBar, targetParent);
    }

    const pendingItems = acceptedItems.filter(item => !pushedMap[item.meta.submissionId]);
    const syncedCount = acceptedItems.length - pendingItems.length;

    const iconUrl = (chrome?.runtime?.getURL) ? chrome.runtime.getURL('icons/icon48.png') : '';

    syncBar.innerHTML = `
      <div class="beacon-sync-bar-left">
        <div class="beacon-sync-logo">
          ${iconUrl ? `<img src="${iconUrl}" alt="Beacon" />` : '🏮'}
        </div>
        <div class="beacon-sync-info">
          <span class="beacon-sync-title">Beacon Sync Manager</span>
          <span class="beacon-sync-desc" id="beacon-sync-desc">
            ${pendingItems.length > 0 
              ? `Found <strong>${acceptedItems.length}</strong> Accepted solutions (<strong>${syncedCount}</strong> synced, <strong>${pendingItems.length}</strong> pending)`
              : `✓ All <strong>${acceptedItems.length}</strong> solutions on this page are synced to GitHub.`}
          </span>
        </div>
      </div>
      <div class="beacon-sync-actions">
        <button type="button" id="beacon-sync-all-btn" class="beacon-btn-sync ${pendingItems.length === 0 ? 'state-done' : ''}" ${pendingItems.length === 0 ? 'disabled' : ''}>
          ${pendingItems.length > 0 
            ? `⚡ Sync ${pendingItems.length} Solution${pendingItems.length > 1 ? 's' : ''}` 
            : '✓ All Synced'}
        </button>
      </div>
    `;

    const syncBtn = syncBar.querySelector('#beacon-sync-all-btn');
    if (syncBtn && pendingItems.length > 0) {
      syncBtn.addEventListener('click', () => handleBulkSync(syncBtn, pendingItems));
    }
  }

  /**
   * Executes sequential bulk push of all pending solutions on the page.
   */
  async function handleBulkSync(btn, pendingItems) {
    if (isBulkSyncing) return;
    isBulkSyncing = true;

    btn.disabled = true;
    const total = pendingItems.length;
    let completed = 0;
    let failed = 0;

    const descEl = document.getElementById('beacon-sync-desc');

    showToast(`Starting Beacon bulk sync for ${total} solutions…`, 'info', 3000);

    for (let i = 0; i < pendingItems.length; i++) {
      const { row, meta } = pendingItems[i];
      btn.textContent = `Syncing ${i + 1} of ${total}…`;
      if (descEl) {
        descEl.innerHTML = `Pushing <strong>${meta.contestId}${meta.problemIndex} - ${escapeHtml(meta.problemName)}</strong> (${i + 1}/${total})…`;
      }

      // Mark row as in-flight
      const rowBtn = row.querySelector('.beacon-row-sync-btn');
      if (rowBtn) {
        rowBtn.disabled = true;
        rowBtn.textContent = '…';
      }

      const res = await pushSubmissionCore(meta, false);
      if (res && res.ok) {
        completed++;
        // Update row to synced state
        const storage = await chrome.storage.local.get('pushedSubmissions');
        updateRowBadge(row, meta, storage.pushedSubmissions || {});
      } else {
        failed++;
        if (rowBtn) {
          rowBtn.disabled = false;
          rowBtn.textContent = 'Retry';
        }
      }

      // Friendly rate-limiting pause between requests
      await new Promise(r => setTimeout(r, 750));
    }

    isBulkSyncing = false;
    btn.textContent = '✓ All Synced';
    btn.classList.add('state-done');
    btn.disabled = true;

    if (descEl) {
      descEl.innerHTML = `✓ Backfill complete: <strong>${completed}</strong> synced${failed > 0 ? `, ${failed} failed` : ''}.`;
    }

    showToast(`🎉 Bulk sync complete! Synced ${completed} solutions to GitHub.`, 'success', 6000);

    // Refresh table scan
    const table = findStatusTable();
    if (table) {
      scanAndRenderTable(table);
    }
  }

  /**
   * Updates or injects the row badge / sync button in an individual table row.
   */
  function updateRowBadge(row, meta, pushedMap) {
    // Target the verdict cell or problem cell
    const verdictCell = row.querySelector('td.status-verdict-cell, td.verdict-accepted, td:nth-child(6)') || row.querySelector('td:last-child');
    if (!verdictCell) return;

    let badge = row.querySelector('.beacon-row-badge, .beacon-row-sync-btn');
    const isPushed = !!pushedMap[meta.submissionId];

    if (isPushed) {
      if (!badge || badge.classList.contains('beacon-row-sync-btn')) {
        if (badge) badge.remove();
        const span = document.createElement('span');
        span.className = 'beacon-row-badge beacon-row-synced';
        span.title = 'Solution synced to GitHub by Beacon';
        span.textContent = '✓ Synced';
        verdictCell.appendChild(span);
      }
    } else {
      if (!badge) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'beacon-row-sync-btn';
        btn.title = `Sync ${meta.contestId}${meta.problemIndex} to GitHub`;
        btn.textContent = '⚡ Push';
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          btn.disabled = true;
          btn.textContent = 'Pushing…';
          const res = await pushSubmissionCore(meta, true);
          if (res && res.ok) {
            const storage = await chrome.storage.local.get('pushedSubmissions');
            updateRowBadge(row, meta, storage.pushedSubmissions || {});
            const table = findStatusTable();
            if (table) scanAndRenderTable(table);
          } else {
            btn.disabled = false;
            btn.textContent = 'Retry';
          }
        });
        verdictCell.appendChild(btn);
      }
    }
  }

  /**
   * Core function to fetch source code and push a single submission to GitHub.
   */
  async function pushSubmissionCore(meta, showNotification = true) {
    const { submissionId, contestId, problemIndex, problemName, language, submissionUrl } = meta;

    try {
      const code = await fetchSourceCode(submissionUrl);
      if (!code || !code.trim()) {
        throw new Error('Could not extract source code from submission page.');
      }

      // Check extension runtime validity
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || !chrome.storage || !chrome.storage.sync) {
        showToast('Extension reloaded or updated. Please refresh the page (Cmd+R / F5).', 'error', 6000);
        return { ok: false };
      }

      const settings = await chrome.storage.sync.get(['githubToken', 'repoOwner', 'repoName', 'branch', 'folderPrefix']);
      const token = settings.githubToken ? settings.githubToken.trim() : '';
      const owner = settings.repoOwner ? settings.repoOwner.trim() : '';
      const repo = settings.repoName ? settings.repoName.trim() : '';
      const branch = settings.branch ? settings.branch.trim() : 'main';
      const prefix = settings.folderPrefix ? settings.folderPrefix.trim().replace(/\/+$/, '') : 'Codeforces';

      if (!token || !owner || !repo) {
        if (showNotification) {
          showToast('GitHub settings incomplete. Click Beacon icon to configure token and repo.', 'error', 6000);
        }
        return { ok: false };
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

      if (!codePush.ok) {
        if (showNotification) {
          showToast(`Push failed: ${codePush.error}`, 'error', 6000);
        }
        return { ok: false, error: codePush.error };
      }

      // Push README
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
      }).catch(err => console.warn('[Beacon] README note:', err));

      if (showNotification) {
        showToast(`Pushed ${cleanContest}${cleanIndex} - ${problemName} to GitHub!`, 'success');
      }

      // Record in local storage
      try {
        if (chrome?.runtime?.id && chrome?.storage?.local) {
          const updatedStorage = await chrome.storage.local.get('pushedSubmissions');
          const currentMap = updatedStorage.pushedSubmissions || {};
          currentMap[submissionId] = {
            contestId: cleanContest,
            problemIndex: cleanIndex,
            problemName,
            pushedAt: new Date().toISOString()
          };
          await chrome.storage.local.set({ pushedSubmissions: currentMap });
        }
      } catch (storageErr) {
        console.warn('[Beacon] Local storage update note:', storageErr);
      }

      return { ok: true };

    } catch (err) {
      console.error('[Beacon] Error processing submission:', err);
      const msg = err && err.message ? err.message : String(err);
      if (showNotification) {
        if (msg.includes('Extension context invalidated') || !chrome?.runtime?.id) {
          showToast('Extension reloaded or updated. Please refresh the page (Cmd+R / F5).', 'error', 6000);
        } else {
          showToast(`Beacon error: ${msg}`, 'error', 6000);
        }
      }
      return { ok: false, error: msg };
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
   * Fetches submission HTML and extracts clean source code text (strips line numbers if present).
   */
  async function fetchSourceCode(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status} when fetching submission page`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    const codeEl = doc.querySelector('#program-source-text, pre.prettyprint, pre.program-source, .source-code pre');
    if (!codeEl) return null;

    const liElements = codeEl.querySelectorAll('li');
    if (liElements && liElements.length > 0) {
      return Array.from(liElements).map(li => li.textContent).join('\n');
    }

    return (codeEl.textContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // Initialize script after DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
