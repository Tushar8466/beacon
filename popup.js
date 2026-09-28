/**
 * Beacon — Popup Script (Ultra-Modern UI Pass)
 * Controls dual-state views, connection tests, stats, and real-time activity feed.
 */

document.addEventListener('DOMContentLoaded', async () => {

  /* ── Element refs ──────────────────────────────────────── */
  const loadingSkeleton    = document.getElementById('loading-skeleton');
  const headerStatus       = document.getElementById('header-status');
  const statusText         = document.getElementById('status-text');

  // Views
  const connectedView      = document.getElementById('connected-view');
  const settingsView       = document.getElementById('settings-view');

  // Connected-view elements
  const repoLink           = document.getElementById('repo-link');
  const chipBranch         = document.getElementById('chip-branch');
  const chipPrefix         = document.getElementById('chip-prefix');
  const statSyncedCount    = document.getElementById('stat-synced-count');
  const autoPushConn       = document.getElementById('autoPushConnected');
  const recentActivityList = document.getElementById('recent-activity-list');
  const changeRepoBtn      = document.getElementById('change-repo-btn');
  const disconnectBtn      = document.getElementById('disconnect-btn');

  // Settings form elements
  const welcomeBanner      = document.getElementById('welcome-banner');
  const form               = document.getElementById('settings-form');
  const tokenInput         = document.getElementById('githubToken');
  const ownerInput         = document.getElementById('repoOwner');
  const repoInput          = document.getElementById('repoName');
  const branchInput        = document.getElementById('branch');
  const folderPrefixInput  = document.getElementById('folderPrefix');
  const autoPushForm       = document.getElementById('autoPush');
  const toggleTokenBtn     = document.getElementById('toggle-token-btn');
  const eyeIcon            = document.getElementById('eye-icon');
  const testBtn            = document.getElementById('test-btn');
  const testLabel          = document.getElementById('test-label');
  const testIcon           = document.getElementById('test-icon');
  const saveBtn            = document.getElementById('save-btn');
  const saveLabel          = document.getElementById('save-label');
  const saveIcon           = document.getElementById('save-icon');
  const cancelEditBtn      = document.getElementById('cancel-edit-btn');

  // Alert
  const alertBox           = document.getElementById('status-alert');
  const alertIcon          = document.getElementById('alert-icon');
  const alertMessage       = document.getElementById('alert-message');

  // Field error elements + groups
  const errToken = document.getElementById('err-token');
  const errOwner = document.getElementById('err-owner');
  const errRepo  = document.getElementById('err-repo');
  const grpToken = document.getElementById('group-token');
  const grpOwner = document.getElementById('group-owner');
  const grpRepo  = document.getElementById('group-repo');

  let alertDismissTimer = null;
  let savedData = {};
  let pushedSubmissions = {};

  /* ── 1. Load settings & choose initial view ───────────── */
  try {
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get(['githubToken', 'repoOwner', 'repoName', 'branch', 'folderPrefix']),
      chrome.storage.local.get(['autoPush', 'pushedSubmissions'])
    ]);
    savedData = { ...syncData, autoPush: localData.autoPush };
    pushedSubmissions = localData.pushedSubmissions || {};
  } catch (err) {
    console.error('[Beacon] Failed to load settings:', err);
  }

  // Hide skeleton
  loadingSkeleton.classList.add('hidden');

  const isConnected = !!(savedData.githubToken && savedData.repoOwner && savedData.repoName);
  if (isConnected) {
    showConnectedView(savedData);
  } else {
    showSettingsForm(false);
  }

  /* ── View Helpers ──────────────────────────────────────── */

  function updateHeaderStatus(state) {
    if (!headerStatus || !statusText) return;
    headerStatus.className = 'status-pill';

    if (state === 'ready') {
      headerStatus.classList.add('status-ready');
      statusText.textContent = 'Sync Active';
    } else if (state === 'paused') {
      headerStatus.classList.add('status-paused');
      statusText.textContent = 'Sync Paused';
    } else {
      headerStatus.classList.add('status-unconfigured');
      statusText.textContent = 'Setup Required';
    }
  }

  function renderRecentActivity() {
    if (!recentActivityList) return;
    const entries = Object.entries(pushedSubmissions);

    if (statSyncedCount) {
      statSyncedCount.textContent = entries.length;
    }

    if (entries.length === 0) {
      recentActivityList.innerHTML = `
        <div class="activity-empty">
          <div class="empty-icon" aria-hidden="true">✨</div>
          <p class="empty-text">Awaiting your next Accepted solution</p>
          <span class="empty-hint">Solve on Codeforces to see it sync here.</span>
        </div>
      `;
      return;
    }

    // Sort descending by pushedAt timestamp
    const sorted = entries
      .map(([id, item]) => ({ id, ...item }))
      .sort((a, b) => new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0))
      .slice(0, 3); // show latest 3

    recentActivityList.innerHTML = sorted.map(item => {
      const contest = item.contestId || '';
      const index = item.problemIndex || '';
      const name = item.problemName || 'Problem';
      const timeStr = formatTimeAgo(item.pushedAt);
      const url = contest && index
        ? `https://codeforces.com/contest/${contest}/problem/${index}`
        : 'https://codeforces.com';

      return `
        <a href="${url}" target="_blank" rel="noopener noreferrer" class="activity-item" title="Open on Codeforces">
          <div class="activity-item-left">
            <span class="problem-badge font-mono">${contest}${index}</span>
            <span class="problem-name">${escapeHtml(name)}</span>
          </div>
          <span class="activity-time font-mono">${timeStr}</span>
        </a>
      `;
    }).join('');
  }

  function showConnectedView(data) {
    hideAlert();
    const owner  = data.repoOwner     || '';
    const repo   = data.repoName      || '';
    const branch = data.branch        || 'main';
    const prefix = data.folderPrefix  || 'Codeforces';
    const ap     = data.autoPush      !== false;

    // Repo title link
    const cleanRepoText = `${owner}/${repo}`;
    repoLink.innerHTML = `
      <span>${escapeHtml(cleanRepoText)}</span>
      <svg class="external-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="7" y1="17" x2="17" y2="7"></line>
        <polyline points="7 7 17 7 17 17"></polyline>
      </svg>
    `;
    repoLink.href = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

    chipBranch.textContent = branch;
    chipPrefix.textContent = prefix;
    autoPushConn.checked   = ap;

    updateHeaderStatus(ap ? 'ready' : 'paused');
    renderRecentActivity();

    settingsView.classList.add('hidden');
    connectedView.classList.remove('hidden');
  }

  function showSettingsForm(hasExistingConn) {
    hideAlert();

    // Fill form
    tokenInput.value        = savedData.githubToken   || '';
    ownerInput.value        = savedData.repoOwner     || '';
    repoInput.value         = savedData.repoName      || '';
    branchInput.value       = savedData.branch        || 'main';
    folderPrefixInput.value = savedData.folderPrefix  || 'Codeforces';
    autoPushForm.checked    = savedData.autoPush      !== false;

    welcomeBanner.classList.toggle('hidden', hasExistingConn);
    cancelEditBtn.classList.toggle('hidden', !hasExistingConn);

    updateHeaderStatus(hasExistingConn ? 'ready' : 'unconfigured');
    clearAllFieldErrors();

    connectedView.classList.add('hidden');
    settingsView.classList.remove('hidden');
  }

  /* ── Auto-push toggle in Connected View ──────────────── */
  autoPushConn.addEventListener('change', async () => {
    const val = autoPushConn.checked;
    try {
      await chrome.storage.local.set({ autoPush: val });
      autoPushForm.checked = val;
      savedData.autoPush   = val;
      updateHeaderStatus(val ? 'ready' : 'paused');
    } catch (err) {
      console.error('[Beacon] Failed to save autoPush toggle:', err);
    }
  });

  /* ── "Configure" button ───────────────────────────────── */
  changeRepoBtn.addEventListener('click', () => showSettingsForm(true));

  /* ── "Cancel" button ──────────────────────────────────── */
  cancelEditBtn.addEventListener('click', () => showConnectedView(savedData));

  /* ── "Disconnect" button ──────────────────────────────── */
  disconnectBtn.addEventListener('click', async () => {
    const ok = confirm('Disconnect this repository from Beacon? Solutions will not be lost.');
    if (!ok) return;

    try {
      await chrome.storage.sync.remove([
        'githubToken', 'repoOwner', 'repoName', 'branch', 'folderPrefix'
      ]);
      savedData = { autoPush: savedData.autoPush };
      showSettingsForm(false);
      showAlert('Disconnected. Configure a repository to reconnect.', 'info');
    } catch (err) {
      showAlert(`Disconnect failed: ${err.message}`, 'error');
    }
  });

  /* ── Toggle Password Visibility ───────────────────────── */
  toggleTokenBtn.addEventListener('click', () => {
    const show = tokenInput.type === 'password';
    tokenInput.type = show ? 'text' : 'password';
    eyeIcon.innerHTML = show
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
    toggleTokenBtn.setAttribute('aria-label', show ? 'Hide token' : 'Show token');
  });

  /* ── Inline Field Validation ──────────────────────────── */
  tokenInput.addEventListener('input', () => clearFieldError(grpToken, errToken));
  ownerInput.addEventListener('input', () => clearFieldError(grpOwner, errOwner));
  repoInput.addEventListener('input',  () => clearFieldError(grpRepo,  errRepo));

  /* ── Save Settings ─────────────────────────────────────── */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const githubToken  = tokenInput.value.trim();
    const repoOwner    = ownerInput.value.trim();
    const repoName     = repoInput.value.trim();
    const branch       = branchInput.value.trim()       || 'main';
    const folderPrefix = folderPrefixInput.value.trim() || 'Codeforces';
    const autoPush     = autoPushForm.checked;

    let hasError = false;
    clearAllFieldErrors();

    if (!githubToken) {
      setFieldError(grpToken, errToken, 'Token is required.');
      hasError = true;
    }
    if (!repoOwner) {
      setFieldError(grpOwner, errOwner, 'Repository owner is required.');
      hasError = true;
    }
    if (!repoName) {
      setFieldError(grpRepo, errRepo, 'Repository name is required.');
      hasError = true;
    }
    if (hasError) return;

    setSaveBtnState('loading');

    try {
      await chrome.storage.sync.set({ githubToken, repoOwner, repoName, branch, folderPrefix });
      await chrome.storage.local.set({ autoPush });

      savedData = { githubToken, repoOwner, repoName, branch, folderPrefix, autoPush };

      setSaveBtnState('success');
      await delay(600);

      showConnectedView(savedData);
      showAlert('Repository connected and ready to sync!', 'success', 4000);
    } catch (err) {
      setSaveBtnState('idle');
      showAlert(`Error saving settings: ${err.message}`, 'error');
    }
  });

  /* ── Test Connection ───────────────────────────────────── */
  testBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    const owner = ownerInput.value.trim();
    const repo  = repoInput.value.trim();

    if (!token || !owner || !repo) {
      showAlert('Please fill in Token, Owner, and Repo Name before testing.', 'error');
      return;
    }

    setTestBtnState('loading');
    showAlert('Verifying repository with GitHub API…', 'info');

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        {
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );
      clearTimeout(tid);

      if (res.ok) {
        const j = await res.json();
        setTestBtnState('success');
        showAlert(`✓ Connected — '${j.full_name}' (default branch: ${j.default_branch})`, 'success', 5000);
        setTimeout(() => setTestBtnState('idle'), 2500);
      } else if (res.status === 401) {
        setTestBtnState('idle');
        showAlert('Invalid GitHub Personal Access Token.', 'error');
      } else if (res.status === 404) {
        setTestBtnState('idle');
        showAlert(`Repository '${owner}/${repo}' not found. Make sure repo exists & token has 'Contents: Read and write' permissions.`, 'error');
      } else {
        const err = await res.json().catch(() => ({}));
        setTestBtnState('idle');
        showAlert(`Connection failed: ${err.message || 'HTTP ' + res.status}`, 'error');
      }
    } catch (err) {
      clearTimeout(tid);
      setTestBtnState('idle');
      if (err.name === 'AbortError') {
        showAlert('Request timed out (10s). Check your connection or token.', 'error');
      } else {
        showAlert(`Connection failed: ${err.message}`, 'error');
      }
    }
  });

  /* ── Button State Machines ─────────────────────────────── */
  const UPLOAD_ICON = `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline>`;
  const CHECK_ICON  = `<polyline points="20 6 9 17 4 12"></polyline>`;
  const BOLT_ICON   = `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>`;

  function setSaveBtnState(state) {
    saveBtn.disabled = (state !== 'idle');
    saveBtn.classList.remove('state-success');

    if (state === 'loading') {
      saveIcon.innerHTML = '';
      saveLabel.textContent = 'Connecting…';
      const sp = document.createElement('span');
      sp.className = 'btn-spinner';
      saveBtn.insertBefore(sp, saveBtn.firstChild);
    } else if (state === 'success') {
      const sp = saveBtn.querySelector('.btn-spinner');
      if (sp) sp.remove();
      saveIcon.innerHTML = CHECK_ICON;
      saveLabel.textContent = 'Connected!';
      saveBtn.classList.add('state-success');
      saveBtn.disabled = false;
    } else {
      const sp = saveBtn.querySelector('.btn-spinner');
      if (sp) sp.remove();
      saveIcon.innerHTML = UPLOAD_ICON;
      saveLabel.textContent = 'Save & Connect';
      saveBtn.disabled = false;
    }
  }

  function setTestBtnState(state) {
    testBtn.disabled = (state === 'loading');

    if (state === 'loading') {
      testIcon.innerHTML = '';
      testLabel.textContent = 'Testing…';
      const sp = document.createElement('span');
      sp.className = 'btn-spinner';
      sp.style.borderTopColor = '#94a3b8';
      sp.style.borderColor = 'rgba(148,163,184,0.25)';
      testBtn.insertBefore(sp, testBtn.firstChild);
    } else if (state === 'success') {
      const sp = testBtn.querySelector('.btn-spinner');
      if (sp) sp.remove();
      testIcon.innerHTML = CHECK_ICON;
      testLabel.textContent = 'Verified!';
      testBtn.disabled = false;
    } else {
      const sp = testBtn.querySelector('.btn-spinner');
      if (sp) sp.remove();
      testIcon.innerHTML = BOLT_ICON;
      testLabel.textContent = 'Test Connection';
      testBtn.disabled = false;
    }
  }

  /* ── Alert Helpers ─────────────────────────────────────── */
  function showAlert(msg, type = 'info', autoDismissMs = 0) {
    clearTimeout(alertDismissTimer);
    alertBox.className = `alert alert-${type}`;
    alertIcon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    alertMessage.textContent = msg;

    if (autoDismissMs > 0 || type === 'success') {
      const ms = autoDismissMs > 0 ? autoDismissMs : 4000;
      alertDismissTimer = setTimeout(hideAlert, ms);
    }
  }

  function hideAlert() {
    clearTimeout(alertDismissTimer);
    alertBox.className = 'alert hidden';
  }

  /* ── Field Validation Helpers ──────────────────────────── */
  function setFieldError(group, errEl, msg) {
    group.classList.add('has-error');
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }

  function clearFieldError(group, errEl) {
    group.classList.remove('has-error');
    errEl.textContent = '';
    errEl.classList.add('hidden');
  }

  function clearAllFieldErrors() {
    clearFieldError(grpToken, errToken);
    clearFieldError(grpOwner, errOwner);
    clearFieldError(grpRepo,  errRepo);
  }

  /* ── Utility Functions ─────────────────────────────────── */
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function formatTimeAgo(isoString) {
    if (!isoString) return '';
    const now = new Date();
    const date = new Date(isoString);
    const sec = Math.floor((now - date) / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
  }
});
