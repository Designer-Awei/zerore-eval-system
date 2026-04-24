/**
 * @fileoverview Production-oriented evaluation console entry component.
 */

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { BadCasePanel } from "@/components/home/BadCasePanel";
import { previewCsvLines, splitCsvLine } from "@/lib/csv";
import { inferFormatFromFileName } from "@/parsers";
import { ChartsPanel } from "@/components/home/ChartsPanel";
import { FeatherIcon } from "@/components/home/FeatherIcon";
import { GoalCompletionPanel } from "@/components/home/GoalCompletionPanel";
import { PreviewTable } from "@/components/home/PreviewTable";
import { RemediationPackagePanel } from "@/components/home/RemediationPackagePanel";
import { RecoveryTracePanel } from "@/components/home/RecoveryTracePanel";
import { ScenarioKpiPanel } from "@/components/home/ScenarioKpiPanel";
import { StatusPanel } from "@/components/home/StatusPanel";
import { SuggestionPanel } from "@/components/home/SuggestionPanel";
import { SummaryGrid } from "@/components/home/SummaryGrid";
import { UploadDropzone } from "@/components/home/UploadDropzone";
import type { RemediationPackageSnapshot } from "@/remediation";
import { SCENARIO_OPTIONS } from "@/scenarios";
import type {
  EvaluateResponse,
  IngestResponse,
  SummaryCard,
  UploadFormat,
} from "@/types/pipeline";
import styles from "./evalConsole.module.css";

type EvalConsoleRunState = "idle" | "ingesting" | "ready" | "running" | "success" | "error";

type EvalConsoleSessionSnapshot = {
  fileName: string;
  format: UploadFormat;
  ingestResult: IngestResponse | null;
  evaluateResult: EvaluateResponse | null;
  runState: EvalConsoleRunState;
  processStep: number;
  error: string;
  notice: string;
  baselineCustomerId: string;
  selectedScenarioId: string;
  scenarioOnboardingAnswers: Record<string, string>;
  remediationPackage: RemediationPackageSnapshot | null;
};

const PROCESSING_LOGS = [
  "接收原始日志并校验字段完整性",
  "按 session 排序并补全中间字段",
  "计算客观指标、目标达成与恢复摘要",
  "执行业务 KPI 映射与证据聚合",
  "生成图表载荷、证据与策略建议",
  "组装本次评估交付结果",
];
const ALLOWED_EXTENSIONS = new Set(["csv", "json", "txt", "md"]);
const MAX_UPLOAD_SIZE_MB = 5;
const EVAL_CONSOLE_SNAPSHOT_KEY = "zerore:evalConsoleSnapshot:v1";

/**
 * Render the main evaluation console.
 * @returns Console page content.
 */
