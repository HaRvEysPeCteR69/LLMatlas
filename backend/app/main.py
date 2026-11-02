
from datetime import datetime, timezone
from statistics import mean, median
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.services.registry import registry
from app.services.evaluation import judge
from app.services.evaluation.judge import EVALUATION_RUBRIC

from app.core.database import get_db
from app.models import BenchmarkRun, Comparison, Evaluation


app = FastAPI(
    title="LLMatlas",
    description="LLM benchmarking and evaluation platform",
    version="0.7.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# REQUEST SCHEMAS
# ---------------------------------------------------------

class BenchmarkRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=10000)
    model: str = Field(min_length=1, max_length=100)
    repeat: int = Field(default=1, ge=1, le=10)


class ComparisonRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=10000)
    models: list[str] = Field(min_length=2, max_length=5)
    repeat: int = Field(default=1, ge=1, le=10)


class EvaluationRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=10000)
    response: str = Field(min_length=1, max_length=30000)
    judge_model: str = Field(
        default="qwen2.5:3b",
        min_length=1,
        max_length=100,
    )
    reference_answer: Optional[str] = Field(
        default=None,
        max_length=30000,
    )
    benchmark_id: Optional[str] = Field(
        default=None,
        max_length=36,
    )


# ---------------------------------------------------------
# RESULT HELPERS
# ---------------------------------------------------------

