# IPC Handlers Reference

This document lists all `ipcMain.handle()` calls defined in [src/main/index.ts](../src/main/index.ts).

---

## File Validation & Resume Processing

### `validate-file`
- **Parameters:** `fileData: { path: string, name: string, size: number }`
- **Returns:** `ValidationResult` - `{ isValid: boolean, errorMessage?: string, fileSize: number, format: FileFormat }`
- **Delegates to:** Local `validateFile()` function

### `process-resume`
- **Parameters:** `fileData: { path: string, name: string }`
- **Returns:** `{ success: boolean, summary: { jobEntries: number, skills: number, education: number, certifications: number, confidence: number } }`
- **Delegates to:** `fileExtractor.extractText()`, `vaultManager.parseAndImport()`

### `get-parsed-data`
- **Parameters:** None
- **Returns:** `ParsedResume | null`
- **Delegates to:** In-memory `parsedResumeData` variable

### `save-parsed-content`
- **Parameters:** `data: ParsedResume`
- **Returns:** `{ success: boolean }`
- **Delegates to:** `vaultManager.updateObject()`, `vaultManager.updateItem()`, `vaultManager.deleteItem()`, `vaultManager.addItem()`

---

## Content Management (Vault)

### `create-manual-content`
- **Parameters:** `formData: { type: string, content: string, parentId?: string, tags?: string[], metadata?: object }`
- **Returns:** `{ success: boolean, id: string }`
- **Delegates to:** `vaultManager.createVault()`, `vaultManager.addSection()`, `vaultManager.addObject()`, `vaultManager.addItem()`

### `search-content`
- **Parameters:** `query: { contentType?: string, text?: string, tags?: string[], dateRange?: object }`
- **Returns:** `Array<{ id: string, type: string, content: string, tags: string[], metadata: object, parentId: string | null, createdAt: Date, updatedAt: Date }>`
- **Delegates to:** `vaultManager.getVault()`, `vaultManager.getAllVaults()`

### `get-content-item`
- **Parameters:** `contentItemId: string`
- **Returns:** `{ id: string, type: string, content: string, tags: string[], metadata: object, parentId: string | null, createdAt: Date, updatedAt: Date }`
- **Delegates to:** `vaultManager.getVault()`, `vaultManager.getAllVaults()`

### `update-content-item`
- **Parameters:** `formData: { id: string, type: string, content: string, tags?: string[], metadata?: object }`
- **Returns:** `{ success: boolean, id: string }`
- **Delegates to:** `vaultManager.updateObject()`, `vaultManager.updateItem()`

### `delete-content-item`
- **Parameters:** `contentItemId: string`
- **Returns:** `{ success: boolean }`
- **Delegates to:** `vaultManager.deleteObject()`, `vaultManager.deleteItem()`

### `clear-vault`
- **Parameters:** `confirmation: string` (must be `'delete'`)
- **Returns:** `{ success: boolean, deletedCount?: number, error?: string }`
- **Delegates to:** `vaultManager.getAllVaults()`, `vaultManager.deleteVault()`

---

## Obsidian Vault Path

### `select-vault-path`
- **Parameters:** None (opens native dialog)
- **Returns:** `{ success: boolean, path?: string }`
- **Delegates to:** `dialog.showOpenDialog()`, `obsidianClient.setVaultRootPath()`

### `get-vault-path`
- **Parameters:** None
- **Returns:** `string | null`
- **Delegates to:** `obsidianClient.getVaultRootPath()`

### `select-resume-file`
- **Parameters:** None (opens native dialog)
- **Returns:** `{ success: boolean, canceled?: boolean, path?: string, name?: string, size?: number }`
- **Delegates to:** `dialog.showOpenDialog()`, `fs.statSync()`

---

## Settings

### `get-settings`
- **Parameters:** None
- **Returns:** `object` (masked settings with API keys obscured)
- **Delegates to:** `settingsStore.getMasked()`

### `save-settings`
- **Parameters:** `newSettings: { llmProvider?: 'anthropic' | 'openai', anthropicApiKey?: string, openaiApiKey?: string, defaultModel?: string, jsearchApiKey?: string, adzunaAppId?: string, adzunaApiKey?: string }`
- **Returns:** `{ success: boolean }`
- **Delegates to:** `settingsStore.set()`

### `validate-api-key`
- **Parameters:** `{ provider: 'anthropic' | 'openai', apiKey: string }`
- **Returns:** `{ valid: boolean, error?: string }`
- **Delegates to:** `LLMClient` (temporary instance for validation)

### `check-api-key-configured`
- **Parameters:** None
- **Returns:** `{ configured: boolean, provider: 'anthropic' | 'openai' }`
- **Delegates to:** `settingsStore.hasValidKey()`, `settingsStore.getProvider()`

---

## Job Queue

