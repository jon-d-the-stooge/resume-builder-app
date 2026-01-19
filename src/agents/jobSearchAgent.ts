/**
 * Job Search Agent
 *
 * Automated job searching agent that fetches and parses real job postings.
 * Scrapes job boards and extracts structured job details.
 */

import * as https from 'https';
import * as http from 'http';
import { LLMClient } from '../shared/llm';
import { SearchCriteria } from './opusAgent';
import { QueueJobInput } from '../main/jobQueue';
import { settingsStore } from '../main/settingsStore';

/**
 * Result from a job search
 */
export interface JobSearchResult {
  id: string;
  title: string;
  company: string;
  location: string;
  sourceUrl: string;
  snippet: string;
  salary?: string;
  postedDate?: Date;
  remote?: boolean;
  relevanceScore: number;
}

/**
 * Extracted job details from a URL
 */
export interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  description: string;
  requirements: string[];
  preferredQualifications: string[];
  responsibilities: string[];
  salary?: string;
  benefits?: string[];
  remote?: boolean;
  experienceLevel?: string;
  jobType?: string; // full-time, contract, etc.
  url?: string; // Original posting URL
}

/**
 * Configuration for the job search agent
 */
export interface JobSearchConfig {
  maxResults?: number;
  includeRemote?: boolean;
  excludeStaffing?: boolean;
  minRelevanceScore?: number;
}

/**
 * Job board source configuration
 */
interface JobBoardSource {
  name: string;
  baseUrl: string;
  enabled: boolean;
}

/**
 * Job Search Agent implementation
 */
export class JobSearchAgent {
  private llmClient: LLMClient | null;
  private config: JobSearchConfig;
  private sources: JobBoardSource[];

  constructor(config?: JobSearchConfig) {
    // Use Haiku model for cost efficiency
    this.llmClient = null;

    this.config = {
      maxResults: 20,
      includeRemote: true,
      excludeStaffing: true,
      minRelevanceScore: 0.5,
      ...config
    };

    // Configure job board sources
    this.sources = [
      { name: 'LinkedIn', baseUrl: 'https://www.linkedin.com/jobs/search', enabled: true },
      { name: 'Indeed', baseUrl: 'https://www.indeed.com/jobs', enabled: true },
      { name: 'Glassdoor', baseUrl: 'https://www.glassdoor.com/Job', enabled: true },
      { name: 'AngelList', baseUrl: 'https://angel.co/jobs', enabled: true }
    ];
  }

  /**
   * Initializes the LLM client (lazy initialization)
   */
  private initializeLLM(): boolean {
    if (this.llmClient) return true;

    const apiKey = settingsStore.getApiKey();
    const provider = settingsStore.getProvider() || 'anthropic';

    if (!apiKey) {
      console.warn('Job Search Agent: No API key configured');
      return false;
    }

    try {
      this.llmClient = new LLMClient(
        {
          provider: provider as 'anthropic' | 'openai',
          model: provider === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-4o-mini',
          apiKey
        },
        { enabled: false } // Disable caching
      );
      return true;
    } catch (error) {
      console.warn('Job Search Agent: LLM client initialization failed', error);
      return false;
    }
  }

