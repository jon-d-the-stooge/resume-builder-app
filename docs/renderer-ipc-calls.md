# Renderer IPC Calls Reference

This document lists all `ipcRenderer.invoke()` calls in the renderer process, organized by file.

---

## app.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `check-api-key-configured` | 76 | Startup check to verify API key is configured |
| `app-state-get-continue-info` | 97 | Check for resumable workflow on app load |
| `app-state-clear-workflow` | 135 | Clear workflow when user starts fresh |
| `get-vault-path` | 168 | Get configured Obsidian vault path |
| `optimizer-get-resume-preview` | 181 | Load resume preview for main dashboard |
| `select-vault-path` | 216 | Open dialog to select Obsidian vault |
| `job-queue-status` | 237 | Get queue status for dashboard display |
| `job-queue-list` | 238, 313 | Get list of queued jobs for dashboard |
| `knowledge-base-stats` | 376 | Get knowledge base statistics for dashboard |
| `select-resume-file` | 417 | Open file dialog for resume import |
| `process-resume` | 424 | Parse and import selected resume file |
| `extract-job-from-url` | 470 | Extract job posting from URL input |
| `job-queue-process-all` | 527 | Process all jobs in queue |

---

## optimizer.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `optimizer-get-resume-preview` | 160 | Load current resume content for optimization |
| `select-resume-file` | 182 | Select alternative resume file |
| `optimizer-extract-file` | 194, 214 | Extract text content from resume file |
| `optimizer-optimize` | 287 | Run ATS optimization on resume |
| `job-queue-add` | 331 | Add job to queue from optimizer |
| `job-queue-status` | 361 | Get queue status for optimizer panel |
| `job-queue-list` | 362 | Get jobs list for optimizer panel |
| `job-queue-process-all` | 519 | Process all queued jobs |
| `job-queue-remove` | 549 | Remove specific job from queue |
| `job-queue-clear-finished` | 558 | Clear completed jobs from queue |
| `optimizer-export-pdf` | 889 | Export optimized resume as PDF |
| `optimizer-export-word` | 894 | Export optimized resume as Word document |
| `optimizer-export` | 900 | Export optimized resume (generic format) |
| `optimizer-save-to-vault` | 926 | Save optimized resume to Obsidian vault |
| `app-state-save-page` | 1043 | Persist optimizer page state |
| `app-state-update-workflow` | 1050 | Update workflow progress |
| `app-state-get-page` | 1098 | Restore optimizer page state |
| `app-state-start-workflow` | 1134 | Initialize new optimization workflow |
| `applications-save` | 1152 | Save completed application to storage |
| `app-state-clear-workflow` | 1168 | Clear workflow after completion |
| `knowledge-base-save` | 1237 | Save optimization result to knowledge base |

---

## chat.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `agent-get-preferences` | 52, 92 | Load user skill/agent preferences |
| `search-content` | 57 | Search vault for skills |
| `agent-infer-skill` | 151, 726 | Infer and save skill from conversation |
| `create-manual-content` | 175, 197 | Create vault content from chat |
| `agent-learn-preference` | 217 | Teach agent user preference |
| `search-jobs` | 243 | Search for jobs from chat interface |
| `job-queue-add` | 478 | Add job to queue from chat |
| `agent-chat` | 528 | Send message to Opus agent |
| `app-state-save-page` | 794 | Persist chat page state |
| `app-state-get-page` | 833 | Restore chat page state |

---

## queue.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `job-queue-status` | 57 | Get current queue status |
| `job-queue-list` | 58 | Get list of all queued jobs |
| `job-queue-process-all` | 200 | Process all pending jobs |
| `job-queue-remove` | 228 | Remove specific job from queue |
| `job-queue-clear-finished` | 237 | Clear completed/failed jobs |
| `job-queue-add` | 272 | Add new job to queue |
| `import-csv-select` | 289 | Open dialog to select CSV file |
| `import-csv-validate` | 292 | Validate selected CSV file |
| `import-csv-import` | 298 | Import jobs from CSV file |
| `app-state-save-page` | 347 | Persist queue page state |