### `job-queue-add`
- **Parameters:** `jobData: { sourceUrl: string, company: string, title: string, description?: string, requirements?: string[], responsibilities?: string[], preferredQualifications?: string[], priority?: number }`
- **Returns:** `{ success: boolean, job: QueuedJob }`
- **Delegates to:** `jobQueue.initialize()`, `jobQueue.enqueue()`

### `job-queue-status`
- **Parameters:** None
- **Returns:** `{ pendingJobs: number, ... }` (queue status)
- **Delegates to:** `jobQueue.initialize()`, `jobQueue.getStatus()`

### `job-queue-list`
- **Parameters:** None
- **Returns:** `Array<QueuedJob>`
- **Delegates to:** `jobQueue.initialize()`, `jobQueue.getQueue()`

### `job-queue-remove`
- **Parameters:** `jobId: string`
- **Returns:** `{ success: boolean }`
- **Delegates to:** `jobQueue.initialize()`, `jobQueue.removeJob()`

### `job-queue-clear-finished`
- **Parameters:** None
- **Returns:** `{ success: boolean, removed: number }`
- **Delegates to:** `jobQueue.initialize()`, `jobQueue.clearFinished()`

### `job-queue-process-next`
- **Parameters:** None
- **Returns:** `{ success: boolean, job?: object, result?: object, error?: string, message?: string }`
- **Delegates to:** `settingsStore.hasValidKey()`, `jobQueue.dequeue()`, `queueProcessor.processJob()`, `jobQueue.completeJob()`, `opusAgent.afterOptimization()`

### `job-queue-process-all`
- **Parameters:** None
- **Returns:** `{ success: boolean, results: Array<object>, summary: { processed: number, succeeded: number, failed: number, averageScore?: number }, error?: string, message?: string }`
- **Delegates to:** `settingsStore.hasValidKey()`, `jobQueue.dequeue()`, `queueProcessor.processJob()`, `jobQueue.completeJob()`, `opusAgent.afterOptimization()`

### `job-queue-get-result`
- **Parameters:** `jobId: string`
- **Returns:** `{ success: boolean, job?: object, result?: object, error?: string }`
- **Delegates to:** `jobQueue.initialize()`, `jobQueue.getJob()`

---

## CSV Import

### `import-csv-select`
- **Parameters:** None (opens native dialog)
- **Returns:** `{ success: boolean, canceled?: boolean, path?: string }`
- **Delegates to:** `dialog.showOpenDialog()`

### `import-csv-validate`
- **Parameters:** `filePath: string`
- **Returns:** `{ valid: boolean, errors: string[], rowCount: number }`
- **Delegates to:** `csvImporter.validateCSV()`

### `import-csv-import`
- **Parameters:** `filePath: string`
- **Returns:** Import result object
- **Delegates to:** `jobQueue.initialize()`, `csvImporter.importJobPostings()`

### `import-csv-template`
- **Parameters:** None (opens save dialog)
- **Returns:** `{ success: boolean, canceled?: boolean, path?: string }`
- **Delegates to:** `dialog.showSaveDialog()`, `fs.writeFileSync()`

---

## Opus Agent (AI Chat & Preferences)

### `agent-chat`
- **Parameters:** `message: string`
- **Returns:** `{ message: string, confidence: number }`
- **Delegates to:** `opusAgent.initialize()`, `opusAgent.chat()`

### `agent-get-preferences`
- **Parameters:** `type?: string`
- **Returns:** `Array<Preference>`
- **Delegates to:** `opusAgent.initialize()`, `opusAgent.getPreferences()`

### `agent-learn-preference`
- **Parameters:** `preference: { type: string, value: string, sentiment: string, weight: number, learnedFrom: string, confidence: number, id?: string }`
- **Returns:** `{ success: boolean }`
- **Delegates to:** `opusAgent.initialize()`, `opusAgent.learnPreference()`

### `agent-infer-skill`
- **Parameters:** `{ skill: string, source: string, proficiency: string }`
- **Returns:** `{ success: boolean, contentId?: string, error?: string }`
- **Delegates to:** `vaultManager.getVault()`, `vaultManager.createVault()`, `vaultManager.addSection()`, `vaultManager.addObject()`, `vaultManager.addItem()`, `opusAgent.learnPreference()`

### `agent-get-context`
- **Parameters:** None
- **Returns:** `{ success: boolean, context?: object, preferences?: Array<Preference>, stats?: object, error?: string }`
- **Delegates to:** `opusAgent.initialize()`, `opusAgent.getExtendedContext()`, `opusAgent.getPreferences()`

### `agent-search-companies`
- **Parameters:** `criteria?: object`
- **Returns:** `{ success: boolean, companies: Array<object>, stats: object, error?: string }`
- **Delegates to:** `opusAgent.initialize()`, `opusAgent.searchCompanies()`

