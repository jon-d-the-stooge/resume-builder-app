// Job Queue UI Logic
const { ipcRenderer } = require('electron');

// DOM Elements
const pendingCount = document.getElementById('pendingCount');
const processingCount = document.getElementById('processingCount');
const completedCount = document.getElementById('completedCount');
const failedCount = document.getElementById('failedCount');

const progressSection = document.getElementById('progressSection');
const progressCount = document.getElementById('progressCount');
const progressFill = document.getElementById('progressFill');
const progressCurrent = document.getElementById('progressCurrent');

const queueTableBody = document.getElementById('queueTableBody');
const queueContent = document.getElementById('queueContent');

const addJobBtn = document.getElementById('addJobBtn');
const importCsvBtn = document.getElementById('importCsvBtn');
const processAllBtn = document.getElementById('processAllBtn');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');

// Modal elements
const addJobModal = document.getElementById('addJobModal');
const closeModal = document.getElementById('closeModal');
const cancelAddJob = document.getElementById('cancelAddJob');
const submitAddJob = document.getElementById('submitAddJob');
const jobTitle = document.getElementById('jobTitle');
const jobCompany = document.getElementById('jobCompany');
const jobUrl = document.getElementById('jobUrl');
const jobDescription = document.getElementById('jobDescription');

// State
let jobs = [];
let isProcessing = false;

// =============================================================================
// Initialization
// =============================================================================

async function initQueue() {
  await loadQueueData();

  // Set up IPC listener for progress updates
  ipcRenderer.on('queue-progress', handleProgressUpdate);

  // Setup state persistence
  setupStatePersistence();
}

// =============================================================================
// Data Loading
// =============================================================================

async function loadQueueData() {
  try {
    const status = await ipcRenderer.invoke('job-queue-status');
    jobs = await ipcRenderer.invoke('job-queue-list');

    updateStatusCards(status);
    renderQueueTable(jobs);
    updateProcessButton(status);
  } catch (error) {
    console.error('Error loading queue data:', error);
  }
}

function updateStatusCards(status) {
  pendingCount.textContent = status?.pendingJobs || 0;
  processingCount.textContent = status?.processingJobs || 0;
  completedCount.textContent = status?.completedJobs || 0;
  failedCount.textContent = status?.failedJobs || 0;
}

function updateProcessButton(status) {
  const hasPending = (status?.pendingJobs || 0) > 0;
  processAllBtn.disabled = !hasPending || isProcessing;
}

