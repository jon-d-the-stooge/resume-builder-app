/// <reference types="vite/client" />

/**
 * Vite environment variables type declarations.
 * These are available via import.meta.env in the bundled web application.
 */
interface ImportMetaEnv {
  /** API base URL for backend endpoints */
  readonly VITE_API_URL?: string;
  /** Auth0 domain for authentication */
  readonly VITE_AUTH0_DOMAIN?: string;
  /** Auth0 client ID */
  readonly VITE_AUTH0_CLIENT_ID?: string;
  /** Auth0 audience (API identifier) */
  readonly VITE_AUTH0_AUDIENCE?: string;
  /** Current mode (development, production, etc.) */
  readonly MODE: string;
  /** Whether running in development mode */
  readonly DEV: boolean;
  /** Whether running in production mode */
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
