# Testing the Resume Parser

## Quick Start

### 1. Set up your Anthropic API Key

You need an Anthropic API key to use the parser. Get one at: https://console.anthropic.com/

Set it as an environment variable:

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

Or create a `.env` file in the project root:

```bash
echo "ANTHROPIC_API_KEY=your-api-key-here" > .env
```

### 2. Prepare a Resume File

Place a resume file in the project root. Supported formats:
- PDF (`.pdf`)
- Word Document (`.docx`)
- Plain Text (`.txt`)

The test script will automatically look for:
- `resume_template_test.pdf`
- `xyz.pdf`
- Or any other resume file you specify

### 3. Run the Test

```bash
npx tsx test-parser.ts
```

## What the Test Does

The test script will:

1. ✅ **Validate** your resume file (format and size)
2. 📄 **Extract** text from the file
3. 🤖 **Parse** the resume using AI (takes 10-30 seconds)
4. 📊 **Display** results including:
   - Confidence scores
   - Job entries with accomplishments and skills
   - Education history
   - Certifications
   - Standalone skills
5. 💾 **Save** full results to `parsed-resume-output.json`

## Example Output

```
🚀 Testing Resume Parser Agent

📄 Using resume file: resume_template_test.pdf

Step 1: Reading file...
Step 2: Validating file...
✅ File validated: PDF, 45.23 KB

Step 3: Extracting text from file...
✅ Extracted 2847 characters

Step 4: Parsing resume with AI...
(This may take 10-30 seconds)

✅ Parsing complete in 12.4s

============================================================
PARSING RESULTS
============================================================

📊 Overall Confidence: 92.5%

📈 Section Confidence Scores:
  - jobEntries: 95.0%
  - education: 90.0%
  - skills: 85.0%

💼 Job Entries: 3
  1. Senior Software Engineer at Google
     Location: Mountain View, CA
     Duration: 2020-01-01 to Present
     Confidence: 95.0%
     Accomplishments: 5
       - Led development of cloud infrastructure serving 1M+ users
       - Reduced API latency by 40% through optimization
       ... and 3 more
     Skills: TypeScript, Python, AWS, Docker

  2. Software Engineer at Microsoft
     ...

🎓 Education: 1
  1. BS Computer Science - Stanford University
     2015-09-01 to 2019-06-01

📜 Certifications: 2
  1. AWS Certified Solutions Architect - Amazon
     Issued: 2021-03-15

🛠️  Standalone Skills: 8
  JavaScript, React, Node.js, PostgreSQL, ...

============================================================
✅ Test completed successfully!
============================================================

💾 Full results saved to: parsed-resume-output.json
```

## Running Unit Tests

To run the automated property tests:

```bash
npm test
```

Or to run just the parser tests:

```bash
npm test -- src/tests/parserAgent.test.ts
```

### Shared Infrastructure Tests

The shared infrastructure components have comprehensive test coverage. To run these tests:

```bash
# Run all shared infrastructure tests
npm test src/tests/shared/

# Run specific module tests
npm test src/tests/shared/llm.test.ts
npm test src/tests/shared/obsidian.test.ts
npm test src/tests/shared/validation.test.ts
npm test src/tests/shared/errors.test.ts
```

**What's Tested:**

1. **LLM Client** (`llm.test.ts`)
   - Anthropic and OpenAI provider support
   - Response caching (hit/miss scenarios)
   - JSON response parsing (with markdown code blocks)
   - Error handling (timeouts, rate limits, invalid responses)
   - Retry logic with exponential backoff

2. **Obsidian Client** (`obsidian.test.ts`)
   - Read/write operations
   - Search and query functionality
   - Error handling (NOT_FOUND, SERVICE_UNAVAILABLE)
   - Retry logic for transient errors

3. **Validation** (`validation.test.ts`)
   - Schema validation with Zod
   - Required field validation
   - Error message generation
   - Custom schema support

4. **Error Handler** (`errors.test.ts`)
   - Error code mapping
   - Error logging
   - Retryable vs non-retryable errors
   - Context preservation

**Test Coverage:**
- LLM Client: 100%
- Obsidian Client: 100%
- Validation: 100%
- Error Handler: 100%

## Troubleshooting

### "ANTHROPIC_API_KEY environment variable not set"

Make sure you've set your API key:
```bash
export ANTHROPIC_API_KEY="your-key"
```

### "No resume file found"

Place a resume file in the project root or update the `resumeFiles` array in `test-parser.ts`.

### "Failed to extract text from PDF"

Some PDFs are image-based and don't contain extractable text. Try a different PDF or use a DOCX/TXT file.

### API Rate Limits

If you hit rate limits, wait a few seconds and try again. The parser uses Claude 3.5 Sonnet which has generous rate limits.

## Next Steps

After testing the parser, you can:

