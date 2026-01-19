/**
 * Test the Two-Stage Resume Pipeline
 *
 * This tests the complete Selector → Committee pipeline where:
 * - Stage 1 (Selector): Picks relevant content from vault for the job
 * - Stage 2 (Committee): Optimizes the selected content
 *
 * Uses realistic test data with a content vault and job posting.
 */

import { LLMClient } from './src/shared/llm/client';
import { buildOptimizedResume, selectContentForJob } from './src/ats-agent/pipeline';
import { ContentType } from './src/shared/obsidian/types';
import type { ContentItem } from './src/types';
import * as dotenv from 'dotenv';

dotenv.config();
process.env.LLM_DEBUG = '1';

// Parse command line args
const useFastMode = process.argv.includes('--fast');
const selectorOnly = process.argv.includes('--selector-only');

// ============================================================================
// Test Data: Anthropic Job Posting
// ============================================================================

const job = {
  id: 'anth-5066977008',
  title: 'Biological Safety Research Scientist',
  description: `
About the Role
We are looking for biological scientists to help build safety and oversight mechanisms for our AI systems. As a Safeguards Biological Safety Research Scientist, you will apply your technical skills to design and develop our safety systems which detect harmful behaviors and to prevent misuse by sophisticated threat actors. You will be at the forefront of defining what responsible AI safety looks like in the biological domain, working across research, policy, and engineering to translate complex biosecurity concepts into concrete technical safeguards. This is a unique opportunity to shape how frontier AI models handle dual-use biological knowledge—balancing the tremendous potential of AI to accelerate legitimate life sciences research while preventing misuse by sophisticated threat actors.

In this role, you will:

Design and execute capability evaluations ("evals") to assess the capabilities of new models
Collaborate closely with internal and external threat modeling experts to develop training data for our safety systems, and with ML engineers to train these safety systems, optimizing for both robustness against adversarial attacks and low false-positive rates for legitimate researchers
Analyze safety system performance in traffic, identifying gaps and proposing improvements
Develop rigorous stress-testing of our safeguards against evolving threats and product surfaces
Partner with Research, Product, and Policy teams to ensure biological safety is embedded throughout the model development lifecycle
Contribute to external communications, including model cards, blog posts, and policy documents related to biological safety
Monitor emerging technologies for their potential to contribute to new risks and new mitigation strategies, and strategically address these
  `.trim(),
  requirements: `
A PhD in molecular biology, virology, microbiology, biochemistry, systems or computational biology, or a related life sciences field, OR equivalent professional experience
Extensive experience in scientific computing and data analysis, with proficiency in programming (Python preferred)
Deep expertise in modern biology, including both "reading" (e.g. high-throughput measurement, functional assays) and "writing" (gene synthesis, genome editing, strain construction, protein engineering) techniques in biology
Familiarity with dual-use research concerns, select agent regulations, and biosecurity frameworks (e.g., Biological Weapons Convention, Australia Group guidelines)
Strong analytical and writing skills, with the ability to navigate ambiguity and explain complex technical concepts to non-technical stakeholders
Have a passion for learning new skills and an ability to rapidly adapt to changing techniques and technologies
Comfort working in a fast-paced environment where priorities may shift as AI capabilities evolve
  `.trim(),
  qualifications: `
Background in AI/ML systems, particularly experience with large language models
Experience in developing ML for biological systems
Extensive experience in complex projects with multiple stakeholders
  `.trim(),
  metadata: {
    company: 'Anthropic'
  }
};

// ============================================================================
// Test Data: Content Vault (Simulated from resume)
// ============================================================================

