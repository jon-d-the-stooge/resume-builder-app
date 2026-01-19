# Design Document: ATS Agent

## Overview

The ATS Agent is an intelligent resume screening system that mimics real-world Applicant Tracking System behavior. It analyzes job postings and resumes through semantic parsing, importance weighting, and match scoring to determine candidate-job fit. The system operates in an iterative optimization loop with a Resume Writer Agent, providing actionable feedback until an optimal match is achieved or early stopping criteria are met.

The design emphasizes:
- **Semantic understanding**: Beyond keyword matching to recognize related concepts
- **Importance weighting**: Prioritizing critical requirements over nice-to-haves
- **Iterative optimization**: Continuous improvement through feedback loops
- **Transparency**: Explainable scoring and recommendations
- **Integration**: Clean interfaces with external agents and data sources
- **Code reuse**: Leverages shared infrastructure from resume-content-ingestion feature

## Shared Infrastructure Refactoring

To eliminate code duplication and ensure consistency, the following components are extracted into shared utilities that both resume-content-ingestion and ats-agent features use:

### Shared Module Structure

```
src/shared/
├── llm/
│   ├── client.ts          # Unified LLM client (Anthropic + OpenAI)
│   ├── types.ts           # LLM config and response types
│   ├── cache.ts           # Response caching layer
│   └── prompts.ts         # Common prompt utilities
├── obsidian/
│   ├── client.ts          # Obsidian MCP client
│   ├── types.ts           # Vault and note types
│   └── query.ts           # Query builder utilities
├── validation/
│   ├── validator.ts       # Common validation utilities
│   ├── schemas.ts         # Zod schemas
│   └── types.ts           # Validation result types
├── errors/
│   ├── handler.ts         # Error handling utilities
│   ├── types.ts           # Error types and codes
│   └── logger.ts          # Error logging
└── types/
    ├── common.ts          # Shared type definitions
    └── index.ts           # Type exports
```

### Refactoring Benefits

1. **Consistency**: Both features use identical LLM client behavior
2. **Maintainability**: Bug fixes and improvements benefit both features
3. **Testing**: Shared utilities tested once, used everywhere
4. **Performance**: Shared caching layer reduces redundant API calls
5. **Configuration**: Single source of truth for LLM and Obsidian config

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        ATS Agent                             │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Parser     │  │   Semantic   │  │   Scorer     │     │
│  │   Engine     │──│   Analyzer   │──│   Engine     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                  │             │
│         └──────────────────┴──────────────────┘             │
│                            │                                │
│                   ┌────────▼────────┐                       │
│                   │  Recommendation │                       │
│                   │    Generator    │                       │
│                   └────────┬────────┘                       │
│                            │                                │
│                   ┌────────▼────────┐                       │
│                   │   Iteration     │                       │
│                   │   Controller    │                       │
│                   └─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
         ▲                    │                    ▲
         │                    │                    │
         │                    ▼                    │
    ┌────┴─────┐      ┌──────────────┐      ┌────┴─────┐
    │   Job    │      │    Resume    │      │ Obsidian │
    │  Search  │      │    Writer    │      │  Vault   │
    │  Agent   │      │    Agent     │      │          │
    └──────────┘      └──────────────┘      └──────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Shared Infrastructure                     │
│                  (from resume-content-ingestion)             │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  LLM Client  │  │   Obsidian   │  │  Validator   │     │
│  │   (Unified)  │  │  MCP Client  │  │   Utilities  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │    Error     │  │    Common    │                        │
│  │   Handler    │  │    Types     │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Parser Engine**:
- Extracts elements (keywords, skills, attributes, concepts) from text
- Handles multi-word phrases and compound terms
- Consolidates duplicate elements
- Normalizes text for consistent processing
- **Uses shared LLM Client** for intelligent parsing

**Semantic Analyzer**:
- Assigns semantic tags to elements based on meaning and context
- Maintains taxonomy of tag categories
- Recognizes semantic equivalence between different terms
- Infers relationships between concepts
- **Uses shared LLM Client** for semantic understanding

**Scorer Engine**:
- Assigns importance scores to job requirements (0.0-1.0)
- Calculates match scores between resumes and job postings
- Weights matches by importance
- Generates scoring breakdowns for transparency

**Recommendation Generator**:
- Identifies gaps between resume and job requirements
- Prioritizes recommendations by importance
- Generates actionable, specific suggestions
- Formats recommendations for Resume Writer Agent

**Iteration Controller**:
- Manages optimization loop state
- Tracks iteration rounds and score history
- Evaluates termination criteria (early stopping, threshold)
- Coordinates communication with Resume Writer Agent

### Shared Infrastructure (Reused from resume-content-ingestion)

**LLM Client** (src/shared/llm/):
- Unified client supporting Anthropic and OpenAI
- Structured output with JSON schema
- Response caching for performance
- Retry logic with exponential backoff
- Temperature=0 for deterministic results

