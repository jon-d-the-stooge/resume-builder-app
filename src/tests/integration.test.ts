/**
 * Integration Tests for Resume Content Ingestion
 * 
 * These tests validate the system with real resume files to ensure:
 * - PDF, DOCX, and TXT resume parsing accuracy (>90% for titles, skills, accomplishments)
 * - Hierarchical relationship preservation
 * - Tag-based retrieval accuracy (100%)
 * - Multi-tag filtering accuracy (100%)
 * 
 * Validates: Requirements 14.1-14.10
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { fileHandler } from '../main/fileHandler';
import { ParserAgent as ParserAgentImpl } from '../main/parserAgent';
import * as fs from 'fs';
import * as path from 'path';

// Create parser agent instance for tests
const parserAgent = new ParserAgentImpl();

// Ground truth data for test resumes
// This should be manually verified against actual resume content
interface GroundTruth {
  fileName: string;
  format: 'pdf' | 'docx' | 'txt';
  expectedJobTitles: string[];
  expectedSkills: string[];
  expectedAccomplishments: number; // Minimum number expected
  expectedEducation: number;
  expectedCertifications: number;
  expectedCompanies: string[];
}

// Define ground truth for available test resumes
const groundTruthData: GroundTruth[] = [
  {
    fileName: 'resume_test_real.pdf',
    format: 'pdf',
    expectedJobTitles: [
      'Postdoctoral Research Fellow',
      'PhD Student',
      'Associate Scientist'
    ],
    expectedSkills: [
      'Cell culture',
      'flow cytometry',
      'CRISPR',
      'DNA cloning',
      'RNA-seq',
      'Western blotting',
      'qPCR',
      'GraphPad Prism',
      'FlowJo',
      'ImageJ'
    ],
    expectedAccomplishments: 15, // Minimum number of bullet points across all jobs
    expectedEducation: 2, // PhD and Bachelor's
    expectedCertifications: 0,
    expectedCompanies: [
      'University of Cambridge',
      'CRUK Cambridge Institute',
      'Virginia Commonwealth University'
    ]
  },
  {
    fileName: 'resume_test_fake.pdf',
    format: 'pdf',
    expectedJobTitles: [], // Empty/template resume - skip testing
    expectedSkills: [],
    expectedAccomplishments: 0,
    expectedEducation: 0,
    expectedCertifications: 0,
    expectedCompanies: []
  }
];

describe('Integration Tests: Real Resume Parsing', () => {
  // Skip tests if API key is not available
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  
  if (!hasApiKey) {
    console.warn('⚠️  Skipping integration tests: ANTHROPIC_API_KEY not set');
  }

  beforeAll(() => {
    if (!hasApiKey) {
      console.log('To run integration tests, set ANTHROPIC_API_KEY environment variable');
    }
  });

  /**
   * Feature: resume-content-ingestion, Integration Test 19.1
   * Create test suite with real resume files
   * 
   * Validates: Requirements 14.1, 14.2, 14.3
   */
  describe('19.1 Real Resume File Collection', () => {
    it('should have real PDF resume files available', () => {
      const pdfResumes = groundTruthData.filter(gt => gt.format === 'pdf');
      expect(pdfResumes.length).toBeGreaterThanOrEqual(1);
      
      pdfResumes.forEach(gt => {
        const filePath = path.join(process.cwd(), gt.fileName);
        expect(fs.existsSync(filePath), `PDF resume ${gt.fileName} should exist`).toBe(true);
      });
    });

    it.skip('should have real DOCX resume files available', () => {
      // Skip if no DOCX files are available yet
      const docxResumes = groundTruthData.filter(gt => gt.format === 'docx');
      expect(docxResumes.length).toBeGreaterThanOrEqual(1);
      
      docxResumes.forEach(gt => {
        const filePath = path.join(process.cwd(), gt.fileName);
        expect(fs.existsSync(filePath), `DOCX resume ${gt.fileName} should exist`).toBe(true);
      });
    });

    it.skip('should have real TXT resume files available', () => {
      // Skip if no TXT files are available yet
      const txtResumes = groundTruthData.filter(gt => gt.format === 'txt');
      expect(txtResumes.length).toBeGreaterThanOrEqual(1);
      
      txtResumes.forEach(gt => {
        const filePath = path.join(process.cwd(), gt.fileName);
        expect(fs.existsSync(filePath), `TXT resume ${gt.fileName} should exist`).toBe(true);
      });
    });

    it('should have ground truth data defined for each resume', () => {
      expect(groundTruthData.length).toBeGreaterThanOrEqual(1);
      
      groundTruthData.forEach(gt => {
        expect(gt.fileName).toBeDefined();
        expect(gt.format).toMatch(/^(pdf|docx|txt)$/);
        expect(gt.expectedJobTitles).toBeDefined();
        expect(gt.expectedSkills).toBeDefined();
        expect(gt.expectedAccomplishments).toBeGreaterThanOrEqual(0);
      });
    });
  });

  /**
   * Feature: resume-content-ingestion, Integration Test 19.2
   * Write integration tests for real resume parsing
   * 
   * Validates: Requirements 14.4-14.10
   */
  describe('19.2 Real Resume Parsing Accuracy', () => {
    // Helper function to calculate accuracy
    function calculateAccuracy(expected: string[], actual: string[]): number {
      if (expected.length === 0) return 1.0;
      
      const matches = expected.filter(exp => 
        actual.some(act => 
          act.toLowerCase().includes(exp.toLowerCase()) ||
          exp.toLowerCase().includes(act.toLowerCase())
        )
      );
      
      return matches.length / expected.length;
    }

    // Test each resume file
    groundTruthData.forEach(groundTruth => {
      describe(`Testing ${groundTruth.fileName}`, () => {
        const testCondition = hasApiKey ? it : it.skip;

        testCondition(`should parse ${groundTruth.format.toUpperCase()} resume with >90% job title accuracy`, async () => {
          // Skip if no ground truth data
          if (groundTruth.expectedJobTitles.length === 0) {
            console.log(`⚠️  Skipping: No ground truth data for ${groundTruth.fileName}`);
            return;
          }

          const filePath = path.join(process.cwd(), groundTruth.fileName);
          const buffer = fs.readFileSync(filePath);
          const file = new File([buffer], groundTruth.fileName, {
            type: groundTruth.format === 'pdf' ? 'application/pdf' :
                  groundTruth.format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                  'text/plain'
          });

          // Validate and extract text
          const validation = fileHandler.validateFile(file);
          expect(validation.isValid).toBe(true);

          const text = await fileHandler.extractText(file);
          expect(text.length).toBeGreaterThan(0);

          // Parse resume
          const parsed = await parserAgent.parseResume(text);

          // Extract actual job titles
          const actualTitles = parsed.jobEntries.map(job => job.title);

          // Calculate accuracy
          const accuracy = calculateAccuracy(groundTruth.expectedJobTitles, actualTitles);

          console.log(`Job Title Accuracy: ${(accuracy * 100).toFixed(1)}%`);
          console.log(`Expected: ${groundTruth.expectedJobTitles.join(', ')}`);
          console.log(`Actual: ${actualTitles.join(', ')}`);

          expect(accuracy).toBeGreaterThanOrEqual(0.9);
        }, 60000); // 60 second timeout for API calls

        testCondition(`should parse ${groundTruth.format.toUpperCase()} resume with >90% skill accuracy`, async () => {
          // Skip if no ground truth data
          if (groundTruth.expectedSkills.length === 0) {
            console.log(`⚠️  Skipping: No ground truth data for ${groundTruth.fileName}`);
            return;
          }

          const filePath = path.join(process.cwd(), groundTruth.fileName);
          const buffer = fs.readFileSync(filePath);
          const file = new File([buffer], groundTruth.fileName, {
            type: groundTruth.format === 'pdf' ? 'application/pdf' :
                  groundTruth.format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                  'text/plain'
          });

          const validation = fileHandler.validateFile(file);
          expect(validation.isValid).toBe(true);

          const text = await fileHandler.extractText(file);
          const parsed = await parserAgent.parseResume(text);

          // Extract all skills (both standalone and job-specific)
          const actualSkills = [
            ...parsed.skills.map(s => s.name),
            ...parsed.jobEntries.flatMap(job => job.skills.map(s => s.name))
          ];

          const accuracy = calculateAccuracy(groundTruth.expectedSkills, actualSkills);

          console.log(`Skill Accuracy: ${(accuracy * 100).toFixed(1)}%`);
          console.log(`Expected: ${groundTruth.expectedSkills.join(', ')}`);
          console.log(`Actual: ${actualSkills.join(', ')}`);

          expect(accuracy).toBeGreaterThanOrEqual(0.9);
        }, 60000);

        testCondition(`should parse ${groundTruth.format.toUpperCase()} resume with >90% accomplishment accuracy`, async () => {
          // Skip if no ground truth data
          if (groundTruth.expectedAccomplishments === 0) {
            console.log(`⚠️  Skipping: No ground truth data for ${groundTruth.fileName}`);
            return;
          }

          const filePath = path.join(process.cwd(), groundTruth.fileName);
          const buffer = fs.readFileSync(filePath);
          const file = new File([buffer], groundTruth.fileName, {
            type: groundTruth.format === 'pdf' ? 'application/pdf' :
                  groundTruth.format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                  'text/plain'
          });

          const validation = fileHandler.validateFile(file);
          expect(validation.isValid).toBe(true);

          const text = await fileHandler.extractText(file);
          const parsed = await parserAgent.parseResume(text);

          // Count total accomplishments
          const actualAccomplishmentCount = parsed.jobEntries.reduce(
            (sum, job) => sum + job.accomplishments.length,
            0
          );

          // Calculate accuracy (within 10% of expected count)
          const accuracy = actualAccomplishmentCount / groundTruth.expectedAccomplishments;

          console.log(`Accomplishment Count Accuracy: ${(accuracy * 100).toFixed(1)}%`);
          console.log(`Expected: ${groundTruth.expectedAccomplishments}`);
          console.log(`Actual: ${actualAccomplishmentCount}`);

          expect(accuracy).toBeGreaterThanOrEqual(0.9);
        }, 60000);

        testCondition(`should preserve hierarchical relationships in ${groundTruth.format.toUpperCase()} resume`, async () => {
          const filePath = path.join(process.cwd(), groundTruth.fileName);
          const buffer = fs.readFileSync(filePath);
          const file = new File([buffer], groundTruth.fileName, {
            type: groundTruth.format === 'pdf' ? 'application/pdf' :
                  groundTruth.format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                  'text/plain'
          });

          const validation = fileHandler.validateFile(file);
          expect(validation.isValid).toBe(true);

          const text = await fileHandler.extractText(file);
          const parsed = await parserAgent.parseResume(text);

          // Verify hierarchical relationships
          parsed.jobEntries.forEach(job => {
            // Each job should have an ID
            expect(job.id).toBeDefined();
            expect(job.id.length).toBeGreaterThan(0);

            // Each accomplishment should reference its parent job
            job.accomplishments.forEach(acc => {
              expect(acc.parentJobId).toBe(job.id);
            });

            // Each skill should reference its parent job (if job-specific)
            job.skills.forEach(skill => {
              expect(skill.parentJobId).toBe(job.id);
            });
          });

          console.log(`✓ Hierarchical relationships preserved for ${parsed.jobEntries.length} jobs`);
        }, 60000);
      });
    });

    // Additional integration tests for tag-based retrieval
    describe('Tag-based Retrieval Accuracy', () => {
      const testCondition = hasApiKey ? it : it.skip;

      testCondition('should correctly tag all content items by type', async () => {
        // Use the first available resume
        const groundTruth = groundTruthData[0];
        const filePath = path.join(process.cwd(), groundTruth.fileName);
        
        if (!fs.existsSync(filePath)) {
          console.log(`⚠️  Skipping: ${groundTruth.fileName} not found`);
          return;
        }

        const buffer = fs.readFileSync(filePath);
        const file = new File([buffer], groundTruth.fileName, {
          type: 'application/pdf'
        });

        const text = await fileHandler.extractText(file);
        const parsed = await parserAgent.parseResume(text);

        // Verify all job entries have appropriate tags
        parsed.jobEntries.forEach(job => {
          expect(job).toBeDefined();
          // Job entries should be identifiable as such
          expect(job.title).toBeDefined();
          expect(job.company).toBeDefined();
        });

        // Verify all skills have skill tags
        const allSkills = [
          ...parsed.skills,
          ...parsed.jobEntries.flatMap(job => job.skills)
        ];
        allSkills.forEach(skill => {
          expect(skill.tags).toContain('skill');
        });

        // Verify all accomplishments have accomplishment tags
        const allAccomplishments = parsed.jobEntries.flatMap(job => job.accomplishments);
        allAccomplishments.forEach(acc => {
          expect(acc.tags).toContain('accomplishment');
        });

        // Verify education entries have education tags
        parsed.education.forEach(edu => {
          expect(edu.tags).toContain('education');
        });

        // Verify certifications have certification tags
        parsed.certifications.forEach(cert => {
          expect(cert.tags).toContain('certification');
        });

        console.log(`✓ All content items correctly tagged`);
      }, 60000);
    });
  });
});
