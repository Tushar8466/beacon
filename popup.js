/**
 * CF2GitHub - Popup Script
 * Manages configuration storage and connection testing.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const tokenInput = document.getElementById('githubToken');
  const ownerInput = document.getElementById('repoOwner');
  const repoInput = document.getElementById('repoName');
  const branchInput = document.getElementById('branch');
  const folderPrefixInput = document.getElementById('folderPrefix');
  const autoPushCheckbox = document.getElementById('autoPush');

  const toggleTokenBtn = document.getElementById('toggle-token-btn');
  const eyeIcon = document.getElementById('eye-icon');
  const form = document.getElementById('settings-form');
  const testBtn = document.getElementById('test-btn');
  const alertBox = document.getElementById('status-alert');
  const alertIcon = document.getElementById('alert-icon');
  const alertMessage = document.getElementById('alert-message');

  // 1. Load saved settings
  try {
    const syncData = await chrome.storage.sync.get(['githubToken', 'repoOwner', 'repoName', 'branch', 'folderPrefix']);
    const localData = await chrome.storage.local.get(['autoPush']);

    if (syncData.githubToken) tokenInput.value = syncData.githubToken;
    if (syncData.repoOwner) ownerInput.value = syncData.repoOwner;
    if (syncData.repoName) repoInput.value = syncData.repoName;
    if (syncData.branch) branchInput.value = syncData.branch;
    if (syncData.folderPrefix) folderPrefixInput.value = syncData.folderPrefix;
    
    // Default autoPush to true if unset
    autoPushCheckbox.checked = localData.autoPush !== false;
  } catch (err) {
    console.error('[CF2GitHub] Failed to load settings:', err);
  }

  // 2. Password visibility toggle
  toggleTokenBtn.addEventListener('click', () => {
    const isPassword = tokenInput.type === 'password';
    tokenInput.type = isPassword ? 'text' : 'password';
    
    // Update SVG icon
    eyeIcon.innerHTML = isPassword
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>`;
  });

  // 3. Save Settings Form Handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const githubToken = tokenInput.value.trim();
    const repoOwner = ownerInput.value.trim();
    const repoName = repoInput.value.trim();
    const branch = branchInput.value.trim() || 'main';
    const folderPrefix = folderPrefixInput.value.trim() || 'Codeforces';
    const autoPush = autoPushCheckbox.checked;

    if (!githubToken || !repoOwner || !repoName) {
      showAlert('Token, Repo Owner, and Repo Name are required.', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({
        githubToken,
        repoOwner,
        repoName,
        branch,
        folderPrefix
      });

      await chrome.storage.local.set({ autoPush });

      showAlert('Settings saved successfully!', 'success');
    } catch (err) {
      console.error('[CF2GitHub] Failed to save settings:', err);
      showAlert(`Error saving settings: ${err.message}`, 'error');
    }
  });

  // 4. Test GitHub Connection Button Handler
  testBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    const owner = ownerInput.value.trim();
    const repo = repoInput.value.trim();

    if (!token || !owner || !repo) {
      showAlert('Please enter GitHub Token, Owner, and Repo Name to test.', 'error');
      return;
    }

    const originalBtnText = testBtn.innerHTML;
    testBtn.disabled = true;
    testBtn.innerHTML = `<span>Testing...</span>`;
    showAlert('Connecting to GitHub API...', 'info');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      clearTimeout(timeoutId);

      testBtn.disabled = false;
      testBtn.innerHTML = originalBtnText;

      if (res.ok) {
        const json = await res.json();
        showAlert(`Connected! Repository '${json.full_name}' found (Default branch: ${json.default_branch}).`, 'success');
      } else if (res.status === 401) {
        showAlert('Connection Failed: Invalid GitHub Personal Access Token.', 'error');
      } else if (res.status === 404) {
        showAlert(`Connection Failed: Repository '${owner}/${repo}' not found. Make sure Repo Owner is your exact GitHub handle (e.g. Tushar8466, not display name) and repo name matches.`, 'error');
      } else {
        const errJson = await res.json().catch(() => ({}));
        showAlert(`Connection Failed: ${errJson.message || 'HTTP ' + res.status}`, 'error');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      testBtn.disabled = false;
      testBtn.innerHTML = originalBtnText;

      if (err.name === 'AbortError') {
        showAlert('Connection Failed: Request timed out (10s). Check network/token.', 'error');
      } else {
        showAlert(`Connection Failed: ${err.message}`, 'error');
      }
    }
  });

  // Helper to show alert messages in popup
  function showAlert(msg, type = 'info') {
    alertBox.className = `alert alert-${type}`;
    alertMessage.textContent = msg;
    alertIcon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  }
});
