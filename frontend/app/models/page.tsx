"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import {
  Activity,
  Check,
  Cpu,
  Database,
  Eye,
  Filter,
  Layers3,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  configured: boolean;
  size?: number | null;
  size_bytes?: number | null;
  size_gb?: number | null;
  parameter_size?: string | null;
  quantization_level?: string | null;
  family?: string | null;
  capabilities: string[];
};

type RegistrySummary = {
  total_models: number;
  providers: string[];
  capability_counts: Record<string, number>;
};

type ComparisonModel = {
  model: string;
  provider: string;
  run_count: number;
  successful_runs: number;
  failed_runs: number;
  average_latency_ms: number | null;
  median_latency_ms: number | null;
  average_tokens_per_second: number | null;
  results: Array<{
    run_number: number;
    success: boolean;
    latency_ms: number | null;
    tokens_per_second: number | null;
    output_tokens: number | null;
    error: string | null;
  }>;
};

type ComparisonResult = {
  comparison_id: string;
  prompt: string;
  repeat: number;
  model_count: number;
  models: ComparisonModel[];
};

function formatSize(model: ModelInfo) {
  if (typeof model.size_gb === "number") {
    return `${model.size_gb.toFixed(2)} GB`;
  }

  if (typeof model.size === "number") {
    return `${(model.size / 1024 ** 3).toFixed(2)} GB`;
  }

  return "Unknown";
}

