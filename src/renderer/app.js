// Dashboard UI Logic
const { ipcRenderer } = require('electron');

// DOM Elements
const statusBanner = document.getElementById('statusBanner');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');
const statusAction = document.getElementById('statusAction');

// Profile Card Elements
const profileBadge = document.getElementById('profileBadge');
const vaultPath = document.getElementById('vaultPath');
const statJobs = document.getElementById('statJobs');
const statSkills = document.getElementById('statSkills');
const statAccomp = document.getElementById('statAccomp');
const uploadResumeBtn = document.getElementById('uploadResumeBtn');
const resumeFileInput = document.getElementById('resumeFileInput');

// Quick Optimize Elements
const quickJobUrl = document.getElementById('quickJobUrl');
const quickJobDesc = document.getElementById('quickJobDesc');
const quickOptimizeBtn = document.getElementById('quickOptimizeBtn');

// Queue Card Elements
const queueBadge = document.getElementById('queueBadge');
const queueList = document.getElementById('queueList');
const processQueueBtn = document.getElementById('processQueueBtn');

// Career Agent Elements
const quickActions = document.querySelectorAll('.quick-action');

// Job Search Elements
const jobSearchTitle = document.getElementById('jobSearchTitle');
const jobSearchLocation = document.getElementById('jobSearchLocation');
const searchJobsBtn = document.getElementById('searchJobsBtn');

// Recent Activity Elements
const recentActivity = document.getElementById('recentActivity');

// Continue Banner Elements
const continueBanner = document.getElementById('continueBanner');
const continueText = document.getElementById('continueText');
const continueBtn = document.getElementById('continueBtn');
const dismissContinueBtn = document.getElementById('dismissContinueBtn');

// State
let profileData = null;
let queueData = [];

// =============================================================================
// Initialization
// =============================================================================

async function initDashboard() {
  // Check API key configuration first
  await checkApiKeyStatus();

  // Check for incomplete workflows
  await checkContinueWorkflow();

  // Load all dashboard data in parallel
  await Promise.all([
    loadProfileStatus(),
    loadQueueStatus(),
    loadRecentActivity()
  ]);
}

// =============================================================================
// API Key Status Check
// =============================================================================

async function checkApiKeyStatus() {
  try {
    const result = await ipcRenderer.invoke('check-api-key-configured');

    if (!result.configured) {
      showStatusBanner(
        'warning',
        'API key not configured. Some features require an API key to work.',
        'Configure API Key',
        './settings.html'
      );
    }
  } catch (error) {
    console.error('Error checking API key status:', error);
  }
}

// =============================================================================
// Continue Workflow Banner
// =============================================================================

async function checkContinueWorkflow() {
  try {
    const result = await ipcRenderer.invoke('app-state-get-continue-info');

    if (result.success && result.info && result.info.hasIncompleteWorkflow) {
      const info = result.info;
      showContinueBanner(info);
    }
  } catch (error) {
    console.error('Error checking continue workflow:', error);
  }
}

