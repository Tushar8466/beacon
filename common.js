/**
 * CF2GitHub - Common Helper Utilities
 * Used across content scripts, background service worker, and popup.
 */

// 1. Language to File Extension Mapping
function languageToExtension(language) {
  if (!language) return 'txt';
  const lang = language.toLowerCase();

  if (lang.includes('c++') || lang.includes('cpp') || lang.includes('clang++') || lang.includes('gnu c++')) {
    return 'cpp';
  }
  if (lang.includes('pypy') || lang.includes('python')) {
    return 'py';
  }
  if (lang.includes('java') && !lang.includes('javascript')) {
    return 'java';
  }
  if (lang.includes('kotlin')) {
    return 'kt';
  }
  if (lang.includes('rust')) {
    return 'rs';
  }
  if (lang.includes('go')) {
    return 'go';
  }
  if (lang.includes('javascript') || lang.includes('node') || lang.includes('v8')) {
    return 'js';
  }
  if (lang.includes('c#') || lang.includes('cs') || lang.includes('mono') || lang.includes('.net')) {
    return 'cs';
  }
  if (lang.includes('gnu c') || lang.includes('c11') || lang.includes('clang c')) {
    return 'c';
  }
  if (lang.includes('haskell')) {
    return 'hs';
  }
  if (lang.includes('ruby')) {
    return 'rb';
  }
  if (lang.includes('scala')) {
    return 'scala';
  }
  if (lang.includes('php')) {
    return 'php';
  }
  if (lang.includes('swift')) {
    return 'swift';
  }
  if (lang.includes('pascal') || lang.includes('fpc')) {
    return 'pas';
  }
  if (lang.includes('d')) {
    return 'd';
  }
  if (lang.includes('ocaml')) {
    return 'ml';
  }

  return 'txt';
}

// 2. Relative Time Checker (Only auto-push recent submissions submitted within ~15 mins)
function isRecentSubmission(timeStr) {
  if (!timeStr) return false;
  const text = timeStr.trim().toLowerCase();

  // "just now", "10 seconds ago", "45 sec ago"
  if (text.includes('just now') || text.includes('sec')) {
    return true;
  }

  // "3 minutes ago", "14 minute ago", "15 minutes ago"
  const minMatch = text.match(/(\d+)\s*min/);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    return !isNaN(mins) && mins <= 15;
  }

  // Hours, days, weeks, months, years, or absolute timestamps are NOT recent
  return false;
}

// 3. String Slugifier for Clean Folder Names
function slugify(text) {
  if (!text) return 'problem';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// 4. Safe UTF-8 Base64 Encoder (handles Unicode/non-ASCII characters without throwing)
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// 5. Shared Toast Notification Helper (Injected into web pages)
function showToast(message, type = 'success', duration = 4500) {
  let container = document.getElementById('cf2github-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cf2github-toast-container';
    container.className = 'cf2github-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `cf2github-toast cf2github-toast-${type}`;

  const icon = document.createElement('span');
  icon.className = 'cf2github-toast-icon';
  icon.innerHTML = type === 'success' ? '✓' : type === 'info' ? 'ℹ' : '✕';

  const content = document.createElement('div');
  content.className = 'cf2github-toast-content';
  content.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(content);
  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('cf2github-toast-show');
  });

  setTimeout(() => {
    toast.classList.remove('cf2github-toast-show');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, duration);
}

// Make functions available in Service Worker / Node / Window environments
if (typeof self !== 'undefined') {
  self.CF2GitHubUtils = {
    languageToExtension,
    isRecentSubmission,
    slugify,
    utf8ToBase64,
    showToast
  };
}