export function EvalConsole() {
  const snapshotHydratedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<UploadFormat>("csv");
  const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null);
  const [evaluateResult, setEvaluateResult] = useState<EvaluateResponse | null>(null);
  const [runState, setRunState] = useState<EvalConsoleRunState>("idle");
  const [dragActive, setDragActive] = useState(false);
  const [processStep, setProcessStep] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [baselineCustomerId, setBaselineCustomerId] = useState("default");
  const [baselineSaving, setBaselineSaving] = useState(false);
  const [badCaseHarvesting, setBadCaseHarvesting] = useState(false);
  const [remediationGenerating, setRemediationGenerating] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [scenarioOnboardingAnswers, setScenarioOnboardingAnswers] = useState<Record<string, string>>({});
  const [remediationPackage, setRemediationPackage] = useState<RemediationPackageSnapshot | null>(null);

  useEffect(() => {
    const lastCustomerId = window.localStorage.getItem("zerore:lastCustomerId");
    if (lastCustomerId) {
      setBaselineCustomerId(lastCustomerId);
    }

    const snapshotRaw = window.sessionStorage.getItem(EVAL_CONSOLE_SNAPSHOT_KEY);
    if (!snapshotRaw) {
      snapshotHydratedRef.current = true;
      return;
    }
    try {
      const snapshot = JSON.parse(snapshotRaw) as EvalConsoleSessionSnapshot;
      setFileName(snapshot.fileName ?? "");
      setFormat(snapshot.format ?? "csv");
      setIngestResult(snapshot.ingestResult ?? null);
      setEvaluateResult(snapshot.evaluateResult ?? null);
      setRunState(snapshot.runState ?? "idle");
      setProcessStep(snapshot.processStep ?? 0);
      setError(snapshot.error ?? "");
      setNotice(snapshot.notice ?? "");
      if (snapshot.baselineCustomerId) {
        setBaselineCustomerId(snapshot.baselineCustomerId);
      }
      setSelectedScenarioId(snapshot.selectedScenarioId ?? "");
      setScenarioOnboardingAnswers(snapshot.scenarioOnboardingAnswers ?? {});
      setRemediationPackage(snapshot.remediationPackage ?? null);
    } catch {
      window.sessionStorage.removeItem(EVAL_CONSOLE_SNAPSHOT_KEY);
    } finally {
      snapshotHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!snapshotHydratedRef.current) {
      return;
    }
    const snapshot: EvalConsoleSessionSnapshot = {
      fileName,
      format,
      ingestResult,
      evaluateResult,
      runState,
      processStep,
      error,
      notice,
      baselineCustomerId,
      selectedScenarioId,
      scenarioOnboardingAnswers,
      remediationPackage,
    };
    window.sessionStorage.setItem(EVAL_CONSOLE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  }, [fileName, format, ingestResult, evaluateResult, runState, processStep, error, notice, baselineCustomerId, selectedScenarioId, scenarioOnboardingAnswers, remediationPackage]);

  const previewLines = useMemo(
    () => ingestResult?.previewTop20 ?? previewCsvLines(ingestResult?.canonicalCsv ?? "", 21),
    [ingestResult],
  );
  const previewHeader = useMemo(
    () => (previewLines.length ? splitCsvLine(previewLines[0]) : []),
    [previewLines],
  );
  const previewRows = useMemo(
    () => previewLines.slice(1).map((line) => splitCsvLine(line)),
    [previewLines],
  );
  const summaryCards = useMemo<SummaryCard[]>(
    () =>
      evaluateResult?.summaryCards ?? [
        { key: "sessionCount", label: "会话规模", value: "--", hint: "等待日志接入" },
        { key: "responseGap", label: "平均响应间隔", value: "--", hint: "等待评估执行" },
        { key: "topicSwitch", label: "话题切换率", value: "--", hint: "等待评估执行" },
        { key: "empathy", label: "共情得分", value: "--", hint: "等待主观评估" },
        { key: "goalCompletion", label: "目标达成率", value: "--", hint: "等待 goal completion 评估" },
        { key: "businessKpi", label: "业务 KPI", value: "--", hint: "等待场景映射" },
        { key: "badCaseCount", label: "Bad Case", value: "--", hint: "等待失败案例提取" },
        { key: "recoveryTrace", label: "恢复轨迹", value: "--", hint: "等待 recovery trace 识别" },
      ],
    [evaluateResult],
  );
  const warnings = evaluateResult?.meta.warnings ?? ingestResult?.warnings ?? [];
  const canRunEvaluate = Boolean(ingestResult?.rawRows.length) && runState !== "running" && runState !== "ingesting";
  const runStateLabel = getRunStateLabel(runState);
  const heroStats = [
    {
      key: "messages",
      label: "消息量",
      value: ingestResult ? `${ingestResult.ingestMeta.rows}` : "--",
      hint: fileName ? "已完成标准化接入" : "等待原始日志上传",
    },
    {
      key: "sessions",
      label: "会话数",
      value: evaluateResult ? `${evaluateResult.meta.sessions}` : ingestResult ? `${ingestResult.ingestMeta.sessions}` : "--",
      hint: "按 session 聚合后的评估对象",
    },
    {
      key: "charts",
      label: "交付图表",
      value: `${evaluateResult?.charts.length ?? 0}`,
      hint: "核心分析图谱与情绪轨迹",
    },
    {
      key: "warnings",
      label: "降级提示",
      value: `${warnings.length}`,
      hint: warnings.length ? "本次结果包含降级说明" : "当前链路无降级告警",
    },
  ];
  const selectedScenarioOption = SCENARIO_OPTIONS.find((item) => item.scenarioId === selectedScenarioId);
  const selectedScenarioLabel = selectedScenarioOption?.displayName ?? "通用评估";
  const activeOnboardingQuestions = selectedScenarioOption?.onboardingQuestions ?? [];
  const answeredOnboardingCount = activeOnboardingQuestions.filter(
    (item) => scenarioOnboardingAnswers[item.id]?.trim(),
  ).length;

  /**
   * Parse and upload one selected file.
   * @param file Selected file.
   */
  async function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      setError("文件类型不支持，请上传 csv/json/txt/md。");
      setRunState("error");
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
      setError(`文件过大，请上传不超过 ${MAX_UPLOAD_SIZE_MB}MB 的日志文件。`);
      setRunState("error");
      return;
    }

    try {
      setRunState("ingesting");
      setError("");
      setNotice("");
      setEvaluateResult(null);
      setIngestResult(null);
      setRemediationPackage(null);
      setFileName(file.name);
      const inferred = inferFormatFromFileName(file.name);
      setFormat(inferred);
      const text = await file.text();

      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          format: inferred,
          fileName: file.name,
        }),
      });
      const result = (await response.json()) as Partial<IngestResponse> & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "日志解析失败");
      }
      setIngestResult(result as IngestResponse);
      setRunState("ready");
      setNotice(`日志已标准化，共识别 ${result.ingestMeta?.rows ?? 0} 条消息，可开始评估。`);
    } catch (requestError) {
      setRunState("error");
      setError(requestError instanceof Error ? requestError.message : "上传失败");
    }
  }

  /**
   * Handle file input selection.
   * @param event Input change event.
   */
  async function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await handleFile(file);
  }

  /**
   * Handle drag over on the dropzone.
   * @param event Drag event.
   */
  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  /**
   * Handle file drop on the dropzone.
   * @param event Drag event.
   */
  async function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) {
      return;
    }
    await handleFile(file);
  }

  /**
   * Execute the full evaluation flow through the backend API.
   */
  async function handleRunEvaluate() {
    if (!ingestResult?.rawRows.length) {
      setError("请先上传并完成日志解析。");
      setRunState("error");
      return;
    }

    let step = 0;
    setRunState("running");
    setError("");
    setNotice("");
    setProcessStep(0);
    setRemediationPackage(null);

    const timer = window.setInterval(() => {
      step = Math.min(PROCESSING_LOGS.length - 1, step + 1);
      setProcessStep(step);
    }, 1000);

    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawRows: ingestResult.rawRows,
          useLlm: true,
          scenarioId: selectedScenarioId || undefined,
          scenarioContext: selectedScenarioId
            ? {
                onboardingAnswers: pickActiveOnboardingAnswers(
                  scenarioOnboardingAnswers,
                  activeOnboardingQuestions.map((item) => item.id),
                ),
              }
            : undefined,
        }),
      });
      const result = (await response.json()) as Partial<EvaluateResponse> & { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "评估执行失败");
      }
      setEvaluateResult(result as EvaluateResponse);
      setRunState("success");
      setProcessStep(PROCESSING_LOGS.length - 1);
      setNotice("评估完成，已生成图表、业务 KPI、策略与中间产物。");
    } catch (requestError) {
      setRunState("error");
      setError(requestError instanceof Error ? requestError.message : "评估执行失败");
    } finally {
      window.clearInterval(timer);
    }
  }

  /**
   * Update the selected scenario and keep only answers that belong to it.
   * @param nextScenarioId Selected scenario id.
   */
  function handleScenarioChange(nextScenarioId: string) {
    setSelectedScenarioId(nextScenarioId);
    const nextQuestionIds =
      SCENARIO_OPTIONS.find((item) => item.scenarioId === nextScenarioId)?.onboardingQuestions.map((item) => item.id) ??
      [];
    setScenarioOnboardingAnswers((current) => pickActiveOnboardingAnswers(current, nextQuestionIds));
  }

  /**
   * Update one onboarding answer.
   * @param questionId Question identifier.
   * @param value Answer text.
   */
  function handleOnboardingAnswerChange(questionId: string, value: string) {
    setScenarioOnboardingAnswers((current) => ({
      ...current,
      [questionId]: value,
    }));
  }

  /**
   * Persist last successful evaluate + raw rows as a workbench baseline for online replay.
   */
  async function handleSaveWorkbenchBaseline() {
    if (!evaluateResult || !ingestResult?.rawRows.length) {
      setError("请先完成一次评估后再保存基线。");
      return;
    }
    setBaselineSaving(true);
    setError("");
    try {
      const response = await fetch("/api/workbench-baselines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: baselineCustomerId.trim(),
          label: fileName || undefined,
          sourceFileName: fileName || undefined,
          evaluate: evaluateResult,
          rawRows: ingestResult.rawRows,
        }),
      });
      const data = (await response.json()) as { error?: string; detail?: string; runId?: string };
      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? "保存基线失败");
      }
      window.localStorage.setItem("zerore:lastCustomerId", baselineCustomerId.trim());
      setNotice(`已保存工作台基线：customerId=${baselineCustomerId.trim()}，runId=${data.runId ?? evaluateResult.runId}。可前往「在线评测」选择该基线回放。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存基线失败");
    } finally {
      setBaselineSaving(false);
    }
  }

  /**
   * Persist extracted bad case assets into the eval-datasets badcase pool.
   */
  async function handleHarvestBadCases() {
    if (!evaluateResult?.badCaseAssets.length) {
      setError("当前没有可沉淀的 bad case。");
      return;
    }
    setBadCaseHarvesting(true);
    setError("");
    try {
      const response = await fetch("/api/eval-datasets/harvest-badcases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baselineVersion: evaluateResult.runId,
          allowNearDuplicate: true,
          evaluate: evaluateResult,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        detail?: string;
        savedCount?: number;
        skippedCount?: number;
      };
      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? "沉淀 bad case 失败");
      }
      setNotice(`已沉淀 bad case：新增 ${data.savedCount ?? 0} 条，跳过 ${data.skippedCount ?? 0} 条重复案例。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "沉淀 bad case 失败");
    } finally {
      setBadCaseHarvesting(false);
    }
  }

  /**
   * Build and persist an agent-readable remediation package from the current evaluation result.
   */
  async function handleGenerateRemediationPackage() {
    if (!evaluateResult?.badCaseAssets.length) {
      setError("当前没有足够的 bad case 用于生成调优包。");
      return;
    }
    setRemediationGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/remediation-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFileName: fileName || undefined,
          baselineCustomerId: baselineCustomerId.trim() || undefined,
          evaluate: {
            runId: evaluateResult.runId,
            objectiveMetrics: {
              avgResponseGapSec: evaluateResult.objectiveMetrics.avgResponseGapSec,
              topicSwitchRate: evaluateResult.objectiveMetrics.topicSwitchRate,
              userQuestionRepeatRate: evaluateResult.objectiveMetrics.userQuestionRepeatRate,
              agentResolutionSignalRate: evaluateResult.objectiveMetrics.agentResolutionSignalRate,
              escalationKeywordHitRate: evaluateResult.objectiveMetrics.escalationKeywordHitRate,
            },
            subjectiveMetrics: {
              dimensions: evaluateResult.subjectiveMetrics.dimensions,
              signals: evaluateResult.subjectiveMetrics.signals,
              goalCompletions: evaluateResult.subjectiveMetrics.goalCompletions,
              recoveryTraces: evaluateResult.subjectiveMetrics.recoveryTraces,
            },
            scenarioEvaluation: evaluateResult.scenarioEvaluation,
            badCaseAssets: evaluateResult.badCaseAssets,
            suggestions: evaluateResult.suggestions,
          },
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        detail?: string;
        package?: RemediationPackageSnapshot;
      };
      if (!response.ok || !data.package) {
        throw new Error(data.detail ?? data.error ?? "生成调优包失败");
      }
      setRemediationPackage(data.package);
      setNotice(`已生成调优包 ${data.package.packageId}，可直接复制文件内容交给 Claude Code / Codex。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "生成调优包失败");
    } finally {
      setRemediationGenerating(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageChrome} aria-hidden="true" />
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <p className={styles.badge}>ZERORE EVAL</p>
            <h1 className={styles.heroTitle}>对话评估工作台</h1>
            <p className={styles.heroCopy}>
              将原始 chatlog 转换为可解释的中间产物，生成主题切分、结构化情绪分、图表与优化策略，服务于
              MVP 阶段的评估闭环验证。
            </p>
            <div className={styles.heroTagRow}>
              <div className={styles.heroTagsLeft}>
                <span className={styles.heroTag}>状态 · {runStateLabel}</span>
                <span className={styles.heroTag}>格式 · {format.toUpperCase()}</span>
                <span className={styles.heroTag}>场景 · {selectedScenarioLabel}</span>
                <span className={styles.heroTag}>文件 · {fileName ? fileName : "等待上传"}</span>
              </div>
              <div className={styles.heroActionLinks}>
                <Link className={styles.secondaryNavLink} href="/">
                  产品首页
                </Link>
                <Link className={styles.secondaryNavLink} href="/datasets">
                  案例池
                </Link>
                <Link className={styles.secondaryNavLink} href="/remediation-packages">
                  调优包
                </Link>
                <Link className={styles.onlineEvalLink} href="/online-eval">
                  在线评测
                </Link>
              </div>
            </div>
          </div>
          <div className={styles.heroAside}>
            <div className={styles.heroMetaGrid}>
              {heroStats.map((item) => (
                <div className={styles.heroMetaCard} key={item.key}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.hint}</small>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.workspaceGrid}>
          <section className={`${styles.panel} ${styles.panelWide}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>日志接入</h2>
                <p>以开发工具风格的工作流完成上传、解析与执行，适配多格式原始日志。</p>
              </div>
              <span className={styles.panelMeta}>RAW INGEST</span>
            </div>
            <div className={styles.intakeStack}>
              <UploadDropzone
                dragActive={dragActive}
                uploading={runState === "ingesting"}
                fileName={fileName}
                maxUploadSizeMb={MAX_UPLOAD_SIZE_MB}
                canRunEvaluate={canRunEvaluate}
                fileInputRef={fileInputRef}
                onDragOver={handleDragOver}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onFileInputChange={handleFileInputChange}
                onRunEvaluate={handleRunEvaluate}
                processing={runState === "running"}
              />
              <div className={styles.metaRow}>
                <span>{fileName ? `已上传：${fileName}` : "尚未上传文件"}</span>
                <span>{ingestResult ? `${ingestResult.ingestMeta.rows} 条消息` : "等待日志接入"}</span>
              </div>
              <div className={styles.controlRow}>
                <label className={styles.controlLabel}>
                  业务场景
                  <select
                    className={styles.controlSelect}
                    value={selectedScenarioId}
                    onChange={(event) => handleScenarioChange(event.target.value)}
                  >
                    <option value="">通用评估（不映射 KPI）</option>
                    {SCENARIO_OPTIONS.map((item) => (
                      <option key={item.scenarioId} value={item.scenarioId}>
                        {item.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {activeOnboardingQuestions.length > 0 ? (
                <div className={styles.onboardingBox}>
                  <div className={styles.onboardingHeader}>
                    <div>
                      <strong>场景 Onboarding</strong>
                      <span>
                        {answeredOnboardingCount}/{activeOnboardingQuestions.length} 已填写
                      </span>
                    </div>
                    <span>{selectedScenarioLabel}</span>
                  </div>
                  <div className={styles.onboardingGrid}>
                    {activeOnboardingQuestions.map((item) => (
                      <label className={styles.onboardingField} key={item.id}>
                        <span>{item.question}</span>
                        <input
                          value={scenarioOnboardingAnswers[item.id] ?? ""}
                          onChange={(event) => handleOnboardingAnswerChange(item.id, event.target.value)}
                          placeholder="填写该客户或数据集的实际情况"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              {error ? <p className={styles.error}>{error}</p> : null}
              {notice ? <p className={styles.notice}>{notice}</p> : null}
            </div>
          </section>

          <section className={`${styles.panel} ${styles.panelCompact}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>执行摘要</h2>
                <p>面向业务与策略复盘的一屏指标概览。</p>
              </div>
              <span className={styles.panelMeta}>OVERVIEW</span>
            </div>
            <SummaryGrid cards={summaryCards} />
          </section>

          <section className={`${styles.panel} ${styles.panelWide}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>日志预览</h2>
                <p>展示统一 raw 结构的前 20 行，预览区固定高度并支持横向滚动。</p>
              </div>
              <span className={styles.panelMeta}>{previewRows.length} 行缓存</span>
            </div>
            <PreviewTable header={previewHeader} rows={previewRows} />
          </section>

          <section className={`${styles.panel} ${styles.panelCompact}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>执行状态</h2>
                <p>用时间线查看当前链路进度、warning 与降级说明。</p>
              </div>
              <span className={styles.panelMeta}>{runStateLabel}</span>
            </div>
            <StatusPanel
              processing={runState === "running"}
              processStep={processStep}
              logs={PROCESSING_LOGS}
              warnings={warnings}
            />
          </section>

          <section className={`${styles.panel} ${styles.panelWide}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>业务 KPI 映射</h2>
                <p>基于场景模板把通用评估指标翻译成业务可读的 KPI 分与证据。</p>
              </div>
              <span className={styles.panelMeta}>
                {evaluateResult?.scenarioEvaluation?.displayName ?? selectedScenarioLabel}
              </span>
            </div>
            <ScenarioKpiPanel evaluation={evaluateResult?.scenarioEvaluation ?? null} />
          </section>

          <section className={`${styles.panel} ${styles.panelCompact}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Bad Case 池</h2>
                <p>把失败 session 编译成可复用案例，并一键沉淀到 eval-datasets。</p>
              </div>
              <span className={styles.panelMeta}>{evaluateResult?.badCaseAssets.length ?? 0} 条</span>
            </div>
            <BadCasePanel items={evaluateResult?.badCaseAssets ?? []} />
            <div className={styles.baselineRow}>
              <button
                className={styles.primaryOutlineButton}
                type="button"
                disabled={!evaluateResult?.badCaseAssets.length || badCaseHarvesting}
                onClick={() => void handleHarvestBadCases()}
              >
                {badCaseHarvesting ? "沉淀中…" : "沉淀到案例池"}
              </button>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.panelCompact}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>目标达成</h2>
                <p>按 session 判断用户初始意图是否达成，并展示达成证据与未达成原因。</p>
              </div>
              <span className={styles.panelMeta}>
                {evaluateResult?.subjectiveMetrics.goalCompletions.length ?? 0} 条
              </span>
            </div>
            <GoalCompletionPanel items={evaluateResult?.subjectiveMetrics.goalCompletions ?? []} />
          </section>

          <section className={`${styles.panel} ${styles.panelWide}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>恢复轨迹</h2>
                <p>识别失败后是否被及时修复，并沉淀可复用的恢复策略。</p>
              </div>
              <span className={styles.panelMeta}>
                {evaluateResult?.subjectiveMetrics.recoveryTraces.filter((item) => item.status !== "none").length ?? 0} 条
              </span>
            </div>
            <RecoveryTracePanel items={evaluateResult?.subjectiveMetrics.recoveryTraces ?? []} />
          </section>

          <section className={`${styles.panel} ${styles.panelFull}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>分析图谱</h2>
                <p>当前固定输出核心情绪、断点、活跃时段与 topic 连贯度图表。</p>
              </div>
              <span className={styles.panelMeta}>{evaluateResult?.charts.length ?? 0} 张</span>
            </div>
            <ChartsPanel charts={evaluateResult?.charts ?? []} />
          </section>

          <section className={`${styles.panel} ${styles.panelWide}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>优化策略</h2>
                <p>按优先级输出下一轮 prompt、交互流程与模型策略调整建议。</p>
              </div>
              <span className={styles.panelMeta}>ACTIONABLE</span>
            </div>
            <SuggestionPanel suggestions={evaluateResult?.suggestions ?? []} />
          </section>

          <section className={`${styles.panel} ${styles.panelWide}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>调优包</h2>
                <p>把问题、证据、验收门槛编译成 agent-readable 文件，可直接交给 Claude Code / Codex 执行。</p>
              </div>
              <span className={styles.panelMeta}>{remediationPackage?.packageId ?? "REMEDIATION"}</span>
            </div>
            <RemediationPackagePanel
              packageSnapshot={remediationPackage}
              loading={remediationGenerating}
              canGenerate={Boolean(evaluateResult?.badCaseAssets.length)}
              onGenerate={() => void handleGenerateRemediationPackage()}
            />
          </section>

          <section className={`${styles.panel} ${styles.panelCompact}`}>
            <div className={styles.panelHeader}>
              <div>
                <h2>结果导出</h2>
                <p>导出本次评估的中间产物与结构化结果，用于回放和复核。</p>
              </div>
              <span className={styles.panelMeta}>EXPORT</span>
            </div>
            <div className={styles.exportStack}>
              <div className={styles.exportMeta}>
                <p>当前 Run ID</p>
                <strong>{evaluateResult?.runId ?? "--"}</strong>
                <span>{evaluateResult?.artifactPath ?? "评估完成后可下载并复核 artifact"}</span>
              </div>
              <div className={styles.exportRow}>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={!evaluateResult}
                  onClick={() =>
                    evaluateResult
                      ? downloadFile(
                          `${evaluateResult.runId}.enriched.csv`,
                          evaluateResult.enrichedCsv,
                          "text/csv;charset=utf-8",
                        )
                      : undefined
                  }
                >
                  <FeatherIcon name="download" />
                  下载 Enriched CSV
                </button>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={!evaluateResult}
                  onClick={() =>
                    evaluateResult
                      ? downloadFile(
                          `${evaluateResult.runId}.json`,
                          JSON.stringify(evaluateResult, null, 2),
                          "application/json;charset=utf-8",
                        )
                      : undefined
                  }
                >
                  <FeatherIcon name="fileText" />
                  下载 JSON 结果
                </button>
              </div>
              <div className={styles.baselineRow}>
                <label className={styles.baselineLabel}>
                  客户 ID（保存基线）
                  <input
                    className={styles.baselineInput}
                    value={baselineCustomerId}
                    onChange={(event) => setBaselineCustomerId(event.target.value)}
                    placeholder="default"
                  />
                </label>
                <button
                  className={styles.primaryOutlineButton}
                  type="button"
                  disabled={!evaluateResult || baselineSaving}
                  onClick={() => void handleSaveWorkbenchBaseline()}
                >
                  {baselineSaving ? "保存中…" : "保存工作台基线"}
                </button>
              </div>
              <p className={styles.baselineHint}>
                基线写入 <code>{"mock-chatlog/baselines/<customerId>/"}</code>
                ，供「在线评测」同源对比；含完整 rawRows 与 evaluate 结果。
              </p>
            </div>
          </section>
        </section>

      </main>
    </div>
  );
}

/**
 * Convert run state to display label.
 * @param runState Current run state.
 * @returns Human-readable label.
 */
function getRunStateLabel(
  runState: EvalConsoleRunState,
): string {
  if (runState === "ingesting") {
    return "日志解析中";
  }
  if (runState === "ready") {
    return "待执行";
  }
  if (runState === "running") {
    return "评估中";
  }
  if (runState === "success") {
    return "已完成";
  }
  if (runState === "error") {
    return "异常";
  }
  return "未开始";
}

/**
 * Keep only onboarding answers that belong to the active scenario.
 * @param answers Current answer map.
 * @param activeQuestionIds Active scenario question ids.
 * @returns Pruned answer map.
 */
function pickActiveOnboardingAnswers(
  answers: Record<string, string>,
  activeQuestionIds: string[],
): Record<string, string> {
  const activeSet = new Set(activeQuestionIds);
  return Object.fromEntries(
    Object.entries(answers)
      .filter(([questionId]) => activeSet.has(questionId))
      .map(([questionId, value]) => [questionId, value.trim()]),
  );
}

/**
 * Trigger a file download in the browser.
 * @param fileName Downloaded file name.
 * @param content File content.
 * @param mimeType MIME type.
 */
function downloadFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
