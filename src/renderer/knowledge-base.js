/**
 * Knowledge Base - Renderer Script
 *
 * Manages the Knowledge Base UI for browsing, searching, editing, and exporting
 * optimized resumes and their analysis data.
 */

const { ipcRenderer } = require('electron');

// ============================================================================
// State
// ============================================================================

const state = {
  entries: [],
  currentEntry: null,
  filters: {
    text: '',
    company: '',
    sortBy: 'date',
    sortOrder: 'desc'
  },
  isEditing: false,
  hasUnsavedChanges: false
};

// ============================================================================
// DOM Elements
// ============================================================================

const elements = {
  // Stats
  totalEntries: document.getElementById('totalEntries'),
  avgScore: document.getElementById('avgScore'),
  thisWeek: document.getElementById('thisWeek'),
  uniqueCompanies: document.getElementById('uniqueCompanies'),

  // Filters
  searchInput: document.getElementById('searchInput'),
  companyFilter: document.getElementById('companyFilter'),
  sortSelect: document.getElementById('sortSelect'),

  // Content
  contentGrid: document.getElementById('contentGrid'),
  emptyState: document.getElementById('emptyState'),

  // Modal
  detailModal: document.getElementById('detailModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalSubtitle: document.getElementById('modalSubtitle'),
  modalClose: document.getElementById('modalClose'),
  exportBtn: document.getElementById('exportBtn'),
  exportDropdown: document.getElementById('exportDropdown'),

  // Tabs
  modalTabs: document.querySelectorAll('.modal-tab'),
  tabContents: document.querySelectorAll('.tab-content'),

  // Resume content
  resumeContent: document.getElementById('resumeContent'),
  viewToggleBtns: document.querySelectorAll('.view-toggle-btn'),

  // Analysis
  scoreCircle: document.getElementById('scoreCircle'),
  initialScore: document.getElementById('initialScore'),
  finalScore: document.getElementById('finalScore'),
  iterationCount: document.getElementById('iterationCount'),
  strengthsList: document.getElementById('strengthsList'),
  gapsList: document.getElementById('gapsList'),
  recommendationsList: document.getElementById('recommendationsList'),

  // Job description
  jobDescription: document.getElementById('jobDescription'),

  // Notes and tags
  notesTextarea: document.getElementById('notesTextarea'),
  tagsContainer: document.getElementById('tagsContainer'),
  addTagInput: document.getElementById('addTagInput'),

  // Actions
  deleteBtn: document.getElementById('deleteBtn'),
  cancelBtn: document.getElementById('cancelBtn'),
  saveBtn: document.getElementById('saveBtn')
};

// ============================================================================
// Initialization
// ============================================================================

async function initialize() {
  await loadStats();
  await loadCompanies();
  await loadEntries();
  setupEventListeners();
}

async function loadStats() {
  try {
    const result = await ipcRenderer.invoke('knowledge-base-stats');
    if (result.success) {
      elements.totalEntries.textContent = result.stats.total;
      elements.avgScore.textContent = Math.round(result.stats.averageScore * 100) + '%';
      elements.thisWeek.textContent = result.stats.thisWeek;
      elements.uniqueCompanies.textContent = result.stats.uniqueCompanies;
    }
  } catch (error) {
    console.error('[KnowledgeBase] Error loading stats:', error);
  }
}

async function loadCompanies() {
  try {
    const result = await ipcRenderer.invoke('knowledge-base-companies');
    if (result.success) {
      elements.companyFilter.innerHTML = '<option value="">All Companies</option>';
      for (const company of result.companies) {
        const option = document.createElement('option');
        option.value = company;
        option.textContent = company;
        elements.companyFilter.appendChild(option);
      }
    }
  } catch (error) {
    console.error('[KnowledgeBase] Error loading companies:', error);
  }
}

async function loadEntries() {
  try {
    const result = await ipcRenderer.invoke('knowledge-base-list', state.filters);
    if (result.success) {
      state.entries = result.entries;
      renderEntries();
    }
  } catch (error) {
    console.error('[KnowledgeBase] Error loading entries:', error);
  }
}

// ============================================================================
// Rendering
// ============================================================================

function renderEntries() {
  elements.contentGrid.innerHTML = '';

  if (state.entries.length === 0) {
    elements.contentGrid.appendChild(createEmptyState());
    return;
  }

  for (const entry of state.entries) {
    elements.contentGrid.appendChild(createEntryCard(entry));
  }
}

function createEmptyState() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <div class="empty-state-icon">&#128218;</div>
    <div class="empty-state-title">No optimizations yet</div>
    <div class="empty-state-text">Complete your first resume optimization to start building your knowledge base</div>
    <a href="./optimizer.html" class="btn btn-primary">Go to Optimizer</a>
  `;
  return div;
}

function createEntryCard(entry) {
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.dataset.id = entry.id;

  const scorePercent = Math.round(entry.score * 100);
  const scoreClass = scorePercent >= 80 ? 'high' : scorePercent >= 60 ? 'medium' : 'low';

  const date = new Date(entry.createdAt);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  let tagsHtml = '';
  if (entry.tags && entry.tags.length > 0) {
    tagsHtml = `
      <div class="card-tags">
        ${entry.tags.slice(0, 3).map(tag => `<span class="card-tag">${escapeHtml(tag)}</span>`).join('')}
        ${entry.tags.length > 3 ? `<span class="card-tag">+${entry.tags.length - 3}</span>` : ''}
      </div>
    `;
  }

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title">${escapeHtml(entry.jobTitle)}</div>
      <div class="card-company">${escapeHtml(entry.company)}</div>
    </div>
    <div class="card-body">
      <div class="score-bar-container">
        <div class="score-bar-label">
          <span>Match Score</span>
          <span>${scorePercent}%</span>
        </div>
        <div class="score-bar">
          <div class="score-bar-fill ${scoreClass}" style="width: ${scorePercent}%"></div>
        </div>
      </div>
      <div class="card-date">${formattedDate}</div>
      ${tagsHtml}
    </div>
  `;

  card.addEventListener('click', () => openDetailModal(entry.id));

  return card;
}

