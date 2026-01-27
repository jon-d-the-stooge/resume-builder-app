// Content review UI logic
const { ipcRenderer } = require('./api/ipcAdapter');

// State
let parsedData = null;
let currentEditItem = null;
let currentAddParent = null;

// DOM elements
const warnings = document.getElementById('warnings');
const warningsList = document.getElementById('warningsList');
const contentTree = document.getElementById('contentTree');
const confirmButton = document.getElementById('confirmButton');
const cancelButton = document.getElementById('cancelButton');
const editModal = document.getElementById('editModal');
const addModal = document.getElementById('addModal');
const editForm = document.getElementById('editForm');
const addForm = document.getElementById('addForm');
const cancelEditButton = document.getElementById('cancelEditButton');
const cancelAddButton = document.getElementById('cancelAddButton');

// Initialize
async function initialize() {
  try {
    console.log('review.js: initialize() called');
    // Get parsed data from main process
    parsedData = await ipcRenderer.invoke('get-parsed-data');

    console.log('review.js: received parsedData:', !!parsedData);
    if (parsedData) {
      console.log('review.js: jobEntries:', parsedData.jobEntries?.length);
      console.log('review.js: skills:', parsedData.skills?.length);
    }

    if (!parsedData) {
      showEmptyState();
      return;
    }

    renderWarnings();
    renderContentTree();
  } catch (error) {
    console.error('Failed to load parsed data:', error);
    showEmptyState();
  }
}

