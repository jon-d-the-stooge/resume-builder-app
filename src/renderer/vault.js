// Resume Vault UI Logic
const { ipcRenderer } = require('electron');

// DOM Elements
const totalItems = document.getElementById('totalItems');
const jobCount = document.getElementById('jobCount');
const accomplishmentCount = document.getElementById('accomplishmentCount');
const skillCount = document.getElementById('skillCount');
const typeFilter = document.getElementById('typeFilter');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const contentGrid = document.getElementById('contentGrid');
const emptyState = document.getElementById('emptyState');
const uploadResumeBtn = document.getElementById('uploadResumeBtn');

// State
let allContent = [];
let filteredContent = [];

// =============================================================================
// Initialization
// =============================================================================

async function initVault() {
  await loadAllContent();
}

// =============================================================================
// Data Loading
// =============================================================================

async function loadAllContent() {
  try {
    // Load all content types
    const types = ['job_entry', 'accomplishment', 'skill', 'education', 'certification'];
    const results = await Promise.all(
      types.map(type =>
        ipcRenderer.invoke('search-content', { contentType: type })
          .catch(() => [])
      )
    );

    allContent = results.flat();
    filteredContent = allContent;

    updateStats();
    renderContent(filteredContent);
  } catch (error) {
    console.error('Error loading content:', error);
    showEmpty('Error loading content', error.message);
  }
}

function updateStats() {
  totalItems.textContent = allContent.length;
  jobCount.textContent = allContent.filter(c => c.type === 'job_entry').length;
  accomplishmentCount.textContent = allContent.filter(c => c.type === 'accomplishment').length;
  skillCount.textContent = allContent.filter(c => c.type === 'skill').length;
}

// =============================================================================
// Filtering
// =============================================================================

function applyFilters() {
  const type = typeFilter.value;
  const search = searchInput.value.toLowerCase().trim();

  filteredContent = allContent.filter(item => {
    // Type filter
    if (type && item.type !== type) return false;

    // Search filter
    if (search) {
      const contentMatch = item.content?.toLowerCase().includes(search);
      const tagMatch = item.tags?.some(t => t.toLowerCase().includes(search));
      if (!contentMatch && !tagMatch) return false;
    }

    return true;
  });

  renderContent(filteredContent);
}

// =============================================================================
// Rendering
// =============================================================================

function renderContent(items) {
  contentGrid.textContent = '';

  if (!items || items.length === 0) {
    showEmpty('No content found', 'Try adjusting your filters or add new content');
    return;
  }

  items.forEach(item => {
    const card = createContentCard(item);
    contentGrid.appendChild(card);
  });
}

function createContentCard(item) {
  const card = document.createElement('div');
  card.className = 'content-card';

  // Header
  const header = document.createElement('div');
  header.className = 'card-header';

  const typeBadge = document.createElement('span');
  typeBadge.className = `card-type-badge type-${item.type}`;
  typeBadge.textContent = formatType(item.type);
  header.appendChild(typeBadge);

  const date = document.createElement('span');
  date.className = 'card-date';
  date.textContent = formatDate(item.createdAt);
  header.appendChild(date);

  card.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'card-body';

  const content = document.createElement('div');
  content.className = 'card-content';
  content.textContent = item.content;
  body.appendChild(content);

  // Tags
  if (item.tags && item.tags.length > 0) {
    const tags = document.createElement('div');
    tags.className = 'card-tags';

    item.tags.slice(0, 5).forEach(tag => {
      const tagEl = document.createElement('span');
      tagEl.className = 'card-tag';
      tagEl.textContent = tag;
      tags.appendChild(tagEl);
    });

    if (item.tags.length > 5) {
      const moreTag = document.createElement('span');
      moreTag.className = 'card-tag';
      moreTag.textContent = `+${item.tags.length - 5} more`;
      tags.appendChild(moreTag);
    }

    body.appendChild(tags);
  }

  // Metadata
  if (item.metadata && Object.keys(item.metadata).length > 0) {
    const metadata = document.createElement('div');
    metadata.className = 'card-metadata';

    if (item.metadata.company) {
      const metaItem = document.createElement('div');
      metaItem.className = 'card-metadata-item';

      const label = document.createElement('span');
      label.className = 'card-metadata-label';
      label.textContent = 'Company:';
      metaItem.appendChild(label);

      const value = document.createElement('span');
      value.textContent = item.metadata.company;
      metaItem.appendChild(value);

      metadata.appendChild(metaItem);
    }

    if (item.metadata.location) {
      const metaItem = document.createElement('div');
      metaItem.className = 'card-metadata-item';

      const label = document.createElement('span');
      label.className = 'card-metadata-label';
      label.textContent = 'Location:';
      metaItem.appendChild(label);

      const value = document.createElement('span');
      value.textContent = formatLocation(item.metadata.location);
      metaItem.appendChild(value);

      metadata.appendChild(metaItem);
    }

    if (item.metadata.proficiency) {
      const metaItem = document.createElement('div');
      metaItem.className = 'card-metadata-item';

      const label = document.createElement('span');
      label.className = 'card-metadata-label';
      label.textContent = 'Proficiency:';
      metaItem.appendChild(label);

      const value = document.createElement('span');
      value.textContent = item.metadata.proficiency;
      metaItem.appendChild(value);

      metadata.appendChild(metaItem);
    }

    body.appendChild(metadata);
  }

  card.appendChild(body);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'card-footer';

  const editBtn = document.createElement('button');
  editBtn.className = 'card-action edit';
  editBtn.textContent = 'Edit';
  editBtn.onclick = () => editItem(item.id);
  footer.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'card-action delete';
  deleteBtn.textContent = 'Delete';
  deleteBtn.onclick = () => deleteItem(item.id);
  footer.appendChild(deleteBtn);

  card.appendChild(footer);

  return card;
}