def create_success_result(
    model,
    provider_name,
    generation,
    prompt,
    run_number,
):
    return {
        "id": str(uuid4()),
        "run_number": run_number,
        "model": model,
        "provider": provider_name,
        "prompt": prompt,
        "response": generation.text,
        "latency_ms": generation.latency_ms,
        "input_tokens": generation.input_tokens,
        "output_tokens": generation.output_tokens,
        "output_words": len(generation.text.split()),
        "total_duration_ms": generation.total_duration_ms,
        "load_duration_ms": generation.load_duration_ms,
        "prompt_eval_duration_ms": generation.prompt_eval_duration_ms,
        "generation_duration_ms": generation.generation_duration_ms,
        "tokens_per_second": generation.tokens_per_second,
        "time_to_first_token_ms": generation.time_to_first_token_ms,
        "success": True,
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def create_failure_result(
    model,
    provider_name,
    prompt,
    run_number,
    error,
):
    return {
        "id": str(uuid4()),
        "run_number": run_number,
        "model": model,
        "provider": provider_name,
        "prompt": prompt,
        "response": None,
        "latency_ms": None,
        "input_tokens": None,
        "output_tokens": None,
        "output_words": None,
        "total_duration_ms": None,
        "load_duration_ms": None,
        "prompt_eval_duration_ms": None,
        "generation_duration_ms": None,
        "tokens_per_second": None,
        "time_to_first_token_ms": None,
        "success": False,
        "error": str(error),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def summarize_results(results):
    successful = [
        item for item in results if item["success"]
    ]

    latencies = [
        item["latency_ms"]
        for item in successful
        if item["latency_ms"] is not None
    ]

    throughputs = [
        item["tokens_per_second"]
        for item in successful
        if item["tokens_per_second"] is not None
    ]

    return {
        "run_count": len(results),
        "successful_runs": len(successful),
        "failed_runs": len(results) - len(successful),
        "average_latency_ms": (
            mean(latencies) if latencies else None
        ),
        "median_latency_ms": (
            median(latencies) if latencies else None
        ),
        "average_tokens_per_second": (
            mean(throughputs) if throughputs else None
        ),
    }


# ---------------------------------------------------------
# DATABASE PERSISTENCE HELPERS
# ---------------------------------------------------------

def save_benchmark_run(
    db: Session,
    result: dict,
    comparison_id: Optional[str] = None,
):
    benchmark = BenchmarkRun(
        id=result["id"],
        comparison_id=comparison_id,
        run_number=result["run_number"],
        model=result["model"],
        provider=result["provider"],
        prompt=result["prompt"],
        response=result["response"],
        latency_ms=result["latency_ms"],
        input_tokens=result["input_tokens"],
        output_tokens=result["output_tokens"],
        output_words=result["output_words"],
        total_duration_ms=result["total_duration_ms"],
        load_duration_ms=result["load_duration_ms"],
        prompt_eval_duration_ms=result["prompt_eval_duration_ms"],
        generation_duration_ms=result["generation_duration_ms"],
        tokens_per_second=result["tokens_per_second"],
        time_to_first_token_ms=result["time_to_first_token_ms"],
        success=result["success"],
        error=result["error"],
        created_at=datetime.now(timezone.utc),
    )

    db.add(benchmark)


def benchmark_to_dict(item: BenchmarkRun):
    return {
        "id": item.id,
        "comparison_id": item.comparison_id,
        "run_number": item.run_number,
        "model": item.model,
        "provider": item.provider,
        "prompt": item.prompt,
        "response": item.response,
        "latency_ms": item.latency_ms,
        "input_tokens": item.input_tokens,
        "output_tokens": item.output_tokens,
        "output_words": item.output_words,
        "total_duration_ms": item.total_duration_ms,
        "load_duration_ms": item.load_duration_ms,
        "prompt_eval_duration_ms": item.prompt_eval_duration_ms,
        "generation_duration_ms": item.generation_duration_ms,
        "tokens_per_second": item.tokens_per_second,
        "time_to_first_token_ms": item.time_to_first_token_ms,
        "success": item.success,
        "error": item.error,
        "created_at": (
            item.created_at.isoformat()
            if item.created_at
            else None
        ),
    }


def comparison_to_dict(item: Comparison):
    return {
        "id": item.id,
        "comparison_id": item.id,
        "prompt": item.prompt,
        "repeat": item.repeat,
        "model_count": item.model_count,
        "created_at": (
            item.created_at.isoformat()
            if item.created_at
            else None
        ),
        "models": item.models,
    }


def evaluation_to_dict(item: Evaluation):
    return {
        "id": item.id,
        "evaluation_id": item.id,
        "benchmark_id": item.benchmark_id,
        "prompt": item.prompt,
        "response": item.response,
        "reference_answer": item.reference_answer,
        "judge_model": item.judge_model,
        "judge_provider": item.judge_provider,
        "judge_latency_ms": item.judge_latency_ms,
        "overall_score": item.overall_score,
        "scores": item.scores,
        "reasoning": item.reasoning,
        "strengths": item.strengths,
        "weaknesses": item.weaknesses,
        "overall_feedback": item.overall_feedback,
        "created_at": (
            item.created_at.isoformat()
            if item.created_at
            else None
        ),
    }


# ---------------------------------------------------------
# HEALTH AND MODEL ROUTES
# ---------------------------------------------------------

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "llmatlas-api",
        "version": "0.7.0",
    }


@app.get("/api/models")
async def list_models(
    provider: Optional[str] = None,
    capability: Optional[str] = None,
):
    """
    List discovered models.

    Optional filters:
    - provider: ollama, mock
    - capability: general, coding, reasoning, vision, embeddings
    """

    try:
        models = await registry.list_all_models(
            provider_filter=provider,
            capability_filter=capability,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    return {
        "models": models,
        "count": len(models),
        "filters": {
            "provider": provider,
            "capability": capability,
        },
    }


# Keep this route BEFORE /api/models/{model_id}.
# Otherwise, "summary" could be interpreted as a model ID.

@app.get("/api/models/summary")
async def get_model_registry_summary():
    """
    Return registry statistics and model metadata.
    """

    return await registry.get_registry_summary()


@app.get("/api/models/{model_id}")
async def get_model_details(model_id: str):
    """
    Retrieve metadata for one installed model.
    """

    try:
        model = await registry.get_model(model_id)

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        )

    return {
        "model": model,
    }


# ---------------------------------------------------------
# BENCHMARK ROUTES
# ---------------------------------------------------------

@app.post("/api/benchmarks/run")
async def run_benchmark(
    request: BenchmarkRequest,
    db: Session = Depends(get_db),
):
    try:
        provider_name, provider = await registry.resolve_model(
            request.model
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    results = []

    for run_number in range(1, request.repeat + 1):
        try:
            generation = await provider.generate(
                model=request.model,
                prompt=request.prompt,
            )

            result = create_success_result(
                request.model,
                provider_name,
                generation,
                request.prompt,
                run_number,
            )

        except Exception as exc:
            result = create_failure_result(
                request.model,
                provider_name,
                request.prompt,
                run_number,
                exc,
            )

        results.append(result)

    try:
        for result in results:
            save_benchmark_run(db, result)

        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to save benchmark results to the database.",
        ) from exc

    return {
        **summarize_results(results),
        "results": results,
        "note": (
            "Latency includes the complete provider request. "
            "Provider timing fields are reported separately."
        ),
    }


@app.post("/api/benchmarks/compare")
async def compare_models(
    request: ComparisonRequest,
    db: Session = Depends(get_db),
):
    if len(set(request.models)) != len(request.models):
        raise HTTPException(
            status_code=422,
            detail="Duplicate model names are not allowed.",
        )

    resolved_models = []

    for model_name in request.models:
        try:
            provider_name, provider = await registry.resolve_model(
                model_name
            )

            resolved_models.append(
                (model_name, provider_name, provider)
            )

        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc))

    comparison_id = str(uuid4())
    model_results = []
    all_benchmark_results = []

    for model_name, provider_name, provider in resolved_models:
        results = []

        for run_number in range(1, request.repeat + 1):
            try:
                generation = await provider.generate(
                    model=model_name,
                    prompt=request.prompt,
                )

                result = create_success_result(
                    model_name,
                    provider_name,
                    generation,
                    request.prompt,
                    run_number,
                )

            except Exception as exc:
                result = create_failure_result(
                    model_name,
                    provider_name,
                    request.prompt,
                    run_number,
                    exc,
                )

            result["comparison_id"] = comparison_id

            results.append(result)
            all_benchmark_results.append(result)

        model_results.append({
            "model": model_name,
            "provider": provider_name,
            **summarize_results(results),
            "results": results,
        })

    comparison = {
        "id": comparison_id,
        "comparison_id": comparison_id,
        "prompt": request.prompt,
        "repeat": request.repeat,
        "model_count": len(model_results),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "models": model_results,
    }

    try:
        comparison_record = Comparison(
            id=comparison_id,
            prompt=request.prompt,
            repeat=request.repeat,
            model_count=len(model_results),
            models=model_results,
            created_at=datetime.now(timezone.utc),
        )

        db.add(comparison_record)
        db.flush()

        for result in all_benchmark_results:
            save_benchmark_run(
                db,
                result,
                comparison_id=comparison_id,
            )

        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to save comparison results to the database.",
        ) from exc

    return comparison


