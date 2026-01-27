// Content item editor UI logic
const { ipcRenderer } = require('./api/ipcAdapter');

// DOM elements
const loadingState = document.getElementById('loadingState');
const editorContent = document.getElementById('editorContent');
const form = document.getElementById('editForm');
const contentTypeSelect = document.getElementById('contentType');
const contentTextArea = document.getElementById('contentText');
const tagInput = document.getElementById('tagInput');
const tagList = document.getElementById('tagList');
const tagSuggestions = document.getElementById('tagSuggestions');
const saveButton = document.getElementById('saveButton');
const cancelButton = document.getElementById('cancelButton');
const successMessage = document.getElementById('successMessage');
const createdAtDisplay = document.getElementById('createdAt');

// Form state
let selectedTags = [];
let currentContentItem = null;
let contentItemId = null;

// Tag suggestions based on content type
const tagSuggestionsByType = {
  'job-entry': ['job-entry', 'employment', 'work-experience'],
  'job-title': ['job-title', 'position', 'role'],
  'job-location': ['job-location', 'location', 'workplace'],
  'job-duration': ['job-duration', 'employment-period', 'dates'],
  'skill': ['skill', 'technical-skill', 'soft-skill', 'programming', 'language', 'framework', 'tool'],
  'accomplishment': ['accomplishment', 'achievement', 'project', 'impact'],
  'education': ['education', 'degree', 'university', 'college', 'certification-program'],
  'certification': ['certification', 'credential', 'license', 'professional-certification']
};

// Common tag suggestions
const commonTags = [
  'leadership', 'management', 'teamwork', 'communication',
  'problem-solving', 'innovation', 'performance', 'optimization',
  'development', 'design', 'architecture', 'testing'
];

// Initialize
async function init() {
  // Get content item ID from URL params
  const urlParams = new URLSearchParams(window.location.search);
  contentItemId = urlParams.get('id');
  
  if (!contentItemId) {
    alert('No content item ID provided');
    window.location.href = './search.html';
    return;
  }
  
  await loadContentItem();
  setupEventListeners();
}

// Load content item data
async function loadContentItem() {
  try {
    const contentItem = await ipcRenderer.invoke('get-content-item', contentItemId);
    
    if (!contentItem) {
      alert('Content item not found');
      window.location.href = './search.html';
      return;
    }
    
    currentContentItem = contentItem;
    populateForm(contentItem);
    
    // Show editor, hide loading
    loadingState.classList.add('hidden');
    editorContent.classList.remove('hidden');
  } catch (error) {
    alert('Failed to load content item: ' + error.message);
    window.location.href = './search.html';
  }
}

// Populate form with content item data
function populateForm(contentItem) {
  // Set content type
  contentTypeSelect.value = contentItem.type;
  
  // Set content text
  contentTextArea.value = contentItem.content;
  
  // Set tags
  selectedTags = [...contentItem.tags];
  renderTags();
  
  // Set created date display
  if (contentItem.createdAt) {
    const date = new Date(contentItem.createdAt);
    createdAtDisplay.textContent = date.toLocaleString();
  }
  
  // Set metadata
  const metadata = contentItem.metadata || {};
  
  // Date range
  if (metadata.dateRange) {
    if (metadata.dateRange.start) {
      document.getElementById('startDate').value = metadata.dateRange.start;
    }
    if (metadata.dateRange.end) {
      document.getElementById('endDate').value = metadata.dateRange.end;
    }
  }
  
  // Location
  if (metadata.location) {
    if (metadata.location.city) {
      document.getElementById('city').value = metadata.location.city;
    }
    if (metadata.location.state) {
      document.getElementById('state').value = metadata.location.state;
    }
    if (metadata.location.country) {
      document.getElementById('country').value = metadata.location.country;
    }
  }
  
  // Company
  if (metadata.company) {
    document.getElementById('company').value = metadata.company;
  }
  
  // Proficiency
  if (metadata.proficiency) {
    document.getElementById('proficiency').value = metadata.proficiency;
  }
  
  // Notes
  if (metadata.notes) {
    document.getElementById('notes').value = metadata.notes;
  }
  
  updateTagSuggestions();
}

// Setup event listeners
function setupEventListeners() {
  form.addEventListener('submit', handleSubmit);
  cancelButton.addEventListener('click', handleCancel);
  contentTypeSelect.addEventListener('change', handleTypeChange);
  tagInput.addEventListener('input', handleTagInput);
  tagInput.addEventListener('keydown', handleTagKeydown);
  tagInput.addEventListener('focus', () => {
    if (tagInput.value.trim()) {
      tagSuggestions.classList.add('visible');
    }
  });
  tagInput.addEventListener('blur', () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      tagSuggestions.classList.remove('visible');
    }, 200);
  });
}

// Handle content type change
function handleTypeChange() {
  clearValidationError('contentType');
  updateTagSuggestions();
}

// Update tag suggestions based on content type
function updateTagSuggestions() {
  const contentType = contentTypeSelect.value;
  const suggestions = contentType ? tagSuggestionsByType[contentType] || [] : [];
  const allSuggestions = [...new Set([...suggestions, ...commonTags])];
  
  renderTagSuggestions(allSuggestions.filter(tag => !selectedTags.includes(tag)));
}

