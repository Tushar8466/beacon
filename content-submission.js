/**
 * Beacon — Content Script for Individual Submission Pages & Popup Modals
 *
 * Injects a "Push to GitHub" button when source code is displayed
 * (works on dedicated submission pages AND dynamic popup lightboxes).
 * Design-polished: matches Beacon popup palette & design system.
 */

(function () {
  'use strict';

  const { languageToExtension, slugify, utf8ToBase64, showToast } = window.CF2GitHubUtils || self.CF2GitHubUtils;

  function init() {
    scanForSourceCode();

    // Use MutationObserver to detect dynamically opened submission modals
    const observer = new MutationObserver(() => {
      scanForSourceCode();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also poll every 1 second as a fallback
    setInterval(scanForSourceCode, 1000);
  }

  function scanForSourceCode() {
    // 1. Check standard selectors first
    let sourceEl = document.querySelector('#program-source-text, pre.prettyprint, pre.program-source, .source-code pre, pre[class*="source"]');
    
    // 2. Fallback: search any <pre> element on the page that contains code
    if (!sourceEl) {
      const pres = document.querySelectorAll('pre');
      for (const p of pres) {
        const txt = (p.textContent || '').trim();
        if (txt.length > 15 && (txt.includes('int ') || txt.includes('def ') || txt.includes('import') || txt.includes('for') || txt.includes('#include') || txt.includes('print') || txt.includes('class'))) {
          sourceEl = p;
          break;
        }
      }
    }

    if (sourceEl) {
      if (!document.getElementById('cf2github-manual-btn')) {
        injectPushButton(sourceEl);
      }
      if (!document.getElementById('cf2github-inline-btn')) {
        injectInlineButton(sourceEl);
      }
    }
  }

  /**
   * Injects the floating Push to GitHub button.
   */
  function injectPushButton(sourceEl) {
    if (document.getElementById('cf2github-manual-btn')) return;

    injectButtonStyles();

    const btn = document.createElement('button');
    btn.id = 'cf2github-manual-btn';
    btn.className = 'cf2github-btn-floating';
    btn.setAttribute('aria-label', 'Push solution to GitHub');
    btn.innerHTML = `
      <span class="cf2github-btn-logo" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
      </span>
      <span class="cf2github-btn-text">Push to GitHub</span>
    `;

    btn.addEventListener('click', () => handleManualPush(btn, sourceEl));
    document.body.appendChild(btn);
  }

  /**
   * Injects an inline button right above the code block inside the modal container.
   */
  function injectInlineButton(sourceEl) {
    if (document.getElementById('cf2github-inline-btn')) return;

    injectButtonStyles();

    const btn = document.createElement('button');
    btn.id = 'cf2github-inline-btn';
    btn.className = 'cf2github-btn-inline';
    btn.setAttribute('aria-label', 'Push solution to GitHub');
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <span class="cf2github-btn-text">Push to GitHub</span>
    `;

    btn.addEventListener('click', () => handleManualPush(btn, sourceEl));

    if (sourceEl.parentNode) {
      sourceEl.parentNode.insertBefore(btn, sourceEl);
    }
  }

  /**
   * Extracts clean source code text from Codeforces prettified elements,
   * preserving line breaks (joins <li> lines with \n).
   */
  function getCleanSourceCode(sourceEl) {
    if (!sourceEl) return '';

    const liElements = sourceEl.querySelectorAll('li');
    if (liElements && liElements.length > 0) {
      return Array.from(liElements)
        .map(li => li.textContent)
        .join('\n');
    }

    return (sourceEl.textContent || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  }

  /**
   * Smart language detector with syntax fallback.
   */
  function detectLanguage(modalText, modalBox, code) {
    let language = '';

    const langMatch = modalText.match(/(GNU C\+\+\d+|C\+\+\d+|PyPy \d+(?:-\d+)?|Python \d+|Java \d+|Kotlin|Rust|Go|JavaScript|Node|C#)/i);
    if (langMatch) {
      language = langMatch[0];
    }

    if (!language && modalBox) {
      const cells = modalBox.querySelectorAll('td, th');
      for (const cell of cells) {
        const txt = cell.textContent.trim();
        if (/c\+\+|python|java|pypy|kotlin|rust|go|javascript|node|c#/i.test(txt) && txt.length < 40) {
          language = txt;
          break;
        }
      }
    }

    // Code syntax analysis fallback
    if (!language || language.toLowerCase().includes('c++')) {
      if (code.includes('def ') || code.includes('import ') || code.includes('input()') || code.includes('print(')) {
        language = 'Python 3';
      } else if (code.includes('#include') || code.includes('std::') || code.includes('cout')) {
        language = 'C++';
      } else if (code.includes('public class') || code.includes('System.out.print')) {
        language = 'Java';
      }
    }

    return language || 'C++';
  }

  /**
   * Reads metadata from DOM/Modal and pushes solution directly to GitHub.
   */
  async function handleManualPush(btn, sourceEl) {
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('cf2github-btn-loading');
    btn.innerHTML = `
      <span class="cf2github-spinner" aria-hidden="true"></span>
      <span class="cf2github-btn-text">Pushing…</span>
    `;

    function resetButton(errorMsg) {
      btn.disabled = false;
      btn.classList.remove('cf2github-btn-loading');
      btn.innerHTML = originalContent;
      if (errorMsg) {
        showToastBeacon('Push Failed', errorMsg, 'error', 8000);
      }
    }

    try {
      // Check if extension context is valid (detects reloads/updates)
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        resetButton('Extension reloaded or updated. Please refresh this page (Cmd+R / F5) to reconnect.');
        return;
      }

      // 1. Fetch settings from chrome.storage.sync
      const settings = await chrome.storage.sync.get(['githubToken', 'repoOwner', 'repoName', 'branch', 'folderPrefix']);
      const token = settings.githubToken ? settings.githubToken.trim() : '';
      const owner = settings.repoOwner ? settings.repoOwner.trim() : '';
      const repo = settings.repoName ? settings.repoName.trim() : '';
      const branch = settings.branch ? settings.branch.trim() : 'main';
      const prefix = settings.folderPrefix ? settings.folderPrefix.trim().replace(/\/+$/, '') : 'Codeforces';

      if (!token || !owner || !repo) {
        resetButton('GitHub settings incomplete. Click extension icon to configure token and repo.');
        return;
      }

      // 2. Scope parsing strictly to modal box container (DO NOT query document.body!)
      const modalBox = sourceEl.closest('#facebox, .popup, .modal, .source-popup, .facebox-content, div[style*="z-index"]') || sourceEl.parentElement;
      const modalText = modalBox ? modalBox.textContent || '' : '';

      // Extract Clean Multi-Line Source Code
      const code = getCleanSourceCode(sourceEl);
      if (!code || !code.trim()) {
        resetButton('Source code container is empty.');
        return;
      }

      // Extract Submission ID
      let submissionId = '';
      const urlMatch = window.location.pathname.match(/\/submission\/(\d+)/);
      if (urlMatch) {
        submissionId = urlMatch[1];
      }

      if (!submissionId && modalBox) {
        const modalSubLink = modalBox.querySelector('a[href*="/submission/"]');
        if (modalSubLink) {
          const subMatch = modalSubLink.getAttribute('href').match(/\/submission\/(\d+)/);
          if (subMatch) submissionId = subMatch[1];
        }
        if (!submissionId) {
          const subIdMatch = modalText.match(/#(\d{7,10})/) || modalText.match(/submission\s*#?\s*(\d{7,10})/i);
          if (subIdMatch) submissionId = subIdMatch[1];
        }
      }

      if (!submissionId) {
        submissionId = Date.now().toString();
      }

      // 3. Extract Problem Info & Contest ID strictly from modalBox
      let contestId = '';
      let problemIndex = '';
      let problemName = '';

      // Parse header text inside modalBox (e.g. "contest: Codeforces Round 1122 (Div. 3), problem: (A) Good Contest")
      const headerProblemMatch = modalText.match(/problem:\s*\(([A-Za-z0-9]+)\)\s*([^,\n\r]+)/i);
      if (headerProblemMatch) {
        problemIndex = headerProblemMatch[1].trim();
        problemName = headerProblemMatch[2].trim();
      }

      const headerContestMatch = modalText.match(/contest:\s*.*?\b(\d{3,5})\b/i);
      if (headerContestMatch) {
        contestId = headerContestMatch[1].trim();
      }

      // Check problem links inside modalBox ONLY
      if (modalBox) {
        const problemLinkInModal = modalBox.querySelector('a[href*="/problem/"], a[href*="/problemset/problem/"]');
        if (problemLinkInModal) {
          const problemHref = problemLinkInModal.getAttribute('href');
          const contestMatch = problemHref.match(/(?:contest|problemset\/problem|gym)\/(\d+)\/(?:problem\/)?([A-Za-z0-9]+)/);
          if (contestMatch) {
            if (!contestId) contestId = contestMatch[1];
            if (!problemIndex) problemIndex = contestMatch[2];
          }
          if (!problemName) {
            const rawProblemText = problemLinkInModal.textContent.trim();
            problemName = rawProblemText;
            if (rawProblemText.includes('-')) {
              const parts = rawProblemText.split('-');
              if (!problemIndex) problemIndex = parts[0].trim();
              problemName = parts.slice(1).join('-').trim();
            }
          }
        }
      }

      // Fallback to URL pathname if dedicated submission page (/contest/1122/submission/392180993)
      if (!contestId || !problemIndex) {
        const pageMatch = window.location.pathname.match(/(?:contest|problemset\/problem|gym)\/(\d+)\/(?:problem\/)?([A-Za-z0-9]+)?/);
        if (pageMatch) {
          if (!contestId) contestId = pageMatch[1];
          if (!problemIndex && pageMatch[2]) problemIndex = pageMatch[2];
        }
      }

      // 4. Smart Language Detection with Code Syntax Fallback
      const language = detectLanguage(modalText, modalBox, code);

      const submissionUrl = contestId && submissionId 
        ? `https://codeforces.com/contest/${contestId}/submission/${submissionId}`
        : window.location.href;

      // 5. Format folder path & filenames
      const slug = slugify(problemName || 'Problem');
      const ext = languageToExtension(language);
      const cleanContest = (contestId || '0').toString().trim();
      const cleanIndex = (problemIndex || 'Sol').toString().trim();
      const folderName = `${cleanContest}${cleanIndex}-${slug}`;
      const folderPath = prefix ? `${prefix}/${folderName}` : folderName;

      const codeFilePath = `${folderPath}/Solution.${ext}`;
      const readmeFilePath = `${folderPath}/README.md`;

      // 6. Push Solution Code to GitHub
      const commitMsgCode = `Add solution for Codeforces ${cleanContest}${cleanIndex} - ${problemName} [#${submissionId}]`;
      const codeBase64 = utf8ToBase64(code);

      const codePush = await pushFileToGitHubDirect({
        token, owner, repo, branch, filePath: codeFilePath, contentBase64: codeBase64, commitMessage: commitMsgCode
      });

      if (!codePush.ok) {
        resetButton(codePush.error);
        return;
      }

      // 7. Push README.md to GitHub
      const problemUrl = cleanContest && cleanIndex 
        ? `https://codeforces.com/contest/${cleanContest}/problem/${cleanIndex}`
        : 'https://codeforces.com';

      const readmeMarkdown = `# Codeforces ${cleanContest}${cleanIndex} - ${problemName}

- **Problem Link**: [${cleanContest}${cleanIndex} - ${problemName}](${problemUrl})
- **Submission ID**: [#${submissionId}](${submissionUrl})
- **Language**: ${language}
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
      }).catch(err => console.warn('[CF2GitHub] README creation note:', err));

      // 8. Success UI Update
      btn.classList.remove('cf2github-btn-loading');
      btn.classList.add('cf2github-btn-success');
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span class="cf2github-btn-text">Pushed ✓</span>
      `;
      showToastBeacon(
        `Pushed ${cleanContest}${cleanIndex}`,
        `${problemName} → GitHub`,
        'success'
      );

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
        console.warn('[Beacon] Storage record skipped:', storageErr);
      }

      setTimeout(() => {
        btn.disabled = false;
        btn.classList.remove('cf2github-btn-success');
        btn.innerHTML = originalContent;
      }, 4000);

    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      if (msg.includes('Extension context invalidated') || !chrome?.runtime?.id) {
        resetButton('Extension reloaded or updated. Please refresh this page (Cmd+R / F5) to reconnect.');
      } else {
        resetButton(msg || 'An error occurred while pushing');
      }
    }
  }

  /**
   * Pushes a single file directly to GitHub REST API with individual segment encoding, branch fallback, and 15s timeout.
   */
  async function pushFileToGitHubDirect({ token, owner, repo, branch, filePath, contentBase64, commitMessage }) {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };

    const pathSegments = filePath.split('/').map(s => encodeURIComponent(s)).join('/');
    let existingSha = null;

    // Check if file exists to get sha
    try {
      const getUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathSegments}${branch ? '?ref=' + encodeURIComponent(branch) : ''}`;
      const getRes = await fetch(getUrl, { headers });
      if (getRes.ok) {
        const json = await getRes.json();
        existingSha = json.sha;
      }
    } catch (e) {
      // Ignore 404
    }

    const putUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${pathSegments}`;
    
    const body = {
      message: commitMessage,
      content: contentBase64
    };

    if (branch && branch.trim()) {
      body.branch = branch.trim();
    }

    if (existingSha) {
      body.sha = existingSha;
    }

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
        errorMsg = `Repo '${owner}/${repo}' 404. Ensure Token has 'Contents: Read and write' permission under Repository Permissions!`;
      } else if (putRes.status === 422) {
        errorMsg = `GitHub API Error: ${errJson.message || 'File or branch invalid'}`;
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
   * Injects CSS styles for the manual buttons.
   * Matches Beacon popup design system: same palette, radii, spacing, focus rings.
   */
  function injectButtonStyles() {
    if (document.getElementById('cf2github-btn-styles')) return;

    const style = document.createElement('style');
    style.id = 'cf2github-btn-styles';
    style.textContent = `
      /* ── Floating pill button ───────────────────────────── */
      .cf2github-btn-floating {
        all: initial;
        position: fixed !important;
        bottom: 24px !important;
        right: 24px !important;
        z-index: 2147483646 !important; /* one below toast container */
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 11px 18px !important;
        border-radius: 50px !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
        color: #ffffff !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 13.5px !important;
        font-weight: 600 !important;
        letter-spacing: -0.1px !important;
        cursor: pointer !important;
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.12),
          0 8px 24px rgba(37, 99, 235, 0.5),
          0 2px 6px rgba(0, 0, 0, 0.25) !important;
        transition:
          background    200ms cubic-bezier(0.16,1,0.3,1),
          box-shadow    200ms cubic-bezier(0.16,1,0.3,1),
          transform     200ms cubic-bezier(0.16,1,0.3,1) !important;
        /* Slide in on inject */
        animation: cf2github-btn-enter 280ms cubic-bezier(0.16,1,0.3,1) both !important;
      }

      @keyframes cf2github-btn-enter {
        from { opacity: 0; transform: translateY(12px) scale(0.95); }
        to   { opacity: 1; transform: translateY(0)   scale(1); }
      }

      /* ── Inline button (above code block) ─────────────── */
      .cf2github-btn-inline {
        all: initial;
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        padding: 7px 14px !important;
        margin-bottom: 10px !important;
        border-radius: 8px !important;
        border: 1px solid rgba(59, 130, 246, 0.35) !important;
        background: linear-gradient(135deg, rgba(59,130,246,0.14) 0%, rgba(37,99,235,0.1) 100%) !important;
        color: #60a5fa !important;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 12.5px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        box-shadow: 0 2px 8px rgba(37, 99, 235, 0.18) !important;
        transition:
          background 180ms ease,
          box-shadow 180ms ease,
          transform  180ms cubic-bezier(0.16,1,0.3,1),
          color      180ms ease !important;
      }

      /* ── Shared hover ──────────────────────────────────── */
      .cf2github-btn-floating:hover:not(:disabled) {
        background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%) !important;
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.15),
          0 12px 32px rgba(37, 99, 235, 0.55),
          0 4px 10px rgba(0, 0, 0, 0.3) !important;
        transform: translateY(-2px) !important;
      }

      .cf2github-btn-inline:hover:not(:disabled) {
        background: linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(37,99,235,0.16) 100%) !important;
        color: #93c5fd !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.28) !important;
      }

      /* ── Focus-visible ring ────────────────────────────── */
      .cf2github-btn-floating:focus-visible,
      .cf2github-btn-inline:focus-visible {
        outline: 2px solid #60a5fa !important;
        outline-offset: 3px !important;
      }

      /* ── Active (press) ────────────────────────────────── */
      .cf2github-btn-floating:active:not(:disabled),
      .cf2github-btn-inline:active:not(:disabled) {
        transform: translateY(0) scale(0.98) !important;
      }

      /* ── Disabled ──────────────────────────────────────── */
      .cf2github-btn-floating:disabled,
      .cf2github-btn-inline:disabled {
        opacity: 0.7 !important;
        cursor: not-allowed !important;
        transform: none !important;
      }

      /* ── Success state ─────────────────────────────────── */
      .cf2github-btn-success.cf2github-btn-floating {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
        border-color: rgba(255,255,255,0.2) !important;
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.12),
          0 8px 24px rgba(16, 185, 129, 0.45) !important;
        color: #ffffff !important;
      }

      .cf2github-btn-success.cf2github-btn-inline {
        background: linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(5,150,105,0.14) 100%) !important;
        border-color: rgba(16, 185, 129, 0.4) !important;
        color: #34d399 !important;
      }

      /* ── Spinner ───────────────────────────────────────── */
      .cf2github-spinner {
        display: inline-block !important;
        width: 13px !important;
        height: 13px !important;
        border: 2px solid rgba(255, 255, 255, 0.25) !important;
        border-top-color: #ffffff !important;
        border-radius: 50% !important;
        animation: cf2github-spin 0.75s linear infinite !important;
        flex-shrink: 0 !important;
      }

      @keyframes cf2github-spin {
        to { transform: rotate(360deg); }
      }

      /* Logo icon container inside floating btn */
      .cf2github-btn-logo {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 22px !important;
        height: 22px !important;
        border-radius: 6px !important;
        background: rgba(255,255,255,0.15) !important;
        flex-shrink: 0 !important;
      }

      .cf2github-btn-text {
        display: inline !important;
        font: inherit !important;
        color: inherit !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Shows a polished Beacon toast with title + body lines and a dismiss button.
   * Wraps/upgrades the existing showToast utility for page-injected UI.
   */
  function showToastBeacon(title, body, type = 'info', duration = 5000) {
    // Ensure container
    let container = document.querySelector('.cf2github-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'cf2github-toast-container';
      document.body.appendChild(container);
    }

    const icons = { success: '✓', error: '✕', info: 'ℹ' };

    const toast = document.createElement('div');
    toast.className = `cf2github-toast cf2github-toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <span class="cf2github-toast-icon" aria-hidden="true">${icons[type] || 'ℹ'}</span>
      <span class="cf2github-toast-content">
        <span class="cf2github-toast-title">${title}</span>
        ${body ? `<span class="cf2github-toast-body">${body}</span>` : ''}
      </span>
      <button class="cf2github-toast-close" aria-label="Dismiss notification" title="Dismiss">×</button>
    `;

    container.appendChild(toast);

    // Trigger entry animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('cf2github-toast-show'));
    });

    function dismiss() {
      toast.classList.remove('cf2github-toast-show');
      toast.classList.add('cf2github-toast-hide');
      setTimeout(() => toast.remove(), 180);
    }

    toast.querySelector('.cf2github-toast-close').addEventListener('click', dismiss);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
