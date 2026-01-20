# Design Document: User Knowledge Base

## Overview

The Knowledge Base is a dedicated storage and retrieval system for optimized resumes and their associated analysis data. It automatically archives every successful optimization, allowing users to browse, search, edit, and export their optimization history.

The implementation follows existing patterns in the codebase:
- Storage pattern from `applicationsStore.ts`
- Obsidian integration from `shared/obsidian/client.ts`
- UI patterns from `vault.html` and `vault.js`
- Export functionality from `index.ts` (PDF/Word handlers)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Renderer Process                          │
├─────────────────────────────────────────────────────────────────┤
│  knowledge-base.html    │    knowledge-base.js                   │
│  - Entry cards grid     │    - IPC calls to main process         │
│  - Search/filter bar    │    - State management                  │
│  - Detail modal         │    - Markdown rendering                │
│  - Raw/rendered toggle  │    - Edit handling                     │
└────────────────────────────────┬────────────────────────────────┘
                                 │ IPC
┌────────────────────────────────▼────────────────────────────────┐
│                         Main Process                             │
├─────────────────────────────────────────────────────────────────┤
│  index.ts (IPC handlers)     │    knowledgeBaseStore.ts          │
│  - knowledge-base-list       │    - CRUD operations              │
│  - knowledge-base-get        │    - Search/filter logic          │
│  - knowledge-base-save       │    - File I/O via Obsidian        │
│  - knowledge-base-update     │    - Stats computation            │
│  - knowledge-base-delete     │                                   │
│  - knowledge-base-export     │                                   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│                      Obsidian Vault                              │
├─────────────────────────────────────────────────────────────────┤
│  KnowledgeBase/                                                  │
│  ├── TechCorp-Senior-Engineer-kb-1705856400000-abc123.md        │
│  ├── StartupXYZ-Frontend-Dev-kb-1705856500000-def456.md         │
│  └── ...                                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Data Types (`src/main/knowledgeBaseStore.ts`)

```typescript
export interface KnowledgeBaseEntry {
  id: string;                    // Format: kb-{timestamp}-{random6}
  jobTitle: string;
  company: string;
  jobDescription: string;
  sourceUrl?: string;
  optimizedResume: string;       // Markdown content
  analysis: {
    finalScore: number;          // 0.0 - 1.0
    initialScore: number;
    iterations: number;
    strengths: string[];
    gaps: string[];
    recommendations: Array<{
      priority: 'high' | 'medium' | 'low';
      suggestion: string;
      rationale?: string;
    }>;
  };
  createdAt: string;             // ISO 8601
  notes?: string;
  tags?: string[];
}

export interface KnowledgeBaseSummary {
  id: string;
  jobTitle: string;
  company: string;
  score: number;
  createdAt: string;
  tags?: string[];
}

export interface KnowledgeBaseStats {
  total: number;
  averageScore: number;
  thisWeek: number;
  uniqueCompanies: number;
}
```

### 2. Store Module (`src/main/knowledgeBaseStore.ts`)

Following the pattern from `applicationsStore.ts`:

```typescript
export const knowledgeBaseStore = {
  list(filters?: { company?: string; text?: string; sortBy?: string; sortOrder?: string }): KnowledgeBaseSummary[];
  get(id: string): KnowledgeBaseEntry | null;
  save(data: Omit<KnowledgeBaseEntry, 'id' | 'createdAt'>): KnowledgeBaseEntry;
  update(id: string, updates: { notes?: string; tags?: string[]; optimizedResume?: string }): KnowledgeBaseEntry | null;
  delete(id: string): boolean;
  getStats(): KnowledgeBaseStats;
  getCompanies(): string[];  // For filter dropdown
};
```

### 3. IPC Handlers (`src/main/index.ts`)

```typescript
ipcMain.handle('knowledge-base-list', (event, filters?) => knowledgeBaseStore.list(filters));
ipcMain.handle('knowledge-base-get', (event, id) => knowledgeBaseStore.get(id));
ipcMain.handle('knowledge-base-save', (event, data) => knowledgeBaseStore.save(data));
ipcMain.handle('knowledge-base-update', (event, { id, updates }) => knowledgeBaseStore.update(id, updates));
ipcMain.handle('knowledge-base-delete', (event, id) => knowledgeBaseStore.delete(id));
ipcMain.handle('knowledge-base-stats', () => knowledgeBaseStore.getStats());
ipcMain.handle('knowledge-base-companies', () => knowledgeBaseStore.getCompanies());
ipcMain.handle('knowledge-base-export', (event, { id, format }) => /* reuse existing export logic */);
```

### 4. UI Components (`src/renderer/knowledge-base.html`)

