import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { groq } from '@ai-sdk/groq'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { searchIndex } from '@/lib/upstash-search'
import { serverConfig as config } from '@/firestarter.config'

// Get AI model at runtime on server
const getModel = () => {
  try {
    // Initialize models directly here to avoid module-level issues
    if (process.env.GROQ_API_KEY) {
      return groq('meta-llama/llama-4-scout-17b-16e-instruct')
    }
    if (process.env.OPENAI_API_KEY) {
      return openai('gpt-4o')
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return anthropic('claude-3-5-sonnet-20241022')
    }
    throw new Error('No AI provider configured. Please set GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY')
  } catch (error) {
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Handle both direct query format and useChat format
    let query = body.query
    const namespace = body.namespace
    const stream = body.stream ?? false
    
    // If using useChat format, extract query from messages
    if (!query && body.messages && Array.isArray(body.messages)) {
      const lastUserMessage = body.messages.filter((m: { role: string }) => m.role === 'user').pop()
      query = lastUserMessage?.content
    }
    
    if (!query || !namespace) {
      return new Response(
        JSON.stringify({ error: 'Query and namespace are required' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    
    // Retrieve documents from Upstash Search
    interface SearchDocument {
      content?: {
        text?: string  // Searchable text
      }
      metadata?: {
        namespace?: string
        title?: string
        pageTitle?: string
        url?: string
        sourceURL?: string
        description?: string
        fullContent?: string  // Full content stored here
      }
      score?: number
    }
    
    let documents: SearchDocument[] = []
    
    try {
      // Search for documents - include namespace to improve relevance
      
      // Include namespace in search to boost relevance
      const searchQuery = `${query} ${namespace}`
      
      const searchResults = await searchIndex.search({
        query: searchQuery,
        limit: config.search.maxResults,
        reranking: true
      })
      
      
      // Filter to only include documents from the correct namespace
      documents = searchResults.filter((doc) => {
        const docNamespace = doc.metadata?.namespace
        const matches = docNamespace === namespace
        if (!matches && doc.metadata?.namespace) {
          // Only log first few mismatches to avoid spam
          if (documents.length < 3) {
          }
        }
        return matches
      })
      
      
      // If no results, try searching just for documents in this namespace
      if (documents.length === 0) {
        
        const fallbackResults = await searchIndex.search({
          query: namespace,
          limit: config.search.maxResults,
          reranking: true
        })
        
        
        // Filter for exact namespace match
        const namespaceDocs = fallbackResults.filter((doc) => {
          return doc.metadata?.namespace === namespace
        })
        
        
        // If we found documents in the namespace, search within their content
        if (namespaceDocs.length > 0) {
          // Score documents based on query relevance
          const queryLower = query.toLowerCase()
          documents = namespaceDocs.filter((doc) => {
            const content = (doc.content?.text || '').toLowerCase()
            const title = (doc.content?.title || '').toLowerCase()
            const url = (doc.content?.url || '').toLowerCase()
            
            return content.includes(queryLower) || 
                   title.includes(queryLower) || 
                   url.includes(queryLower)
          })
          
          
          // If still no results, return all namespace documents
          if (documents.length === 0) {
            documents = namespaceDocs
          }
        }
      }
      
    } catch {
      console.error('Search failed')
      documents = []
    }
    
    // Check if we have any data for this namespace
    if (documents.length === 0) {
      
      const answer = `I don't have any indexed content for this website. Please make sure the website has been crawled first.`
      const sources: never[] = []
      
      if (stream) {
        // Create a simple text stream for the answer
        const result = await streamText({
          model: getModel(),
          prompt: answer,
          maxTokens: 1,
          temperature: 0,
        })
        
        return result.toDataStreamResponse()
      } else {
        return new Response(
          JSON.stringify({ answer, sources }), 
          { headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Check if we have any AI provider configured
    try {
      const model = getModel()
      if (!model) {
        throw new Error('No AI model available')
      }
    } catch {
      const answer = 'AI service is not configured. Please set GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY in your environment variables.'
      return new Response(
        JSON.stringify({ answer, sources: [] }), 
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Transform Upstash search results to expected format
    interface TransformedDocument {
      content: string
      url: string
      title: string
      description: string
      score: number
    }
    
    const transformedDocuments: TransformedDocument[] = documents.map((result) => {
      const title = result.metadata?.title || result.metadata?.pageTitle || 'Untitled'
      const description = result.metadata?.description || ''
      const url = result.metadata?.url || result.metadata?.sourceURL || ''
      
      // Get content from the document - prefer full content from metadata, fallback to searchable text
      const rawContent = result.metadata?.fullContent || result.content?.text || ''
      
      if (!rawContent) {
      }
      
      // Create structured content with clear metadata headers
      const structuredContent = `TITLE: ${title}
DESCRIPTION: ${description}
SOURCE: ${url}

${rawContent}`
      
      return {
        content: structuredContent,
        url: url,
        title: title,
        description: description,
        score: result.score || 0
      }
    })
    
    // Documents from Upstash are already scored by relevance
    // Sort by score and take top results
    const relevantDocs = transformedDocuments
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, config.search.maxSourcesDisplay) // Get many more sources for better coverage
    
    
    // If no matches, use more documents as context
    const docsToUse = relevantDocs.length > 0 ? relevantDocs : transformedDocuments.slice(0, 10)

    // Build context from relevant documents - use more content for better answers
    const contextDocs = docsToUse.slice(0, config.search.maxContextDocs) // Use top docs for richer context
    
    // Log document structure for debugging
    if (contextDocs.length > 0) {
    }
    
    const context = contextDocs
      .map((doc) => {
        const content = doc.content || ''
        if (!content) {
          return null
        }
        return content.substring(0, config.search.maxContextLength) + '...'
      })
      .filter(Boolean)
      .join('\n\n---\n\n')
    
    
    // If context is empty, log error
    if (!context || context.length < 100) {
      
      const answer = 'I found some relevant pages but couldn\'t extract enough content to answer your question. This might be due to the way the pages were crawled. Try crawling the website again with a higher page limit.'
      const sources = docsToUse.map((doc) => ({
        url: doc.url,
        title: doc.title,
        snippet: (doc.content || '').substring(0, config.search.snippetLength) + '...'
      }))
      
      return new Response(
        JSON.stringify({ answer, sources }), 
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Prepare sources
    const sources = docsToUse.map((doc) => ({
      url: doc.url,
      title: doc.title,
      snippet: (doc.content || '').substring(0, config.search.snippetLength) + '...'
    }))
    

    // Generate response using Vercel AI SDK
    try {
      
      const systemPrompt = config.ai.systemPrompt

      const userPrompt = `Question: ${query}\n\nRelevant content from the website:\n${context}\n\nPlease provide a comprehensive answer based on this information.`

      
      // Log a sample of the actual content being sent


      if (stream) {
        
        let result
        try {
          const model = getModel()
          
          // Stream the response
          result = await streamText({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: config.ai.temperature,
            maxTokens: config.ai.maxTokens
          })
          
        } catch (streamError) {
          throw streamError
        }
        
        // Create a streaming response with sources
        
        // Always use custom streaming to include sources
        // The built-in toDataStreamResponse doesn't include our sources
        const encoder = new TextEncoder()
        
        const stream = new ReadableStream({
          async start(controller) {
            // Send sources as initial data
            const sourcesData = { sources }
            const sourcesLine = `8:${JSON.stringify(sourcesData)}\n`
            controller.enqueue(encoder.encode(sourcesLine))
            
            // Stream the text
            try {
              for await (const textPart of result.textStream) {
                // Format as Vercel AI SDK expects
                const escaped = JSON.stringify(textPart)
                controller.enqueue(encoder.encode(`0:${escaped}\n`))
              }
            } catch {
              console.error('Stream processing failed')
            }
            
            controller.close()
          }
        })
        
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        })
      } else {
        // Non-streaming response
        const result = await streamText({
          model: getModel(),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: config.ai.temperature,
          maxTokens: config.ai.maxTokens
        })
        
        // Get the full text
        let answer = ''
        for await (const textPart of result.textStream) {
          answer += textPart
        }
        
        return new Response(
          JSON.stringify({ answer, sources }), 
          { headers: { 'Content-Type': 'application/json' } }
        )
      }
      
    } catch (groqError) {
      
      const errorMessage = groqError instanceof Error ? groqError.message : 'Unknown error'
      let answer = `Error generating response: ${errorMessage}`
      
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        answer = 'Error: Groq API authentication failed. Please check your GROQ_API_KEY.'
      } else if (errorMessage.includes('rate limit')) {
        answer = 'Error: Groq API rate limit exceeded. Please try again later.'
      }
      
      return new Response(
        JSON.stringify({ answer, sources }), 
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
  } catch {
    console.error('Query processing failed')
    return new Response(
      JSON.stringify({ error: 'Failed to process query' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}