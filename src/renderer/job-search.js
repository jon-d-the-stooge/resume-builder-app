// Job Search UI Logic
const { ipcRenderer } = require('./api/ipcAdapter');

// DOM Elements
const searchTitle = document.getElementById('searchTitle');
const searchLocation = document.getElementById('searchLocation');
const searchBtn = document.getElementById('searchBtn');
const extractUrl = document.getElementById('extractUrl');
const extractBtn = document.getElementById('extractBtn');
const resultsList = document.getElementById('resultsList');
const resultsCount = document.getElementById('resultsCount');
const emptyState = document.getElementById('emptyState');

// State
let searchResults = [];
let isSearching = false;
let autoSaveInterval = null;

// =============================================================================
// Initialization
// =============================================================================

async function initJobSearch() {
  // First try to restore previous state
  const restored = await restorePageState();

  // Then check for search params from dashboard (takes priority)
  const searchParams = sessionStorage.getItem('jobSearch');
  if (searchParams) {
    try {
      const params = JSON.parse(searchParams);
      sessionStorage.removeItem('jobSearch');

      if (params.title) {
        searchTitle.value = params.title;
      }
      if (params.location) {
        searchLocation.value = params.location;
      }

      // Auto-search
      await searchJobs();
    } catch (error) {
      console.error('Error loading search params:', error);
    }
  }

  // Setup auto-save
  setupAutoSave();
}

// =============================================================================
// State Persistence
// =============================================================================

/**
 * Save current page state for restoration on navigation
 */
async function savePageState() {
  if (searchResults.length === 0 && !searchTitle.value.trim()) return;

  const pageData = {
    searchTitle: searchTitle.value,
    searchLocation: searchLocation.value,
    searchResults: searchResults,
    extractUrl: extractUrl.value
  };

  try {
    showAutoSaveIndicator('saving');

    await ipcRenderer.invoke('app-state-save-page', {
      page: 'job-search',
      data: pageData
    });

    showAutoSaveIndicator('saved');
    console.log('[JobSearch] Page state saved');
  } catch (error) {
    console.error('[JobSearch] Error saving page state:', error);
  }
}

/**
 * Restore page state from persistent storage
 */
async function restorePageState() {
  try {
    const result = await ipcRenderer.invoke('app-state-get-page', 'job-search');

    if (result.success && result.pageState && result.pageState.data) {
      const data = result.pageState.data;

      if (data.searchTitle) {
        searchTitle.value = data.searchTitle;
      }
      if (data.searchLocation) {
        searchLocation.value = data.searchLocation;
      }
      if (data.extractUrl) {
        extractUrl.value = data.extractUrl;
      }
      if (data.searchResults && data.searchResults.length > 0) {
        searchResults = data.searchResults;
        renderResults(searchResults);
      }

      console.log('[JobSearch] Page state restored');
      return true;
    }
  } catch (error) {
    console.error('[JobSearch] Error restoring page state:', error);
  }
  return false;
}

/**
 * Setup auto-save functionality
 */
