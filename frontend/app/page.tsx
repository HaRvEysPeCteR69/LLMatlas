
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Cpu,
  Gauge,
  RefreshCw,
  Server,
  Zap,
} from "lucide-react";

import AppShell from "./components/AppShell";

const API_URL = "http://localhost:8000";

type Model = {
  id: string;
  name: string;
  provider: string;
  configured: boolean;
  parameter_size?: string;
};

type BenchmarkResult = {
  id: string;
  model: string;
  provider: string;
  latency_ms: number | null;
  tokens_per_second?: number | null;
  success: boolean;
  created_at: string;
};

export default function DashboardPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  async function loadDashboard() {
    setLoading(true);

    try {
      const [modelResponse, resultResponse] = await Promise.all([
        fetch(`${API_URL}/api/models`),
        fetch(`${API_URL}/api/benchmarks/results`),
      ]);

      if (!modelResponse.ok || !resultResponse.ok) {
        throw new Error("API unavailable");
      }

      const modelData = await modelResponse.json();
      const resultData = await resultResponse.json();

      setModels(modelData.models ?? []);
      setResults(resultData.results ?? []);
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const successful = results.filter((item) => item.success);

  const averageLatency =
    successful.length > 0
      ? successful.reduce(
          (sum, item) => sum + (item.latency_ms ?? 0),
          0
        ) / successful.length
      : 0;

  const throughputResults = successful.filter(
    (item) => item.tokens_per_second != null
  );

  const averageThroughput =
    throughputResults.length > 0
      ? throughputResults.reduce(
          (sum, item) => sum + (item.tokens_per_second ?? 0),
          0
        ) / throughputResults.length
      : 0;

  return (
    <AppShell
      eyebrow="WORKSPACE OVERVIEW"
      title="Performance Overview"
      description="Monitor your models, benchmark experiments and evaluation performance."
      actions={
        <button
          onClick={loadDashboard}
          disabled={loading}
          className="secondary-button"
        >
          <RefreshCw
            size={14}
            className={loading ? "animate-spin" : ""}
          />
          Refresh data
        </button>
      }
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className={`status-dot ${connected ? "online" : "offline"}`} />
          {connected ? "Backend connected" : "Backend disconnected"}
        </div>

        <span className="text-xs text-slate-500">
          Live data from your local environment
        </span>
      </div>

      <section className="metric-grid">
        <MetricCard
          label="Total executions"
          value={loading ? "..." : results.length.toString()}
          detail="Recorded benchmark runs"
          icon={<Activity size={17} />}
          tone="tone-violet"
        />

        <MetricCard
          label="Available models"
          value={loading ? "..." : models.length.toString()}
          detail="Models discovered by registry"
          icon={<Cpu size={17} />}
          tone="tone-blue"
        />

        <MetricCard
          label="Average latency"
          value={
            loading
              ? "..."
              : successful.length
                ? `${averageLatency.toFixed(0)} ms`
                : "N/A"
          }
          detail="Successful executions"
          icon={<Clock3 size={17} />}
          tone="tone-amber"
        />

        <MetricCard
          label="Average throughput"
          value={
            loading
              ? "..."
              : throughputResults.length
                ? `${averageThroughput.toFixed(1)}`
                : "N/A"
          }
          detail="Generation tokens / second"
          icon={<Gauge size={17} />}
          tone="tone-mint"
        />
      </section>

      <section className="main-grid">
        <div className="glass-panel models-panel">
          <div className="panel-heading">
            <div>
              <div className="title-with-icon">
                <Server size={17} />
                <h2>Model registry</h2>
              </div>
              <p>Models currently available to LLMatlas.</p>
            </div>

            <span className="text-xs text-slate-500">
              {models.length} models
            </span>
          </div>

          {models.length > 0 ? (
            <div className="provider-list">
              {models.map((model) => (
                <div className="provider-row" key={model.id}>
                  <div className="provider-mark text-violet-300">
                    <Cpu size={18} />
                  </div>

                  <div className="provider-copy">
                    <strong>{model.name}</strong>
                    <small>
                      {model.provider}
                      {model.parameter_size
                        ? ` · ${model.parameter_size}`
                        : ""}
                    </small>
                  </div>

                  <div className="provider-status">
                    <i className="!bg-emerald-400" />
                    Available
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="registry-empty">
              <div className="empty-cube">
                <Cpu size={20} />
              </div>
              <strong>
                {loading ? "Loading models..." : "No models discovered"}
              </strong>
              <p>
                Check that your backend and local model provider are running.
              </p>
            </div>
          )}
        </div>

        <div className="glass-panel providers-panel flex flex-col">
          <div className="title-with-icon">
            <Zap size={17} />
            <h2>Benchmark workspace</h2>
          </div>

          <p className="mt-2 text-xs leading-6 text-slate-400">
            Run controlled experiments against your language models and
            inspect their performance.
          </p>

          <div className="my-5 space-y-3">
            {[
              "Repeated model execution",
              "Latency and throughput tracking",
              "Token usage measurement",
              "Raw model response inspection",
            ].map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-2 text-xs text-slate-400"
              >
                <CheckCircle2
                  size={14}
                  className="shrink-0 text-emerald-400"
                />
                {feature}
              </div>
            ))}
          </div>

          <Link
            href="/benchmarks"
            className="primary-button mt-auto w-full"
          >
            Open Benchmark Runner
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <section className="quick-section">
        <div className="quick-heading">
          <div>
            <p className="eyebrow">ACTIVITY</p>
            <h2>Recent benchmark executions</h2>
          </div>

          <span>
            <Activity size={13} />
            {results.length} recorded runs
          </span>
        </div>

        <div className="glass-panel recent-panel">
          {results.length === 0 ? (
            <div className="empty-activity">
              <div className="empty-orbit">
                <BarChart3 size={22} />
              </div>
              <strong>No benchmark activity yet</strong>
              <p>
                Run your first experiment to start building your performance
                history.
              </p>
              <Link href="/benchmarks" className="secondary-button">
                Start benchmarking
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {[...results].reverse().slice(0, 6).map((result) => (
                <div
                  key={result.id}
                  className="provider-row"
                >
                  <div className="provider-mark">
                    <Activity size={17} />
                  </div>

                  <div className="provider-copy">
                    <strong>{result.model}</strong>
                    <small>
                      {result.provider} ·{" "}
                      {new Date(result.created_at).toLocaleString()}
                    </small>
                  </div>

                  <div className="text-right">
                    <strong className="block text-xs text-slate-300">
                      {result.latency_ms != null
                        ? `${result.latency_ms.toFixed(0)} ms`
                        : "N/A"}
                    </strong>
                    <small
                      className={
                        result.success
                          ? "text-emerald-400"
                          : "text-red-400"
                      }
                    >
                      {result.success ? "Successful" : "Failed"}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className={`glass-panel metric-card ${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>

      <strong className="metric-value tabular-nums">{value}</strong>
      <span className="metric-detail">{detail}</span>
      <span className="metric-reflection" />
    </div>
  );
}
