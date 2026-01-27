# User Scoping Plan

This document outlines the changes needed to add per-user data isolation across all service modules. Currently, the application uses global state and shared storage, which means all users share the same vaults, applications, knowledge base entries, and settings.

## Current Architecture Issues

### Global State Problem

The current implementation has several global state patterns:

1. **vaultManager** - `private vaults: Map<string, Vault>` is a class-level map shared across all requests
2. **applicationsStore** - Reads/writes to a shared `Applications/` folder
3. **knowledgeBaseStore** - Reads/writes to a shared `KnowledgeBase/` folder
4. **settingsStore** - Uses a single `data/settings.json` file with module-level `let settings: Settings`

### Authentication Context

The authentication middleware ([auth.ts](../src/backend/middleware/auth.ts):82-91) already extracts user information and attaches it to `req.user`:

```typescript
interface User {
  id: string;    // Auth0 'sub' claim
  email: string;
}
```

However, routes currently **do not pass this user context** to service modules.

---

## Service-by-Service Analysis

### 1. vaultManager (`src/main/vaultManager.ts`)

#### Current State
- **Data Structure**: `private vaults: Map<string, Vault>` (line 78)
- **Persistence**: Stores to `resume-vaults/${vault.id}.json` (line 721)
- **Issue**: All vaults visible to all users

#### Functions Needing userId Parameter

| Function | Line | Change Description |
|----------|------|-------------------|
| `createVault` | 94 | Add `userId` parameter, store in vault metadata |
| `getVault` | 131 | Add `userId` parameter, filter by owner |
| `getAllVaults` | 149 | Add `userId` parameter, return only user's vaults |
| `updateVaultProfile` | 158 | Add `userId` parameter, verify ownership |
| `deleteVault` | 186 | Add `userId` parameter, verify ownership |
| `addSection` | 206 | Add `userId` for ownership verification |
| `getSection` | 250 | Add `userId` for ownership verification |
| `getSectionsByType` | 260 | Add `userId` for ownership verification |
| `updateSection` | 270 | Add `userId` for ownership verification |
| `deleteSection` | 305 | Add `userId` for ownership verification |
| `addObject` | 338 | Add `userId` for ownership verification |
| `getObject` | 371 | Add `userId` for ownership verification |
| `updateObject` | 388 | Add `userId` for ownership verification |
| `deleteObject` | 428 | Add `userId` for ownership verification |
| `addItem` | 465 | Add `userId` for ownership verification |
| `getItem` | 509 | Add `userId` for ownership verification |
| `updateItem` | 528 | Add `userId` for ownership verification |
| `deleteItem` | 567 | Add `userId` for ownership verification |
| `queryVault` | 606 | Add `userId` for ownership verification |
| `getExperienceObjects` | 657 | Add `userId` for ownership verification |
| `getAllItems` | 677 | Add `userId` for ownership verification |
| `parseAndImport` | 701 | Add `userId`, set owner on imported vault |

#### Data Structure Changes

```typescript
// In src/types/vault.ts - Add to VaultMetadata interface
interface VaultMetadata {
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  ownerId: string;  // NEW: User who owns this vault
}

// In vaultManager.ts - Change Map key strategy
private vaults: Map<string, Vault> = new Map();
// Consider: Map<`${userId}:${vaultId}`, Vault> for compound keys
// Or filter by ownerId on access
```

#### Persistence Changes

- Option A: Store in `resume-vaults/${userId}/${vault.id}.json` (folder per user)
- Option B: Store in `resume-vaults/${vault.id}.json` with `ownerId` in metadata (filter on load)

**Recommended**: Option B - simpler, allows admin views across users

---

### 2. applicationsStore (`src/main/applicationsStore.ts`)

#### Current State
- **Data Structure**: Files in `Applications/` folder (line 62)
- **Persistence**: Markdown files with YAML frontmatter
- **Issue**: All applications visible to all users

#### Functions Needing userId Parameter

| Function | Line | Change Description |
|----------|------|-------------------|
| `list` | 237 | Add `userId`, filter by owner |
| `get` | 272 | Add `userId`, verify ownership |
| `save` | 296 | Add `userId`, store in frontmatter |
| `update` | 347 | Add `userId`, verify ownership |
| `delete` | 387 | Add `userId`, verify ownership |
| `getStats` | 413 | Add `userId`, calculate only user's stats |

#### Data Structure Changes

```typescript
// Add to Application interface (line 35)
interface Application {
  id: string;
  userId: string;  // NEW: Owner of this application
  // ... existing fields
}

// Add to ApplicationSummary interface (line 49)
interface ApplicationSummary {
  id: string;
  userId: string;  // NEW: For client-side filtering
  // ... existing fields
}
```

