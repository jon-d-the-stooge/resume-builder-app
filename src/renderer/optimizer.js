/**
 * ATS Optimizer UI Logic
 *
 * Handles state management, IPC communication with main process,
 * and UI updates for the resume optimizer screen.
 */

const { ipcRenderer } = require('electron');

// ============================================================================
// State Management
// ============================================================================

const state = {
  resume: {
    content: null,
    source: null, // 'vault' or 'upload'
    filename: null
  },
  job: {
    title: '',
    company: '',
    description: ''
  },
  results: null,
  isOptimizing: false,
  // Queue state
  queue: {
    jobs: [],
    isProcessing: false
  }
};

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  // Resume input
  loadVaultBtn: document.getElementById('loadVaultBtn'),
  uploadResumeBtn: document.getElementById('uploadResumeBtn'),
  resumeFileInput: document.getElementById('resumeFileInput'),
  resumePreview: document.getElementById('resumePreview'),

  // Job input
  jobTitle: document.getElementById('jobTitle'),
  jobCompany: document.getElementById('jobCompany'),
  jobDescription: document.getElementById('jobDescription'),

  // Actions
  optimizeBtn: document.getElementById('optimizeBtn'),
  addToQueueBtn: document.getElementById('addToQueueBtn'),
  exportBtn: document.getElementById('exportBtn'),
  exportDropdown: document.getElementById('exportDropdown'),
  exportMarkdownBtn: document.getElementById('exportMarkdownBtn'),
  exportPdfBtn: document.getElementById('exportPdfBtn'),
  exportWordBtn: document.getElementById('exportWordBtn'),
  saveVaultBtn: document.getElementById('saveVaultBtn'),
  startNewBtn: document.getElementById('startNewBtn'),

  // Sections
  progressSection: document.getElementById('progressSection'),
  resultsSection: document.getElementById('resultsSection'),
  errorMessage: document.getElementById('errorMessage'),

  // Progress
  progressRound: document.getElementById('progressRound'),
  progressBarFill: document.getElementById('progressBarFill'),
  progressStage: document.getElementById('progressStage'),

  // Results
  scoreBefore: document.getElementById('scoreBefore'),
  scoreAfter: document.getElementById('scoreAfter'),
  scoreImprovement: document.getElementById('scoreImprovement'),
  scoreBarBefore: document.getElementById('scoreBarBefore'),
  scoreBarAfter: document.getElementById('scoreBarAfter'),
  strengthsList: document.getElementById('strengthsList'),
  gapsList: document.getElementById('gapsList'),
  recommendationsList: document.getElementById('recommendationsList'),

  // Resume comparison
  sideBySideView: document.getElementById('sideBySideView'),
  beforeView: document.getElementById('beforeView'),
  afterView: document.getElementById('afterView'),
  resumeOriginalSbs: document.getElementById('resumeOriginalSbs'),
  resumeOptimizedSbs: document.getElementById('resumeOptimizedSbs'),

  // Queue elements
  queueSection: document.getElementById('queueSection'),
  queuePendingCount: document.getElementById('queuePendingCount'),
  queueProcessingCount: document.getElementById('queueProcessingCount'),
  queueCompletedCount: document.getElementById('queueCompletedCount'),
  queueFailedCount: document.getElementById('queueFailedCount'),
  queueProgressSection: document.getElementById('queueProgressSection'),
  queueProgressCount: document.getElementById('queueProgressCount'),
  queueProgressFill: document.getElementById('queueProgressFill'),
  queueProgressCurrent: document.getElementById('queueProgressCurrent'),
  queueTableBody: document.getElementById('queueTableBody'),
  processAllBtn: document.getElementById('processAllBtn'),
  clearCompletedBtn: document.getElementById('clearCompletedBtn')
};

// ============================================================================
// Event Listeners
// ============================================================================