**Obsidian MCP Client** (src/shared/obsidian/):
- Read resume content from vault
- Save analysis results to vault
- Query vault for resume data
- Handle vault unavailability gracefully

**Validator Utilities** (src/shared/validation/):
- Required field validation
- YAML frontmatter validation
- Metadata structure validation
- Schema validation with Zod

**Error Handler** (src/shared/errors/):
- LLM API error handling (timeout, rate limits)
- Vault unavailability handling
- User-friendly error messages
- Error logging and tracking

**Common Types** (src/shared/types/):
- DateRange, Location, ContentMetadata
- Obsidian-specific types
- LLM configuration types
- Shared interfaces

## Components and Interfaces

### 1. Parser Engine

**Purpose**: Extract structured elements from unstructured job descriptions and resumes.

**Interface**:
```typescript
interface ParserEngine {
  parseJobDescription(jobPosting: JobPosting): ParsedJob;
  parseResume(resume: Resume): ParsedResume;
}

interface JobPosting {
  id: string;
  title: string;
  description: string;
  requirements: string;
  qualifications: string;
  metadata?: Record<string, any>;
}

interface Resume {
  id: string;
  content: string;
  format: 'text' | 'markdown' | 'obsidian';
  metadata?: Record<string, any>;
}

interface ParsedJob {
  elements: Element[];
  rawText: string;
  metadata: Record<string, any>;
}

interface ParsedResume {
  elements: Element[];
  rawText: string;
  metadata: Record<string, any>;
}

interface Element {
  text: string;
  normalizedText: string;
  tags: string[];
  context: string;
  position: { start: number; end: number };
}
```

**Key Operations**:
- **Text normalization**: Lowercase, trim whitespace, handle punctuation
- **Phrase extraction**: Identify multi-word terms using NLP techniques
- **Deduplication**: Consolidate identical elements from different sections
- **Context preservation**: Maintain surrounding text for semantic analysis

**Implementation Notes**:
- Use LLM-based parsing (via existing parserAgent or new LLM client) for intelligent extraction
- LLM handles multi-word phrases, semantic understanding, and context naturally
- Use structured output (JSON schema) to ensure consistent parsing results
- Set temperature=0 for deterministic outputs
- Cache parsing results to avoid redundant API calls
- Handle various input formats (plain text, markdown, structured data)

### 2. Semantic Analyzer

**Purpose**: Assign semantic tags and recognize relationships between elements.

**Interface**:
```typescript
interface SemanticAnalyzer {
  analyzeTags(element: Element, context: string): string[];
  findSemanticMatches(
    resumeElement: Element,
    jobElements: Element[]
  ): SemanticMatch[];
}

interface SemanticMatch {
  resumeElement: Element;
  jobElement: Element;
  matchType: 'exact' | 'synonym' | 'related' | 'semantic';
  confidence: number; // 0.0 to 1.0
}
```

**Tag Taxonomy**:
```typescript
const TAG_TAXONOMY = {
  technical_skills: [
    'programming',
    'databases',
    'frameworks',
    'tools',
    'platforms',
    'languages'
  ],
  soft_skills: [
    'leadership',
    'communication',
    'teamwork',
    'problem_solving',
    'time_management'
  ],
  attributes: [
    'experience_level',
    'education',
    'certifications',
    'domain_knowledge'
  ],
  concepts: [
    'methodologies',
    'practices',
    'principles'
  ]
};
```

**Semantic Matching Rules**:
- **Exact match**: Identical normalized text (confidence: 1.0)
- **Synonym match**: Known synonyms (e.g., "JS" ↔ "JavaScript") (confidence: 0.95)
- **Related match**: Same category (e.g., "Python" ↔ "programming") (confidence: 0.7)
- **Semantic match**: Contextual similarity via embeddings (confidence: variable)

**Implementation Notes**:
- Use LLM-based semantic analysis for tag assignment and matching
- Maintain a dictionary of known synonyms and abbreviations as fallback
- LLM naturally handles semantic similarity without embeddings
- Cache semantic analysis results for performance
- Use structured prompts to ensure consistent tag taxonomy

### 3. Scorer Engine

**Purpose**: Assign importance scores and calculate match scores.

**Interface**:
```typescript
interface ScorerEngine {
  assignImportance(element: Element, context: string): number;
  calculateMatchScore(
    parsedResume: ParsedResume,
    parsedJob: ParsedJob,
    matches: SemanticMatch[]
  ): MatchResult;
}

interface MatchResult {
  overallScore: number; // 0.0 to 1.0
  breakdown: ScoreBreakdown;
  gaps: Gap[];
  strengths: Strength[];
}

interface ScoreBreakdown {
  keywordScore: number;
  skillsScore: number;
  attributesScore: number;
  experienceScore: number;
  levelScore: number;
  weights: {
    keywords: number;
    skills: number;
    attributes: number;
    experience: number;
    level: number;
  };
}

interface Gap {
  element: Element;
  importance: number;
  category: string;
  impact: number; // How much this gap reduces the score
}

interface Strength {
  element: Element;
  matchType: string;
  contribution: number; // How much this adds to the score
}
```

