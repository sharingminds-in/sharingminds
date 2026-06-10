# Infinity AI Service

Python service boundary for Infinity AI orchestration, LLM calls, trace capture, and deterministic expert routing support.

## Local API

From Windows PowerShell:

```powershell
cd C:\Users\Raf\Desktop\Projects\YM\young-minds-landing-page\services\infinity-ai
uv sync --group dev
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## LLM Provider Routing

Infinity AI uses an internal LLM router so orchestration can call one provider interface while provider/model choice stays configurable.

Common provider routing env:

```text
INFINITY_AI_LLM_PROVIDER=router
INFINITY_AI_LLM_PROVIDER_ORDER=groq,gemini
INFINITY_AI_LLM_STRICT_STRUCTURED_OUTPUT=true
INFINITY_AI_LLM_REQUEST_TIMEOUT_SECONDS=45
INFINITY_AI_LLM_MAX_RETRIES=1
INFINITY_AI_LLM_RATE_LIMIT_BACKOFF_SECONDS=0.75
INFINITY_AI_LLM_DISALLOWED_PROVIDERS=
INFINITY_AI_LLM_DISALLOWED_MODELS=
INFINITY_AI_LLM_ALLOWED_FALLBACK_MODELS=gemini:gemini-2.5-flash
```

Provider API keys:

```text
INFINITY_AI_GEMINI_API_KEY=
INFINITY_AI_GROQ_API_KEY=
INFINITY_AI_OPENROUTER_API_KEY=
INFINITY_AI_OPENAI_API_KEY=
INFINITY_AI_AZURE_API_KEY=
INFINITY_AI_AZURE_ENDPOINT=
INFINITY_AI_AZURE_API_VERSION=2024-05-01-preview
```

Task-specific model envs:

```text
INFINITY_AI_LLM_PLANNER_MODEL=
INFINITY_AI_LLM_COMPOSER_MODEL=
INFINITY_AI_LLM_EXTRACTOR_MODEL=
INFINITY_AI_LLM_SUMMARIZER_MODEL=
INFINITY_AI_LLM_REPAIR_MODEL=
```

Provider-specific task model envs are also supported, such as:

```text
INFINITY_AI_GEMINI_PLANNER_MODEL=gemini-2.5-flash-lite
INFINITY_AI_GEMINI_COMPOSER_MODEL=gemini-2.5-flash-lite
INFINITY_AI_GROQ_PLANNER_MODEL=openai/gpt-oss-20b
INFINITY_AI_GROQ_COMPOSER_MODEL=openai/gpt-oss-20b
INFINITY_AI_GROQ_EXTRACTOR_MODEL=openai/gpt-oss-20b
INFINITY_AI_GROQ_SUMMARIZER_MODEL=openai/gpt-oss-20b
INFINITY_AI_GROQ_REPAIR_MODEL=openai/gpt-oss-20b
INFINITY_AI_OPENROUTER_MODEL=
INFINITY_AI_OPENROUTER_PROVIDER_ORDER=
INFINITY_AI_AZURE_MODEL=
INFINITY_AI_AZURE_PLANNER_MODEL=
INFINITY_AI_AZURE_COMPOSER_MODEL=
INFINITY_AI_AZURE_EXTRACTOR_MODEL=
INFINITY_AI_AZURE_SUMMARIZER_MODEL=
INFINITY_AI_AZURE_REPAIR_MODEL=
```

Gemini defaults to `gemini-2.5-flash-lite`. The approved Gemini fallback is `gemini-2.5-flash`, explicitly allowlisted as `gemini:gemini-2.5-flash`; the Gemini adapter sends `thinkingBudget=0`.

OpenRouter is intentionally constrained: configure an explicit model and `INFINITY_AI_OPENROUTER_PROVIDER_ORDER`; the adapter sends `allow_fallbacks=false` and `require_parameters=true`.

Azure AI Foundry is supported through the provider name `azure`. Configure `INFINITY_AI_AZURE_ENDPOINT`, `INFINITY_AI_AZURE_API_KEY`, and either `INFINITY_AI_AZURE_MODEL` or task-specific Azure model envs. The endpoint can be a Foundry Models endpoint such as `https://<resource>.services.ai.azure.com`, an Azure OpenAI resource endpoint such as `https://<resource>.openai.azure.com`, or a full Azure Responses API URL such as `https://<resource>.cognitiveservices.azure.com/openai/responses?api-version=...`. The adapter normalizes Foundry Models and Azure OpenAI resource endpoints to `/models` and `/openai/v1` respectively, supports full `/openai/responses` URLs directly, and keeps strict structured output validation enabled. Foundry Models uses `INFINITY_AI_AZURE_API_VERSION`, defaulting to `2024-05-01-preview`.

## LangGraph Studio Local Dev

LangGraph Studio support is local/dev-only. It is for inspecting the graph shape and node traces during development. It does not replace the production review path, which remains the internal/admin trace endpoint in the Next.js platform:

```text
GET /api/internal/infinity-ai/conversations/:conversationId/trace
```

Studio uses `app/orchestration/studio.py`, which wraps the same graph node sequence with:

- a mock platform client
- a fake structured LLM provider
- a sample authenticated actor
- a sample conversation id
- sample policy context, prior turns, signal snapshot, and memory

It does not call the Next.js platform bridge, Supabase, Gemini, OpenAI, or any production persistence path.

From Windows PowerShell:

```powershell
cd C:\Users\Raf\Desktop\Projects\YM\young-minds-landing-page\services\infinity-ai
uv sync --group dev
uv run --with "langgraph-cli[inmem]" langgraph dev --config .\langgraph.json
```

Open the LangGraph Studio URL printed by the CLI. The local graph name is:

```text
infinity_ai
```

No provider API key is required for Studio mock mode. Do not put real API keys in `langgraph.json` or commit local `.env` files.

Useful import/config validation:

```powershell
uv run python -m json.tool .\langgraph.json
uv run python -c "from app.orchestration.studio import STUDIO_SAMPLE_INPUTS, graph; print(graph is not None); print(STUDIO_SAMPLE_INPUTS)"
```

Studio sample inputs:

```text
Hi
Tell me a joke
I need help deciding between a masters in Australia and getting a job
Actually I want to do computer science
Recommend mentors
```

## Local Smoke Run Capture

Completed and failed local/staging conversation turns are appended as sanitized JSONL records:

```text
logs/smoke-runs.jsonl
```

The file is gitignored. Records include graph ids, actor type, user message, response blocks, provider/model attempts, LLM calls, token usage, node traces, signal updates, memory update count, recommendation summary, and failure details when present. API keys, auth headers, cookies, bearer tokens, internal secrets, and service-role keys are redacted before writing.

Review the latest runs from Windows PowerShell:

```powershell
Get-Content .\logs\smoke-runs.jsonl -Tail 20
```

## Tests

From Windows PowerShell:

```powershell
cd C:\Users\Raf\Desktop\Projects\YM\young-minds-landing-page\services\infinity-ai
uv run --group dev pytest -q
```
