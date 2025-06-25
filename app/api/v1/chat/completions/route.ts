import { NextRequest, NextResponse } from 'next/server'
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { groq } from '@ai-sdk/groq'
import { google } from '@ai-sdk/google'
import { serverConfig as config } from '@/firestarter.config'

/**
 * Message type for OpenAI/Groq/Google chat models
 */
type Message = {
  role: 'user' | 'assistant' | 'system' | 'function'
  content: string
  name?: string
}
type Source = {
  url: string
  title: string
  snippet: string
}

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  process.env.NEXT_PUBLIC_APP_URL,
  'https://firecrawl.dev',
].filter(Boolean)

function getCorsHeaders(origin?: string) {
  return {
    'Access-Control-Allow-Origin':
      origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type,Authorization,X-Use-Groq,X-Use-OpenAI,X-Use-Google-AI',
  }
}

// =====================
// OPTIONS: CORS handler
// =====================
export async function OPTIONS(req: NextRequest) {
  const headers = getCorsHeaders(req.headers.get('origin') || undefined)
  return NextResponse.json({}, { status: 200, headers })
}

// =====================
// POST: Chat Completions
// =====================
export async function POST(req: NextRequest) {
  const headers = getCorsHeaders(req.headers.get('origin') || undefined)

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  const {
    model,
    messages,
    temperature = config.ai.temperature,
    max_tokens = config.ai.maxTokens,
    stream,
    ...rest
  } = body

  // Header flags
  const useGoogleAI = req.headers.get('x-use-google-ai') === 'true'
  const useGroq = req.headers.get('x-use-groq') === 'true'
  const useOpenAI = req.headers.get('x-use-openai') === 'true'

  // ========== GOOGLE GEMINI ==========
  if (useGoogleAI) {
    try {
      const aiModel = google('gemini-2.5-flash')
      if (stream) {
        const result = await streamText({
          model: aiModel,
          messages,
          temperature,
          maxTokens: max_tokens,
        })
        return result.toDataStreamResponse()
      } else {
        const result = await streamText({
          model: aiModel,
          messages,
          temperature,
          maxTokens: max_tokens,
        })
        let answer = ''
        for await (const part of result.textStream) {
          answer += part
        }
        return new Response(JSON.stringify({ answer }), {
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Error with Google Gemini: ' + (err instanceof Error ? err.message : String(err)) }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }
  }

  // ========== GROQ ==========
  else if (useGroq) {
    try {
      // Proxy to Groq API
      const groqApiKey = process.env.GROQ_API_KEY
      if (!groqApiKey) {
        return new Response(JSON.stringify({ error: 'GROQ_API_KEY not set.' }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions'
      const groqRes = await fetch(groqUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: model ?? 'mixtral-8x7b-32768',
          messages,
          temperature,
          max_tokens,
          stream,
        }),
      })
      if (stream) {
        return new Response(groqRes.body, {
          status: groqRes.status,
          headers: {
            ...headers,
            'Content-Type': groqRes.headers.get('content-type') || 'text/event-stream',
          },
        })
      } else {
        const data = await groqRes.json()
        return new Response(JSON.stringify(data), {
          status: groqRes.status,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Error with Groq: ' + (err instanceof Error ? err.message : String(err)) }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }
  }

  // ========== OPENAI ==========
  else if (useOpenAI) {
    try {
      const openaiApiKey = process.env.OPENAI_API_KEY
      if (!openaiApiKey) {
        return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set.' }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }
      const openaiUrl = 'https://api.openai.com/v1/chat/completions'
      const openaiRes = await fetch(openaiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: model ?? 'gpt-4o',
          messages,
          temperature,
          max_tokens,
          stream,
        }),
      })

      if (stream) {
        // Stream OpenAI SSE
        return new Response(openaiRes.body, {
          status: openaiRes.status,
          headers: {
            ...headers,
            'Content-Type': openaiRes.headers.get('content-type') || 'text/event-stream',
          },
        })
      } else {
        const data = await openaiRes.json()
        // Optionally add follow-up questions if enabled
        if (config.ai.followupCount > 0 && Array.isArray(messages)) {
          // Only for non-streaming, at end
          try {
            const lastUserContent =
              messages.filter((m: Message) => m.role === 'user').pop()?.content || ''
            const followupRes = await fetch(openaiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`,
              },
              body: JSON.stringify({
                model: model ?? 'gpt-4o',
                messages: [
                  { role: 'system', content: config.ai.followupPrompt },
                  { role: 'user', content: lastUserContent },
                ],
                temperature: config.ai.followupTemperature,
                max_tokens: 128,
                stream: false,
              }),
            })
            const followupData = await followupRes.json()
            if (
              followupData &&
              followupData.choices &&
              followupData.choices[0] &&
              followupData.choices[0].message &&
              typeof followupData.choices[0].message.content === 'string'
            ) {
              data.followup = followupData.choices[0].message.content
            }
          } catch (e) {
            // Ignore followup errors
          }
        }
        return new Response(JSON.stringify(data), {
          status: openaiRes.status,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Error with OpenAI: ' + (err instanceof Error ? err.message : String(err)) }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }
  }

  // ========== FIRECRAWL NAMESPACE LOGIC ==========
  else if (model && typeof model === 'string' && model.startsWith('firecrawl-')) {
    // Firecrawl custom namespace model
    // Model format: "firecrawl-NAMESPACE"
    const parts = model.split('-')
    const namespace = parts.length > 1 ? parts.slice(1).join('-') : ''
    if (!namespace) {
      return new Response(
        JSON.stringify({ error: 'Invalid Firecrawl model format. Use firecrawl-NAMESPACE.' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }
    // Forward to /api/firestarter/query
    const firecrawlUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/firestarter/query`
    try {
      // Support both streaming and non-streaming
      const queryBody = {
        query: messages?.filter((m: Message) => m.role === 'user').pop()?.content || '',
        namespace,
        stream,
        messages,
      }
      const firecrawlRes = await fetch(firecrawlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queryBody),
      })

      if (stream) {
        // Stream the response
        return new Response(firecrawlRes.body, {
          status: firecrawlRes.status,
          headers: {
            ...headers,
            'Content-Type': firecrawlRes.headers.get('content-type') || 'text/event-stream',
          },
        })
      } else {
        // Non-streaming
        const data = await firecrawlRes.json()
        return new Response(JSON.stringify(data), {
          status: firecrawlRes.status,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Error with Firecrawl namespace: ' + (err instanceof Error ? err.message : String(err)) }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }
  }

  // ========== DEFAULT: PROVIDER NOT CONFIGURED ==========
  return new Response(
    JSON.stringify({ error: 'AI Provider not configured or invalid request.' }),
    { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
  )
}