```
┌─────────────────────────────────────────────────────────────────┐
│  [Navigation Bar - consistent with other pages]                  │
├─────────────────────────────────────────────────────────────────┤
│  Knowledge Base                                                  │
│  Your optimized resumes and job analysis history                 │
├─────────────────────────────────────────────────────────────────┤
│  Stats: [42 Total] [78% Avg] [5 This Week] [12 Companies]       │
├─────────────────────────────────────────────────────────────────┤
│  [🔍 Search...        ] [Company ▼] [Sort: Newest ▼]            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │ Sr. Engineer │ │ Frontend Dev │ │ Data Analyst │             │
│  │ TechCorp     │ │ StartupXYZ   │ │ BigData Inc  │             │
│  │ ████████ 87% │ │ ██████── 75% │ │ ███████─ 82% │             │
│  │ Jan 21, 2024 │ │ Jan 20, 2024 │ │ Jan 19, 2024 │             │
│  │ [View]       │ │ [View]       │ │ [View]       │             │
│  └──────────────┘ └──────────────┘ └──────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Detail Modal

```
┌─────────────────────────────────────────────────────────────────┐
│  Senior Software Engineer @ TechCorp          [Export ▼] [×]    │
│  Jan 21, 2024 at 3:30 PM                                        │
├─────────────────────────────────────────────────────────────────┤
│  [Job Description] [Resume] [Analysis]              <- Tabs     │
├─────────────────────────────────────────────────────────────────┤
│  Resume Tab:                                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ [Rendered ▼] [Raw Markdown]              <- View toggle   │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │                                                           │  │
│  │  (Resume content - rendered or raw based on toggle)       │  │
│  │                                                           │  │
│  │  [Edit] button when in Raw mode                           │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  Notes: [editable textarea]                                      │
│  Tags: [tag1] [tag2] [+ Add]                                    │
├─────────────────────────────────────────────────────────────────┤
│  [Delete Entry]                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Models

### YAML Frontmatter Structure

```yaml
---
type: knowledge-base-entry
id: kb-1705856400000-abc123
job_title: "Senior Software Engineer"
company: "TechCorp Inc"
source_url: "https://jobs.example.com/123"
score: 0.87
initial_score: 0.62
iterations: 3
strengths:
  - "Strong Python experience matches requirements"
  - "Cloud architecture background aligns well"
gaps:
  - "No Kubernetes certification mentioned"
recommendations:
  - priority: high
    suggestion: "Emphasize containerization experience"
    rationale: "Job requires K8s expertise"
created_at: "2024-01-21T15:30:00.000Z"
tags: [tech, senior, remote]
notes: "Great match for my cloud experience"
---

# Optimized Resume

[Full markdown resume content here]

---

# Job Description

[Full job description here]
```

### File Naming Convention

Pattern: `{Company}-{JobTitle}-{id}.md`

```typescript
function generateFilename(entry: KnowledgeBaseEntry): string {
  const safeCompany = sanitize(entry.company).substring(0, 30);
  const safeTitle = sanitize(entry.jobTitle).substring(0, 40);
  return `${safeCompany}-${safeTitle}-${entry.id}.md`;
}

function sanitize(str: string): string {
  return str.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-');
}
```

## Error Handling

| Scenario | Handling |
|----------|----------|
| Vault not configured | Show settings prompt, disable save |
| File write fails | Show error toast, log details |
| Entry not found | Return null, show "not found" in UI |
| Parse error on read | Skip entry, log warning |
| Export fails | Show error toast with reason |

## Testing Strategy

### Unit Tests
- `knowledgeBaseStore.ts`: Test CRUD operations, filtering, search
- File naming: Test sanitization edge cases
- Frontmatter parsing: Test malformed YAML handling

### Integration Tests
- IPC round-trip: Save → List → Get → Update → Delete
- Auto-save from optimizer: Mock optimization result, verify entry created
- Export: Verify PDF/Word generation from entry

### Manual Testing
1. Run optimization → verify auto-save creates entry
2. Browse knowledge base → verify cards display correctly
3. Search/filter → verify results update
4. View entry → verify all tabs work (Job, Resume, Analysis)
5. Toggle raw/rendered → verify markdown display
6. Edit raw markdown → save → verify changes persist
7. Export to each format → verify files are valid
8. Delete entry → verify removal from list and filesystem

## Integration Points

### Auto-Save from Optimizer

In `src/renderer/optimizer.js`, after `displayResults()`:

```javascript
// Existing: saveToApplications(result.data)
// Add: saveToKnowledgeBase(result.data)

async function saveToKnowledgeBase(results) {
  const entry = {
    jobTitle: elements.jobTitle.value.trim(),
    company: elements.jobCompany.value.trim(),
    jobDescription: elements.jobDescription.value.trim(),
    sourceUrl: state.job?.sourceUrl || null,
    optimizedResume: results.finalResume?.content || '',
    analysis: {
      finalScore: results.finalFit,
      initialScore: results.initialFit,
      iterations: results.iterations?.length || 1,
      strengths: results.iterations?.slice(-1)[0]?.analysis?.strengths || [],
      gaps: results.iterations?.slice(-1)[0]?.analysis?.gaps || [],
      recommendations: results.iterations?.slice(-1)[0]?.analysis?.recommendations || []
    }
  };

  await ipcRenderer.invoke('knowledge-base-save', entry);
}
```

### Navigation Update

Add to all HTML files in the nav section:

```html
<a href="./knowledge-base.html" class="nav-link">Knowledge Base</a>
```

## Files to Create/Modify

### New Files
- `src/main/knowledgeBaseStore.ts` - Storage module
- `src/renderer/knowledge-base.html` - UI page
- `src/renderer/knowledge-base.js` - UI logic

### Modified Files
- `src/main/index.ts` - Add IPC handlers
- `src/renderer/optimizer.js` - Add auto-save call
- All HTML files - Add navigation link