**Importance Scoring Algorithm**:
```
For each element in job description:
  1. Check for explicit importance indicators:
     - "required", "must have", "essential" → 0.9-1.0
     - "preferred", "nice to have", "bonus" → 0.3-0.5
     - "strongly preferred" → 0.7-0.8
  
  2. If no explicit indicators, infer from:
     - Position in text (earlier = more important)
     - Frequency of mention (more mentions = more important)
     - Section context (requirements vs nice-to-haves)
     - Sentence structure (main clause vs subordinate)
  
  3. Apply category-based adjustments:
     - Technical skills in tech roles: +0.1
     - Soft skills: baseline
     - Certifications: +0.05 if mentioned multiple times
  
  4. Normalize to 0.0-1.0 range
```

**Match Scoring Algorithm**:
```
1. For each job element with importance I:
   - Find best matching resume element (if any)
   - Calculate match quality Q (0.0-1.0 based on match type)
   - Contribution = I × Q
   
2. Calculate dimension scores:
   - Keywords: avg(contributions for keyword elements)
   - Skills: avg(contributions for skill elements)
   - Attributes: avg(contributions for attribute elements)
   - Experience: avg(contributions for experience elements)
   - Level: binary (1.0 if level matches, 0.5 if close, 0.0 if far)

3. Apply dimension weights:
   - Keywords: 0.20
   - Skills: 0.35
   - Attributes: 0.20
   - Experience: 0.15
   - Level: 0.10

4. Overall score = weighted sum of dimension scores

5. Identify gaps:
   - Job elements with no match or low-quality match
   - Sort by importance × (1 - match quality)

6. Identify strengths:
   - High-quality matches on high-importance elements
   - Sort by importance × match quality
```

**Implementation Notes**:
- Dimension weights should be configurable
- Consider industry-specific weight adjustments
- Track score history across iterations for trend analysis

### 4. Recommendation Generator

**Purpose**: Generate actionable feedback for resume improvement.

**Interface**:
```typescript
interface RecommendationGenerator {
  generateRecommendations(matchResult: MatchResult): Recommendations;
}

interface Recommendations {
  summary: string;
  priority: Recommendation[];
  optional: Recommendation[];
  rewording: Recommendation[];
  metadata: {
    iterationRound: number;
    currentScore: number;
    targetScore: number;
  };
}

interface Recommendation {
  type: 'add_skill' | 'add_experience' | 'reword' | 'emphasize' | 'quantify';
  element: string;
  importance: number;
  suggestion: string;
  example?: string;
}
```

**Recommendation Generation Logic**:
```
1. Prioritize gaps by importance:
   - High importance (>0.8): Priority recommendations
   - Medium importance (0.5-0.8): Optional recommendations
   - Low importance (<0.5): Mention if space allows

2. For each high-priority gap:
   - Type: 'add_skill' or 'add_experience'
   - Suggestion: Specific action (e.g., "Add Python experience")
   - Example: How to phrase it (e.g., "Developed Python scripts for...")

3. For partial matches:
   - Type: 'reword' or 'emphasize'
   - Suggestion: How to strengthen the match
   - Example: Before/after phrasing

4. For matched elements with weak phrasing:
   - Type: 'quantify'
   - Suggestion: Add metrics or specifics
   - Example: "Led team" → "Led team of 5 engineers"

5. Generate summary:
   - Current score and target
   - Number of critical gaps
   - Top 3 recommendations
```

### 5. Iteration Controller

**Purpose**: Manage the optimization loop and termination criteria.

**Interface**:
```typescript
interface IterationController {
  startOptimization(
    jobPosting: JobPosting,
    initialResume: Resume,
    config: OptimizationConfig
  ): Promise<OptimizationResult>;
  
  processIteration(
    resumeDraft: Resume,
    previousScore: number
  ): IterationDecision;
}

interface OptimizationConfig {
  targetScore: number; // Default: 0.8
  maxIterations: number; // Default: 10
  earlyStoppingRounds: number; // Default: 2
  minImprovement: number; // Default: 0.01
}

interface OptimizationResult {
  finalResume: Resume;
  finalScore: number;
  iterations: IterationHistory[];
  terminationReason: 'target_reached' | 'early_stopping' | 'max_iterations';
  metrics: {
    initialScore: number;
    finalScore: number;
    improvement: number;
    iterationCount: number;
  };
}

interface IterationHistory {
  round: number;
  score: number;
  recommendations: Recommendations;
  resumeVersion: string;
}

interface IterationDecision {
  shouldContinue: boolean;
  reason: string;
  recommendations?: Recommendations;
}
```

