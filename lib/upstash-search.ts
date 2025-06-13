import { Search } from '@upstash/search'

// Initialize Upstash Search client
const searchClient = new Search({
  url: process.env.UPSTASH_SEARCH_REST_URL!,
  token: process.env.UPSTASH_SEARCH_REST_TOKEN!,
})

// Create a search index for firestarter documents
export const searchIndex = searchClient.index<FirestarterContent>('firestarter')

export interface FirestarterContent {
  text: string
  url: string
  title: string
  [key: string]: unknown // Add index signature for Upstash type compatibility
}

export interface FirestarterIndex {
  namespace: string
  url: string
  pagesCrawled: number
  crawlDate: string
  metadata: {
    title: string
    description?: string
    favicon?: string
    ogImage?: string
  }
}