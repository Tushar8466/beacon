/**
 * CF2GitHub - Content Script for Individual Submission Pages & Popup Modals
 * 
 * Injects a "⬆ Push to GitHub" button when source code is displayed
 * (works on dedicated submission pages AND dynamic popup lightboxes).
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
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <span>Push to GitHub</span>
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
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <span>Push to GitHub</span>
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
      <span class="cf2github-spinner"></span>
      <span>Pushing...</span>
    `;

    function resetButton(errorMsg) {
      btn.disabled = false;
      btn.classList.remove('cf2github-btn-loading');
      btn.innerHTML = originalContent;
      if (errorMsg) {
        showToast(`Push failed: ${errorMsg}`, 'error', 7000);
      }
    }

    try {
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Pushed ✓</span>
      `;
      showToast(`Successfully pushed ${cleanContest}${cleanIndex} - ${problemName} to GitHub!`, 'success');

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

      setTimeout(() => {
        btn.disabled = false;
        btn.classList.remove('cf2github-btn-success');
        btn.innerHTML = originalContent;
      }, 4000);

    } catch (err) {
      resetButton(err.message || 'An error occurred while pushing');
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
   */
  function injectButtonStyles() {
    if (document.getElementById('cf2github-btn-styles')) return;

    const style = document.createElement('style');
    style.id = 'cf2github-btn-styles';
    style.textContent = `
      .cf2github-btn-floating {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 2147483647 !important;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        border-radius: 50px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        color: #ffffff !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 10px 30px rgba(37, 99, 235, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .cf2github-btn-inline {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        margin-bottom: 10px;
        border-radius: 6px;
        border: 1px solid rgba(37, 99, 235, 0.4);
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        color: #ffffff !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
        transition: all 0.2s ease;
      }

      .cf2github-btn-inline:hover:not(:disabled),
      .cf2github-btn-floating:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      }

      .cf2github-btn-floating:disabled,
      .cf2github-btn-inline:disabled {
        opacity: 0.85;
        cursor: not-allowed;
      }

      .cf2github-btn-success {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
        box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4) !important;
      }

      .cf2github-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #ffffff;
        border-radius: 50%;
        animation: cf2github-spin 0.8s linear infinite;
        display: inline-block;
      }

      @keyframes cf2github-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