**Termination Logic**:
```
After each iteration:
  1. Calculate current match score
  
  2. Check target threshold:
     IF score >= targetScore THEN
       RETURN terminate(reason: 'target_reached')
  
  3. Check early stopping:
     IF last N rounds show no improvement THEN
       RETURN terminate(reason: 'early_stopping')
     
     Where "no improvement" means:
       score[i] - score[i-1] < minImprovement
  
  4. Check max iterations:
     IF iterationCount >= maxIterations THEN
       RETURN terminate(reason: 'max_iterations')
  
  5. Otherwise:
     RETURN continue(recommendations: generateRecommendations())
```

**Implementation Notes**:
- Store iteration history for analysis and debugging
- Implement timeout safeguards for external agent communication
- Log all decisions and scores for transparency

## Data Models

### Configuration and Defaults

**LLM Configuration**:
```typescript
interface LLMConfig {
  provider: 'anthropic' | 'openai';
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number; // milliseconds
}

const DEFAULT_LLM_CONFIG: Record<'anthropic' | 'openai', Omit<LLMConfig, 'apiKey'>> = {
  anthropic: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0,
    maxTokens: 4096,
    timeout: 30000
  },
  openai: {
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0,
    maxTokens: 4096,
    timeout: 30000
  }
};
```

**System Configuration**:
```typescript
interface ATSAgentConfig {
  llm: LLMConfig;
  scoring: ScoringConfig;
  iteration: IterationConfig;
  retry: RetryConfig;
  cache: CacheConfig;
}

interface ScoringConfig {
  dimensionWeights: {
    keywords: number;
    skills: number;
    attributes: number;
    experience: number;
    level: number;
  };
  targetScore: number;
  minImprovement: number;
}

interface IterationConfig {
  maxIterations: number;
  earlyStoppingRounds: number;
}

interface RetryConfig {
  obsidianMaxRetries: number;
  obsidianBackoffMs: number[];
  agentTimeoutMs: number;
  llmMaxRetries: number;
  llmBackoffMs: number[];
}

interface CacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  maxEntries: number;
}

const DEFAULT_CONFIG: Omit<ATSAgentConfig, 'llm'> = {
  scoring: {
    dimensionWeights: {
      keywords: 0.20,
      skills: 0.35,
      attributes: 0.20,
      experience: 0.15,
      level: 0.10
    },
    targetScore: 0.8,
    minImprovement: 0.01
  },
  iteration: {
    maxIterations: 10,
    earlyStoppingRounds: 2
  },
  retry: {
    obsidianMaxRetries: 3,
    obsidianBackoffMs: [1000, 2000, 4000],
    agentTimeoutMs: 30000,
    llmMaxRetries: 3,
    llmBackoffMs: [1000, 2000, 4000]
  },
  cache: {
    enabled: true,
    ttlSeconds: 3600,
    maxEntries: 1000
  }
};
```

### External Communication Protocols

**Job Search Agent Protocol**:
```typescript
// Input: Job posting from Job Search Agent
interface JobSearchPayload {
  job: {
    id: string;
    title: string;
    company: string;
    description: string;
    requirements: string;
    qualifications: string;
    posted_date: string;
    location?: string;
    salary_range?: string;
  };
  metadata: {
    source: string;
    url?: string;
    retrieved_at: string;
  };
}

// Response: Acknowledgment
interface JobSearchResponse {
  status: 'accepted' | 'rejected';
  job_id: string;
  message?: string;
  errors?: ValidationError[];
}

interface ValidationError {
  field: string;
  message: string;
  received?: any;
}
```

**Resume Writer Agent Protocol**:
```typescript
// Output: Recommendations to Resume Writer Agent
interface ResumeWriterRequest {
  request_id: string;
  job_id: string;
  resume_id: string;
  iteration_round: number;
  current_score: number;
  target_score: number;
  recommendations: {
    summary: string;
    priority: RecommendationItem[];
    optional: RecommendationItem[];
    rewording: RecommendationItem[];
  };
  gaps: GapItem[];
  strengths: StrengthItem[];
  metadata: {
    timestamp: string;
    previous_scores: number[];
  };
}

interface RecommendationItem {
  type: 'add_skill' | 'add_experience' | 'reword' | 'emphasize' | 'quantify';
  element: string;
  importance: number;
  suggestion: string;
  example?: string;
  job_requirement_reference: string;
}

interface GapItem {
  element: string;
  importance: number;
  category: string;
  impact: number;
}

interface StrengthItem {
  element: string;
  match_type: string;
  contribution: number;
}

// Input: Updated resume from Resume Writer Agent
interface ResumeWriterResponse {
  response_id: string;
  request_id: string;
  resume_id: string;
  resume: {
    id: string;
    content: string;
    format: 'text' | 'markdown';
    version: number;
  };
  changes_made: string[];
  metadata: {
    timestamp: string;
    processing_time_ms: number;
  };
}
```