function createTestVault(): ContentItem[] {
  const items: ContentItem[] = [];
  const now = new Date();

  // Helper to create content items
  const createItem = (
    id: string,
    type: ContentType,
    content: string,
    tags: string[],
    metadata: Record<string, any> = {},
    parentId?: string
  ): ContentItem => ({
    id,
    type,
    content,
    tags,
    metadata,
    parentId,
    createdAt: now,
    updatedAt: now,
    filePath: `resume-content/${type}/${id}.md`
  });

  // ──────────────────────────────────────────────────────────────
  // JOB ENTRIES
  // ──────────────────────────────────────────────────────────────

  items.push(createItem(
    'job-postdoc',
    ContentType.JOB_ENTRY,
    'Postdoctoral Research Fellow',
    ['research', 'cancer-biology', 'genomics'],
    {
      company: 'Cancer Research Institute',
      dateRange: { start: '2023-11', end: '2025-10' },
      location: { city: 'Boston', state: 'MA', country: 'USA' }
    }
  ));

  items.push(createItem(
    'job-phd',
    ContentType.JOB_ENTRY,
    'PhD Student - Molecular Biology',
    ['research', 'crispr', 'cancer-biology'],
    {
      company: 'University of Cambridge',
      dateRange: { start: '2019-08', end: '2023-10' },
      location: { city: 'Cambridge', country: 'UK' }
    }
  ));

  items.push(createItem(
    'job-scientist-2',
    ContentType.JOB_ENTRY,
    'Associate Scientist',
    ['research', 'cancer-biology', 'metastasis'],
    {
      company: 'Research Institute',
      dateRange: { start: '2016-01', end: '2019-07' },
      location: { city: 'Richmond', state: 'VA', country: 'USA' }
    }
  ));

  items.push(createItem(
    'job-scientist-1',
    ContentType.JOB_ENTRY,
    'Associate Scientist - Clinical Trials',
    ['clinical-trials', 'oncology', 'regulatory'],
    {
      company: 'Pharmaceutical Company',
      dateRange: { start: '2015-09', end: '2015-12' },
      location: { city: 'Richmond', state: 'VA', country: 'USA' }
    }
  ));

  // ──────────────────────────────────────────────────────────────
  // SKILLS
  // ──────────────────────────────────────────────────────────────

  items.push(createItem(
    'skill-crispr',
    ContentType.SKILL,
    'CRISPR/Cas9 genome editing',
    ['molecular-biology', 'genome-editing', 'crispr'],
    { proficiency: 'expert' }
  ));

  items.push(createItem(
    'skill-python',
    ContentType.SKILL,
    'Python programming',
    ['programming', 'data-analysis', 'scientific-computing'],
    { proficiency: 'intermediate' }
  ));

  items.push(createItem(
    'skill-flow-cytometry',
    ContentType.SKILL,
    'Multicolor flow cytometry and cell sorting',
    ['molecular-biology', 'cell-biology', 'techniques'],
    { proficiency: 'expert' }
  ));

  items.push(createItem(
    'skill-rnaseq',
    ContentType.SKILL,
    'RNA-seq and single-cell RNA-seq analysis',
    ['genomics', 'data-analysis', 'computational-biology'],
    { proficiency: 'advanced' }
  ));

  items.push(createItem(
    'skill-cell-culture',
    ContentType.SKILL,
    'Cell culture (2D and 3D)',
    ['cell-biology', 'techniques'],
    { proficiency: 'expert' }
  ));

  items.push(createItem(
    'skill-wgs',
    ContentType.SKILL,
    'Whole genome sequencing (WGS/WES)',
    ['genomics', 'sequencing', 'data-analysis'],
    { proficiency: 'advanced' }
  ));

  items.push(createItem(
    'skill-data-analysis',
    ContentType.SKILL,
    'Scientific data analysis and visualization',
    ['data-analysis', 'statistics', 'scientific-computing'],
    { proficiency: 'advanced' }
  ));

  items.push(createItem(
    'skill-writing',
    ContentType.SKILL,
    'Scientific writing and communication',
    ['communication', 'writing', 'soft-skill'],
    { proficiency: 'advanced' }
  ));

  items.push(createItem(
    'skill-project-management',
    ContentType.SKILL,
    'Project management and team leadership',
    ['leadership', 'management', 'soft-skill'],
    { proficiency: 'intermediate' }
  ));

  items.push(createItem(
    'skill-graphpad',
    ContentType.SKILL,
    'GraphPad Prism for statistical analysis',
    ['data-analysis', 'statistics', 'tools'],
    { proficiency: 'expert' }
  ));

  // ──────────────────────────────────────────────────────────────
  // ACCOMPLISHMENTS (linked to jobs)
  // ──────────────────────────────────────────────────────────────

  // Postdoc accomplishments
  items.push(createItem(
    'acc-patient-datasets',
    ContentType.ACCOMPLISHMENT,
    'Curated and analyzed patient datasets (WGS, WES, RNA-seq) to identify mutational processes and candidate driver genes involved in cancer progression and therapy resistance',
    ['data-analysis', 'genomics', 'bioinformatics'],
    {},
    'job-postdoc'
  ));

  items.push(createItem(
    'acc-crispr-screens',
    ContentType.ACCOMPLISHMENT,
    'Designed and generated reporter cell lines via CRISPR-Cas9-mediated homology-directed repair and conducted genome-wide CRISPR screens to identify modulators of drug-induced gene activation',
    ['crispr', 'screening', 'molecular-biology'],
    {},
    'job-postdoc'
  ));

  items.push(createItem(
    'acc-single-molecule',
    ContentType.ACCOMPLISHMENT,
    'Optimized and implemented state-of-the-art single DNA molecule sequencing methods to enable detection of rare variants in bulk cell populations',
    ['sequencing', 'methods', 'innovation'],
    {},
    'job-postdoc'
  ));

  items.push(createItem(
    'acc-training',
    ContentType.ACCOMPLISHMENT,
    'Trained and supervised interns, MS and PhD students in laboratory techniques and research methodology',
    ['leadership', 'mentoring', 'teaching'],
    {},
    'job-postdoc'
  ));

  // PhD accomplishments
  items.push(createItem(
    'acc-screening-platform',
    ContentType.ACCOMPLISHMENT,
    'Design and generation of a novel CRISPR screening platform utilizing tRNA-based polycistronic expression of gRNAs, ensuring potent gene knockout and maximum screen efficiency',
    ['crispr', 'methods', 'innovation', 'platform-development'],
    {},
    'job-phd'
  ));

  items.push(createItem(
    'acc-genome-wide-screens',
    ContentType.ACCOMPLISHMENT,
    'Conducted genome-wide CRISPR screens using bespoke libraries to identify drivers of endothelial differentiation and vasculogenic mimicry, identifying potential therapeutic targets',
    ['crispr', 'screening', 'target-identification'],
    {},
    'job-phd'
  ));

  items.push(createItem(
    'acc-invivo-models',
    ContentType.ACCOMPLISHMENT,
    'Generated and validated in vivo orthotopic models of metastatic breast cancer with combination drug therapy and ex vivo analysis using 3D imaging techniques',
    ['in-vivo', 'mouse-models', 'drug-testing'],
    {},
    'job-phd'
  ));

  items.push(createItem(
    'acc-scrna-crispr',
    ContentType.ACCOMPLISHMENT,
    'Designed focused CRISPR library panels compatible with single-cell RNA sequencing technologies and performed deep phenotyping experiments',
    ['crispr', 'single-cell', 'transcriptomics'],
    {},
    'job-phd'
  ));

  // Associate Scientist accomplishments
  items.push(createItem(
    'acc-metastasis-research',
    ContentType.ACCOMPLISHMENT,
    'Designed and executed experiments using both cell culture and mouse models to study the molecular mechanisms of breast cancer metastasis',
    ['research', 'cell-biology', 'mouse-models'],
    {},
    'job-scientist-2'
  ));

  items.push(createItem(
    'acc-lab-management',
    ContentType.ACCOMPLISHMENT,
    'Managed the day-to-day workings of the lab to ensure streamlined experimentation',
    ['management', 'operations', 'leadership'],
    {},
    'job-scientist-2'
  ));

  items.push(createItem(
    'acc-presentations',
    ContentType.ACCOMPLISHMENT,
    'Analyzed and presented findings at weekly research group meetings and to the broader community at institute meetings and conferences',
    ['communication', 'presentation', 'collaboration'],
    {},
    'job-scientist-2'
  ));

  // Clinical trial accomplishments
  items.push(createItem(
    'acc-clinical-trials',
    ContentType.ACCOMPLISHMENT,
    'Supported phase II-III clinical trials across oncology and metabolic disease therapeutic areas, ensuring adherence to GCP, SOPs and regulatory guidelines',
    ['clinical-trials', 'regulatory', 'gcp'],
    {},
    'job-scientist-1'
  ));

  // ──────────────────────────────────────────────────────────────
  // EDUCATION
  // ──────────────────────────────────────────────────────────────

  items.push(createItem(
    'edu-phd',
    ContentType.EDUCATION,
    'Doctor of Philosophy, Medical Science - University of Cambridge',
    ['education', 'phd', 'medical-science'],
    {
      dateRange: { start: '2019-08', end: '2023-10' },
      location: { city: 'Cambridge', country: 'UK' },
      notes: 'Thesis: Targeting Vasculogenic Mimicry in Cancer'
    }
  ));

  items.push(createItem(
    'edu-bs',
    ContentType.EDUCATION,
    'Bachelor of Science, Biochemistry - Virginia Commonwealth University',
    ['education', 'bachelors', 'biochemistry'],
    {
      dateRange: { start: '2011-08', end: '2015-05' },
      location: { city: 'Richmond', state: 'VA', country: 'USA' }
    }
  ));

  // ──────────────────────────────────────────────────────────────
  // CERTIFICATIONS (minimal for this candidate)
  // ──────────────────────────────────────────────────────────────

  items.push(createItem(
    'cert-gcp',
    ContentType.CERTIFICATION,
    'Good Clinical Practice (GCP) Certification',
    ['certification', 'clinical-trials', 'regulatory'],
    { dateRange: { start: '2015-09' } }
  ));

  return items;
}

