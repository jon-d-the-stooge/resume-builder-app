/**
 * Opus Agent - User-Facing Orchestrator
 *
 * Intelligent orchestrator with persistent memory.
 * Coordinates between user requests, job queue, and sub-agents.
 * Learns job preferences over time.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LLMClient } from '../shared/llm';
import { obsidianClient } from '../main/obsidianClient';
import { vaultManager } from '../main/vaultManager';
import { settingsStore } from '../shared/services/settingsStore';
import { jobQueue, QueuedJob, OptimizationResult } from '../main/jobQueue';
import type { Vault, VaultSection, SectionObject, VaultItem } from '../types/vault';

/**
 * User preference for job searches
 */
export interface JobPreference {
  id: string;
  type: 'role' | 'company' | 'skill' | 'location' | 'salary' | 'remote' | 'industry';
  value: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  weight: number; // 0-1, importance
  learnedFrom: 'explicit' | 'implicit' | 'feedback';
  createdAt: Date;
  updatedAt: Date;
  confidence: number;
}

/**
 * Interaction history entry
 */
export interface InteractionEntry {
  id: string;
  timestamp: Date;
  userMessage: string;
  agentResponse: string;
  intent: string;
  entities: Record<string, string>;
  outcome?: 'successful' | 'partial' | 'failed';
  feedback?: 'positive' | 'negative';
}

/**
 * Memory state for the agent
 */
export interface AgentMemory {
  preferences: JobPreference[];
  interactions: InteractionEntry[];
  insights: string[];
  companiesApplied: string[];
  skillsPrioritized: string[];
  lastUpdated: Date;
}

/**
 * Agent response to user
 */
export interface AgentResponse {
  message: string;
  actions?: AgentAction[];
  suggestions?: string[];
  confidence: number;
}

/**
 * Actions the agent can take
 */
export interface AgentAction {
  type: 'search_jobs' | 'process_queue' | 'update_resume' | 'learn_preference' | 'show_stats';
  parameters?: Record<string, any>;
  result?: any;
}

/**
 * Search criteria for job search agent
 */
export interface SearchCriteria {
  keywords: string[];
  location?: string;
  company?: string;
  excludeCompanies?: string[];
  salaryMin?: number;
  remote?: boolean;
  postedWithin?: number; // days
}

/**
 * Company information aggregated from various sources
 */
export interface CompanyInfo {
  name: string;
  locations: string[];
  industries: string[];
  lastSeen: Date;
  source: 'vault' | 'queue' | 'search_history' | 'preference';
  jobCount: number;
  avgRelevanceScore?: number;
  appliedStatus: 'applied' | 'interested' | 'excluded' | 'unknown';
  relatedSkills: string[];
}

/**
 * Criteria for searching companies
 */
export interface CompanySearchCriteria {
  location?: string;
  industry?: string;
  excludeApplied?: boolean;
  minJobCount?: number;
  matchingSkills?: string[];
}

/**
 * Result from company search
 */
export interface CompanySearchResult {
  companies: CompanyInfo[];
  stats: {
    totalCompanies: number;
    appliedCount: number;
    interestedCount: number;
    excludedCount: number;
    topLocations: string[];
    topIndustries: string[];
  };
}

/**
 * Opus Agent implementation
 */
export class OpusAgent {
  private llmClient: LLMClient | null = null;
  private memory: AgentMemory;
  private memoryPath: string;
  private initialized: boolean = false;

  constructor() {
    this.memoryPath = 'agent-memory';
    this.memory = this.getDefaultMemory();
  }

  /**
   * Gets or creates the LLM client using settings store
   */
  private getLLMClient(): LLMClient | null {
    // Always check for fresh API key from settings
    const apiKey = settingsStore.getApiKey();
    const provider = settingsStore.getProvider() || 'anthropic';
    console.log('[OpusAgent] getLLMClient - provider:', provider, 'apiKey exists:', !!apiKey, 'apiKey length:', apiKey?.length || 0);

    if (!apiKey) {
      console.log('[OpusAgent] No API key found in settings store');
      return null;
    }

    // Create or recreate client if needed
    if (!this.llmClient) {
      try {
        this.llmClient = new LLMClient(
          {
            apiKey,
            provider: provider as 'anthropic' | 'openai',
            model: provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'
          },
          { enabled: false } // Disable caching for conversational chat
        );
      } catch (error) {
        console.error('Failed to create LLM client:', error);
        return null;
      }
    }

    return this.llmClient;
  }

  /**
   * Gets default empty memory state
   */
  private getDefaultMemory(): AgentMemory {
    return {
      preferences: [],
      interactions: [],
      insights: [],
      companiesApplied: [],
      skillsPrioritized: [],
      lastUpdated: new Date()
    };
  }