  /**
   * Fetches a URL and returns the HTML content
   */
  private async fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      };

      const req = protocol.get(url, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            this.fetchUrl(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Searches for jobs and returns real job listings with content
   */
  async searchJobs(criteria: SearchCriteria): Promise<JobSearchResult[]> {
    console.log('[JobSearchAgent] Searching for jobs with criteria:', criteria);

    const results: JobSearchResult[] = [];
    const searchQuery = this.buildSearchQuery(criteria);

    // Run searches in parallel for speed
    const searchPromises: Promise<JobSearchResult[]>[] = [];

    // JSearch (RapidAPI) - aggregates LinkedIn, Indeed, Glassdoor, etc.
    const jsearchKey = settingsStore.getJSearchApiKey();
    if (jsearchKey) {
      searchPromises.push(
        this.searchJSearch(searchQuery, criteria, jsearchKey).catch(err => {
          console.error('[JobSearchAgent] JSearch error:', err);
          return [];
        })
      );
    }

    // Adzuna - best location support, requires API key
    const adzunaCreds = settingsStore.getAdzunaCredentials();
    if (adzunaCreds) {
      searchPromises.push(
        this.searchAdzuna(searchQuery, criteria, adzunaCreds).catch(err => {
          console.error('[JobSearchAgent] Adzuna error:', err);
          return [];
        })
      );
    }

    // Arbeitnow - good for location-specific searches (US/Europe)
    searchPromises.push(
      this.searchArbeitnow(searchQuery, criteria).catch(err => {
        console.error('[JobSearchAgent] Arbeitnow error:', err);
        return [];
      })
    );

    // Jobicy - another free job API
    searchPromises.push(
      this.searchJobicy(searchQuery, criteria).catch(err => {
        console.error('[JobSearchAgent] Jobicy error:', err);
        return [];
      })
    );

    // RemoteOK - only if user wants remote jobs or no location specified
    if (criteria.remote || !criteria.location) {
      searchPromises.push(
        this.searchRemoteOK(searchQuery, criteria).catch(err => {
          console.error('[JobSearchAgent] RemoteOK error:', err);
          return [];
        })
      );
    }

    // Wait for all searches
    const allResults = await Promise.all(searchPromises);
    for (const sourceResults of allResults) {
      results.push(...sourceResults);
    }

    console.log(`[JobSearchAgent] Total jobs found: ${results.length}`);

    // Deduplicate by title+company
    const seen = new Set<string>();
    const unique = results.filter(job => {
      const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Apply minimum relevance score threshold
    const minScore = this.config.minRelevanceScore || 0;
    const filtered = unique.filter(job => job.relevanceScore >= minScore);

    console.log(`[JobSearchAgent] After dedup: ${unique.length}, after min score filter (${minScore}): ${filtered.length}`);

    // Sort by relevance and return top results
    filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return filtered.slice(0, this.config.maxResults || 20);
  }

  /**
   * Search JSearch API (RapidAPI) - aggregates LinkedIn, Indeed, Glassdoor, ZipRecruiter
   */
  private async searchJSearch(
    query: string,
    criteria: SearchCriteria,
    apiKey: string
  ): Promise<JobSearchResult[]> {
    const results: JobSearchResult[] = [];

    try {
      // Build query with location
      let searchQuery = query;
      if (criteria.location) {
        searchQuery += ` in ${criteria.location}`;
      }
      if (criteria.remote) {
        searchQuery += ' remote';
      }

      const params = new URLSearchParams();
      params.set('query', searchQuery);
      params.set('page', '1');
      params.set('num_pages', '1');

      const url = `https://jsearch.p.rapidapi.com/search?${params.toString()}`;
      console.log('[JobSearchAgent] Searching JSearch (LinkedIn/Indeed):', searchQuery);

      // JSearch requires specific headers
      const response = await this.fetchUrlWithHeaders(url, {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      });

      const data = JSON.parse(response);
      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);

      for (const job of data.data || []) {
        if (!job.job_title || !job.employer_name) continue;

        // Location filtering - skip jobs that don't match requested location
        const jobLocation = [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', ');
        if (criteria.location && jobLocation) {
          const userLoc = criteria.location.toLowerCase();
          const jobLoc = jobLocation.toLowerCase();
          // Skip if locations don't match (unless job is remote and user wants remote)
          if (!this.locationsMatch(userLoc, jobLoc) && !job.job_is_remote) {
            continue;
          }
        }

        const jobText = `${job.job_title} ${job.employer_name} ${job.job_description || ''}`.toLowerCase();
        const matchCount = queryTerms.filter(term => jobText.includes(term)).length;
        const relevance = queryTerms.length > 0 ? matchCount / queryTerms.length : 0.5;

        // Boost for location match and LinkedIn source
        let boost = 0;
        if (criteria.location && job.job_city?.toLowerCase().includes(criteria.location.toLowerCase())) {
          boost += 0.2;
        }
        if (job.job_publisher?.toLowerCase().includes('linkedin')) {
          boost += 0.1; // Slight boost for LinkedIn jobs
        }

        // Determine salary string
        let salary: string | undefined;
        if (job.job_min_salary && job.job_max_salary) {
          const period = job.job_salary_period === 'YEAR' ? '/yr' : job.job_salary_period === 'HOUR' ? '/hr' : '';
          salary = `$${Math.round(job.job_min_salary).toLocaleString()} - $${Math.round(job.job_max_salary).toLocaleString()}${period}`;
        }

        results.push({
          id: `jsearch-${job.job_id}`,
          title: job.job_title,
          company: job.employer_name,
          location: [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', ') || 'Unknown',
          sourceUrl: job.job_apply_link || job.job_google_link,
          snippet: this.stripHtml(job.job_description || '').substring(0, 500),
          salary,
          remote: job.job_is_remote || false,
          postedDate: job.job_posted_at_datetime_utc ? new Date(job.job_posted_at_datetime_utc) : undefined,
          relevanceScore: relevance + boost
        });

        if (results.length >= 15) break;
      }

      console.log(`[JobSearchAgent] JSearch found ${results.length} jobs (sources: LinkedIn, Indeed, Glassdoor, etc.)`);
    } catch (error) {
      console.error('[JobSearchAgent] JSearch error:', error);
    }

    return results;
  }

  /**
   * Fetch URL with custom headers (for APIs like RapidAPI)
   */
  private async fetchUrlWithHeaders(url: string, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const urlObj = new URL(url);

      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
          ...headers
        }
      };

      const req = protocol.request(options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            this.fetchUrlWithHeaders(redirectUrl, headers).then(resolve).catch(reject);
            return;
          }
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
  }

  /**
   * Search Adzuna API (requires API key, excellent location support)
   */
  private async searchAdzuna(
    query: string,
    criteria: SearchCriteria,
    creds: { appId: string; apiKey: string }
  ): Promise<JobSearchResult[]> {
    const results: JobSearchResult[] = [];

    try {
      // Determine country code from location
      let country = 'us'; // default to US
      if (criteria.location) {
        const loc = criteria.location.toLowerCase();
        if (loc.includes('uk') || loc.includes('london') || loc.includes('england')) {
          country = 'gb';
        } else if (loc.includes('canada') || loc.includes('toronto') || loc.includes('vancouver')) {
          country = 'ca';
        } else if (loc.includes('australia') || loc.includes('sydney') || loc.includes('melbourne')) {
          country = 'au';
        }
      }

      // Build Adzuna API URL
      const params = new URLSearchParams();
      params.set('app_id', creds.appId);
      params.set('app_key', creds.apiKey);
      params.set('results_per_page', '15');
      params.set('what', query);
      if (criteria.location) {
        params.set('where', criteria.location);
      }

      const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params.toString()}`;
      console.log('[JobSearchAgent] Searching Adzuna:', url.replace(creds.apiKey, '***'));

      const response = await this.fetchUrl(url);
      const data = JSON.parse(response);
      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);

      for (const job of data.results || []) {
        if (!job.title || !job.company?.display_name) continue;

        const jobText = `${job.title} ${job.company.display_name} ${job.description || ''}`.toLowerCase();
        const matchCount = queryTerms.filter(term => jobText.includes(term)).length;
        const relevance = queryTerms.length > 0 ? matchCount / queryTerms.length : 0.5;

        // Adzuna has good location data, so boost relevance
        const locationBoost = criteria.location ? 0.3 : 0;

        results.push({
          id: `adzuna-${job.id}`,
          title: job.title,
          company: job.company.display_name,
          location: job.location?.display_name || 'Unknown',
          sourceUrl: job.redirect_url,
          snippet: this.stripHtml(job.description || '').substring(0, 500),
          salary: job.salary_min && job.salary_max
            ? `$${Math.round(job.salary_min).toLocaleString()} - $${Math.round(job.salary_max).toLocaleString()}`
            : undefined,
          remote: job.title?.toLowerCase().includes('remote') || job.description?.toLowerCase().includes('remote') || false,
          postedDate: job.created ? new Date(job.created) : undefined,
          relevanceScore: relevance + locationBoost
        });

        if (results.length >= 15) break;
      }

      console.log(`[JobSearchAgent] Adzuna found ${results.length} jobs`);
    } catch (error) {
      console.error('[JobSearchAgent] Adzuna search error:', error);
    }

    return results;
  }

  /**
   * Search Arbeitnow API (free, no key required, good location support)
   */
  private async searchArbeitnow(query: string, criteria: SearchCriteria): Promise<JobSearchResult[]> {
    const results: JobSearchResult[] = [];

    try {
      // Build URL with search params
      const params = new URLSearchParams();
      if (query) params.set('search', query);
      if (criteria.location) params.set('location', criteria.location);
      if (criteria.remote) params.set('remote', 'true');

      const url = `https://arbeitnow.com/api/job-board-api?${params.toString()}`;
      console.log('[JobSearchAgent] Searching Arbeitnow:', url);

      const response = await this.fetchUrl(url);
      const data = JSON.parse(response);
      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);

      for (const job of data.data || []) {
        if (!job.title || !job.company_name) continue;

        // Location filtering - skip if user specified location and job doesn't match
        if (criteria.location && job.location) {
          const userLoc = criteria.location.toLowerCase();
          const jobLoc = job.location.toLowerCase();
          // Check if locations are compatible (city/state match)
          if (!this.locationsMatch(userLoc, jobLoc)) {
            continue;
          }
        }

        const jobText = `${job.title} ${job.company_name} ${job.tags?.join(' ') || ''} ${job.description || ''}`.toLowerCase();
        const matchCount = queryTerms.filter(term => jobText.includes(term)).length;
        const relevance = queryTerms.length > 0 ? matchCount / queryTerms.length : 0.5;

        results.push({
          id: `arbeitnow-${job.slug}`,
          title: job.title,
          company: job.company_name,
          location: job.location || (job.remote ? 'Remote' : 'Unknown'),
          sourceUrl: job.url,
          snippet: this.stripHtml(job.description || '').substring(0, 500),
          salary: job.salary || undefined,
          remote: job.remote || false,
          postedDate: job.created_at ? new Date(job.created_at * 1000) : undefined,
          relevanceScore: relevance + (criteria.location && this.locationsMatch(criteria.location.toLowerCase(), (job.location || '').toLowerCase()) ? 0.2 : 0)
        });

        if (results.length >= 10) break;
      }

      console.log(`[JobSearchAgent] Arbeitnow found ${results.length} jobs`);
    } catch (error) {
      console.error('[JobSearchAgent] Arbeitnow search error:', error);
    }

    return results;
  }

  /**
   * Search Jobicy API (free remote job board)
   */
  private async searchJobicy(query: string, criteria: SearchCriteria): Promise<JobSearchResult[]> {
    const results: JobSearchResult[] = [];

    try {
      // Jobicy API - limited filtering but free
      const url = `https://jobicy.com/api/v2/remote-jobs?count=20&tag=${encodeURIComponent(query)}`;
      console.log('[JobSearchAgent] Searching Jobicy:', url);

      const response = await this.fetchUrl(url);
      const data = JSON.parse(response);
      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);

      for (const job of data.jobs || []) {
        if (!job.jobTitle || !job.companyName) continue;

        // Filter by location if specified
        if (criteria.location) {
          const userLoc = criteria.location.toLowerCase();
          const jobLoc = (job.jobGeo || '').toLowerCase();
          if (jobLoc && !jobLoc.includes('worldwide') && !jobLoc.includes('anywhere')) {
            if (!this.locationsMatch(userLoc, jobLoc)) {
              continue;
            }
          }
        }

        const jobText = `${job.jobTitle} ${job.companyName} ${job.jobIndustry || ''} ${job.jobExcerpt || ''}`.toLowerCase();
        const matchCount = queryTerms.filter(term => jobText.includes(term)).length;
        const relevance = queryTerms.length > 0 ? matchCount / queryTerms.length : 0.5;

        results.push({
          id: `jobicy-${job.id}`,
          title: job.jobTitle,
          company: job.companyName,
          location: job.jobGeo || 'Remote',
          sourceUrl: job.url,
          snippet: this.stripHtml(job.jobExcerpt || job.jobDescription || '').substring(0, 500),
          salary: job.annualSalaryMin && job.annualSalaryMax
            ? `$${job.annualSalaryMin.toLocaleString()} - $${job.annualSalaryMax.toLocaleString()}`
            : undefined,
          remote: true,
          postedDate: job.pubDate ? new Date(job.pubDate) : undefined,
          relevanceScore: relevance
        });

        if (results.length >= 10) break;
      }

      console.log(`[JobSearchAgent] Jobicy found ${results.length} jobs`);
    } catch (error) {
      console.error('[JobSearchAgent] Jobicy search error:', error);
    }

    return results;
  }

  /**
   * Check if two locations are compatible (fuzzy match)
   */
  private locationsMatch(userLoc: string, jobLoc: string): boolean {
    // Normalize
    userLoc = userLoc.toLowerCase().trim();
    jobLoc = jobLoc.toLowerCase().trim();

    // Direct contains
    if (jobLoc.includes(userLoc) || userLoc.includes(jobLoc)) {
      return true;
    }

    // US state/city matching
    const usStates: Record<string, string[]> = {
      'ny': ['new york', 'nyc', 'manhattan', 'brooklyn'],
      'new york': ['ny', 'nyc', 'manhattan', 'brooklyn'],
      'nyc': ['new york', 'ny', 'manhattan', 'brooklyn'],
      'ca': ['california', 'san francisco', 'sf', 'los angeles', 'la', 'san diego'],
      'california': ['ca', 'san francisco', 'sf', 'los angeles', 'la'],
      'tx': ['texas', 'austin', 'houston', 'dallas'],
      'texas': ['tx', 'austin', 'houston', 'dallas'],
      'wa': ['washington', 'seattle'],
      'seattle': ['wa', 'washington'],
      'usa': ['united states', 'us', 'america'],
      'united states': ['usa', 'us', 'america'],
      'remote': ['worldwide', 'anywhere', 'global']
    };

    // Check aliases
    for (const [key, aliases] of Object.entries(usStates)) {
      if (userLoc.includes(key)) {
        for (const alias of aliases) {
          if (jobLoc.includes(alias)) return true;
        }
        if (jobLoc.includes(key)) return true;
      }
    }

    return false;
  }

  /**
   * Search RemoteOK for jobs (JSON API - most reliable source)
   */
  private async searchRemoteOK(query: string, criteria: SearchCriteria): Promise<JobSearchResult[]> {
    const results: JobSearchResult[] = [];

    try {
      const response = await this.fetchUrl('https://remoteok.com/api');
      const jobs = JSON.parse(response);
      const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2);

      for (const job of jobs.slice(1)) { // Skip first element (metadata)
        if (!job.position || !job.company) continue;

        const jobText = `${job.position} ${job.company} ${job.tags?.join(' ') || ''} ${job.description || ''}`.toLowerCase();
        const matchCount = queryTerms.filter(term => jobText.includes(term)).length;

        if (matchCount > 0 || queryTerms.length === 0) {
          results.push({
            id: `remoteok-${job.id}`,
            title: job.position,
            company: job.company,
            location: job.location || 'Remote',
            sourceUrl: job.url || `https://remoteok.com/l/${job.id}`,
            snippet: this.stripHtml(job.description || '').substring(0, 500),
            salary: job.salary_min && job.salary_max ? `$${job.salary_min.toLocaleString()} - $${job.salary_max.toLocaleString()}` : undefined,
            remote: true,
            postedDate: job.date ? new Date(job.date) : undefined,
            relevanceScore: matchCount / Math.max(queryTerms.length, 1)
          });
        }

        if (results.length >= 15) break;
      }
    } catch (error) {
      console.error('[JobSearchAgent] RemoteOK search error:', error);
    }

    return results;
  }

  /**
   * Fetch full job details from a URL using LLM extraction
   */
  async fetchJobDetails(url: string): Promise<ExtractedJob | null> {
    console.log(`[JobSearchAgent] Fetching job details from: ${url}`);

    try {
      const html = await this.fetchUrl(url);
      return this.extractJobFromUrl(url, html);
    } catch (error) {
      console.error('[JobSearchAgent] Error fetching job details:', error);
      return null;
    }
  }

  /**
   * Extracts job details from a URL
   * Uses LLM to parse job posting content
   */
  async extractJobFromUrl(url: string, rawContent?: string): Promise<ExtractedJob | null> {
    if (!this.initializeLLM() || !this.llmClient) {
      console.error('LLM client not available for job extraction - check API key in Settings');
      return null;
    }

    // Fetch content if not provided
    let content = rawContent;
    if (!content) {
      console.log(`[JobSearchAgent] Fetching content from URL: ${url}`);
      try {
        content = await this.fetchUrl(url);
        if (!content || content.trim().length < 100) {
          console.error(`[JobSearchAgent] Failed to fetch meaningful content from: ${url}`);
          return null;
        }
        console.log(`[JobSearchAgent] Fetched ${content.length} characters from URL`);
      } catch (error) {
        console.error(`[JobSearchAgent] Error fetching URL: ${url}`, error);
        return null;
      }
    }

    const response = await this.llmClient.complete({
      systemPrompt: `You are a job posting parser. Extract structured information from job postings.

Return a JSON object with these fields:
- title: Job title (string)
- company: Company name (string)
- location: Location (string, include "Remote" if applicable)
- description: Brief job description (string, 2-3 sentences)
- requirements: Array of required qualifications (string[])
- preferredQualifications: Array of preferred/nice-to-have qualifications (string[])
- responsibilities: Array of job responsibilities (string[])
- salary: Salary information if mentioned (string or null)
- benefits: Array of benefits if mentioned (string[] or null)
- remote: Is this a remote position? (boolean)
- experienceLevel: Required experience level (string, e.g., "Senior", "Mid-level", "Entry")
- jobType: Employment type (string, e.g., "Full-time", "Contract", "Part-time")

Return ONLY valid JSON, no additional text.`,
      messages: [{
        role: 'user',
        content: `Extract job details from this posting:\n\n${content.substring(0, 10000)}`
      }]
    });

    try {
      const extracted = this.llmClient.parseJsonResponse(response.content) as ExtractedJob;
      // Preserve the source URL
      extracted.url = url;
      return extracted;
    } catch (error) {
      console.error('Failed to parse job extraction response:', error);
      return null;
    }
  }

  /**
   * Converts an extracted job to queue input format
   */
  extractedJobToQueueInput(extracted: ExtractedJob, sourceUrl?: string): QueueJobInput {
    const description = [
      extracted.description,
      '',
      '## Requirements',
      ...extracted.requirements.map(r => `- ${r}`),
      '',
      '## Preferred Qualifications',
      ...extracted.preferredQualifications.map(q => `- ${q}`),
      '',
      '## Responsibilities',
      ...extracted.responsibilities.map(r => `- ${r}`),
      '',
      extracted.salary ? `**Salary:** ${extracted.salary}` : '',
      extracted.benefits?.length ? `**Benefits:** ${extracted.benefits.join(', ')}` : '',
      extracted.jobType ? `**Type:** ${extracted.jobType}` : '',
      extracted.experienceLevel ? `**Level:** ${extracted.experienceLevel}` : ''
    ].filter(line => line !== '').join('\n');

    return {
      sourceUrl,
      company: extracted.company,
      title: extracted.title,
      rawDescription: description,
      parsedElements: {
        requiredSkills: extracted.requirements,
        preferredSkills: extracted.preferredQualifications,
        responsibilities: extracted.responsibilities,
        qualifications: [...extracted.requirements, ...extracted.preferredQualifications],
        keywords: this.extractKeywords(description),
        experienceYears: this.parseExperienceYears(extracted.experienceLevel),
        educationLevel: this.parseEducationLevel(extracted.requirements)
      }
    };
  }

  /**
   * Builds a search query string from criteria
   */
  private buildSearchQuery(criteria: SearchCriteria): string {
    const parts: string[] = [];

    // Keywords
    if (criteria.keywords.length > 0) {
      parts.push(criteria.keywords.join(' '));
    }

    // Add remote modifier
    if (criteria.remote) {
      parts.push('remote');
    }

    return parts.join(' ');
  }

  /**
   * Generates search URLs for various job boards
   */
  private generateSearchUrls(
    query: string,
    criteria: SearchCriteria
  ): Record<string, string> {
    const urls: Record<string, string> = {};
    const encodedQuery = encodeURIComponent(query);

    // LinkedIn
    urls['LinkedIn'] = `https://www.linkedin.com/jobs/search/?keywords=${encodedQuery}${criteria.location ? `&location=${encodeURIComponent(criteria.location)}` : ''}`;

    // Indeed
    urls['Indeed'] = `https://www.indeed.com/jobs?q=${encodedQuery}${criteria.location ? `&l=${encodeURIComponent(criteria.location)}` : ''}`;

    // Glassdoor
    urls['Glassdoor'] = `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodedQuery}`;

    // Google Jobs
    urls['Google'] = `https://www.google.com/search?q=${encodedQuery}+jobs${criteria.location ? `+${encodeURIComponent(criteria.location)}` : ''}`;

    return urls;
  }

  /**
   * Extracts keywords from job description text
   */
  private extractKeywords(text: string): string[] {
    const keywords: string[] = [];
    const lowerText = text.toLowerCase();

    // Technical keywords
    const techKeywords = [
      'python', 'javascript', 'typescript', 'java', 'c++', 'go', 'rust',
      'react', 'angular', 'vue', 'node', 'django', 'fastapi', 'spring',
      'aws', 'azure', 'gcp', 'kubernetes', 'docker', 'terraform',
      'sql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
      'machine learning', 'ai', 'data science', 'analytics',
      'agile', 'scrum', 'ci/cd', 'devops', 'microservices'
    ];

    for (const keyword of techKeywords) {
      if (lowerText.includes(keyword)) {
        keywords.push(keyword);
      }
    }

    return keywords;
  }

  /**
   * Parses experience years from level description
   */
  private parseExperienceYears(level?: string): number | undefined {
    if (!level) return undefined;

    const lower = level.toLowerCase();

    if (lower.includes('entry') || lower.includes('junior')) {
      return 0;
    }
    if (lower.includes('mid')) {
      return 3;
    }
    if (lower.includes('senior')) {
      return 5;
    }
    if (lower.includes('lead') || lower.includes('principal')) {
      return 8;
    }
    if (lower.includes('staff') || lower.includes('architect')) {
      return 10;
    }

    // Try to extract number
    const match = level.match(/(\d+)/);
    if (match) {
      return parseInt(match[1]);
    }

    return undefined;
  }

  /**
   * Parses education level from requirements
   */
  private parseEducationLevel(requirements: string[]): string | undefined {
    const allText = requirements.join(' ').toLowerCase();

    if (allText.includes('phd') || allText.includes('doctorate')) {
      return 'PhD';
    }
    if (allText.includes("master's") || allText.includes('masters') || allText.includes('ms ') || allText.includes('mba')) {
      return "Master's";
    }
    if (allText.includes("bachelor's") || allText.includes('bachelors') || allText.includes('bs ') || allText.includes('ba ')) {
      return "Bachelor's";
    }
    if (allText.includes('degree')) {
      return "Bachelor's";
    }

    return undefined;
  }

  /**
   * Scores job relevance against criteria
   */
  scoreRelevance(job: JobSearchResult, criteria: SearchCriteria): number {
    let score = 0;
    const weights = {
      keywordMatch: 0.4,
      locationMatch: 0.2,
      companyMatch: 0.2,
      remoteMatch: 0.2
    };

    // Keyword matching
    const jobText = `${job.title} ${job.company} ${job.snippet}`.toLowerCase();
    const matchedKeywords = criteria.keywords.filter(k => jobText.includes(k.toLowerCase()));
    score += weights.keywordMatch * (matchedKeywords.length / Math.max(criteria.keywords.length, 1));

    // Location matching
    if (criteria.location) {
      if (job.location.toLowerCase().includes(criteria.location.toLowerCase())) {
        score += weights.locationMatch;
      }
    } else {
      score += weights.locationMatch; // No location preference
    }

    // Company matching
    if (criteria.company) {
      if (job.company.toLowerCase().includes(criteria.company.toLowerCase())) {
        score += weights.companyMatch;
      }
    } else {
      score += weights.companyMatch; // No company preference
    }

    // Remote matching
    if (criteria.remote !== undefined) {
      if (job.remote === criteria.remote) {
        score += weights.remoteMatch;
      }
    } else {
      score += weights.remoteMatch; // No remote preference
    }

    // Penalty for excluded companies
    if (criteria.excludeCompanies) {
      for (const excluded of criteria.excludeCompanies) {
        if (job.company.toLowerCase().includes(excluded.toLowerCase())) {
          score = 0; // Completely exclude
          break;
        }
      }
    }

    return Math.min(1, Math.max(0, score));
  }

  /**
   * Updates configuration
   */
  updateConfig(config: Partial<JobSearchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets current configuration
   */
  getConfig(): JobSearchConfig {
    return { ...this.config };
  }

  /**
   * Enables or disables a job board source
   */
  setSourceEnabled(sourceName: string, enabled: boolean): void {
    const source = this.sources.find(s => s.name.toLowerCase() === sourceName.toLowerCase());
    if (source) {
      source.enabled = enabled;
    }
  }

  /**
   * Gets enabled job board sources
   */
  getEnabledSources(): JobBoardSource[] {
    return this.sources.filter(s => s.enabled);
  }
}

// Export singleton instance
export const jobSearchAgent = new JobSearchAgent();
