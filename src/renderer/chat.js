// Career Agent Chat UI Logic
const { ipcRenderer } = require('electron');

// DOM Elements
const messagesList = document.getElementById('messagesList');
const welcomeMessage = document.getElementById('welcomeMessage');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const quickPrompts = document.querySelectorAll('.quick-prompt');

// Context sidebar elements
const knownSkills = document.getElementById('knownSkills');
const knownPreferences = document.getElementById('knownPreferences');
const knownGoals = document.getElementById('knownGoals');

// State
let isTyping = false;
let conversationStarted = false;
let pendingSkillInference = null;

// =============================================================================
// Initialization
// =============================================================================

async function initChat() {
  // Load agent preferences for sidebar
  await loadAgentContext();

  // Check for initial prompt from dashboard
  const initialPrompt = sessionStorage.getItem('chatPrompt');
  if (initialPrompt) {
    sessionStorage.removeItem('chatPrompt');
    messageInput.value = initialPrompt;
    await sendMessage();
  }
}

// =============================================================================
// Context Loading
// =============================================================================

async function loadAgentContext() {
  try {
    // Load skills preferences from agent memory
    const skillPrefs = await ipcRenderer.invoke('agent-get-preferences', 'skill');

    // Also load skills from vault (the actual documented skills)
    let vaultSkills = [];
    try {
      vaultSkills = await ipcRenderer.invoke('search-content', { contentType: 'skill' });
    } catch (err) {
      console.log('Could not load vault skills:', err.message);
    }

    // Merge vault skills and preference skills for display
    // Vault skills are the source of truth; preferences are learned associations
    const combinedSkills = [];

    // Add vault skills first (these are documented skills)
    for (const skill of vaultSkills) {
      combinedSkills.push({
        value: skill.content,
        source: 'vault',
        proficiency: skill.metadata?.proficiency || 'documented'
      });
    }

    // Add skill preferences that aren't already in vault
    for (const pref of skillPrefs) {
      const exists = combinedSkills.some(s =>
        s.value.toLowerCase() === pref.value.toLowerCase()
      );
      if (!exists) {
        combinedSkills.push({
          value: pref.value,
          source: 'learned',
          proficiency: 'learned'
        });
      }
    }

    updateContextSection(knownSkills, combinedSkills, item => item.value);

    // Load other preferences (role, company, location, etc.)
    const allPrefs = await ipcRenderer.invoke('agent-get-preferences');

    // Filter for display
    const preferences = allPrefs.filter(p => ['role', 'company', 'location', 'remote'].includes(p.type));
    updateContextSection(knownPreferences, preferences, pref => `${pref.type}: ${pref.value}`);

    // Goals (salary expectations, etc.)
    const goals = allPrefs.filter(p => p.type === 'salary');
    updateContextSection(knownGoals, goals, pref => `Target: ${pref.value}`);
  } catch (error) {
    console.error('Error loading agent context:', error);
  }
}

function updateContextSection(container, items, formatter) {
  container.textContent = '';

  if (!items || items.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'context-empty';
    empty.textContent = container.id === 'knownSkills'
      ? 'Chat with me to learn more'
      : container.id === 'knownPreferences'
        ? 'No preferences learned yet'
        : 'Tell me about your goals';
    container.appendChild(empty);
    return;
  }

  items.slice(0, 8).forEach(item => {
    const tag = document.createElement('span');
    tag.className = 'context-tag';
    tag.textContent = formatter(item);
    container.appendChild(tag);
  });

  if (items.length > 8) {
    const more = document.createElement('span');
    more.className = 'context-tag';
    more.textContent = `+${items.length - 8} more`;
    container.appendChild(more);
  }
}

// =============================================================================
// Vault Command Processing
// =============================================================================

