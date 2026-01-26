import { fileHandler } from './src/main/fileHandler';
import { startOptimization } from './src/ats-agent/controller/iterationController';
import { LLMClient } from './src/shared/llm/client';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
process.env.LLM_DEBUG = '1';

async function run() {
  const pdfPath = path.resolve('resume_test_real.pdf');

  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ PDF not found: ${pdfPath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(pdfPath);
  const file = new File([buffer], path.basename(pdfPath), { type: 'application/pdf' });

  console.log('Step 1: Extracting text from PDF...');
  const text = await fileHandler.extractText(file);
  console.log(`✓ Extracted ${text.length} characters`);

  const resume = {
    id: 'resume_test_real',
    content: text,
    format: 'text' as const
  };

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
    `.trim()
  };

  const llmClient = new LLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o'
  });

  console.log('Step 2: Running ATS optimization loop...');
  const result = await startOptimization(
    job,
    resume,
    {
      targetScore: 0.85,
      maxIterations: 3
    },
    llmClient
  );

  console.log('\n=== RESULTS ===');
  console.log(`Score: ${result.metrics.initialScore.toFixed(2)} → ${result.metrics.finalScore.toFixed(2)}`);
  console.log(`Improvement: +${result.metrics.improvement.toFixed(2)}`);
  console.log(`Iterations: ${result.metrics.iterationCount}`);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
