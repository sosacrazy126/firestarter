/**
 * @jest-environment node
 */
import { getAIModel, AI_PROVIDERS } from './firestarter.config'

// Helper to clear environment variables between tests
function resetEnv() {
  delete process.env.OPENAI_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.GROQ_API_KEY
  delete process.env.GOOGLE_AI_STUDIO_API_KEY
}

describe('AI Provider Selection', () => {
  beforeEach(() => {
    resetEnv()
    jest.resetModules()
  })

  it('selects Google Gemini when only GOOGLE_AI_STUDIO_API_KEY is set', () => {
    process.env.GOOGLE_AI_STUDIO_API_KEY = 'test-google-key'
    // Re-import after changing env
    const { getAIModel: getAIModelReloaded } = require('./firestarter.config')
    const model = getAIModelReloaded()
    expect(model).toBeDefined()
    expect(model.provider).toBe('google')
    expect(model.model).toBe('gemini-2.5-flash')
  })

  it('selects OpenAI when OPENAI_API_KEY is set, despite Google key', () => {
    process.env.GOOGLE_AI_STUDIO_API_KEY = 'test-google-key'
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const { getAIModel: getAIModelReloaded } = require('./firestarter.config')
    const model = getAIModelReloaded()
    expect(model).toBeDefined()
    expect(model.provider).toBe('openai')
  })

  it('selects Anthropic when ANTHROPIC_API_KEY is set, but not OpenAI', () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    process.env.GOOGLE_AI_STUDIO_API_KEY = 'test-google-key'
    const { getAIModel: getAIModelReloaded } = require('./firestarter.config')
    const model = getAIModelReloaded()
    expect(model).toBeDefined()
    expect(model.provider).toBe('anthropic')
  })

  it('throws if no API keys are set', () => {
    expect(() => getAIModel()).toThrow('No AI provider configured')
  })
})