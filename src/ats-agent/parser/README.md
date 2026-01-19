# ATS Agent Parser

This directory contains the parsing components for the ATS Agent feature, responsible for extracting and processing structured elements from job descriptions and resumes.

## Components

### Text Normalizer (`textNormalizer.ts`)

Prepares text for parsing by:
- Converting to lowercase
- Trimming whitespace
- Handling special characters
- Normalizing encoding

**Requirements**: 1.1, 4.1

### Job Parser (`jobParser.ts`)

Parses job descriptions into structured elements with importance scores using the shared LLM client.

**Key Features**:
- Extracts keywords, skills, attributes, and concepts from job postings
- Assigns importance scores (0.0-1.0) based on explicit indicators and context
- Handles multi-word phrases as single elements
- Deduplicates elements and consolidates with maximum importance scores
- Leverages shared LLM client caching to avoid redundant API calls

**Importance Score Assignment**:
1. **Explicit indicators:**
   - "required", "must have", "essential" → 0.9-1.0
   - "strongly preferred", "highly desired" → 0.7-0.8
   - "preferred", "nice to have", "bonus" → 0.3-0.5

2. **Inferred from context:**
   - Position in text (earlier = more important)
   - Frequency of mention (more mentions = more important)
   - Section context (requirements vs nice-to-haves)

3. **Conflict resolution:**
   - When multiple indicators conflict, uses the HIGHEST importance level

**Requirements**: 1.1, 3.1, 3.2, 3.3, 3.5

**Key Functions**:
- `parseJobDescription(jobPosting, llmClient)` - Parse a job posting into structured elements
- `parseJobDescriptions(jobPostings, llmClient)` - Batch parse multiple job postings
- `hasValidImportanceScores(parsedJob)` - Validate importance scores are in range [0.0, 1.0]
- `getElementsByImportance(parsedJob, minImportance)` - Get elements above importance threshold
- `getCriticalElements(parsedJob)` - Get critical elements (importance >= 0.8)
- `getParsingStats(parsedJob)` - Get statistics about parsed elements

### Resume Parser (`resumeParser.ts`)

Parses resumes into structured elements using the same methodology as job descriptions.

**Key Features**:
- Extracts keywords, skills, attributes, experience, and concepts from resumes
- Identifies resume sections (summary, experience, skills, education)
- Extracts experience descriptions and accomplishments separately
- Identifies level of experience indicators (e.g., "5 years", "senior", "lead")
- Handles multi-word phrases as single elements
- Deduplicates elements while preserving context from different sections
- Splits resumes by detected section headers to reduce LLM truncation risk
- Leverages shared LLM client caching to avoid redundant API calls

**Experience Level Indicators**:
1. **Years of experience:**
   - "5 years", "3+ years", "over 10 years"

2. **Seniority levels:**
   - "senior", "lead", "principal", "junior", "entry-level", "mid-level"

3. **Role indicators:**
   - "manager", "director", "architect", "engineer", "specialist", "analyst"

**Requirements**: 4.1, 4.3, 4.4

**Key Functions**:
- `parseResume(resume, llmClient)` - Parse a resume into structured elements
- `parseResumes(resumes, llmClient)` - Batch parse multiple resumes
- `getElementsBySection(parsedResume, sectionType)` - Get elements from specific section
- `getExperienceElements(parsedResume)` - Get experience descriptions and accomplishments
- `getExperienceLevelIndicators(parsedResume)` - Get level of experience indicators
- `getParsingStats(parsedResume)` - Get statistics about parsed elements
- `hasValidSections(parsedResume)` - Validate section assignments
- `hasExperienceLevelIndicators(parsedResume)` - Check for experience level indicators

### Theme Extractor (`themeExtractor.ts`)

Extracts top job themes to guide recommendation prioritization.

**Key Features**:
- Identifies 3-6 high-level themes from a job posting
- Scores theme importance and provides rationale
- Supplies theme keywords for downstream reframe/emphasize guidance

**Key Functions**:
- `extractJobThemes(jobPosting, parsedJob, llmClient)` - Extract prioritized job themes

### Phrase Extractor (`phraseExtractor.ts`)