async function processVaultCommands(message) {
  const vaultActions = [];
  let cleanedMessage = message;

  // Process ADD_SKILL commands: [[ADD_SKILL:skill name|proficiency]]
  const skillRegex = /\[\[ADD_SKILL:([^|\]]+)\|?([^\]]*)\]\]/g;
  let match;
  while ((match = skillRegex.exec(message)) !== null) {
    const skill = match[1].trim();
    const proficiency = match[2].trim() || 'intermediate';
    try {
      const result = await ipcRenderer.invoke('agent-infer-skill', {
        skill: skill,
        source: 'conversation',
        proficiency: proficiency
      });
      if (result.success) {
        vaultActions.push({ type: 'skill', name: skill, success: true });
      } else {
        vaultActions.push({ type: 'skill', name: skill, success: false, error: result.error });
      }
    } catch (err) {
      console.error('Failed to add skill:', err);
      vaultActions.push({ type: 'skill', name: skill, success: false, error: err.message });
    }
    cleanedMessage = cleanedMessage.replace(match[0], '');
  }

  // Process ADD_JOB commands: [[ADD_JOB:title|company|description]]
  const jobRegex = /\[\[ADD_JOB:([^|\]]+)\|([^|\]]+)\|?([^\]]*)\]\]/g;
  while ((match = jobRegex.exec(message)) !== null) {
    const title = match[1].trim();
    const company = match[2].trim();
    const description = match[3].trim() || '';
    try {
      const result = await ipcRenderer.invoke('create-manual-content', {
        type: 'job_entry',
        content: description || `${title} at ${company}`,
        tags: ['from-chat'],
        metadata: {
          company: company,
          customFields: { title: title }
        }
      });
      vaultActions.push({ type: 'job', name: `${title} at ${company}`, success: !!result });
    } catch (err) {
      console.error('Failed to add job:', err);
      vaultActions.push({ type: 'job', name: `${title} at ${company}`, success: false, error: err.message });
    }
    cleanedMessage = cleanedMessage.replace(match[0], '');
  }

  // Process ADD_ACCOMPLISHMENT commands: [[ADD_ACCOMPLISHMENT:description]]
  const accomplishmentRegex = /\[\[ADD_ACCOMPLISHMENT:([^\]]+)\]\]/g;
  while ((match = accomplishmentRegex.exec(message)) !== null) {
    const description = match[1].trim();
    try {
      const result = await ipcRenderer.invoke('create-manual-content', {
        type: 'accomplishment',
        content: description,
        tags: ['from-chat']
      });
      vaultActions.push({ type: 'accomplishment', name: description.substring(0, 50), success: !!result });
    } catch (err) {
      console.error('Failed to add accomplishment:', err);
      vaultActions.push({ type: 'accomplishment', name: description.substring(0, 50), success: false, error: err.message });
    }
    cleanedMessage = cleanedMessage.replace(match[0], '');
  }

  // Process ADD_PREFERENCE commands: [[ADD_PREFERENCE:type|value|sentiment]]
  const preferenceRegex = /\[\[ADD_PREFERENCE:([^|\]]+)\|([^|\]]+)\|?([^\]]*)\]\]/g;
  while ((match = preferenceRegex.exec(message)) !== null) {
    const prefType = match[1].trim();
    const value = match[2].trim();
    const sentiment = match[3].trim() || 'positive';
    try {
      await ipcRenderer.invoke('agent-learn-preference', {
        type: prefType,
        value: value,
        sentiment: sentiment,
        weight: 0.8,
        learnedFrom: 'explicit',
        confidence: 0.9
      });
      vaultActions.push({ type: 'preference', name: `${prefType}: ${value}`, success: true });
    } catch (err) {
      console.error('Failed to add preference:', err);
      vaultActions.push({ type: 'preference', name: `${prefType}: ${value}`, success: false, error: err.message });
    }
    cleanedMessage = cleanedMessage.replace(match[0], '');
  }

  // Process SEARCH_JOBS commands: [[SEARCH_JOBS:keywords|location|remote]]
  const searchRegex = /\[\[SEARCH_JOBS:([^|\]]+)\|?([^|\]]*)\|?([^\]]*)\]\]/g;
  while ((match = searchRegex.exec(message)) !== null) {
    const keywords = match[1].trim();
    const location = match[2].trim() || '';
    const remote = match[3].trim().toLowerCase() === 'true';

    // Actually search for jobs via IPC
    try {
      console.log('[chat.js] Searching for jobs:', { keywords, location, remote });
      const searchResult = await ipcRenderer.invoke('search-jobs', {
        keywords: keywords.split(/[,\s]+/).filter(k => k.length > 0),
        location: location || undefined,
        remote: remote || undefined
      });

      if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
        vaultActions.push({
          type: 'job_search',
          name: keywords,
          success: true,
          jobs: searchResult.results // Real job data!
        });
        console.log(`[chat.js] Found ${searchResult.results.length} jobs`);
      } else {
        // Fallback to search URLs if no results
        console.log('[chat.js] No jobs found, providing search URLs');
        vaultActions.push({
          type: 'job_search',
          name: keywords,
          success: true,
          jobs: [],
          searchUrls: generateJobSearchUrls(keywords, location, remote)
        });
      }
    } catch (err) {
      console.error('[chat.js] Job search error:', err);
      // Fallback to search URLs on error
      vaultActions.push({
        type: 'job_search',
        name: keywords,
        success: false,
        error: err.message,
        searchUrls: generateJobSearchUrls(keywords, location, remote)
      });
    }

    cleanedMessage = cleanedMessage.replace(match[0], '');
  }

  // Clean up extra whitespace from removed commands
  cleanedMessage = cleanedMessage.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

  return { cleanedMessage, vaultActions };
}

