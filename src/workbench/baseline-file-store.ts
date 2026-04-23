/**
 * @fileoverview Filesystem persistence for workbench baseline snapshots.
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WorkbenchBaselineSnapshot } from "@/workbench/types";

const BASELINE_ROOT = path.join(process.cwd(), "mock-chatlog", "baselines");

/**
 * Sanitize customer id segment for directory names.
 * 纯 `a-zA-Z0-9_-` 时原样截断；否则使用短哈希避免中文客户名无法建目录或冲突。
 * @param customerId Raw customer id.
 * @returns Safe directory name.
 */
export function sanitizeCustomerId(customerId: string): string {
  const trimmed = customerId.trim().slice(0, 128);
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed.slice(0, 64) || "default";
  }
  return `h_${createHash("sha256").update(trimmed).digest("hex").slice(0, 24)}`;
}

/**
 * Sanitize run id for filenames.
 * @param runId Run identifier.
 * @returns Safe file base name.
 */
export function sanitizeRunIdForFile(runId: string): string {
  return runId.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "run";
}

/**
 * Persist one baseline snapshot JSON.
 * @param snapshot Snapshot payload.
 */
export async function saveWorkbenchBaseline(snapshot: WorkbenchBaselineSnapshot): Promise<void> {
  const directory = path.join(BASELINE_ROOT, sanitizeCustomerId(snapshot.customerId));
  await mkdir(directory, { recursive: true });
  const fileName = `${sanitizeRunIdForFile(snapshot.runId)}.json`;
  const filePath = path.join(directory, fileName);
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

/**
 * List baseline snapshots for one customer (newest first by filename sort unstable — use mtime).
 * @param customerId Customer identifier.
 * @returns Lightweight index rows.
 */
export async function listWorkbenchBaselines(customerId: string): Promise<
  Array<{
    runId: string;
    createdAt: string;
    label?: string;
    sourceFileName?: string;
    fileName: string;
  }>
> {
  const directory = path.join(BASELINE_ROOT, sanitizeCustomerId(customerId));
  let names: string[] = [];
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }

  const jsonFiles = names.filter((name) => name.endsWith(".json"));
  const rows: Array<{
    runId: string;
    createdAt: string;
    label?: string;
    sourceFileName?: string;
    fileName: string;
    mtimeMs: number;
  }> = [];

  for (const fileName of jsonFiles) {
    const filePath = path.join(directory, fileName);
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as WorkbenchBaselineSnapshot;
      const fileStat = await stat(filePath);
      rows.push({
        runId: parsed.runId,
        createdAt: parsed.createdAt,
        label: parsed.label,
        sourceFileName: parsed.sourceFileName,
        fileName,
        mtimeMs: fileStat.mtimeMs,
      });
    } catch {
      continue;
    }
  }

  rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return rows.map((row) => ({
    runId: row.runId,
    createdAt: row.createdAt,
    label: row.label,
    sourceFileName: row.sourceFileName,
    fileName: row.fileName,
  }));
}

/**
 * Read one baseline snapshot.
 * @param customerId Customer identifier.
 * @param runId Run identifier.
 * @returns Snapshot or null.
 */
export async function readWorkbenchBaseline(
  customerId: string,
  runId: string,
): Promise<WorkbenchBaselineSnapshot | null> {
  const directory = path.join(BASELINE_ROOT, sanitizeCustomerId(customerId));
  const filePath = path.join(directory, `${sanitizeRunIdForFile(runId)}.json`);
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as WorkbenchBaselineSnapshot;
  } catch {
    return null;
  }
}
