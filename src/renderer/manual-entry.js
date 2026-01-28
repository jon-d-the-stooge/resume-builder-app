// Manual content entry UI logic
import { ipcRenderer } from './lib/ipcAdapter';

// DOM elements
const form = document.getElementById('manualEntryForm');
const contentTypeSelect = document.getElementById('contentType');
const contentTextArea = document.getElementById('contentText');
const tagInput = document.getElementById('tagInput');
const tagList = document.getElementById('tagList');
const tagSuggestions = document.getElementById('tagSuggestions');
const submitButton = document.getElementById('submitButton');
const cancelButton = document.getElementById('cancelButton');
const successMessage = document.getElementById('successMessage');

// Form state
let selectedTags = [];

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
function init() {
  setupEventListeners();
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
  
  // Auto-add type tag if not already added
  const contentType = contentTypeSelect.value;
  if (contentType && !selectedTags.includes(contentType)) {
    addTag(contentType);
  }
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
    type: contentTypeSelect.value,
    content: contentTextArea.value.trim(),
    tags: selectedTags,
    metadata: {}
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
  
  submitButton.disabled = true;
  submitButton.textContent = 'Creating...';
  
  try {
    const formData = getFormData();
    await ipcRenderer.invoke('create-manual-content', formData);
    
    // Show success message
    successMessage.classList.add('visible');
    setTimeout(() => {
      successMessage.classList.remove('visible');
    }, 3000);
    
    // Reset form
    resetForm();
  } catch (error) {
    alert('Failed to create content item: ' + error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Create Content Item';
  }
}

// Handle cancel
function handleCancel() {
  if (confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
    resetForm();
    // Navigate back to main page
    window.location.href = './index.html';
  }
}

// Reset form
function resetForm() {
  form.reset();
  selectedTags = [];
  renderTags();
  updateTagSuggestions();
  clearValidationError('contentType');
  clearValidationError('contentText');
}

// Initialize on load
init();