#### Frontmatter Changes

```yaml
---
type: application
id: app-123
user_id: auth0|abc123  # NEW: Owner identifier
job_title: "Software Engineer"
# ... existing fields
---
```

#### Storage Strategy Options

- Option A: `Applications/${userId}/` folder per user
- Option B: `Applications/` shared folder, filter by `user_id` in frontmatter

**Recommended**: Option B - maintains simpler structure, backward compatible

---

### 3. knowledgeBaseStore (`src/main/knowledgeBaseStore.ts`)

#### Current State
- **Data Structure**: Files in `KnowledgeBase/` folder (line 198)
- **Persistence**: Markdown files with YAML frontmatter
- **Issue**: All entries visible to all users

#### Functions Needing userId Parameter

| Function | Line | Change Description |
|----------|------|-------------------|
| `list` | 564 | Add `userId`, filter by owner |
| `get` | 649 | Add `userId`, verify ownership |
| `save` | 674 | Add `userId`, store in frontmatter |
| `update` | 715 | Add `userId`, verify ownership |
| `delete` | 761 | Add `userId`, verify ownership |
| `getStats` | 789 | Add `userId`, calculate only user's stats |
| `getCompanies` | 833 | Add `userId`, return only user's companies |
| `getJobTitles` | 855 | Add `userId`, return only user's job titles |

#### Data Structure Changes

```typescript
// Add to KnowledgeBaseEntry interface (line 37)
interface KnowledgeBaseEntry {
  id: string;
  userId: string;  // NEW: Owner of this entry
  // ... existing fields
}

// Add to KnowledgeBaseSummary interface (line 65)
interface KnowledgeBaseSummary {
  id: string;
  userId: string;  // NEW
  // ... existing fields
}
```

#### Frontmatter Changes

```yaml
---
type: knowledge-base-entry
id: kb-123
user_id: auth0|abc123  # NEW: Owner identifier
job_title: "Software Engineer"
# ... existing fields
---
```

---

### 4. settingsStore (`src/main/settingsStore/`)

#### Current State
- **Data Structure**: Module-level `let settings: Settings` (web.ts line 17)
- **Persistence**: Single `data/settings.json` file (web.ts line 15)
- **Issue**: All users share same API keys and settings

#### Critical Security Issue

Settings contain sensitive API keys:
- `anthropicApiKey`
- `openaiApiKey`
- `adzunaAppId` / `adzunaApiKey`
- `jsearchApiKey`

**These MUST be isolated per-user.**

#### Interface Changes

The `SettingsStore` interface needs userId-aware methods:

```typescript
// Current (src/main/settingsStore/types.ts)
interface SettingsStore {
  get: () => Settings;
  set: (settings: Partial<Settings>) => void;
  // ...
}

// Proposed
interface SettingsStore {
  get: (userId: string) => Settings;
  set: (userId: string, settings: Partial<Settings>) => void;
  getApiKey: (userId: string) => string;
  getProvider: (userId: string) => LLMProvider;
  getAdzunaCredentials: (userId: string) => { appId: string; apiKey: string } | null;
  getJSearchApiKey: (userId: string) => string | null;
  getMaxIterations: (userId: string) => number;
  getMasked: (userId: string) => MaskedSettings;
  hasValidKey: (userId: string) => boolean;
  clear: (userId: string) => void;
  // ...
}
```

#### Storage Strategy Options

- Option A: `data/settings-${userId}.json` file per user
- Option B: Single SQLite database with user_id column
- Option C: Use the existing `usage.db` SQLite database, add settings table

**Recommended**: Option A for simplicity, or Option C if already using SQLite for other per-user data

---

## Recommended Implementation Approach

### Option 1: Parameter Injection (Recommended)

Pass `userId` as the first parameter to all service methods.

**Pros:**
- Explicit, clear data flow
- Easy to audit which calls have user context
- Works with current singleton pattern
- Backward compatible (can add userId as optional initially)

**Cons:**
- Requires updating all call sites
- Verbose function signatures

**Example:**
```typescript
// vaultManager.ts
async getAllVaults(userId: string): Promise<Vault[]> {
  await this.loadAllVaultsFromObsidian();
  return Array.from(this.vaults.values())
    .filter(v => v.metadata.ownerId === userId);
}

// routes/vaults.ts
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;  // From auth middleware
  const vaults = await vaultManager.getAllVaults(userId);
  res.json(vaults);
});
```

### Option 2: Context Object Pattern

Create a request context that includes user information.