function initializeEventListeners() {
  // Resume loading
  elements.loadVaultBtn.addEventListener('click', handleLoadFromVault);
  // Use native dialog instead of HTML5 file input (HTML5 doesn't provide file.path)
  elements.uploadResumeBtn.addEventListener('click', handleFileUploadWithDialog);

  // Job input changes
  elements.jobTitle.addEventListener('input', updateOptimizeButtonState);
  elements.jobCompany.addEventListener('input', updateOptimizeButtonState);
  elements.jobDescription.addEventListener('input', updateOptimizeButtonState);

  // Actions
  elements.optimizeBtn.addEventListener('click', handleOptimize);
  elements.addToQueueBtn.addEventListener('click', handleAddToQueue);
  elements.exportBtn.addEventListener('click', toggleExportDropdown);
  elements.exportMarkdownBtn.addEventListener('click', () => handleExport('markdown'));
  elements.exportPdfBtn.addEventListener('click', () => handleExport('pdf'));
  elements.exportWordBtn.addEventListener('click', () => handleExport('word'));
  elements.saveVaultBtn.addEventListener('click', handleSaveToVault);
  elements.startNewBtn.addEventListener('click', handleStartNew);

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.exportBtn.contains(e.target) && !elements.exportDropdown.contains(e.target)) {
      elements.exportDropdown.classList.remove('show');
    }
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', handleTabSwitch);
  });

  // Queue actions
  elements.processAllBtn.addEventListener('click', handleProcessAll);
  elements.clearCompletedBtn.addEventListener('click', handleClearCompleted);

  // IPC event listeners
  ipcRenderer.on('optimizer-progress', handleProgressUpdate);
  ipcRenderer.on('queue-progress', handleQueueProgressUpdate);
}

// ============================================================================
// Resume Loading
// ============================================================================

async function handleLoadFromVault() {
  try {
    showLoading(elements.loadVaultBtn, 'Loading...');

    const result = await ipcRenderer.invoke('optimizer-get-resume-preview');

    if (result.success && result.content) {
      state.resume.content = result.content;
      state.resume.source = 'vault';
      state.resume.filename = 'Vault Resume';

      updateResumePreview();
      updateOptimizeButtonState();
    } else {
      showError(result.error || 'No resume content found in vault. Please upload a resume first.');
    }
  } catch (error) {
    showError('Failed to load resume from vault: ' + error.message);
  } finally {
    hideLoading(elements.loadVaultBtn, 'Load from Vault');
  }
}

// Use native Electron dialog to select resume file (HTML5 file input doesn't provide file.path)
async function handleFileUploadWithDialog() {
  try {
    const fileResult = await ipcRenderer.invoke('select-resume-file');
    if (!fileResult.success) {
      return; // User canceled
    }

    const fileName = fileResult.name;
    const filePath = fileResult.path;

    // For text/markdown files, we can read directly via IPC
    if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      showLoading(elements.uploadResumeBtn, 'Processing...');

      const result = await ipcRenderer.invoke('optimizer-extract-file', {
        path: filePath,
        name: fileName
      });

      if (result.success && result.content) {
        state.resume.content = result.content;
        state.resume.source = 'upload';
        state.resume.filename = fileName;
        updateResumePreview();
        updateOptimizeButtonState();
      } else {
        showError(result.error || 'Failed to read file');
      }

      hideLoading(elements.uploadResumeBtn, 'Upload New');
    } else {
      // For PDF/DOCX, send to main process for extraction
      showLoading(elements.uploadResumeBtn, 'Processing...');

      const result = await ipcRenderer.invoke('optimizer-extract-file', {
        path: filePath,
        name: fileName
      });

      if (result.success && result.content) {
        state.resume.content = result.content;
        state.resume.source = 'upload';
        state.resume.filename = fileName;
        updateResumePreview();
        updateOptimizeButtonState();
      } else {
        showError(result.error || 'Failed to extract content from file');
      }

      hideLoading(elements.uploadResumeBtn, 'Upload New');
    }
  } catch (error) {
    showError('Failed to process file: ' + error.message);
    hideLoading(elements.uploadResumeBtn, 'Upload New');
  }
}

function updateResumePreview() {
  if (state.resume.content) {
    elements.resumePreview.classList.remove('empty');
    elements.resumePreview.textContent = state.resume.content;
  } else {
    elements.resumePreview.classList.add('empty');
    elements.resumePreview.textContent = 'No resume loaded. Load from your vault or upload a file.';
  }
}

// ============================================================================
// Optimization
// ============================================================================

function updateOptimizeButtonState() {
  const hasResume = !!state.resume.content;
  const hasJobDescription = elements.jobDescription.value.trim().length > 50;

  elements.optimizeBtn.disabled = !hasResume || !hasJobDescription || state.isOptimizing;
}