---

## job-search.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `app-state-save-page` | 72 | Persist job search page state |
| `app-state-get-page` | 89 | Restore job search page state |
| `search-jobs` | 187 | Search for jobs via API |
| `extract-job-from-url` | 221, 420, 503 | Extract job details from URL |
| `job-queue-add` | 454 | Add selected job to queue |

---

## knowledge-base.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `knowledge-base-stats` | 106 | Get knowledge base statistics |
| `knowledge-base-companies` | 120 | Get list of companies in knowledge base |
| `knowledge-base-job-titles` | 137 | Get list of job titles in knowledge base |
| `knowledge-base-list` | 154 | List knowledge base entries with filters |
| `knowledge-base-get` | 249 | Get specific knowledge base entry |
| `knowledge-base-update` | 463 | Update knowledge base entry |
| `knowledge-base-delete` | 499 | Delete knowledge base entry |
| `knowledge-base-export` | 521 | Export entry as PDF/Word/Markdown |

---

## applications.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `applications-list` | 100 | List saved applications with optional filter |
| `applications-get` | 292, 386 | Get specific application details |
| `applications-update` | 338 | Update application status/notes |
| `applications-delete` | 364 | Delete saved application |

---

## vault.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `search-content` | 38 | Search vault content by type |
| `delete-content-item` | 272 | Delete item from vault |
| `select-resume-file` | 282 | Open dialog to select resume file |
| `process-resume` | 288 | Parse and import resume to vault |
| `clear-vault` | 377 | Delete all vault content |

---

## settings.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `validate-api-key` | 104 | Validate API key before saving |
| `get-settings` | 123 | Load current settings |
| `save-settings` | 223 | Save updated settings |

---

## review.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `get-parsed-data` | 27 | Get parsed resume data for review |
| `save-parsed-content` | 364 | Save reviewed/edited resume content |

---

## edit.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `get-content-item` | 61 | Load content item for editing |
| `update-content-item` | 374 | Save edited content item |

---

## manual-entry.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `create-manual-content` | 278 | Create new vault content manually |

---

## search.js

| Handler Name | Line | Context |
|-------------|------|---------|
| `search-content` | 129 | Search vault content |

---

## Handler Usage Summary

| Handler Name | Call Count | Files Using It |
|-------------|------------|----------------|
| `job-queue-list` | 5 | app.js, optimizer.js, queue.js |
| `job-queue-add` | 4 | chat.js, optimizer.js, queue.js, job-search.js |
| `job-queue-status` | 3 | app.js, optimizer.js, queue.js |
| `job-queue-process-all` | 3 | app.js, optimizer.js, queue.js |
| `extract-job-from-url` | 4 | app.js, job-search.js |
| `app-state-save-page` | 4 | chat.js, optimizer.js, queue.js, job-search.js |
| `app-state-get-page` | 3 | chat.js, optimizer.js, job-search.js |
| `search-content` | 3 | chat.js, vault.js, search.js |
| `select-resume-file` | 3 | app.js, optimizer.js, vault.js |
| `process-resume` | 2 | app.js, vault.js |
| `optimizer-get-resume-preview` | 2 | app.js, optimizer.js |
| `job-queue-remove` | 2 | optimizer.js, queue.js |
| `job-queue-clear-finished` | 2 | optimizer.js, queue.js |
| `agent-get-preferences` | 2 | chat.js |
| `agent-infer-skill` | 2 | chat.js |
| `create-manual-content` | 3 | chat.js, manual-entry.js |
| `applications-get` | 2 | applications.js |
| `optimizer-extract-file` | 2 | optimizer.js |
| `app-state-clear-workflow` | 2 | app.js, optimizer.js |
| `knowledge-base-stats` | 2 | app.js, knowledge-base.js |

---

## Cross-Reference: Handler Definitions

All handlers are defined in [src/main/index.ts](../src/main/index.ts). See [ipc-handlers.md](./ipc-handlers.md) for detailed handler documentation including parameters, return types, and delegate functions.
