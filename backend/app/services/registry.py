from typing import Optional

from app.core.config import (
    MOCK_PROVIDER_ENABLED,
    OLLAMA_API_KEY,
    OLLAMA_BASE_URL,
    OLLAMA_ENABLED,
)
from app.services.base import ModelProvider
from app.services.mock import MockProvider
from app.services.ollama import OllamaProvider


class ProviderRegistry:

    def __init__(self):
        self.providers: dict[str, ModelProvider] = {}

        if MOCK_PROVIDER_ENABLED:
            self.providers["mock"] = MockProvider()

        if OLLAMA_ENABLED:
            self.providers["ollama"] = OllamaProvider(
                base_url=OLLAMA_BASE_URL,
                api_key=OLLAMA_API_KEY,
            )

    @staticmethod
    def classify_model(model: dict) -> list:
        name = model.get("name", "").lower()
        family = model.get("family", "").lower()

        capabilities = ["general"]

        if "coder" in name or "code" in name:
            capabilities.append("coding")

        if (
            "reasoning" in name
            or "deepseek-r1" in name
            or "qwen3" in name
            or "phi" in name
        ):
            capabilities.append("reasoning")

        if "vision" in name or "gemma3" in family:
            capabilities.append("vision")

        if "embed" in name:
            capabilities.append("embeddings")

        return list(dict.fromkeys(capabilities))

    @staticmethod
    def enrich_model(model: dict) -> dict:
        enriched = dict(model)

        enriched.setdefault("id", enriched.get("name"))
        enriched.setdefault("name", enriched.get("id"))

        enriched["provider"] = enriched.get("provider", "unknown")
        enriched["configured"] = bool(
            enriched.get("configured", False)
        )

        enriched["parameter_size"] = enriched.get("parameter_size")
        enriched["quantization_level"] = enriched.get(
            "quantization_level"
        )
        enriched["family"] = enriched.get("family")

        size_bytes = enriched.get("size")
        enriched["size_bytes"] = size_bytes

        if isinstance(size_bytes, (int, float)):
            enriched["size_gb"] = round(
                size_bytes / (1024 ** 3), 2
            )
        else:
            enriched["size_gb"] = None

        enriched["capabilities"] = (
            ProviderRegistry.classify_model(enriched)
        )

        return enriched

    def get_provider(self, provider_name: str) -> ModelProvider:
        provider = self.providers.get(provider_name)

        if provider is None:
            raise ValueError(
                f"Provider '{provider_name}' is not registered."
            )

        return provider

    async def resolve_model(self, model_identifier: str):
        matches = []

        for provider_name, provider in self.providers.items():
            try:
                models = await provider.list_models()

                for model in models:
                    if (
                        model_identifier == model.get("id")
                        or model_identifier == model.get("name")
                    ):
                        matches.append((provider_name, provider))

            except Exception:
                continue

        if not matches:
            raise ValueError(
                f"Model '{model_identifier}' was not found "
                "in any available provider."
            )

        if len(matches) > 1:
            raise ValueError(
                f"Model '{model_identifier}' exists in multiple "
                "providers. Use a unique model identifier."
            )

        return matches[0]

    async def list_all_models(
        self,
        provider_filter: Optional[str] = None,
        capability_filter: Optional[str] = None,
    ) -> list:

        models = []

        providers = self.providers.items()

        if provider_filter:
            provider = self.providers.get(provider_filter)

            if provider is None:
                raise ValueError(
                    f"Provider '{provider_filter}' is not registered."
                )

            providers = [(provider_filter, provider)]

        for provider_name, provider in providers:
            try:
                provider_models = await provider.list_models()

                for model in provider_models:
                    enriched = self.enrich_model(model)
                    enriched["provider"] = provider_name
                    models.append(enriched)

            except Exception:
                continue

        if capability_filter:
            models = [
                model
                for model in models
                if capability_filter in model["capabilities"]
            ]

        return models

    async def get_model(self, model_identifier: str) -> dict:
        models = await self.list_all_models()

        for model in models:
            if (
                model.get("id") == model_identifier
                or model.get("name") == model_identifier
            ):
                return model

        raise ValueError(
            f"Model '{model_identifier}' was not found."
        )

    async def get_registry_summary(self) -> dict:
        models = await self.list_all_models()

        providers = sorted({
            model["provider"] for model in models
        })

        capabilities = {}

        for model in models:
            for capability in model["capabilities"]:
                capabilities[capability] = (
                    capabilities.get(capability, 0) + 1
                )

        return {
            "total_models": len(models),
            "providers": providers,
            "capability_counts": capabilities,
            "models": models,
        }


registry = ProviderRegistry()