import { startOptimization } from './src/ats-agent/controller/iterationController';
import { LLMClient } from './src/shared/llm/client';
import dotenv from 'dotenv';

dotenv.config();
process.env.LLM_DEBUG = '1';

async function testRealData() {
  const llmClient = new LLMClient({
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4o', // Use gpt-4o which supports JSON mode
  });

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
  };

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
“Induction of APOBEC3 mutagenesis by genotoxic treatments in cancer”. Cancer Genomics Meeting, October 2024 
“Impact of APOBEC3 mutagenesis on therapy resistance in cancer”. Cancer Center Retreat, June 2024 
AWARDS AND LEADERSHIP 
• Finalist, Cancer Research Thesis Prize, 2023 
• President, Cancer Research Graduate Society, 2019-2020 
• Innovation and Discovery Award, 2018 


    `.trim(),
    format: 'text' as const,
  };

  const result = await startOptimization(job, resume, {
    targetScore: 0.85,
    maxIterations: 5,
  }, llmClient);

  console.log('\n=== RESULTS ===');
  console.log(`Score: ${result.metrics.initialScore.toFixed(2)} → ${result.metrics.finalScore.toFixed(2)}`);
  console.log(`Improvement: +${result.metrics.improvement.toFixed(2)}`);
  console.log(`Iterations: ${result.metrics.iterationCount}`);
  
  console.log('\n=== TOP RECOMMENDATIONS ===');
  const lastIter = result.iterations[result.iterations.length - 1];
  const allRecs = [
    ...lastIter.recommendations.priority,
    ...lastIter.recommendations.optional,
  ];
  
  allRecs.slice(0, 10).forEach((rec, i) => {
    console.log(`\n${i + 1}. ${rec.type}: ${rec.element}`);
    console.log(`   ${rec.suggestion}`);
  });
}

testRealData().catch(console.error);
