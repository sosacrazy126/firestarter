import { NextRequest } from 'next/server'
import { groq } from '@ai-sdk/groq'
import { streamText } from 'ai'
import { searchIndex } from '@/lib/upstash-search'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Handle both direct query format and useChat format
    let query = body.query
    let namespace = body.namespace
    let stream = body.stream ?? false
    
    // If using useChat format, extract query from messages
    if (!query && body.messages && Array.isArray(body.messages)) {
      const lastUserMessage = body.messages.filter((m: any) => m.role === 'user').pop()
      query = lastUserMessage?.content
    }
    
    if (!query || !namespace) {
      return new Response(
        JSON.stringify({ error: 'Query and namespace are required' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('[FIRESTARTER-QUERY] Namespace:', namespace)
    console.log('[FIRESTARTER-QUERY] Query:', query)
    
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
      console.log('[FIRESTARTER-QUERY] Searching for documents with query:', query)
      
      // Include namespace in search to boost relevance
      const searchQuery = `${query} ${namespace}`
      
      const searchResults = await searchIndex.search({
        query: searchQuery,
        limit: 100
      })
      
      console.log('[FIRESTARTER-QUERY] Initial search found:', searchResults.length, 'results')
      
      // Filter to only include documents from the correct namespace
      documents = searchResults.filter((doc) => {
        const docNamespace = doc.metadata?.namespace
        const matches = docNamespace === namespace
        if (!matches && doc.metadata?.namespace) {
          // Only log first few mismatches to avoid spam
          if (documents.length < 3) {
            console.log('[FIRESTARTER-QUERY] Namespace mismatch:', doc.metadata.namespace, '!==', namespace)
          }
        }
        return matches
      })
      
      console.log('[FIRESTARTER-QUERY] After namespace filter:', documents.length, 'documents')
      
      // If no results, try searching just for documents in this namespace
      if (documents.length === 0) {
        console.log('[FIRESTARTER-QUERY] No results found, trying fallback search')
        
        const fallbackResults = await searchIndex.search({
          query: namespace,
          limit: 100
        })
        
        console.log('[FIRESTARTER-QUERY] Fallback search found:', fallbackResults.length, 'results')
        
        // Filter for exact namespace match
        const namespaceDocs = fallbackResults.filter((doc) => {
          return doc.metadata?.namespace === namespace
        })
        
        console.log('[FIRESTARTER-QUERY] Namespace documents found:', namespaceDocs.length)
        
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
          
          console.log('[FIRESTARTER-QUERY] Content-filtered documents:', documents.length)
          
          // If still no results, return all namespace documents
          if (documents.length === 0) {
            documents = namespaceDocs
          }
        }
      }
      
    } catch (searchError) {
      console.error('[FIRESTARTER-QUERY] Search failed:', searchError)
      documents = []
    }
    
    // Check if we have any data for this namespace
    if (documents.length === 0) {
      console.log('[FIRESTARTER-QUERY] No documents found for namespace:', namespace)
      
      const answer = `I don't have any indexed content for this website. Please make sure the website has been crawled first.`
      const sources: never[] = []
      
      if (stream) {
        // Create a simple text stream for the answer
        const result = await streamText({
          model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
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

    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) {
      console.error('[FIRESTARTER-QUERY] GROQ_API_KEY is not set!')
      const answer = 'AI service is not configured. Please set GROQ_API_KEY in your environment variables.'
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
        console.warn('[FIRESTARTER-QUERY] Document has no content:', { 
          url, 
          title,
          hasContent: !!result.content,
          hasFullContent: !!result.metadata?.fullContent,
          contentKeys: result.content ? Object.keys(result.content) : [],
          metadataKeys: result.metadata ? Object.keys(result.metadata) : []
        })
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
      .slice(0, 20) // Get many more sources for better coverage
    
    console.log('[FIRESTARTER-QUERY] Found relevant docs:', relevantDocs.length, 'from', transformedDocuments.length, 'total')
    
    // If no matches, use more documents as context
    const docsToUse = relevantDocs.length > 0 ? relevantDocs : transformedDocuments.slice(0, 10)

    // Build context from relevant documents - use more content for better answers
    const contextDocs = docsToUse.slice(0, 10) // Use top 10 for richer context
    
    // Log document structure for debugging
    if (contextDocs.length > 0) {
      console.log('[FIRESTARTER-QUERY] Sample document for context:', {
        url: contextDocs[0].url,
        title: contextDocs[0].title,
        contentLength: contextDocs[0].content?.length || 0,
        hasContent: !!contextDocs[0].content
      })
    }
    
    const context = contextDocs
      .map((doc) => {
        const content = doc.content || ''
        if (!content) {
          console.warn('[FIRESTARTER-QUERY] Empty content for doc:', doc.url)
          return null
        }
        return content.substring(0, 1500) + '...'
      })
      .filter(Boolean)
      .join('\n\n---\n\n')
    
    console.log('[FIRESTARTER-QUERY] Context length:', context.length, 'chars')
    console.log('[FIRESTARTER-QUERY] Using', contextDocs.length, 'docs for context,', docsToUse.length, 'total sources')
    
    // If context is empty, log error
    if (!context || context.length < 100) {
      console.error('[FIRESTARTER-QUERY] Context too short or empty!', { contextLength: context.length })
      
      const answer = 'I found some relevant pages but couldn\'t extract enough content to answer your question. This might be due to the way the pages were crawled. Try crawling the website again with a higher page limit.'
      const sources = docsToUse.map((doc) => ({
        url: doc.url,
        title: doc.title,
        snippet: (doc.content || '').substring(0, 200) + '...'
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
      snippet: (doc.content || '').substring(0, 200) + '...'
    }))

    // Generate response using Vercel AI SDK
    try {
      console.log('[FIRESTARTER-QUERY] Calling Groq API...', { streaming: stream })
      
      const systemPrompt = `You are a helpful assistant that answers questions based ONLY on the provided context from a website. 
IMPORTANT: You MUST use the information provided in the context below to answer the user's question.
- Answer questions comprehensively using ONLY the context provided
- DO NOT use any external knowledge - only what's in the context
- Use bullet points or numbered lists when appropriate for clarity
- Cite specific information from the sources when relevant
- If the context doesn't contain enough information to answer the question, say so explicitly
- Be concise but thorough`

      const userPrompt = `Question: ${query}\n\nRelevant content from the website:\n${context}\n\nPlease provide a comprehensive answer based on this information.`

      console.log('[FIRESTARTER-QUERY] System prompt:', systemPrompt.substring(0, 100) + '...')
      console.log('[FIRESTARTER-QUERY] User prompt length:', userPrompt.length)
      console.log('[FIRESTARTER-QUERY] User prompt preview:', userPrompt.substring(0, 500) + '...')
      
      // Log a sample of the actual content being sent
      if (contextDocs.length > 0) {
        console.log('[FIRESTARTER-QUERY] First document full content preview:')
        console.log(contextDocs[0].content.substring(0, 500) + '...')
      }

      if (stream) {
        // Stream the response using Groq with Llama 4 Scout
        const result = await streamText({
          model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          maxTokens: 800,
        })
        
        // Return the stream response with additional data
        return result.toDataStreamResponse()
      } else {
        // Non-streaming response
        const result = await streamText({
          model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          maxTokens: 800
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
      console.error('[FIRESTARTER-QUERY] Groq API error:', groqError)
      
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
  } catch (error) {
    console.error('Error in firestarter query route:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to process query' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}