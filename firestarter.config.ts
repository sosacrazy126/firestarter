import { groq } from '@ai-sdk/groq'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// AI provider configuration
const AI_PROVIDERS = {
  groq: {
    model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
    enabled: !!process.env.GROQ_API_KEY,
  },
  openai: {
    model: openai('gpt-4o'),
    enabled: !!process.env.OPENAI_API_KEY,
  },
  anthropic: {
    model: anthropic('claude-3-5-sonnet-20241022'),
    enabled: !!process.env.ANTHROPIC_API_KEY,
  },
}

// Get the active AI provider
function getAIModel() {
  // Only check on server side
  if (typeof window !== 'undefined') {
    return null
  }
  // Priority: Groq > OpenAI > Anthropic
  if (AI_PROVIDERS.groq.enabled) return AI_PROVIDERS.groq.model
  if (AI_PROVIDERS.openai.enabled) return AI_PROVIDERS.openai.model
  if (AI_PROVIDERS.anthropic.enabled) return AI_PROVIDERS.anthropic.model
  throw new Error('No AI provider configured. Please set GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY')
}

// Rate limiter factory
function createRateLimiter(identifier: string, requests = 50, window = '1 d') {
  if (typeof window !== 'undefined') {
    return null
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
  
  return new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(requests, window),
    analytics: true,
    prefix: `firestarter:ratelimit:${identifier}`,
  })
}

const config = {
  app: {
    name: 'Firestarter',
    url: process.env.NEXT_PUBLIC_URL || 'http://localhost:3000',
    logoPath: '/firecrawl-logo-with-fire.png',
  },

  ai: {
    model: getAIModel(),
    temperature: 0.7,
    maxTokens: 800,
    systemPrompt: `You are a helpful assistant that answers questions based ONLY on the provided context from a website. 
Answer questions comprehensively using ONLY the context provided. Do NOT use any external knowledge.
If the context doesn't contain enough information to answer the question, say so explicitly.`,
    providers: AI_PROVIDERS,
  },

  crawling: {
    defaultLimit: 10,
    maxLimit: 100,
    minLimit: 10,
    limitOptions: [10, 25, 50, 100],
    scrapeTimeout: 15000,
    cacheMaxAge: 604800,
  },

  search: {
    maxResults: 100,
    maxContextDocs: 10,
    maxContextLength: 1500,
    maxSourcesDisplay: 20,
    snippetLength: 200,
  },

  storage: {
    maxIndexes: 50,
    localStorageKey: 'firestarter_indexes',
    redisPrefix: {
      indexes: 'firestarter:indexes',
      index: 'firestarter:index:',
    },
  },

  rateLimits: {
    create: createRateLimiter('create', 20, '1 d'),
    query: createRateLimiter('query', 100, '1 h'),
    scrape: createRateLimiter('scrape', 50, '1 d'),
  },

  features: {
    enableCreation: process.env.FIRESTARTER_DISABLE_CREATION_DASHBOARD !== 'true',
    enableRedis: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    enableSearch: !!(process.env.UPSTASH_SEARCH_REST_URL && process.env.UPSTASH_SEARCH_REST_TOKEN),
  },
}

export type Config = typeof config

// Client-safe config (no AI model initialization)
export const clientConfig = {
  app: config.app,
  crawling: config.crawling,
  search: config.search,
  storage: config.storage,
  features: config.features,
}

// Server-only config (includes AI model)
export const serverConfig = config

// Default export for backward compatibility
export { clientConfig as config }