// Handle tag input
function handleTagInput(e) {
  const value = e.target.value.trim().toLowerCase();
  
  if (value) {
    const contentType = contentTypeSelect.value;
    const suggestions = contentType ? tagSuggestionsByType[contentType] || [] : [];
    const allSuggestions = [...new Set([...suggestions, ...commonTags])];
    
    const filtered = allSuggestions.filter(tag => 
      tag.includes(value) && !selectedTags.includes(tag)
    );
    
    renderTagSuggestions(filtered);
    tagSuggestions.classList.add('visible');
  } else {
    updateTagSuggestions();
    tagSuggestions.classList.remove('visible');
  }
}

// Handle tag input keydown
function handleTagKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const value = tagInput.value.trim().toLowerCase();
    if (value) {
      addTag(value);
      tagInput.value = '';
      updateTagSuggestions();
      tagSuggestions.classList.remove('visible');
    }
  }
}

// Render tag suggestions
function renderTagSuggestions(suggestions) {
  tagSuggestions.innerHTML = '';
  
  suggestions.forEach(tag => {
    const item = document.createElement('div');
    item.className = 'tag-suggestion-item';
    item.textContent = tag;
    item.addEventListener('click', () => {
      addTag(tag);
      tagInput.value = '';
      updateTagSuggestions();
    });
    tagSuggestions.appendChild(item);
  });
}

// Add tag
function addTag(tag) {
  const normalizedTag = tag.trim().toLowerCase().replace(/\s+/g, '-');
  
  if (normalizedTag && !selectedTags.includes(normalizedTag)) {
    selectedTags.push(normalizedTag);
    renderTags();
  }
}

// Remove tag
function removeTag(tag) {
  selectedTags = selectedTags.filter(t => t !== tag);
  renderTags();
  updateTagSuggestions();
}

// Render tags
function renderTags() {
  tagList.innerHTML = '';
  
  selectedTags.forEach(tag => {
    const tagItem = document.createElement('div');
    tagItem.className = 'tag-item';
    tagItem.innerHTML = `
      <span>${tag}</span>
      <span class="remove-tag" data-tag="${tag}">&times;</span>
    `;
    
    tagItem.querySelector('.remove-tag').addEventListener('click', (e) => {
      removeTag(e.target.dataset.tag);
    });
    
    tagList.appendChild(tagItem);
  });
}

// Validate form
function validateForm() {
  let isValid = true;
  
  // Validate content type
  if (!contentTypeSelect.value) {
    showValidationError('contentType', 'Please select a content type');
    isValid = false;
  } else {
    clearValidationError('contentType');
  }
  
  // Validate content text
  if (!contentTextArea.value.trim()) {
    showValidationError('contentText', 'Content is required');
    isValid = false;
  } else {
    clearValidationError('contentText');
  }
  
  return isValid;
}

// Show validation error
function showValidationError(fieldName, message) {
  const formGroup = document.getElementById(fieldName).closest('.form-group');
  const errorElement = document.getElementById(`${fieldName}Error`);
  
  formGroup.classList.add('error');
  if (errorElement) {
    errorElement.textContent = message;
  }
}

// Clear validation error
function clearValidationError(fieldName) {
  const formGroup = document.getElementById(fieldName).closest('.form-group');
  formGroup.classList.remove('error');
}

// Get form data
function getFormData() {
  const formData = {
    id: contentItemId,
    type: contentTypeSelect.value,
    content: contentTextArea.value.trim(),
    tags: selectedTags,
    metadata: {},
    createdAt: currentContentItem.createdAt // Preserve creation timestamp
  };
  
  // Add date range if provided
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  if (startDate) {
    formData.metadata.dateRange = {
      start: startDate,
      end: endDate || undefined
    };
  }
  
  // Add location if provided
  const city = document.getElementById('city').value.trim();
  const state = document.getElementById('state').value.trim();
  const country = document.getElementById('country').value.trim();
  if (city || state || country) {
    formData.metadata.location = {
      city: city || undefined,
      state: state || undefined,
      country: country || undefined
    };
  }
  
  // Add company if provided
  const company = document.getElementById('company').value.trim();
  if (company) {
    formData.metadata.company = company;
  }
  
  // Add proficiency if provided
  const proficiency = document.getElementById('proficiency').value;
  if (proficiency) {
    formData.metadata.proficiency = proficiency;
  }
  
  // Add notes if provided
  const notes = document.getElementById('notes').value.trim();
  if (notes) {
    formData.metadata.notes = notes;
  }
  
  return formData;
}

// Handle form submit
async function handleSubmit(e) {
  e.preventDefault();
  
  if (!validateForm()) {
    return;
  }
  
  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';
  
  try {
    const formData = getFormData();
    await ipcRenderer.invoke('update-content-item', formData);
    
    // Show success message
    successMessage.classList.add('visible');
    setTimeout(() => {
      successMessage.classList.remove('visible');
    }, 3000);
    
    // Reload content item to show updated data
    await loadContentItem();
  } catch (error) {
    alert('Failed to update content item: ' + error.message);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save Changes';
  }
}

// Handle cancel
function handleCancel() {
  if (confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
    // Navigate back to search page
    window.location.href = './search.html';
  }
}

// Initialize on load
init();
