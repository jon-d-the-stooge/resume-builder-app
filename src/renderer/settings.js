/**
 * Settings Page Logic
 * Handles API key configuration and LLM provider selection
 */

// Use Electron's IPC for communication with main process
const { ipcRenderer } = require('electron');

// DOM Elements
const form = document.getElementById('settingsForm');
const messageEl = document.getElementById('message');
const providerAnthropic = document.getElementById('providerAnthropic');
const providerOpenai = document.getElementById('providerOpenai');
const anthropicInput = document.getElementById('anthropicApiKey');
const openaiInput = document.getElementById('openaiApiKey');
const anthropicStatus = document.getElementById('anthropicStatus');
const openaiStatus = document.getElementById('openaiStatus');
const toggleAnthropic = document.getElementById('toggleAnthropic');
const toggleOpenai = document.getElementById('toggleOpenai');
const testAnthropic = document.getElementById('testAnthropic');
const testOpenai = document.getElementById('testOpenai');
const anthropicTestStatus = document.getElementById('anthropicTestStatus');
const openaiTestStatus = document.getElementById('openaiTestStatus');
const saveButton = document.getElementById('saveButton');
const cancelButton = document.getElementById('cancelButton');

// JSearch elements
const jsearchApiKeyInput = document.getElementById('jsearchApiKey');
const jsearchStatus = document.getElementById('jsearchStatus');
const toggleJSearch = document.getElementById('toggleJSearch');

// Adzuna elements
const adzunaAppIdInput = document.getElementById('adzunaAppId');
const adzunaApiKeyInput = document.getElementById('adzunaApiKey');
const adzunaStatus = document.getElementById('adzunaStatus');
const toggleAdzuna = document.getElementById('toggleAdzuna');

// Track original values to detect changes
let originalSettings = null;

// Show message helper
function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `message visible ${type}`;
  setTimeout(() => {
    messageEl.classList.remove('visible');
  }, 5000);
}

// Create status span element safely
function createStatusSpan(statusClass, text) {
  const span = document.createElement('span');
  span.className = `status-indicator ${statusClass}`;
  span.textContent = text;
  return span;
}

// Update status container with new span
function setStatusContent(container, statusClass, text) {
  container.textContent = ''; // Clear existing content
  container.appendChild(createStatusSpan(statusClass, text));
}

// Update status indicator
function updateStatusIndicator(element, configured) {
  element.className = `status-indicator ${configured ? 'status-configured' : 'status-not-configured'}`;
  element.textContent = configured ? 'Configured' : 'Not configured';
}

// Toggle password visibility
function setupToggle(button, input) {
  button.addEventListener('click', () => {
    if (input.type === 'password') {
      input.type = 'text';
      button.textContent = 'Hide';
    } else {
      input.type = 'password';
      button.textContent = 'Show';
    }
  });
}

// Test API key
async function testApiKey(provider, input, statusEl, statusIndicator) {
  const apiKey = input.value.trim();

  // If it's a masked value, it's already valid (stored)
  if (apiKey.startsWith('••••')) {
    setStatusContent(statusEl, 'status-valid', 'Using stored key');
    return;
  }

  if (!apiKey) {
    setStatusContent(statusEl, 'status-invalid', 'No key provided');
    return;
  }

  setStatusContent(statusEl, 'status-validating', 'Testing...');

  try {
    const result = await ipcRenderer.invoke('validate-api-key', { provider, apiKey });

    if (result.valid) {
      setStatusContent(statusEl, 'status-valid', 'Valid key');
      input.classList.add('has-key');
      updateStatusIndicator(statusIndicator, true);
    } else {
      const errorText = 'Invalid: ' + (result.error || 'Unknown error');
      setStatusContent(statusEl, 'status-invalid', errorText);
    }
  } catch (error) {
    const errorText = 'Test failed: ' + error.message;
    setStatusContent(statusEl, 'status-invalid', errorText);
  }
}