Uses the shared LLM client to intelligently extract:
- Multi-word phrases (e.g., "machine learning", "project management")
- Technical skills (e.g., "Python", "React.js")
- Soft skills (e.g., "leadership", "communication")
- Attributes and qualifications
- Concepts and methodologies

The phrase extractor automatically applies deduplication to consolidate duplicate elements.

**Requirements**: 1.4

**Key Functions**:
- `extractPhrases(text, llmClient, sourceType)` - Extract elements from a single text
- `extractPhrasesFromSections(sections, llmClient, sourceType)` - Extract from multiple sections
- `hasMultiWordPhrases(elements)` - Check if multi-word phrases are present
- `findMultiWordPhrases(elements, phrases)` - Find specific multi-word phrases

### Deduplicator (`deduplicator.ts`)

Consolidates duplicate elements while:
- Preserving context from all occurrences (concatenated with `|` separator)
- Merging tags from all occurrences (unique)
- Selecting maximum importance score (for TaggedElements)
- Keeping the first occurrence's position

**Requirements**: 1.5, 4.5

**Key Functions**:
- `deduplicateElements<T>(elements)` - Main deduplication function
- `countDuplicates(elements)` - Count number of duplicates
- `findDuplicateGroups(elements)` - Find groups of duplicate elements
- `hasDuplicates(elements)` - Check if duplicates exist
- `getDeduplicationStats(original, deduplicated)` - Get statistics

## Usage Example

### Job Description Parsing

```typescript
import { createLLMClientFromEnv } from '../../shared/llm/client';
import { parseJobDescription, getCriticalElements, getParsingStats } from './jobParser';
import { JobPosting } from '../types';

// Initialize LLM client from environment
const llmClient = createLLMClientFromEnv();

// Create a job posting
const jobPosting: JobPosting = {
  id: 'job-001',
  title: 'Senior Software Engineer',
  description: 'We are looking for a Senior Software Engineer with experience in machine learning and Python.',
  requirements: 'Python programming is required. Experience with TensorFlow is essential. Knowledge of Docker is preferred.',
  qualifications: 'Master\'s degree in Computer Science or related field'
};

// Parse the job description
const parsedJob = await parseJobDescription(jobPosting, llmClient);

console.log(`Extracted ${parsedJob.elements.length} elements`);

// Get critical elements (importance >= 0.8)
const critical = getCriticalElements(parsedJob);
console.log(`Critical requirements: ${critical.length}`);

critical.forEach(el => {
  const importance = (el as any).importance;
  console.log(`- ${el.text} (importance: ${importance.toFixed(2)})`);
});

// Get parsing statistics
const stats = getParsingStats(parsedJob);
console.log(`Average importance: ${stats.averageImportance.toFixed(2)}`);
console.log(`Critical elements: ${stats.criticalElements}`);
console.log(`High importance: ${stats.highImportance}`);
console.log(`Medium importance: ${stats.mediumImportance}`);
console.log(`Low importance: ${stats.lowImportance}`);

// Each element contains:
// - text: Original text
// - normalizedText: Lowercase normalized version
// - tags: Semantic tags
// - context: Surrounding context
// - position: Position in text
// - importance: Importance score (0.0-1.0)
// - category: Element category (keyword, skill, attribute, experience, concept)
```

### Resume Parsing

```typescript
import { createLLMClientFromEnv } from '../../shared/llm/client';
import {
  parseResume,
  getElementsBySection,
  getExperienceElements,
  getExperienceLevelIndicators,
  getParsingStats
} from './resumeParser';
import { Resume } from '../types';

// Initialize LLM client from environment
const llmClient = createLLMClientFromEnv();

// Create a resume
const resume: Resume = {
  id: 'resume-001',
  content: `
    JOHN DOE
    Senior Software Engineer
    
    SUMMARY
    Experienced software engineer with 8 years of professional experience.
    
    EXPERIENCE
    Senior Software Engineer | Tech Corp | 2020 - Present
    - Led team of 5 engineers to deliver microservices architecture
    - Increased system performance by 40% through optimization
    
    SKILLS
    Python, JavaScript, React, Node.js, AWS, Docker
  `,
  format: 'text'
};

// Parse the resume
const parsedResume = await parseResume(resume, llmClient);

console.log(`Extracted ${parsedResume.elements.length} elements`);

// Get elements by section
const skillsElements = getElementsBySection(parsedResume, 'skills');
console.log(`Skills: ${skillsElements.length}`);

const experienceElements = getExperienceElements(parsedResume);
console.log(`Experience descriptions: ${experienceElements.length}`);

// Get experience level indicators
const levelIndicators = getExperienceLevelIndicators(parsedResume);
console.log(`Experience level indicators: ${levelIndicators.length}`);

levelIndicators.forEach(el => {
  console.log(`- ${el.text}`);
});

// Get parsing statistics
const stats = getParsingStats(parsedResume);
console.log(`Total elements: ${stats.totalElements}`);
console.log(`By section:`, stats.bySection);
console.log(`By category:`, stats.byCategory);
console.log(`Experience level indicators: ${stats.experienceLevelIndicators}`);

// Each element contains:
// - text: Original text
// - normalizedText: Lowercase normalized version
// - tags: Semantic tags
// - context: Surrounding context
// - position: Position in text
// - section: Section type (summary, experience, skills, education, other)
// - category: Element category (keyword, skill, attribute, experience, concept)
```

