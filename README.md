# LLMatlas

**An open-source LLM benchmarking, evaluation, and performance analysis platform.**

LLMatlas is a full-stack platform designed to benchmark, compare, and evaluate Large Language Models across multiple providers. It combines model execution, performance measurement, structured evaluation, and experiment tracking in a unified engineering environment.

The goal is to make LLM experimentation reproducible, measurable, and easier to analyse.

---

## Features

### Benchmark Runner
- Execute prompts against configured language models.
- Configure repeated benchmark runs.
- Measure request latency and generation performance.
- Capture input and output token counts.
- Track tokens per second.
- Record successful and failed executions.
- Maintain benchmark execution history.

### Model Comparison
- Compare multiple models using the same prompt.
- Execute repeated runs for each model.
- Compare average and median latency.
- Analyse token throughput.
- Track success and failure rates.
- Store comparison experiments and their individual runs.

### LLM Evaluation
- Evaluate generated responses using an LLM-as-a-Judge approach.
- Support optional reference answers.
- Score responses across five evaluation dimensions:
  - Correctness
  - Relevance
  - Instruction Following
  - Completeness
  - Clarity
- Generate weighted evaluation scores.
- Store evaluation reasoning, strengths, weaknesses, and feedback.

### Experiment Persistence
- PostgreSQL-backed storage.
- SQLAlchemy ORM.
- Alembic database migrations.
- Persistent benchmark, comparison, and evaluation history.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS, custom glassmorphism UI |
| Backend | Python, FastAPI |
| Database | PostgreSQL 16 |
| ORM | SQLAlchemy |
| Migrations | Alembic |
| Model Runtime | Ollama |
| Initial Local Model | Qwen 2.5 3B |
| API Communication | HTTP / REST |

### Planned Technologies

- LangGraph for evaluation analysis and orchestration.
- Redis for caching and task coordination.
- Celery for asynchronous benchmark execution.
- Additional model provider integrations.
- Authentication and multi-user support.

---

## Architecture

```text
                  ┌─────────────────────────┐
                  │      Next.js Frontend   │
                  │                         │
                  │  Dashboard              │
                  │  Benchmark Runner       │
                  │  Model Comparison       │
                  │  Evaluations            │
                  └────────────┬────────────┘
                               │
                         REST API
                               │
                  ┌────────────▼────────────┐
                  │      FastAPI Backend    │
                  │                         │
                  │  Benchmark Engine       │
                  │  Provider Registry      │
                  │  Evaluation Engine      │
                  │  Results Management     │
                  └──────┬───────────┬──────┘
                         │           │
              ┌──────────▼───┐  ┌────▼────────────┐
              │   Ollama     │  │   SQLAlchemy   │
              │              │  │                │
              │  Qwen 2.5 3B │  │  ORM Models    │
              │  Local LLMs  │  │  Persistence   │
              └──────────────┘  └──────┬─────────┘
                                      │
                               ┌──────▼──────┐
                               │ PostgreSQL  │
                               │             │
                               │ Benchmarks  │
                               │ Comparisons │
                               │ Evaluations │
                               └─────────────┘
```

---

## Project Structure

```text
LLMatlas/
│
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   │
│   │   ├── models/
│   │   │   ├── benchmark.py
│   │   │   ├── comparison.py
│   │   │   └── evaluation.py
│   │   │
│   │   ├── services/
│   │   │   ├── evaluation/
│   │   │   │   └── judge.py
│   │   │   ├── base.py
│   │   │   ├── mock.py
│   │   │   ├── ollama.py
│   │   │   └── registry.py
│   │   │
│   │   └── main.py
│   │
│   ├── migrations/
│   ├── alembic.ini
│   └── requirements.txt
│
├── docker/
│   └── docker-compose.yml
│
├── frontend/
│   ├── app/
│   │   ├── benchmarks/
│   │   ├── compare/
│   │   ├── evaluations/
│   │   ├── components/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── package.json
│   └── package-lock.json
│
├── .env.example
├── .gitignore
└── README.md
```

---

## Getting Started

### Prerequisites

Install the following:

- Python 3.9 or later.
- Node.js and npm.
- Docker Desktop.
- Ollama.
- Git.

### 1. Clone the repository

```bash
git clone https://github.com/HaRvEysPeCteR69/LLMatlas.git
cd LLMatlas
```

### 2. Configure environment variables

Copy the example configuration:

```bash
cp .env.example .env
```

Configure your PostgreSQL credentials:

```env
POSTGRES_PASSWORD=your_secure_password
DATABASE_URL=postgresql+psycopg2://modelbench:your_secure_password@localhost:5434/modelbench
ENVIRONMENT=development
```

