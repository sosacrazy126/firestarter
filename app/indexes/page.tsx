'use client'

import { useRouter } from 'next/navigation'
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Globe, FileText, Database, ExternalLink, Trash2, Calendar } from 'lucide-react'
import { toast } from "sonner"
import { useStorage } from "@/hooks/useStorage"

interface IndexedSite {
  url: string
  namespace: string
  pagesCrawled: number
  createdAt: string
  metadata?: {
    title?: string
    description?: string
    favicon?: string
    ogImage?: string
  }
}

export default function IndexesPage() {
  const router = useRouter()
  const { indexes, loading, deleteIndex, isUsingRedis } = useStorage()

  const handleSelectIndex = (index: IndexedSite) => {
    // Store the site info in session storage for the dashboard
    const siteInfo = {
      url: index.url,
      namespace: index.namespace,
      pagesCrawled: index.pagesCrawled,
      crawlDate: index.createdAt,
      metadata: index.metadata || {},
      crawlComplete: true,
      fromIndex: true // Flag to indicate this is from the index list
    }
    
    sessionStorage.setItem('firestarter_current_data', JSON.stringify(siteInfo))
    
    // Navigate to the dashboard with namespace parameter
    router.push(`/dashboard?namespace=${index.namespace}`)
  }

  const handleDeleteIndex = async (index: IndexedSite, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (confirm(`Delete chatbot for ${index.metadata?.title || index.url}?`)) {
      try {
        await deleteIndex(index.namespace)
        toast.success('Chatbot deleted successfully')
      } catch {
        toast.error('Failed to delete chatbot')
        console.error('Failed to delete index')
      }
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 max-w-7xl mx-auto font-inter">
      <div className="flex justify-between items-center mb-8">
        <Link href="https://www.firecrawl.dev/?utm_source=tool-firestarter" target="_blank" rel="noopener noreferrer">
          <Image
            src="/firecrawl-logo-with-fire.png"
            alt="Firecrawl Logo"
            width={113}
            height={24}
          />
        </Link>
        <Button
          asChild
          variant="orange"
          size="sm"
        >
          <Link href="/">
            Create New Chatbot
          </Link>
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-[#36322F] mb-2">Your Chatbots</h1>
        <p className="text-gray-600">
          View and manage all your chatbots
          {isUsingRedis && <span className="text-xs text-gray-500 ml-2">(using Redis storage)</span>}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-10">
          <p className="text-gray-600">Loading indexes...</p>
        </div>
      ) : indexes.length === 0 ? (
        <div className="text-center py-20">
          <Globe className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No Chatbots Yet</h3>
          <p className="text-gray-600 mb-6">You haven&apos;t created any chatbots yet.</p>
          <Button asChild variant="orange">
            <Link href="/firestarter">
              Create Your First Chatbot
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {indexes.map((index) => (
            <div
              key={index.namespace}
              onClick={() => handleSelectIndex(index)}
              className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group overflow-hidden"
            >
              <div className="flex items-stretch">
                {/* Left side - OG Image */}
                <div className="relative w-64 flex-shrink-0">
                  {index.metadata?.ogImage ? (
                    <>
                      <Image 
                        src={index.metadata.ogImage} 
                        alt={index.metadata?.title || 'Site image'}
                        fill
                        className="object-cover bg-gray-50"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.parentElement?.querySelector('.fallback-icon')?.classList.remove('hidden');
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/50"></div>
                      <div className="fallback-icon hidden w-full h-full bg-gray-100 flex items-center justify-center absolute inset-0">
                        <Globe className="w-12 h-12 text-gray-400" />
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      <Globe className="w-12 h-12 text-gray-400" />
                    </div>
                  )}
                  {index.metadata?.favicon && (
                    <div className="absolute bottom-2 left-2 w-8 h-8 bg-white rounded-lg p-1 shadow-sm">
                      <Image 
                        src={index.metadata.favicon} 
                        alt="favicon"
                        width={24}
                        height={24}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          e.currentTarget.parentElement!.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
                
                {/* Right side - Content */}
                <div className="flex items-start justify-between p-6 flex-1">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-[#36322F] group-hover:text-orange-600 transition-colors">
                      {index.metadata?.title || new URL(index.url).hostname}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">{index.url}</p>
                    {index.metadata?.description && (
                      <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                        {index.metadata.description}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-6 mt-4 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span>{index.pagesCrawled} pages</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        <span className="font-mono text-xs">{index.namespace.split('-').slice(0, -1).join('.')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(index.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDeleteIndex(index, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <ExternalLink className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}