@app.get("/api/benchmarks/results")
async def get_benchmark_results(
    db: Session = Depends(get_db),
):
    results = (
        db.query(BenchmarkRun)
        .order_by(BenchmarkRun.created_at.desc())
        .all()
    )

    serialized = [
        benchmark_to_dict(item)
        for item in results
    ]

    return {
        "count": len(serialized),
        "results": serialized,
    }


@app.get("/api/benchmarks/comparisons")
async def get_comparison_results(
    db: Session = Depends(get_db),
):
    comparisons = (
        db.query(Comparison)
        .order_by(Comparison.created_at.desc())
        .all()
    )

    serialized = [
        comparison_to_dict(item)
        for item in comparisons
    ]

    return {
        "count": len(serialized),
        "comparisons": serialized,
    }


# ---------------------------------------------------------
# EVALUATION ROUTES
# ---------------------------------------------------------

@app.get("/api/evaluations/rubric")
async def get_evaluation_rubric():
    return {
        "scale": {
            "minimum": 1,
            "maximum": 5,
        },
        "dimensions": EVALUATION_RUBRIC,
        "rubric": EVALUATION_RUBRIC,
    }


@app.post("/api/evaluations/run")
async def run_evaluation(
    request: EvaluationRequest,
    db: Session = Depends(get_db),
):
    evaluation_id = str(uuid4())

    if request.benchmark_id:
        benchmark = (
            db.query(BenchmarkRun)
            .filter(BenchmarkRun.id == request.benchmark_id)
            .first()
        )

        if benchmark is None:
            raise HTTPException(
                status_code=404,
                detail="The supplied benchmark_id does not exist.",
            )

    try:
        result = await judge.evaluate(
            prompt=request.prompt,
            response=request.response,
            judge_model=request.judge_model,
            reference_answer=request.reference_answer,
        )

    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Evaluation failed: {str(exc)}",
        )

    evaluation = {
        "id": evaluation_id,
        "evaluation_id": evaluation_id,
        "benchmark_id": request.benchmark_id,
        "prompt": request.prompt,
        "response": request.response,
        "reference_answer": request.reference_answer,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **result,
    }

    try:
        evaluation_record = Evaluation(
            id=evaluation_id,
            benchmark_id=request.benchmark_id,
            prompt=request.prompt,
            response=request.response,
            reference_answer=request.reference_answer,
            judge_model=result["judge_model"],
            judge_provider=result.get("judge_provider"),
            judge_latency_ms=result.get("judge_latency_ms"),
            overall_score=result["overall_score"],
            scores=result["scores"],
            reasoning=result["reasoning"],
            strengths=result["strengths"],
            weaknesses=result["weaknesses"],
            overall_feedback=result.get("overall_feedback"),
            created_at=datetime.now(timezone.utc),
        )

        db.add(evaluation_record)
        db.commit()

    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to save evaluation to the database.",
        ) from exc

    return evaluation


@app.get("/api/evaluations/results")
async def get_evaluation_results(
    db: Session = Depends(get_db),
):
    evaluations = (
        db.query(Evaluation)
        .order_by(Evaluation.created_at.desc())
        .all()
    )

    serialized = [
        evaluation_to_dict(item)
        for item in evaluations
    ]

    return {
        "count": len(serialized),
        "results": serialized,
    }