// ============================================================================
// Detail Modal
// ============================================================================

async function openDetailModal(id) {
  try {
    const result = await ipcRenderer.invoke('knowledge-base-get', id);
    if (!result.success) {
      alert('Entry not found');
      return;
    }

    state.currentEntry = result.entry;
    state.hasUnsavedChanges = false;

    // Populate modal
    populateModal(result.entry);

    // Show modal
    elements.detailModal.classList.add('visible');

    // Reset to first tab
    switchTab('resume');
    switchView('rendered');

  } catch (error) {
    console.error('[KnowledgeBase] Error opening entry:', error);
    alert('Failed to load entry');
  }
}

function populateModal(entry) {
  // Header
  elements.modalTitle.textContent = `${entry.jobTitle} @ ${entry.company}`;
  const date = new Date(entry.createdAt);
  elements.modalSubtitle.textContent = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  // Resume content
  renderResumeContent(entry.optimizedResume, 'rendered');

  // Analysis
  const scorePercent = Math.round(entry.analysis.finalScore * 100);
  const initialPercent = Math.round(entry.analysis.initialScore * 100);
  const scoreClass = scorePercent >= 80 ? 'high' : scorePercent >= 60 ? 'medium' : 'low';

  elements.scoreCircle.className = `score-circle ${scoreClass}`;
  elements.scoreCircle.textContent = `${scorePercent}%`;
  elements.initialScore.textContent = `${initialPercent}%`;
  elements.finalScore.textContent = `${scorePercent}%`;
  elements.iterationCount.textContent = entry.analysis.iterations;

  // Strengths
  elements.strengthsList.innerHTML = '';
  for (const strength of (entry.analysis.strengths || [])) {
    const li = document.createElement('li');
    li.textContent = strength;
    elements.strengthsList.appendChild(li);
  }

  // Gaps
  elements.gapsList.innerHTML = '';
  for (const gap of (entry.analysis.gaps || [])) {
    const li = document.createElement('li');
    li.textContent = gap;
    elements.gapsList.appendChild(li);
  }

  // Recommendations
  elements.recommendationsList.innerHTML = '';
  for (const rec of (entry.analysis.recommendations || [])) {
    const div = document.createElement('div');
    div.className = `recommendation-item ${rec.priority || 'medium'}`;
    div.innerHTML = `
      <div class="recommendation-priority">${rec.priority || 'medium'} priority</div>
      <div class="recommendation-text">${escapeHtml(rec.suggestion)}</div>
      ${rec.rationale ? `<div class="recommendation-rationale">${escapeHtml(rec.rationale)}</div>` : ''}
    `;
    elements.recommendationsList.appendChild(div);
  }

  // Job description
  elements.jobDescription.textContent = entry.jobDescription;

  // Notes
  elements.notesTextarea.value = entry.notes || '';

  // Tags
  renderTags(entry.tags || []);
}

