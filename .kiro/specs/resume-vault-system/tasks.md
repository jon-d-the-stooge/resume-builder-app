# Implementation Tasks: Resume Vault System (Option A)

## Overview

These tasks implement the **Option A: Enhanced Existing Architecture** approach - persisting committee analysis and decision tracking in the Knowledge Base without restructuring content storage.

---

## Task 1: Extend KnowledgeBaseEntry Interface

**File:** `src/main/knowledgeBaseStore.ts`

### Subtasks

- [ ] 1.1 Add `ParsedRequirements` interface
  ```typescript
  interface ParsedRequirements {
    required: string[];
    preferred: string[];
    skills: string[];
    experience: string | null;
    education: string | null;
  }
  ```

- [ ] 1.2 Add `OptimizationDecisions` interface
  ```typescript
  interface OptimizationDecisions {
    includedItems: Array<{ itemId: string; reason: string }>;
    excludedItems: Array<{ itemId: string; reason: string }>;
    modifiedItems: Array<{
      originalContent: string;
      modifiedContent: string;
      keywordsAdded: string[];
      rationale: string;
    }>;
  }
  ```

- [ ] 1.3 Add `CommitteeOutput` interface
  ```typescript
  interface CommitteeOutput {
    advocateFitScore: number;
    criticFitScore: number;
    rounds: number;
    terminationReason: 'consensus' | 'target_reached' | 'max_rounds' | 'no_improvement';
    connections: Array<{
      requirement: string;
      evidence: string;
      strength: 'strong' | 'moderate' | 'inferred' | 'transferable';
    }>;
    strengths: string[];
    challenges: Array<{
      type: 'overclaim' | 'unsupported' | 'missing' | 'weak_evidence' | 'terminology_gap' | 'blandification';
      claim: string;
      issue: string;
      severity: 'critical' | 'major' | 'minor';
    }>;
    genuineGaps: Array<{
      requirement: string;
      reason: string;
      isRequired: boolean;
    }>;
  }
  ```

- [ ] 1.4 Add `OptimizationMetrics` interface
  ```typescript
  interface OptimizationMetrics {
    durationMs: number;
    tokenUsage: {
      advocate: number;
      critic: number;
      writer: number;
      total: number;
    };
  }
  ```

- [ ] 1.5 Extend `KnowledgeBaseEntry` with new optional fields
  ```typescript
  export interface KnowledgeBaseEntry {
    // ... existing fields ...
    parsedRequirements?: ParsedRequirements;
    decisions?: OptimizationDecisions;
    committeeOutput?: CommitteeOutput;
    metrics?: OptimizationMetrics;
  }
  ```

---

## Task 2: Update KnowledgeBaseStore Save/Load

**File:** `src/main/knowledgeBaseStore.ts`

### Subtasks

- [ ] 2.1 Update `save()` method to serialize new fields to frontmatter
  - Serialize `parsedRequirements` as YAML
  - Serialize `decisions` as YAML (handle nested arrays)
  - Serialize `committeeOutput` as YAML
  - Serialize `metrics` as YAML

- [ ] 2.2 Update `parseEntry()` method to deserialize new fields from frontmatter
  - Parse `parsedRequirements` if present
  - Parse `decisions` if present
  - Parse `committeeOutput` if present
  - Parse `metrics` if present
  - Handle missing fields gracefully (backward compatibility)

- [ ] 2.3 Verify build succeeds with type changes

---

## Task 3: Modify ATS Agent Pipeline Return Type

**File:** `src/ats-agent/pipeline.ts`

### Subtasks

- [ ] 3.1 Examine current pipeline return structure
  - Read `src/ats-agent/pipeline.ts`
  - Identify what data is currently returned vs discarded

- [ ] 3.2 Define enhanced return type
  ```typescript
  interface EnhancedOptimizationResult {
    // Existing fields
    optimizedResume: string;
    fitScore: number;

    // New fields
    parsedRequirements?: ParsedRequirements;
    decisions?: OptimizationDecisions;
    committeeOutput?: CommitteeOutput;
    metrics?: OptimizationMetrics;
  }
  ```

- [ ] 3.3 Capture advocate analysis from committee stage
  - Extract connections, strengths, reframing opportunities
  - Map to `CommitteeOutput.connections` and `CommitteeOutput.strengths`

- [ ] 3.4 Capture critic analysis from committee stage
  - Extract challenges and genuine gaps
  - Map to `CommitteeOutput.challenges` and `CommitteeOutput.genuineGaps`

- [ ] 3.5 Track decisions during selection stage
  - Record which items were included and why
  - Record which items were excluded and why
  - Record any modifications made

- [ ] 3.6 Add performance metrics tracking
  - Track start time at pipeline entry
  - Calculate duration at pipeline exit
  - Aggregate token usage from API calls

- [ ] 3.7 Return enhanced result from pipeline

---

## Task 4: Update Renderer Integration

**File:** `src/renderer/optimizer.js`

### Subtasks

- [ ] 4.1 Read current `saveToKnowledgeBase()` implementation

- [ ] 4.2 Update to pass enhanced optimization result
  - Receive full result from IPC
  - Forward all fields to knowledge base save

- [ ] 4.3 Verify IPC handler in main process accepts new fields
  - Check `src/main/index.ts` for knowledge-base-save handler
  - Update if needed to pass through new fields

---

## Task 5: Knowledge Base UI Enhancement (Optional)

**Files:** `src/renderer/knowledge-base.js`, `src/renderer/knowledge-base.html`

### Subtasks

- [ ] 5.1 Add CSS styles for new analysis sections
  - Collapsible sections
  - Connection strength badges
  - Challenge severity indicators
  - Gap display styling

- [ ] 5.2 Add HTML structure for committee analysis display
  - Expandable "Optimization Analysis" section in detail modal
  - Connections table (requirement → evidence)
  - Challenges list with severity badges
  - Genuine gaps list
  - Decision audit trail

- [ ] 5.3 Update JavaScript to populate new UI sections
  - Conditional rendering (hide if data absent)
  - Format connections for display
  - Format challenges with severity colors
  - Format decisions as audit trail

---

## Task 6: Verification

### Subtasks

- [ ] 6.1 Build the project
  ```bash
  npm run build:main
  ```

- [ ] 6.2 Run optimization with committee enabled
  - Use real job description
  - Verify optimization completes

- [ ] 6.3 Check Knowledge Base entry
  - Open entry in Knowledge Base UI
  - Verify new fields are present in markdown file
  - Verify committee analysis displays correctly

- [ ] 6.4 Test backward compatibility
  - Load existing Knowledge Base entry (pre-enhancement)
  - Verify it loads without errors
  - Verify UI handles missing fields gracefully

- [ ] 6.5 Run any existing tests
  ```bash
  npm test
  ```

---

## Dependencies

```
Task 1 → Task 2 (types must exist before save/load)
Task 2 → Task 3 (types must exist in store before pipeline uses them)
Task 3 → Task 4 (pipeline must return data before renderer can pass it)
Task 4 → Task 5 (data must flow through before UI can display it)
All → Task 6 (verification after implementation)
```

---

## Acceptance Criteria

1. **Committee analysis persists** - After optimization, `CommitteeOutput` fields are saved to Knowledge Base markdown
2. **Decisions are tracked** - `OptimizationDecisions` captures what was included/excluded and why
3. **Backward compatible** - Existing Knowledge Base entries load without errors
4. **UI displays analysis** (optional) - Detail modal shows committee findings
5. **Build succeeds** - No TypeScript errors after changes
