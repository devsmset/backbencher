# A hand-rolled LLM adapter layer with per-task model routing

Backbencher must run against Anthropic, Google (Gemini/Gemma), and any locally hosted model, and its
tasks have wildly different cost and capability profiles: composing a scenario needs a strong model,
while suggesting catalog annotations across hundreds of operations and embedding text for retrieval
are bulk jobs a small local model handles fine. We are building our own `@backbencher/llm` package —
a `Provider` interface (`complete`, `completeJson`, `embed`, `capabilities`) with one adapter per
vendor plus a single `openai-compatible` adapter covering Ollama, vLLM, LM Studio, LiteLLM and
OpenAI — and routing each task to its own configured model, rather than adopting the Vercel AI SDK or
running a LiteLLM proxy.

## Considered options

- **Vercel AI SDK**: covers the provider matrix well, but pulls a large surface area for the three
  calls we make, and its abstraction is oriented around streaming chat UIs rather than one-shot
  structured extraction.
- **LiteLLM proxy**: excellent provider coverage, but adds a process an analyst must run locally
  before the tool works at all, which conflicts with the goal of a local-first, offline-capable setup.
- **Keep the current two Anthropic SDKs**: rejected outright; both existing "providers" are Anthropic
  (`anthropic` and Claude-on-Vertex), so there is no non-Anthropic path today.

## Consequences

- Every provider-native structured-output mechanism (Anthropic tool use, Gemini `responseSchema`,
  Ollama `format`) must be implemented per adapter. Adapters declare this in `capabilities`, and a
  model that cannot produce constrained JSON is refused for composition rather than allowed to fail
  at parse time.
- Retrieval embeddings are a **separate axis** from completions: Anthropic offers no embedding API,
  so the embedding model is configured independently of the completion model.
- Every call is stateless — `(system, user) → text`. Multi-turn message arrays may exist inside an
  adapter for tool use, but conversation state never crosses the interface. The existing repair loops
  re-send one augmented prompt rather than continuing a conversation, and must keep doing so.
- Embedding vectors are stored in SQLite and scanned brute-force with cosine similarity rather than
  kept in a vector store. The corpus is a few thousand rows at most; a vector database would be a
  second piece of infrastructure for no measurable gain. Rows carry the embedding model name and a
  hash of their source text, so swapping providers self-invalidates the cache.
