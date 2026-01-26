# Route Implementation Status

This document tracks the implementation status of REST routes that map to the IPC handlers defined in [ipc-handlers.md](./ipc-handlers.md).

---

## Completed Routes

### Applications (`/api/applications`)
- [x] `GET /api/applications` - List applications with optional status filter (IPC: `applications-list`)
- [x] `GET /api/applications/stats` - Get application statistics
- [x] `GET /api/applications/:id` - Get single application (IPC: `applications-get`)
- [x] `POST /api/applications` - Save new application (IPC: `applications-save`)
- [x] `PATCH /api/applications/:id` - Update application status/notes (IPC: `applications-update`)
- [x] `DELETE /api/applications/:id` - Delete application (IPC: `applications-delete`)

### Knowledge Base (`/api/knowledge-base`)
- [x] `GET /api/knowledge-base` - List entries with filtering/sorting (IPC: `knowledge-base-list`)
- [x] `GET /api/knowledge-base/stats` - Get statistics (IPC: `knowledge-base-stats`)
- [x] `GET /api/knowledge-base/companies` - Get unique companies (IPC: `knowledge-base-companies`)
- [x] `GET /api/knowledge-base/job-titles` - Get unique job titles (IPC: `knowledge-base-job-titles`)
- [x] `GET /api/knowledge-base/:id` - Get single entry (IPC: `knowledge-base-get`)
- [x] `GET /api/knowledge-base/:id/export` - Export entry as MD/JSON (IPC: `knowledge-base-export` - adapted for web)
- [x] `POST /api/knowledge-base` - Save new entry (IPC: `knowledge-base-save`)
- [x] `PATCH /api/knowledge-base/:id` - Update entry (IPC: `knowledge-base-update`)
- [x] `DELETE /api/knowledge-base/:id` - Delete entry (IPC: `knowledge-base-delete`)

### Settings (`/api/settings`)
- [x] `GET /api/settings` - Get masked settings (IPC: `get-settings`)
- [x] `PUT /api/settings` - Update settings (IPC: `save-settings`)
- [x] `POST /api/settings/validate-api-key` - Validate API key (IPC: `validate-api-key`)
- [x] `GET /api/settings/api-key-status` - Check if API key configured (IPC: `check-api-key-configured`)
- [x] `GET /api/settings/job-search-credentials` - Get job search API status
- [x] `DELETE /api/settings` - Clear settings (reset to defaults)

### Content (`/api/content`)
- [x] `GET /api/content` - Search content items (IPC: `search-content`)
- [x] `GET /api/content/:id` - Get content item (IPC: `get-content-item`)
- [x] `POST /api/content` - Create content item (IPC: `create-manual-content`)
- [x] `PATCH /api/content/:id` - Update content item (IPC: `update-content-item`)
- [x] `DELETE /api/content/:id` - Delete content item (IPC: `delete-content-item`)
- [x] `POST /api/content/:parentId/link/:childId` - Link parent-child relationship
- [x] `POST /api/content/skills/:skillId/link-jobs` - Link skill to multiple jobs
- [x] `DELETE /api/content/vault` - Clear vault (IPC: `clear-vault`)

### Jobs (`/api/jobs`) - Previously Implemented
- [x] `GET /api/jobs` - List jobs with optional status filter (IPC: `job-queue-list`)
- [x] `GET /api/jobs/:id` - Get job with result (IPC: `job-queue-get-result`)
- [x] `POST /api/jobs` - Create/queue new job (IPC: `job-queue-add`)
- [x] `POST /api/jobs/optimize` - Queue optimization job (IPC: `job-queue-process-next`)
- [x] `DELETE /api/jobs/:id` - Remove job (IPC: `job-queue-remove`)

### Vaults (`/api/vaults`) - Previously Implemented
- [x] `GET /api/vaults` - List all vaults
- [x] `GET /api/vaults/:id` - Get single vault
- [x] `POST /api/vaults` - Create vault
- [x] `PUT /api/vaults/:id` - Update vault
- [x] `DELETE /api/vaults/:id` - Delete vault

---

## Not Implemented (Desktop-Only / Future)

These IPC handlers are either desktop-specific (require native dialogs) or planned for future implementation:

### File Operations (Require Native Dialogs)
- [ ] `select-vault-path` - Opens native folder picker
- [ ] `select-resume-file` - Opens native file picker
- [ ] `import-csv-select` - Opens native file picker
- [ ] `import-csv-template` - Opens native save dialog
- [ ] `optimizer-export` - Opens native save dialog
- [ ] `optimizer-export-pdf` - Opens native save dialog
- [ ] `optimizer-export-word` - Opens native save dialog
- [ ] `optimizer-save-to-vault` - Uses vault path

### Resume Processing
- [ ] `validate-file` - File validation
- [ ] `process-resume` - Resume parsing pipeline
- [ ] `get-parsed-data` - Get parsed resume data
- [ ] `save-parsed-content` - Save parsed content

### CSV Import
- [ ] `import-csv-validate` - Validate CSV file
- [ ] `import-csv-import` - Import job postings from CSV

### Optimizer
- [ ] `optimizer-get-resume-preview` - Get resume preview
- [ ] `optimizer-optimize` - Run optimization
- [ ] `optimizer-extract-file` - Extract text from file

### Opus Agent
- [ ] `agent-chat` - AI chat
- [ ] `agent-get-preferences` - Get preferences
- [ ] `agent-learn-preference` - Learn preference
- [ ] `agent-infer-skill` - Infer skill
- [ ] `agent-get-context` - Get extended context
- [ ] `agent-search-companies` - Search companies

### Job Search
- [ ] `search-jobs` - Search for jobs
- [ ] `extract-job-from-url` - Extract job from URL
- [ ] `search-agent-config` - Get/update search config

### App State
- [ ] `app-state-start-workflow` - Start workflow
- [ ] `app-state-update-workflow` - Update workflow
- [ ] `app-state-get-workflow` - Get current workflow
- [ ] `app-state-clear-workflow` - Clear workflow
- [ ] `app-state-save-page` - Save page state
- [ ] `app-state-get-page` - Get page state
- [ ] `app-state-get-continue-info` - Get continue info

---

## Route Summary

| Route Module | Endpoints | Status |
|--------------|-----------|--------|
| `/api/applications` | 6 | Complete |
| `/api/knowledge-base` | 9 | Complete |
| `/api/settings` | 6 | Complete |
| `/api/content` | 8 | Complete |
| `/api/jobs` | 5 | Complete |
| `/api/vaults` | 5 | Complete |

**Total Implemented:** 39 endpoints

---

## Usage Notes

### Authentication
Currently no authentication is implemented. For production:
- Add JWT or session-based auth middleware
- Protect all routes except `/api/health`

### Error Response Format
All routes return errors in a consistent format:
```json
{
  "error": "Short error description",
  "message": "Detailed error message"
}
```

### Success Response Format
Success responses include a `success: true` field:
```json
{
  "success": true,
  "data": { ... }
}
```

### Query Parameters
- Filters are passed as query parameters for GET requests
- Arrays are comma-separated: `?tags=skill,experience`
- Dates are ISO 8601 format: `?dateStart=2024-01-01`