**Communication Flow**:
```
1. Job Search Agent → ATS Agent:
   POST /api/ats/analyze
   Body: JobSearchPayload
   Response: JobSearchResponse

2. ATS Agent → Resume Writer Agent:
   POST /api/resume-writer/improve
   Body: ResumeWriterRequest
   Response: ResumeWriterResponse

3. Iteration continues until termination criteria met

4. ATS Agent → Job Search Agent (final result):
   POST /api/job-search/result
   Body: OptimizationResult
```

**Error Responses**:
```typescript
interface ErrorResponse {
  error: string;
  message: string;
  details?: any;
  timestamp: string;
  request_id?: string;
}

// Standard error codes:
// - INVALID_INPUT: Validation failed
// - PARSING_FAILED: Could not parse content
// - INTEGRATION_ERROR: External service unavailable
// - SEMANTIC_ANALYSIS_FAILED: Could not analyze semantics
// - SCORING_ERROR: Score calculation failed
// - TIMEOUT: Operation exceeded time limit
// - RATE_LIMIT: Too many requests
```

### LLM Prompt Formats

**Parsing Prompt**:
```typescript
interface ParsingPrompt {
  system: string;
  user: string;
  response_format: {
    type: 'json_schema';
    json_schema: {
      name: 'parsed_elements';
      schema: {
        type: 'object';
        properties: {
          elements: {
            type: 'array';
            items: {
              type: 'object';
              properties: {
                text: { type: 'string' };
                normalizedText: { type: 'string' };
                tags: { type: 'array'; items: { type: 'string' } };
                category: { 
                  type: 'string'; 
                  enum: ['keyword', 'skill', 'attribute', 'experience', 'concept'] 
                };
                context: { type: 'string' };
                importance: { type: 'number'; minimum: 0; maximum: 1 };
              };
              required: ['text', 'normalizedText', 'tags', 'category', 'context'];
            };
          };
        };
        required: ['elements'];
      };
    };
  };
}

const PARSING_SYSTEM_PROMPT = `You are an expert ATS (Applicant Tracking System) parser. Your job is to extract structured elements from job descriptions and resumes.

Extract:
- Keywords: Important terms and phrases
- Skills: Technical and soft skills
- Attributes: Qualifications, certifications, experience levels
- Experience: Descriptions of work history and accomplishments
- Concepts: Methodologies, practices, principles

For each element:
1. Identify multi-word phrases as single elements (e.g., "machine learning", not "machine" and "learning")
2. Assign semantic tags based on meaning and context
3. Categorize as: keyword, skill, attribute, experience, or concept
4. For job descriptions: assign importance score (0.0-1.0) based on:
   - Explicit indicators: "required" (0.9-1.0), "preferred" (0.3-0.5)
   - Position in text (earlier = more important)
   - Frequency of mention
   - Section context

Return structured JSON matching the schema.`;
```

**Semantic Matching Prompt**:
```typescript
const SEMANTIC_MATCHING_SYSTEM_PROMPT = `You are an expert at identifying semantic relationships between terms in job descriptions and resumes.

Your task is to match resume elements to job elements, recognizing:
- Exact matches: Identical terms
- Synonyms: "JavaScript" ↔ "JS", "led team" ↔ "leadership"
- Related terms: "Python" relates to "programming", "software development"
- Semantic similarity: Contextually similar concepts

For each match, assign:
- Match type: exact, synonym, related, or semantic
- Confidence score: 0.0 to 1.0

Return structured JSON with all matches.`;
```

## Data Models

### Core Data Structures

```typescript
// Element with importance and tags
interface TaggedElement extends Element {
  importance: number;
  semanticTags: string[];
  category: 'keyword' | 'skill' | 'attribute' | 'experience' | 'concept';
}

// Parsed job with importance-weighted elements
interface WeightedJob {
  id: string;
  elements: TaggedElement[];
  totalImportance: number; // Sum of all importance scores
  criticalElements: TaggedElement[]; // importance > 0.8
  metadata: Record<string, any>;
}

// Parsed resume with tagged elements
interface TaggedResume {
  id: string;
  elements: TaggedElement[];
  sections: ResumeSection[];
  metadata: Record<string, any>;
}

interface ResumeSection {
  type: 'summary' | 'experience' | 'skills' | 'education' | 'other';
  content: string;
  elements: TaggedElement[];
}

// Match analysis result
interface MatchAnalysis {
  score: MatchResult;
  matches: SemanticMatch[];
  gaps: Gap[];
  strengths: Strength[];
  recommendations: Recommendations;
}

// Optimization state
interface OptimizationState {
  jobPosting: WeightedJob;
  currentResume: TaggedResume;
  history: IterationHistory[];
  config: OptimizationConfig;
  status: 'running' | 'completed' | 'failed';
}
```

### Data Flow

```
1. Job Posting Input:
   JobPosting → Parser → ParsedJob → Semantic Analyzer → WeightedJob

2. Resume Input:
   Resume → Parser → ParsedResume → Semantic Analyzer → TaggedResume

3. Matching:
   (WeightedJob, TaggedResume) → Semantic Analyzer → SemanticMatch[]
   → Scorer → MatchResult

4. Recommendations:
   MatchResult → Recommendation Generator → Recommendations
   → Resume Writer Agent

5. Iteration:
   Updated Resume → Parser → ... → MatchResult
   → Iteration Controller → Decision (continue/terminate)
```