// Load current settings
async function loadSettings() {
  try {
    const settings = await ipcRenderer.invoke('get-settings');
    originalSettings = settings;

    // Set provider
    if (settings.llmProvider === 'openai') {
      providerOpenai.checked = true;
    } else {
      providerAnthropic.checked = true;
    }

    // Set API key fields (masked values)
    if (settings.anthropicApiKey) {
      anthropicInput.value = settings.anthropicApiKey;
      anthropicInput.classList.add('has-key');
    }

    if (settings.openaiApiKey) {
      openaiInput.value = settings.openaiApiKey;
      openaiInput.classList.add('has-key');
    }

    // Update status indicators
    updateStatusIndicator(anthropicStatus, settings.hasAnthropicKey);
    updateStatusIndicator(openaiStatus, settings.hasOpenaiKey);

    // Load JSearch settings
    if (settings.jsearchApiKey) {
      jsearchApiKeyInput.value = settings.jsearchApiKey;
      jsearchApiKeyInput.classList.add('has-key');
    }
    updateStatusIndicator(jsearchStatus, settings.hasJSearchKey);

    // Load Adzuna settings
    if (settings.adzunaAppId) {
      adzunaAppIdInput.value = settings.adzunaAppId;
      adzunaAppIdInput.classList.add('has-key');
    }
    if (settings.adzunaApiKey) {
      adzunaApiKeyInput.value = settings.adzunaApiKey;
      adzunaApiKeyInput.classList.add('has-key');
    }
    updateStatusIndicator(adzunaStatus, settings.hasAdzunaKey);

  } catch (error) {
    console.error('Failed to load settings:', error);
    showMessage('Failed to load settings: ' + error.message, 'error');
  }
}

// Save settings
async function saveSettings(event) {
  event.preventDefault();

  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';

  try {
    const newSettings = {
      llmProvider: providerOpenai.checked ? 'openai' : 'anthropic'
    };

    // Only include API keys if they've been changed (not masked)
    const anthropicKey = anthropicInput.value.trim();
    if (anthropicKey && !anthropicKey.startsWith('••••')) {
      newSettings.anthropicApiKey = anthropicKey;
    }

    const openaiKey = openaiInput.value.trim();
    if (openaiKey && !openaiKey.startsWith('••••')) {
      newSettings.openaiApiKey = openaiKey;
    }

    // JSearch credentials
    const jsearchKey = jsearchApiKeyInput.value.trim();
    if (jsearchKey && !jsearchKey.startsWith('••••')) {
      newSettings.jsearchApiKey = jsearchKey;
    }

    // Adzuna credentials
    const adzunaAppId = adzunaAppIdInput.value.trim();
    if (adzunaAppId) {
      newSettings.adzunaAppId = adzunaAppId;
    }

    const adzunaKey = adzunaApiKeyInput.value.trim();
    if (adzunaKey && !adzunaKey.startsWith('••••')) {
      newSettings.adzunaApiKey = adzunaKey;
    }

    const result = await ipcRenderer.invoke('save-settings', newSettings);

    if (result.success) {
      showMessage('Settings saved successfully!', 'success');
      // Reload to show updated masked values
      await loadSettings();
    } else {
      showMessage('Failed to save settings', 'error');
    }
  } catch (error) {
    console.error('Save error:', error);
    showMessage('Failed to save settings: ' + error.message, 'error');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save Settings';
  }
}

// Cancel and go back
function cancelChanges() {
  window.location.href = './index.html';
}

// Clear field when user starts typing in a masked field
function setupClearOnType(input) {
  input.addEventListener('focus', () => {
    if (input.value.startsWith('••••')) {
      input.dataset.originalMasked = input.value;
    }
  });

  input.addEventListener('input', () => {
    // If user clears the field after it had a masked value, reset styling
    if (input.value === '' && input.dataset.originalMasked) {
      input.classList.remove('has-key');
    }
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Set up event listeners
  setupToggle(toggleAnthropic, anthropicInput);
  setupToggle(toggleOpenai, openaiInput);
  setupToggle(toggleJSearch, jsearchApiKeyInput);
  setupToggle(toggleAdzuna, adzunaApiKeyInput);
  setupClearOnType(anthropicInput);
  setupClearOnType(openaiInput);
  setupClearOnType(jsearchApiKeyInput);
  setupClearOnType(adzunaApiKeyInput);

  testAnthropic.addEventListener('click', () => {
    testApiKey('anthropic', anthropicInput, anthropicTestStatus, anthropicStatus);
  });

  testOpenai.addEventListener('click', () => {
    testApiKey('openai', openaiInput, openaiTestStatus, openaiStatus);
  });

  form.addEventListener('submit', saveSettings);
  cancelButton.addEventListener('click', cancelChanges);

  // Load current settings
  await loadSettings();
});