function formatMetric(value: number | null, suffix = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toFixed(2)}${suffix}`;
}

function capabilityLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function ModelRegistryPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [summary, setSummary] = useState<RegistrySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [capabilityFilter, setCapabilityFilter] = useState("all");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState(
    "Explain the difference between TCP and UDP in three concise paragraphs."
  );
  const [repeat, setRepeat] = useState(2);
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [comparisonError, setComparisonError] = useState("");

  const loadRegistry = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [modelsResponse, summaryResponse] = await Promise.all([
        fetch(`${API_BASE}/api/models`, { cache: "no-store" }),
        fetch(`${API_BASE}/api/models/summary`, { cache: "no-store" }),
      ]);

      if (!modelsResponse.ok) {
        throw new Error(`Model discovery failed (${modelsResponse.status}).`);
      }

      const modelsData = await modelsResponse.json();

      if (!summaryResponse.ok) {
        throw new Error(`Registry summary failed (${summaryResponse.status}).`);
      }

      const summaryData = await summaryResponse.json();

      setModels(modelsData.models ?? []);
      setSummary(summaryData);

      const availableIds = new Set(
        (modelsData.models ?? []).map((model: ModelInfo) => model.id)
      );

      setSelectedModels((current) =>
        current.filter((id) => availableIds.has(id))
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the LLMatlas API."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  const providers = useMemo(
    () => Array.from(new Set(models.map((model) => model.provider))),
    [models]
  );

  const capabilities = useMemo(
    () =>
      Array.from(
        new Set(models.flatMap((model) => model.capabilities ?? []))
      ).sort(),
    [models]
  );

  const filteredModels = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return models.filter((model) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          model.name,
          model.id,
          model.provider,
          model.family ?? "",
          model.parameter_size ?? "",
          ...(model.capabilities ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesProvider =
        providerFilter === "all" || model.provider === providerFilter;

      const matchesCapability =
        capabilityFilter === "all" ||
        (model.capabilities ?? []).includes(capabilityFilter);

      return matchesSearch && matchesProvider && matchesCapability;
    });
  }, [models, search, providerFilter, capabilityFilter]);

  function toggleModel(modelId: string) {
    setSelectedModels((current) =>
      current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId]
    );
  }

  function selectVisibleModels() {
    setSelectedModels((current) => {
      const visibleIds = filteredModels.map((model) => model.id);
      const allVisibleSelected = visibleIds.every((id) =>
        current.includes(id)
      );

      if (allVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  async function runComparison() {
    if (selectedModels.length < 2) {
      setComparisonError("Select at least two models to compare.");
      return;
    }

    if (!prompt.trim()) {
      setComparisonError("Enter a prompt before starting the comparison.");
      return;
    }

    setComparing(true);
    setComparisonError("");
    setComparison(null);

    try {
      const response = await fetch(`${API_BASE}/api/benchmarks/compare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          models: selectedModels,
          repeat,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || `Comparison failed (${response.status}).`
        );
      }

      setComparison(data);
    } catch (err) {
      setComparisonError(
        err instanceof Error ? err.message : "Comparison could not be completed."
      );
    } finally {
      setComparing(false);
    }
  }

  const bestThroughput = comparison?.models.reduce<ComparisonModel | null>(
    (best, current) => {
      if (current.average_tokens_per_second === null) return best;
      if (
        !best ||
        best.average_tokens_per_second === null ||
        current.average_tokens_per_second > best.average_tokens_per_second
      ) {
        return current;
      }
      return best;
    },
    null
  );

  return (
    <AppShell
      eyebrow="MODEL MANAGEMENT"
      title="Model Registry"
      description="Discover, inspect and compare the models connected to your benchmarking workspace."
      actions={
        <button
          onClick={() => void loadRegistry()}
          disabled={loading}
          className="secondary-button inline-flex items-center gap-2"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      }
    >
      <div className="space-y-6">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="glass-panel metric-card">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Discovered models</span>
              <Cpu size={18} className="text-violet-300" />
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {summary?.total_models ?? models.length}
            </div>
            <p className="mt-1 text-xs text-slate-500">Across connected providers</p>
          </div>

          <div className="glass-panel metric-card">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Providers</span>
              <Layers3 size={18} className="text-violet-300" />
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {summary?.providers.length ?? providers.length}
            </div>
            <p className="mt-1 text-xs text-slate-500">Registered model sources</p>
          </div>

          <div className="glass-panel metric-card">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Reasoning models</span>
              <Sparkles size={18} className="text-violet-300" />
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {summary?.capability_counts?.reasoning ?? 0}
            </div>
            <p className="mt-1 text-xs text-slate-500">Heuristically classified</p>
          </div>

          <div className="glass-panel metric-card">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Vision models</span>
              <Eye size={18} className="text-violet-300" />
            </div>
            <div className="mt-3 text-3xl font-semibold text-white">
              {summary?.capability_counts?.vision ?? 0}
            </div>
            <p className="mt-1 text-xs text-slate-500">Heuristically classified</p>
          </div>
        </section>

        <section className="glass-panel p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Available models</h2>
              <p className="mt-1 text-xs text-slate-400">
                Select models to include them in a controlled comparison.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={selectVisibleModels}
                disabled={filteredModels.length === 0}
                className="secondary-button text-xs"
              >
                Select visible
              </button>
              <button
                onClick={() => setSelectedModels([])}
                disabled={selectedModels.length === 0}
                className="secondary-button text-xs"
              >
                Clear selection
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="relative block md:col-span-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search models..."
                className="w-full rounded-xl border border-white/10 bg-slate-950/40 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition focus:border-violet-400/50"
              />
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3">
              <Database size={15} className="shrink-0 text-slate-500" />
              <select
                value={providerFilter}
                onChange={(event) => setProviderFilter(event.target.value)}
                className="w-full bg-transparent py-2.5 text-sm text-slate-200 outline-none"
              >
                <option value="all" className="bg-slate-900">All providers</option>
                {providers.map((provider) => (
                  <option key={provider} value={provider} className="bg-slate-900">
                    {provider}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3">
              <Filter size={15} className="shrink-0 text-slate-500" />
              <select
                value={capabilityFilter}
                onChange={(event) => setCapabilityFilter(event.target.value)}
                className="w-full bg-transparent py-2.5 text-sm text-slate-200 outline-none"
              >
                <option value="all" className="bg-slate-900">All capabilities</option>
                {capabilities.map((capability) => (
                  <option key={capability} value={capability} className="bg-slate-900">
                    {capabilityLabel(capability)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-400">
              <RefreshCw size={17} className="animate-spin" />
              Discovering installed models...
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="py-14 text-center">
              <Cpu size={28} className="mx-auto text-slate-600" />
              <p className="mt-3 text-sm text-slate-300">No matching models found.</p>
              <p className="mt-1 text-xs text-slate-500">
                Try changing the search or filters.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredModels.map((model) => {
                const selected = selectedModels.includes(model.id);

                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => toggleModel(model.id)}
                    aria-pressed={selected}
                    className={`group relative rounded-2xl border p-4 text-left transition duration-200 ${
                      selected
                        ? "border-violet-400/60 bg-violet-500/[0.10] shadow-[0_0_25px_rgba(139,92,246,0.10)]"
                        : "border-white/[0.08] bg-slate-950/25 hover:border-violet-400/30 hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-300/15 bg-violet-500/10 text-violet-200">
                          <Cpu size={20} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-white">
                            {model.name}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {model.provider} · {model.family || "Unknown family"}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
                          selected
                            ? "border-violet-300 bg-violet-500 text-white"
                            : "border-white/15 bg-white/[0.03] text-transparent"
                        }`}
                      >
                        <Check size={14} />
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-black/20 p-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">
                          Parameters
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-200">
                          {model.parameter_size || "N/A"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-black/20 p-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">
                          Storage
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-200">
                          {formatSize(model)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-black/20 p-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">
                          Quantization
                        </p>
                        <p className="mt-1 truncate text-sm font-medium text-slate-200">
                          {model.quantization_level || "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {(model.capabilities ?? []).map((capability) => (
                        <span
                          key={capability}
                          className="rounded-full border border-violet-300/15 bg-violet-400/[0.07] px-2.5 py-1 text-[10px] text-violet-200"
                        >
                          {capabilityLabel(capability)}
                        </span>
                      ))}
                      <span
                        className={`ml-auto rounded-full px-2.5 py-1 text-[10px] ${
                          model.configured
                            ? "bg-emerald-400/10 text-emerald-300"
                            : "bg-amber-400/10 text-amber-300"
                        }`}
                      >
                        {model.configured ? "Available" : "Not configured"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-4">
            <p className="text-xs text-slate-500">
              Showing {filteredModels.length} of {models.length} models
            </p>
            <p className="text-xs text-violet-300">
              {selectedModels.length} selected
            </p>
          </div>
        </section>

        <section className="glass-panel p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
              <Activity size={17} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Launch model comparison
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Run the same prompt against every selected model.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-400">
                Benchmark prompt
              </span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                maxLength={10000}
                placeholder="Enter a prompt to benchmark..."
                className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm leading-6 text-slate-200 outline-none transition focus:border-violet-400/50"
              />
            </label>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-400">
                  Repetitions per model
                </span>
                <select
                  value={repeat}
                  onChange={(event) => setRepeat(Number(event.target.value))}
                  className="min-w-40 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-violet-400/50"
                >
                  {[1, 2, 3, 5, 10].map((count) => (
                    <option key={count} value={count} className="bg-slate-900">
                      {count} {count === 1 ? "run" : "runs"}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={() => void runComparison()}
                disabled={comparing || selectedModels.length < 2 || !prompt.trim()}
                className="primary-button inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {comparing ? (
                  <RefreshCw size={15} className="animate-spin" />
                ) : (
                  <Play size={15} />
                )}
                {comparing ? "Running comparison..." : "Compare selected models"}
              </button>
            </div>

            <p className="text-xs text-slate-500">
              {selectedModels.length < 2
                ? "Select at least two models above to enable comparison."
                : `${selectedModels.length} models × ${repeat} runs = ${selectedModels.length * repeat} total executions.`}
            </p>

            {comparisonError && (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
                {comparisonError}
              </div>
            )}
          </div>
        </section>

        {comparison && (
          <section className="glass-panel p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="eyebrow">COMPARISON COMPLETE</p>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  Performance results
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {comparison.model_count} models · {comparison.repeat} runs each
                </p>
              </div>
              <button
                onClick={() => setComparison(null)}
                className="secondary-button inline-flex items-center gap-2 self-start text-xs"
              >
                <X size={13} />
                Dismiss
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Comparison prompt
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                {comparison.prompt}
              </p>
            </div>

            {bestThroughput && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] p-3 text-sm text-emerald-200">
                <Zap size={16} />
                Highest measured throughput: <strong>{bestThroughput.model}</strong>
                <span className="text-emerald-300/80">
                  ({formatMetric(bestThroughput.average_tokens_per_second, " tok/s")})
                </span>
              </div>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-3 font-medium">Model</th>
                    <th className="px-3 py-3 font-medium">Success</th>
                    <th className="px-3 py-3 font-medium">Avg latency</th>
                    <th className="px-3 py-3 font-medium">Median latency</th>
                    <th className="px-3 py-3 font-medium">Throughput</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.models.map((model) => (
                    <tr
                      key={model.model}
                      className="border-b border-white/[0.05] last:border-0"
                    >
                      <td className="px-3 py-3">
                        <p className="font-medium text-white">{model.model}</p>
                        <p className="mt-1 text-xs text-slate-500">{model.provider}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-300">
                        {model.successful_runs}/{model.run_count}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-300">
                        {formatMetric(model.average_latency_ms, " ms")}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-300">
                        {formatMetric(model.median_latency_ms, " ms")}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-slate-300">
                        {formatMetric(model.average_tokens_per_second, " tok/s")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {comparison.models.map((model) => (
                <div
                  key={model.model}
                  className="rounded-xl border border-white/[0.07] bg-black/20 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-white">
                      {model.model}
                    </p>
                    <span className="text-xs text-slate-500">
                      {model.successful_runs}/{model.run_count} passed
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {model.results.map((run) => (
                      <div
                        key={`${model.model}-${run.run_number}`}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-slate-500">Run {run.run_number}</span>
                        <span
                          className={
                            run.success ? "text-emerald-300" : "text-red-300"
                          }
                        >
                          {run.success
                            ? `${formatMetric(run.latency_ms, " ms")} · ${formatMetric(run.tokens_per_second, " tok/s")}`
                            : run.error || "Failed"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[11px] leading-5 text-slate-500">
              Results are measurements from this run. Latency can vary with model
              loading, warm-up, system load and execution order. Capability labels
              in the registry are heuristic metadata, not benchmark scores.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