// Show empty state
function showEmptyState() {
  contentTree.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <p>No parsed content available</p>
    </div>
  `;
  confirmButton.disabled = true;
}

// Render warnings
function renderWarnings() {
  if (!parsedData.warnings || parsedData.warnings.length === 0) {
    warnings.classList.remove('visible');
    return;
  }
  
  warnings.classList.add('visible');
  warningsList.innerHTML = parsedData.warnings
    .map(w => `
      <div class="warning-item">
        <strong>${w.section}:</strong> ${w.message} (${w.severity})
      </div>
    `)
    .join('');
}

// Get confidence class
function getConfidenceClass(confidence) {
  if (confidence >= 0.8) return 'confidence-high';
  if (confidence >= 0.5) return 'confidence-medium';
  return 'confidence-low';
}

// Get confidence label
function getConfidenceLabel(confidence) {
  if (confidence >= 0.8) return 'High Confidence';
  if (confidence >= 0.5) return 'Medium Confidence';
  return 'Low Confidence';
}

// Render content tree
function renderContentTree() {
  if (!parsedData.jobEntries || parsedData.jobEntries.length === 0) {
    showEmptyState();
    return;
  }
  
  contentTree.innerHTML = parsedData.jobEntries
    .map(job => renderJobEntry(job))
    .join('');
}

// Render job entry
function renderJobEntry(job) {
  const confidenceClass = getConfidenceClass(job.confidence);
  const confidenceLabel = getConfidenceLabel(job.confidence);
  
  return `
    <div class="job-entry" data-job-id="${job.id}">
      <div class="job-header">
        <div>
          <div class="job-title">${escapeHtml(job.title)}</div>
          <div class="job-meta">
            ${escapeHtml(job.company)} • ${escapeHtml(job.location?.city || job.location || 'Unknown')} •
            ${formatDateRange(job.duration)}
          </div>
        </div>
        <div class="job-actions">
          <span class="confidence-badge ${confidenceClass}">${confidenceLabel}</span>
          <button class="btn-icon" onclick="editJobEntry('${job.id}')">✏️ Edit</button>
          <button class="btn-icon" onclick="deleteJobEntry('${job.id}')">🗑️ Delete</button>
        </div>
      </div>
      <div class="job-content">
        ${renderContentSection('Accomplishments', job.accomplishments, job.id, 'accomplishment')}
        ${renderContentSection('Skills', job.skills, job.id, 'skill')}
      </div>
    </div>
  `;
}

// Render content section
function renderContentSection(title, items, parentId, type) {
  return `
    <div class="content-section">
      <div class="section-title">${title}</div>
      ${items && items.length > 0 
        ? items.map(item => renderContentItem(item, parentId)).join('')
        : '<p style="color: #999; font-size: 14px;">No items</p>'
      }
      <button class="btn-add" onclick="addContentItem('${parentId}', '${type}')">+ Add ${title.slice(0, -1)}</button>
    </div>
  `;
}

// Render content item
function renderContentItem(item, parentId) {
  const content = item.description || item.name || item.content || '';
  return `
    <div class="content-item" data-item-id="${item.id}">
      <div class="content-item-text">${escapeHtml(content)}</div>
      <div class="content-item-actions">
        <button class="btn-small" onclick="editContentItem('${item.id}', '${parentId}')">✏️</button>
        <button class="btn-small" onclick="deleteContentItem('${item.id}', '${parentId}')">🗑️</button>
      </div>
    </div>
  `;
}

// Format date range
function formatDateRange(dateRange) {
  if (!dateRange) return 'Unknown';
  const start = dateRange.start ? new Date(dateRange.start).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : 'Unknown';
  const end = dateRange.end ? new Date(dateRange.end).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : 'Present';
  return `${start} - ${end}`;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// Edit job entry
window.editJobEntry = function(jobId) {
  const job = parsedData.jobEntries.find(j => j.id === jobId);
  if (!job) return;
  
  currentEditItem = { type: 'job', id: jobId, data: job };
  
  document.getElementById('editType').value = 'job-entry';
  document.getElementById('editContent').value = `${job.title}\n${job.company}\n${job.location?.city || job.location || ''}`;
  document.getElementById('editTags').value = job.tags ? job.tags.join(', ') : '';
  
  editModal.classList.add('visible');
};

// Edit content item
window.editContentItem = function(itemId, parentId) {
  const job = parsedData.jobEntries.find(j => j.id === parentId);
  if (!job) return;
  
  let item = job.accomplishments?.find(a => a.id === itemId);
  let itemType = 'accomplishment';
  
  if (!item) {
    item = job.skills?.find(s => s.id === itemId);
    itemType = 'skill';
  }
  
  if (!item) return;
  
  currentEditItem = { type: itemType, id: itemId, parentId, data: item };
  
  document.getElementById('editType').value = itemType;
  document.getElementById('editContent').value = item.description || item.name || '';
  document.getElementById('editTags').value = item.tags ? item.tags.join(', ') : '';
  
  editModal.classList.add('visible');
};

// Delete job entry
window.deleteJobEntry = function(jobId) {
  if (!confirm('Are you sure you want to delete this job entry and all its content?')) {
    return;
  }
  
  parsedData.jobEntries = parsedData.jobEntries.filter(j => j.id !== jobId);
  renderContentTree();
};

// Delete content item
window.deleteContentItem = function(itemId, parentId) {
  const job = parsedData.jobEntries.find(j => j.id === parentId);
  if (!job) return;
  
  if (job.accomplishments) {
    job.accomplishments = job.accomplishments.filter(a => a.id !== itemId);
  }
  
  if (job.skills) {
    job.skills = job.skills.filter(s => s.id !== itemId);
  }
  
  renderContentTree();
};

// Add content item
window.addContentItem = function(parentId, type) {
  currentAddParent = { id: parentId, type };
  
  document.getElementById('addType').value = type;
  document.getElementById('addContent').value = '';
  document.getElementById('addTags').value = '';
  
  addModal.classList.add('visible');
};

// Handle edit form submission
editForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const type = document.getElementById('editType').value;
  const content = document.getElementById('editContent').value;
  const tags = document.getElementById('editTags').value
    .split(',')
    .map(t => t.trim())
    .filter(t => t);
  
  if (currentEditItem.type === 'job') {
    const job = parsedData.jobEntries.find(j => j.id === currentEditItem.id);
    if (job) {
      const lines = content.split('\n');
      job.title = lines[0] || job.title;
      job.company = lines[1] || job.company;
      if (lines[2]) {
        if (!job.location || typeof job.location === 'string') {
          job.location = { city: lines[2] };
        } else {
          job.location.city = lines[2];
        }
      }
      job.tags = tags;
    }
  } else {
    const job = parsedData.jobEntries.find(j => j.id === currentEditItem.parentId);
    if (job) {
      const items = currentEditItem.type === 'accomplishment' ? job.accomplishments : job.skills;
      const item = items?.find(i => i.id === currentEditItem.id);
      if (item) {
        if (item.description !== undefined) {
          item.description = content;
        } else if (item.name !== undefined) {
          item.name = content;
        }
        item.tags = tags;
      }
    }
  }
  
  editModal.classList.remove('visible');
  currentEditItem = null;
  renderContentTree();
});

// Handle add form submission
addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const type = document.getElementById('addType').value;
  const content = document.getElementById('addContent').value;
  const tags = document.getElementById('addTags').value
    .split(',')
    .map(t => t.trim())
    .filter(t => t);
  
  const job = parsedData.jobEntries.find(j => j.id === currentAddParent.id);
  if (!job) return;
  
  const newItem = {
    id: `${type}-${Date.now()}`,
    tags,
    confidence: 1.0
  };
  
  if (type === 'accomplishment') {
    newItem.description = content;
    if (!job.accomplishments) job.accomplishments = [];
    job.accomplishments.push(newItem);
  } else if (type === 'skill') {
    newItem.name = content;
    if (!job.skills) job.skills = [];
    job.skills.push(newItem);
  }
  
  addModal.classList.remove('visible');
  currentAddParent = null;
  renderContentTree();
});

// Cancel edit
cancelEditButton.addEventListener('click', () => {
  editModal.classList.remove('visible');
  currentEditItem = null;
});

// Cancel add
cancelAddButton.addEventListener('click', () => {
  addModal.classList.remove('visible');
  currentAddParent = null;
});

// Close modals on background click
editModal.addEventListener('click', (e) => {
  if (e.target === editModal) {
    editModal.classList.remove('visible');
    currentEditItem = null;
  }
});

addModal.addEventListener('click', (e) => {
  if (e.target === addModal) {
    addModal.classList.remove('visible');
    currentAddParent = null;
  }
});

// Confirm button
confirmButton.addEventListener('click', async () => {
  confirmButton.disabled = true;
  confirmButton.textContent = 'Saving...';
  
  try {
    await ipcRenderer.invoke('save-parsed-content', parsedData);
    
    // Show success message
    alert('Content saved successfully!');
    
    // Navigate back to upload screen
    window.location.href = 'index.html';
  } catch (error) {
    alert('Failed to save content: ' + error.message);
    confirmButton.disabled = false;
    confirmButton.textContent = 'Confirm & Save All';
  }
});

// Cancel button
cancelButton.addEventListener('click', () => {
  if (confirm('Are you sure you want to discard all parsed content?')) {
    window.location.href = 'index.html';
  }
});

// Initialize on load
initialize();