---

## Job Search Agent

### `search-jobs`
- **Parameters:** `criteria: object`
- **Returns:** `{ success: boolean, results: Array<object>, error?: string }`
- **Delegates to:** `jobSearchAgent.searchJobs()`

### `extract-job-from-url`
- **Parameters:** `url: string, content?: string`
- **Returns:** `{ success: boolean, job?: object, message?: string }`
- **Delegates to:** `jobSearchAgent.extractJobFromUrl()`, `fetchWithBrowser()` (Playwright fallback)

### `search-agent-config`
- **Parameters:** `config?: object` (optional, to update config)
- **Returns:** Current config object
- **Delegates to:** `jobSearchAgent.updateConfig()`, `jobSearchAgent.getConfig()`

---

## ATS Optimizer

### `optimizer-get-resume-preview`
- **Parameters:** None
- **Returns:** `{ success: boolean, content?: string, metadata?: { jobEntries: number, accomplishments: number, skills: number, education: number, certifications: number }, error?: string }`
- **Delegates to:** `vaultManager.getVault()`, `vaultManager.getAllVaults()`

### `optimizer-optimize`
- **Parameters:** `{ jobPosting: JobPosting, resume: Resume }`
- **Returns:** `{ success: boolean, data?: OptimizationResult, error?: string }`
- **Delegates to:** `settingsStore.hasValidKey()`, `LLMClient`, `holisticOptimize()` from `../ats-agent/holistic/orchestrator`

### `optimizer-extract-file`
- **Parameters:** `{ path: string, name: string }`
- **Returns:** `{ success: boolean, content?: string, error?: string }`
- **Delegates to:** `fileExtractor.extractText()`

### `optimizer-export`
- **Parameters:** `{ content: string, format: string, filename?: string }`
- **Returns:** `{ success: boolean, canceled?: boolean, path?: string, error?: string }`
- **Delegates to:** `dialog.showSaveDialog()`, `fs.writeFileSync()`

### `optimizer-export-pdf`
- **Parameters:** `{ content: string, filename?: string }`
- **Returns:** `{ success: boolean, canceled?: boolean, path?: string, error?: string }`
- **Delegates to:** `dialog.showSaveDialog()`, `PDFDocument` (pdfkit)

### `optimizer-export-word`
- **Parameters:** `{ content: string, filename?: string }`
- **Returns:** `{ success: boolean, canceled?: boolean, path?: string, error?: string }`
- **Delegates to:** `dialog.showSaveDialog()`, `Document`, `Packer` (docx)

### `get-optimization-result`
- **Parameters:** `jobId: string`
- **Returns:** `{ success: boolean, job?: object, result?: object, error?: string }`
- **Delegates to:** `jobQueue.initialize()`, `jobQueue.getJob()`

### `optimizer-save-to-vault`
- **Parameters:** `{ content: string, jobTitle?: string, company?: string }`
- **Returns:** `{ success: boolean, path?: string, error?: string }`
- **Delegates to:** `obsidianClient.getVaultRootPath()`, `fs.mkdirSync()`, `fs.writeFileSync()`

---

## App State (Workflow Persistence)

### `app-state-start-workflow`
- **Parameters:** `{ type: string, currentPage: string, initialData?: object }`
- **Returns:** `{ success: boolean, workflow?: object, error?: string }`
- **Delegates to:** `appStateStore.startWorkflow()`

### `app-state-update-workflow`
- **Parameters:** `updates: object`
- **Returns:** `{ success: boolean, workflow?: object, error?: string }`
- **Delegates to:** `appStateStore.updateWorkflow()`

### `app-state-get-workflow`
- **Parameters:** None
- **Returns:** `{ success: boolean, workflow?: object, error?: string }`
- **Delegates to:** `appStateStore.getWorkflow()`

### `app-state-clear-workflow`
- **Parameters:** None
- **Returns:** `{ success: boolean, error?: string }`
- **Delegates to:** `appStateStore.clearWorkflow()`

### `app-state-save-page`
- **Parameters:** `{ page: string, data: object }`
- **Returns:** `{ success: boolean, pageState?: object, error?: string }`
- **Delegates to:** `appStateStore.savePageState()`

### `app-state-get-page`
- **Parameters:** `page: string`
- **Returns:** `{ success: boolean, pageState?: object, error?: string }`
- **Delegates to:** `appStateStore.getPageState()`

### `app-state-get-continue-info`
- **Parameters:** None
- **Returns:** `{ success: boolean, ... (continue info), error?: string }`
- **Delegates to:** `appStateStore.getContinueInfo()`

---

## Applications (Saved Resume Storage)

### `applications-list`
- **Parameters:** `statusFilter?: ApplicationStatus`
- **Returns:** `{ success: boolean, applications: Array<Application>, stats: object, error?: string }`
- **Delegates to:** `applicationsStore.list()`, `applicationsStore.getStats()`

