
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Award,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Scale,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";

import AppShell from "@/app/components/AppShell";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Model = {
  id?: string;
  name?: string;
  provider?: string;
  configured?: boolean;
};

type RubricItem = {
  name: string;
  weight: number;
  description?: string;
};

type Evaluation = {
  id?: string;
  evaluation_id?: string;
  benchmark_id?: string | null;
  prompt?: string;
  response?: string;
  reference_answer?: string | null;
  judge_model?: string;
  judge_provider?: string;
  judge_latency_ms?: number;
  overall_score?: number;
  scores?: Record<string, number>;
  reasoning?: Record<string, string>;
  strengths?: string[];
  weaknesses?: string[];
  overall_feedback?: string;
  created_at?: string;
};

const DEFAULT_RUBRIC: RubricItem[] = [
  {
    name: "Correctness",
    weight: 0.25,
    description: "Factual accuracy and technical correctness.",
  },
  {
    name: "Relevance",
    weight: 0.2,
    description: "How well the response addresses the prompt.",
  },
  {
    name: "Instruction Following",
    weight: 0.2,
    description: "Adherence to the requested instructions.",
  },
  {
    name: "Completeness",
    weight: 0.2,
    description: "Coverage of important information.",
  },
  {
    name: "Clarity",
    weight: 0.15,
    description: "Clarity, structure and readability.",
  },
];

const LABELS: Record<string, string> = {
  correctness: "Correctness",
  relevance: "Relevance",
  instruction_following: "Instruction Following",
  completeness: "Completeness",
  clarity: "Clarity",
};

function formatDate(value?: string) {
  if (!value) return "Unknown date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-rose-400";
}

function scoreLabel(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Strong";
  if (score >= 70) return "Good";
  if (score >= 60) return "Moderate";
  if (score >= 40) return "Weak";
  return "Poor";
}

function normalizeModels(data: unknown): Model[] {
  if (Array.isArray(data)) return data as Model[];

  if (
    data &&
    typeof data === "object" &&
    "models" in data &&
    Array.isArray((data as { models: unknown }).models)
  ) {
    return (data as { models: Model[] }).models;
  }

  return [];
}

function normalizeHistory(data: unknown): Evaluation[] {
  if (Array.isArray(data)) return data as Evaluation[];

  if (
    data &&
    typeof data === "object" &&
    "results" in data &&
    Array.isArray((data as { results: unknown }).results)
  ) {
    return (data as { results: Evaluation[] }).results;
  }

  return [];
}

function normalizeRubric(data: unknown): RubricItem[] {
  if (!data || typeof data !== "object") return DEFAULT_RUBRIC;

  const source = data as Record<string, unknown>;
  const raw = source.rubric ?? source.dimensions;

  if (Array.isArray(raw)) {
    return raw.map((item) => {
      const entry = item as Record<string, unknown>;

      return {
        name: String(entry.name ?? entry.dimension ?? "Criterion"),
        weight: Number(entry.weight ?? 0),
        description: String(entry.description ?? ""),
      };
    });
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(
      ([key, value]) => {
        const entry =
          value && typeof value === "object"
            ? (value as Record<string, unknown>)
            : {};

        const weight =
          typeof value === "number"
            ? value
            : Number(entry.weight ?? 0);

        return {
          name:
            LABELS[key] ??
            key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          weight,
          description: String(entry.description ?? ""),
        };
      }
    );
  }

  return DEFAULT_RUBRIC;
}

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <span className="text-violet-300">{icon}</span>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      {description && (
        <p className="mt-1 text-xs leading-5 text-slate-400">
          {description}
        </p>
      )}
    </div>
  );
}

