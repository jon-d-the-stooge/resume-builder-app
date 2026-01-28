/**
 * Applications UI Logic
 *
 * Handles displaying, filtering, and managing saved resume optimizations.
 */

import { ipcRenderer } from './lib/ipcAdapter';

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  // Stats
  statTotal: document.getElementById('statTotal'),
  statAvgScore: document.getElementById('statAvgScore'),
  statRecent: document.getElementById('statRecent'),
  statActive: document.getElementById('statActive'),

  // Grid & Empty State
  applicationsGrid: document.getElementById('applicationsGrid'),
  emptyState: document.getElementById('emptyState'),

  // Filter buttons
  filterBtns: document.querySelectorAll('.filter-btn'),

  // Modal
  detailModal: document.getElementById('detailModal'),
  modalClose: document.getElementById('modalClose'),
  modalTitle: document.getElementById('modalTitle'),
  modalSubtitle: document.getElementById('modalSubtitle'),
  modalScore: document.getElementById('modalScore'),
  modalDate: document.getElementById('modalDate'),
  modalIterations: document.getElementById('modalIterations'),
  modalInitialScore: document.getElementById('modalInitialScore'),
  modalStatus: document.getElementById('modalStatus'),
  modalNotes: document.getElementById('modalNotes'),
  modalJobDescription: document.getElementById('modalJobDescription'),
  modalResume: document.getElementById('modalResume'),
  modalDelete: document.getElementById('modalDelete'),
  modalOptimizeAgain: document.getElementById('modalOptimizeAgain'),
  modalSave: document.getElementById('modalSave'),

  // Toast
  messageToast: document.getElementById('messageToast')
};

// ============================================================================
// State
// ============================================================================

let applications = [];
let stats = null;
let currentFilter = 'all';
let currentApplication = null;

// ============================================================================
// Initialization
// ============================================================================

async function initApplications() {
  await loadApplications();
  setupEventListeners();
}

function setupEventListeners() {
  // Filter buttons
  elements.filterBtns.forEach(btn => {
    btn.addEventListener('click', () => handleFilterChange(btn.dataset.status));
  });

  // Modal close
  elements.modalClose.addEventListener('click', closeModal);
  elements.detailModal.addEventListener('click', (e) => {
    if (e.target === elements.detailModal) {
      closeModal();
    }
  });

  // Modal actions
  elements.modalSave.addEventListener('click', handleSaveChanges);
  elements.modalDelete.addEventListener('click', handleDelete);
  elements.modalOptimizeAgain.addEventListener('click', handleOptimizeAgain);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.detailModal.classList.contains('visible')) {
      closeModal();
    }
  });
}

// ============================================================================
// Data Loading
// ============================================================================

async function loadApplications() {
  try {
    const statusFilter = currentFilter === 'all' ? undefined : currentFilter;
    const result = await ipcRenderer.invoke('applications-list', statusFilter);

    if (result.success) {
      applications = result.applications || [];
      stats = result.stats;
      updateStats();
      renderApplications();
    } else {
      showToast('Failed to load applications: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error loading applications:', error);
    showToast('Error loading applications', 'error');
  }
}

// ============================================================================
// UI Updates
// ============================================================================

function updateStats() {
  if (!stats) return;

  elements.statTotal.textContent = stats.total;
  elements.statAvgScore.textContent = Math.round(stats.averageScore * 100) + '%';
  elements.statRecent.textContent = stats.recentCount;

  // Active = applied + interviewing
  const active = (stats.byStatus.applied || 0) + (stats.byStatus.interviewing || 0);
  elements.statActive.textContent = active;
}

function renderApplications() {
  // Clear grid
  elements.applicationsGrid.textContent = '';

  if (applications.length === 0) {
    elements.applicationsGrid.style.display = 'none';
    elements.emptyState.style.display = 'block';
    return;
  }

  elements.applicationsGrid.style.display = 'grid';
  elements.emptyState.style.display = 'none';

  applications.forEach(app => {
    const card = createApplicationCard(app);
    elements.applicationsGrid.appendChild(card);
  });
}

function createApplicationCard(app) {
  const card = document.createElement('div');
  card.className = 'app-card';
  card.onclick = () => openDetail(app.id);

  // Header
  const header = document.createElement('div');
  header.className = 'app-card-header';

  const title = document.createElement('div');
  title.className = 'app-card-title';
  title.textContent = app.jobTitle || 'Untitled Position';
  header.appendChild(title);

  const company = document.createElement('div');
  company.className = 'app-card-company';
  company.textContent = app.company || 'Unknown Company';
  header.appendChild(company);

  card.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'app-card-body';

  // Score row
  const scoreRow = document.createElement('div');
  scoreRow.className = 'app-card-row';

  const scoreLabel = document.createElement('span');
  scoreLabel.className = 'app-card-label';
  scoreLabel.textContent = 'Match Score';
  scoreRow.appendChild(scoreLabel);

  const scoreBadge = document.createElement('span');
  const scorePercent = Math.round((app.score || 0) * 100);
  scoreBadge.className = 'score-badge ' + getScoreClass(app.score);
  scoreBadge.textContent = scorePercent + '%';
  scoreRow.appendChild(scoreBadge);

  body.appendChild(scoreRow);

  // Status row
  const statusRow = document.createElement('div');
  statusRow.className = 'app-card-row';

  const statusLabel = document.createElement('span');
  statusLabel.className = 'app-card-label';
  statusLabel.textContent = 'Status';
  statusRow.appendChild(statusLabel);

  const statusBadge = document.createElement('span');
  statusBadge.className = 'status-badge status-' + (app.status || 'saved');
  statusBadge.textContent = app.status || 'saved';
  statusRow.appendChild(statusBadge);

  body.appendChild(statusRow);

  // Date row
  const dateRow = document.createElement('div');
  dateRow.className = 'app-card-row';

  const dateLabel = document.createElement('span');
  dateLabel.className = 'app-card-label';
  dateLabel.textContent = 'Date';
  dateRow.appendChild(dateLabel);

  const dateValue = document.createElement('span');
  dateValue.className = 'app-card-value';
  dateValue.textContent = formatDate(app.date);
  dateRow.appendChild(dateValue);

  body.appendChild(dateRow);

  card.appendChild(body);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'app-card-footer';

  const viewBtn = document.createElement('button');
  viewBtn.className = 'app-card-btn primary';
  viewBtn.textContent = 'View Details';
  viewBtn.onclick = (e) => {
    e.stopPropagation();
    openDetail(app.id);
  };
  footer.appendChild(viewBtn);

  const optimizeBtn = document.createElement('button');
  optimizeBtn.className = 'app-card-btn secondary';
  optimizeBtn.textContent = 'Optimize Again';
  optimizeBtn.onclick = (e) => {
    e.stopPropagation();
    loadToOptimizer(app.id);
  };
  footer.appendChild(optimizeBtn);

  card.appendChild(footer);

  return card;
}

function getScoreClass(score) {
  if (score >= 0.75) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// ============================================================================
// Filter Handling
// ============================================================================

function handleFilterChange(status) {
  currentFilter = status;

  // Update active button
  elements.filterBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === status);
  });

  // Reload with new filter
  loadApplications();
}