function generateJobSearchUrls(keywords, location, remote) {
  const encodedKeywords = encodeURIComponent(keywords + (remote ? ' remote' : ''));
  const encodedLocation = location ? encodeURIComponent(location) : '';

  return {
    LinkedIn: `https://www.linkedin.com/jobs/search/?keywords=${encodedKeywords}${encodedLocation ? `&location=${encodedLocation}` : ''}`,
    Indeed: `https://www.indeed.com/jobs?q=${encodedKeywords}${encodedLocation ? `&l=${encodedLocation}` : ''}`,
    Glassdoor: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodedKeywords}`,
    Google: `https://www.google.com/search?q=${encodedKeywords}+jobs${encodedLocation ? `+${encodedLocation}` : ''}`
  };
}

function showVaultActionsSummary(actions) {
  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'vault-actions-summary';

  // Handle job searches separately
  const jobSearches = actions.filter(a => a.type === 'job_search');
  const vaultActions = actions.filter(a => a.type !== 'job_search');

  // Show job search results
  if (jobSearches.length > 0) {
    for (const search of jobSearches) {
      const searchDiv = document.createElement('div');
      searchDiv.className = 'job-search-results';

      const title = document.createElement('div');
      title.className = 'job-search-title';
      title.textContent = 'Job Search Results: ' + search.name;
      searchDiv.appendChild(title);

      // Show actual job results if we have them
      if (search.jobs && search.jobs.length > 0) {
        const jobsContainer = document.createElement('div');
        jobsContainer.className = 'job-cards-container';

        for (const job of search.jobs.slice(0, 10)) { // Show up to 10 jobs
          const jobCard = createJobCard(job);
          jobsContainer.appendChild(jobCard);
        }

        searchDiv.appendChild(jobsContainer);

        // Show "more results" message if there are more
        if (search.jobs.length > 10) {
          const moreMsg = document.createElement('div');
          moreMsg.className = 'job-more-results';
          moreMsg.textContent = `+ ${search.jobs.length - 10} more results. Ask me to show more or narrow your search.`;
          searchDiv.appendChild(moreMsg);
        }
      } else if (search.searchUrls) {
        // Fallback: show search URLs if no jobs found
        const noResultsMsg = document.createElement('div');
        noResultsMsg.className = 'job-no-results';
        noResultsMsg.textContent = 'No jobs found via automated search. Try these job boards:';
        searchDiv.appendChild(noResultsMsg);

        const linksDiv = document.createElement('div');
        linksDiv.className = 'job-search-links';

        for (const [site, url] of Object.entries(search.searchUrls)) {
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'job-search-link';
          link.textContent = site;
          link.onclick = function(e) {
            e.preventDefault();
            require('electron').shell.openExternal(url);
          };
          linksDiv.appendChild(link);
        }

        searchDiv.appendChild(linksDiv);
      }

      summaryDiv.appendChild(searchDiv);
    }
  }

  // Show vault actions
  const successful = vaultActions.filter(a => a.success);
  const failed = vaultActions.filter(a => !a.success);

  if (successful.length > 0) {
    const successText = document.createElement('div');
    successText.className = 'vault-action-success';
    successText.textContent = '✓ Added to vault: ' + successful.map(a => a.name).join(', ');
    summaryDiv.appendChild(successText);
  }

  if (failed.length > 0) {
    const failText = document.createElement('div');
    failText.className = 'vault-action-fail';
    failText.textContent = '✗ Failed to add: ' + failed.map(a => a.name).join(', ');
    summaryDiv.appendChild(failText);
  }

  messagesList.appendChild(summaryDiv);
  messagesList.scrollTop = messagesList.scrollHeight;

  // Don't auto-remove job searches
  if (jobSearches.length === 0) {
    setTimeout(function() {
      summaryDiv.style.opacity = '0';
      setTimeout(function() { summaryDiv.remove(); }, 300);
    }, 5000);
  }
}

