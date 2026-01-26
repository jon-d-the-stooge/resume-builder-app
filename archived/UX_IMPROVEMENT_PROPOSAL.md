# UX Improvement Proposal: State Persistence and Applications Storage

## Resume Builder App - Surgical UX Fixes

---

## Executive Summary

This proposal addresses three critical UX problems through **minimal, surgical changes** that preserve all existing IPC handlers and architecture:

1. **Navigation loses state** - Hard page reloads wipe renderer state
2. **No resume storage** - Previously generated resumes are not retrievable
3. **Workflow interruption** - Any disruption means lost work

The solution leverages existing infrastructure (`electron-store`, vault file system, IPC patterns) to add state persistence with minimal new code.

---

## Current Architecture (Preserved)

| Component | Status | Action |
|-----------|--------|--------|
| 46 IPC handlers | Working | **PRESERVE** |
| Vault integration | Working | **EXTEND** (add Applications folder) |
| Job queue | Working | **PRESERVE** |
| Agent memory | Working | **PRESERVE** |
| Settings store | Working | **USE AS PATTERN** |
| 11 HTML pages | Working | **MODIFY SLIGHTLY** |

---

## Solution: 4 Phases

### Phase 1: State Persistence Layer

**New file**: `src/main/appStateStore.ts`

Uses `electron-store` (already installed) to persist:
- Active workflow state (what user is working on)
- Per-page state snapshots (form data, results)
- Last active page (for "continue" functionality)

**New IPC handlers** (7):
- `app-state-start-workflow`
- `app-state-update-workflow`
- `app-state-get-workflow`
- `app-state-clear-workflow`
- `app-state-save-page`
- `app-state-get-page`
- `app-state-get-continue-info`

---

### Phase 2: Applications Storage

**New file**: `src/main/applicationsStore.ts`

Stores completed optimizations as markdown files in `Applications/` folder within vault:
- Structure: id, jobTitle, company, date, jobDescription, generatedResume, score, status
- Human-readable markdown format
- Searchable in Obsidian

**New IPC handlers** (5):
- `applications-list`
- `applications-get`
- `applications-save`
- `applications-update`
- `applications-delete`

**New UI**: `applications.html` + `applications.js`
- List all saved applications
- Filter by status
- View, edit, delete
- Load back into optimizer

---

### Phase 3: Navigation State Preservation

**Modify existing pages** (`optimizer.js`, `chat.js`, `queue.js`):
- Auto-save state every 30 seconds
- Save on page visibility change
- Restore state on page load

**Modify dashboard** (`app.js`, `index.html`):
- Add "Continue" banner for interrupted workflows
- Show what user was working on
- One-click return to workflow

---

### Phase 4: Polish

- Auto-save indicators on pages
- Add "Applications" nav link to all pages
- Test all workflows end-to-end

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/main/appStateStore.ts` | State persistence store |
| `src/main/applicationsStore.ts` | Applications storage |
| `src/renderer/applications.html` | Applications list page |
| `src/renderer/applications.js` | Applications page logic |

## Files to Modify

| File | Change |
|------|--------|
| `src/main/index.ts` | Add 12 IPC handler imports and registrations |
| `src/renderer/app.js` | Add continue banner logic |
| `src/renderer/optimizer.js` | Add state save/restore (~50 lines) |
| `src/renderer/chat.js` | Add state save/restore (~30 lines) |
| `src/renderer/queue.js` | Add state save/restore (~30 lines) |
| `src/renderer/index.html` | Add continue banner HTML |
| All `.html` files | Add Applications nav link |

---

## IPC Handler Count

- Existing: 46
- New: 12
- **Total after implementation: 58**

All existing handlers remain unchanged.

---

## Implementation Timeline

| Phase | Effort | Description |
|-------|--------|-------------|
| 1 | 1-2 days | State persistence layer |
| 2 | 2-3 days | Applications storage + UI |
| 3 | 2 days | Navigation state preservation |
| 4 | 1 day | Polish |

**Total: ~7 days**

---

## Risk Mitigation

1. **Backward Compatibility**: All existing handlers unchanged
2. **Data Safety**: New stores use separate files, no risk to vault
3. **Incremental**: Each phase is independently testable
4. **Reversible**: New code is additive, can be removed if issues arise

---

## Approval Checklist

- [ ] Approach preserves existing functionality
- [ ] Applications storage in vault makes sense
- [ ] State persistence approach is acceptable
- [ ] UI additions (continue banner, nav link) are desired
- [ ] Timeline is acceptable

---

## Ready for Implementation

Once approved, Claude Code will implement phase by phase, testing each before moving to the next.
