import argparse
import json
import statistics
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[3]

DATASET_PATH = (
    PROJECT_ROOT
    / "backend"
    / "tests"
    / "evaluation"
    / "datasets"
    / "golden_cases.json"
)


def load_dataset():
    with open(DATASET_PATH, "r", encoding="utf-8") as file:
        return json.load(file)


def evaluate_case(case, api_url, judge_model):
    payload = {
        "prompt": case["prompt"],
        "response": case["response"],
        "judge_model": judge_model,
        "reference_answer": case.get("reference_answer"),
    }

    request = Request(
        api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    started = time.perf_counter()

    try:
        with urlopen(request, timeout=180) as response:
            result = json.loads(response.read().decode("utf-8"))

        elapsed = (time.perf_counter() - started) * 1000

        return {
            "success": True,
            "result": result,
            "elapsed_ms": round(elapsed, 2),
        }

    except HTTPError as error:
        return {
            "success": False,
            "error": f"HTTP {error.code}: {error.read().decode('utf-8', errors='replace')}",
        }

    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        return {
            "success": False,
            "error": str(error),
        }


def check_expectations(case, result):
    scores = result["scores"]
    overall = result["overall_score"]

    checks = {}

    expected_correctness = case.get("expected_correctness")

    if expected_correctness is not None:
        checks["correctness"] = (
            scores["correctness"] == expected_correctness
        )

    minimum = case.get("expected_min_score")
    maximum = case.get("expected_max_score")

    if minimum is not None:
        checks["minimum_score"] = overall >= minimum

    if maximum is not None:
        checks["maximum_score"] = overall <= maximum

    return checks


def main():
    parser = argparse.ArgumentParser(
        description="Run LLMatlas judge calibration."
    )

    parser.add_argument(
        "--url",
        default="http://127.0.0.1:8000/api/evaluations/run",
    )

    parser.add_argument(
        "--model",
        default="qwen2.5:3b",
    )

    args = parser.parse_args()

    cases = load_dataset()
    records = []

    print("\nMODEL BENCH AI | JUDGE CALIBRATION")
    print("=" * 65)
    print(f"Judge model: {args.model}")
    print(f"Dataset cases: {len(cases)}")
    print("=" * 65)

    for index, case in enumerate(cases, start=1):
        print(
            f"\n[{index}/{len(cases)}] "
            f"{case['id']} ({case['category']})"
        )

        outcome = evaluate_case(
            case,
            args.url,
            args.model,
        )

        if not outcome["success"]:
            print(f"FAILED: {outcome['error']}")
            records.append({
                "id": case["id"],
                "category": case["category"],
                "success": False,
                "error": outcome["error"],
            })
            continue

        result = outcome["result"]
        scores = result["scores"]

        checks = check_expectations(case, result)

        record = {
            "id": case["id"],
            "category": case["category"],
            "success": True,
            "overall_score": result["overall_score"],
            "correctness": scores["correctness"],
            "scores": scores,
            "judge_latency_ms": result.get("judge_latency_ms"),
            "elapsed_ms": outcome["elapsed_ms"],
            "checks": checks,
        }

        records.append(record)

        print(f"Overall score: {result['overall_score']}/100")
        print(f"Correctness: {scores['correctness']}/5")
        print(f"Latency: {outcome['elapsed_ms']:.0f} ms")

        for name, passed in checks.items():
            print(f"  {name}: {'PASS' if passed else 'FAIL'}")

    successful = [
        item for item in records
        if item["success"]
    ]

    print("\n" + "=" * 65)
    print("CALIBRATION SUMMARY")
    print("=" * 65)

    print(f"Total cases: {len(cases)}")
    print(f"Successful: {len(successful)}")
    print(f"Failed: {len(cases) - len(successful)}")

    if successful:
        scores = [
            item["overall_score"]
            for item in successful
        ]

        latencies = [
            item["elapsed_ms"]
            for item in successful
        ]

        print(
            f"Average overall score: "
            f"{statistics.mean(scores):.2f}/100"
        )

        print(
            f"Average latency: "
            f"{statistics.mean(latencies):.0f} ms"
        )

        for category in ("correct", "partially_correct", "incorrect"):
            category_scores = [
                item["overall_score"]
                for item in successful
                if item["category"] == category
            ]

            if category_scores:
                print(
                    f"Average {category} score: "
                    f"{statistics.mean(category_scores):.2f}"
                )

        correct_scores = [
            item["overall_score"]
            for item in successful
            if item["category"] == "correct"
        ]

        incorrect_scores = [
            item["overall_score"]
            for item in successful
            if item["category"] == "incorrect"
        ]

        if correct_scores and incorrect_scores:
            separation = (
                statistics.mean(correct_scores)
                - statistics.mean(incorrect_scores)
            )

            print(
                f"\nCorrect vs incorrect score separation: "
                f"{separation:.2f} points"
            )

            if separation < 20:
                print("WARNING: Judge discrimination is weak.")
            else:
                print("Judge demonstrates score separation.")

    failed_checks = [
        (item["id"], name)
        for item in successful
        for name, passed in item["checks"].items()
        if not passed
    ]

    print(f"\nFailed expectation checks: {len(failed_checks)}")

    for case_id, check in failed_checks:
        print(f"  {case_id}: {check}")

    report_path = (
        PROJECT_ROOT
        / "backend"
        / "tests"
        / "evaluation"
        / "calibration_report.json"
    )

    with open(report_path, "w", encoding="utf-8") as file:
        json.dump(
            {
                "judge_model": args.model,
                "total_cases": len(cases),
                "successful_cases": len(successful),
                "results": records,
            },
            file,
            indent=2,
        )

    print(f"\nReport saved to: {report_path}")


if __name__ == "__main__":
    main()
