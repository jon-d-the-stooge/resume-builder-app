// Search UI logic
import { ipcRenderer } from './lib/ipcAdapter';

// State
let selectedTags = [];
let searchResults = [];

// DOM elements
const searchForm = document.getElementById('searchForm');
const contentTypeSelect = document.getElementById('contentType');
const textSearchInput = document.getElementById('textSearch');
const tagInputContainer = document.getElementById('tagInputContainer');
const tagInput = document.getElementById('tagInput');
const dateStartInput = document.getElementById('dateStart');
const dateEndInput = document.getElementById('dateEnd');
const searchButton = document.getElementById('searchButton');
const clearButton = document.getElementById('clearButton');
const errorMessage = document.getElementById('errorMessage');
const resultsSection = document.getElementById('resultsSection');
const resultsCount = document.getElementById('resultsCount');
const resultsContainer = document.getElementById('resultsContainer');

// Initialize
function initialize() {
  setupTagInput();
  setupTagSuggestions();
  setupEventListeners();
}

// Setup tag input functionality
function setupTagInput() {
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tag = tagInput.value.trim();
      if (tag) {
        addTag(tag);
        tagInput.value = '';
      }
    } else if (e.key === 'Backspace' && tagInput.value === '' && selectedTags.length > 0) {
      // Remove last tag on backspace when input is empty
      removeTag(selectedTags[selectedTags.length - 1]);
    }
  });
}

// Setup tag suggestion clicks
function setupTagSuggestions() {
  const suggestions = document.querySelectorAll('.tag-suggestion');
  suggestions.forEach(suggestion => {
    suggestion.addEventListener('click', () => {
      const tag = suggestion.dataset.tag;
      if (!selectedTags.includes(tag)) {
        addTag(tag);
      }
    });
  });
}

// Setup event listeners
function setupEventListeners() {
  searchForm.addEventListener('submit', handleSearch);
  clearButton.addEventListener('click', clearFilters);
}

// Add tag
function addTag(tag) {
  // Remove # if user typed it
  tag = tag.replace(/^#/, '');
  
  if (selectedTags.includes(tag)) {
    return;
  }
  
  selectedTags.push(tag);
  renderTags();
}

// Remove tag
function removeTag(tag) {
  selectedTags = selectedTags.filter(t => t !== tag);
  renderTags();
}

// Render tags
function renderTags() {
  // Remove existing tag chips
  const existingChips = tagInputContainer.querySelectorAll('.tag-chip');
  existingChips.forEach(chip => chip.remove());
  
  // Add tag chips before input
  selectedTags.forEach(tag => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `
      #${escapeHtml(tag)}
      <button type="button" class="tag-chip-remove" data-tag="${escapeHtml(tag)}">&times;</button>
    `;
    
    const removeBtn = chip.querySelector('.tag-chip-remove');
    removeBtn.addEventListener('click', () => {
      removeTag(tag);
    });
    
    tagInputContainer.insertBefore(chip, tagInput);
  });
}

// Handle search
async function handleSearch(e) {
  e.preventDefault();
  
  hideError();
  
  // Build search query
  const query = buildSearchQuery();
  
  // Validate query has at least one criterion
  if (!hasSearchCriteria(query)) {
    showError('Please enter at least one search criterion');
    return;
  }
  
  // Show loading
  showLoading();
  
  try {
    // Send search request to main process
    searchResults = await ipcRenderer.invoke('search-content', query);
    
    // Display results
    displayResults(searchResults);
  } catch (error) {
    showError('Search failed: ' + error.message);
    hideLoading();
  }
}

// Build search query from form inputs
function buildSearchQuery() {
  const query = {};
  
  // Content type
  const contentType = contentTypeSelect.value;
  if (contentType) {
    query.contentType = contentType;
  }
  
  // Text search
  const text = textSearchInput.value.trim();
  if (text) {
    query.text = text;
  }
  
  // Tags
  if (selectedTags.length > 0) {
    query.tags = selectedTags;
  }
  
  // Date range
  const dateStart = dateStartInput.value;
  const dateEnd = dateEndInput.value;
  if (dateStart || dateEnd) {
    query.dateRange = {};
    if (dateStart) {
      query.dateRange.start = dateStart;
    }
    if (dateEnd) {
      query.dateRange.end = dateEnd;
    }
  }
  
  return query;
}

