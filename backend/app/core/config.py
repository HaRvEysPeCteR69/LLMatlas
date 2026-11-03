import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(PROJECT_ROOT / ".env")


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)

    if value is None:
        return default

    return value.strip().lower() in {"1", "true", "yes", "on"}


DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not configured.")

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Provider configuration
OLLAMA_ENABLED = env_bool("OLLAMA_ENABLED", True)
OLLAMA_BASE_URL = os.getenv(
    "OLLAMA_BASE_URL",
    "http://localhost:11434",
).rstrip("/")

OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY") or None

MOCK_PROVIDER_ENABLED = env_bool(
    "MOCK_PROVIDER_ENABLED",
    True,
)

# CORS configuration
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:3001",
    ).split(",")
    if origin.strip()
]