# Firestarter Twitter Thread

## Thread 1: Launch Announcement

**Tweet 1/8** 🔥
Just open sourced Firestarter - turn any website into an AI chatbot in 60 seconds.

Enter URL → Get instant RAG-powered chatbot with OpenAI-compatible API.

Built with @firecrawl_dev + @upstash + @vercel AI SDK.

github.com/mendableai/firestarter

**Tweet 2/8**
The problem: Enterprise chatbot solutions cost $1000s/month and operate as black boxes.

Documentation sites, SaaS platforms, and content-heavy sites need better ways to make their content queryable.

We built Firestarter to democratize this technology.

**Tweet 3/8**
How it works:

1. Submit any URL
2. Firecrawl extracts clean content from JS-heavy sites
3. Smart chunking preserves context
4. Upstash vector DB enables instant semantic search
5. Get a chatbot that actually knows your content

No hallucinations. Just facts from your site.

**Tweet 4/8**
The killer feature: OpenAI-compatible API for each chatbot.

```python
client = OpenAI(
    base_url="your-firestarter.vercel.app/api/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="firecrawl-your-site-12345",
    messages=[{"role": "user", "content": "How do I get started?"}]
)
```

**Tweet 5/8**
Technical highlights:
- Edge-first architecture (sub-10ms cold starts)
- Namespace isolation for multi-tenancy
- Streaming responses via Vercel AI SDK
- Smart context window optimization
- Hybrid search (vectors + metadata)

Full production-grade RAG pipeline.

**Tweet 6/8**
Deploy in 1 click with @vercel:

vercel.com/new/clone?repository-url=github.com/mendableai/firestarter

Or run locally:
```bash
git clone github.com/mendableai/firestarter
npm install
npm run dev
```

**Tweet 7/8**
This is just v1. Roadmap includes:
- Incremental re-indexing
- HyDE for better retrieval
- Re-ranking models
- Auth & rate limiting
- Support for more vector DBs

PRs welcome! Let's build the future of conversational AI together.

**Tweet 8/8**
Try it now: [demo link]
Read the technical deep dive: [blog post]
Star on GitHub: github.com/mendableai/firestarter

Built by @mendableai - we're on a mission to make AI more accessible through open source.

What site will you turn into a chatbot first? 👇

---

## Thread 2: Technical Deep Dive

**Tweet 1/6** 🧵 Technical deep dive on Firestarter's RAG pipeline:

We solved 3 major challenges when building production-grade website chatbots:

1. JS-heavy sites
2. Preventing hallucinations
3. Sub-second response times

Here's how 👇

**Tweet 2/6**
Challenge 1: Modern docs are SPAs

Firecrawl's headless browser waits for JS rendering:
```typescript
{
  waitForSelector: '[data-content-loaded]',
  excludePatterns: ['/api/*', '*.pdf'],
  respectRobotsTxt: true
}
```

Clean Markdown extraction preserves structure without the bloat.

**Tweet 3/6**
Challenge 2: LLMs love to hallucinate

Our solution: Strict prompt engineering + context validation
```typescript
"You MUST only answer based on provided context.
If context doesn't contain info, say:
'I don't have information about that in my knowledge base.'"
```

No made-up answers.

**Tweet 4/6**
Challenge 3: Fast responses at scale

Multi-layer optimization:
- Upstash serverless vectors (global replication)
- Edge functions (Vercel)
- Smart caching (LRU for embeddings)
- Streaming first token <500ms

Result: ChatGPT-like speed from your own content.

**Tweet 5/6**
The secret sauce: Context window optimization

```typescript
const context = selectOptimalContext(chunks, {
  maxTokens: 8000,
  diversityThreshold: 0.7,  // Avoid redundant chunks
  recencyBias: true         // Prefer updated content
});
```

More context ≠ better answers. Quality > quantity.

**Tweet 6/6**
Best part? It's all open source.

No vendor lock-in. No black boxes. Just clean, understandable code you can deploy, modify, and extend.

Check out the architecture: github.com/mendableai/firestarter

What technical challenge should we tackle next?

---

## Thread 3: Use Cases & Community

**Tweet 1/5** 💡 5 ways developers are using Firestarter:

1. Documentation chatbots that actually work
2. Internal knowledge base assistants  
3. Customer support automation
4. Content discovery for large sites
5. API integration testing

Here's what our community built in week 1 👇

**Tweet 2/5**
@developer built a chatbot for React docs that answers version-specific questions.

"Finally, a chatbot that knows the difference between React 17 and 18 APIs!"

The OpenAI-compatible API means it works directly in their VSCode extension.

**Tweet 3/5**
@startup used Firestarter to index their 500+ page knowledge base.

Before: Support team spent hours finding answers
After: Instant, accurate responses with source citations

Cost: $0 (vs $2k/month for enterprise alternatives)

**Tweet 4/5**
@opensource_project integrated Firestarter to help new contributors.

The chatbot answers:
- "Where is X implemented?"
- "How do I set up the dev environment?"
- "What's the contribution process?"

PRs from new contributors up 40%. 🚀

**Tweet 5/5**
Want to contribute? We need help with:

- Alternative vector DB adapters
- Self-hosted embedding models  
- Better chunking algorithms
- Docker packaging
- Non-English optimizations

Join us: github.com/mendableai/firestarter

What would you build with Firestarter? 🔥