async function handleOptimize() {
  if (state.isOptimizing) return;

  try {
    state.isOptimizing = true;
    hideError();
    showProgress();

    elements.optimizeBtn.disabled = true;
    setButtonLoading(elements.optimizeBtn, 'Optimizing...');

    const jobPosting = {
      id: `job-${Date.now()}`,
      title: elements.jobTitle.value.trim() || 'Job Position',
      company: elements.jobCompany.value.trim() || 'Company',
      description: elements.jobDescription.value.trim(),
      requirements: '',
      qualifications: ''
    };

    const resume = {
      id: 'user-resume',
      content: state.resume.content,
      format: 'markdown'
    };

    const result = await ipcRenderer.invoke('optimizer-optimize', {
      jobPosting,
      resume
    });

    if (result.success) {
      state.results = result.data;
      displayResults(result.data);
    } else {
      showError(result.error || 'Optimization failed');
    }
  } catch (error) {
    showError('Optimization failed: ' + error.message);
  } finally {
    state.isOptimizing = false;
    elements.optimizeBtn.disabled = false;
    elements.optimizeBtn.textContent = 'Optimize Resume';
    hideProgress();
  }
}

// ============================================================================
// Add to Queue
// ============================================================================

async function handleAddToQueue() {
  const jobTitle = elements.jobTitle.value.trim();
  const jobCompany = elements.jobCompany.value.trim();
  const jobDescription = elements.jobDescription.value.trim();

  if (!jobTitle || !jobDescription) {
    showError('Please enter job title and description to add to queue');
    return;
  }

  try {
    showLoading(elements.addToQueueBtn, 'Adding...');

    const result = await ipcRenderer.invoke('job-queue-add', {
      title: jobTitle,
      company: jobCompany || 'Unknown',
      description: jobDescription
    });

    if (result.success) {
      showSuccess(`Added "${jobTitle}" to queue`);
      // Refresh the queue display
      await loadQueueData();
      // Clear the form fields for next entry
      elements.jobTitle.value = '';
      elements.jobCompany.value = '';
      elements.jobDescription.value = '';
    } else {
      showError(result.error || 'Failed to add to queue');
    }
  } catch (error) {
    showError('Failed to add to queue: ' + error.message);
  } finally {
    hideLoading(elements.addToQueueBtn, 'Add to Queue');
  }
}

// ============================================================================
// Queue Management
// ============================================================================

async function loadQueueData() {
  try {
    const status = await ipcRenderer.invoke('job-queue-status');
    state.queue.jobs = await ipcRenderer.invoke('job-queue-list');

    updateQueueStatusCards(status);
    renderQueueTable(state.queue.jobs);
    updateProcessAllButton(status);
  } catch (error) {
    console.error('Error loading queue data:', error);
  }
}

function updateQueueStatusCards(status) {
  elements.queuePendingCount.textContent = status?.pendingJobs || 0;
  elements.queueProcessingCount.textContent = status?.processingJobs || 0;
  elements.queueCompletedCount.textContent = status?.completedJobs || 0;
  elements.queueFailedCount.textContent = status?.failedJobs || 0;
}

function updateProcessAllButton(status) {
  const hasPending = (status?.pendingJobs || 0) > 0;
  elements.processAllBtn.disabled = !hasPending || state.queue.isProcessing;
}

