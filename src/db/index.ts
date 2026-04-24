/**
 * @fileoverview Minimal database abstraction for the post-MVP storage migration.
 */

export type DbRecord = {
  id: string;
  workspaceId: string;
  type: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

export interface ZeroreDatabase {
  upsert(record: DbRecord): Promise<void>;
  get(workspaceId: string, type: string, id: string): Promise<DbRecord | null>;
  list(workspaceId: string, type: string): Promise<DbRecord[]>;
}

/**
 * Create the active database adapter.
 *
 * The current adapter is intentionally local and JSON-backed so the app remains
 * dependency-free. The interface is the seam for Postgres/Supabase migration.
 *
 * @returns Database adapter.
 */
export async function createZeroreDatabase(): Promise<ZeroreDatabase> {
  const { LocalJsonDatabase } = await import("@/db/local-json-database");
  return new LocalJsonDatabase();
}
