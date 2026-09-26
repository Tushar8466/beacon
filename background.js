/**
 * CF2GitHub - Background Service Worker
 * Handles GitHub REST API interactions and settings retrieval.
 */

// Import common utilities into service worker scope
importScripts('common.js');

const { languageToExtension, slugify, utf8ToBase64 } = self.CF2GitHubUtils;

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PUSH_SOLUTION') {
    handlePushSolution(message.data)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message || 'Push failed' }));
    return true; // Keep message channel open for async response
  }

  if (message.type === 'TEST_GITHUB_CONNECTION') {
    handleTestConnection(message.data)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message || 'Connection test failed' }));
    return true;
  }
});

/**
 * Handles pushing solution file and README.md to GitHub repository.
 */
async function handlePushSolution(data) {
  const { submissionId, contestId, problemIndex, problemName, language, code, submissionUrl } = data;

  // 1. Fetch settings from storage.sync
  const settings = await chrome.storage.sync.get(['githubToken', 'repoOwner', 'repoName', 'branch', 'folderPrefix']);
  const token = settings.githubToken ? settings.githubToken.trim() : '';
  const owner = settings.repoOwner ? settings.repoOwner.trim() : '';
  const repo = settings.repoName ? settings.repoName.trim() : '';
  const branch = settings.branch ? settings.branch.trim() : 'main';
  const prefix = settings.folderPrefix ? settings.folderPrefix.trim().replace(/\/+$/, '') : 'Codeforces';

  if (!token || !owner || !repo) {
    return {
      ok: false,
      error: 'GitHub settings incomplete. Please click the extension icon and configure your GitHub token and repository.'
    };
  }

  // 2. Format folder path & filenames
  const slug = slugify(problemName);
  const ext = languageToExtension(language);
  const cleanContest = (contestId || '').toString().trim();
  const cleanIndex = (problemIndex || '').toString().trim();
  const folderName = `${cleanContest}${cleanIndex}-${slug}`;
  const folderPath = prefix ? `${prefix}/${folderName}` : folderName;

  const codeFilePath = `${folderPath}/Solution.${ext}`;
  const readmeFilePath = `${folderPath}/README.md`;

  // 3. Create Solution code file on GitHub
  const commitMsgCode = `Add solution for Codeforces ${cleanContest}${cleanIndex} - ${problemName} [#${submissionId}]`;
  const codeBase64 = utf8ToBase64(code);

  const codePushResult = await pushFileToGitHub({
    token,
    owner,
    repo,
    branch,
    filePath: codeFilePath,
    contentBase64: codeBase64,
    commitMessage: commitMsgCode
  });

  if (!codePushResult.ok) {
    return codePushResult;
  }

  // 4. Create README.md on GitHub
  const problemUrl = cleanContest && cleanIndex 
    ? `https://codeforces.com/contest/${cleanContest}/problem/${cleanIndex}`
    : 'https://codeforces.com';

  const readmeMarkdown = `# Codeforces ${cleanContest}${cleanIndex} - ${problemName}

- **Problem Link**: [${cleanContest}${cleanIndex} - ${problemName}](${problemUrl})
- **Submission ID**: [#${submissionId}](${submissionUrl || problemUrl})
- **Language**: ${language}
- **Verdict**: Accepted

## Solution Code

\`\`\`${ext}
${code}
\`\`\`
`;

  const commitMsgReadme = `Add README for Codeforces ${cleanContest}${cleanIndex} - ${problemName}`;
  const readmeBase64 = utf8ToBase64(readmeMarkdown);

  const readmePushResult = await pushFileToGitHub({
    token,
    owner,
    repo,
    branch,
    filePath: readmeFilePath,
    contentBase64: readmeBase64,
    commitMessage: commitMsgReadme
  });

  if (!readmePushResult.ok) {
    console.warn('[CF2GitHub] Solution pushed, but README creation failed:', readmePushResult.error);
  }

  return { ok: true, filePath: codeFilePath };
}

/**
 * Pushes a single file to GitHub via REST API (Checks existing SHA for updates vs creation).
 */
async function pushFileToGitHub({ token, owner, repo, branch, filePath, contentBase64, commitMessage }) {
  const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  let existingSha = null;

  // 1. Check if file already exists to obtain `sha` for update
  try {
    const getRes = await fetch(getUrl, { headers });
    if (getRes.ok) {
      const getJson = await getRes.json();
      existingSha = getJson.sha;
    } else if (getRes.status !== 404) {
      const errJson = await getRes.json().catch(() => ({}));
      return {
        ok: false,
        error: errJson.message || `GitHub GET API error HTTP ${getRes.status}`
      };
    }
  } catch (err) {
    return { ok: false, error: `Network error reaching GitHub: ${err.message}` };
  }

  // 2. PUT file contents
  const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const body = {
    message: commitMessage,
    content: contentBase64,
    branch: branch
  };

  if (existingSha) {
    body.sha = existingSha;
  }

  try {
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });

    if (putRes.ok) {
      return { ok: true };
    }

    const errorData = await putRes.json().catch(() => ({}));
    let errorMsg = errorData.message || `HTTP ${putRes.status}`;

    if (putRes.status === 401) {
      errorMsg = 'Invalid GitHub Personal Access Token.';
    } else if (putRes.status === 404) {
      errorMsg = `Repository '${owner}/${repo}' or branch '${branch}' not found.`;
    } else if (putRes.status === 422) {
      errorMsg = `GitHub API Validation Error: ${errorData.message || 'File or branch invalid'}`;
    }

    return { ok: false, error: errorMsg };
  } catch (err) {
    return { ok: false, error: `Failed to commit to GitHub: ${err.message}` };
  }
}

/**
 * Tests connection to GitHub repository using user-provided credentials.
 */
async function handleTestConnection(data) {
  const { token, owner, repo } = data;

  if (!token || !owner || !repo) {
    return { ok: false, error: 'Token, Repository Owner, and Repository Name are required.' };
  }

  const url = `https://api.github.com/repos/${owner.trim()}/${repo.trim()}`;
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (res.ok) {
      const json = await res.json();
      return { ok: true, repoName: json.full_name, defaultBranch: json.default_branch };
    }

    if (res.status === 401) {
      return { ok: false, error: 'Authentication failed. Please verify your Personal Access Token.' };
    }
    if (res.status === 404) {
      return { ok: false, error: `Repository '${owner}/${repo}' not found or token lacks access permissions.` };
    }

    const errJson = await res.json().catch(() => ({}));
    return { ok: false, error: errJson.message || `GitHub HTTP Error ${res.status}` };
  } catch (err) {
    return { ok: false, error: `Network error connecting to GitHub: ${err.message}` };
  }
}
