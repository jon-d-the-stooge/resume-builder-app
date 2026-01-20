/**
 * App State Store Module
 *
 * Provides persistent storage for workflow state and page state to solve UX problems:
 * 1. Navigation loses state (hard reloads wipe renderer state)
 * 2. Workflow interruption (any disruption means lost work)
 *
 * Uses electron-store for persistent storage (no encryption needed for non-sensitive data).
 */

// Use require for electron-store v6.x (CommonJS compatible)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Store = require('electron-store');

// ============================================================================
// Type Definitions
// ============================================================================

export interface WorkflowState {
  id: string;
  type: 'optimizer' | 'chat' | 'queue';
  startedAt: string;
  updatedAt: string;
  currentPage: string;
  data: Record<string, any>;
  isComplete: boolean;
}

export interface PageState {
  page: string;
  savedAt: string;
  data: Record<string, any>;
}

export interface ContinueInfo {
  hasActiveWorkflow: boolean;
  workflow: WorkflowState | null;
  message: string;
}

interface AppStateSchema {
  activeWorkflow: WorkflowState | null;
  pageStates: Record<string, PageState>;
}

// Define the store interface for TypeScript
interface StoreInstance {
  store: AppStateSchema;
  get<K extends keyof AppStateSchema>(key: K): AppStateSchema[K];
  set<K extends keyof AppStateSchema>(key: K, value: AppStateSchema[K]): void;
  clear(): void;
}

// ============================================================================
// Store Instance
// ============================================================================

const store: StoreInstance = new Store({
  name: 'app-state',
  defaults: {
    activeWorkflow: null,
    pageStates: {}
  }
});

// ============================================================================
// Workflow State Management
// ============================================================================

/**
 * Start tracking a new workflow
 */
function startWorkflow(
  type: WorkflowState['type'],
  currentPage: string,
  initialData: Record<string, any> = {}
): WorkflowState {
  const workflow: WorkflowState = {
    id: `workflow-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    type,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentPage,
    data: initialData,
    isComplete: false
  };

  store.set('activeWorkflow', workflow);
  console.log(`[AppState] Started workflow: ${workflow.id} (${type})`);
  return workflow;
}

/**
 * Update the current workflow's progress
 */
function updateWorkflow(updates: {
  currentPage?: string;
  data?: Record<string, any>;
  isComplete?: boolean;
}): WorkflowState | null {
  const workflow = store.get('activeWorkflow');

  if (!workflow) {
    console.log('[AppState] No active workflow to update');
    return null;
  }

  const updated: WorkflowState = {
    ...workflow,
    updatedAt: new Date().toISOString(),
    ...(updates.currentPage && { currentPage: updates.currentPage }),
    ...(updates.isComplete !== undefined && { isComplete: updates.isComplete }),
    data: updates.data !== undefined
      ? { ...workflow.data, ...updates.data }
      : workflow.data
  };

  store.set('activeWorkflow', updated);
  console.log(`[AppState] Updated workflow: ${updated.id}`);
  return updated;
}

/**
 * Get the current active workflow
 */
function getWorkflow(): WorkflowState | null {
  return store.get('activeWorkflow');
}

/**
 * Clear the active workflow (on completion or dismiss)
 */
function clearWorkflow(): void {
  const workflow = store.get('activeWorkflow');
  if (workflow) {
    console.log(`[AppState] Cleared workflow: ${workflow.id}`);
  }
  store.set('activeWorkflow', null);
}

// ============================================================================
// Page State Management
// ============================================================================

/**
 * Save a snapshot of a page's state
 */
function savePageState(page: string, data: Record<string, any>): PageState {
  const pageState: PageState = {
    page,
    savedAt: new Date().toISOString(),
    data
  };

  const pageStates = store.get('pageStates') || {};
  pageStates[page] = pageState;
  store.set('pageStates', pageStates);

  console.log(`[AppState] Saved page state: ${page}`);
  return pageState;
}

/**
 * Get a page's saved state
 */
function getPageState(page: string): PageState | null {
  const pageStates = store.get('pageStates') || {};
  return pageStates[page] || null;
}

/**
 * Clear a specific page's state
 */
function clearPageState(page: string): void {
  const pageStates = store.get('pageStates') || {};
  if (pageStates[page]) {
    delete pageStates[page];
    store.set('pageStates', pageStates);
    console.log(`[AppState] Cleared page state: ${page}`);
  }
}

/**
 * Clear all page states
 */
function clearAllPageStates(): void {
  store.set('pageStates', {});
  console.log('[AppState] Cleared all page states');
}

// ============================================================================
// Continue Banner Support
// ============================================================================

/**
 * Get information for the continue banner on dashboard
 */
function getContinueInfo(): ContinueInfo {
  const workflow = store.get('activeWorkflow');

  if (!workflow || workflow.isComplete) {
    return {
      hasActiveWorkflow: false,
      workflow: null,
      message: ''
    };
  }

  // Check if workflow is stale (older than 24 hours)
  const updatedAt = new Date(workflow.updatedAt);
  const now = new Date();
  const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceUpdate > 24) {
    // Auto-clear stale workflows
    clearWorkflow();
    return {
      hasActiveWorkflow: false,
      workflow: null,
      message: ''
    };
  }

  // Generate user-friendly message based on workflow type
  let message = '';
  switch (workflow.type) {
    case 'optimizer':
      const jobTitle = workflow.data?.jobTitle || 'a job';
      const company = workflow.data?.company || '';
      message = company
        ? `Resume optimization for ${jobTitle} at ${company}`
        : `Resume optimization for ${jobTitle}`;
      break;
    case 'chat':
      message = 'Conversation with Career Agent';
      break;
    case 'queue':
      const pendingCount = workflow.data?.pendingCount || 0;
      message = pendingCount > 0
        ? `Processing ${pendingCount} jobs in queue`
        : 'Job queue processing';
      break;
    default:
      message = 'Previous work session';
  }

  return {
    hasActiveWorkflow: true,
    workflow,
    message
  };
}

// ============================================================================
// Exported API
// ============================================================================

export const appStateStore = {
  // Workflow management
  startWorkflow,
  updateWorkflow,
  getWorkflow,
  clearWorkflow,

  // Page state management
  savePageState,
  getPageState,
  clearPageState,
  clearAllPageStates,

  // Continue banner support
  getContinueInfo,

  // Full reset (for debugging/testing)
  reset: (): void => {
    store.clear();
    console.log('[AppState] Store reset');
  }
};
