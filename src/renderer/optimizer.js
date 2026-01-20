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
  clearCompletedBtn: document.getElementById('clearCompletedBtn'),

  // Auto-save indicator
  autoSaveIndicator: document.getElementById('autoSaveIndicator')
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

    // Start workflow tracking
    await startOptimizerWorkflow();

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

      // Auto-save to Applications on successful optimization
      await saveToApplications(result.data);

      // Also save to Knowledge Base for browsing/searching later
      await saveToKnowledgeBase(result.data);
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

    // "Optimize" button for pending jobs - allows loading into form
    if (job.status === 'pending') {
      const optimizeBtn = document.createElement('button');
      optimizeBtn.className = 'queue-action-btn optimize';
      optimizeBtn.textContent = 'Optimize';
      optimizeBtn.onclick = () => loadJobForOptimization(job);
      actionsCell.appendChild(optimizeBtn);
    }

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

    // Make pending job rows clickable for quick loading
    if (job.status === 'pending') {
      row.style.cursor = 'pointer';
      row.onclick = (e) => {
        // Don't trigger if clicking a button
        if (e.target.tagName !== 'BUTTON') {
          loadJobForOptimization(job);
        }
      };
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
    // Store job data and reload page with viewResult flag for full display
    sessionStorage.setItem('viewJobResult', JSON.stringify({
      id: job.id,
      title: job.title,
      company: job.company,
      description: job.rawDescription || job.description,
      result: job.result
    }));
    // Reload current page with viewResult flag
    window.location.href = './optimizer.html?viewResult=true';
  }
}

/**
 * Display results from a queued job optimization
 * This transforms queue result format to the optimizer display format
 */
function displayQueueJobResults(jobData) {
  // Set job info in form fields (read-only display)
  elements.jobTitle.value = jobData.title || 'Job Position';
  elements.jobCompany.value = jobData.company || '';
  elements.jobDescription.value = jobData.description || '';

  const result = jobData.result;
  const score = result.finalScore || 0;

  // Show results section
  elements.resultsSection.classList.add('visible');

  // Score display - queue jobs may not have initialScore, use 0 as baseline
  const initialFit = result.previousScore || 0;
  const finalFit = score;
  const improvement = finalFit - initialFit;

  elements.scoreBefore.textContent = `${Math.round(initialFit * 100)}%`;
  elements.scoreAfter.textContent = `${Math.round(finalFit * 100)}%`;
  elements.scoreImprovement.textContent = improvement >= 0
    ? `+${Math.round(improvement * 100)}%`
    : `${Math.round(improvement * 100)}%`;

  elements.scoreBarBefore.style.width = `${initialFit * 100}%`;
  elements.scoreBarAfter.style.width = `${finalFit * 100}%`;

  // Strengths - using matched skills from queue result
  clearElement(elements.strengthsList);
  const matchedSkills = result.matchedSkills || [];
  if (matchedSkills.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No strengths identified';
    elements.strengthsList.appendChild(li);
  } else {
    matchedSkills.forEach(skill => {
      const li = document.createElement('li');
      li.textContent = skill.name || skill;
      elements.strengthsList.appendChild(li);
    });
  }

  // Gaps
  clearElement(elements.gapsList);
  const gaps = result.gaps || [];
  if (gaps.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No gaps identified';
    elements.gapsList.appendChild(li);
  } else {
    gaps.forEach(gap => {
      const li = document.createElement('li');
      li.textContent = gap.name || gap;
      elements.gapsList.appendChild(li);
    });
  }

  // Recommendations
  clearElement(elements.recommendationsList);
  const recommendations = result.recommendations || [];
  if (recommendations.length === 0) {
    const div = document.createElement('div');
    div.className = 'recommendation-item';
    div.textContent = 'No recommendations at this time';
    elements.recommendationsList.appendChild(div);
  } else {
    recommendations.forEach(rec => {
      const div = document.createElement('div');
      div.className = 'recommendation-item';

      // Handle both string and object recommendations
      if (typeof rec === 'string') {
        const textDiv = document.createElement('div');
        textDiv.className = 'recommendation-text';
        textDiv.textContent = rec;
        div.appendChild(textDiv);
      } else {
        const prioritySpan = document.createElement('span');
        prioritySpan.className = `recommendation-priority priority-${rec.priority || 'medium'}`;
        prioritySpan.textContent = rec.priority || 'medium';
        div.appendChild(prioritySpan);

        const textDiv = document.createElement('div');
        textDiv.className = 'recommendation-text';
        textDiv.textContent = rec.suggestedReframe || rec.suggestion || rec;
        div.appendChild(textDiv);

        if (rec.rationale) {
          const rationaleDiv = document.createElement('div');
          rationaleDiv.className = 'recommendation-rationale';
          rationaleDiv.textContent = rec.rationale;
          div.appendChild(rationaleDiv);
        }
      }

      elements.recommendationsList.appendChild(div);
    });
  }

  // Resume comparison - only show if we have optimized content
  const optimizedContent = result.optimizedContent;
  if (optimizedContent) {
    elements.resumeOriginalSbs.textContent = state.resume.content || 'Original resume not loaded';
    elements.resumeOptimizedSbs.textContent = optimizedContent;
    elements.beforeView.textContent = state.resume.content || 'Original resume not loaded';
    elements.afterView.textContent = optimizedContent;
  } else {
    // No optimized content - show placeholder message
    const placeholder = 'Optimized resume content not available (single-shot analysis mode)';
    elements.resumeOriginalSbs.textContent = state.resume.content || 'Original resume not loaded';
    elements.resumeOptimizedSbs.textContent = placeholder;
    elements.beforeView.textContent = state.resume.content || 'Original resume not loaded';
    elements.afterView.textContent = placeholder;
  }

  // Show success message
  showSuccess(`Viewing results for: ${jobData.title} at ${jobData.company}`);
}