function setupAutoSave() {
  // Auto-save every 30 seconds
  autoSaveInterval = setInterval(() => {
    if (searchResults.length > 0 || searchTitle.value.trim()) {
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

/**
 * Show auto-save indicator with status
 */
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
    setTimeout(() => { indicator.classList.remove('visible'); }, 2000);
  }
}

// =============================================================================
// Search
// =============================================================================

async function searchJobs() {
  const title = searchTitle.value.trim();
  const location = searchLocation.value.trim();

  if (!title) {
    alert('Please enter a job title or keywords');
    return;
  }

  if (isSearching) return;

  isSearching = true;
  searchBtn.disabled = true;
  searchBtn.textContent = 'Searching...';
  showLoading();

  try {
    // Convert title to keywords array as expected by SearchCriteria interface
    const keywords = title.split(/[,\s]+/).filter(k => k.length > 0);
    const result = await ipcRenderer.invoke('search-jobs', {
      keywords,
      location,
      remote: location.toLowerCase().includes('remote')
    });

    if (result.success && result.results) {
      searchResults = result.results;
      renderResults(searchResults);
    } else {
      showEmpty('No results found', 'Try different keywords or location');
    }
  } catch (error) {
    console.error('Error searching jobs:', error);
    showEmpty('Search failed', error.message);
  } finally {
    isSearching = false;
    searchBtn.disabled = false;
    searchBtn.textContent = 'Search Jobs';
  }
}

async function extractJobFromUrl() {
  const url = extractUrl.value.trim();

  if (!url) {
    alert('Please enter a job posting URL');
    return;
  }

  extractBtn.disabled = true;
  extractBtn.textContent = 'Extracting...';

  try {
    const result = await ipcRenderer.invoke('extract-job-from-url', url);

    if (result.success && result.job) {
      // Show extracted job as a single result
      searchResults = [result.job];
      renderResults(searchResults);
    } else {
      showEmpty('Could not extract job details', result.message || 'The URL may not be a valid job posting');
    }
  } catch (error) {
    console.error('Error extracting job:', error);
    showEmpty('Extraction failed', error.message);
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = 'Extract';
  }
}

// =============================================================================
// Rendering
// =============================================================================

function renderResults(jobs) {
  resultsList.textContent = '';
  resultsCount.textContent = `${jobs.length} job${jobs.length !== 1 ? 's' : ''} found`;

  if (!jobs || jobs.length === 0) {
    showEmpty('No results found', 'Try different keywords or location');
    return;
  }

  jobs.forEach(job => {
    const card = createJobCard(job);
    resultsList.appendChild(card);
  });
}

function createJobCard(job) {
  const card = document.createElement('div');
  card.className = 'job-card';

  // Header
  const header = document.createElement('div');
  header.className = 'job-card-header';

  const info = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'job-card-title';
  title.textContent = job.title || 'Untitled Position';
  info.appendChild(title);

  if (job.company) {
    const company = document.createElement('div');
    company.className = 'job-card-company';
    company.textContent = job.company;
    info.appendChild(company);
  }

  if (job.location) {
    const location = document.createElement('div');
    location.className = 'job-card-location';
    location.textContent = job.location;
    info.appendChild(location);
  }

  header.appendChild(info);

  // Relevance badge
  if (job.relevanceScore !== undefined) {
    const badge = document.createElement('span');
    const score = job.relevanceScore;
    badge.className = `relevance-badge ${score >= 0.7 ? 'relevance-high' : score >= 0.4 ? 'relevance-medium' : 'relevance-low'}`;
    badge.textContent = `${Math.round(score * 100)}% match`;
    header.appendChild(badge);
  }

  card.appendChild(header);

  // Meta
  const meta = document.createElement('div');
  meta.className = 'job-card-meta';

  if (job.source) {
    const source = document.createElement('span');
    source.textContent = job.source;
    meta.appendChild(source);
  }

  if (job.postedDate) {
    const posted = document.createElement('span');
    posted.textContent = formatDate(job.postedDate);
    meta.appendChild(posted);
  }

  if (meta.children.length > 0) {
    card.appendChild(meta);
  }

  // Description (use description or snippet for search results)
  if (job.description || job.snippet) {
    const desc = document.createElement('div');
    desc.className = 'job-card-description';
    desc.textContent = job.description || job.snippet;
    card.appendChild(desc);
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'job-card-actions';

  const addToQueueBtn = document.createElement('button');
  addToQueueBtn.className = 'btn btn-primary';
  addToQueueBtn.textContent = 'Add to Queue';
  addToQueueBtn.onclick = () => addToQueue(job, addToQueueBtn);
  actions.appendChild(addToQueueBtn);

  const optimizeBtn = document.createElement('button');
  optimizeBtn.className = 'btn btn-secondary';
  optimizeBtn.textContent = 'Optimize Now';
  optimizeBtn.onclick = () => optimizeNow(job, optimizeBtn);
  actions.appendChild(optimizeBtn);

  if (job.url) {
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-secondary';
    viewBtn.textContent = 'View Posting';
    viewBtn.onclick = () => window.open(job.url, '_blank');
    actions.appendChild(viewBtn);
  }

  card.appendChild(actions);

  return card;
}

function showLoading() {
  resultsList.textContent = '';

  const loading = document.createElement('div');
  loading.className = 'loading-state';

  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  loading.appendChild(spinner);

  const text = document.createElement('div');
  text.className = 'loading-text';
  text.textContent = 'Searching for jobs...';
  loading.appendChild(text);

  resultsList.appendChild(loading);
}

function showEmpty(title, text) {
  resultsList.textContent = '';
  resultsCount.textContent = '0 jobs found';

  const empty = document.createElement('div');
  empty.className = 'empty-state';

  const icon = document.createElement('div');
  icon.className = 'empty-state-icon';
  icon.textContent = '\u{1F50D}'; // Magnifying glass
  empty.appendChild(icon);

  const titleEl = document.createElement('div');
  titleEl.className = 'empty-state-title';
  titleEl.textContent = title;
  empty.appendChild(titleEl);

  const textEl = document.createElement('div');
  textEl.className = 'empty-state-text';
  textEl.textContent = text;
  empty.appendChild(textEl);

  resultsList.appendChild(empty);
}

// =============================================================================
// Actions
// =============================================================================

async function addToQueue(job, button) {
  // Check if job has full content (extracted jobs have structured arrays)
  const hasFullContent = job.requirements?.length || job.responsibilities?.length || job.preferredQualifications?.length;
  const sourceUrl = job.url || job.sourceUrl;

  // If search result (no full content) and has URL, extract first
  if (!hasFullContent && sourceUrl) {
    console.log('[addToQueue] Search result detected, extracting full content from:', sourceUrl);

    // Show loading state
    if (button) {
      button.disabled = true;
      button.textContent = 'Extracting...';
    }

    try {
      const result = await ipcRenderer.invoke('extract-job-from-url', sourceUrl);

      if (result.success && result.job) {
        // Use extracted job data
        job = { ...job, ...result.job };
        console.log('[addToQueue] Extraction successful, updated job fields:', {
          reqCount: job.requirements?.length,
          respCount: job.responsibilities?.length,
          prefCount: job.preferredQualifications?.length
        });
      } else {
        console.warn('[addToQueue] Extraction failed, falling back to original data:', result.error);
      }
    } catch (error) {
      console.warn('[addToQueue] Extraction error, falling back to original data:', error.message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Add to Queue';
      }
    }
  }

  // DEBUG: Log job object fields
  console.log('[addToQueue] final job fields:', {
    title: job.title,
    descLen: job.description?.length,
    reqCount: job.requirements?.length,
    respCount: job.responsibilities?.length,
    prefCount: job.preferredQualifications?.length,
    allKeys: Object.keys(job)
  });

  try {
    await ipcRenderer.invoke('job-queue-add', {
      title: job.title,
      company: job.company,
      sourceUrl: job.url || job.sourceUrl,
      description: job.description || job.snippet || '',
      // Pass structured fields for full description reconstruction
      requirements: job.requirements || [],
      preferredQualifications: job.preferredQualifications || [],
      responsibilities: job.responsibilities || []
    });

    // Save state after successful queue add
    savePageState();

    alert(`Added "${job.title}" to queue`);
  } catch (error) {
    console.error('Error adding to queue:', error);
    alert('Failed to add job to queue: ' + error.message);
  }
}

async function optimizeNow(job, button) {
  // Save current state before navigating
  savePageState();

  // Check if job has full content:
  // 1. Structured arrays from extraction (requirements, responsibilities)
  // 2. Full description from API (> 1000 chars means it's not just a snippet)
  const hasStructuredContent = job.requirements?.length || job.responsibilities?.length || job.preferredQualifications?.length;
  const hasFullDescription = job.description && job.description.length > 1000;
  const hasFullContent = hasStructuredContent || hasFullDescription;
  const sourceUrl = job.url || job.sourceUrl;

  // If we already have full description from API, use it directly
  if (hasFullDescription && !hasStructuredContent) {
    console.log('[optimizeNow] Using full description from API:', job.description.length, 'chars');
  }

  // Only try to extract if we just have a snippet (no full content) and have a URL
  if (!hasFullContent && sourceUrl) {
    console.log('[optimizeNow] Only have snippet, extracting full content from:', sourceUrl);

    // Show loading state
    if (button) {
      button.disabled = true;
      button.textContent = 'Extracting...';
    }

    try {
      const result = await ipcRenderer.invoke('extract-job-from-url', sourceUrl);

      if (result.success && result.job) {
        // Use extracted job data
        job = { ...job, ...result.job };
        console.log('[optimizeNow] Extraction successful, updated job fields:', {
          reqCount: job.requirements?.length,
          respCount: job.responsibilities?.length,
          prefCount: job.preferredQualifications?.length
        });
      } else {
        console.warn('[optimizeNow] Extraction failed, using available content:', result.message || result.error);
      }
    } catch (error) {
      console.warn('[optimizeNow] Extraction error, using available content:', error.message);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Optimize Now';
      }
    }
  }

  // Build full description for optimizer from structured fields (use snippet for search results)
  const parts = [job.description || job.snippet || ''];
  if (job.requirements?.length) {
    parts.push('', '## Requirements');
    parts.push(...job.requirements.map(r => `- ${r}`));
  }
  if (job.preferredQualifications?.length) {
    parts.push('', '## Preferred Qualifications');
    parts.push(...job.preferredQualifications.map(q => `- ${q}`));
  }
  if (job.responsibilities?.length) {
    parts.push('', '## Responsibilities');
    parts.push(...job.responsibilities.map(r => `- ${r}`));
  }

  sessionStorage.setItem('quickOptimize', JSON.stringify({
    title: job.title,
    company: job.company,
    description: parts.filter(l => l !== '').join('\n')
  }));

  window.location.href = './optimizer.html';
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

// =============================================================================
// Event Listeners
// =============================================================================

searchBtn.addEventListener('click', searchJobs);
extractBtn.addEventListener('click', extractJobFromUrl);

// Enter to search
searchTitle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchJobs();
});

searchLocation.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchJobs();
});

extractUrl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') extractJobFromUrl();
});

// =============================================================================
// Initialize on Load
// =============================================================================

document.addEventListener('DOMContentLoaded', initJobSearch);