### Storage and Persistence

**Obsidian Vault Integration**:
```typescript
interface ObsidianClient {
  getResumeContent(resumeId: string): Promise<Resume>;
  saveAnalysisResult(
    jobId: string,
    resumeId: string,
    result: OptimizationResult
  ): Promise<void>;
}

// Expected Obsidian vault structure (from resume-content-ingestion):
// /resumes/{resumeId}/content.md
// /resumes/{resumeId}/metadata.json
// /analyses/{jobId}-{resumeId}/result.json
```

**Analysis Results Storage**:
- Store optimization results for future reference
- Include full iteration history for learning
- Save final recommendations and scores
- Link to source job posting and resume


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Parsing Properties

**Property 1: Element Extraction Completeness**
*For any* job description or resume text, the parser should extract all identifiable keywords, concepts, attributes, and skills present in the text.
**Validates: Requirements 1.1, 4.1**

**Property 2: Multi-word Phrase Handling**
*For any* text containing multi-word phrases (e.g., "machine learning", "project management"), the parser should treat each phrase as a single element rather than separate words.
**Validates: Requirements 1.4**

**Property 3: Deduplication with Max Importance**
*For any* text containing duplicate elements, after parsing and consolidation, there should be no duplicate elements, and each consolidated element should have the maximum importance score from all occurrences.
**Validates: Requirements 1.5, 4.5**

**Property 4: Parsing Consistency**
*For any* identical text, parsing it as a job description or as a resume should produce identical elements with identical tags (the parsing methodology should be consistent regardless of source type).
**Validates: Requirements 4.1, 4.2**

### Semantic Analysis Properties

**Property 5: Tag Assignment Completeness**
*For any* extracted element, the semantic analyzer should assign at least one semantic tag based on its meaning and context.
**Validates: Requirements 2.1**

**Property 6: Skill Categorization**
*For any* element identified as a skill, the semantic analyzer should assign appropriate category tags (technical_skills, soft_skills, or attributes) based on the skill type.
**Validates: Requirements 1.2, 1.3**

**Property 7: Semantic Relationship Tagging**
*For any* technical term (e.g., "Python", "SQL"), the semantic analyzer should assign related concept tags (e.g., "programming", "databases") that reflect its semantic domain.
**Validates: Requirements 2.2**

**Property 8: Context-Aware Disambiguation**
*For any* ambiguous term appearing in different contexts, the semantic analyzer should assign different tags based on the surrounding context (e.g., "Java" as programming language vs. "Java" as location).
**Validates: Requirements 2.3**

**Property 9: Semantic Equivalence Recognition**
*For any* pair of semantically equivalent terms (e.g., "JavaScript" and "JS", "led team" and "leadership"), the semantic matcher should recognize them as matches with high confidence.
**Validates: Requirements 2.4**

**Property 10: Tag Taxonomy Consistency**
*For any* element parsed multiple times in different contexts, the semantic analyzer should assign tags from the same consistent taxonomy (the same element should not get contradictory tags).
**Validates: Requirements 2.5**

### Scoring Properties

**Property 11: Importance Score Range**
*For any* element extracted from a job description, the assigned importance score should be in the range [0.0, 1.0].
**Validates: Requirements 3.1**

**Property 12: Explicit High-Importance Indicators**
*For any* job element marked with explicit high-importance indicators ("required", "must have", "essential"), the importance score should be >= 0.9.
**Validates: Requirements 3.2**

**Property 13: Explicit Low-Importance Indicators**
*For any* job element marked with explicit low-importance indicators ("preferred", "nice to have", "bonus"), the importance score should be <= 0.5.
**Validates: Requirements 3.3**

**Property 14: Conflicting Importance Resolution**
*For any* job element with multiple conflicting importance indicators, the assigned importance score should reflect the highest importance level indicated.
**Validates: Requirements 3.5**

**Property 15: Match Score Range**
*For any* resume-job pair, the calculated match score should be in the range [0.0, 1.0].
**Validates: Requirements 5.1**

**Property 16: Importance Weighting Effect**
*For any* two resume-job pairs where pair A matches a high-importance element and pair B matches a low-importance element (with same match quality), pair A should have a higher overall match score than pair B.
**Validates: Requirements 5.2, 5.3**

**Property 17: Multi-Dimensional Scoring**
*For any* resume-job match calculation, the score breakdown should include contributions from all dimensions: keywords, skills, attributes, experience, and level.
**Validates: Requirements 5.4**

**Property 18: Gap Penalty Proportionality**
*For any* resume-job pair with missing elements, gaps with higher importance scores should reduce the overall match score more than gaps with lower importance scores.
**Validates: Requirements 5.5**

### Recommendation Properties