function showEmpty(title, text) {
  contentGrid.textContent = '';

  const empty = document.createElement('div');
  empty.className = 'empty-state';

  const icon = document.createElement('div');
  icon.className = 'empty-state-icon';
  icon.textContent = '\u{1F5C3}'; // File cabinet emoji
  empty.appendChild(icon);

  const titleEl = document.createElement('div');
  titleEl.className = 'empty-state-title';
  titleEl.textContent = title;
  empty.appendChild(titleEl);

  const textEl = document.createElement('div');
  textEl.className = 'empty-state-text';
  textEl.textContent = text;
  empty.appendChild(textEl);

  contentGrid.appendChild(empty);
}

// =============================================================================
// Actions
// =============================================================================

function editItem(id) {
  window.location.href = `./edit.html?id=${encodeURIComponent(id)}`;
}

async function deleteItem(id) {
  if (!confirm('Are you sure you want to delete this item?')) {
    return;
  }

  try {
    await ipcRenderer.invoke('delete-content-item', id);
    await loadAllContent();
  } catch (error) {
    console.error('Error deleting item:', error);
    alert('Failed to delete item: ' + error.message);
  }
}

async function uploadResume() {
  try {
    const result = await ipcRenderer.invoke('select-resume-file');

    if (result.success) {
      uploadResumeBtn.disabled = true;
      uploadResumeBtn.textContent = 'Processing...';

      await ipcRenderer.invoke('process-resume', {
        name: result.name,
        path: result.path
      });

      // Main process will navigate to review.html
    }
  } catch (error) {
    console.error('Error uploading resume:', error);
    alert('Failed to process resume: ' + error.message);
    uploadResumeBtn.disabled = false;
    uploadResumeBtn.textContent = 'Upload Resume';
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatType(type) {
  const typeNames = {
    job_entry: 'Job Entry',
    accomplishment: 'Accomplishment',
    skill: 'Skill',
    education: 'Education',
    certification: 'Certification'
  };
  return typeNames[type] || type;
}

function formatLocation(location) {
  if (!location) return '';
  if (typeof location === 'string') return location;

  const parts = [];
  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);
  if (location.country && !location.city && !location.state) parts.push(location.country);

  return parts.join(', ');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// =============================================================================
// Clear Vault
// =============================================================================

const clearVaultBtn = document.getElementById('clearVaultBtn');
const clearVaultModal = document.getElementById('clearVaultModal');
const confirmDeleteInput = document.getElementById('confirmDeleteInput');
const cancelClearBtn = document.getElementById('cancelClearBtn');
const confirmClearBtn = document.getElementById('confirmClearBtn');

function showClearVaultModal() {
  clearVaultModal.classList.add('visible');
  confirmDeleteInput.value = '';
  confirmClearBtn.disabled = true;
  confirmDeleteInput.focus();
}

function hideClearVaultModal() {
  clearVaultModal.classList.remove('visible');
  confirmDeleteInput.value = '';
  confirmClearBtn.disabled = true;
}

function validateDeleteConfirmation() {
  const value = confirmDeleteInput.value.trim().toLowerCase();
  confirmClearBtn.disabled = value !== 'delete';
}

async function executeClearVault() {
  if (confirmDeleteInput.value.trim().toLowerCase() !== 'delete') {
    return;
  }

  confirmClearBtn.disabled = true;
  confirmClearBtn.textContent = 'Clearing...';

  try {
    const result = await ipcRenderer.invoke('clear-vault', 'delete');

    if (result.success) {
      hideClearVaultModal();
      alert('Vault cleared successfully. ' + result.deletedCount + ' items deleted.');
      await loadAllContent();
    } else {
      alert('Failed to clear vault: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error clearing vault:', error);
    alert('Failed to clear vault: ' + error.message);
  } finally {
    confirmClearBtn.disabled = false;
    confirmClearBtn.textContent = 'Clear Vault';
  }
}

// =============================================================================
// Event Listeners
// =============================================================================

typeFilter.addEventListener('change', applyFilters);
searchBtn.addEventListener('click', applyFilters);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyFilters();
});
uploadResumeBtn.addEventListener('click', uploadResume);

// Clear vault events
clearVaultBtn.addEventListener('click', showClearVaultModal);
cancelClearBtn.addEventListener('click', hideClearVaultModal);
confirmDeleteInput.addEventListener('input', validateDeleteConfirmation);
confirmClearBtn.addEventListener('click', executeClearVault);

// Close modal on overlay click
clearVaultModal.addEventListener('click', (e) => {
  if (e.target === clearVaultModal) {
    hideClearVaultModal();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && clearVaultModal.classList.contains('visible')) {
    hideClearVaultModal();
  }
});

// =============================================================================
// Initialize on Load
// =============================================================================

document.addEventListener('DOMContentLoaded', initVault);
