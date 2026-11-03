from time import perf_counter
from typing import Optional

import httpx

from app.services.base import GenerationResult, ModelProvider


class OllamaProvider(ModelProvider):
    """Provider adapter for local or remote Ollama instances."""

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        api_key: Optional[str] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.headers = {}

        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"

    @staticmethod
    def _nanoseconds_to_ms(value):
        if value is None:
            return None

        return round(value / 1_000_000, 3)

    async def health_check(self) -> dict:
        """Check whether the configured Ollama instance is reachable."""

        try:
            async with httpx.AsyncClient(
                timeout=10.0,
                headers=self.headers,
            ) as client:
                response = await client.get(
                    f"{self.base_url}/api/tags"
                )
                response.raise_for_status()

            return {
                "status": "connected",
                "base_url": self.base_url,
            }

        except httpx.HTTPStatusError as exc:
            return {
                "status": "unhealthy",
                "base_url": self.base_url,
                "error": f"HTTP {exc.response.status_code}",
            }

        except httpx.RequestError as exc:
            return {
                "status": "unavailable",
                "base_url": self.base_url,
                "error": str(exc),
            }

    async def generate(
        self,
        model: str,
        prompt: str,
    ) -> GenerationResult:

        start = perf_counter()

        async with httpx.AsyncClient(
            timeout=300.0,
            headers=self.headers,
        ) as client:
            response = await client.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                },
            )

            response.raise_for_status()
            data = response.json()

        latency_ms = (perf_counter() - start) * 1000

        input_tokens = data.get("prompt_eval_count")
        output_tokens = data.get("eval_count")

        total_duration_ms = self._nanoseconds_to_ms(
            data.get("total_duration")
        )

        load_duration_ms = self._nanoseconds_to_ms(
            data.get("load_duration")
        )

        prompt_eval_duration_ms = self._nanoseconds_to_ms(
            data.get("prompt_eval_duration")
        )

        generation_duration_ms = self._nanoseconds_to_ms(
            data.get("eval_duration")
        )

        generation_duration_ns = data.get("eval_duration")
        tokens_per_second = None

        if (
            output_tokens is not None
            and generation_duration_ns
            and generation_duration_ns > 0
        ):
            tokens_per_second = round(
                output_tokens
                / (generation_duration_ns / 1_000_000_000),
                3,
            )

        return GenerationResult(
            text=data.get("response", ""),
            latency_ms=round(latency_ms, 3),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_duration_ms=total_duration_ms,
            load_duration_ms=load_duration_ms,
            prompt_eval_duration_ms=prompt_eval_duration_ms,
            generation_duration_ms=generation_duration_ms,
            tokens_per_second=tokens_per_second,
            time_to_first_token_ms=None,
        )

    async def list_models(self) -> list:
        """Retrieve installed models from the configured Ollama instance."""

        async with httpx.AsyncClient(
            timeout=10.0,
            headers=self.headers,
        ) as client:
            response = await client.get(
                f"{self.base_url}/api/tags"
            )

            response.raise_for_status()
            data = response.json()

        models = []

        for model in data.get("models", []):
            details = model.get("details", {})

            models.append(
                {
                    "id": model["name"],
                    "name": model["name"],
                    "provider": "ollama",
                    "configured": True,
                    "size": model.get("size"),
                    "parameter_size": details.get("parameter_size"),
                    "quantization_level": details.get(
                        "quantization_level"
                    ),
                    "family": details.get("family"),
                }
            )

        return models