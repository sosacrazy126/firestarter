import { NextResponse } from 'next/server'
import { serverConfig as config } from '@/firestarter.config'
import { headers } from 'next/headers'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const headersList = headers()
    const useGoogleAI = headersList.get('X-Use-Google-AI') === 'true'
    
    const { messages, stream = false } = body

    if (useGoogleAI) {
      const googleApiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
      
      if (!googleApiKey) {
        return NextResponse.json(
          {
            error: {
              message: 'Google AI Studio API key not configured',
              type: 'configuration_error',
              code: 500
            }
          },
          { status: 500 }
        )
      }

      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages,
          model: 'gemini-2.5-flash',
          stream,
          temperature: body.temperature || config.ai.temperature,
          max_tokens: body.max_tokens || config.search.maxContextLength,
        })
      })

      if (!response.ok) {
        const error = await response.json()
        return NextResponse.json(
          { error },
          { status: response.status }
        )
      }

      // Handle streaming responses
      if (stream) {
        const reader = response.body?.getReader()
        const encoder = new TextEncoder()
        const decoder = new TextDecoder()

        return new Response(
          new ReadableStream({
            async start(controller) {
              try {
                while (true) {
                  const { done, value } = await reader!.read()
                  if (done) break
                  
                  const chunk = decoder.decode(value)
                  controller.enqueue(encoder.encode(chunk))
                }
                controller.close()
              } catch (error) {
                controller.error(error)
              }
            }
          }),
          {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          }
        )
      }

      // Handle regular responses
      const data = await response.json()
      return NextResponse.json(data)
    }

    // Handle other providers...
    return NextResponse.json(
      { error: 'Provider not configured' },
      { status: 400 }
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        error: {
          message: error.message,
          type: 'server_error',
          code: 500
        }
      },
      { status: 500 }
    )
  }
}