export default function EvaluationsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [rubric, setRubric] = useState<RubricItem[]>(DEFAULT_RUBRIC);
  const [history, setHistory] = useState<Evaluation[]>([]);

  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [referenceAnswer, setReferenceAnswer] = useState("");
  const [judgeModel, setJudgeModel] = useState("");

  const [result, setResult] = useState<Evaluation | null>(null);
  const [selectedHistory, setSelectedHistory] =
    useState<Evaluation | null>(null);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const configuredModels = useMemo(
    () => models.filter((model) => model.configured !== false),
    [models]
  );

  const loadData = useCallback(async () => {
    setInitialLoading(true);

    try {
      const [modelsResponse, rubricResponse, historyResponse] =
        await Promise.all([
          fetch(`${API_BASE}/api/models`),
          fetch(`${API_BASE}/api/evaluations/rubric`),
          fetch(`${API_BASE}/api/evaluations/results`),
        ]);

      if (!modelsResponse.ok) {
        throw new Error("Could not load available models.");
      }

      const modelData = normalizeModels(await modelsResponse.json());
      setModels(modelData);

      setJudgeModel((current) => {
        if (
          current &&
          modelData.some((model) => (model.id || model.name) === current)
        ) {
          return current;
        }

        const preferred = modelData.find(
          (model) =>
            model.configured !== false &&
            (model.id || model.name) === "qwen2.5:3b"
        );

        const first = modelData.find(
          (model) => model.configured !== false
        );

        return preferred
          ? preferred.id || preferred.name || ""
          : first?.id || first?.name || "";
      });

      if (rubricResponse.ok) {
        setRubric(normalizeRubric(await rubricResponse.json()));
      }

      if (historyResponse.ok) {
        setHistory(normalizeHistory(await historyResponse.json()));
      }

      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the backend."
      );
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const refreshHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/evaluations/results`);

      if (res.ok) {
        setHistory(normalizeHistory(await res.json()));
      }
    } catch {
      setError("Could not refresh evaluation history.");
    }
  };

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const runEvaluation = async () => {
    setError("");
    setSuccess("");
    setResult(null);
    setSelectedHistory(null);

    if (!prompt.trim() || !response.trim() || !judgeModel) {
      setError("Please provide a prompt, response and judge model.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/evaluations/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          response: response.trim(),
          judge_model: judgeModel,
          reference_answer: referenceAnswer.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.detail || data.error || "Evaluation request failed."
        );
      }

      const evaluation: Evaluation =
        data.result ?? data.evaluation ?? data;

      if (typeof evaluation.overall_score !== "number") {
        throw new Error("The backend returned an invalid evaluation.");
      }

      setResult(evaluation);
      setSuccess("Evaluation completed and saved successfully.");

      await refreshHistory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Evaluation failed."
      );
    } finally {
      setLoading(false);
    }
  };

  const activeEvaluation = result || selectedHistory;

  return (
    <AppShell
      title="Evaluations"
      description="Evaluate and analyse LLM responses"
    >
      <div className="w-full space-y-6">
        {/* PAGE INTRODUCTION */}

        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-widest text-violet-300">
              <Sparkles size={15} />
              LLM QUALITY ASSURANCE
            </div>

            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Evaluation workspace
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Analyse model responses using an LLM-as-a-Judge
              framework. Measure correctness, relevance, instruction
              following, completeness and clarity.
            </p>
          </div>

          <button
            onClick={() => void loadData()}
            disabled={initialLoading}
            className="secondary-button flex items-center gap-2"
          >
            <RefreshCw
              size={15}
              className={initialLoading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </section>

        {/* ALERTS */}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300">
            <XCircle size={18} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            <CheckCircle2 size={18} />
            {success}
          </div>
        )}

        {/* INPUT AND RUBRIC */}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
          <section className="glass-panel min-w-0 p-5 sm:p-6">
            <SectionHeading
              icon={<Target size={19} />}
              title="Evaluate a response"
              description="Provide a prompt and its generated response for independent assessment."
            />

            <div className="mb-5 flex items-center justify-between rounded-xl border border-violet-400/15 bg-violet-400/[0.06] px-4 py-3">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-violet-300" />
                <span className="text-sm text-slate-200">
                  LLM-as-a-Judge engine
                </span>
              </div>
              <span className="rounded-lg border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-xs text-violet-300">
                Active
              </span>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Original prompt
                </label>

                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter the original prompt given to the model..."
                  rows={4}
                  className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-violet-400/50 focus:ring-2 focus:ring-violet-400/10"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Model response
                </label>

                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="Paste the generated response you want to evaluate..."
                  rows={7}
                  className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-violet-400/50 focus:ring-2 focus:ring-violet-400/10"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Reference answer
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    Optional
                  </span>
                </label>

                <textarea
                  value={referenceAnswer}
                  onChange={(e) => setReferenceAnswer(e.target.value)}
                  placeholder="Add an ideal answer to help assess factual correctness..."
                  rows={3}
                  className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-violet-400/50 focus:ring-2 focus:ring-violet-400/10"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">
                  Judge model
                </label>

                <div className="relative">
                  <select
                    value={judgeModel}
                    onChange={(e) => setJudgeModel(e.target.value)}
                    disabled={
                      initialLoading || configuredModels.length === 0
                    }
                    className="w-full appearance-none rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 pr-10 text-sm text-white outline-none transition focus:border-violet-400/50 disabled:opacity-50"
                  >
                    {configuredModels.length === 0 && (
                      <option value="">
                        No configured models available
                      </option>
                    )}

                    {configuredModels.map((model) => {
                      const id = model.id || model.name || "";

                      return (
                        <option key={id} value={id}>
                          {model.name || model.id}
                          {model.provider ? ` (${model.provider})` : ""}
                        </option>
                      );
                    })}
                  </select>

                  <ChevronDown
                    size={16}
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  This model evaluates the response. It is not necessarily
                  the model that generated it.
                </p>
              </div>

              <button
                onClick={runEvaluation}
                disabled={
                  loading || initialLoading || !judgeModel
                }
                className="primary-button flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    Evaluating response...
                  </>
                ) : (
                  <>
                    <Sparkles size={17} />
                    Run evaluation
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </section>

          {/* RUBRIC */}

          <div className="space-y-6">
            <section className="glass-panel p-5 sm:p-6">
              <SectionHeading
                icon={<Scale size={19} />}
                title="Evaluation rubric"
                description="Weighted criteria used to assess response quality."
              />

              <div className="mb-5 flex items-center justify-between rounded-xl bg-white/[0.035] px-4 py-3">
                <span className="text-xs text-slate-400">
                  Scoring scale
                </span>
                <span className="text-sm font-semibold text-violet-300">
                  1 to 5
                </span>
              </div>

              <div className="space-y-5">
                {rubric.map((item) => (
                  <div key={item.name}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-200">
                        {item.name}
                      </span>
                      <span className="text-xs font-medium tabular-nums text-violet-300">
                        {(item.weight * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-violet-400"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, item.weight * 100)
                          )}%`,
                        }}
                      />
                    </div>

                    {item.description && (
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {item.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="glass-panel p-5 sm:p-6">
              <SectionHeading
                icon={<Activity size={19} />}
                title="How scoring works"
              />

              <div className="space-y-4">
                {[
                  "The judge analyses the prompt and generated response.",
                  "Each evaluation dimension receives a score from 1 to 5.",
                  "Weighted scores are converted into a final score out of 100.",
                ].map((item, index) => (
                  <div key={item} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-400/10 text-xs font-semibold text-violet-300">
                      0{index + 1}
                    </span>
                    <p className="pt-1 text-xs leading-5 text-slate-400">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* EVALUATION RESULTS */}

        {activeEvaluation && (
          <section className="glass-panel p-5 sm:p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <SectionHeading
                icon={<Award size={19} />}
                title="Evaluation results"
                description={
                  selectedHistory
                    ? "Viewing a previous evaluation."
                    : "Latest evaluation."
                }
              />

              <button
                onClick={() => {
                  setResult(null);
                  setSelectedHistory(null);
                }}
                className="text-xs text-slate-400 transition hover:text-white"
              >
                Clear result
              </button>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="flex flex-col items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-400/[0.05] p-7">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Overall score
                </span>

                <div
                  className={`mt-4 text-6xl font-semibold tabular-nums ${scoreColor(
                    activeEvaluation.overall_score ?? 0
                  )}`}
                >
                  {activeEvaluation.overall_score?.toFixed(1) ?? "--"}
                </div>

                <span className="mt-2 text-xs text-slate-500">
                  Out of 100
                </span>

                <span
                  className={`mt-4 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs ${scoreColor(
                    activeEvaluation.overall_score ?? 0
                  )}`}
                >
                  {scoreLabel(activeEvaluation.overall_score ?? 0)}
                </span>

                <div className="mt-6 w-full border-t border-white/10 pt-4 text-center">
                  <p className="text-xs text-slate-500">
                    Evaluated by
                  </p>
                  <p className="mt-1 break-all text-sm text-slate-200">
                    {activeEvaluation.judge_model || "Unknown"}
                  </p>

                  {typeof activeEvaluation.judge_latency_ms === "number" && (
                    <p className="mt-2 flex items-center justify-center gap-1 text-xs text-slate-500">
                      <Clock3 size={12} />
                      {activeEvaluation.judge_latency_ms.toFixed(0)} ms
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <h3 className="mb-5 text-sm font-semibold text-white">
                  Dimension breakdown
                </h3>

                <div className="space-y-5">
                  {Object.entries(activeEvaluation.scores || {}).map(
                    ([key, value]) => {
                      const score = Number(value);
                      const percentage = (score / 5) * 100;

                      return (
                        <div key={key}>
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-sm text-slate-300">
                              {LABELS[key] || key.replace(/_/g, " ")}
                            </span>

                            <span
                              className={`text-sm font-semibold tabular-nums ${scoreColor(
                                percentage
                              )}`}
                            >
                              {score.toFixed(1)} / 5
                            </span>
                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-violet-400 transition-all duration-700"
                              style={{
                                width: `${Math.max(
                                  0,
                                  Math.min(100, percentage)
                                )}%`,
                              }}
                            />
                          </div>

                          {activeEvaluation.reasoning?.[key] && (
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              {activeEvaluation.reasoning[key]}
                            </p>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            </div>

            {activeEvaluation.overall_feedback && (
              <div className="mt-5 rounded-xl border border-violet-400/15 bg-violet-400/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-violet-200">
                  Overall feedback
                </h3>
                <p className="text-sm leading-6 text-slate-300">
                  {activeEvaluation.overall_feedback}
                </p>
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <CheckCircle2 size={16} />
                  Strengths
                </h3>

                {activeEvaluation.strengths?.length ? (
                  <ul className="space-y-2">
                    {activeEvaluation.strengths.map((item, index) => (
                      <li
                        key={index}
                        className="flex gap-2 text-sm leading-5 text-slate-300"
                      >
                        <span className="text-emerald-400">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">
                    No strengths reported.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-rose-400/15 bg-rose-400/5 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-rose-300">
                  <XCircle size={16} />
                  Weaknesses
                </h3>

                {activeEvaluation.weaknesses?.length ? (
                  <ul className="space-y-2">
                    {activeEvaluation.weaknesses.map((item, index) => (
                      <li
                        key={index}
                        className="flex gap-2 text-sm leading-5 text-slate-300"
                      >
                        <span className="text-rose-400">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">
                    No weaknesses reported.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* HISTORY */}

        <section className="glass-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-5">
            <SectionHeading
              icon={<History size={19} />}
              title="Evaluation history"
              description="Previously completed evaluations stored in PostgreSQL."
            />

            <button
              onClick={() => void refreshHistory()}
              className="secondary-button flex items-center gap-2"
            >
              <RefreshCw size={14} />
              Refresh history
            </button>
          </div>

          {initialLoading ? (
            <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-400">
              <Loader2 size={17} className="animate-spin" />
              Loading evaluation history...
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-400/10">
                <FileText size={23} className="text-violet-300" />
              </div>

              <h3 className="text-sm font-medium text-slate-200">
                No evaluations yet
              </h3>

              <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">
                Completed evaluations will appear here. Run your first
                evaluation to start building your evaluation history.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left">
                <thead>
                  <tr className="border-b border-white/5 text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-4 font-medium">Judge model</th>
                    <th className="px-5 py-4 font-medium">Score</th>
                    <th className="px-5 py-4 font-medium">Date</th>
                    <th className="px-5 py-4 font-medium">Latency</th>
                    <th className="px-5 py-4 text-right font-medium">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {history.map((item, index) => (
                    <tr
                      key={
                        item.id ||
                        item.evaluation_id ||
                        `${item.created_at}-${index}`
                      }
                      className="border-b border-white/5 transition hover:bg-white/[0.025]"
                    >
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-slate-200">
                          {item.judge_model || "Unknown model"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.judge_provider || "LLM Judge"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`text-sm font-semibold tabular-nums ${scoreColor(
                            item.overall_score ?? 0
                          )}`}
                        >
                          {typeof item.overall_score === "number"
                            ? `${item.overall_score.toFixed(1)} / 100`
                            : "--"}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-400">
                        {formatDate(item.created_at)}
                      </td>

                      <td className="px-5 py-4 text-xs text-slate-400">
                        {typeof item.judge_latency_ms === "number"
                          ? `${item.judge_latency_ms.toFixed(0)} ms`
                          : "--"}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedHistory(item);
                            setResult(null);
                            setError("");
                            setSuccess("");
                          }}
                          className="text-xs font-medium text-violet-300 transition hover:text-violet-200"
                        >
                          View results
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-5 text-xs text-slate-500">
          <span>LLMatlas</span>
          <span>LLM Evaluation Engine · PostgreSQL persistence</span>
        </div>
      </div>
    </AppShell>
  );
}