**Property 19: Recommendation Generation**
*For any* match score calculation, the system should generate a structured recommendations object containing a summary and prioritized suggestions.
**Validates: Requirements 6.1**

**Property 20: Gap Prioritization**
*For any* set of identified gaps, the recommendations should list them in descending order of importance score (highest importance gaps first).
**Validates: Requirements 6.2**

**Property 21: High-Importance Gap Inclusion**
*For any* resume-job pair, all gaps with importance >= 0.8 should appear in the priority recommendations list.
**Validates: Requirements 6.3**

**Property 22: Rewording Suggestions for Partial Matches**
*For any* resume element that partially matches a job element (match confidence between 0.3 and 0.7), the recommendations should include a rewording suggestion to strengthen the match.
**Validates: Requirements 6.4**

### Iteration Properties

**Property 23: Structured Communication Format**
*For any* recommendations sent to the Resume Writer Agent, the output should conform to the defined Recommendations interface with all required fields present.
**Validates: Requirements 7.1, 8.2**

**Property 24: Early Stopping on Stagnation**
*For any* optimization loop where two consecutive iterations produce score improvements less than the minimum threshold (default: 0.01), the loop should terminate with reason "early_stopping".
**Validates: Requirements 7.2**

**Property 25: Success Threshold Termination**
*For any* optimization iteration where the match score >= configured threshold (default: 0.8), the loop should terminate with reason "target_reached".
**Validates: Requirements 7.3**

**Property 26: Custom Threshold Respect**
*For any* optimization configuration with a custom target score, the termination logic should use that custom value instead of the default 0.8.
**Validates: Requirements 7.4**

**Property 27: Termination Summary Completeness**
*For any* terminated optimization loop, the final result should include match score, iteration count, termination reason, initial score, final score, and improvement delta.
**Validates: Requirements 7.5, 10.3**

### Validation Properties

**Property 28: Input Validation**
*For any* input (job posting or resume draft), the system should validate the structure before processing and reject invalid inputs with descriptive error messages.
**Validates: Requirements 8.1, 8.3, 8.4**

**Property 29: Obsidian Query Format**
*For any* request to retrieve resume content from Obsidian, the query should use the data format defined by the resume-content-ingestion feature.
**Validates: Requirements 9.1**

**Property 30: Missing Data Handling**
*For any* Obsidian query where the requested resume content does not exist, the system should return an appropriate error response without crashing.
**Validates: Requirements 9.2**

**Property 31: Retrieved Data Validation**
*For any* content retrieved from Obsidian, the system should validate the structure before using it and reject invalid content with an error message.
**Validates: Requirements 9.3**

**Property 32: Service Unavailability Handling**
*For any* attempt to access Obsidian when the service is unavailable, the system should return an error indicating the data source is inaccessible.
**Validates: Requirements 9.4**

**Property 33: Dual Input Support**
*For any* resume input, the system should successfully process both direct text input and Obsidian vault references, producing valid ParsedResume objects in both cases.
**Validates: Requirements 9.5**

### Transparency Properties

**Property 34: Score Breakdown Completeness**
*For any* match score calculation, the result should include a complete breakdown showing contributions from each scoring dimension (keywords, skills, attributes, experience, level) with their respective weights.
**Validates: Requirements 10.1**

**Property 35: Recommendation Explanations**
*For any* generated recommendation, it should include an explanation referencing the specific job requirement that triggered the recommendation.
**Validates: Requirements 10.2**

**Property 36: Gap Importance Transparency**
*For any* identified gap, the gap object should include the importance score of the missing job requirement.
**Validates: Requirements 10.4**

## Error Handling

### Error Categories

**1. Input Validation Errors**:
- Invalid job posting structure
- Invalid resume structure
- Missing required fields
- Malformed data

**Error Response**:
```typescript
{
  error: 'INVALID_INPUT',
  message: 'Job posting missing required field: description',
  field: 'description',
  received: { /* actual input */ }
}
```

**2. Parsing Errors**:
- Unparseable text format
- Encoding issues
- Extremely large inputs (>1MB)

**Error Response**:
```typescript
{
  error: 'PARSING_FAILED',
  message: 'Unable to parse resume content',
  details: 'Text encoding not supported: ISO-8859-1',
  suggestion: 'Convert to UTF-8 encoding'
}
```

**3. Integration Errors**:
- Obsidian vault unavailable
- Resume content not found
- Communication timeout with external agents

**Error Response**:
```typescript
{
  error: 'INTEGRATION_ERROR',
  message: 'Failed to retrieve resume from Obsidian vault',
  source: 'obsidian',
  resumeId: 'abc123',
  retryable: true
}
```

**4. Semantic Analysis Errors**:
- Unknown element type
- Ambiguous context (cannot disambiguate)
- Missing semantic model

**Error Response**:
```typescript
{
  error: 'SEMANTIC_ANALYSIS_FAILED',
  message: 'Unable to determine semantic tags for element',
  element: 'ambiguous_term',
  context: 'surrounding text...',
  fallback: 'generic_tag'
}
```