function createJobCard(job) {
  const card = document.createElement('div');
  card.className = 'job-card';

  // Title and company
  const header = document.createElement('div');
  header.className = 'job-card-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'job-card-title';
  titleEl.textContent = job.title;
  header.appendChild(titleEl);

  const companyEl = document.createElement('div');
  companyEl.className = 'job-card-company';
  companyEl.textContent = job.company + (job.location ? ' • ' + job.location : '');
  header.appendChild(companyEl);

  card.appendChild(header);

  // Salary if available
  if (job.salary) {
    const salaryEl = document.createElement('div');
    salaryEl.className = 'job-card-salary';
    salaryEl.textContent = job.salary;
    card.appendChild(salaryEl);
  }

  // Tags (remote, etc.)
  const tagsDiv = document.createElement('div');
  tagsDiv.className = 'job-card-tags';
  if (job.remote) {
    const remoteTag = document.createElement('span');
    remoteTag.className = 'job-tag remote';
    remoteTag.textContent = 'Remote';
    tagsDiv.appendChild(remoteTag);
  }
  if (job.postedDate) {
    const dateTag = document.createElement('span');
    dateTag.className = 'job-tag date';
    const posted = new Date(job.postedDate);
    const daysAgo = Math.floor((Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24));
    dateTag.textContent = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : daysAgo + ' days ago';
    tagsDiv.appendChild(dateTag);
  }
  if (tagsDiv.children.length > 0) {
    card.appendChild(tagsDiv);
  }

  // Description snippet
  if (job.snippet) {
    const snippetEl = document.createElement('div');
    snippetEl.className = 'job-card-snippet';
    snippetEl.textContent = job.snippet.substring(0, 200) + (job.snippet.length > 200 ? '...' : '');
    card.appendChild(snippetEl);
  }

  // Actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'job-card-actions';

  // View job button
  if (job.sourceUrl) {
    const viewBtn = document.createElement('button');
    viewBtn.className = 'job-action-btn view';
    viewBtn.textContent = 'View Job';
    viewBtn.onclick = function() {
      require('electron').shell.openExternal(job.sourceUrl);
    };
    actionsDiv.appendChild(viewBtn);
  }

  // Add to queue button
  const queueBtn = document.createElement('button');
  queueBtn.className = 'job-action-btn queue';
  queueBtn.textContent = 'Add to Queue';
  queueBtn.onclick = async function() {
    try {
      await ipcRenderer.invoke('job-queue-add', {
        sourceUrl: job.sourceUrl,
        company: job.company,
        title: job.title,
        rawDescription: job.snippet
      });
      queueBtn.textContent = '✓ Added';
      queueBtn.disabled = true;
      queueBtn.className = 'job-action-btn added';
    } catch (err) {
      console.error('Failed to add to queue:', err);
      queueBtn.textContent = 'Failed';
    }
  };
  actionsDiv.appendChild(queueBtn);

  card.appendChild(actionsDiv);

  return card;
}

