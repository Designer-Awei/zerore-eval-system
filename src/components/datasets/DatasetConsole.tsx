/**
 * @fileoverview Dataset and bad case cluster browsing workspace.
 */

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BadCaseCluster } from "@/badcase/types";
import type { DatasetCaseRecord } from "@/eval-datasets/storage/types";
import styles from "./datasetConsole.module.css";

type ClusterResponse = {
  clusters: BadCaseCluster[];
  totalCases: number;
  totalClusters: number;
};

type CaseListResponse = {
  cases: DatasetCaseRecord[];
  count: number;
};

/**
 * Render the dataset browsing console.
 * @returns Dataset page content.
 */
export function DatasetConsole() {
  const [clusters, setClusters] = useState<BadCaseCluster[]>([]);
  const [cases, setCases] = useState<DatasetCaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [clusterResponse, caseResponse] = await Promise.all([
        fetch("/api/eval-datasets/clusters"),
        fetch("/api/eval-datasets/cases?caseSetType=badcase"),
      ]);

      const clusterData = (await clusterResponse.json()) as Partial<ClusterResponse> & { error?: string; detail?: string };
      const caseData = (await caseResponse.json()) as Partial<CaseListResponse> & { error?: string; detail?: string };

      if (!clusterResponse.ok) {
        throw new Error(clusterData.detail ?? clusterData.error ?? "加载 cluster 失败");
      }
      if (!caseResponse.ok) {
        throw new Error(caseData.detail ?? caseData.error ?? "加载案例池失败");
      }

      setClusters(clusterData.clusters ?? []);
      setCases(caseData.cases ?? []);
      setNotice(`已加载 ${caseData.count ?? 0} 条 bad case，聚合为 ${clusterData.totalClusters ?? 0} 个 cluster。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "加载案例池失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const scenarioOptions = useMemo(
    () =>
      [...new Set(cases.map((item) => item.scenarioId).filter((value): value is string => Boolean(value)))]
        .sort()
        .map((scenarioId) => ({ scenarioId })),
    [cases],
  );

  const filteredClusters = useMemo(
    () =>
      selectedScenarioId
        ? clusters.filter((item) => item.scenarioId === selectedScenarioId)
        : clusters,
    [clusters, selectedScenarioId],
  );

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    cases.forEach((item) => {
      item.tags.forEach((tag) => {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      });
    });
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 6);
  }, [cases]);

  const averageSeverity = useMemo(() => {
    if (cases.length === 0) {
      return 0;
    }
    return (
      cases.reduce((sum, item) => sum + (item.failureSeverityScore ?? 0), 0) / cases.length
    ).toFixed(2);
  }, [cases]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.topBar}>
          <div className={styles.titleBlock}>
            <h1>Bad Case 案例池</h1>
            <p>浏览已沉淀的失败案例、轻量 cluster 和主导标签，为后续 sample batch、replay 与调优包提供素材。</p>
          </div>
          <div className={styles.navRow}>
            <Link className={styles.navLink} href="/workbench">
              返回工作台
            </Link>
            <Link className={styles.navLink} href="/remediation-packages">
              调优包
            </Link>
            <Link className={styles.navLink} href="/online-eval">
              在线评测
            </Link>
          </div>
        </header>

        <section className={styles.heroGrid}>
          <article className={styles.heroCard}>
            <span>Total Cases</span>
            <strong>{cases.length}</strong>
            <small>已入池 bad case 总数</small>
          </article>
          <article className={styles.heroCard}>
            <span>Total Clusters</span>
            <strong>{clusters.length}</strong>
            <small>按轻量相似度聚合后的 cluster 数</small>
          </article>
          <article className={styles.heroCard}>
            <span>Avg Severity</span>
            <strong>{averageSeverity}</strong>
            <small>failureSeverityScore 的平均值</small>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>筛选与概览</h2>
              <p>当前先支持按场景过滤，后续可扩到 cluster label、dominant tag 和时间窗口。</p>
            </div>
            <button className={styles.secondaryButton} type="button" disabled={loading} onClick={() => void loadData()}>
              {loading ? "刷新中…" : "刷新案例池"}
            </button>
          </div>
          <div className={styles.formRow}>
            <label className={styles.label}>
              场景筛选
              <select
                className={styles.select}
                value={selectedScenarioId}
                onChange={(event) => setSelectedScenarioId(event.target.value)}
              >
                <option value="">全部场景</option>
                {scenarioOptions.map((item) => (
                  <option key={item.scenarioId} value={item.scenarioId}>
                    {item.scenarioId}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          {notice ? <p className={styles.notice}>{notice}</p> : null}
          <div className={styles.tagStrip}>
            {topTags.map(([tag, count]) => (
              <span className={styles.tagPill} key={tag}>
                {tag} · {count}
              </span>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Clusters</h2>
              <p>代表样本优先选 medoid；聚类规则当前是 `duplicateGroupKey + semantic/structural distance` 的轻量版本。</p>
            </div>
            <span className={styles.meta}>{filteredClusters.length} 个</span>
          </div>
          <div className={styles.clusterList}>
            {filteredClusters.length > 0 ? (
              filteredClusters.map((cluster) => (
                <details className={styles.clusterCard} key={cluster.clusterId}>
                  <summary className={styles.clusterSummary}>
                    <div>
                      <strong>{cluster.label}</strong>
                      <p>
                        rep={cluster.representativeCaseId} · size={cluster.size} · avgSeverity=
                        {cluster.averageSeverityScore.toFixed(2)}
                      </p>
                    </div>
                    <div className={styles.metaRow}>
                      {cluster.dominantTags.map((tag) => (
                        <span className={styles.tagPill} key={`${cluster.clusterId}_${tag}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </summary>
                  <div className={styles.clusterItems}>
                    {cluster.items.map((item) => (
                      <article className={styles.caseCard} key={item.caseId}>
                        <div className={styles.caseHeader}>
                          <div>
                            <h3>{item.title}</h3>
                            <p>
                              {item.caseId} · session={item.sessionId} · severity=
                              {item.failureSeverityScore.toFixed(2)}
                            </p>
                          </div>
                          <span className={styles.severityBadge}>{Math.round(item.failureSeverityScore * 100)}%</span>
                        </div>
                        <div className={styles.metaRow}>
                          {item.tags.map((tag) => (
                            <span className={styles.tagPill} key={`${item.caseId}_${tag}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                        {item.suggestedAction ? <p className={styles.actionText}>{item.suggestedAction}</p> : null}
                        {item.transcript ? <pre className={styles.transcript}>{item.transcript}</pre> : null}
                      </article>
                    ))}
                  </div>
                </details>
              ))
            ) : (
              <div className={styles.empty}>当前没有可展示的 cluster。</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