### Phrase Extraction Example

```typescript
import { LLMClient } from '../../shared/llm/client';
import { extractPhrases } from './phraseExtractor';
import { deduplicateElements } from './deduplicator';

// Initialize LLM client
const llmClient = new LLMClient({
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Extract phrases from job description
const jobText = `
  We are looking for a Senior Software Engineer with experience in
  machine learning and Python. Must have strong Python programming
  skills and experience with machine learning algorithms.
`;

const elements = await extractPhrases(jobText, llmClient, 'job');

// Elements are automatically deduplicated
// "Python" appears twice but will be consolidated into one element
// "machine learning" appears twice but will be consolidated into one element

console.log(`Extracted ${elements.length} unique elements`);

// Each element contains:
// - text: Original text
// - normalizedText: Lowercase normalized version
// - tags: Semantic tags
// - context: Combined context from all occurrences
// - position: Position of first occurrence
```

## Deduplication Behavior

When duplicate elements are found (based on normalized text):

1. **Context Preservation**: All unique contexts are concatenated with `|` separator
   ```
   "Experience with Python" | "Python programming skills"
   ```

2. **Tag Merging**: All unique tags from all occurrences are combined
   ```
   ['programming', 'language', 'scripting', 'backend']
   ```

3. **Importance Selection**: Maximum importance score is selected (for TaggedElements)
   ```
   Occurrences: [0.9, 0.5, 0.3] → Result: 0.9
   ```

4. **Position Preservation**: First occurrence's position is kept
   ```
   First occurrence at position {start: 5, end: 11}
   ```

## Testing

All parser components have comprehensive test coverage:

- **Text Normalizer**: 27 tests
- **Job Parser**: 14 tests (Task 2.4) ✓
- **Resume Parser**: 20 tests (Task 2.5) ✓
- **Phrase Extractor**: 24 tests
- **Deduplicator**: 30 tests

Run tests:
```bash
npm test src/tests/ats-agent/jobParser.test.ts
npm test src/tests/ats-agent/resumeParser.test.ts
npm test src/tests/ats-agent/phraseExtractor.test.ts
npm test src/tests/ats-agent/deduplicator.test.ts
npm test src/tests/ats-agent/textNormalizer.test.ts
```

## Examples

See example files for complete working examples:
- `examples/parse-job-description-example.ts` - Job description parsing
- `examples/parse-resume-example.ts` - Resume parsing

**Run examples:**
```bash
# Set API key
export ANTHROPIC_API_KEY=your_key_here
# or
export OPENAI_API_KEY=your_key_here

# Run job description example
npx ts-node examples/parse-job-description-example.ts

# Run resume example
npx ts-node examples/parse-resume-example.ts
```

## Integration

The parser components are integrated into the main parsing pipeline:

1. Text is normalized using `prepareForParsing()`
2. Phrases are extracted using LLM via `extractPhrases()`
3. Elements are automatically deduplicated
4. Results are returned as structured `Element[]` or `TaggedElement[]`

The deduplication happens automatically in both:
- `extractPhrases()` - For single text extraction
- `extractPhrasesFromSections()` - For multi-section extraction

This ensures that duplicate elements are always consolidated, regardless of how the parser is used.