// =============================================================================
// Message Handling
// =============================================================================

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isTyping) return;

  // Hide welcome message on first conversation
  if (!conversationStarted) {
    welcomeMessage.style.display = 'none';
    conversationStarted = true;
  }

  // Add user message
  addMessage(text, 'user');
  messageInput.value = '';
  messageInput.style.height = 'auto';

  // Show typing indicator
  showTyping();

  try {
    // Send to agent
    console.log('[chat.js] Sending to agent-chat:', text);
    const response = await ipcRenderer.invoke('agent-chat', text);
    console.log('[chat.js] Got response:', response);

    // Hide typing and show response
    hideTyping();

    if (!response || !response.message) {
      console.error('[chat.js] Invalid response:', response);
      addMessage('Sorry, I received an invalid response from the agent.', 'assistant');
      return;
    }

    // Process any vault commands in the response
    const { cleanedMessage, vaultActions } = await processVaultCommands(response.message);

    addMessage(cleanedMessage, 'assistant');

    // Show what was added to vault
    if (vaultActions.length > 0) {
      showVaultActionsSummary(vaultActions);
    }

    // Refresh context sidebar (agent may have learned something)
    await loadAgentContext();
  } catch (error) {
    console.error('[chat.js] Error:', error);
    hideTyping();
    addMessage(`Sorry, I encountered an error: ${error.message}`, 'assistant');
  }
}

function addMessage(text, type, options = {}) {
  const message = document.createElement('div');
  message.className = `message ${type}`;

  if (type === 'assistant') {
    // Parse and render markdown safely using DOM methods
    renderMarkdownSafe(message, text);
  } else {
    message.textContent = text;
  }

  messagesList.appendChild(message);

  // Add skill inference suggestion if detected
  if (options.skillSuggestion) {
    addSkillInferenceSuggestion(options.skillSuggestion);
  }

  // Scroll to bottom
  messagesList.scrollTop = messagesList.scrollHeight;
}

function renderMarkdownSafe(container, text) {
  // Split text into lines and process each
  const lines = text.split('\n');
  let currentParagraph = null;
  let currentList = null;

  function flushParagraph() {
    if (currentParagraph) {
      container.appendChild(currentParagraph);
      currentParagraph = null;
    }
  }

  function flushList() {
    if (currentList) {
      container.appendChild(currentList);
      currentList = null;
    }
  }

  for (const line of lines) {
    // Headers
    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      const h4 = document.createElement('h4');
      h4.textContent = line.substring(4);
      container.appendChild(h4);
    } else if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      const h3 = document.createElement('h3');
      h3.textContent = line.substring(3);
      container.appendChild(h3);
    } else if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      const h2 = document.createElement('h2');
      h2.textContent = line.substring(2);
      container.appendChild(h2);
    }
    // Bullet points
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      flushParagraph();
      if (!currentList) {
        currentList = document.createElement('ul');
      }
      const li = document.createElement('li');
      renderInlineFormatting(li, line.substring(2));
      currentList.appendChild(li);
    }
    // Empty line
    else if (line.trim() === '') {
      flushParagraph();
      flushList();
    }
    // Regular text
    else {
      flushList();
      if (!currentParagraph) {
        currentParagraph = document.createElement('p');
      } else {
        currentParagraph.appendChild(document.createElement('br'));
      }
      renderInlineFormatting(currentParagraph, line);
    }
  }

  flushParagraph();
  flushList();
}

