import { groq } from '@ai-sdk/groq'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
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
  google: {
    model: google('gemini-2.5-flash'),
    enabled: !!process.env.GOOGLE_AI_STUDIO_API_KEY,
  }
}

// Get the active AI provider
function getAIModel() {
  // Only check on server side
  if (typeof window !== 'undefined') {
    return null
  }
  // Priority: OpenAI > Anthropic > Google > Groq
  if (AI_PROVIDERS.openai.enabled) return AI_PROVIDERS.openai.model
  if (AI_PROVIDERS.anthropic.enabled) return AI_PROVIDERS.anthropic.model
  if (AI_PROVIDERS.google.enabled) return AI_PROVIDERS.google.model
  if (AI_PROVIDERS.groq.enabled) return AI_PROVIDERS.groq.model
  throw new Error('No AI provider configured. Please set OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_STUDIO_API_KEY, or GROQ_API_KEY')
}

// Helper to create a rate limiter
export function createRateLimiter({
  redisUrl,
  redisToken,
  windowSeconds,
  points,
}: {
  redisUrl: string
  redisToken: string
  windowSeconds: number
  points: number
}) {
  const redis = new Redis({
    url: redisUrl,
    token: redisToken,
  })
  return new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(points, `${windowSeconds} s`),
    analytics: true,
  })
}

const config = {
  app: {
    name: 'Firestarter',
    description: 'AI Copilot for crawling, search, and chat',
    contactEmail: 'support@firecrawl.dev',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://firecrawl.dev',
  },
  ai: {
    model: getAIModel, // function to get model dynamically
    temperature: 0.2,
    maxTokens: 2048,
    systemPrompt:
      'You are Firestarter, an AI assistant designed to answer questions based on website content, crawl data, and general knowledge. Format your answers in markdown.',
    followupCount: 3,
    followupTemperature: 0.7,
    followupPrompt:
      'Suggest 3 very concise follow-up questions a user might ask next, based on the above conversation.',
  },
  crawling: {
    maxPages: 50,
    maxDepth: 5,
    maxConcurrency: 5,
    requestTimeout: 30000,
    userAgent:
      'Mozilla/5.0 (compatible; FirestarterBot/1.0; +https://firecrawl.dev/bot)',
    robotsCacheSeconds: 3600,
    sitemapCacheSeconds: 3600,
    pageCacheSeconds: 3600,
    maxContentLength: 256_000, // bytes
  },
  search: {
    maxResults: 8,
    maxSourcesDisplay: 6,
    maxContextDocs: 4,
    maxContextLength: 4000,
    snippetLength: 1200,
  },
  storage: {
    maxIndexes: 8,
    maxRecordsPerIndex: 100_000,
    maxRecordBytes: 256_000,
  },
  rateLimits: {
    defaultLimit: 10,
    maxLimit: 100,
    windowSeconds: 60,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL || '',
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  },
  features: {
    enableOpenAI: true,
    enableAnthropic: true,
    enableGroq: true,
    enableGoogle: true,
    enableCrawling: true,
    enableIndexing: true,
    enableSearch: true,
    enableEmbeddings: true,
    enableChat: true,
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

// Export getAIModel for testing
export { getAIModel, AI_PROVIDERS }

// Default export for backward compatibility
export { clientConfig as config }