function renderQueueTable(jobs) {
  clearElement(elements.queueTableBody);

  if (!jobs || jobs.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 5;

    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'queue-empty';

    const icon = document.createElement('div');
    icon.className = 'queue-empty-icon';
    icon.textContent = '\u{1F4CB}';

    const text = document.createElement('div');
    text.className = 'queue-empty-text';
    text.textContent = 'No jobs in queue. Add jobs using the form above.';

    emptyDiv.appendChild(icon);
    emptyDiv.appendChild(text);
    emptyCell.appendChild(emptyDiv);
    emptyRow.appendChild(emptyCell);
    elements.queueTableBody.appendChild(emptyRow);
    return;
  }

  jobs.forEach(job => {
    const row = document.createElement('tr');

    // Job info cell
    const jobCell = document.createElement('td');
    const titleDiv = document.createElement('div');
    titleDiv.className = 'queue-job-title';
    titleDiv.textContent = job.title || 'Untitled';
    const companyDiv = document.createElement('div');
    companyDiv.className = 'queue-job-company';
    companyDiv.textContent = job.company || 'Unknown company';
    jobCell.appendChild(titleDiv);
    jobCell.appendChild(companyDiv);

    // Status cell
    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `queue-status-badge ${job.status || 'pending'}`;
    statusBadge.textContent = job.status || 'pending';
    statusCell.appendChild(statusBadge);

    // Score cell
    const scoreCell = document.createElement('td');
    if (job.status === 'completed' && job.result) {
      const score = job.result.finalScore || 0;
      const scoreSpan = document.createElement('span');
      scoreSpan.className = `queue-score ${score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low'}`;
      scoreSpan.textContent = `${Math.round(score * 100)}%`;
      scoreCell.appendChild(scoreSpan);
    } else {
      scoreCell.textContent = '-';
      scoreCell.style.color = '#999';
    }

    // Added date cell
    const dateCell = document.createElement('td');
    dateCell.textContent = formatQueueDate(job.addedAt);
    dateCell.style.color = '#666';
    dateCell.style.fontSize = '12px';

    // Actions cell
    const actionsCell = document.createElement('td');

    if (job.status === 'completed') {
      const viewBtn = document.createElement('button');
      viewBtn.className = 'queue-action-btn view';
      viewBtn.textContent = 'View';
      viewBtn.onclick = () => viewQueueJobResult(job);
      actionsCell.appendChild(viewBtn);
    }

    if (job.status !== 'processing') {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'queue-action-btn remove';
      removeBtn.textContent = 'Remove';
      removeBtn.onclick = () => removeQueueJob(job.id);
      actionsCell.appendChild(removeBtn);
    }

    row.appendChild(jobCell);
    row.appendChild(statusCell);
    row.appendChild(scoreCell);
    row.appendChild(dateCell);
    row.appendChild(actionsCell);
    elements.queueTableBody.appendChild(row);
  });
}

function formatQueueDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function handleProcessAll() {
  if (state.queue.isProcessing) return;

  state.queue.isProcessing = true;
  elements.processAllBtn.disabled = true;
  elements.processAllBtn.textContent = 'Processing...';
  elements.queueProgressSection.classList.add('visible');

  try {
    const result = await ipcRenderer.invoke('job-queue-process-all');

    if (result.success) {
      showSuccess(`Processed ${result.summary?.processed || 0} jobs`);
    } else {
      showError(result.error || 'Queue processing failed');
    }
  } catch (error) {
    showError('Error processing queue: ' + error.message);
  } finally {
    state.queue.isProcessing = false;
    elements.processAllBtn.textContent = 'Process All';
    elements.queueProgressSection.classList.remove('visible');
    await loadQueueData();
  }
}

function handleQueueProgressUpdate(event, progress) {
  const { processed, total, current } = progress;

  elements.queueProgressCount.textContent = `${processed}/${total}`;
  elements.queueProgressFill.style.width = `${(processed / total) * 100}%`;

  if (current) {
    elements.queueProgressCurrent.textContent = `Processing: ${current.title} at ${current.company}`;
  }
}

async function removeQueueJob(jobId) {
  try {
    await ipcRenderer.invoke('job-queue-remove', jobId);
    await loadQueueData();
  } catch (error) {
    showError('Error removing job: ' + error.message);
  }
}

async function handleClearCompleted() {
  try {
    await ipcRenderer.invoke('job-queue-clear-finished');
    await loadQueueData();
  } catch (error) {
    showError('Error clearing completed jobs: ' + error.message);
  }
}

function viewQueueJobResult(job) {
  if (job && job.result) {
    const score = Math.round((job.result.finalScore || 0) * 100);
    const matchedSkills = job.result.matchedSkills?.length || 0;
    const gaps = job.result.gaps?.length || 0;

    alert(
      `Job: ${job.title} at ${job.company}\n\n` +
      `Score: ${score}%\n` +
      `Matched Skills: ${matchedSkills}\n` +
      `Gaps: ${gaps}`
    );
  }
}

// ============================================================================
// Progress Updates
// ============================================================================

function showProgress() {
  elements.progressSection.classList.add('visible');
  elements.resultsSection.classList.remove('visible');
  updateProgress(0, 'Starting optimization...', 1, 3);
}