function renderQueueTable(jobs) {
  queueTableBody.textContent = '';

  if (!jobs || jobs.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 5;
    emptyCell.style.textAlign = 'center';
    emptyCell.style.padding = '60px 20px';
    emptyCell.style.color = '#888';

    const emptyContent = document.createElement('div');
    emptyContent.className = 'empty-state';

    const icon = document.createElement('div');
    icon.className = 'empty-state-icon';
    icon.textContent = '\u{1F4CB}'; // Clipboard emoji

    const title = document.createElement('div');
    title.className = 'empty-state-title';
    title.textContent = 'No jobs in queue';

    const text = document.createElement('div');
    text.className = 'empty-state-text';
    text.textContent = 'Add jobs manually or import from CSV';

    emptyContent.appendChild(icon);
    emptyContent.appendChild(title);
    emptyContent.appendChild(text);
    emptyCell.appendChild(emptyContent);
    emptyRow.appendChild(emptyCell);
    queueTableBody.appendChild(emptyRow);
    return;
  }

  jobs.forEach(job => {
    const row = document.createElement('tr');

    // Job info cell
    const jobCell = document.createElement('td');
    const titleDiv = document.createElement('div');
    titleDiv.className = 'job-title';
    titleDiv.textContent = job.title || 'Untitled';
    const companyDiv = document.createElement('div');
    companyDiv.className = 'job-company';
    companyDiv.textContent = job.company || 'Unknown company';
    jobCell.appendChild(titleDiv);
    jobCell.appendChild(companyDiv);

    // Status cell
    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${job.status || 'pending'}`;
    statusBadge.textContent = job.status || 'pending';
    statusCell.appendChild(statusBadge);

    // Score cell
    const scoreCell = document.createElement('td');
    if (job.status === 'completed' && job.result) {
      const score = job.result.finalScore || 0;
      const scoreSpan = document.createElement('span');
      scoreSpan.className = `score-display ${score >= 0.75 ? 'score-high' : score >= 0.5 ? 'score-medium' : 'score-low'}`;
      scoreSpan.textContent = `${Math.round(score * 100)}%`;
      scoreCell.appendChild(scoreSpan);
    } else if (job.status === 'failed') {
      scoreCell.textContent = '-';
      scoreCell.style.color = '#999';
    } else {
      scoreCell.textContent = '-';
      scoreCell.style.color = '#999';
    }

    // Added date cell
    const dateCell = document.createElement('td');
    dateCell.textContent = formatDate(job.addedAt);
    dateCell.style.color = '#666';
    dateCell.style.fontSize = '13px';

    // Actions cell
    const actionsCell = document.createElement('td');

    if (job.status === 'completed') {
      const viewBtn = document.createElement('button');
      viewBtn.className = 'action-btn view';
      viewBtn.textContent = 'View';
      viewBtn.onclick = () => viewJobResult(job.id);
      actionsCell.appendChild(viewBtn);
    }

    if (job.status !== 'processing') {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'action-btn remove';
      removeBtn.textContent = 'Remove';
      removeBtn.style.marginLeft = '8px';
      removeBtn.onclick = () => removeJob(job.id);
      actionsCell.appendChild(removeBtn);
    }

    row.appendChild(jobCell);
    row.appendChild(statusCell);
    row.appendChild(scoreCell);
    row.appendChild(dateCell);
    row.appendChild(actionsCell);
    queueTableBody.appendChild(row);
  });
}

// =============================================================================
// Actions
// =============================================================================

async function processAllJobs() {
  if (isProcessing) return;

  isProcessing = true;
  processAllBtn.disabled = true;
  processAllBtn.textContent = 'Processing...';
  progressSection.classList.add('visible');

  try {
    const result = await ipcRenderer.invoke('job-queue-process-all');

    if (result.success) {
      console.log(`Processed ${result.summary.processed} jobs`);
    }
  } catch (error) {
    console.error('Error processing queue:', error);
  } finally {
    isProcessing = false;
    processAllBtn.textContent = 'Process All';
    progressSection.classList.remove('visible');
    await loadQueueData();
  }
}

function handleProgressUpdate(event, progress) {
  const { processed, total, current } = progress;

  progressCount.textContent = `${processed}/${total}`;
  progressFill.style.width = `${(processed / total) * 100}%`;

  if (current) {
    progressCurrent.textContent = `Processing: ${current.title} at ${current.company}`;
  }
}

async function removeJob(jobId) {
  try {
    await ipcRenderer.invoke('job-queue-remove', jobId);
    await loadQueueData();
  } catch (error) {
    console.error('Error removing job:', error);
  }
}

async function clearCompleted() {
  try {
    await ipcRenderer.invoke('job-queue-clear-finished');
    await loadQueueData();
  } catch (error) {
    console.error('Error clearing completed:', error);
  }
}

function viewJobResult(jobId) {
  const job = jobs.find(j => j.id === jobId);
  if (job && job.result) {
    // Store complete job data for optimizer to load
    sessionStorage.setItem('viewJobResult', JSON.stringify({
      id: job.id,
      title: job.title,
      company: job.company,
      description: job.rawDescription || job.description,
      result: job.result
    }));
    // Navigate to optimizer page with viewResult flag
    window.location.href = './optimizer.html?viewResult=true';
  }
}

async function addJob() {
  const title = jobTitle.value.trim();
  const company = jobCompany.value.trim();
  const url = jobUrl.value.trim();
  const description = jobDescription.value.trim();

  if (!title || !description) {
    alert('Please enter at least a job title and description');
    return;
  }

  try {
    await ipcRenderer.invoke('job-queue-add', {
      title,
      company,
      sourceUrl: url,
      description
    });

    closeAddJobModal();
    await loadQueueData();
  } catch (error) {
    console.error('Error adding job:', error);
    alert('Failed to add job: ' + error.message);
  }
}

async function importCsv() {
  try {
    const selectResult = await ipcRenderer.invoke('import-csv-select');
    if (!selectResult.success) return;

    const validation = await ipcRenderer.invoke('import-csv-validate', selectResult.path);
    if (!validation.valid) {
      alert('Invalid CSV: ' + validation.errors.join('\n'));
      return;
    }

    const importResult = await ipcRenderer.invoke('import-csv-import', selectResult.path);
    alert(`Imported ${importResult.imported} jobs`);
    await loadQueueData();
  } catch (error) {
    console.error('Error importing CSV:', error);
    alert('Failed to import CSV: ' + error.message);
  }
}

// =============================================================================
// Modal Handling
// =============================================================================

function openAddJobModal() {
  addJobModal.classList.add('visible');
  jobTitle.focus();
}

function closeAddJobModal() {
  addJobModal.classList.remove('visible');
  jobTitle.value = '';
  jobCompany.value = '';
  jobUrl.value = '';
  jobDescription.value = '';
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// =============================================================================
// State Persistence
// =============================================================================

async function savePageState() {
  try {
    showAutoSaveIndicator('saving');

    await ipcRenderer.invoke('app-state-save-page', {
      page: 'queue',
      data: {
        lastViewed: new Date().toISOString()
      }
    });

    showAutoSaveIndicator('saved');
  } catch (error) {
    console.error('[queue.js] Error saving page state:', error);
  }
}

function showAutoSaveIndicator(status) {
  const indicator = document.getElementById('autoSaveIndicator');
  if (!indicator) return;

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

    setTimeout(() => {
      indicator.classList.remove('visible');
    }, 2000);
  }
}

function setupStatePersistence() {
  // Save on visibility change (tab switch)
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

// =============================================================================
// Event Listeners
// =============================================================================

addJobBtn.addEventListener('click', openAddJobModal);
closeModal.addEventListener('click', closeAddJobModal);
cancelAddJob.addEventListener('click', closeAddJobModal);
submitAddJob.addEventListener('click', addJob);
importCsvBtn.addEventListener('click', importCsv);
processAllBtn.addEventListener('click', processAllJobs);
clearCompletedBtn.addEventListener('click', clearCompleted);

// Close modal on overlay click
addJobModal.addEventListener('click', (e) => {
  if (e.target === addJobModal) {
    closeAddJobModal();
  }
});

// =============================================================================
// Initialize on Load
// =============================================================================

document.addEventListener('DOMContentLoaded', initQueue);
