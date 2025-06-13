import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { searchIndex } from '@/lib/upstash-search'

export async function POST(request: NextRequest) {
  try {
    const { query, namespace, stream = false } = await request.json()
    
    if (!query || !namespace) {
      return NextResponse.json({ error: 'Query and namespace are required' }, { status: 400 })
    }

    console.log('[FIRESTARTER-QUERY] Namespace:', namespace)
    console.log('[FIRESTARTER-QUERY] Query:', query)
    
    // Retrieve documents from Upstash Search
    interface SearchDocument {
      content?: {
        text?: string
        title?: string
        url?: string
      }
      metadata?: {
        namespace?: string
        title?: string
        pageTitle?: string
        url?: string
        sourceURL?: string
        description?: string
      }
      score?: number
    }
    
    let documents: SearchDocument[] = []
    
    try {
      // Search for documents in this namespace
      console.log('[FIRESTARTER-QUERY] Searching for documents with query:', query)
      
      // Since Upstash Search filters may not work as expected, we'll use a two-step approach:
      // 1. First get ALL documents from this namespace
      // 2. Then filter by the user's query
      
      // Search using the namespace as part of the query to get relevant documents
      const namespaceQuery = `${namespace} ${query}`.trim()
      console.log('[FIRESTARTER-QUERY] Searching with combined query:', namespaceQuery)
      
      const searchResults = await searchIndex.search({
        query: namespaceQuery,
        limit: 100
      })
      
      console.log('[FIRESTARTER-QUERY] Initial search found:', searchResults.length, 'results')
      
      // Filter to only include documents from the correct namespace
      documents = searchResults.filter((doc) => {
        const docNamespace = doc.metadata?.namespace
        const matches = docNamespace === namespace
        if (!matches && doc.metadata?.namespace) {
          console.log('[FIRESTARTER-QUERY] Namespace mismatch:', doc.metadata.namespace, '!==', namespace)
        }
        return matches
      })
      
      console.log('[FIRESTARTER-QUERY] After namespace filter:', documents.length, 'documents')
      
      // If no results, try searching just for documents in this namespace
      if (documents.length === 0) {
        console.log('[FIRESTARTER-QUERY] No results found, trying fallback search')
        
        // Try a more specific search - look for the exact namespace
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
      
      // Handle streaming response for no documents
      if (stream) {
        const encoder = new TextEncoder()
        const customReadable = new ReadableStream({
          start(controller) {
            // Send sources first (empty array)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'sources', 
              sources: sources 
            })}\n\n`))
            
            // Send the answer content
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'content', 
              content: answer 
            })}\n\n`))
            
            // Send done signal
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'done' 
            })}\n\n`))
            
            controller.close()
          }
        })

        return new Response(customReadable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      } else {
        return NextResponse.json({
          answer: answer,
          sources: sources
        })
      }
    }

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      console.error('[FIRESTARTER-QUERY] OPENAI_API_KEY is not set!')
      return NextResponse.json({
        answer: 'AI service is not configured. Please set OPENAI_API_KEY in your environment variables.',
        sources: []
      })
    }
    
    const openai = new OpenAI({
      apiKey: openaiApiKey
    })
    
    // First, extract search keywords from the user query
    console.log('[FIRESTARTER-QUERY] Extracting search keywords from:', query)
    
    let extractedKeywords = query // fallback
    try {
      const keywordExtraction = await openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are a search keyword extractor. Given a user question, extract the most relevant search keywords and phrases.
            Return ONLY a comma-separated list of keywords/phrases, nothing else.
            Focus on nouns, important concepts, and specific terms.
            Include variations and related terms for better search coverage.`
          },
          {
            role: 'user',
            content: query
          }
        ],
        model: 'gpt-3.5-turbo',
        temperature: 0.3,
        max_tokens: 50
      })
      
      extractedKeywords = keywordExtraction.choices[0]?.message?.content || query
      console.log('[FIRESTARTER-QUERY] Extracted keywords:', extractedKeywords)
    } catch (keywordError) {
      console.error('[FIRESTARTER-QUERY] Keyword extraction failed:', keywordError instanceof Error ? keywordError.message : keywordError)
      extractedKeywords = query
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
      const title = result.content?.title || result.metadata?.title || result.metadata?.pageTitle || 'Untitled'
      const description = result.metadata?.description || ''
      const url = result.content?.url || result.metadata?.url || result.metadata?.sourceURL || ''
      
      // Get content from the document
      const rawContent = result.content?.text || ''
      
      if (!rawContent) {
        console.warn('[FIRESTARTER-QUERY] Document has no content:', { url, title })
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
    
    // Enhanced search for relevant content using extracted keywords
    const searchTerms = extractedKeywords.toLowerCase().split(',').map((term: string) => term.trim()).filter((term: string) => term.length > 0)
    const queryWords = query.toLowerCase().split(' ').filter((word: string) => word.length > 2)
    
    console.log('[FIRESTARTER-QUERY] Search terms:', searchTerms)
    console.log('[FIRESTARTER-QUERY] Query words:', queryWords)
    
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
      
      return NextResponse.json({
        answer: 'I found some relevant pages but couldn\'t extract enough content to answer your question. This might be due to the way the pages were crawled. Try crawling the website again with a higher page limit.',
        sources: docsToUse.map((doc) => ({
          url: doc.url,
          title: doc.title,
          snippet: (doc.content || '').substring(0, 200) + '...'
        }))
      })
    }

    // Generate response using OpenAI
    let answer = 'I apologize, but I couldn\'t generate a response. Please try rephrasing your question.'
    
    try {
      console.log('[FIRESTARTER-QUERY] Calling OpenAI API...', { streaming: stream })
      
      if (stream) {
        const completion = await openai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `You are a helpful assistant that answers questions based on the provided context from a website. 
              - Answer questions comprehensively using the context provided
              - Use bullet points or numbered lists when appropriate for clarity
              - Cite specific information from the sources when relevant
              - If the context doesn't contain enough information, say so
              - Be concise but thorough`
            },
            {
              role: 'user',
              content: `Question: ${query}\n\nRelevant content from the website:\n${context}\n\nPlease provide a comprehensive answer based on this information.`
            }
          ],
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          max_tokens: 800,
          stream: true
        })
        
        // Create streaming response
        const sources = docsToUse.map((doc) => ({
          url: doc.url,
          title: doc.title,
          snippet: (doc.content || '').substring(0, 200) + '...'
        }))

        // Create a readable stream
        const encoder = new TextEncoder()
        const customReadable = new ReadableStream({
          async start(controller) {
            // Send sources first
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'sources', 
              sources: sources 
            })}\n\n`))
            
            try {
              for await (const chunk of completion) {
                const content = chunk.choices[0]?.delta?.content || ''
                if (content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    type: 'content', 
                    content: content 
                  })}\n\n`))
                }
              }
              
              // Send end signal
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'done' 
              })}\n\n`))
              controller.close()
            } catch (error) {
              console.error('Streaming error:', error)
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                error: 'Streaming failed' 
              })}\n\n`))
              controller.close()
            }
          }
        })

        return new Response(customReadable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      } else {
        const completion = await openai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `You are a helpful assistant that answers questions based on the provided context from a website. 
              - Answer questions comprehensively using the context provided
              - Use bullet points or numbered lists when appropriate for clarity
              - Cite specific information from the sources when relevant
              - If the context doesn't contain enough information, say so
              - Be concise but thorough`
            },
            {
              role: 'user',
              content: `Question: ${query}\n\nRelevant content from the website:\n${context}\n\nPlease provide a comprehensive answer based on this information.`
            }
          ],
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          max_tokens: 800,
          stream: false
        })
        
        answer = completion.choices[0]?.message?.content || answer
        console.log('[FIRESTARTER-QUERY] Successfully generated answer')
      }
      
    } catch (openaiError) {
      console.error('[FIRESTARTER-QUERY] OpenAI API error:', openaiError)
      
      const errorMessage = openaiError instanceof Error ? openaiError.message : 'Unknown error'
      
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        answer = 'Error: OpenAI API authentication failed. Please check your OPENAI_API_KEY.'
      } else if (errorMessage.includes('rate limit')) {
        answer = 'Error: OpenAI API rate limit exceeded. Please try again later.'
      } else {
        answer = `Error generating response: ${errorMessage}`
      }
    }

    return NextResponse.json({
      answer,
      sources: docsToUse.map((doc) => ({
        url: doc.url,
        title: doc.title,
        snippet: (doc.content || '').substring(0, 200) + '...'
      }))
    })
  } catch (error) {
    console.error('Error in firestarter query route:', error)
    return NextResponse.json(
      { error: 'Failed to process query' },
      { status: 500 }
    )
  }
}

