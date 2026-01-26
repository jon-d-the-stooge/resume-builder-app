/**
 * Test the Committee-based Resume Optimization
 *
 * This tests the multi-agent committee approach where:
 * - Advocate finds connections (pro-candidate)
 * - Critic verifies claims (quality control)
 * - Writer synthesizes both perspectives
 *
 * The key difference from single-agent: the agent that generates
 * recommendations is NOT the one that evaluates them.
 */

import { LLMClient } from './src/shared/llm/client';
import { runCommittee, analyzeWithCommittee, FAST_MODEL_CONFIG } from './src/ats-agent/committee';
import dotenv from 'dotenv';

dotenv.config();
process.env.LLM_DEBUG = '1';

// Parse command line args for fast mode
const useFastMode = process.argv.includes('--fast');

// Real job posting from Anthropic
const job = {
  id: 'anth-5066977008',
  title: 'Biological Safety Research Scientist',
  company: 'Anthropic',
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
You may be a good fit if you have
A PhD in molecular biology, virology, microbiology, biochemistry, systems or computational biology, or a related life sciences field, OR equivalent professional experience
Extensive experience in scientific computing and data analysis, with proficiency in programming (Python preferred)
Deep expertise in modern biology, including both "reading" (e.g. high-throughput measurement, functional assays) and "writing" (gene synthesis, genome editing, strain construction, protein engineering) techniques in biology
Familiarity with dual-use research concerns, select agent regulations, and biosecurity frameworks (e.g., Biological Weapons Convention, Australia Group guidelines)
Strong analytical and writing skills, with the ability to navigate ambiguity and explain complex technical concepts to non-technical stakeholders
Have a passion for learning new skills and an ability to rapidly adapt to changing techniques and technologies
Comfort working in a fast-paced environment where priorities may shift as AI capabilities evolve
Preferred Qualifications
Background in AI/ML systems, particularly experience with large language models
Experience in developing ML for biological systems
Extensive experience in complex projects with multiple stakeholders
  `.trim(),
  requirements: '',
  qualifications: '',
};

// Real resume (anonymized)
const resume = {
  id: 'real-resume',
  content: `
Firstname Lastname
123 fake street, faketown, fakestate, usa 12345
(555)-555-5555



 SUMMARY
I am a postdoctoral scientist seeking to advance my career within a biotechnology organization that will utilize my cell biology and oncology knowledge while also fostering professional development. I have 14 years of laboratory research experience with expertise in molecular biology, cancer genomics and translational science. I also excel in project management, team leadership, written communications and public speaking, and am capable of working both independently and as a cross-functional collaborator to efficiently contribute to projects.
KEY SKILLS
Techniques:
In vitro: Cell culture (2D and 3D), multicolor flow cytometry and cell sorting, DNA cloning, CRISPR/Cas9 editing, transfection, virus preparation and viral transduction, DNA/RNA library preparation, single DNA molecule sequencing, WGS, WES, RNA-seq and single-cell RNA-seq, qPCR, ddPCR, ICC, IHC, Western blotting, cell-based microplate assays
In vivo: Orthotopic and subcutaneous tumor implantation, patient-derived xenograft models, genotyping, drug administration (oral, intravenous, intraperitoneal, subcutaneous), intravenous perfusion, ex vivo isolation, culture and analysis of cells using FACS, IHC, imaging, scRNA-seq and WGS approaches
Tools and Platforms:
GraphPad Prism, FlowJo, SnapGene, ImageJ, Cell Ranger, Seurat, Loupe Browser, COSMIC, IGV, UCSC Genome Browser, Galaxy, DepMap/CCLE, NCBI GEO, Biorender, Benchling, Microsoft Office Suite (Excel, Word, PowerPoint)

EMPLOYMENT EXPERIENCE
Fourth job
Postdoctoral Research Fellow, 11/2023 – 10/2025
Postdoctoral work studied how innate immune pathway activation, particularly through aberrant DNA-sensing pathways, drives mutagenesis, neoantigen generation and genomic instability in cancer cells, both intrinsically and in response to therapies. I led multiple research projects to identify the causes and consequences of immune activity in breast, lung and colon cancer models, to understand how these processes influence cancer cell evolution and therapy response.
• Curated and analyzed patient datasets (WGS, WES, RNA-seq) to identify mutational processes and candidate driver genes involved in cancer progression and therapy resistance, and to inform subsequent experimental models.
• Designed and generated reporter cell lines via CRISPR-Cas9-mediated homology-directed repair and conducted genome-wide CRISPR screens to identify modulators of drug-induced gene activation
• Optimized and implemented state-of-the-art single DNA molecule sequencing methods to enable detection of rare variants in bulk cell populations
• Trained and supervised interns, MS and PhD students
• Contributed experimental findings to the broader research group by preparation of publications and grant applications
Third job
PhD Student, 08/2019 – 10/2023
Completed doctoral work in the IMAXT laboratory (Imaging and Molecular Annotation of Xenografts and Tumors) in CRUK Cambridge Institute of University of Cambridge. Graduate studies focused on understanding the molecular underpinnings of endothelial differentiation in cancer cells, vasculogenic mimicry and mechanisms of resistance to anti-angiogenic therapies across several solid tumor types.
• Comprehensively characterized the phenotypic and molecular properties of endothelial-like cancer cells capable of vasculogenic mimicry in breast, lung and renal carcinoma models
• Established a method to isolate vasculogenic mimicry-capable cancer cells from multicellular populations using a flow cytometry-based method and validation of this method across a range of tumor types
• Design and generation of a novel CRISPR screening platform, utilizing tRNA-based polycistronic expression of gRNAs, ensuring potent gene knockout and maximum screen efficiency
• Conducted genome-wide CRISPR screens using bespoke libraries to identify drivers of endothelial differentiation and vasculogenic mimicry, identifying potential therapeutic targets
• Designed focused CRISPR library panels compatible with single-cell RNA sequencing technologies and performed deep phenotyping experiments to study transcriptomic effects of gene perturbations
• Generated isogenic knockout and overexpression models of genes of interest and validated both:
• in vitro using cell culture assays (3D tube formation, cell viability/survival), RNA-seq and proteomics analysis (IP-MS, RIME)
• in vivo using orthotopic models of metastatic breast cancer, combination drug therapy and ex vivo analysis using 3D imaging techniques to visualize, differentiate and quantify both tumor-derived and host vasculature, informing rational drug combinations to enhance the efficacy of anti-angiogenic therapies by inhibition of cancer cell endothelial differentiation


Second job
Associate Scientist, 01/2016 – 07/2019
• Designed and executed experiments using both cell culture and mouse models to study the molecular mechanisms of breast cancer metastasis
• Managed the day-to-day workings of the lab to ensure streamlined experimentation
• Analyzed and presented findings at weekly research group meetings, and to the broader community at institute meetings and conferences
First job
Associate Scientist, 09/2015 – 12/2015
• Supported phase II-III clinical trials across oncology and metabolic disease therapeutic areas, ensuring adherence to GCP, SOPs and regulatory guidelines
• Coordinated data collection and quality control to maintain integrity of clinical trial data
• Collaborated with study investigators and project managers to meet milestone timelines

EDUCATION
Doctor of Philosophy, Medical Science
University of Cambridge, October 2023
Thesis: Targeting Vasculogenic Mimicry in Cancer
Bachelor of Science, Biochemistry
Virginia Commonwealth University, May 2015
PUBLICATIONS
. FOXC2 promotes vasculogenic mimicry and resistance to anti-angiogenic therapy. Cell Reports, 42(8), 112791.
*Authors contributed equally

Clonal transcriptomics identifies mechanisms of chemoresistance and empowers rational design of combination therapies. eLife, 11, e80981.

Addiction of lung cancer cells to GOF p53 is promoted by up-regulation of epidermal growth factor receptor through multiple contacts with p53 transactivation domain and promoter. Oncotarget, 7(11), 12426–12446.

p53: its mutations and their impact on transcription. Subcellular Biochemistry, 85, 71–90.

Allele specific gain-of-function activity of p53 mutants in lung cancer cells. Biochemical and Biophysical Research Communications, 428(1), 6–10.
CONFERENCE PROCEEDINGS
"Induction of APOBEC3 mutagenesis by genotoxic treatments in cancer". Cancer Genomics Meeting, October 2024
"Impact of APOBEC3 mutagenesis on therapy resistance in cancer". Cancer Center Retreat, June 2024
AWARDS AND LEADERSHIP
• Finalist, Cancer Research Thesis Prize, 2023
• President, Cancer Research Graduate Society, 2019-2020
• Innovation and Discovery Award, 2018


  `.trim(),
  format: 'text' as const,
};

async function testCommitteeAnalysis() {
  const modeLabel = useFastMode ? 'FAST MODE' : 'STANDARD';
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║    COMMITTEE RESUME OPTIMIZATION - ANALYSIS ONLY (${modeLabel})   ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (useFastMode) {
    console.log('Using FAST_MODEL_CONFIG: gpt-4o for Advocate, gpt-4o-mini for Critic/Writer\n');
  }

  const llmClient = new LLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o',
  });

  // First, just run analysis to see how Advocate and Critic interact
  const { advocate, critic, consensus } = await analyzeWithCommittee(
    job,
    resume,
    llmClient,
    useFastMode ? { models: FAST_MODEL_CONFIG } : {}
  );

  console.log('\n' + '═'.repeat(60));
  console.log('ADVOCATE ANALYSIS');
  console.log('═'.repeat(60));
  console.log(`Fit Score: ${(advocate.fitScore * 100).toFixed(1)}%`);
  console.log(`Assessment: ${advocate.assessment}\n`);

  console.log('Top Connections Found:');
  advocate.connections.slice(0, 5).forEach((c, i) => {
    console.log(`  ${i + 1}. [${c.connectionStrength.toUpperCase()}] "${c.jobRequirement}"`);
    console.log(`     ← "${c.resumeEvidence}"`);
    console.log(`     Confidence: ${(c.confidence * 100).toFixed(0)}%`);
  });

  console.log('\nStrengths Identified:');
  advocate.strengths.slice(0, 5).forEach((s, i) => {
    console.log(`  ${i + 1}. ${s}`);
  });

  console.log('\nTop Reframing Opportunities:');
  advocate.reframingOpportunities.slice(0, 3).forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.priority.toUpperCase()}] ${r.jobRequirementAddressed}`);
    console.log(`     Current: "${r.currentContent.substring(0, 60)}..."`);
    console.log(`     Suggested: "${r.suggestedReframe.substring(0, 60)}..."`);
  });

  console.log('\n' + '═'.repeat(60));
  console.log('CRITIC ANALYSIS');
  console.log('═'.repeat(60));
  console.log(`Fit Score: ${(critic.fitScore * 100).toFixed(1)}%`);
  console.log(`Assessment: ${critic.assessment}\n`);

  console.log('Agreements with Advocate:');
  critic.agreements.slice(0, 5).forEach((a, i) => {
    console.log(`  ✓ ${a}`);
  });

  console.log('\nChallenges Raised:');
  critic.challenges.forEach((c, i) => {
    console.log(`  ${i + 1}. [${c.severity.toUpperCase()}] ${c.type}: ${c.claim}`);
    console.log(`     Issue: ${c.issue}`);
    if (c.suggestedFix) {
      console.log(`     Fix: ${c.suggestedFix}`);
    }
  });

  console.log('\nGenuine Gaps (Cannot Be Addressed):');
  critic.genuineGaps.forEach((g, i) => {
    console.log(`  ${i + 1}. ${g.requirement}${g.isRequired ? ' [REQUIRED]' : ''}`);
    console.log(`     Reason: ${g.reason}`);
  });

  console.log('\nValidated Strengths:');
  critic.validatedStrengths.slice(0, 5).forEach((s, i) => {
    console.log(`  ✓ ${s}`);
  });

  console.log('\n' + '═'.repeat(60));
  console.log('CONSENSUS');
  console.log('═'.repeat(60));
  console.log(`Advocate Score: ${(consensus.advocateScore * 100).toFixed(1)}%`);
  console.log(`Critic Score: ${(consensus.criticScore * 100).toFixed(1)}%`);
  console.log(`Score Delta: ${(consensus.scoreDelta * 100).toFixed(1)}%`);
  console.log(`Consensus Reached: ${consensus.isConsensus ? 'YES' : 'NO'}`);
}

