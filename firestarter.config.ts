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

// ... rest of the config file remains the same
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