// Check if query has at least one search criterion
function hasSearchCriteria(query) {
  return !!(
    query.contentType ||
    query.text ||
    (query.tags && query.tags.length > 0) ||
    query.dateRange
  );
}

// Clear all filters
function clearFilters() {
  contentTypeSelect.value = '';
  textSearchInput.value = '';
  selectedTags = [];
  renderTags();
  dateStartInput.value = '';
  dateEndInput.value = '';
  
  // Hide results
  resultsSection.style.display = 'none';
  searchResults = [];
  
  hideError();
}

// Show loading state
function showLoading() {
  resultsSection.style.display = 'block';
  resultsContainer.innerHTML = `
    <div class="loading">
      <div class="loading-spinner"></div>
      <p>Searching...</p>
    </div>
  `;
}

// Hide loading state
function hideLoading() {
  const loading = resultsContainer.querySelector('.loading');
  if (loading) {
    loading.remove();
  }
}

// Display search results
function displayResults(results) {
  hideLoading();
  resultsSection.style.display = 'block';
  
  // Update count
  resultsCount.innerHTML = `Found <strong>${results.length}</strong> result${results.length !== 1 ? 's' : ''}`;
  
  // Handle empty results
  if (results.length === 0) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <p class="empty-state-text">No results found matching your search criteria</p>
      </div>
    `;
    return;
  }
  
  // Render results
  resultsContainer.innerHTML = results.map(result => renderResult(result)).join('');
}

// Render a single result
function renderResult(result) {
  return `
    <div class="result-item">
      <div class="result-header">
        <span class="result-type">${formatContentType(result.type)}</span>
        <button class="btn-edit" data-id="${escapeHtml(result.id)}" onclick="handleEdit('${escapeHtml(result.id)}')">Edit</button>
      </div>
      
      <div class="result-content">
        ${escapeHtml(result.content)}
      </div>
      
      ${renderMetadata(result)}
      
      ${result.tags && result.tags.length > 0 ? `
        <div class="result-tags">
          ${result.tags.map(tag => `<span class="result-tag">#${escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}
      
      ${result.parentId ? `
        <div class="result-parent">
          <strong>Parent:</strong> ${escapeHtml(result.parentId)}
        </div>
      ` : ''}
    </div>
  `;
}

// Render metadata
function renderMetadata(result) {
  const metadata = result.metadata || {};
  const items = [];
  
  // Company
  if (metadata.company) {
    items.push(`<div class="result-metadata-item">🏢 ${escapeHtml(metadata.company)}</div>`);
  }
  
  // Location
  if (metadata.location) {
    const location = formatLocation(metadata.location);
    if (location) {
      items.push(`<div class="result-metadata-item">📍 ${location}</div>`);
    }
  }
  
  // Date range
  if (metadata.dateRange) {
    const dateRange = formatDateRange(metadata.dateRange);
    items.push(`<div class="result-metadata-item">📅 ${dateRange}</div>`);
  }
  
  // Proficiency
  if (metadata.proficiency) {
    items.push(`<div class="result-metadata-item">⭐ ${escapeHtml(metadata.proficiency)}</div>`);
  }
  
  if (items.length === 0) {
    return '';
  }
  
  return `<div class="result-metadata">${items.join('')}</div>`;
}

// Format content type for display
function formatContentType(type) {
  const typeMap = {
    'job-entry': 'Job Entry',
    'job-title': 'Job Title',
    'job-location': 'Job Location',
    'job-duration': 'Job Duration',
    'skill': 'Skill',
    'accomplishment': 'Accomplishment',
    'education': 'Education',
    'certification': 'Certification'
  };
  return typeMap[type] || type;
}

// Format location
function formatLocation(location) {
  const parts = [];
  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);
  if (location.country) parts.push(location.country);
  return escapeHtml(parts.join(', '));
}

// Format date range
function formatDateRange(dateRange) {
  if (!dateRange) return '';
  
  const start = dateRange.start 
    ? new Date(dateRange.start).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    : 'Unknown';
  
  const end = dateRange.end 
    ? new Date(dateRange.end).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    : 'Present';
  
  return `${start} - ${end}`;
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.add('visible');
  
  setTimeout(() => {
    hideError();
  }, 5000);
}

// Hide error message
function hideError() {
  errorMessage.classList.remove('visible');
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// Handle edit button click
function handleEdit(contentItemId) {
  // Navigate to edit page with content item ID
  window.location.href = `./edit.html?id=${encodeURIComponent(contentItemId)}`;
}

// Initialize on load
initialize();