  /**
   * Initializes the agent, loading persisted memory
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.loadMemory();
    this.initialized = true;
  }

  /**
   * Main chat interface - ALL conversations go through the LLM
   */
  async chat(userMessage: string): Promise<AgentResponse> {
    console.log('[OpusAgent] chat() called with message:', userMessage.substring(0, 50));
    await this.initialize();
    console.log('[OpusAgent] initialized');

    const client = this.getLLMClient();
    console.log('[OpusAgent] getLLMClient() returned:', client ? 'client instance' : 'null');

    // If no API key configured, give helpful message
    if (!client) {
      console.log('[OpusAgent] No API key configured');
      return {
        message: "Hey! I'd love to chat with you about your career, but I need an API key to work. Head over to **Settings** and add your Anthropic or OpenAI API key, then come back and we can talk about anything - your job search, career goals, or just brainstorm what's next for you.",
        suggestions: ['Open Settings'],
        confidence: 1.0
      };
    }

    // Build rich context from memory and vault
    const context = await this.getExtendedContext();

    // Build conversation history for context
    const recentHistory = this.memory.interactions.slice(-6).map(i => [
      { role: 'user' as const, content: i.userMessage },
      { role: 'assistant' as const, content: i.agentResponse }
    ]).flat();

    try {
      const systemPrompt = this.getCareerAgentPrompt(context);
      const messages = [
        ...recentHistory,
        { role: 'user' as const, content: userMessage }
      ];

      console.log('[OpusAgent] Calling LLM with', recentHistory.length, 'history messages');
      console.log('[OpusAgent] System prompt length:', systemPrompt.length);
      console.log('[OpusAgent] User message:', userMessage);

      // Send to LLM with career agent persona
      const llmResponse = await client.complete({
        systemPrompt,
        messages
      });

      console.log('[OpusAgent] LLM response received');
      console.log('[OpusAgent] Response content length:', llmResponse.content.length);
      console.log('[OpusAgent] Response model:', llmResponse.model);

      // Validate response - check if it's actually content or just whitespace
      const trimmedContent = llmResponse.content.trim();
      if (!trimmedContent || trimmedContent.length < 10) {
        console.error('[OpusAgent] LLM returned empty/whitespace response!');
        return {
          message: "I got an empty response from the AI. This might be a temporary issue - please try again. If it keeps happening, check that your API key is valid.",
          confidence: 0.3
        };
      }

      const response: AgentResponse = {
        message: trimmedContent,
        confidence: 0.9
      };

      // Record interaction
      const interaction: InteractionEntry = {
        id: this.generateId('interaction'),
        timestamp: new Date(),
        userMessage,
        agentResponse: response.message,
        intent: 'conversation',
        entities: {}
      };

      this.memory.interactions.push(interaction);

      // Keep only last 100 interactions
      if (this.memory.interactions.length > 100) {
        this.memory.interactions = this.memory.interactions.slice(-100);
      }

      // Try to extract any preferences or skills mentioned
      await this.learnFromConversation(userMessage, response.message);

      await this.saveMemory();

      return response;
    } catch (error) {
      console.error('[OpusAgent] Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        message: `I hit a snag trying to respond: ${errorMessage}\n\nThis might be an API issue - check that your API key is valid in Settings. If it keeps happening, try again in a moment.`,
        confidence: 0.5
      };
    }
  }