// ============================================================================
// Modal Handling
// ============================================================================

async function openDetail(id) {
  try {
    const result = await ipcRenderer.invoke('applications-get', id);

    if (!result.success) {
      showToast('Failed to load application details', 'error');
      return;
    }

    currentApplication = result.application;
    populateModal(currentApplication);
    elements.detailModal.classList.add('visible');
  } catch (error) {
    console.error('Error loading application detail:', error);
    showToast('Error loading details', 'error');
  }
}

function populateModal(app) {
  elements.modalTitle.textContent = app.jobTitle || 'Untitled Position';
  elements.modalSubtitle.textContent = app.company || 'Unknown Company';

  elements.modalScore.textContent = Math.round((app.score || 0) * 100) + '%';
  elements.modalDate.textContent = formatDate(app.date);
  elements.modalIterations.textContent = app.metadata?.iterations || 1;
  elements.modalInitialScore.textContent = Math.round((app.metadata?.initialScore || 0) * 100) + '%';

  elements.modalStatus.value = app.status || 'saved';
  elements.modalNotes.value = app.notes || '';

  elements.modalJobDescription.textContent = app.jobDescription || 'No job description available';
  elements.modalResume.textContent = app.generatedResume || 'No resume content available';
}

function closeModal() {
  elements.detailModal.classList.remove('visible');
  currentApplication = null;
}

async function handleSaveChanges() {
  if (!currentApplication) return;

  const updates = {
    status: elements.modalStatus.value,
    notes: elements.modalNotes.value
  };

  try {
    const result = await ipcRenderer.invoke('applications-update', {
      id: currentApplication.id,
      updates
    });

    if (result.success) {
      showToast('Changes saved', 'success');
      closeModal();
      await loadApplications(); // Refresh list
    } else {
      showToast('Failed to save changes: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error saving changes:', error);
    showToast('Error saving changes', 'error');
  }
}

async function handleDelete() {
  if (!currentApplication) return;

  const confirmed = confirm(`Delete application for "${currentApplication.jobTitle}" at ${currentApplication.company}?\n\nThis cannot be undone.`);

  if (!confirmed) return;

  try {
    const result = await ipcRenderer.invoke('applications-delete', currentApplication.id);

    if (result.success) {
      showToast('Application deleted', 'success');
      closeModal();
      await loadApplications(); // Refresh list
    } else {
      showToast('Failed to delete: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error deleting application:', error);
    showToast('Error deleting application', 'error');
  }
}

function handleOptimizeAgain() {
  if (!currentApplication) return;
  loadToOptimizer(currentApplication.id);
}

async function loadToOptimizer(id) {
  try {
    const result = await ipcRenderer.invoke('applications-get', id);

    if (!result.success) {
      showToast('Failed to load application', 'error');
      return;
    }

    const app = result.application;

    // Store data in sessionStorage for optimizer to pick up
    sessionStorage.setItem('loadApplication', JSON.stringify({
      jobTitle: app.jobTitle,
      company: app.company,
      jobDescription: app.jobDescription
    }));

    // Navigate to optimizer
    window.location.href = './optimizer.html';
  } catch (error) {
    console.error('Error loading to optimizer:', error);
    showToast('Error loading application', 'error');
  }
}

// ============================================================================
// Toast Messages
// ============================================================================

function showToast(message, type = 'success') {
  elements.messageToast.textContent = message;
  elements.messageToast.className = 'message-toast visible ' + type;

  setTimeout(() => {
    elements.messageToast.classList.remove('visible');
  }, 3000);
}

// ============================================================================
// Initialize on Load
// ============================================================================

document.addEventListener('DOMContentLoaded', initApplications);