function renderResumeContent(content, mode) {
  if (mode === 'rendered') {
    elements.resumeContent.className = 'resume-content rendered';
    elements.resumeContent.innerHTML = renderMarkdown(content);
  } else if (mode === 'raw') {
    elements.resumeContent.className = 'resume-content raw';
    elements.resumeContent.textContent = content;
  } else if (mode === 'edit') {
    elements.resumeContent.className = 'resume-content edit-mode';
    elements.resumeContent.innerHTML = `<textarea class="resume-textarea" id="resumeTextarea">${escapeHtml(content)}</textarea>`;
    state.isEditing = true;
  }
}

function renderMarkdown(markdown) {
  if (!markdown) return '';

  // Simple markdown to HTML conversion
  let html = escapeHtml(markdown);

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Paragraphs (lines not already in tags)
  html = html.split('\n').map(line => {
    if (line.trim() === '') return '';
    if (line.startsWith('<')) return line;
    return `<p>${line}</p>`;
  }).join('\n');

  return html;
}

function renderTags(tags) {
  // Clear existing tags (keep the input)
  const input = elements.addTagInput;
  elements.tagsContainer.innerHTML = '';

  for (const tag of tags) {
    const span = document.createElement('span');
    span.className = 'tag';
    span.innerHTML = `
      ${escapeHtml(tag)}
      <button class="tag-remove" data-tag="${escapeHtml(tag)}">&times;</button>
    `;
    elements.tagsContainer.appendChild(span);
  }

  elements.tagsContainer.appendChild(input);
}

function closeDetailModal() {
  if (state.hasUnsavedChanges) {
    if (!confirm('You have unsaved changes. Discard them?')) {
      return;
    }
  }

  state.currentEntry = null;
  state.isEditing = false;
  state.hasUnsavedChanges = false;
  elements.detailModal.classList.remove('visible');
}

// ============================================================================
// Tab Switching
// ============================================================================

function switchTab(tabName) {
  // Update tab buttons
  elements.modalTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Update tab content
  elements.tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });
}

function switchView(viewMode) {
  // Update toggle buttons
  elements.viewToggleBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewMode);
  });

  // Update content
  if (state.currentEntry) {
    renderResumeContent(state.currentEntry.optimizedResume, viewMode);
  }
}

// ============================================================================
// Actions
// ============================================================================

async function saveChanges() {
  if (!state.currentEntry) return;

  try {
    const updates = {
      notes: elements.notesTextarea.value,
      tags: getCurrentTags()
    };

    // Check if resume was edited
    const resumeTextarea = document.getElementById('resumeTextarea');
    if (resumeTextarea) {
      updates.optimizedResume = resumeTextarea.value;
    }

    const result = await ipcRenderer.invoke('knowledge-base-update', {
      id: state.currentEntry.id,
      updates
    });

    if (result.success) {
      state.currentEntry = result.entry;
      state.hasUnsavedChanges = false;
      state.isEditing = false;

      // Refresh the list
      await loadEntries();
      await loadStats();

      // Re-render modal with updated data
      populateModal(result.entry);
      switchView('rendered');

      console.log('[KnowledgeBase] Changes saved');
    } else {
      alert('Failed to save changes: ' + result.error);
    }
  } catch (error) {
    console.error('[KnowledgeBase] Error saving changes:', error);
    alert('Failed to save changes');
  }
}