function hideProgress() {
  elements.progressSection.classList.remove('visible');
}

function handleProgressUpdate(event, data) {
  updateProgress(data.percent, data.stage, data.round, data.totalRounds);
}

function updateProgress(percent, stage, round, totalRounds) {
  elements.progressBarFill.style.width = `${percent}%`;
  elements.progressStage.textContent = stage;
  elements.progressRound.textContent = `Round ${round}/${totalRounds}`;
}

// ============================================================================
// Results Display
// ============================================================================

function displayResults(results) {
  elements.resultsSection.classList.add('visible');

  // Score display
  const initialFit = results.initialFit || 0;
  const finalFit = results.finalFit || 0;
  const improvement = results.improvement || (finalFit - initialFit);

  elements.scoreBefore.textContent = `${Math.round(initialFit * 100)}%`;
  elements.scoreAfter.textContent = `${Math.round(finalFit * 100)}%`;
  elements.scoreImprovement.textContent = improvement >= 0
    ? `+${Math.round(improvement * 100)}%`
    : `${Math.round(improvement * 100)}%`;

  elements.scoreBarBefore.style.width = `${initialFit * 100}%`;
  elements.scoreBarAfter.style.width = `${finalFit * 100}%`;

  // Get analysis from last iteration
  const lastIteration = results.iterations?.[results.iterations.length - 1];
  const analysis = lastIteration?.analysis || {};

  // Strengths - using safe DOM methods
  clearElement(elements.strengthsList);
  const strengths = analysis.strengths || [];
  if (strengths.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No strengths identified';
    elements.strengthsList.appendChild(li);
  } else {
    strengths.forEach(strength => {
      const li = document.createElement('li');
      li.textContent = strength;
      elements.strengthsList.appendChild(li);
    });
  }

  // Gaps - using safe DOM methods
  clearElement(elements.gapsList);
  const gaps = analysis.gaps || [];
  if (gaps.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No gaps identified';
    elements.gapsList.appendChild(li);
  } else {
    gaps.forEach(gap => {
      const li = document.createElement('li');
      li.textContent = gap;
      elements.gapsList.appendChild(li);
    });
  }

  // Recommendations - using safe DOM methods
  clearElement(elements.recommendationsList);
  const recommendations = analysis.recommendations || [];
  if (recommendations.length === 0) {
    const div = document.createElement('div');
    div.className = 'recommendation-item';
    div.textContent = 'No recommendations at this time';
    elements.recommendationsList.appendChild(div);
  } else {
    recommendations.forEach(rec => {
      const div = document.createElement('div');
      div.className = 'recommendation-item';

      const prioritySpan = document.createElement('span');
      prioritySpan.className = `recommendation-priority priority-${rec.priority || 'medium'}`;
      prioritySpan.textContent = rec.priority || 'medium';
      div.appendChild(prioritySpan);

      const textDiv = document.createElement('div');
      textDiv.className = 'recommendation-text';
      textDiv.textContent = rec.suggestedReframe || rec.suggestion || '';
      div.appendChild(textDiv);

      if (rec.rationale) {
        const rationaleDiv = document.createElement('div');
        rationaleDiv.className = 'recommendation-rationale';
        rationaleDiv.textContent = rec.rationale;
        div.appendChild(rationaleDiv);
      }

      elements.recommendationsList.appendChild(div);
    });
  }

  // Resume comparison
  const originalContent = state.resume.content || '';
  const optimizedContent = results.finalResume?.content || originalContent;

  elements.resumeOriginalSbs.textContent = originalContent;
  elements.resumeOptimizedSbs.textContent = optimizedContent;
  elements.beforeView.textContent = originalContent;
  elements.afterView.textContent = optimizedContent;
}

// ============================================================================
// Tab Switching
// ============================================================================

function handleTabSwitch(event) {
  const tab = event.target.dataset.tab;

  // Update active tab
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Show appropriate content
  elements.sideBySideView.classList.toggle('visible', tab === 'side-by-side');
  elements.beforeView.classList.toggle('visible', tab === 'before');
  elements.afterView.classList.toggle('visible', tab === 'after');
}

// ============================================================================
// Export & Save
// ============================================================================

function toggleExportDropdown(e) {
  e.stopPropagation();
  elements.exportDropdown.classList.toggle('show');
}

