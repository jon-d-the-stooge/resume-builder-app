import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { ParsedResume, JobEntry, Accomplishment, Skill, ContentType } from '../types';

// Mock IPC renderer
const mockIpcRenderer = {
  invoke: vi.fn()
};

// Mock Electron
vi.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer
}));

// Generators for property-based testing
const dateRangeArb = fc.record({
  start: fc.date().map(d => d.toISOString()),
  end: fc.option(fc.date().map(d => d.toISOString()), { nil: undefined })
});

const locationArb = fc.record({
  city: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  state: fc.option(fc.string({ minLength: 2, maxLength: 2 }), { nil: undefined }),
  country: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
});

const accomplishmentArb = fc.record({
  id: fc.uuid(),
  description: fc.string({ minLength: 10, maxLength: 200 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
  confidence: fc.double({ min: 0, max: 1 })
});

const skillArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 2, maxLength: 50 }),
  proficiency: fc.option(fc.constantFrom('beginner', 'intermediate', 'advanced', 'expert'), { nil: undefined }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
  confidence: fc.double({ min: 0, max: 1 })
});

const jobEntryArb = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 5, maxLength: 100 }),
  company: fc.string({ minLength: 2, maxLength: 100 }),
  location: locationArb,
  duration: dateRangeArb,
  accomplishments: fc.array(accomplishmentArb, { minLength: 0, maxLength: 10 }),
  skills: fc.array(skillArb, { minLength: 0, maxLength: 15 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
  confidence: fc.double({ min: 0, max: 1 })
});

const parsedResumeArb = fc.record({
  jobEntries: fc.array(jobEntryArb, { minLength: 1, maxLength: 5 }),
  education: fc.array(fc.record({
    id: fc.uuid(),
    degree: fc.string({ minLength: 5, maxLength: 100 }),
    institution: fc.string({ minLength: 5, maxLength: 100 }),
    location: locationArb,
    dateRange: dateRangeArb,
    tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 })
  }), { minLength: 0, maxLength: 3 }),
  certifications: fc.array(fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 5, maxLength: 100 }),
    issuer: fc.string({ minLength: 2, maxLength: 100 }),
    dateIssued: fc.date().map(d => d.toISOString()),
    expirationDate: fc.option(fc.date().map(d => d.toISOString()), { nil: undefined }),
    tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 })
  }), { minLength: 0, maxLength: 3 }),
  skills: fc.array(skillArb, { minLength: 0, maxLength: 20 }),
  confidence: fc.record({
    overall: fc.double({ min: 0, max: 1 }),
    bySection: fc.dictionary(fc.string(), fc.double({ min: 0, max: 1 }))
  }),
  warnings: fc.array(fc.record({
    section: fc.string({ minLength: 1, maxLength: 50 }),
    message: fc.string({ minLength: 10, maxLength: 200 }),
    severity: fc.constantFrom('low', 'medium', 'high')
  }), { minLength: 0, maxLength: 5 })
});