// ============================================================================
// Test Functions
// ============================================================================

async function testSelectorOnly() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        PIPELINE TEST - SELECTOR STAGE ONLY                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const llmClient = new LLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o',
  });

  const vaultItems = createTestVault();
  console.log(`Created test vault with ${vaultItems.length} items\n`);

  const result = await selectContentForJob(job, vaultItems, llmClient, {
    maxJobs: 4,
    maxSkills: 12,
    maxAccomplishmentsPerJob: 4,
    minRelevanceScore: 0.25
  });

  console.log('\n' + '═'.repeat(60));
  console.log('SELECTION RESULTS');
  console.log('═'.repeat(60));
  console.log(`\nTotal items selected: ${result.selectedItems.length}`);
  console.log(`Coverage score: ${(result.coverageScore * 100).toFixed(1)}%`);
  console.log(`Unmatched requirements: ${result.unmatchedRequirements.length}`);

  console.log('\n' + '─'.repeat(60));
  console.log('PARSED JOB REQUIREMENTS');
  console.log('─'.repeat(60));
  console.log(`Themes: ${result.parsedRequirements.themes.join(', ')}`);
  console.log(`Domain: ${result.parsedRequirements.domain || 'N/A'}`);
  console.log(`Seniority: ${result.parsedRequirements.seniorityLevel || 'N/A'}`);
  console.log('\nRequirements:');
  result.parsedRequirements.requirements.forEach((req, i) => {
    console.log(`  ${i + 1}. [${req.importance.toUpperCase()}] [${req.type}] ${req.text.substring(0, 80)}...`);
  });

  console.log('\n' + '─'.repeat(60));
  console.log('SELECTED ITEMS BY TYPE');
  console.log('─'.repeat(60));

  console.log('\nJobs:');
  result.groupedItems.jobs.forEach((item, i) => {
    console.log(`  ${i + 1}. [${(item.relevanceScore * 100).toFixed(0)}%] ${item.item.content}`);
    console.log(`     Rationale: ${item.rationale.substring(0, 80)}...`);
  });

  console.log('\nSkills:');
  result.groupedItems.skills.forEach((item, i) => {
    console.log(`  ${i + 1}. [${(item.relevanceScore * 100).toFixed(0)}%] ${item.item.content}`);
  });

  console.log('\nAccomplishments:');
  result.groupedItems.accomplishments.forEach((item, i) => {
    console.log(`  ${i + 1}. [${(item.relevanceScore * 100).toFixed(0)}%] ${item.item.content.substring(0, 80)}...`);
  });

  console.log('\nEducation:');
  result.groupedItems.education.forEach((item, i) => {
    console.log(`  ${i + 1}. [${(item.relevanceScore * 100).toFixed(0)}%] ${item.item.content}`);
  });

  console.log('\n' + '─'.repeat(60));
  console.log('UNMATCHED REQUIREMENTS');
  console.log('─'.repeat(60));
  if (result.unmatchedRequirements.length === 0) {
    console.log('  None - all requirements matched!');
  } else {
    result.unmatchedRequirements.forEach((req, i) => {
      console.log(`  ${i + 1}. [${req.importance}] ${req.text.substring(0, 80)}...`);
    });
  }

  if (result.warnings && result.warnings.length > 0) {
    console.log('\n' + '─'.repeat(60));
    console.log('WARNINGS');
    console.log('─'.repeat(60));
    result.warnings.forEach((warning, i) => {
      console.log(`  ${i + 1}. ${warning}`);
    });
  }

  console.log('\n' + '─'.repeat(60));
  console.log('DRAFT RESUME PREVIEW (first 1500 chars)');
  console.log('─'.repeat(60));
  console.log(result.draftResume.content.substring(0, 1500) + '...\n');
}

