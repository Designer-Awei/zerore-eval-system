/**
 * @fileoverview Interactive online evaluation page: baseline selection, reply API, replay + charts.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChartsPanel } from "@/components/home/ChartsPanel";
import { OnlineCompareCharts } from "@/components/online-eval/OnlineCompareCharts";
import {
  TEMP_EVAL_SAMPLE_BADCASE_TARGET,
  TEMP_EVAL_SAMPLE_GOODCASE_TARGET,
} from "@/eval-datasets/sample-defaults";
import type { EvaluateResponse } from "@/types/pipeline";
import styles from "./onlineEval.module.css";

type BaselineIndexRow = {
  runId: string;
  createdAt: string;
  label?: string;
  sourceFileName?: string;
  fileName: string;
};

type ReplayApiResponse = {
  runId: string;
  replyEndpoint: string;
  replayedRowCount: number;
  baselineRunId?: string;
  baselineEvaluate?: EvaluateResponse;
  evaluate: EvaluateResponse;
};

/**
 * Render the online evaluation workspace.
 * @returns Page content.
 */
export function OnlineEvalConsole() {
  const [customerId, setCustomerId] = useState("default");
  const [baselines, setBaselines] = useState<BaselineIndexRow[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [replyApiBaseUrl, setReplyApiBaseUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [replayResult, setReplayResult] = useState<ReplayApiResponse | null>(null);
  const [sampleBatchJson, setSampleBatchJson] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("zerore:lastCustomerId");
    if (stored) {
      setCustomerId(stored);
    }
  }, []);

  /**
   * Load baseline index list for current customer id.
   */
  const loadBaselines = useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const response = await fetch(`/api/workbench-baselines/${encodeURIComponent(customerId)}`);
      const data = (await response.json()) as { baselines?: BaselineIndexRow[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "加载基线列表失败");
      }
      setBaselines(data.baselines ?? []);
      window.localStorage.setItem("zerore:lastCustomerId", customerId);
      setNotice(`已加载 ${data.baselines?.length ?? 0} 条基线索引。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载失败");
    } finally {
      setLoadingList(false);
    }
  }, [customerId]);

  /**
   * Run replay-and-evaluate against selected baseline.
   */
  async function handleReplay() {
    if (!selectedRunId) {
      setError("请先选择一条基线快照（含 rawRows）。");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    setReplayResult(null);
    try {
      const response = await fetch("/api/online-eval/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baselineRef: { customerId, runId: selectedRunId },
          replyApiBaseUrl: replyApiBaseUrl.trim() || undefined,
          useLlm: true,
        }),
      });
      const data = (await response.json()) as Partial<ReplayApiResponse> & { error?: string; detail?: string };
      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? "回放评估失败");
      }
      setReplayResult(data as ReplayApiResponse);
      setNotice(`回放完成：已用回复端点 ${data.replyEndpoint} 重写 assistant，共 ${data.replayedRowCount} 行参与评估。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "回放失败");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Create a temporary stratified sample batch (default ~20 cases total).
   */
  async function handleSampleBatch() {
    setLoading(true);
    setError("");
    setSampleBatchJson("");
    try {
      const response = await fetch("/api/eval-datasets/sample-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedGoodcaseCount: TEMP_EVAL_SAMPLE_GOODCASE_TARGET,
          requestedBadcaseCount: TEMP_EVAL_SAMPLE_BADCASE_TARGET,
          seed: `online_${customerId}`,
          strategy: "stratified_random_v1_temp_eval",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail ?? data.error ?? "创建 sample batch 失败");
      }
      setSampleBatchJson(JSON.stringify(data, null, 2));
      setNotice("已生成临时评测集（不足 20 条亦会落盘并附 warnings）。");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "抽样失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.topBar}>
          <div className={styles.titleBlock}>
            <h1>交互效果在线评测</h1>
            <p>
              选择基线后执行在线回放评测，完成后自动输出与基线的多指标对比结果。
            </p>
          </div>
          <div className={styles.rowActions}>
            <Link className={styles.navLink} href="/remediation-packages">
              调优包
            </Link>
            <Link className={styles.navLink} href="/datasets">
              案例池
            </Link>
            <Link className={styles.navLink} href="/workbench">
              ← 返回工作台
            </Link>
          </div>
        </header>

        <section className={styles.panel}>
          <h2>基线与回复通道</h2>
          <p>选择客户与基线版本，配置回复通道后执行评测。</p>
          <div className={styles.formGrid}>
            <label className={styles.label}>
              客户 ID（customerId）
              <input
                className={styles.input}
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                placeholder="如 default、tenant_a"
              />
            </label>
            <label className={styles.label}>
              选择基线（runId）
              <select
                className={styles.select}
                value={selectedRunId}
                onChange={(event) => setSelectedRunId(event.target.value)}
                disabled={!baselines.length}
              >
                <option value="">— 请先加载列表 —</option>
                {baselines.map((row) => (
                  <option key={row.fileName} value={row.runId}>
                    {row.runId} · {row.createdAt}
                    {row.label ? ` · ${row.label}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.label}>
              客户回复 API 基址（可选）
              <input
                className={styles.input}
                value={replyApiBaseUrl}
                onChange={(event) => setReplyApiBaseUrl(event.target.value)}
                placeholder="例如：https://your-domain/api"
              />
            </label>
          </div>
          <div className={styles.rowActions} style={{ marginTop: 14 }}>
            <button type="button" className={styles.secondaryButton} disabled={loadingList} onClick={() => void loadBaselines()}>
              {loadingList ? "加载中…" : "刷新基线列表"}
            </button>
            <button type="button" className={styles.primaryButton} disabled={loading} onClick={() => void handleReplay()}>
              {loading ? "执行中…" : "执行在线回放评估"}
            </button>
            <button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => void handleSampleBatch()}>
              生成临时评测集抽样（约 20 条）
            </button>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          {notice ? <p className={styles.notice}>{notice}</p> : null}
          <ul className={styles.metaList}>
            <li>请先在工作台完成评估并保存基线，再在此页选择对应版本执行在线评测。</li>
          </ul>
        </section>

        {sampleBatchJson ? (
          <section className={styles.panel}>
            <h2>临时评测集（eval-datasets）</h2>
            <p>当前默认 good {TEMP_EVAL_SAMPLE_GOODCASE_TARGET} + bad {TEMP_EVAL_SAMPLE_BADCASE_TARGET}；池子不足时仍返回部分 case。</p>
            <pre className={styles.rawPreview}>{sampleBatchJson}</pre>
          </section>
        ) : null}

        {replayResult?.baselineEvaluate ? (
          <section className={styles.panel}>
            <h2>多指标对比（基线 vs 在线回放）</h2>
            <p>
              基线 run：<strong>{replayResult.baselineEvaluate.runId}</strong> · 在线 run：
              <strong>{replayResult.evaluate.runId}</strong>
            </p>
            <OnlineCompareCharts baseline={replayResult.baselineEvaluate} current={replayResult.evaluate} />
          </section>
        ) : null}

        {replayResult?.evaluate ? (
          <section className={styles.panel}>
            <h2>在线回放 · 全量图表</h2>
            <p>与首页相同的图表载荷，便于核对细节。</p>
            <ChartsPanel charts={replayResult.evaluate.charts} />
          </section>
        ) : null}
      </main>
    </div>
  );
}