function showContinueBanner(info) {
  const typeLabels = {
    optimizer: 'Resume Optimization',
    chat: 'Career Chat',
    queue: 'Job Queue'
  };

  const pageUrls = {
    optimizer: './optimizer.html',
    chat: './chat.html',
    queue: './queue.html'
  };

  const label = typeLabels[info.workflowType] || 'Workflow';
  const timeAgo = formatTimeAgo(info.updatedAt);

  continueText.innerHTML = `<strong>Continue ${label}</strong> &mdash; You have an incomplete workflow from ${timeAgo}`;
  continueBanner.style.display = 'flex';

  // Set up continue button
  continueBtn.onclick = () => {
    window.location.href = pageUrls[info.workflowType] || './optimizer.html';
  };

  // Set up dismiss button
  dismissContinueBtn.onclick = async () => {
    try {
      await ipcRenderer.invoke('app-state-clear-workflow');
      continueBanner.style.display = 'none';
    } catch (error) {
      console.error('Error dismissing workflow:', error);
    }
  };
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'earlier';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// =============================================================================
// Profile Status
// =============================================================================

async function loadProfileStatus() {
  try {
    // Get vault path
    const vault = await ipcRenderer.invoke('get-vault-path');

    if (vault) {
      vaultPath.textContent = vault;
      vaultPath.classList.remove('not-set');
    } else {
      vaultPath.textContent = 'No vault configured - click to set up';
      vaultPath.classList.add('not-set');
      vaultPath.style.cursor = 'pointer';
      vaultPath.onclick = selectVaultPath;
    }

    // Get resume content stats from vault
    const preview = await ipcRenderer.invoke('optimizer-get-resume-preview');

    if (preview.success && preview.metadata) {
      const meta = preview.metadata;
      statJobs.textContent = meta.jobEntries || 0;
      statSkills.textContent = meta.skills || 0;
      statAccomp.textContent = meta.accomplishments || 0;

      const totalItems = (meta.jobEntries || 0) + (meta.skills || 0) + (meta.accomplishments || 0);

      if (totalItems > 0) {
        profileBadge.textContent = `${totalItems} items`;
        profileBadge.className = 'card-badge badge-success';
      } else {
        profileBadge.textContent = 'Empty';
        profileBadge.className = 'card-badge badge-warning';
      }

      profileData = preview;
    } else {
      statJobs.textContent = '0';
      statSkills.textContent = '0';
      statAccomp.textContent = '0';
      profileBadge.textContent = 'No data';
      profileBadge.className = 'card-badge badge-warning';
    }
  } catch (error) {
    console.error('Error loading profile status:', error);
    profileBadge.textContent = 'Error';
    profileBadge.className = 'card-badge badge-warning';
  }
}

async function selectVaultPath() {
  try {
    const result = await ipcRenderer.invoke('select-vault-path');
    if (result.success) {
      vaultPath.textContent = result.path;
      vaultPath.classList.remove('not-set');
      vaultPath.style.cursor = 'default';
      vaultPath.onclick = null;

      // Reload profile data
      await loadProfileStatus();
    }
  } catch (error) {
    console.error('Error selecting vault path:', error);
  }
}

// =============================================================================
// Queue Status
// =============================================================================

async function loadQueueStatus() {
  try {
    const status = await ipcRenderer.invoke('job-queue-status');
    const jobs = await ipcRenderer.invoke('job-queue-list');

    queueData = jobs || [];

    // Update badge
    const pending = status?.pendingJobs || 0;
    queueBadge.textContent = `${pending} pending`;

    // Update process button
    processQueueBtn.disabled = pending === 0;

    // Render queue list (show max 5)
    renderQueueList(jobs.slice(0, 5));
  } catch (error) {
    console.error('Error loading queue status:', error);
    queueBadge.textContent = 'Error';
  }
}

function renderQueueList(jobs) {
  // Clear existing content
  queueList.textContent = '';

  if (!jobs || jobs.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';

    const emptyIcon = document.createElement('div');
    emptyIcon.className = 'empty-state-icon';
    emptyIcon.textContent = '\u{1F4C4}'; // Document emoji

    const emptyText = document.createElement('div');
    emptyText.className = 'empty-state-text';
    emptyText.textContent = 'No jobs in queue';

    emptyState.appendChild(emptyIcon);
    emptyState.appendChild(emptyText);
    queueList.appendChild(emptyState);
    return;
  }

  jobs.forEach(job => {
    const item = document.createElement('div');
    item.className = 'queue-item';

    const info = document.createElement('div');
    info.className = 'queue-item-info';

    const title = document.createElement('div');
    title.className = 'queue-item-title';
    title.textContent = job.title || 'Untitled';

    const company = document.createElement('div');
    company.className = 'queue-item-company';
    company.textContent = job.company || 'Unknown company';

    info.appendChild(title);
    info.appendChild(company);

    const status = document.createElement('span');
    status.className = `queue-item-status status-${job.status || 'pending'}`;
    status.textContent = job.status || 'pending';

    item.appendChild(info);
    item.appendChild(status);
    queueList.appendChild(item);
  });
}

// =============================================================================
// Recent Activity
// =============================================================================

async function loadRecentActivity() {
  try {
    const jobs = await ipcRenderer.invoke('job-queue-list');

    // Filter completed jobs and take most recent 5
    const completed = (jobs || [])
      .filter(j => j.status === 'completed' && j.result)
      .sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt))
      .slice(0, 5);

    // Clear existing content
    recentActivity.textContent = '';

    if (completed.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';

      const emptyIcon = document.createElement('div');
      emptyIcon.className = 'empty-state-icon';
      emptyIcon.textContent = '\u{1F4CA}'; // Chart emoji

      const emptyText = document.createElement('div');
      emptyText.className = 'empty-state-text';
      emptyText.textContent = 'No recent optimizations';

      emptyState.appendChild(emptyIcon);
      emptyState.appendChild(emptyText);
      recentActivity.appendChild(emptyState);
      return;
    }

    completed.forEach(job => {
      const score = job.result?.finalScore || 0;
      const scoreClass = score >= 0.75 ? 'score-high' : score >= 0.5 ? 'score-medium' : 'score-low';

      const item = document.createElement('li');
      item.className = 'activity-item';

      const dot = document.createElement('span');
      dot.className = `activity-dot ${scoreClass}`;

      const text = document.createElement('span');
      text.className = 'activity-text';
      text.textContent = `${job.title} at ${job.company}`;

      const scoreDisplay = document.createElement('span');
      scoreDisplay.className = 'activity-score';
      scoreDisplay.textContent = `${Math.round(score * 100)}%`;

      item.appendChild(dot);
      item.appendChild(text);
      item.appendChild(scoreDisplay);
      recentActivity.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading recent activity:', error);
  }
}

// =============================================================================
// Status Banner
// =============================================================================

function showStatusBanner(type, text, actionText, actionHref) {
  statusBanner.style.display = 'flex';
  statusBanner.className = `status-banner ${type === 'success' ? 'success' : type === 'error' ? 'error' : ''}`;

  statusIcon.textContent = type === 'success' ? '\u2713' : type === 'error' ? '\u2717' : '\u26A0';
  statusText.textContent = text;
  statusAction.textContent = actionText;
  statusAction.href = actionHref;
}

function hideStatusBanner() {
  statusBanner.style.display = 'none';
}

// =============================================================================
// Event Handlers
// =============================================================================

// Upload Resume Button - Use native dialog
uploadResumeBtn.addEventListener('click', async () => {
  try {
    const result = await ipcRenderer.invoke('select-resume-file');

    if (result.success) {
      uploadResumeBtn.disabled = true;
      uploadResumeBtn.textContent = 'Processing...';

      // Process the resume
      await ipcRenderer.invoke('process-resume', {
        name: result.name,
        path: result.path
      });

      // The main process will navigate to review.html on success
    }
  } catch (error) {
    console.error('Error uploading resume:', error);
    showStatusBanner('error', `Failed to process resume: ${error.message}`, 'Try Again', '#');
    uploadResumeBtn.disabled = false;
    uploadResumeBtn.textContent = 'Upload Resume';
  }
});

// Quick Optimize Button
quickOptimizeBtn.addEventListener('click', async () => {
  const jobTitle = quickJobUrl.value.trim();
  const jobDesc = quickJobDesc.value.trim();

  if (!jobDesc && !jobTitle) {
    showStatusBanner('error', 'Please enter a job title or description', 'Dismiss', '#');
    statusAction.onclick = (e) => { e.preventDefault(); hideStatusBanner(); };
    return;
  }

  // Check if we have resume data
  if (!profileData || !profileData.success) {
    showStatusBanner('error', 'No resume data found. Please upload a resume first.', 'Upload Resume', '#');
    statusAction.onclick = (e) => {
      e.preventDefault();
      hideStatusBanner();
      uploadResumeBtn.click();
    };
    return;
  }

  // Store job data and navigate to optimizer
  sessionStorage.setItem('quickOptimize', JSON.stringify({
    title: jobTitle || 'Job Position',
    description: jobDesc
  }));

  window.location.href = './optimizer.html';
});

// Process Queue Button
processQueueBtn.addEventListener('click', async () => {
  processQueueBtn.disabled = true;
  processQueueBtn.textContent = 'Processing...';

  try {
    const result = await ipcRenderer.invoke('job-queue-process-all');

    if (result.success) {
      showStatusBanner(
        'success',
        `Processed ${result.summary.processed} jobs: ${result.summary.succeeded} succeeded, ${result.summary.failed} failed`,
        'View Results',
        './queue.html'
      );
    }
  } catch (error) {
    console.error('Error processing queue:', error);
    showStatusBanner('error', `Queue processing failed: ${error.message}`, 'Try Again', '#');
  } finally {
    processQueueBtn.disabled = false;
    processQueueBtn.textContent = 'Process All';

    // Reload queue and activity
    await loadQueueStatus();
    await loadRecentActivity();
  }
});

// Quick Actions (Career Agent)
quickActions.forEach(btn => {
  btn.addEventListener('click', () => {
    const prompt = btn.dataset.prompt;
    if (prompt) {
      sessionStorage.setItem('chatPrompt', prompt);
      window.location.href = './chat.html';
    }
  });
});

// Job Search Button
searchJobsBtn.addEventListener('click', async () => {
  const title = jobSearchTitle.value.trim();
  const location = jobSearchLocation.value.trim();

  if (!title) {
    showStatusBanner('error', 'Please enter a job title or keywords', 'Dismiss', '#');
    statusAction.onclick = (e) => { e.preventDefault(); hideStatusBanner(); };
    return;
  }

  // Store search params and navigate to job search page
  sessionStorage.setItem('jobSearch', JSON.stringify({
    title,
    location
  }));

  window.location.href = './job-search.html';
});

// Listen for queue progress events from main process
ipcRenderer.on('queue-progress', (event, progress) => {
  const { processed, total, current } = progress;

  if (current) {
    processQueueBtn.textContent = `Processing ${processed}/${total}...`;
  }

  // Update queue badge
  queueBadge.textContent = `${total - processed} pending`;
});

// =============================================================================
// Initialize on Load
// =============================================================================

document.addEventListener('DOMContentLoaded', initDashboard);
