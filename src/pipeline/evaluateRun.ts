/**
 * @fileoverview Shared evaluation pipeline used by HTTP routes and batch jobs.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildBadCaseAssets } from "@/pipeline/badCases";
import { buildChartPayloads } from "@/pipeline/chartBuilder";
import { enrichRows, toEnrichedCsv } from "@/pipeline/enrich";
import { buildEvalCaseBundle } from "@/pipeline/evalCaseBuilder";
import { buildExtendedMetrics } from "@/pipeline/extendedMetrics";
import { buildMetricRegistrySnapshot } from "@/pipeline/metricRegistry";
import { buildObjectiveMetrics } from "@/pipeline/objectiveMetrics";
import { evaluateScenarioTemplate } from "@/pipeline/scenarioEvaluator";
import { buildSubjectiveMetrics } from "@/pipeline/subjectiveMetrics";
import { buildSuggestions } from "@/pipeline/suggest";
import { buildSummaryCards } from "@/pipeline/summary";
import { getScenarioTemplateById } from "@/scenarios";
import type { EvaluateResponse, RawChatlogRow, ScenarioEvaluateContext } from "@/types/pipeline";
import type { StructuredTaskMetrics } from "@/types/rich-conversation";
import type { EvalTrace } from "@/types/eval-trace";
import type {
  KnowledgeRetentionFact,
  RetrievalContext,
  RoleProfile,
  ToolCallRecord,
} from "@/types/extended-metrics";

export type EvaluateRunOptions = {
  useLlm: boolean;
  runId: string;
  scenarioId?: string;
  scenarioContext?: ScenarioEvaluateContext;
  structuredTaskMetrics?: StructuredTaskMetrics;
  trace?: EvalTrace;
  persistArtifact?: boolean;
  artifactBaseName?: string;
  /**
   * Optional inputs for DeepEval-aligned extended metrics.
   * 提供任意子集即触发对应指标，未提供的指标返回 null。
   */
  extendedInputs?: {
    retrievalContexts?: RetrievalContext[];
    toolCalls?: ToolCallRecord[];
    retentionFacts?: KnowledgeRetentionFact[];
    roleProfile?: RoleProfile;
  };
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
  const evalCaseBundle = buildEvalCaseBundle(enrichedRows, options.structuredTaskMetrics, options.trace);
  const objectiveMetrics = buildObjectiveMetrics(enrichedRows);
  const subjectiveMetrics = await buildSubjectiveMetrics(enrichedRows, options.useLlm, options.runId);
  const badCaseAssets = buildBadCaseAssets(enrichedRows, objectiveMetrics, subjectiveMetrics, {
    runId: options.runId,
    scenarioId: options.scenarioId,
  });
  const scenarioTemplate = options.scenarioId ? getScenarioTemplateById(options.scenarioId) : null;
  if (options.scenarioId && !scenarioTemplate) {
    warnings.push(`未找到场景模板：${options.scenarioId}，本次按通用评估返回。`);
  }
  const scenarioEvaluation = scenarioTemplate
    ? evaluateScenarioTemplate(scenarioTemplate, {
        rows: enrichedRows,
        objectiveMetrics,
        subjectiveMetrics,
      })
    : null;
  const metricRegistry = buildMetricRegistrySnapshot({
    objectiveMetrics,
    subjectiveMetrics,
    structuredTaskMetrics: options.structuredTaskMetrics,
    trace: options.trace,
    capabilities: evalCaseBundle.capabilityReport,
    scenarioEvaluation,
    scenarioTemplate,
  });
  // DeepEval-aligned extended metrics. 仅当提供了对应 input 时才会有结果。
  const extendedInputs = options.extendedInputs ?? {};
  const hasAnyExtendedInput = Boolean(
    extendedInputs.retrievalContexts?.length ||
      extendedInputs.toolCalls?.length ||
      extendedInputs.retentionFacts?.length ||
      extendedInputs.roleProfile,
  );
  const extendedMetrics = hasAnyExtendedInput
    ? await buildExtendedMetrics({
        ...extendedInputs,
        useLlm: options.useLlm,
        runId: options.runId,
      })
    : undefined;

  const charts = buildChartPayloads(enrichedRows);
  const suggestions = buildSuggestions(enrichedRows, objectiveMetrics, subjectiveMetrics);
  const summaryCards = buildSummaryCards(
    objectiveMetrics,
    subjectiveMetrics,
    new Set(rawRows.map((row) => row.sessionId)).size,
    rawRows.length,
    scenarioEvaluation,
    badCaseAssets.length,
    options.structuredTaskMetrics,
  );

  if (subjectiveMetrics.status !== "ready") {
    warnings.push("主观评估当前为降级模式（LLM judge 调用失败或未启用）。");
  }

  let artifactPath: string | undefined;
  if (options.persistArtifact ?? Boolean(options.artifactBaseName)) {
    const artifactBaseName = sanitizeArtifactBaseName(options.artifactBaseName ?? options.runId);
    const artifactDirectory = path.join("mock-chatlog", "enriched-data");
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
      scenarioContext: options.scenarioContext,
    },
    summaryCards,
    topicSegments,
    enrichedRows,
    enrichedCsv,
    artifactPath,
    objectiveMetrics,
    subjectiveMetrics,
    structuredTaskMetrics: options.structuredTaskMetrics,
    trace: options.trace,
    evalCaseBundle,
    metricRegistry,
    scenarioEvaluation,
    badCaseAssets,
    extendedMetrics,
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