async function handleExport(format) {
  elements.exportDropdown.classList.remove('show');

  if (!state.results?.finalResume?.content) {
    showError('No optimized resume to export');
    return;
  }

  const content = state.results.finalResume.content;
  const timestamp = Date.now();

  try {
    showLoading(elements.exportBtn, 'Exporting...');

    let result;

    if (format === 'pdf') {
      result = await ipcRenderer.invoke('optimizer-export-pdf', {
        content,
        filename: `optimized-resume-${timestamp}.pdf`
      });
    } else if (format === 'word') {
      result = await ipcRenderer.invoke('optimizer-export-word', {
        content,
        filename: `optimized-resume-${timestamp}.docx`
      });
    } else {
      // Default to markdown
      result = await ipcRenderer.invoke('optimizer-export', {
        content,
        format: 'markdown',
        filename: `optimized-resume-${timestamp}.md`
      });
    }

    if (!result.success && !result.canceled) {
      showError(result.error || 'Export failed');
    }
  } catch (error) {
    showError('Export failed: ' + error.message);
  } finally {
    hideLoading(elements.exportBtn, 'Export Resume ▼');
  }
}

async function handleSaveToVault() {
  if (!state.results?.finalResume?.content) {
    showError('No optimized resume to save');
    return;
  }

  try {
    showLoading(elements.saveVaultBtn, 'Saving...');

    const result = await ipcRenderer.invoke('optimizer-save-to-vault', {
      content: state.results.finalResume.content,
      jobTitle: elements.jobTitle.value.trim(),
      company: elements.jobCompany.value.trim()
    });

    if (result.success) {
      alert('Resume saved to vault successfully!');
    } else {
      showError(result.error || 'Failed to save to vault');
    }
  } catch (error) {
    showError('Save failed: ' + error.message);
  } finally {
    hideLoading(elements.saveVaultBtn, 'Save to Vault');
  }
}

function handleStartNew() {
  // Reset state
  state.resume = { content: null, source: null, filename: null };
  state.results = null;

  // Reset UI
  elements.resumePreview.classList.add('empty');
  elements.resumePreview.textContent = 'No resume loaded. Load from your vault or upload a file.';
  elements.jobTitle.value = '';
  elements.jobCompany.value = '';
  elements.jobDescription.value = '';

  // Hide results
  elements.resultsSection.classList.remove('visible');
  hideError();

  updateOptimizeButtonState();
}

// ============================================================================
// Utility Functions
// ============================================================================

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.style.background = '#ffebee';
  elements.errorMessage.style.color = '#c62828';
  elements.errorMessage.style.borderColor = '#ef9a9a';
  elements.errorMessage.classList.add('visible');
}

function showSuccess(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.style.background = '#e8f5e9';
  elements.errorMessage.style.color = '#2e7d32';
  elements.errorMessage.style.borderColor = '#a5d6a7';
  elements.errorMessage.classList.add('visible');

  // Auto-hide after 3 seconds
  setTimeout(() => {
    hideError();
  }, 3000);
}

function hideError() {
  elements.errorMessage.classList.remove('visible');
}

function showLoading(button, text) {
  button.disabled = true;
  setButtonLoading(button, text);
}

function hideLoading(button, text) {
  button.disabled = false;
  button.textContent = text;
}

function setButtonLoading(button, text) {
  // Clear existing content
  clearElement(button);

  // Add spinner
  const spinner = document.createElement('span');
  spinner.className = 'loading-spinner';
  button.appendChild(spinner);

  // Add text
  button.appendChild(document.createTextNode(text));
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  initializeEventListeners();

  // Load queue data on page load
  await loadQueueData();

  // Check for quick optimize data from dashboard
  const quickOptimizeData = sessionStorage.getItem('quickOptimize');
  if (quickOptimizeData) {
    try {
      const data = JSON.parse(quickOptimizeData);
      sessionStorage.removeItem('quickOptimize');

      // Pre-fill job fields
      if (data.title) {
        elements.jobTitle.value = data.title;
      }
      if (data.description) {
        elements.jobDescription.value = data.description;
      }

      // Auto-load resume from vault
      await handleLoadFromVault();
    } catch (error) {
      console.error('Error loading quick optimize data:', error);
    }
  }

  updateOptimizeButtonState();
});