/**
 * Load a queued job into the optimizer form for immediate optimization
 */
function loadJobForOptimization(job) {
  // Load job data into form fields
  elements.jobTitle.value = job.title || '';
  elements.jobCompany.value = job.company || '';
  // Queue stores description as 'rawDescription', not 'description'
  elements.jobDescription.value = job.rawDescription || job.description || '';

  // Scroll to top of page to show the form
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Update button state
  updateOptimizeButtonState();

  // Show success message
  showSuccess(`Loaded "${job.title}" - ready to optimize`);
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
// State Persistence
// ============================================================================

let autoSaveInterval = null;

/**
 * Save current page state for restoration on navigation
 */
async function savePageState() {
  const pageData = {
    jobTitle: elements.jobTitle.value,
    jobCompany: elements.jobCompany.value,
    jobDescription: elements.jobDescription.value,
    resume: state.resume,
    hasResults: !!state.results
  };

  try {
    // Show saving indicator
    showAutoSaveIndicator('saving');

    await ipcRenderer.invoke('app-state-save-page', {
      page: 'optimizer',
      data: pageData
    });

    // Also update workflow if active
    if (state.resume.content || pageData.jobDescription) {
      await ipcRenderer.invoke('app-state-update-workflow', {
        currentPage: 'optimizer',
        data: {
          jobTitle: pageData.jobTitle || 'Job Position',
          company: pageData.jobCompany || '',
          hasResume: !!state.resume.content,
          hasJobDescription: !!pageData.jobDescription
        }
      });
    }

    // Show saved indicator
    showAutoSaveIndicator('saved');
    console.log('[Optimizer] Page state saved');
  } catch (error) {
    console.error('[Optimizer] Error saving page state:', error);
  }
}

function showAutoSaveIndicator(status) {
  if (!elements.autoSaveIndicator) return;

  const indicator = elements.autoSaveIndicator;
  const icon = indicator.querySelector('.save-icon');
  const text = indicator.querySelector('.save-text');

  if (status === 'saving') {
    indicator.classList.add('visible', 'saving');
    icon.textContent = '↻';
    text.textContent = 'Saving...';
  } else {
    indicator.classList.remove('saving');
    indicator.classList.add('visible');
    icon.textContent = '✓';
    text.textContent = 'Saved';

    // Hide after 2 seconds
    setTimeout(() => {
      indicator.classList.remove('visible');
    }, 2000);
  }
}

/**
 * Restore page state from persistent storage
 */
async function restorePageState() {
  try {
    const result = await ipcRenderer.invoke('app-state-get-page', 'optimizer');

    if (result.success && result.pageState && result.pageState.data) {
      const data = result.pageState.data;

      // Restore form fields
      if (data.jobTitle) {
        elements.jobTitle.value = data.jobTitle;
      }
      if (data.jobCompany) {
        elements.jobCompany.value = data.jobCompany;
      }
      if (data.jobDescription) {
        elements.jobDescription.value = data.jobDescription;
      }

      // Restore resume state
      if (data.resume && data.resume.content) {
        state.resume = data.resume;
        updateResumePreview();
      }

      console.log('[Optimizer] Page state restored');
      return true;
    }
  } catch (error) {
    console.error('[Optimizer] Error restoring page state:', error);
  }
  return false;
}

/**
 * Start a workflow when user begins optimization
 */
async function startOptimizerWorkflow() {
  try {
    await ipcRenderer.invoke('app-state-start-workflow', {
      type: 'optimizer',
      currentPage: 'optimizer',
      initialData: {
        jobTitle: elements.jobTitle.value || 'Job Position',
        company: elements.jobCompany.value || ''
      }
    });
  } catch (error) {
    console.error('[Optimizer] Error starting workflow:', error);
  }
}

/**
 * Save completed optimization to Applications
 */
async function saveToApplications(results) {
  try {
    const saveResult = await ipcRenderer.invoke('applications-save', {
      jobTitle: elements.jobTitle.value.trim() || 'Job Position',
      company: elements.jobCompany.value.trim() || 'Unknown Company',
      jobDescription: elements.jobDescription.value.trim(),
      generatedResume: results.finalResume?.content || '',
      score: results.finalFit || 0,
      metadata: {
        iterations: results.iterations?.length || 1,
        initialScore: results.initialFit || 0
      }
    });

    if (saveResult.success) {
      console.log('[Optimizer] Saved to Applications:', saveResult.application.id);

      // Clear the workflow since optimization is complete
      await ipcRenderer.invoke('app-state-clear-workflow');
    }
  } catch (error) {
    console.error('[Optimizer] Error saving to Applications:', error);
  }
}

/**
 * Save completed optimization to Knowledge Base
 */
async function saveToKnowledgeBase(results) {
  try {
    // Extract analysis data from the last iteration
    const lastIteration = results.iterations?.slice(-1)[0];
    const analysis = lastIteration?.analysis || {};

    const entry = {
      jobTitle: elements.jobTitle.value.trim() || 'Job Position',
      company: elements.jobCompany.value.trim() || 'Unknown Company',
      jobDescription: elements.jobDescription.value.trim(),
      sourceUrl: state.job?.sourceUrl || null,
      optimizedResume: results.finalResume?.content || '',
      analysis: {
        finalScore: results.finalFit || 0,
        initialScore: results.initialFit || 0,
        iterations: results.iterations?.length || 1,
        strengths: analysis.strengths || [],
        gaps: analysis.gaps || [],
        recommendations: (analysis.recommendations || []).map(rec => {
          // Handle both string and object formats
          if (typeof rec === 'string') {
            return { priority: 'medium', suggestion: rec };
          }
          return {
            priority: rec.priority || 'medium',
            suggestion: rec.suggestion || rec.text || String(rec),
            rationale: rec.rationale || undefined
          };
        })
      }
    };

    const saveResult = await ipcRenderer.invoke('knowledge-base-save', entry);

    if (saveResult.success) {
      console.log('[Optimizer] Saved to Knowledge Base:', saveResult.entry.id);
    } else {
      console.warn('[Optimizer] Knowledge Base save failed:', saveResult.error);
    }
  } catch (error) {
    console.error('[Optimizer] Error saving to Knowledge Base:', error);
  }
}

/**
 * Setup auto-save functionality
 */
function setupAutoSave() {
  // Auto-save every 30 seconds
  autoSaveInterval = setInterval(() => {
    if (state.resume.content || elements.jobDescription.value.trim()) {
      savePageState();
    }
  }, 30000);

  // Save on visibility change (user switching tabs/windows)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      savePageState();
    }
  });

  // Save before unload
  window.addEventListener('beforeunload', () => {
    savePageState();
  });
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  initializeEventListeners();

  // Load queue data on page load
  await loadQueueData();

  // Check for viewResult parameter (priority 0 - highest)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('viewResult') === 'true') {
    const jobData = sessionStorage.getItem('viewJobResult');
    if (jobData) {
      try {
        const job = JSON.parse(jobData);
        sessionStorage.removeItem('viewJobResult');
        // Auto-load resume from vault for comparison
        await handleLoadFromVault();
        // Display the queue job results
        displayQueueJobResults(job);
        console.log('[Optimizer] Loaded queue job results for:', job.title);
        return; // Don't load other data sources
      } catch (error) {
        console.error('Error loading queue job results:', error);
      }
    }
  }

  // Check for loadApplication data from Applications page (priority 1)
  const loadApplicationData = sessionStorage.getItem('loadApplication');
  if (loadApplicationData) {
    try {
      const data = JSON.parse(loadApplicationData);
      sessionStorage.removeItem('loadApplication');

      // Pre-fill job fields from application
      if (data.jobTitle) {
        elements.jobTitle.value = data.jobTitle;
      }
      if (data.company) {
        elements.jobCompany.value = data.company;
      }
      if (data.jobDescription) {
        elements.jobDescription.value = data.jobDescription;
      }

      // Auto-load resume from vault
      await handleLoadFromVault();
      console.log('[Optimizer] Loaded application data for re-optimization');
    } catch (error) {
      console.error('Error loading application data:', error);
    }
  }
  // Check for quick optimize data from dashboard (priority 2)
  else {
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
    // Try to restore previous page state (priority 3)
    else {
      const restored = await restorePageState();
      if (restored && !state.resume.content) {
        // If we restored form data but no resume, try loading from vault
        await handleLoadFromVault();
      }
    }
  }

  // Setup auto-save
  setupAutoSave();

  updateOptimizeButtonState();
});
