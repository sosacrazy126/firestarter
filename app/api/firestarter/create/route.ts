import { NextRequest, NextResponse } from 'next/server'
import FirecrawlApp from '@mendable/firecrawl-js'
import { searchIndex } from '@/lib/upstash-search'

export async function POST(request: NextRequest) {
  try {
    // Check if creation is disabled
    if (process.env.FIRESTARTER_DISABLE_CREATION_DASHBOARD === 'true') {
      console.log('[FIRESTARTER-CREATE] Creation is disabled via FIRESTARTER_DISABLE_CREATION_DASHBOARD')
      return NextResponse.json({ 
        error: 'Dashboard creation is disabled for Firestarter.' 
      }, { status: 403 })
    }

    const { url, limit = 10 } = await request.json()
    console.log('[FIRESTARTER-CREATE] Received crawl request for URL:', url, 'with limit:', limit)
    
    if (!url) {
      console.error('[FIRESTARTER-CREATE] No URL provided in request')
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Generate unique namespace with timestamp to avoid collisions
    const baseNamespace = new URL(url).hostname.replace(/\./g, '-')
    const timestamp = Date.now()
    const namespace = `${baseNamespace}-${timestamp}`
    console.log('[FIRESTARTER-CREATE] Generated namespace:', namespace)
    
    // Initialize Firecrawl with API key from environment or headers
    const apiKey = process.env.FIRECRAWL_API_KEY || request.headers.get('X-Firecrawl-API-Key')
    if (!apiKey) {
      console.error('[FIRESTARTER-CREATE] FIRECRAWL_API_KEY is not set in environment variables or headers')
      return NextResponse.json({ 
        error: 'Firecrawl API key is not configured. Please provide your API key.' 
      }, { status: 500 })
    }
    
    console.log('[FIRESTARTER-CREATE] Initializing Firecrawl client')
    const firecrawl = new FirecrawlApp({
      apiKey: apiKey
    })

    // Start crawling the website with specified limit
    console.log('[FIRESTARTER-CREATE] Starting crawl for', url, 'with limit of', limit, 'pages')
    
    const crawlResponse = await firecrawl.crawlUrl(url, {
      limit: limit,
      scrapeOptions: {
        formats: ['markdown', 'html'],
        maxAge: 604800, // 1 week in seconds (7 * 24 * 60 * 60)
      }
    }) as {
      success: boolean
      data: Array<{
        url?: string
        markdown?: string
        content?: string
        metadata?: {
          title?: string
          description?: string
          ogDescription?: string
          sourceURL?: string
          favicon?: string
          ogImage?: string
          'og:image'?: string
        }
      }>
    }
    
    console.log('[FIRESTARTER-CREATE] Full crawl response:', JSON.stringify(crawlResponse, null, 2))
    
    // Store the crawl data for immediate use
    const crawlId = 'immediate-' + Date.now()
    console.log('[FIRESTARTER-CREATE] Crawl completed successfully!')
    console.log('[FIRESTARTER-CREATE] Pages crawled:', crawlResponse.data?.length || 0)
    
    // Log first page content preview for debugging
    if (crawlResponse.data && crawlResponse.data.length > 0) {
      // Find the homepage in the crawled data
      const homepage = crawlResponse.data.find((page) => {
        const pageUrl = page.metadata?.sourceURL || page.url || ''
        // Check if it's the homepage (ends with domain or domain/)
        return pageUrl === url || pageUrl === url + '/' || pageUrl === url.replace(/\/$/, '')
      }) || crawlResponse.data[0] // Fallback to first page
      
      // Log homepage info for debugging but don't store it in unused variable
      console.log('[FIRESTARTER-CREATE] Homepage metadata:', homepage.metadata)
      
      console.log('[FIRESTARTER-CREATE] Homepage URL:', homepage.metadata?.sourceURL || homepage.url)
      console.log('[FIRESTARTER-CREATE] Homepage title:', homepage.metadata?.title || 'No title')
      console.log('[FIRESTARTER-CREATE] Homepage OG image:', homepage.metadata?.ogImage || homepage.metadata?.['og:image'])
      console.log('[FIRESTARTER-CREATE] Content preview:', homepage.markdown?.substring(0, 200) + '...')
    }
    
    // Store documents in Upstash Search
    console.log('[FIRESTARTER-CREATE] Storing documents in Upstash Search...')
    const documents = crawlResponse.data.map((page, index) => {
      // Get the content and metadata
      const fullContent = page.markdown || page.content || ''
      const title = page.metadata?.title || 'Untitled'
      const url = page.metadata?.sourceURL || page.url || ''
      const description = page.metadata?.description || page.metadata?.ogDescription || ''
      
      // Create a searchable text that includes URL, title, description and content
      // This ensures all important fields are searchable
      const searchableText = `URL: ${url}\nTitle: ${title}\nDescription: ${description}\n\n${fullContent}`.substring(0, 1200)
      
      return {
        id: `${namespace}-${index}`,
        content: {
          text: searchableText,  // The searchable text
          url: url,             // Include URL in content for searching
          title: title          // Include title in content for searching
        },
        metadata: {
          namespace: namespace,
          title: title,
          url: url,
          sourceURL: page.metadata?.sourceURL || page.url || '',
          crawlDate: new Date().toISOString(),
          pageTitle: page.metadata?.title,
          description: page.metadata?.description || page.metadata?.ogDescription,
          favicon: page.metadata?.favicon,
          ogImage: page.metadata?.ogImage || page.metadata?.['og:image']
        }
      }
    })
    
    // Store documents in batches
    const batchSize = 10
    console.log('[FIRESTARTER-CREATE] Attempting to store', documents.length, 'documents in Upstash')
    
    try {
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize)
        console.log(`[FIRESTARTER-CREATE] Storing batch ${i/batchSize + 1} with ${batch.length} documents`)
        const upsertResult = await searchIndex.upsert(batch)
        console.log(`[FIRESTARTER-CREATE] Batch ${i/batchSize + 1} upsert result:`, upsertResult)
      }
      
      console.log('[FIRESTARTER-CREATE] Successfully stored', documents.length, 'documents in Upstash')
      
      // Verify documents were stored - try multiple approaches
      console.log('[FIRESTARTER-CREATE] Verifying document storage...')
      
      // First try with filter
      interface SearchResult {
        metadata?: {
          namespace?: string
        }
      }
      let verifyResult: SearchResult[] = []
      try {
        verifyResult = await searchIndex.search({
          query: documents[0]?.content?.title || 'test',
          filter: `metadata.namespace = "${namespace}"`,
          limit: 1
        })
        console.log('[FIRESTARTER-CREATE] Verification with filter found:', verifyResult.length, 'documents')
      } catch {
        console.log('[FIRESTARTER-CREATE] Verification with filter failed, trying without filter')
        
        // Try without filter
        try {
          const allResults = await searchIndex.search({
            query: namespace, // Search for the namespace itself
            limit: 10
          })
          console.log('[FIRESTARTER-CREATE] Verification without filter found:', allResults.length, 'total documents')
          
          // Log the structure of the first result for debugging
          if (allResults.length > 0) {
            console.log('[FIRESTARTER-CREATE] First document structure:', JSON.stringify(allResults[0], null, 2))
          }
          
          // Manual filter check
          verifyResult = allResults.filter((doc: SearchResult) => {
            const docNamespace = doc.metadata?.namespace
            return docNamespace === namespace
          })
          console.log('[FIRESTARTER-CREATE] Manual filter found:', verifyResult.length, 'matching documents')
        } catch (noFilterError) {
          console.error('[FIRESTARTER-CREATE] Verification without filter also failed:', noFilterError)
        }
      }
      
      if (verifyResult.length === 0) {
        console.warn('[FIRESTARTER-CREATE] WARNING: Could not verify documents were stored correctly!')
        console.log('[FIRESTARTER-CREATE] Sample document structure that was upserted:', JSON.stringify(documents[0], null, 2))
      } else {
        console.log('[FIRESTARTER-CREATE] Successfully verified document storage')
      }
    } catch (upsertError) {
      console.error('[FIRESTARTER-CREATE] Error storing documents in Upstash:', upsertError)
      throw new Error(`Failed to store documents: ${upsertError instanceof Error ? upsertError.message : 'Unknown error'}`)
    }
    
    return NextResponse.json({
      success: true,
      namespace,
      crawlId,
      message: `Crawl completed successfully (limited to ${limit} pages)`,
      details: {
        url,
        pagesLimit: limit,
        pagesCrawled: crawlResponse.data?.length || 0,
        formats: ['markdown', 'html']
      },
      data: crawlResponse.data // Include the actual crawl data
    })
  } catch (error) {
    console.error('[FIRESTARTER-CREATE] Error in create route:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined
    
    console.error('[FIRESTARTER-CREATE] Error details:', {
      message: errorMessage,
      statusCode: statusCode,
      details: error && typeof error === 'object' && 'details' in error ? error.details : undefined,
      stack: error instanceof Error ? error.stack : undefined
    })
    
    // Provide more specific error messages
    if (statusCode === 401) {
      return NextResponse.json(
        { error: 'Firecrawl authentication failed. Please check your API key.' },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to start crawl',
        details: errorMessage
      },
      { status: 500 }
    )
  }
}