**Pros:**
- Cleaner function signatures
- Can include additional context (request ID, tenant, etc.)
- Easier to extend in future

**Cons:**
- Requires refactoring all services
- Adds indirection
- Need AsyncLocalStorage or similar for async context propagation

**Example:**
```typescript
// context.ts
interface RequestContext {
  userId: string;
  email: string;
  requestId?: string;
}

// Using AsyncLocalStorage
const contextStorage = new AsyncLocalStorage<RequestContext>();

// middleware
app.use((req, res, next) => {
  contextStorage.run({ userId: req.user!.id, email: req.user!.email }, next);
});

// vaultManager.ts
async getAllVaults(): Promise<Vault[]> {
  const ctx = contextStorage.getStore();
  if (!ctx) throw new Error('No context');
  return Array.from(this.vaults.values())
    .filter(v => v.metadata.ownerId === ctx.userId);
}
```

### Recommended: Hybrid Approach

1. **Use Parameter Injection** for clarity and auditability
2. **Create helper types** for consistent patterns
3. **Add userId field** to all data structures
4. **Filter on access** rather than isolating storage

---

## Route Changes Required

### vaults.ts

```typescript
// Every route handler needs to extract and pass userId
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;  // Already available from auth middleware
  const vaults = await vaultManager.getAllVaults(userId);
  res.json(vaults);
});

router.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const vault = await vaultManager.createVault(userId, req.body);
  res.status(201).json(vault);
});
```

### applications.ts

```typescript
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const applications = applicationsStore.list(userId, statusFilter);
  const stats = applicationsStore.getStats(userId);
  res.json({ success: true, applications, stats });
});
```

### knowledgeBase.ts

```typescript
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const entries = knowledgeBaseStore.list(userId, filters);
  res.json({ success: true, entries });
});
```

### settings.ts

```typescript
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const maskedSettings = settingsStore.getMasked(userId);
  res.json({ success: true, settings: maskedSettings });
});
```

---

## Migration Strategy

### Phase 1: Add userId Fields (Non-Breaking)

1. Add `ownerId`/`userId` fields to data structures as optional
2. Update save/create operations to set userId from authenticated user
3. Keep existing read operations working for backward compatibility

### Phase 2: Filter on Read

1. Update all read operations to filter by userId
2. Add ownership verification to update/delete operations
3. Return 404 (not 403) for non-owned resources to prevent enumeration

### Phase 3: Migration Script

1. Create script to backfill existing data with default user
2. Run migration for existing deployments
3. Make userId fields required

### Phase 4: Remove Global State

1. Convert VaultManager to use per-user caching
2. Update settings store to use per-user storage
3. Audit for any remaining global state

---

## Security Considerations

1. **Authorization vs Authentication**: Auth middleware handles authentication; services must handle authorization (ownership checks)

2. **Resource Enumeration**: Return 404 instead of 403 for non-owned resources to prevent attackers from discovering valid IDs

3. **Admin Access**: Consider adding admin role check for cross-user access (future feature)

4. **API Key Storage**: User API keys should be encrypted at rest (current implementation uses plain JSON)

5. **Audit Logging**: Consider logging access to sensitive operations with userId

---

## Files to Modify

### Core Service Files
- `src/main/vaultManager.ts` - Add userId to all public methods
- `src/main/applicationsStore.ts` - Add userId to all methods
- `src/main/knowledgeBaseStore.ts` - Add userId to all methods
- `src/main/settingsStore/types.ts` - Update interface with userId
- `src/main/settingsStore/web.ts` - Implement per-user storage
- `src/main/settingsStore/electron.ts` - Implement per-user storage

### Type Definition Files
- `src/types/vault.ts` - Add `ownerId` to `VaultMetadata`
- Types in applicationsStore.ts - Add `userId` field
- Types in knowledgeBaseStore.ts - Add `userId` field

### Route Files
- `src/backend/routes/vaults.ts` - Pass `req.user.id` to service calls
- `src/backend/routes/applications.ts` - Pass `req.user.id` to service calls
- `src/backend/routes/knowledgeBase.ts` - Pass `req.user.id` to service calls
- `src/backend/routes/settings.ts` - Pass `req.user.id` to service calls

### Backend Service Re-exports
- `src/backend/services/index.ts` - No changes needed (just re-exports)

---

## Testing Considerations

1. **Unit Tests**: Mock userId in all service tests
2. **Integration Tests**: Test that users cannot access other users' data
3. **Auth Bypass Tests**: Verify routes reject requests without valid authentication
4. **Migration Tests**: Verify existing data remains accessible after migration
