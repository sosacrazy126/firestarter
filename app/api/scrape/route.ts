import { NextRequest, NextResponse } from 'next/server';
import FirecrawlApp from '@mendable/firecrawl-js';
import { serverConfig as config } from '@/firestarter.config';

interface ScrapeRequestBody {
  url?: string;
  urls?: string[];
  [key: string]: unknown;
}

interface ScrapeResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

interface ApiError extends Error {
  status?: number;
}

export async function POST(request: NextRequest) {
  // Check rate limit if enabled
  if (config.rateLimits.scrape) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                request.headers.get('x-real-ip') || 
                '127.0.0.1';
    
    const rateLimit = await config.rateLimits.scrape.limit(ip);
    
    if (!rateLimit.success) {
      return NextResponse.json({ 
        success: false,
        error: 'Rate limit exceeded. Please try again later.' 
      }, { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimit.limit.toString(),
          'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        }
      });
    }
  }

  let apiKey = process.env.FIRECRAWL_API_KEY;
  
  if (!apiKey) {
    const headerApiKey = request.headers.get('X-Firecrawl-API-Key');
    
    if (!headerApiKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'API configuration error. Please try again later or contact support.' 
      }, { status: 500 });
    }
    
    apiKey = headerApiKey;
  }

  try {
    const app = new FirecrawlApp({ apiKey });
    const body = await request.json() as ScrapeRequestBody;
    const { url, urls, ...params } = body;

    let result: ScrapeResult;

    if (url && typeof url === 'string') {
      result = await app.scrapeUrl(url, params) as ScrapeResult;
    } else if (urls && Array.isArray(urls)) {
      result = await app.batchScrapeUrls(urls, params) as ScrapeResult;
    } else {
      return NextResponse.json({ success: false, error: 'Invalid request format. Please check your input and try again.' }, { status: 400 });
    }
    
    return NextResponse.json(result);

  } catch (error: unknown) {
    const err = error as ApiError;
    const errorStatus = typeof err.status === 'number' ? err.status : 500;
    return NextResponse.json({ success: false, error: 'An error occurred while processing your request. Please try again later.' }, { status: errorStatus });
  }
} 