async function testFullCommittee() {
  const modeLabel = useFastMode ? 'FAST MODE' : 'STANDARD';
  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║   COMMITTEE RESUME OPTIMIZATION - FULL PROCESS (${modeLabel})  ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (useFastMode) {
    console.log('Using FAST_MODEL_CONFIG: gpt-4o for Advocate, gpt-4o-mini for Critic/Writer');
    console.log('Fast mode enabled: will stop after round 1 if consensus is close\n');
  }

  const llmClient = new LLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o',
  });

  // Run full committee optimization
  const result = await runCommittee(job, resume, llmClient, {
    maxRounds: 2,
    consensusThreshold: 0.1,
    targetFit: 0.85,
    ...(useFastMode ? { models: FAST_MODEL_CONFIG, fastMode: true } : {})
  });

  console.log('\n' + '═'.repeat(60));
  console.log('FINAL RESULTS');
  console.log('═'.repeat(60));
  console.log(`Initial Fit (Critic's assessment): ${(result.initialFit * 100).toFixed(1)}%`);
  console.log(`Final Fit (Critic's assessment): ${(result.finalFit * 100).toFixed(1)}%`);
  console.log(`Improvement: +${(result.improvement * 100).toFixed(1)}%`);
  console.log(`Rounds: ${result.rounds.length}`);
  console.log(`Termination: ${result.terminationReason}`);

  console.log('\nDialogue Summary:');
  console.log(`  Connections Found: ${result.dialogueSummary.totalConnectionsFound}`);
  console.log(`  Challenges Raised: ${result.dialogueSummary.challengesRaised}`);
  console.log(`  Challenges Resolved: ${result.dialogueSummary.challengesResolved}`);
  console.log(`  Genuine Gaps: ${result.dialogueSummary.genuineGapsIdentified}`);
  console.log(`  Changes Applied: ${result.dialogueSummary.changesApplied}`);

  console.log('\nFinal Consensus:');
  console.log(`  Advocate: ${(result.finalConsensus.advocateScore * 100).toFixed(1)}%`);
  console.log(`  Critic: ${(result.finalConsensus.criticScore * 100).toFixed(1)}%`);
  console.log(`  Delta: ${(result.finalConsensus.scoreDelta * 100).toFixed(1)}%`);
  console.log(`  Consensus: ${result.finalConsensus.isConsensus ? 'YES' : 'NO'}`);

  // Show round-by-round progress
  console.log('\n' + '─'.repeat(60));
  console.log('ROUND-BY-ROUND PROGRESS');
  console.log('─'.repeat(60));
  result.rounds.forEach((round, i) => {
    console.log(`\nRound ${round.round}:`);
    console.log(`  Advocate Score: ${(round.advocateAnalysis.fitScore * 100).toFixed(1)}%`);
    console.log(`  Critic Score: ${(round.criticAnalysis.fitScore * 100).toFixed(1)}%`);
    console.log(`  Consensus: ${round.consensus.isConsensus ? 'YES' : 'NO'}`);
    if (round.writerOutput) {
      console.log(`  Changes Applied: ${round.writerOutput.changesApplied.length}`);
      console.log(`  Advocate Points Used: ${round.writerOutput.advocatePointsAdopted.length}`);
      console.log(`  Critic Corrections: ${round.writerOutput.criticCorrectionsApplied.length}`);
    }
  });

  // Show a sample of the rewritten resume
  if (result.rounds.length > 0 && result.rounds[0].writerOutput) {
    console.log('\n' + '═'.repeat(60));
    console.log('CHANGES MADE IN ROUND 1');
    console.log('═'.repeat(60));

    const writer = result.rounds[0].writerOutput;

    console.log('\nAdvocate Points Adopted:');
    writer.advocatePointsAdopted.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p}`);
    });

    console.log('\nCritic Corrections Applied:');
    writer.criticCorrectionsApplied.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c}`);
    });

    console.log('\nIssues Not Addressed (Genuine Gaps):');
    writer.issuesNotAddressed.forEach((issue, i) => {
      console.log(`  ${i + 1}. ${issue}`);
    });
  }

  // Print first 1000 chars of rewritten resume
  console.log('\n' + '═'.repeat(60));
  console.log('REWRITTEN RESUME (first 1000 chars)');
  console.log('═'.repeat(60));
  console.log(result.finalResume.content.substring(0, 1000) + '...');
}

async function main() {
  try {
    // First test: just analysis to see Advocate vs Critic interaction
    await testCommitteeAnalysis();

    // Second test: full optimization with rewriting
    await testFullCommittee();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
