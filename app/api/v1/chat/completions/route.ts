import { NextRequest, NextResponse } from 'next/server'
import { serverConfig as config } from '@/firestarter.config'

// CORS headers for API access
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Use-Groq, X-Use-OpenAI',
      'Access-Control-Max-Age': '86400',
    },
  })
}

// OpenAI-compatible chat completions endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messages, model, stream = false } = body
    
    // Check if this is a Groq API request
    const useGroq = request.headers.get('X-Use-Groq') === 'true'
    const useOpenAI = request.headers.get('X-Use-OpenAI') === 'true'
    
    if (useGroq) {
      // Handle Groq API request
      const groqApiKey = process.env.GROQ_API_KEY
      
      if (!groqApiKey) {
        return NextResponse.json(
          { 
            error: {
              message: 'Groq API key not configured',
              type: 'server_error',
              code: 500
            }
          },
          { status: 500 }
        )
      }
      
      // Forward request to Groq API
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages,
          model,
          stream,
          temperature: body.temperature || config.ai.temperature,
          max_tokens: body.max_tokens || 2000 // Keep higher default for OpenAI-compatible endpoint
        })
      })
      
      if (!groqResponse.ok) {
        const errorData = await groqResponse.json()
        throw new Error(errorData.error?.message || 'Groq API error')
      }
      
      const groqData = await groqResponse.json()
      
      return NextResponse.json(groqData, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Use-Groq, X-Use-OpenAI',
        }
      })
    }
    
    if (useOpenAI) {
      // Handle OpenAI API request with follow-up questions
      const openaiApiKey = process.env.OPENAI_API_KEY
      
      if (!openaiApiKey) {
        return NextResponse.json(
          { 
            error: {
              message: 'OpenAI API key not configured',
              type: 'server_error',
              code: 500
            }
          },
          { status: 500 }
        )
      }
      
      // First, get the main response
      // Handle streaming differently
      if (stream) {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages,
            model,
            stream: true,
            temperature: body.temperature || config.ai.temperature,
            max_tokens: body.max_tokens || 2000
          })
        })
        
        if (!openaiResponse.ok) {
          const errorData = await openaiResponse.json()
          throw new Error(errorData.error?.message || 'OpenAI API error')
        }
        
        // Return the streaming response directly
        return new Response(openaiResponse.body, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          }
        })
      }
      
      // Non-streaming response
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages,
          model,
          stream: false,
          temperature: body.temperature || config.ai.temperature,
          max_tokens: body.max_tokens || 2000
        })
      })
      
      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json()
        throw new Error(errorData.error?.message || 'OpenAI API error')
      }
      
      const openaiData = await openaiResponse.json()
      
      // Generate follow-up questions
      const lastUserMessage = messages.filter((m: { role: string }) => m.role === 'user').pop()
      const assistantResponse = openaiData.choices[0].message.content
      
      const followUpResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'Generate 3 relevant follow-up questions based on the query and answer. Return only the questions, one per line, no numbering or bullets.'
            },
            {
              role: 'user',
              content: `Original query: "${lastUserMessage?.content}"\n\nAnswer summary: ${assistantResponse.slice(0, 1000)}...\n\nGenerate 3 follow-up questions that explore different aspects or dig deeper into the topic.`
            }
          ],
          model: 'gpt-4o-mini',
          temperature: 0.8, // Higher temperature for more diverse follow-up questions
          max_tokens: 200 // Limited tokens for concise follow-up questions
        })
      })
      
      if (followUpResponse.ok) {
        const followUpData = await followUpResponse.json()
        const followUpText = followUpData.choices[0].message.content
        const followUpQuestions = followUpText
          .split('\n')
          .map((q: string) => q.trim())
          .filter((q: string) => q.length > 0)
          .slice(0, 3)
        
        // Add follow-up questions to the response
        openaiData.follow_up_questions = followUpQuestions
      }
      
      return NextResponse.json(openaiData, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Use-Groq, X-Use-OpenAI',
        }
      })
    }
    
    // Original Firecrawl namespace logic
    let namespace = ''
    
    if (model?.startsWith('firecrawl-')) {
      // Extract the domain part after "firecrawl-"
      const domainPart = model.substring('firecrawl-'.length)
      // For now, we'll need to look up the actual namespace based on the domain
      // This is a simplified version - in production you'd want to store a mapping
      namespace = domainPart
    }
    
    if (!namespace) {
      return NextResponse.json(
        { 
          error: {
            message: 'Invalid model specified. Use format: firecrawl-<domain>',
            type: 'invalid_request_error',
            code: 400
          }
        },
        { status: 400 }
      )
    }

    // Get the last user message for context search
    interface Message {
      role: string
      content: string
    }
    
    const lastUserMessage = messages.filter((m: Message) => m.role === 'user').pop()
    const query = lastUserMessage?.content || ''

    // Handle streaming for firecrawl models
    if (stream) {
      const contextResponse = await fetch(`${request.nextUrl.origin}/api/firestarter/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          namespace,
          messages: messages.slice(0, -1),
          stream: true
        })
      })
      
      if (!contextResponse.ok) {
        const error = await contextResponse.text()
        throw new Error(error || 'Failed to retrieve context')
      }
      
      // Transform Vercel AI SDK stream to OpenAI format
      const reader = contextResponse.body?.getReader()
      if (!reader) throw new Error('No response body')
      
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()
      
      const stream = new ReadableStream({
        async start(controller) {
          let buffer = ''
          
          // Send initial chunk
          controller.enqueue(encoder.encode(`data: {"id":"chatcmpl-${Date.now()}","object":"chat.completion.chunk","created":${Math.floor(Date.now() / 1000)},"model":"${model}","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`))
          
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            const chunk = decoder.decode(value)
            buffer += chunk
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            
            for (const line of lines) {
              if (line.trim() === '') continue
              
              // Handle Vercel AI SDK format
              if (line.startsWith('0:')) {
                const content = line.slice(2)
                if (content.startsWith('"') && content.endsWith('"')) {
                  try {
                    const text = JSON.parse(content)
                    const data = {
                      id: `chatcmpl-${Date.now()}`,
                      object: 'chat.completion.chunk',
                      created: Math.floor(Date.now() / 1000),
                      model: model,
                      choices: [{
                        index: 0,
                        delta: { content: text },
                        finish_reason: null
                      }]
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
                  } catch {
                    // Skip invalid JSON
                  }
                }
              }
            }
          }
          
          // Send final chunk
          controller.enqueue(encoder.encode(`data: {"id":"chatcmpl-${Date.now()}","object":"chat.completion.chunk","created":${Math.floor(Date.now() / 1000)},"model":"${model}","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      })
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        }
      })
    }
    
    // Non-streaming response
    const contextResponse = await fetch(`${request.nextUrl.origin}/api/firestarter/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query, 
        namespace,
        messages: messages.slice(0, -1),
        stream: false
      })
    })

    const contextData = await contextResponse.json()
    
    if (!contextResponse.ok) {
      throw new Error(contextData.error || 'Failed to retrieve context')
    }

    // Format the response in OpenAI format
    const completion = {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: contextData.answer
          },
          finish_reason: 'stop'
        }
      ]
    }

    // Add sources as metadata if available
    if (contextData.sources && contextData.sources.length > 0) {
      interface Source {
        title: string
        url: string
      }
      
      completion.choices[0].message.content += `\n\n**Sources:**\n${contextData.sources.map((s: Source) => `- [${s.title}](${s.url})`).join('\n')}`
    }

    return NextResponse.json(completion, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  } catch (error) {
    return NextResponse.json(
      { 
        error: {
          message: error instanceof Error ? error.message : 'Failed to process chat completion',
          type: 'server_error',
          code: 500
        }
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Use-Groq, X-Use-OpenAI',
        }
      }
    )
  }
}