function renderInlineFormatting(container, text) {
  // Handle bold and italic with safe DOM methods
  const boldItalicRegex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = boldItalicRegex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
    }

    const matchedText = match[0];
    if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
      // Bold
      const strong = document.createElement('strong');
      strong.textContent = matchedText.slice(2, -2);
      container.appendChild(strong);
    } else if (matchedText.startsWith('*') && matchedText.endsWith('*')) {
      // Italic
      const em = document.createElement('em');
      em.textContent = matchedText.slice(1, -1);
      container.appendChild(em);
    }

    lastIndex = boldItalicRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.substring(lastIndex)));
  }
}

function addSkillInferenceSuggestion(skill) {
  const suggestionDiv = document.createElement('div');
  suggestionDiv.className = 'skill-inference-suggestion';

  const text = document.createElement('span');
  text.textContent = 'I noticed you mentioned "' + skill + '". Should I add this to your skills?';
  suggestionDiv.appendChild(text);

  const yesBtn = document.createElement('button');
  yesBtn.className = 'inference-btn yes';
  yesBtn.textContent = 'Yes, add it';
  yesBtn.onclick = function() { confirmSkillInference(skill, suggestionDiv); };
  suggestionDiv.appendChild(yesBtn);

  const noBtn = document.createElement('button');
  noBtn.className = 'inference-btn no';
  noBtn.textContent = 'No thanks';
  noBtn.onclick = function() { suggestionDiv.remove(); };
  suggestionDiv.appendChild(noBtn);

  messagesList.appendChild(suggestionDiv);
  messagesList.scrollTop = messagesList.scrollHeight;
}

async function confirmSkillInference(skill, suggestionDiv) {
  try {
    const result = await ipcRenderer.invoke('agent-infer-skill', {
      skill: skill,
      source: 'conversation',
      proficiency: 'intermediate'
    });

    if (result.success) {
      suggestionDiv.textContent = '';
      const confirmation = document.createElement('span');
      confirmation.className = 'inference-confirmed';
      confirmation.textContent = 'Added "' + skill + '" to your skills!';
      suggestionDiv.appendChild(confirmation);

      // Refresh context
      await loadAgentContext();

      // Remove after delay
      setTimeout(function() { suggestionDiv.remove(); }, 3000);
    } else {
      suggestionDiv.textContent = '';
      const errorSpan = document.createElement('span');
      errorSpan.className = 'inference-error';
      errorSpan.textContent = 'Failed to add skill. Try again later.';
      suggestionDiv.appendChild(errorSpan);
    }
  } catch (err) {
    console.error('Skill inference error:', err);
  }
}

function showTyping() {
  isTyping = true;
  sendBtn.disabled = true;

  const typing = document.createElement('div');
  typing.className = 'message assistant typing';
  typing.id = 'typingIndicator';

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dot.className = 'typing-dot';
    typing.appendChild(dot);
  }

  messagesList.appendChild(typing);
  messagesList.scrollTop = messagesList.scrollHeight;
}

function hideTyping() {
  isTyping = false;
  sendBtn.disabled = false;

  const typing = document.getElementById('typingIndicator');
  if (typing) {
    typing.remove();
  }
}

// =============================================================================
// Event Listeners
// =============================================================================

// Send button
sendBtn.addEventListener('click', sendMessage);

// Enter to send (Shift+Enter for new line)
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
});

// Quick prompts
quickPrompts.forEach(btn => {
  btn.addEventListener('click', () => {
    const prompt = btn.dataset.prompt;
    if (prompt) {
      messageInput.value = prompt;
      sendMessage();
    }
  });
});

// =============================================================================
// Initialize on Load
// =============================================================================

document.addEventListener('DOMContentLoaded', initChat);