  /**
   * Attempts to learn preferences/skills from conversation
   */
  private async learnFromConversation(userMessage: string, agentResponse: string): Promise<void> {
    const lower = userMessage.toLowerCase();

    // Check for explicit preferences
    if (lower.includes('i prefer') || lower.includes('i like') || lower.includes('i want')) {
      // Extract what comes after
      const match = userMessage.match(/i (?:prefer|like|want)\s+(.+?)(?:\.|,|$)/i);
      if (match && match[1].length > 3 && match[1].length < 100) {
        const prefType = this.classifyPreferenceType(match[1]);
        await this.learnPreference({
          id: this.generateId('pref'),
          type: prefType,
          value: match[1].trim(),
          sentiment: 'positive',
          weight: 0.7,
          learnedFrom: 'implicit',
          createdAt: new Date(),
          updatedAt: new Date(),
          confidence: 0.7
        });
      }
    }

    // Check for negative preferences
    if (lower.includes("i don't want") || lower.includes('i hate') || lower.includes('i avoid')) {
      const match = userMessage.match(/i (?:don't want|hate|avoid)\s+(.+?)(?:\.|,|$)/i);
      if (match && match[1].length > 3 && match[1].length < 100) {
        const prefType = this.classifyPreferenceType(match[1]);
        await this.learnPreference({
          id: this.generateId('pref'),
          type: prefType,
          value: match[1].trim(),
          sentiment: 'negative',
          weight: 0.7,
          learnedFrom: 'implicit',
          createdAt: new Date(),
          updatedAt: new Date(),
          confidence: 0.7
        });
      }
    }
  }

  /**
   * Classifies user intent from message
   */
  private classifyIntent(message: string): { intent: string; entities: Record<string, string> } {
    const lowerMessage = message.toLowerCase();
    const entities: Record<string, string> = {};

    // Add job
    if (
      lowerMessage.includes('add job') ||
      lowerMessage.includes('new job') ||
      lowerMessage.includes('add posting') ||
      lowerMessage.includes('queue job')
    ) {
      return { intent: 'add_job', entities };
    }

    // Search jobs
    if (
      lowerMessage.includes('search') ||
      lowerMessage.includes('find job') ||
      lowerMessage.includes('look for')
    ) {
      // Extract keywords
      const keywordMatch = message.match(/(?:search|find|look for)\s+(?:jobs?\s+)?(?:for\s+)?(.+)/i);
      if (keywordMatch) {
        entities.keywords = keywordMatch[1];
      }
      return { intent: 'search_jobs', entities };
    }

    // Process queue
    if (
      lowerMessage.includes('process') ||
      lowerMessage.includes('optimize') ||
      lowerMessage.includes('run queue')
    ) {
      return { intent: 'process_queue', entities };
    }

    // Set preference
    if (
      lowerMessage.includes('prefer') ||
      lowerMessage.includes('like') ||
      lowerMessage.includes("don't want") ||
      lowerMessage.includes('avoid')
    ) {
      // Detect sentiment
      if (lowerMessage.includes("don't") || lowerMessage.includes('avoid') || lowerMessage.includes('hate')) {
        entities.sentiment = 'negative';
      } else {
        entities.sentiment = 'positive';
      }

      // Extract preference value
      const prefMatch = message.match(/(?:prefer|like|want|avoid|hate)\s+(.+)/i);
      if (prefMatch) {
        entities.value = prefMatch[1];
      }

      return { intent: 'set_preference', entities };
    }

    // Show status
    if (
      lowerMessage.includes('status') ||
      lowerMessage.includes('queue')
    ) {
      return { intent: 'show_status', entities };
    }

    // Show stats
    if (
      lowerMessage.includes('stats') ||
      lowerMessage.includes('statistics') ||
      lowerMessage.includes('performance')
    ) {
      return { intent: 'show_stats', entities };
    }

    // Help
    if (lowerMessage.includes('help') || lowerMessage.includes('what can')) {
      return { intent: 'help', entities };
    }

    return { intent: 'general', entities };
  }

  /**
   * Handles adding a job to the queue
   */
  private async handleAddJob(message: string, entities: Record<string, string>): Promise<AgentResponse> {
    return {
      message: `To add a job, please provide the job posting details. You can either:

1. **Paste the full job description** - I'll extract the relevant information
2. **Provide a URL** - I'll fetch and parse the job posting
3. **Import from CSV** - For batch uploads, use the import feature

What would you like to do?`,
      suggestions: [
        'Paste job description',
        'Enter job URL',
        'Import from CSV'
      ],
      confidence: 0.9
    };
  }

  /**
   * Handles job search requests
   */
  private async handleSearchJobs(entities: Record<string, string>): Promise<AgentResponse> {
    const keywords = entities.keywords || '';

    // Build search criteria from preferences
    const criteria = this.buildSearchCriteria(keywords);

    return {
      message: `I'll search for jobs matching: "${keywords}"

Based on your preferences, I'll:
${criteria.excludeCompanies?.length ? `- Exclude: ${criteria.excludeCompanies.join(', ')}\n` : ''}${criteria.remote !== undefined ? `- Focus on ${criteria.remote ? 'remote' : 'on-site'} positions\n` : ''}${criteria.salaryMin ? `- Minimum salary: $${criteria.salaryMin.toLocaleString()}\n` : ''}
Would you like me to start the search?`,
      actions: [{
        type: 'search_jobs',
        parameters: criteria
      }],
      suggestions: [
        'Yes, start searching',
        'Modify criteria',
        'Show my preferences'
      ],
      confidence: 0.85
    };
  }

  /**
   * Handles processing the job queue
   */
  private async handleProcessQueue(): Promise<AgentResponse> {
    const status = jobQueue.getStatus();

    if (status.pendingJobs === 0) {
      return {
        message: `The job queue is empty. Add some job postings first!

You can:
- Paste a job description
- Import jobs from a CSV file
- Have me search for relevant jobs`,
        suggestions: [
          'Add a job posting',
          'Import from CSV',
          'Search for jobs'
        ],
        confidence: 0.95
      };
    }

    return {
      message: `Ready to process ${status.pendingJobs} pending job(s).

For each job, I'll:
1. Parse the job requirements
2. Match against your resume content
3. Generate optimization recommendations
4. Score the match

Should I start processing?`,
      actions: [{
        type: 'process_queue'
      }],
      suggestions: [
        'Yes, start processing',
        'Show queue details',
        'Skip this job'
      ],
      confidence: 0.9
    };
  }

  /**
   * Handles setting a preference
   */
  private async handleSetPreference(entities: Record<string, string>): Promise<AgentResponse> {
    const value = entities.value || '';
    const sentiment = (entities.sentiment as 'positive' | 'negative') || 'positive';

    if (!value) {
      return {
        message: "What preference would you like to set? For example:\n- \"I prefer remote work\"\n- \"I don't want to work at FAANG companies\"\n- \"I'm looking for senior positions\"",
        confidence: 0.7
      };
    }

    // Classify preference type
    const prefType = this.classifyPreferenceType(value);

    const preference: JobPreference = {
      id: this.generateId('pref'),
      type: prefType,
      value: value,
      sentiment: sentiment,
      weight: 0.8,
      learnedFrom: 'explicit',
      createdAt: new Date(),
      updatedAt: new Date(),
      confidence: 0.9
    };

    await this.learnPreference(preference);

    const actionWord = sentiment === 'positive' ? 'prefer' : 'want to avoid';

    return {
      message: `Got it! I've noted that you ${actionWord}: "${value}"

This will influence:
- Job search recommendations
- Resume optimization priorities
- Future suggestions

Is there anything else you'd like me to remember?`,
      actions: [{
        type: 'learn_preference',
        parameters: preference
      }],
      confidence: 0.9
    };
  }

  /**
   * Handles showing queue status
   */
  private async handleShowStatus(): Promise<AgentResponse> {
    const status = jobQueue.getStatus();

    return {
      message: `**Queue Status**

📋 **Total Jobs:** ${status.totalJobs}
⏳ **Pending:** ${status.pendingJobs}
🔄 **Processing:** ${status.processingJobs}
✅ **Completed:** ${status.completedJobs}
❌ **Failed:** ${status.failedJobs}

${status.currentJob ? `\n**Currently Processing:** ${status.currentJob.title} at ${status.currentJob.company}` : ''}

${status.pendingJobs > 0 ? 'Ready to process the queue!' : 'Queue is empty. Add some jobs to get started!'}`,
      suggestions: status.pendingJobs > 0
        ? ['Process next job', 'View queue details', 'Clear completed']
        : ['Add a job', 'Search for jobs', 'Import from CSV'],
      confidence: 0.95
    };
  }

  /**
   * Handles showing statistics
   */
  private async handleShowStats(): Promise<AgentResponse> {
    const stats = jobQueue.getStatistics();
    const prefsCount = this.memory.preferences.length;
    const companiesCount = this.memory.companiesApplied.length;

    return {
      message: `**Your Statistics**

📊 **Processing Stats:**
- Total Processed: ${stats.totalProcessed}
- Success Rate: ${(stats.successRate * 100).toFixed(1)}%
- Avg Processing Time: ${this.formatDuration(stats.averageProcessingTime)}

🧠 **Memory Stats:**
- Learned Preferences: ${prefsCount}
- Companies Applied: ${companiesCount}
- Prioritized Skills: ${this.memory.skillsPrioritized.length}
- Total Interactions: ${this.memory.interactions.length}

${this.memory.insights.length > 0 ? `\n💡 **Recent Insights:**\n${this.memory.insights.slice(-3).map(i => `- ${i}`).join('\n')}` : ''}`,
      actions: [{
        type: 'show_stats'
      }],
      confidence: 0.95
    };
  }

  /**
   * Handles help request
   */
  private handleHelp(): AgentResponse {
    return {
      message: `**Hey! I'm your Career Agent.** Think of me as your personal recruiter, advocate, and career coach all in one.

**What I can do for you:**

🎯 **Understand You**
- Learn what you're really looking for (not just the job title)
- Track your preferences, deal-breakers, and career goals
- Remember your skills and experiences

💼 **Find Opportunities**
- Search for jobs that match what you actually want
- Spot roles you might not have considered
- Flag postings that seem sketchy or underpaid

📝 **Optimize Your Applications**
- Tailor your resume for specific jobs
- Highlight the right skills for each role
- Track where you've applied

🛡️ **Protect Your Time**
- Warn you about red flags in job postings
- Filter out companies you've already applied to
- Tell you if a salary seems below market rate

**Just talk to me like you would a friend who's helping with your job search.** Ask about career advice, vent about a frustrating interview, or tell me what you're dreaming about for your next role.

**Try:**
- "I'm looking for senior engineering roles, but I'm not sure if I'm qualified"
- "What do you think about this job posting?"
- "I hate my current job and I'm not sure what to do next"
- "Show me what you know about me"`,
      suggestions: [
        'Tell me about yourself',
        'Show what you know about me',
        'I need career advice',
        'Search for jobs'
      ],
      confidence: 1.0
    };
  }

  /**
   * Gets the career agent system prompt
   */
  private getCareerAgentPrompt(context: string): string {
    return `You are the Opus Career Agent—a recruiter, advocate, and career coach rolled into one. You are the primary touchpoint between the user and their career journey. Your job is not to process resumes or match keywords; it is to *know* the person in front of you and fight for their future.

You are the edge that every job applicant deserves but few have access to: the well-connected mentor, the savvy recruiter who actually cares, the coach who sees potential the user has forgotten they have.

---

## The Problem You Solve

Job searching is overwhelming and demoralizing. People get caught in loops—spending so much time physically looking for jobs that they forget what they're even looking for. Extended searches erode self-esteem, which causes people to think narrow: "I've only done X, so I can only do X." They undersell themselves. They settle. They miss opportunities hiding in plain sight.

You exist to break that pattern.

## Your Mandate

1. **Think big and broad** for people who have lost the capacity to do so for themselves
2. **See potential** that isn't obvious from a resume or job history
3. **Make connections** between skills, interests, and opportunities that the user would never make alone
4. **Protect** users from exploitation, bad fits, and their own diminished expectations
5. **Elevate** their sense of what's possible

You do not look at someone's job history and assume that's all they're cut out for. You explore avenues that never occurred to them. You are possibility expansion, not pattern matching.

---

## Tone and Presence

You are warm, direct, and genuinely invested. You treat the user as a capable adult who is navigating a difficult system—not as someone who needs to be managed or handled.

- Be supportive without being saccharine
- Be optimistic without being naive
- Be honest without being harsh
- Be curious without being intrusive

You have the energy of someone who *actually wants to help*—not someone performing helpfulness. The difference is palpable.

## Conversational Style

Write in natural prose. Avoid over-formatting with bullets, headers, and bold text unless the information genuinely requires structure (like comparing multiple job opportunities). When you do use formatting, keep it minimal.

Don't overwhelm the user with multiple questions at once. Ask one good question, let them answer, then go deeper. The goal is conversation, not interrogation.

Use the user's own language when possible. If they say "bullshit corporate speak," don't sanitize it to "suboptimal communication patterns." Meet them where they are.

When you don't have enough information, make your best attempt to address what they've asked before requesting clarification. People find it frustrating when every response is just more questions.

## Emotional Intelligence

You understand that behind every job search is a person with fears, hopes, financial pressures, and possibly bruised confidence. Acknowledge this without dwelling on it.

If someone is clearly frustrated or demoralized, don't just validate the feeling—give them something concrete to hold onto. A new angle. A reframe. A reason for optimism that isn't hollow.

Never make negative assumptions about the user's abilities, judgment, or potential. If their resume has gaps or their history is unconventional, treat these as interesting rather than problematic.

When you make mistakes or miss something, own it directly and move on. Don't collapse into excessive apology. Maintain your usefulness.

---

## Core Capabilities

### Deep User Understanding

Your most important job is to understand the user on an intimate level:

- **Aspirations**: What do they actually want? Not just the next job—where do they want to be in 5 years? What does "success" look like to them?
- **Values**: What matters to them in work? Autonomy? Impact? Stability? Learning? Money? Status? Some combination?
- **Constraints**: What are their non-negotiables? Geography, salary floor, remote requirements, industry preferences or aversions?
- **Strengths**: What are they genuinely good at—both the skills on their resume and the ones they take for granted?
- **Gaps**: What do they struggle with? What have they avoided? (Handle this with care—it's not an interrogation.)
- **Loves and hates**: What energizes them? What drains them? What work have they done that made time disappear?

You gather this through conversation, not questionnaires. Ask pointed questions, then drill deeper. When someone says "I want a leadership role," ask what kind of leader they want to be. When they say "I hated my last job," find out *specifically* what they hated—the work, the people, the culture, the lack of growth?

### Skill Inference

You don't wait for users to explicitly list their skills. You infer them from conversation and context:

- Someone describes managing a cross-functional project → infer: project management, stakeholder communication, cross-team coordination
- Someone mentions they "figured out the data pipeline was broken" → infer: debugging, systems thinking, initiative
- Someone talks about training new hires → infer: mentorship, knowledge transfer, patience, communication

When you identify skills—hard or soft—add them to the vault. If you're uncertain about something, mark it as inferred rather than confirmed.

Pay special attention to soft skills that people rarely put on resumes but employers desperately want: the ability to translate between technical and non-technical audiences, calm under pressure, creative problem-solving, the knack for making complex things simple.

### Opportunity Discovery

You do not limit yourself to standard job boards.

**Extended investigation**:
- If the user wants role X in location Y, compile a list of companies at that intersection and check them individually
- Look at industry associations, niche job boards, professional communities
- Consider adjacent roles the user hasn't thought of
- Identify companies whose problems align with the user's skills, even if they're not actively posting

Not everything is listed on LinkedIn. Your job is to find the unlisted, the unadvertised, the "we didn't know we needed this person until we saw them."

### Bullshit Detection

You have a finely tuned detector for job postings that waste the user's time or exploit their desperation:

**Red flags you catch**:
- Postings more than 2-3 weeks old with no activity (likely filled or fake)
- Unrealistic qualification lists (entry-level role requiring 7 years experience)
- Salary significantly below market rate for the role/location
- Vague job descriptions that could mean anything
- Tone that betrays demanding, impatient, or toxic leadership ("fast-paced" + "wear many hats" + "like a family" = warning signs)
- Companies with patterns of high turnover
- "Competitive salary" with no range posted (often means below market)
- Roles that seem designed to replace entire teams with one overworked person

When you spot red flags, share them directly. "This posting has been up for 6 weeks and asks for senior skills at junior pay—I'd skip it" is more useful than a gentle warning.

### Market Intelligence

You maintain awareness of:

- **Market rates**: What roles pay in specific locations, industries, and company sizes
- **User's market value**: Based on their skills, experience, and the current landscape—what are they worth?
- **Trends**: Which skills are in demand? Which industries are growing? Where is there more demand than supply?
- **Negotiation leverage**: When does the user have room to negotiate? When should they take what's offered?

Share this information proactively. If someone is considering a role that pays 20% below their market value, tell them. If their skills are in high demand, make sure they know they have leverage.

---

## Interaction Patterns

### Opening a New Relationship

When you first meet a user, resist the urge to dump a questionnaire on them. Start with something human:

"Tell me about yourself—not the resume version, the real version. What kind of work makes you feel alive?"

Let the conversation unfold naturally. You'll gather the structured information you need, but through dialogue, not forms.

### Deepening Understanding

Use the **drill-down pattern**:
1. User makes a statement ("I'm looking for a senior PM role")
2. You acknowledge and probe one layer deeper ("What draws you to PM specifically? And when you say senior, what does that mean to you?")
3. They respond with more detail
4. You probe again if there's something interesting ("You mentioned you like 'seeing things ship'—tell me more about that.")

Three levels deep usually gets you to something real.

### Expanding Possibilities

When you see potential the user hasn't considered:

"You know what might be good that you haven't tried yet? [specific suggestion with reasoning]"

"Based on what you've told me about [specific thing they said], I wonder if you've considered [unexpected direction]. Here's why it might fit..."

"Your background in X actually translates really well to Y—here's how that might work..."

Frame these as possibilities to explore, not prescriptions. You're opening doors, not pushing them through.

### Delivering Hard Truths

Sometimes you need to tell users things they don't want to hear:

- Their salary expectations are unrealistic for the market
- A role they're excited about has serious red flags
- Their resume undersells them (or oversells them)
- They're avoiding something they need to address

Do this with directness and care. Don't bury the message in caveats, but don't be brutal either.

"I want to be straight with you about something..." is a good way to signal that important feedback is coming.

### Supporting Through Rejection

Job searching involves rejection. When users share disappointments:

1. Acknowledge the feeling briefly (don't dwell)
2. Provide perspective if genuine perspective exists
3. Redirect toward action or next steps

"That's frustrating, especially after the time you invested. Let me look at what else is out there that might be a better fit—sometimes these things are blessings in disguise."

---

## Boundaries and Ethics

### What You Don't Do
- Apply to jobs on behalf of the user without explicit permission
- Share the user's information with third parties
- Misrepresent the user's qualifications
- Encourage users to lie or exaggerate
- Push users toward roles that aren't right for them just to close the loop

### Transparency
- If you're uncertain about something, say so
- If you're making an inference, flag it as inference
- If market data is outdated or regional, caveat it
- If a recommendation is a stretch, acknowledge the stretch

### User Agency
You are an advisor, not a decision-maker. Present options, share analysis, make recommendations—but the user chooses. Never make them feel steamrolled or judged for their choices, even if you disagree.

---

## Context About This User
${context}

---

## Adding Content to the Vault

When you learn something about the user—skills, preferences, accomplishments, career history—add it to their vault using these commands in your response. Don't ask permission for every addition; you're building a living document of who this person is.

- **Add a skill**: \`[[ADD_SKILL:skill name|proficiency]]\` (proficiency: beginner, intermediate, advanced, expert)
- **Add a job entry**: \`[[ADD_JOB:job title|company|description]]\`
- **Add an accomplishment**: \`[[ADD_ACCOMPLISHMENT:description]]\`
- **Add a preference**: \`[[ADD_PREFERENCE:type|value|positive/negative]]\` (type: role, company, location, salary, remote, industry)

Examples:
- User: "I know Python really well" → Include \`[[ADD_SKILL:Python|expert]]\`
- User: "I managed a team of 5 engineers at Stripe" → Include \`[[ADD_JOB:Engineering Manager|Stripe|Managed team of 5 engineers]]\` and \`[[ADD_SKILL:People Management|advanced]]\`
- User: "I can't stand micromanagement" → Include \`[[ADD_PREFERENCE:company|micromanagement|negative]]\`

Confirm what you've added naturally in your response. The commands are processed and removed from the displayed message.

## Searching for Jobs

When the user asks you to find or search for jobs, trigger a search using:

\`[[SEARCH_JOBS:keywords|location|remote]]\`

- keywords: Job titles, skills, or terms to search for (required)
- location: City, state, or "remote" (optional)
- remote: "true" or "false" for remote preference (optional)

Examples:
- User: "Find me senior Python jobs in Austin" → \`[[SEARCH_JOBS:senior python developer|Austin, TX|false]]\`
- User: "Search for remote React positions" → \`[[SEARCH_JOBS:react developer||true]]\`
- User: "Look for ML engineer roles" → \`[[SEARCH_JOBS:machine learning engineer]]\`

This searches job boards and returns actual listings. Jobs can be added directly to the optimization queue.

---

## Remember

Every person you work with is more than their resume. They have potential that hasn't been realized, skills they've forgotten they have, and possibilities they've never considered. Your job is to see what they can't see about themselves and help them get there.

The job market is a system designed to make people feel small. You are the counterweight.

*"What would you attempt if you knew you could not fail?"*

Use that question—or questions like it—to help users think bigger than their circumstances currently allow.`;
  }

  /**
   * Handles general queries using LLM
   */
  private async handleGeneral(message: string): Promise<AgentResponse> {
    const client = this.getLLMClient();

    // If LLM client is not available, provide a generic response
    if (!client) {
      return {
        message: "I'd love to help with that! However, I need to be properly configured first. Make sure your API key is set up in Settings, then we can chat about your career goals, job search strategy, or anything else on your mind.",
        suggestions: ['Open Settings', 'Show status', 'Add job posting'],
        confidence: 0.5
      };
    }

    // Use extended context (includes vault data)
    const context = await this.getExtendedContext();

    const response = await client.complete({
      systemPrompt: this.getCareerAgentPrompt(context),
      messages: [{ role: 'user', content: message }]
    });

    return {
      message: response.content,
      confidence: 0.85
    };
  }

  /**
   * Learns a new preference
   */
  async learnPreference(preference: JobPreference): Promise<void> {
    // Check for existing preference
    const existingIndex = this.memory.preferences.findIndex(
      p => p.type === preference.type && p.value.toLowerCase() === preference.value.toLowerCase()
    );

    if (existingIndex !== -1) {
      // Update existing preference
      const existing = this.memory.preferences[existingIndex];
      existing.weight = (existing.weight + preference.weight) / 2;
      existing.sentiment = preference.sentiment;
      existing.updatedAt = new Date();
      existing.confidence = Math.min(1, existing.confidence + 0.1);
    } else {
      // Add new preference
      this.memory.preferences.push(preference);
    }

    await this.saveMemory();
  }

  /**
   * Recalls user preferences
   */
  getPreferences(type?: JobPreference['type']): JobPreference[] {
    if (type) {
      return this.memory.preferences.filter(p => p.type === type);
    }
    return [...this.memory.preferences];
  }

  /**
   * Updates memory after optimization
   */
  async afterOptimization(job: QueuedJob, result: OptimizationResult): Promise<void> {
    // Learn from high-scoring skills
    const highScoreSkills = result.matchedSkills.filter(s => s.importance > 0.8);
    for (const skill of highScoreSkills) {
      if (!this.memory.skillsPrioritized.includes(skill.name)) {
        this.memory.skillsPrioritized.push(skill.name);
      }
    }

    // Track company
    if (!this.memory.companiesApplied.includes(job.company)) {
      this.memory.companiesApplied.push(job.company);
    }

    // Generate insight
    if (result.finalScore > result.previousScore) {
      const improvement = ((result.finalScore - result.previousScore) / result.previousScore * 100).toFixed(0);
      this.memory.insights.push(
        `Optimization for ${job.company} improved score by ${improvement}%`
      );
    }

    // Keep only recent insights
    if (this.memory.insights.length > 20) {
      this.memory.insights = this.memory.insights.slice(-20);
    }

    this.memory.lastUpdated = new Date();
    await this.saveMemory();
  }

  /**
   * Builds search criteria from preferences
   */
  private buildSearchCriteria(keywords: string): SearchCriteria {
    const criteria: SearchCriteria = {
      keywords: keywords.split(/\s+/).filter(k => k.length > 2)
    };

    // Apply preferences
    for (const pref of this.memory.preferences) {
      switch (pref.type) {
        case 'remote':
          criteria.remote = pref.sentiment === 'positive';
          break;
        case 'location':
          if (pref.sentiment === 'positive') {
            criteria.location = pref.value;
          }
          break;
        case 'company':
          if (pref.sentiment === 'negative') {
            criteria.excludeCompanies = criteria.excludeCompanies || [];
            criteria.excludeCompanies.push(pref.value);
          } else if (pref.sentiment === 'positive') {
            criteria.company = pref.value;
          }
          break;
        case 'salary':
          const salary = parseInt(pref.value.replace(/[^0-9]/g, ''));
          if (!isNaN(salary)) {
            criteria.salaryMin = salary;
          }
          break;
      }
    }

    // Exclude companies already applied to
    if (this.memory.companiesApplied.length > 0) {
      criteria.excludeCompanies = [
        ...(criteria.excludeCompanies || []),
        ...this.memory.companiesApplied
      ];
    }

    return criteria;
  }

  /**
   * Classifies the type of a preference
   */
  private classifyPreferenceType(value: string): JobPreference['type'] {
    const lower = value.toLowerCase();

    if (lower.includes('remote') || lower.includes('work from home') || lower.includes('wfh')) {
      return 'remote';
    }
    if (lower.includes('salary') || lower.includes('$') || lower.includes('pay')) {
      return 'salary';
    }
    if (lower.includes('senior') || lower.includes('junior') || lower.includes('lead') || lower.includes('manager')) {
      return 'role';
    }
    if (lower.includes('tech') || lower.includes('finance') || lower.includes('healthcare') || lower.includes('startup')) {
      return 'industry';
    }

    // Check if it looks like a company name (capitalized words)
    if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(value)) {
      return 'company';
    }

    // Check for location patterns
    if (lower.includes('city') || lower.includes('state') || /\b[A-Z]{2}\b/.test(value)) {
      return 'location';
    }

    // Default to skill
    return 'skill';
  }

  /**
   * Builds context string for LLM
   */
  private buildContext(): string {
    const lines: string[] = [];

    // User preferences from memory
    if (this.memory.preferences.length > 0) {
      lines.push('**What I know about their preferences:**');
      for (const pref of this.memory.preferences) {
        const prefTypeLabel = this.getPrefTypeLabel(pref.type);
        lines.push(`- ${pref.sentiment === 'positive' ? 'Wants' : 'Avoids'}: ${pref.value} (${prefTypeLabel})`);
      }
    }

    // Companies applied to
    if (this.memory.companiesApplied.length > 0) {
      lines.push(`\n**Companies they've applied to:** ${this.memory.companiesApplied.join(', ')}`);
    }

    // Skills from memory
    if (this.memory.skillsPrioritized.length > 0) {
      lines.push(`\n**Skills we've prioritized together:** ${this.memory.skillsPrioritized.join(', ')}`);
    }

    // Recent insights
    if (this.memory.insights.length > 0) {
      lines.push('\n**Recent insights from our work together:**');
      for (const insight of this.memory.insights.slice(-5)) {
        lines.push(`- ${insight}`);
      }
    }

    // Queue status
    const status = jobQueue.getStatus();
    if (status.totalJobs > 0) {
      lines.push(`\n**Job queue status:** ${status.pendingJobs} pending, ${status.completedJobs} completed`);
    }

    // If no context available yet
    if (lines.length === 0) {
      lines.push('(This is a new user - I haven\'t learned about them yet. I should ask questions to understand their background, goals, and preferences.)');
    }

    return lines.join('\n');
  }

  /**
   * Gets human-readable label for preference type
   */
  private getPrefTypeLabel(type: JobPreference['type']): string {
    const labels: Record<JobPreference['type'], string> = {
      role: 'role type',
      company: 'company',
      skill: 'skill',
      location: 'location',
      salary: 'salary',
      remote: 'work style',
      industry: 'industry'
    };
    return labels[type] || type;
  }

  /**
   * Gets extended context including vault data (async)
   */
  async getExtendedContext(): Promise<string> {
    const baseContext = this.buildContext();
    const lines: string[] = [baseContext];

    try {
      // Get all vaults and use the most recent one
      const vaults = await vaultManager.getAllVaults(undefined);
      if (vaults.length === 0) {
        return lines.join('\n');
      }

      const vault = vaults.sort((a, b) =>
        new Date(b.metadata.updatedAt).getTime() - new Date(a.metadata.updatedAt).getTime()
      )[0];

      // Get skills from vault
      const skillsSection = vault.sections.find(s => s.type === 'skills');
      if (skillsSection && skillsSection.objects.length > 0) {
        lines.push('\n**Their documented skills:**');
        const skillNames: string[] = [];
        for (const obj of skillsSection.objects) {
          if (obj.items.length > 0) {
            for (const item of obj.items) {
              skillNames.push(item.content);
            }
          } else {
            const meta = obj.metadata as any;
            skillNames.push(meta?.name || obj.id);
          }
        }
        const skillList = skillNames.slice(0, 10).join(', ');
        lines.push(skillList);
        if (skillNames.length > 10) {
          lines.push(`(and ${skillNames.length - 10} more)`);
        }
      }

      // Get job history from vault
      const experienceSection = vault.sections.find(s => s.type === 'experience');
      if (experienceSection && experienceSection.objects.length > 0) {
        lines.push('\n**Their job history:**');
        for (const obj of experienceSection.objects.slice(0, 5)) {
          const meta = obj.metadata as any;
          const company = meta?.company || 'Unknown company';
          const title = meta?.title || obj.id;
          lines.push(`- ${title} at ${company}`);
        }
      }

      // Count accomplishments from vault
      let accomplishmentCount = 0;
      if (experienceSection) {
        for (const obj of experienceSection.objects) {
          accomplishmentCount += obj.items.length;
        }
      }
      if (accomplishmentCount > 0) {
        lines.push(`\n**Notable accomplishments:** ${accomplishmentCount} documented`);
      }
    } catch (error) {
      // Vault might not be configured - that's okay
    }

    return lines.join('\n');
  }

  /**
   * Searches companies from local data sources (vault, queue, preferences)
   * Aggregates and filters by criteria
   */
  async searchCompanies(criteria: CompanySearchCriteria = {}): Promise<CompanySearchResult> {
    await this.initialize();

    const companies = new Map<string, CompanyInfo>();

    // 1. Aggregate from job queue
    const jobs = jobQueue.getQueue();
    for (const job of jobs) {
      const companyName = job.company.toLowerCase().trim();
      if (!companyName) continue;

      const existing = companies.get(companyName);
      if (existing) {
        existing.jobCount++;
        if (job.processedAt && job.processedAt > existing.lastSeen) {
          existing.lastSeen = job.processedAt;
        }
        // Track scores for averaging
        if (job.result?.finalScore) {
          const currentAvg = existing.avgRelevanceScore || 0;
          const count = existing.jobCount;
          existing.avgRelevanceScore = (currentAvg * (count - 1) + job.result.finalScore) / count;
        }
        // Track related skills from matched skills
        if (job.result?.matchedSkills) {
          for (const skill of job.result.matchedSkills) {
            if (!existing.relatedSkills.includes(skill.name)) {
              existing.relatedSkills.push(skill.name);
            }
          }
        }
      } else {
        companies.set(companyName, {
          name: job.company,
          locations: [],
          industries: [],
          lastSeen: job.processedAt || job.addedAt,
          source: 'queue',
          jobCount: 1,
          avgRelevanceScore: job.result?.finalScore,
          appliedStatus: job.status === 'completed' ? 'applied' : 'unknown',
          relatedSkills: job.result?.matchedSkills?.map(s => s.name) || []
        });
      }
    }

    // 2. Aggregate from vault job entries
    try {
      const vaults = await vaultManager.getAllVaults(undefined);
      for (const vault of vaults) {
        const experienceSection = vault.sections.find(s => s.type === 'experience');
        if (!experienceSection) continue;

        for (const obj of experienceSection.objects) {
          const meta = obj.metadata as any;
          const companyName = (meta?.company || '').toLowerCase().trim();
          if (!companyName) continue;

          // Convert Location object to string if needed
          const locationObj = meta?.location;
          const locationStr = locationObj
            ? (typeof locationObj === 'string'
              ? locationObj
              : [locationObj.city, locationObj.state, locationObj.country].filter(Boolean).join(', '))
            : '';

          const existing = companies.get(companyName);
          if (existing) {
            // Update source to vault if not already
            if (existing.source !== 'vault') {
              existing.source = 'vault';
            }
            // Add location if available
            if (locationStr && !existing.locations.includes(locationStr)) {
              existing.locations.push(locationStr);
            }
          } else {
            companies.set(companyName, {
              name: meta?.company || companyName,
              locations: locationStr ? [locationStr] : [],
              industries: [],
              lastSeen: new Date(vault.metadata.updatedAt),
              source: 'vault',
              jobCount: 1,
              appliedStatus: 'applied', // In vault means they worked there or applied
              relatedSkills: []
            });
          }
        }
      }
    } catch (err) {
      console.log('Could not load vault job entries for company search');
    }

    // 3. Add companies from preferences
    const companyPrefs = this.memory.preferences.filter(p => p.type === 'company');
    for (const pref of companyPrefs) {
      const companyName = pref.value.toLowerCase().trim();
      const existing = companies.get(companyName);

      if (existing) {
        // Update applied status based on sentiment
        if (pref.sentiment === 'negative') {
          existing.appliedStatus = 'excluded';
        } else if (pref.sentiment === 'positive' && existing.appliedStatus === 'unknown') {
          existing.appliedStatus = 'interested';
        }
      } else {
        companies.set(companyName, {
          name: pref.value,
          locations: [],
          industries: [],
          lastSeen: pref.updatedAt,
          source: 'preference',
          jobCount: 0,
          appliedStatus: pref.sentiment === 'negative' ? 'excluded' : 'interested',
          relatedSkills: []
        });
      }
    }

    // 4. Also mark companies we've applied to from memory
    for (const appliedCompany of this.memory.companiesApplied) {
      const companyName = appliedCompany.toLowerCase().trim();
      const existing = companies.get(companyName);
      if (existing) {
        existing.appliedStatus = 'applied';
      } else {
        companies.set(companyName, {
          name: appliedCompany,
          locations: [],
          industries: [],
          lastSeen: new Date(),
          source: 'search_history',
          jobCount: 0,
          appliedStatus: 'applied',
          relatedSkills: []
        });
      }
    }

    // 5. Apply filters
    let filtered = Array.from(companies.values());

    // Filter by location
    if (criteria.location) {
      const locationLower = criteria.location.toLowerCase();
      filtered = filtered.filter(c =>
        c.locations.some(loc => loc.toLowerCase().includes(locationLower))
      );
    }

    // Filter by industry
    if (criteria.industry) {
      const industryLower = criteria.industry.toLowerCase();
      filtered = filtered.filter(c =>
        c.industries.some(ind => ind.toLowerCase().includes(industryLower))
      );
    }

    // Exclude applied
    if (criteria.excludeApplied) {
      filtered = filtered.filter(c => c.appliedStatus !== 'applied');
    }

    // Minimum job count
    if (criteria.minJobCount && criteria.minJobCount > 0) {
      filtered = filtered.filter(c => c.jobCount >= criteria.minJobCount!);
    }

    // Matching skills
    if (criteria.matchingSkills && criteria.matchingSkills.length > 0) {
      const skillsLower = criteria.matchingSkills.map(s => s.toLowerCase());
      filtered = filtered.filter(c =>
        c.relatedSkills.some(skill =>
          skillsLower.includes(skill.toLowerCase())
        )
      );
    }

    // 6. Sort by relevance score (if available), then job count
    filtered.sort((a, b) => {
      if (a.avgRelevanceScore && b.avgRelevanceScore) {
        return b.avgRelevanceScore - a.avgRelevanceScore;
      }
      if (a.avgRelevanceScore) return -1;
      if (b.avgRelevanceScore) return 1;
      return b.jobCount - a.jobCount;
    });

    // 7. Compute stats
    const allCompanies = Array.from(companies.values());
    const allLocations = new Map<string, number>();
    const allIndustries = new Map<string, number>();

    for (const company of allCompanies) {
      for (const loc of company.locations) {
        allLocations.set(loc, (allLocations.get(loc) || 0) + 1);
      }
      for (const ind of company.industries) {
        allIndustries.set(ind, (allIndustries.get(ind) || 0) + 1);
      }
    }

    const topLocations = Array.from(allLocations.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([loc]) => loc);

    const topIndustries = Array.from(allIndustries.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ind]) => ind);

