# Renderer IPC Migration Status

This document tracks the migration from Electron's `ipcRenderer` to the web-compatible `ipcAdapter`.

## Migration Progress

| File | IPC Calls | Status | Issues |
|------|-----------|--------|--------|
| search.js | 1 | ✅ Complete | None |
| manual-entry.js | 1 | ✅ Complete | None |
| edit.js | 2 | ✅ Complete | None |
| review.js | 2 | ✅ Complete | None |
| settings.js | 3 | ✅ Complete | None |
| applications.js | 4 | ✅ Complete | None |
| vault.js | 5 | ✅ Complete | None |
| job-search.js | 5 | ✅ Complete | None |
| knowledge-base.js | 8 | ✅ Complete | None |
| queue.js | 9 | ✅ Complete | None |
| chat.js | 10 | ✅ Complete | Replaced `shell.openExternal` with `window.open` |
| app.js | 13 | ✅ Complete | None |
| optimizer.js | 21 | ✅ Complete | None |

## Summary

- **Total Files**: 13
- **Completed**: 13
- **In Progress**: 0
- **Pending**: 0
- **Blocked**: 0

## Migration Notes

### All Files
- Import changed from `require('electron')` to `require('./api/ipcAdapter')`
- No functional changes to IPC call patterns

### chat.js (Special Handling)
- Two `require('electron').shell.openExternal(url)` calls replaced with `window.open(url, '_blank', 'noopener,noreferrer')`
- This is the web-compatible alternative for opening external links

## IPC Adapter Coverage

The `ipcAdapter.ts` routes the following channels to API client methods:

### Fully Implemented
- `vault:*` → `api.vaults.*`
- `search-content` → `api.content.search`
- `create-manual-content` → `api.content.create`
- `get-content-item` → `api.content.get`
- `update-content-item` → `api.content.update`
- `delete-content-item` → `api.content.delete`
- `clear-vault` → `api.content.clearVault`
- `get-settings` → `api.settings.get`
- `save-settings` → `api.settings.update`
- `validate-api-key` → `api.settings.validateApiKey`
- `check-api-key-configured` → `api.settings.checkApiKeyStatus`
- `job-queue-*` → `api.jobs.*`
- `applications-*` → `api.applications.*`
- `knowledge-base-*` → `api.knowledgeBase.*`

### Web Alternatives Provided
- `select-resume-file` → Use HTML `<input type="file">`
- `select-vault-path` → N/A (Electron-only)
- `optimizer-export-pdf` → Use server-side PDF generation
- `optimizer-export-word` → Use server-side DOCX generation

### Not Yet Implemented (Server Endpoints Needed)
- `agent-chat`
- `agent-get-preferences`
- `agent-learn-preference`
- `agent-infer-skill`
- `agent-get-context`
- `agent-search-companies`
- `search-jobs`
- `extract-job-from-url`
- `search-agent-config`
- `app-state-*` (use React state/context instead)

---

*Last updated: 2026-01-27*