### `applications-get`
- **Parameters:** `id: string`
- **Returns:** `{ success: boolean, application?: Application, error?: string }`
- **Delegates to:** `applicationsStore.get()`

### `applications-save`
- **Parameters:** `data: { jobTitle: string, company: string, jobDescription: string, generatedResume: string, score: number, sourceUrl?: string, metadata: { iterations: number, initialScore: number } }`
- **Returns:** `{ success: boolean, application?: Application, error?: string }`
- **Delegates to:** `applicationsStore.save()`

### `applications-update`
- **Parameters:** `{ id: string, updates: { status?: ApplicationStatus, notes?: string } }`
- **Returns:** `{ success: boolean, application?: Application, error?: string }`
- **Delegates to:** `applicationsStore.update()`

### `applications-delete`
- **Parameters:** `id: string`
- **Returns:** `{ success: boolean, error?: string }`
- **Delegates to:** `applicationsStore.delete()`

---

## Knowledge Base

### `knowledge-base-list`
- **Parameters:** `filters?: KnowledgeBaseFilters`
- **Returns:** `{ success: boolean, entries: Array<KnowledgeBaseEntry>, error?: string }`
- **Delegates to:** `knowledgeBaseStore.list()`

### `knowledge-base-get`
- **Parameters:** `id: string`
- **Returns:** `{ success: boolean, entry?: KnowledgeBaseEntry, error?: string }`
- **Delegates to:** `knowledgeBaseStore.get()`

### `knowledge-base-save`
- **Parameters:** `data: Omit<KnowledgeBaseEntry, 'id' | 'createdAt'>`
- **Returns:** `{ success: boolean, entry?: KnowledgeBaseEntry, error?: string }`
- **Delegates to:** `knowledgeBaseStore.save()`

### `knowledge-base-update`
- **Parameters:** `{ id: string, updates: { notes?: string, tags?: string[], optimizedResume?: string } }`
- **Returns:** `{ success: boolean, entry?: KnowledgeBaseEntry, error?: string }`
- **Delegates to:** `knowledgeBaseStore.update()`

### `knowledge-base-delete`
- **Parameters:** `id: string`
- **Returns:** `{ success: boolean, error?: string }`
- **Delegates to:** `knowledgeBaseStore.delete()`

### `knowledge-base-stats`
- **Parameters:** None
- **Returns:** `{ success: boolean, stats?: object, error?: string }`
- **Delegates to:** `knowledgeBaseStore.getStats()`

### `knowledge-base-companies`
- **Parameters:** None
- **Returns:** `{ success: boolean, companies?: Array<string>, error?: string }`
- **Delegates to:** `knowledgeBaseStore.getCompanies()`

### `knowledge-base-job-titles`
- **Parameters:** None
- **Returns:** `{ success: boolean, jobTitles?: Array<string>, error?: string }`
- **Delegates to:** `knowledgeBaseStore.getJobTitles()`

### `knowledge-base-export`
- **Parameters:** `{ id: string, format: 'pdf' | 'docx' | 'md' }`
- **Returns:** `{ success: boolean, canceled?: boolean, path?: string, error?: string }`
- **Delegates to:** `knowledgeBaseStore.get()`, `dialog.showSaveDialog()`, `PDFDocument`, `Document`/`Packer` (docx), `fs.writeFileSync()`

---

## Module Dependencies Summary

| Module | Import Path | Handlers Using It |
|--------|-------------|-------------------|
| `vaultManager` | `./vaultManager` | Content management, resume processing |
| `fileExtractor` | `./fileExtractor` | `process-resume`, `optimizer-extract-file` |
| `obsidianClient` | `./obsidianClient` | Vault path handlers, `optimizer-save-to-vault` |
| `jobQueue` | `./jobQueue` | All `job-queue-*` handlers |
| `csvImporter` | `./csvImporter` | All `import-csv-*` handlers |
| `queueProcessor` | `./queueProcessor` | `job-queue-process-next`, `job-queue-process-all` |
| `settingsStore` | `./settingsStore` | Settings handlers, API key validation |
| `appStateStore` | `./appStateStore` | All `app-state-*` handlers |
| `applicationsStore` | `./applicationsStore` | All `applications-*` handlers |
| `knowledgeBaseStore` | `./knowledgeBaseStore` | All `knowledge-base-*` handlers |
| `opusAgent` | `../agents` | Agent handlers, queue processing |
| `jobSearchAgent` | `../agents` | Job search handlers |
| `holisticOptimize` | `../ats-agent/holistic/orchestrator` | `optimizer-optimize` |
| `LLMClient` | `../shared/llm/client` | `validate-api-key`, `optimizer-optimize` |
