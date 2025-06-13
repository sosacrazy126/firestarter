import { NextRequest, NextResponse } from 'next/server'
import { searchIndex } from '@/lib/upstash-search'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const namespace = searchParams.get('namespace')
    
    console.log('[FIRESTARTER-DEBUG] Debug endpoint called with namespace:', namespace)
    
    // Try different search approaches
    interface DebugResults {
      namespaceSearch?: {
        count: number
        items: unknown[]
      }
      namespaceSearchError?: string
      allSearch?: {
        count: number
        items: unknown[]
      }
      allSearchError?: string
      semanticSearch?: {
        count: number
        items: unknown[]
      }
      semanticSearchError?: string
    }
    const results: DebugResults = {}
    
    // 1. Search with namespace filter
    if (namespace) {
      try {
        const namespaceSearch = await searchIndex.search({
          query: '*',
          filter: `metadata.namespace = "${namespace}"`,
          limit: 10
        })
        results.namespaceSearch = {
          count: namespaceSearch.length,
          items: namespaceSearch
        }
        console.log('[FIRESTARTER-DEBUG] Namespace search found:', namespaceSearch.length, 'items')
      } catch (e) {
        console.error('[FIRESTARTER-DEBUG] Namespace search error:', e)
        results.namespaceSearchError = e instanceof Error ? e.message : String(e)
      }
    }
    
    // 2. Search without filter
    try {
      const allSearch = await searchIndex.search({
        query: namespace || 'test',
        limit: 10
      })
      results.allSearch = {
        count: allSearch.length,
        items: allSearch
      }
      console.log('[FIRESTARTER-DEBUG] All search found:', allSearch.length, 'items')
    } catch (e) {
      console.error('[FIRESTARTER-DEBUG] All search error:', e)
      results.allSearchError = e instanceof Error ? e.message : String(e)
    }
    
    // 3. Try semantic search
    try {
      const semanticSearch = await searchIndex.search({
        query: 'homepage website content',
        limit: 10
      })
      results.semanticSearch = {
        count: semanticSearch.length,
        items: semanticSearch
      }
      console.log('[FIRESTARTER-DEBUG] Semantic search found:', semanticSearch.length, 'items')
    } catch (e) {
      console.error('[FIRESTARTER-DEBUG] Semantic search error:', e)
      results.semanticSearchError = e instanceof Error ? e.message : String(e)
    }
    
    return NextResponse.json({
      success: true,
      namespace: namespace,
      results: results,
      upstashUrl: process.env.UPSTASH_SEARCH_REST_URL ? 'Configured' : 'Not configured',
      upstashToken: process.env.UPSTASH_SEARCH_REST_TOKEN ? 'Configured' : 'Not configured'
    })
  } catch (error) {
    console.error('[FIRESTARTER-DEBUG] Error:', error)
    return NextResponse.json(
      { 
        error: 'Debug endpoint error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}