/**
 * @fileoverview Shared evaluation pipeline used by HTTP routes and batch jobs.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildChartPayloads } from "@/pipeline/chartBuilder";
import { enrichRows, toEnrichedCsv } from "@/pipeline/enrich";
import { buildObjectiveMetrics } from "@/pipeline/objectiveMetrics";
import { buildSubjectiveMetrics } from "@/pipeline/subjectiveMetrics";
import { buildSuggestions } from "@/pipeline/suggest";
import { buildSummaryCards } from "@/pipeline/summary";
import type { EvaluateResponse, RawChatlogRow } from "@/types/pipeline";

export type EvaluateRunOptions = {
  useLlm: boolean;
  runId: string;
  persistArtifact?: boolean;
  artifactBaseName?: string;
};

/**
 * Run full enrich → metrics → charts pipeline on raw rows.
 * @param rawRows Canonical raw chatlog rows.
 * @param options Execution options.
 * @returns Evaluate response plus optional artifact path.
 */
export async function runEvaluatePipeline(
  rawRows: RawChatlogRow[],
  options: EvaluateRunOptions,
): Promise<EvaluateResponse & { artifactPath?: string }> {
  const warnings: string[] = [];
  if (!rawRows.every((row) => Boolean(row.timestamp))) {
    warnings.push("检测到缺失 timestamp，部分时序指标已降级。");
  }

  const { enrichedRows, topicSegments } = await enrichRows(rawRows, options.useLlm, options.runId);
  const enrichedCsv = toEnrichedCsv(enrichedRows);
  const objectiveMetrics = buildObjectiveMetrics(enrichedRows);
  const subjectiveMetrics = await buildSubjectiveMetrics(enrichedRows, options.useLlm, options.runId);
  const charts = buildChartPayloads(enrichedRows);
  const suggestions = buildSuggestions(enrichedRows, objectiveMetrics, subjectiveMetrics);
  const summaryCards = buildSummaryCards(
    objectiveMetrics,
    subjectiveMetrics,
    new Set(rawRows.map((row) => row.sessionId)).size,
    rawRows.length,
  );

  if (subjectiveMetrics.status !== "ready") {
    warnings.push("主观评估当前为降级模式（LLM judge 调用失败或未启用）。");
  }

  let artifactPath: string | undefined;
  if (options.persistArtifact ?? Boolean(options.artifactBaseName)) {
    const artifactBaseName = sanitizeArtifactBaseName(options.artifactBaseName ?? options.runId);
    const artifactDirectory = path.join(process.cwd(), "mock-chatlog", "enriched-data");
    artifactPath = path.join(artifactDirectory, `${artifactBaseName}.enriched.csv`);
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(artifactPath, enrichedCsv, "utf8");
  }

  const response: EvaluateResponse & { artifactPath?: string } = {
    runId: options.runId,
    meta: {
      sessions: new Set(rawRows.map((row) => row.sessionId)).size,
      messages: rawRows.length,
      hasTimestamp: rawRows.every((row) => Boolean(row.timestamp)),
      generatedAt: new Date().toISOString(),
      warnings,
    },
    summaryCards,
    topicSegments,
    enrichedRows,
    enrichedCsv,
    artifactPath,
    objectiveMetrics,
    subjectiveMetrics,
    charts,
    suggestions,
  };

  return response;
}

/**
 * Sanitize a file base name for artifact persistence.
 * @param value Requested artifact base name.
 * @returns Safe file base name.
 */
function sanitizeArtifactBaseName(value: string): string {
  return value.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "") || "enriched-artifact";
}