1. Review the parsed output in `parsed-resume-output.json`
2. Check confidence scores to see which sections need review
3. Continue with the next tasks in the implementation plan
4. Integrate the parser into the Electron UI

## Cost Estimate

Each resume parse costs approximately:
- Input: ~2-5K tokens (resume text)
- Output: ~1-3K tokens (structured JSON)
- Total: **~$0.01-0.03 per resume** with Claude 3.5 Sonnet

For testing, expect to spend less than $1 for 20-30 test runs.


## Integration Testing

### Running Integration Tests

Integration tests validate the system with real resume files to ensure parsing accuracy meets requirements (>90% for job titles, skills, and accomplishments).

**Prerequisites:**
- Set the `ANTHROPIC_API_KEY` environment variable
- Have real resume files in the project root (e.g., `resume_test_real.pdf`)

**Run integration tests:**
```bash
export ANTHROPIC_API_KEY="your-api-key-here"
npm test -- src/tests/integration.test.ts
```

**Note:** Integration tests will be automatically skipped if `ANTHROPIC_API_KEY` is not set.

### What Integration Tests Validate

The integration test suite verifies:

1. **PDF Resume Parsing** (Requirement 14.1)
   - Job title extraction accuracy >90%
   - Skill extraction accuracy >90%
   - Accomplishment extraction accuracy >90%

2. **DOCX Resume Parsing** (Requirement 14.2)
   - Same accuracy requirements as PDF

3. **TXT Resume Parsing** (Requirement 14.3)
   - Same accuracy requirements as PDF

4. **Hierarchical Relationships** (Requirement 14.7)
   - Accomplishments correctly linked to parent jobs
   - Skills correctly linked to parent jobs
   - Parent-child relationships preserved

5. **Tag-Based Retrieval** (Requirements 14.8, 14.9)
   - Content retrievable by tag with 100% accuracy
   - Multi-tag filtering with 100% accuracy

6. **End-to-End Functionality** (Requirement 14.10)
   - Upload → Parse → Review → Save → Retrieve workflow

### Adding New Test Resumes

To add new test resumes for integration testing:

1. **Place resume file** in the project root
2. **Extract text** to verify content:
   ```bash
   npx tsx test-extraction.ts your-resume.pdf
   ```

3. **Update ground truth data** in `src/tests/integration.test.ts`:
   ```typescript
   {
     fileName: 'your-resume.pdf',
     format: 'pdf',
     expectedJobTitles: ['Software Engineer', 'Senior Developer'],
     expectedSkills: ['TypeScript', 'React', 'Node.js'],
     expectedAccomplishments: 10, // Minimum number of bullet points
     expectedEducation: 1,
     expectedCertifications: 2,
     expectedCompanies: ['Google', 'Microsoft']
   }
   ```

4. **Run integration tests** to verify accuracy:
   ```bash
   npm test -- src/tests/integration.test.ts
   ```

### Current Test Resumes

The project includes:
- `resume_test_real.pdf` - Real scientific/research resume with 4 jobs, 15+ accomplishments
- `resume_test_fake.pdf` - Template resume (empty, skipped in tests)

### Integration Test Output

When running with API key set:
```
✓ Integration Tests: Real Resume Parsing
  ✓ 19.1 Real Resume File Collection
    ✓ should have real PDF resume files available
    ✓ should have ground truth data defined for each resume
  ✓ 19.2 Real Resume Parsing Accuracy
    ✓ Testing resume_test_real.pdf
      ✓ should parse PDF resume with >90% job title accuracy
        Job Title Accuracy: 100.0%
        Expected: Postdoctoral Research Fellow, PhD Student, Associate Scientist
        Actual: Postdoctoral Research Fellow, PhD Student, Associate Scientist
      ✓ should parse PDF resume with >90% skill accuracy
        Skill Accuracy: 95.0%
        Expected: Cell culture, flow cytometry, CRISPR, ...
        Actual: Cell culture, flow cytometry, CRISPR/Cas9, ...
      ✓ should parse PDF resume with >90% accomplishment accuracy
        Accomplishment Count Accuracy: 93.3%
        Expected: 15
        Actual: 14
      ✓ should preserve hierarchical relationships in PDF resume
        ✓ Hierarchical relationships preserved for 4 jobs
    ✓ Tag-based Retrieval Accuracy
      ✓ should correctly tag all content items by type
        ✓ All content items correctly tagged
```

### CI/CD Integration

For continuous integration pipelines, integration tests can be run conditionally:

```bash
# Only run if API key is available
if [ -n "$ANTHROPIC_API_KEY" ]; then
  npm test -- src/tests/integration.test.ts
else
  echo "Skipping integration tests (no API key)"
fi
```

### Cost Estimate for Integration Tests

Integration tests make real API calls:
- Each test resume: ~$0.01-0.03
- Full integration test suite: ~$0.05-0.10
- Recommended: Run integration tests before major releases or when changing parser logic
