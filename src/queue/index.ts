/**
 * @fileoverview Lightweight async job queue abstraction.
 */

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveWorkspacePath } from "@/workspaces/paths";

export type QueueJobStatus = "queued" | "running" | "succeeded" | "failed";

export type QueueJobRecord = {
  jobId: string;
  workspaceId: string;
  type: string;
  status: QueueJobStatus;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
};

/**
 * Enqueue a job into the local file queue.
 *
 * @param input Job input.
 * @returns Job record.
 */
export async function enqueueLocalJob(input: {
  workspaceId: string;
  type: string;
  payload: unknown;
}): Promise<QueueJobRecord> {
  const now = new Date().toISOString();
  const job: QueueJobRecord = {
    jobId: `job_${Date.now()}_${randomBytes(3).toString("hex")}`,
    workspaceId: input.workspaceId,
    type: input.type,
    status: "queued",
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
  };
  const filePath = resolveWorkspacePath(input.workspaceId, "queue", `${job.jobId}.json`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(job, null, 2)}\n`, "utf8");
  return job;
}