**5. Scoring Errors**:
- Invalid importance score calculation
- Match score out of range
- Missing required data for scoring

**Error Response**:
```typescript
{
  error: 'SCORING_ERROR',
  message: 'Match score calculation failed',
  reason: 'No valid elements found in resume',
  partialResult: { /* what was calculated */ }
}
```

### Error Handling Strategy

**Graceful Degradation**:
- If semantic analysis fails for an element, fall back to basic keyword matching
- If importance scoring fails, use default importance (0.5)
- If one dimension of scoring fails, calculate score from remaining dimensions

**Retry Logic**:
- Retry Obsidian queries up to 3 times with exponential backoff
- Retry external agent communication up to 2 times
- Do not retry parsing errors (fail fast)

**Logging**:
- Log all errors with full context for debugging
- Include stack traces for unexpected errors
- Track error rates by category for monitoring

**User-Facing Errors**:
- Provide clear, actionable error messages
- Suggest fixes when possible
- Include relevant context (what was being processed)
- Never expose internal implementation details

## Testing Strategy

### Dual Testing Approach

The ATS Agent requires both **unit testing** and **property-based testing** for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

Together, these approaches ensure both concrete correctness (unit tests catch specific bugs) and general correctness (property tests verify behavior across the input space).

### Property-Based Testing

**Framework**: Use `fast-check` (for TypeScript/JavaScript) or equivalent PBT library for the target language.

**Configuration**:
- Minimum 100 iterations per property test (due to randomization)
- Each test must reference its design document property
- Tag format: `Feature: ats-agent, Property {number}: {property_text}`

**Example Property Test Structure**:
```typescript
import fc from 'fast-check';

describe('Feature: ats-agent, Property 11: Importance Score Range', () => {
  it('should assign importance scores in range [0.0, 1.0] for all job elements', () => {
    fc.assert(
      fc.property(
        fc.jobDescriptionArbitrary(), // Custom generator
        (jobDescription) => {
          const parsed = parser.parseJobDescription(jobDescription);
          const elements = parsed.elements;
          
          // Property: All importance scores in [0.0, 1.0]
          return elements.every(el => 
            el.importance >= 0.0 && el.importance <= 1.0
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Custom Generators Needed**:
- Job description generator (with various formats and requirements)
- Resume generator (with various sections and content)
- Element generator (keywords, skills, attributes)
- Semantic tag generator
- Match scenario generator (various resume-job pairs)

### Unit Testing

**Focus Areas**:
1. **Specific Examples**: Test known job descriptions and resumes
2. **Edge Cases**: Empty inputs, very long inputs, special characters
3. **Error Conditions**: Invalid inputs, missing data, service failures
4. **Integration Points**: Obsidian client, external agent communication
5. **Boundary Values**: Scores at 0.0, 0.5, 0.8, 1.0

**Example Unit Test**:
```typescript
describe('Parser Engine', () => {
  it('should extract "machine learning" as single element', () => {
    const jobDescription = {
      id: 'test-1',
      title: 'ML Engineer',
      description: 'Experience with machine learning required',
      requirements: '',
      qualifications: ''
    };
    
    const parsed = parser.parseJobDescription(jobDescription);
    const mlElement = parsed.elements.find(el => 
      el.text === 'machine learning'
    );
    
    expect(mlElement).toBeDefined();
    expect(mlElement.normalizedText).toBe('machine learning');
  });
  
  it('should handle empty job description', () => {
    const jobDescription = {
      id: 'test-2',
      title: '',
      description: '',
      requirements: '',
      qualifications: ''
    };
    
    expect(() => parser.parseJobDescription(jobDescription))
      .toThrow('INVALID_INPUT');
  });
});
```

### Integration Testing

**Test Scenarios**:
1. **End-to-End Optimization Loop**: Full iteration from job posting to final resume
2. **Obsidian Integration**: Read resume content, save analysis results
3. **External Agent Communication**: Send/receive with Resume Writer Agent
4. **Error Recovery**: Handle failures gracefully and retry appropriately

### Performance Testing

**Benchmarks**:
- Parse job description: < 500ms for typical input (1-2 pages)
- Parse resume: < 500ms for typical input (1-2 pages)
- Calculate match score: < 200ms
- Generate recommendations: < 100ms
- Full iteration: < 2 seconds

**Load Testing**:
- Handle 10 concurrent optimization loops
- Process 100 job descriptions per minute
- Maintain performance with large resumes (10+ pages)

### Test Coverage Goals

- **Line coverage**: > 80%
- **Branch coverage**: > 75%
- **Property coverage**: 100% (all 36 properties tested)
- **Error path coverage**: > 90%

### Continuous Testing

- Run unit tests on every commit
- Run property tests on every pull request
- Run integration tests nightly
- Run performance tests weekly
- Monitor test execution time and flakiness