Use the same password in both variables.

Never commit `.env` or expose database credentials publicly.

### 3. Start PostgreSQL

```bash
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

Check the container:

```bash
docker ps
```

### 4. Set up the backend

Create and activate a virtual environment if you do not already have one:

```bash
cd frontend
python3 -m venv .venv
source .venv/bin/activate
cd ../backend
```

Install dependencies:

```bash
pip install -r requirements.txt
```

### 5. Run database migrations

```bash
../frontend/.venv/bin/alembic upgrade head
```

### 6. Configure Ollama

Install and start Ollama, then pull the initial model:

```bash
ollama pull qwen2.5:3b
```

Verify available models:

```bash
ollama list
```

### 7. Start the backend

From the `backend` directory:

```bash
PYTHONPATH=.. ../frontend/.venv/bin/uvicorn app.main:app --reload --port 8000
```

Backend:

- API: http://localhost:8000
- Swagger documentation: http://localhost:8000/docs
- Health endpoint: http://localhost:8000/api/health

### 8. Start the frontend

Open another terminal:

```bash
cd ~/Projects/LLMatlas/frontend
npm install
npm run dev
```

Frontend:

http://localhost:3000

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Backend health |
| GET | `/api/models` | List available models |
| POST | `/api/benchmarks/run` | Execute benchmark |
| POST | `/api/benchmarks/compare` | Compare multiple models |
| GET | `/api/benchmarks/results` | Retrieve benchmark history |
| GET | `/api/benchmarks/comparisons` | Retrieve comparison history |
| GET | `/api/evaluations/rubric` | Retrieve evaluation rubric |
| POST | `/api/evaluations/run` | Evaluate a model response |
| GET | `/api/evaluations/results` | Retrieve evaluation history |

Interactive API documentation is available through FastAPI Swagger at `/docs`.

---

## Benchmark Metrics

LLMatlas currently tracks:

| Metric | Description |
|---|---|
| Latency | Total provider request duration |
| Input Tokens | Number of prompt tokens |
| Output Tokens | Number of generated tokens |
| Tokens/sec | Generation throughput |
| TTFT | Time to first token, when streaming is supported |
| Model Load Time | Provider-reported model loading duration |
| Prompt Evaluation Time | Provider-reported prompt processing duration |
| Generation Time | Provider-reported generation duration |
| Success Rate | Ratio of successful executions to total runs |

Provider-specific timing metrics are retained separately rather than being treated as interchangeable measurements.

---

## Evaluation Methodology

The initial evaluation engine uses an LLM-as-a-Judge approach.

Each response is scored on a scale of 1–5 across five dimensions.

| Dimension | Weight |
|---|---:|
| Correctness | 25% |
| Relevance | 20% |
| Instruction Following | 20% |
| Completeness | 20% |
| Clarity | 15% |
| **Total** | **100%** |

The weighted score is converted to a final score out of 100.

LLM-based evaluation is subject to judge-model bias and inconsistency. Scores should be validated against reference datasets and human assessments before being treated as authoritative.

---

## Development Roadmap

- [x] Next.js frontend foundation.
- [x] FastAPI backend.
- [x] Model provider abstraction.
- [x] Mock model adapter.
- [x] Ollama integration.
- [x] Benchmark execution.
- [x] Multi-model comparison endpoint.
- [x] LLM-as-a-Judge evaluation engine.
- [x] PostgreSQL infrastructure.
- [x] SQLAlchemy models.
- [x] Alembic initial migration.
- [x] Persistent benchmark, comparison, and evaluation endpoints.
- [ ] Frontend persistence and analytics integration testing.
- [ ] Improved judge reliability and calibration.
- [ ] Additional model provider integrations.
- [ ] Streaming benchmarks and TTFT measurement.
- [ ] Authentication and multi-user support.
- [ ] User-level data isolation.
- [ ] Redis and asynchronous task execution.
- [ ] LangGraph evaluation analyst.
- [ ] Production deployment and monitoring.

---

## Current Project Status

LLMatlas is under active development.

The current implementation supports local model execution through Ollama, benchmark execution, multi-model comparison, rubric-based LLM evaluation, and PostgreSQL persistence.

Authentication, multi-user isolation, advanced evaluation calibration, asynchronous execution, and production deployment remain under development.

---

## Contributing

Contributions, bug reports, and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Implement and test your changes.
4. Submit a pull request with a clear description.

----

## License

License to be determined.
## MADE WITH LOVE % EFFORT <3