async function testFullPipeline() {
  const modeLabel = useFastMode ? 'FAST MODE' : 'STANDARD';
  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║     FULL PIPELINE TEST - SELECTOR + COMMITTEE (${modeLabel.padEnd(10)}) ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (useFastMode) {
    console.log('Using FAST mode: gpt-4o for Advocate, gpt-4o-mini for Critic/Writer\n');
  }

  const llmClient = new LLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o',
  });

  const vaultItems = createTestVault();
  console.log(`Created test vault with ${vaultItems.length} items`);

  const result = await buildOptimizedResume(job, vaultItems, llmClient, {
    selector: {
      maxJobs: 4,
      maxSkills: 12,
      maxAccomplishmentsPerJob: 4,
      minRelevanceScore: 0.25
    },
    committee: {
      maxRounds: 2,
      consensusThreshold: 0.1,
      targetFit: 0.8,
      fastMode: useFastMode
    }
  });

  console.log('\n' + '═'.repeat(60));
  console.log('PIPELINE RESULTS');
  console.log('═'.repeat(60));

  console.log('\nMetrics:');
  console.log(`  Vault items considered: ${result.metrics.vaultItemsConsidered}`);
  console.log(`  Items selected: ${result.metrics.itemsSelected}`);
  console.log(`  Requirements coverage: ${(result.metrics.requirementsCoverage * 100).toFixed(1)}%`);
  console.log(`  Initial fit estimate: ${(result.metrics.initialFitEstimate * 100).toFixed(1)}%`);
  console.log(`  Final fit: ${(result.metrics.finalFit * 100).toFixed(1)}%`);
  console.log(`  Processing time: ${result.metrics.processingTimeMs}ms`);

  if (result.committeeResult) {
    console.log('\nCommittee Results:');
    console.log(`  Rounds: ${result.committeeResult.rounds}`);
    console.log(`  Initial fit: ${(result.committeeResult.initialFit * 100).toFixed(1)}%`);
    console.log(`  Final fit: ${(result.committeeResult.finalFit * 100).toFixed(1)}%`);
    console.log(`  Improvement: +${(result.committeeResult.improvement * 100).toFixed(1)}%`);
    console.log(`  Termination: ${result.committeeResult.terminationReason}`);
  }

  console.log('\n' + '─'.repeat(60));
  console.log('SELECTION SUMMARY');
  console.log('─'.repeat(60));
  console.log(result.selectionResult.selectionSummary);

  console.log('\n' + '─'.repeat(60));
  console.log('FINAL RESUME (first 2000 chars)');
  console.log('─'.repeat(60));
  console.log(result.finalResume.content.substring(0, 2000) + '...\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    if (selectorOnly) {
      await testSelectorOnly();
    } else {
      // First test selector alone
      await testSelectorOnly();

      // Then test full pipeline
      await testFullPipeline();
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