async function deleteEntry() {
  if (!state.currentEntry) return;

  if (!confirm(`Are you sure you want to delete the optimization for "${state.currentEntry.jobTitle}" at ${state.currentEntry.company}?`)) {
    return;
  }

  try {
    const result = await ipcRenderer.invoke('knowledge-base-delete', state.currentEntry.id);

    if (result.success) {
      closeDetailModal();
      await loadEntries();
      await loadStats();
      await loadCompanies();

      console.log('[KnowledgeBase] Entry deleted');
    } else {
      alert('Failed to delete entry: ' + result.error);
    }
  } catch (error) {
    console.error('[KnowledgeBase] Error deleting entry:', error);
    alert('Failed to delete entry');
  }
}

async function exportEntry(format) {
  if (!state.currentEntry) return;

  try {
    const result = await ipcRenderer.invoke('knowledge-base-export', {
      id: state.currentEntry.id,
      format
    });

    if (result.success) {
      console.log('[KnowledgeBase] Exported to:', result.path);
    } else if (!result.canceled) {
      alert('Export failed: ' + result.error);
    }
  } catch (error) {
    console.error('[KnowledgeBase] Error exporting:', error);
    alert('Export failed');
  }

  // Close dropdown
  elements.exportDropdown.classList.remove('open');
}

function getCurrentTags() {
  const tags = [];
  elements.tagsContainer.querySelectorAll('.tag').forEach(tagEl => {
    const removeBtn = tagEl.querySelector('.tag-remove');
    if (removeBtn) {
      tags.push(removeBtn.dataset.tag);
    }
  });
  return tags;
}

function addTag(tag) {
  if (!tag.trim()) return;

  const currentTags = getCurrentTags();
  if (currentTags.includes(tag.trim())) return;

  currentTags.push(tag.trim());
  renderTags(currentTags);
  state.hasUnsavedChanges = true;
}

function removeTag(tag) {
  const currentTags = getCurrentTags().filter(t => t !== tag);
  renderTags(currentTags);
  state.hasUnsavedChanges = true;
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  // Search - debounced
  let searchTimeout;
  elements.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.filters.text = elements.searchInput.value;
      loadEntries();
    }, 300);
  });

  // Company filter
  elements.companyFilter.addEventListener('change', () => {
    state.filters.company = elements.companyFilter.value;
    loadEntries();
  });

  // Sort
  elements.sortSelect.addEventListener('change', () => {
    const [sortBy, sortOrder] = elements.sortSelect.value.split('-');
    state.filters.sortBy = sortBy;
    state.filters.sortOrder = sortOrder;
    loadEntries();
  });

  // Modal close
  elements.modalClose.addEventListener('click', closeDetailModal);
  elements.cancelBtn.addEventListener('click', closeDetailModal);
  elements.detailModal.addEventListener('click', (e) => {
    if (e.target === elements.detailModal) {
      closeDetailModal();
    }
  });

  // Tabs
  elements.modalTabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // View toggle
  elements.viewToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Export dropdown
  elements.exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.exportDropdown.classList.toggle('open');
  });

  document.querySelectorAll('.export-menu-item').forEach(item => {
    item.addEventListener('click', () => exportEntry(item.dataset.format));
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    elements.exportDropdown.classList.remove('open');
  });

  // Save
  elements.saveBtn.addEventListener('click', saveChanges);

  // Delete
  elements.deleteBtn.addEventListener('click', deleteEntry);

  // Notes change
  elements.notesTextarea.addEventListener('input', () => {
    state.hasUnsavedChanges = true;
  });

  // Add tag
  elements.addTagInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(elements.addTagInput.value);
      elements.addTagInput.value = '';
    }
  });

  // Remove tag (event delegation)
  elements.tagsContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('tag-remove')) {
      removeTag(e.target.dataset.tag);
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.detailModal.classList.contains('visible')) {
      closeDetailModal();
    }
  });
}

// ============================================================================
// Utilities
// ============================================================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', initialize);