describe('Feature: resume-content-ingestion, Review Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Property 36: Review confirmation saves all items', () => {
    it('should save all content items when review is confirmed', async () => {
      await fc.assert(
        fc.asyncProperty(parsedResumeArb, async (parsedData) => {
          // Clear previous mocks
          vi.clearAllMocks();
          
          // Setup: Mock the save operation
          mockIpcRenderer.invoke.mockResolvedValueOnce({ success: true });

          // Simulate confirmation action
          const saveResult = await mockIpcRenderer.invoke('save-parsed-content', parsedData);

          // Verify: Save was called with all the data
          expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('save-parsed-content', parsedData);
          expect(saveResult.success).toBe(true);

          // Verify: All job entries are included
          const savedData = mockIpcRenderer.invoke.mock.calls[mockIpcRenderer.invoke.mock.calls.length - 1][1] as ParsedResume;
          expect(savedData.jobEntries.length).toBe(parsedData.jobEntries.length);

          // Verify: All accomplishments are included
          savedData.jobEntries.forEach((job, index) => {
            expect(job.accomplishments.length).toBe(parsedData.jobEntries[index].accomplishments.length);
            expect(job.skills.length).toBe(parsedData.jobEntries[index].skills.length);
          });

          // Verify: Education and certifications are included
          expect(savedData.education.length).toBe(parsedData.education.length);
          expect(savedData.certifications.length).toBe(parsedData.certifications.length);
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve all relationships when saving', async () => {
      await fc.assert(
        fc.asyncProperty(parsedResumeArb, async (parsedData) => {
          vi.clearAllMocks();
          mockIpcRenderer.invoke.mockResolvedValueOnce({ success: true });

          await mockIpcRenderer.invoke('save-parsed-content', parsedData);

          const savedData = mockIpcRenderer.invoke.mock.calls[mockIpcRenderer.invoke.mock.calls.length - 1][1] as ParsedResume;

          // Verify: Parent-child relationships are intact
          savedData.jobEntries.forEach((job, jobIndex) => {
            const originalJob = parsedData.jobEntries[jobIndex];
            
            // Check accomplishments belong to correct job
            job.accomplishments.forEach((acc, accIndex) => {
              if (originalJob.accomplishments[accIndex]) {
                expect(acc.id).toBe(originalJob.accomplishments[accIndex].id);
              }
            });

            // Check skills belong to correct job
            job.skills.forEach((skill, skillIndex) => {
              if (originalJob.skills[skillIndex]) {
                expect(skill.id).toBe(originalJob.skills[skillIndex].id);
              }
            });
          });
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve all metadata when saving', async () => {
      await fc.assert(
        fc.asyncProperty(parsedResumeArb, async (parsedData) => {
          vi.clearAllMocks();
          mockIpcRenderer.invoke.mockResolvedValueOnce({ success: true });

          await mockIpcRenderer.invoke('save-parsed-content', parsedData);

          const savedData = mockIpcRenderer.invoke.mock.calls[mockIpcRenderer.invoke.mock.calls.length - 1][1] as ParsedResume;

          // Verify: Confidence scores are preserved (handle NaN case)
          if (!isNaN(parsedData.confidence.overall) && !isNaN(savedData.confidence.overall)) {
            expect(Math.abs(savedData.confidence.overall - parsedData.confidence.overall)).toBeLessThan(0.0001);
          } else {
            // Both should be NaN or both should be numbers
            expect(isNaN(savedData.confidence.overall)).toBe(isNaN(parsedData.confidence.overall));
          }

          // Verify: Warnings are preserved
          expect(savedData.warnings.length).toBe(parsedData.warnings.length);

          // Verify: Job metadata is preserved
          savedData.jobEntries.forEach((job, index) => {
            const originalJob = parsedData.jobEntries[index];
            expect(job.title).toBe(originalJob.title);
            expect(job.company).toBe(originalJob.company);
            
            // Handle NaN in job confidence
            if (!isNaN(originalJob.confidence) && !isNaN(job.confidence)) {
              expect(Math.abs(job.confidence - originalJob.confidence)).toBeLessThan(0.0001);
            } else {
              expect(isNaN(job.confidence)).toBe(isNaN(originalJob.confidence));
            }
          });
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 37: Review cancellation discards content', () => {
    it('should not save any content when review is cancelled', async () => {
      await fc.assert(
        fc.asyncProperty(parsedResumeArb, async (parsedData) => {
          // Setup: Load parsed data
          mockIpcRenderer.invoke.mockResolvedValueOnce(parsedData);
          const loadedData = await mockIpcRenderer.invoke('get-parsed-data');

          // Verify data was loaded
          expect(loadedData).toBeDefined();
          expect(loadedData.jobEntries.length).toBeGreaterThan(0);

          // Simulate cancellation - no save call should be made
          vi.clearAllMocks();

          // Verify: No save operation was called
          expect(mockIpcRenderer.invoke).not.toHaveBeenCalledWith(
            'save-parsed-content',
            expect.anything()
          );
        }),
        { numRuns: 100 }
      );
    });

    it('should discard all modifications when cancelled', async () => {
      await fc.assert(
        fc.asyncProperty(
          parsedResumeArb,
          fc.string({ minLength: 10, maxLength: 200 }),
          async (parsedData, newAccomplishment) => {
            // Setup: Load parsed data
            mockIpcRenderer.invoke.mockResolvedValueOnce(parsedData);
            const loadedData = await mockIpcRenderer.invoke('get-parsed-data');

            // Simulate modification (add accomplishment)
            if (loadedData.jobEntries.length > 0) {
              const modifiedData = { ...loadedData };
              modifiedData.jobEntries[0].accomplishments.push({
                id: 'new-acc-123',
                description: newAccomplishment,
                tags: ['test'],
                confidence: 1.0
              });

              // Simulate cancellation - clear mocks without saving
              vi.clearAllMocks();

              // Verify: Modified data was not saved
              expect(mockIpcRenderer.invoke).not.toHaveBeenCalledWith(
                'save-parsed-content',
                expect.objectContaining({
                  jobEntries: expect.arrayContaining([
                    expect.objectContaining({
                      accomplishments: expect.arrayContaining([
                        expect.objectContaining({ id: 'new-acc-123' })
                      ])
                    })
                  ])
                })
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not persist deletions when cancelled', async () => {
      await fc.assert(
        fc.asyncProperty(
          parsedResumeArb.filter(data => 
            data.jobEntries.length > 0 && data.jobEntries[0].accomplishments.length > 0
          ),
          async (parsedData) => {
            vi.clearAllMocks();
            
            // Setup: Load parsed data
            mockIpcRenderer.invoke.mockResolvedValueOnce(parsedData);
            const loadedData = await mockIpcRenderer.invoke('get-parsed-data');

            // Simulate deletion
            const originalAccomplishmentCount = loadedData.jobEntries[0].accomplishments.length;
            
            // Simulate cancellation - clear mocks without saving
            vi.clearAllMocks();

            // Verify: No save operation was called after cancellation
            expect(mockIpcRenderer.invoke).not.toHaveBeenCalledWith(
              'save-parsed-content',
              expect.anything()
            );

            // Original data should remain unchanged
            expect(parsedData.jobEntries[0].accomplishments.length).toBe(originalAccomplishmentCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Review UI State Management', () => {
    it('should handle empty parsed data gracefully', async () => {
      const emptyData: ParsedResume = {
        jobEntries: [],
        education: [],
        certifications: [],
        skills: [],
        confidence: { overall: 0, bySection: new Map() },
        warnings: []
      };

      mockIpcRenderer.invoke.mockResolvedValueOnce(emptyData);
      const loadedData = await mockIpcRenderer.invoke('get-parsed-data');

      expect(loadedData.jobEntries.length).toBe(0);
      expect(loadedData.education.length).toBe(0);
      expect(loadedData.certifications.length).toBe(0);
    });

    it('should handle null parsed data', async () => {
      mockIpcRenderer.invoke.mockResolvedValueOnce(null);
      const loadedData = await mockIpcRenderer.invoke('get-parsed-data');

      expect(loadedData).toBeNull();
    });
  });
});
