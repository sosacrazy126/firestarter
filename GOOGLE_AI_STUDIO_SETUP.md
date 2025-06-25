# Google AI Studio (Gemini) Integration Guide  
Firestarter ≥ v1.3.0  

Welcome! This document walks you through enabling and using Google AI Studio’s **Gemini** models inside Firestarter while retaining full backward-compatibility with the existing OpenAI, Anthropic and Groq flows.

---

## 1 — Prerequisites

| Requirement | Why | Link |
|-------------|-----|------|
| Gemini API key (`GEMINI_API_KEY`) | Authenticates requests to Gemini models | https://makersuite.google.com/app/apikey |
| At least one other provider key (optional) | For automatic fallback (OpenAI → Anthropic → Google → Groq) | Respective dashboards |
| Firestarter ≥ commit `gemini-integration` | Contains the new provider code | — |
| Node ≥ 18 & bun/pnpm install completed | Builds Firestarter | — |

---

## 2 — Installation Steps

1. **Dependencies**  
   `@ai-sdk/google` is already declared in `package.json`.  
   If you are upgrading manually:
   ```
   pnpm add @ai-sdk/google
   ```
2. **Environment variables**  
   Add the following to your `.env` (or create `.env.local`):

   ```
   GEMINI_API_KEY=AIza****************************************
   ```

   Optional: copy from `.env.example`.

3. **Configuration**  
   `firestarter.config.ts` has been extended:

   ```ts
   import { google } from '@ai-sdk/google'

   const AI_PROVIDERS = {
     ...
     google: {
       model: google('gemini-2.5-flash'),
       enabled: !!process.env.GEMINI_API_KEY,
     },
   }
   ```

   The `getAIModel()` resolver now inserts Google between Anthropic and Groq.

4. **Verify setup**

   ```
   curl http://localhost:3000/api/check-env
   ```

   Successful output should contain `"GEMINI_API_KEY": true`.

---

## 3 — Using Gemini in Firestarter

### 3.1 OpenAI-Compatible Chat Endpoint

```
POST /api/v1/chat/completions
```

| Header | Value |
|--------|-------|
| `X-Use-Google` | `true` |

Example (non-streaming):

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Use-Google: true" \
  -d '{
        "messages":[{"role":"user","content":"Hello Gemini!"}],
        "stream": false
      }'
```

Streaming (`text/event-stream`) is enabled by setting `"stream": true`.

### 3.2 Firestarter Query Endpoint (RAG)

```
POST /api/firestarter/query
```

No special header needed; the global provider resolver picks Gemini automatically when:

1. `OPENAI_API_KEY` **not** set  
2. `ANTHROPIC_API_KEY` **not** set  
3. `GEMINI_API_KEY` **is** set  

Body example:

```json
{
  "query": "What does the docs page say about pricing?",
  "namespace": "example.com",
  "stream": true
}
```

---

## 4 — Behaviour Details

| Feature | Implementation |
|---------|----------------|
| Model ID | `gemini-2.5-flash` (default) |
| Streaming | Relays Google’s native SSE stream directly |
| Temperature / Max tokens | Inherited from request body or `firestarter.config.ts` |
| Fallback chain | OpenAI → Anthropic → **Google** → Groq |
| CORS | `X-Use-Google` added to `Access-Control-Allow-Headers` |

---

## 5 — Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `500 server_error` with message “Gemini API key not configured” | ENV var missing / wrong | Add `GEMINI_API_KEY` and restart |
| `Google AI Studio API error` with `403` | Invalid / expired key | Regenerate key in MakerSuite |
| Empty response text | Model quota exhausted | Check usage limits in Google Cloud console |
| Provider ignored, falls back to Groq | Header missing or higher-priority key present | Ensure `X-Use-Google: true` **and** unset conflicting keys if testing |
| CORS preflight fails | Custom header not allowed | Confirm latest Firestarter version (adds `X-Use-Google`) |

---

## 6 — Rate Limits & Cost Control

Gemini models can be rate-limited. Firestarter’s Upstash Redis rate-limiter **does not** throttle Gemini by default. You can:

```ts
rateLimits: {
  googleChat: createRateLimiter('google-chat', 1000, '1 h')
}
```

Place the snippet inside `firestarter.config.ts`.

---

## 7 — Extending or Changing Models

To switch to a different Gemini model (e.g., `gemini-2.5-pro`):

```ts
google: {
  model: google('gemini-2.5-pro'),
  enabled: !!process.env.GEMINI_API_KEY,
},
```

Restart the dev server afterwards.

---

## 8 — FAQs

**Q: Do I need to remove other provider keys?**  
A: No. Gemini is automatically chosen only when it has higher priority or you explicitly send `X-Use-Google: true`.

**Q: Is the response format identical to OpenAI?**  
A: Yes. The `/chat/completions` wrapper normalises Gemini’s output to OpenAI JSON. Streaming also mirrors OpenAI’s SSE chunk schema.

**Q: Where is the provider code located?**  
A:  
- `firestarter.config.ts` – registration & priority  
- `app/api/v1/chat/completions/route.ts` – Google branch for chat  
- `app/api/firestarter/query/route.ts` – Google added to resolver  

---

## 9 — Changelog

| Version | Notes |
|---------|-------|
| 1.3.0 | Initial Google AI Studio (Gemini) support |
| 1.3.1 | Added `.env.example` and environment check endpoint update |