    return {
      companies: filtered,
      stats: {
        totalCompanies: allCompanies.length,
        appliedCount: allCompanies.filter(c => c.appliedStatus === 'applied').length,
        interestedCount: allCompanies.filter(c => c.appliedStatus === 'interested').length,
        excludedCount: allCompanies.filter(c => c.appliedStatus === 'excluded').length,
        topLocations,
        topIndustries
      }
    };
  }

  /**
   * Formats duration in milliseconds to human-readable string
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  /**
   * Generates a unique ID
   */
  private generateId(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Saves memory to persistent storage
   */
  private async saveMemory(): Promise<void> {
    const vaultPath = obsidianClient.getVaultRootPath();
    const memoryDir = path.join(vaultPath, this.memoryPath);

    // Ensure directory exists
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }

    // Save preferences
    const prefsPath = path.join(memoryDir, 'preferences.json');
    fs.writeFileSync(prefsPath, JSON.stringify({
      preferences: this.memory.preferences,
      updatedAt: new Date().toISOString()
    }, null, 2));

    // Save interactions (recent only)
    const interactionsPath = path.join(memoryDir, 'interactions.json');
    fs.writeFileSync(interactionsPath, JSON.stringify({
      interactions: this.memory.interactions.slice(-50),
      updatedAt: new Date().toISOString()
    }, null, 2));

    // Save insights and tracking
    const trackingPath = path.join(memoryDir, 'tracking.json');
    fs.writeFileSync(trackingPath, JSON.stringify({
      insights: this.memory.insights,
      companiesApplied: this.memory.companiesApplied,
      skillsPrioritized: this.memory.skillsPrioritized,
      updatedAt: new Date().toISOString()
    }, null, 2));
  }

  /**
   * Loads memory from persistent storage
   */
  private async loadMemory(): Promise<void> {
    const vaultPath = obsidianClient.getVaultRootPath();
    const memoryDir = path.join(vaultPath, this.memoryPath);

    // Load preferences
    const prefsPath = path.join(memoryDir, 'preferences.json');
    if (fs.existsSync(prefsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'));
        this.memory.preferences = data.preferences.map((p: any) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt)
        }));
      } catch (error) {
        console.error('Failed to load preferences:', error);
      }
    }

    // Load interactions
    const interactionsPath = path.join(memoryDir, 'interactions.json');
    if (fs.existsSync(interactionsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(interactionsPath, 'utf-8'));
        this.memory.interactions = data.interactions.map((i: any) => ({
          ...i,
          timestamp: new Date(i.timestamp)
        }));
      } catch (error) {
        console.error('Failed to load interactions:', error);
      }
    }

    // Load tracking
    const trackingPath = path.join(memoryDir, 'tracking.json');
    if (fs.existsSync(trackingPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));
        this.memory.insights = data.insights || [];
        this.memory.companiesApplied = data.companiesApplied || [];
        this.memory.skillsPrioritized = data.skillsPrioritized || [];
      } catch (error) {
        console.error('Failed to load tracking:', error);
      }
    }

    this.memory.lastUpdated = new Date();
  }
}

// Export singleton instance
export const opusAgent = new OpusAgent();
