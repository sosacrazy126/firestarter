"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStorage } from "@/hooks/useStorage";
import { clientConfig as config } from "@/firestarter.config";
import { 
  Globe, 
  ArrowRight, 
  Settings, 
  Loader2, 
  CheckCircle2, 
  FileText, 
  AlertCircle,
  Database,
  Zap,
  Search,
  Sparkles,
  Lock,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function FirestarterPage() {
  const router = useRouter();
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const urlParam = searchParams.get('url');
  const { saveIndex } = useStorage();
  
  const [url, setUrl] = useState(urlParam || 'https://docs.firecrawl.dev/');
  const [hasInteracted, setHasInteracted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pageLimit, setPageLimit] = useState(config.crawling.defaultLimit);
  const [isCreationDisabled, setIsCreationDisabled] = useState<boolean | undefined>(undefined);
  const [crawlProgress, setCrawlProgress] = useState<{
    status: string;
    pagesFound: number;
    pagesScraped: number;
    currentPage?: string;
  } | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [firecrawlApiKey, setFirecrawlApiKey] = useState<string>('');
  const [isValidatingApiKey, setIsValidatingApiKey] = useState(false);
  const [hasFirecrawlKey, setHasFirecrawlKey] = useState(false);

  useEffect(() => {
    // Check environment and API keys
    fetch('/api/check-env')
      .then(res => res.json())
      .then(data => {
        setIsCreationDisabled(data.environmentStatus.DISABLE_CHATBOT_CREATION || false);
        
        // Check for Firecrawl API key
        const hasEnvFirecrawl = data.environmentStatus.FIRECRAWL_API_KEY;
        setHasFirecrawlKey(hasEnvFirecrawl);
        
        if (!hasEnvFirecrawl) {
          // Check localStorage for saved API key
          const savedKey = localStorage.getItem('firecrawl_api_key');
          if (savedKey) {
            setFirecrawlApiKey(savedKey);
            setHasFirecrawlKey(true);
          }
        }
      })
      .catch(() => {
        setIsCreationDisabled(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    // Check if we have Firecrawl API key
    
    if (!hasFirecrawlKey && !localStorage.getItem('firecrawl_api_key')) {
      setShowApiKeyModal(true);
      return;
    }

    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    
    // Validate URL
    try {
      new URL(normalizedUrl);
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    setLoading(true);
    setCrawlProgress({
      status: 'Starting crawl...',
      pagesFound: 0,
      pagesScraped: 0
    });
    
    interface CrawlResponse {
      success: boolean
      namespace: string
      crawlId?: string
      details: {
        url: string
        pagesCrawled: number
      }
      data: Array<{
        url?: string
        metadata?: {
          sourceURL?: string
          title?: string
          ogTitle?: string
          description?: string
          ogDescription?: string
          favicon?: string
          ogImage?: string
          'og:image'?: string
          'twitter:image'?: string
        }
      }>
    }
    
    let data: CrawlResponse | null = null;
    
    try {
      // Simulate progressive updates
      let currentProgress = 0;
      
      const progressInterval = setInterval(() => {
        currentProgress += Math.random() * 3;
        if (currentProgress > pageLimit * 0.8) {
          clearInterval(progressInterval);
        }
        
        setCrawlProgress(prev => {
          if (!prev) return null;
          const scraped = Math.min(Math.floor(currentProgress), pageLimit);
          return {
            ...prev,
            status: scraped < pageLimit * 0.3 ? 'Discovering pages...' : 
                   scraped < pageLimit * 0.7 ? 'Scraping content...' : 
                   'Finalizing...',
            pagesFound: pageLimit,
            pagesScraped: scraped,
            currentPage: scraped > 0 ? `Processing page ${scraped} of ${pageLimit}` : undefined
          };
        });
      }, 300);
      
      // Get API key from localStorage if not in environment
      const firecrawlApiKey = localStorage.getItem('firecrawl_api_key');
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add API key to headers if available from localStorage (and not in env)
      if (firecrawlApiKey) {
        headers['X-Firecrawl-API-Key'] = firecrawlApiKey;
      }
      
      const response = await fetch('/api/firestarter/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: normalizedUrl, limit: pageLimit })
      });

      data = await response.json();
      
      // Clear the interval
      if (progressInterval) clearInterval(progressInterval);
      
      if (data && data.success) {
        // Update progress to show completion
        setCrawlProgress({
          status: 'Crawl complete!',
          pagesFound: data.details?.pagesCrawled || 0,
          pagesScraped: data.details?.pagesCrawled || 0
        });
        
        // Find the homepage in crawled data for metadata
        let homepageMetadata: {
          title?: string
          ogTitle?: string
          description?: string
          ogDescription?: string
          favicon?: string
          ogImage?: string
          'og:image'?: string
          'twitter:image'?: string
        } = {};
        if (data.data && data.data.length > 0) {
          const homepage = data.data.find((page) => {
            const pageUrl = page.metadata?.sourceURL || page.url || '';
            // Check if it's the homepage
            return pageUrl === normalizedUrl || pageUrl === normalizedUrl + '/' || pageUrl === normalizedUrl.replace(/\/$/, '');
          }) || data.data[0]; // Fallback to first page
          
          homepageMetadata = homepage.metadata || {};
        }
        
        // Store the crawl info and redirect to dashboard
        const siteInfo = {
          url: normalizedUrl,
          namespace: data.namespace,
          crawlId: data.crawlId,
          pagesCrawled: data.details?.pagesCrawled || 0,
          crawlComplete: true,
          crawlDate: new Date().toISOString(),
          metadata: {
            title: homepageMetadata.ogTitle || homepageMetadata.title || new URL(normalizedUrl).hostname,
            description: homepageMetadata.ogDescription || homepageMetadata.description || 'Your custom website',
            favicon: homepageMetadata.favicon,
            ogImage: homepageMetadata.ogImage || homepageMetadata['og:image'] || homepageMetadata['twitter:image']
          }
        };
        
        // Store only metadata for current session (no crawlData - that's in Upstash)
        sessionStorage.setItem('firestarter_current_data', JSON.stringify(siteInfo));
        
        // Save index metadata using the storage hook
        await saveIndex({
          url: normalizedUrl,
          namespace: data.namespace,
          pagesCrawled: data.details?.pagesCrawled || 0,
          createdAt: new Date().toISOString(),
          metadata: {
            title: homepageMetadata.ogTitle || homepageMetadata.title || new URL(normalizedUrl).hostname,
            description: homepageMetadata.ogDescription || homepageMetadata.description || 'Your custom website',
            favicon: homepageMetadata.favicon,
            ogImage: homepageMetadata.ogImage || homepageMetadata['og:image'] || homepageMetadata['twitter:image']
          }
        });
        
        // Small delay to show completion
        setTimeout(() => {
          router.push(`/dashboard?namespace=${siteInfo.namespace}`);
        }, 1000);
      } else if (data && 'error' in data) {
        setCrawlProgress({
          status: 'Error: ' + (data as { error: string }).error,
          pagesFound: 0,
          pagesScraped: 0
        });
        toast.error((data as { error: string }).error);
      }
    } catch {
      toast.error('Failed to start crawling. Please try again.');
    } finally {
      if (!data?.success) {
        setLoading(false);
        setCrawlProgress(null);
      }
    }
  };

  const handleApiKeySubmit = async () => {
    if (!firecrawlApiKey.trim()) {
      toast.error('Please enter a valid Firecrawl API key');
      return;
    }

    setIsValidatingApiKey(true);

    try {
      // Test the Firecrawl API key
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Firecrawl-API-Key': firecrawlApiKey,
        },
        body: JSON.stringify({ url: 'https://example.com' }),
      });

      if (!response.ok) {
        throw new Error('Invalid Firecrawl API key');
      }
      
      // Save the API key to localStorage
      localStorage.setItem('firecrawl_api_key', firecrawlApiKey);
      setHasFirecrawlKey(true);

      toast.success('API key saved successfully!');
      setShowApiKeyModal(false);

      // Trigger form submission after API key is saved
      if (url) {
        const form = document.querySelector('form');
        if (form) {
          form.requestSubmit();
        }
      }
    } catch {
      toast.error('Invalid API key. Please check and try again.');
    } finally {
      setIsValidatingApiKey(false);
    }
  };

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
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="orange"
            className="font-medium"
          >
            <Link href="/indexes">
              View All
            </Link>
          </Button>
          <Button
            asChild
            variant="code"
            className="font-medium flex items-center gap-2"
          >
            <a
              href="https://github.com/mendableai/hostedTools/tree/main/app/firestarter"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Use this template
            </a>
          </Button>
        </div>
      </div>

      {isCreationDisabled === undefined ? (
        // Show loading state while checking environment
        <div className="max-w-2xl mx-auto">
          <div className="text-center pt-8 pb-6">
            <h1 className="text-[2.5rem] lg:text-[3.8rem] text-center text-[#36322F] dark:text-zinc-100 font-semibold tracking-tight leading-[1.1] opacity-0 animate-fade-up [animation-duration:500ms] [animation-delay:200ms] [animation-fill-mode:forwards]">
              Firestarter<br />
              <span className="text-[2.5rem] lg:text-[3.8rem] block mt-2 opacity-0 animate-fade-up [animation-duration:500ms] [animation-delay:400ms] [animation-fill-mode:forwards] text-transparent bg-clip-text bg-gradient-to-tr from-red-600 to-yellow-500">
                Loading...
              </span>
            </h1>
          </div>
        </div>
      ) : isCreationDisabled === true ? (
        <div className="max-w-2xl mx-auto">
          <div className="text-center pt-8 pb-6">
            <h1 className="text-[2.5rem] lg:text-[3.8rem] text-center text-[#36322F] dark:text-zinc-100 font-semibold tracking-tight leading-[1.1] opacity-0 animate-fade-up [animation-duration:500ms] [animation-delay:200ms] [animation-fill-mode:forwards]">
              Firestarter<br />
              <span className="text-[2.5rem] lg:text-[3.8rem] block mt-2 opacity-0 animate-fade-up [animation-duration:500ms] [animation-delay:400ms] [animation-fill-mode:forwards] text-transparent bg-clip-text bg-gradient-to-tr from-gray-400 to-gray-600">
                Read-Only Mode
              </span>
            </h1>
          </div>
          
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-8 text-center">
            <Lock className="h-12 w-12 text-orange-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-[#36322F] mb-2">
              Chatbot Creation Disabled
            </h2>
            <p className="text-gray-600 mb-6">
              Chatbot creation has been disabled by the administrator. You can only view and interact with existing chatbots.
            </p>
            <div className="flex gap-4 justify-center">
              <Button
                asChild
                variant="orange"
                className="font-medium"
              >
                <Link href="/indexes">
                  View Existing Chatbots
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="font-medium"
              >
                <Link href="/">
                  Back to Home
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="text-center pt-8 pb-6">
            <h1 className="text-[2.5rem] lg:text-[3.8rem] text-center text-[#36322F] dark:text-zinc-100 font-semibold tracking-tight leading-[1.1] opacity-0 animate-fade-up [animation-duration:500ms] [animation-delay:200ms] [animation-fill-mode:forwards]">
              Firestarter<br />
              <span className="text-[2.5rem] lg:text-[3.8rem] block mt-2 opacity-0 animate-fade-up [animation-duration:500ms] [animation-delay:400ms] [animation-fill-mode:forwards] text-transparent bg-clip-text bg-gradient-to-tr from-red-600 to-yellow-500">
                Chatbots, Instantly.
              </span>
            </h1>
          </div>

          <div className="max-w-2xl mx-auto">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Input
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setHasInteracted(true);
                  }}
                  onFocus={() => {
                    if (!hasInteracted && url === 'https://docs.firecrawl.dev/') {
                      setUrl('');
                      setHasInteracted(true);
                    }
                  }}
                  placeholder="https://example.com"
                  className="w-full h-14 px-6 text-lg"
                  required
                  disabled={loading}
                />
                <Button
                  type="submit"
                  disabled={loading}
                  variant="orange"
                  className="absolute right-2 top-2 h-10"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Crawling...
                    </>
                  ) : (
                    <>
                      Start
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* Loading Progress */}
            {loading && crawlProgress && (
              <div className="mt-8 p-6 bg-[#FBFAF9] rounded-xl border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[#36322F] flex items-center gap-2">
                    {crawlProgress.status === 'Crawl complete!' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600 animate-in zoom-in duration-300" />
                    ) : crawlProgress.status.includes('Error') ? (
                      <AlertCircle className="w-5 h-5 text-red-600 animate-in zoom-in duration-300" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-orange-600 animate-spin" />
                    )}
                    <span className="animate-in fade-in duration-300">{crawlProgress.status}</span>
                  </h3>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Pages discovered</span>
                    <span className="text-[#36322F] font-medium transition-all duration-300">
                      {crawlProgress.pagesFound}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Pages scraped</span>
                    <span className="text-[#36322F] font-medium transition-all duration-300">
                      {crawlProgress.pagesScraped}
                    </span>
                  </div>
                  
                  {crawlProgress.pagesFound > 0 && (
                    <div className="mt-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-orange-500 to-red-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(crawlProgress.pagesScraped / crawlProgress.pagesFound) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {crawlProgress.currentPage && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">Currently scraping:</p>
                      <p className="text-sm text-gray-800 truncate flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-500" />
                        {crawlProgress.currentPage}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Settings Button */}
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                variant="code"
                size="sm"
                className="font-medium"
              >
                <Settings className="w-4 h-4 mr-2" />
                Advanced Settings
              </Button>
            </div>

            {/* Settings Panel */}
            {showSettings && (
              <div className="mt-4 p-6 bg-[#FBFAF9] rounded-xl border border-gray-200">
                <h3 className="text-lg font-semibold text-[#36322F] mb-4">Crawl Settings</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Maximum pages to crawl
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min={config.crawling.minLimit}
                        max={config.crawling.maxLimit}
                        step="5"
                        value={pageLimit}
                        onChange={(e) => setPageLimit(parseInt(e.target.value))}
                        className="flex-1 accent-orange-500"
                        disabled={loading}
                      />
                      <span className="text-[#36322F] font-medium w-12 text-right">{pageLimit}</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-600">
                      More pages = better coverage but longer crawl time
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      * To set limit higher - feel free to pull the GitHub repo and deploy your own version (with a better copy)
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    {config.crawling.limitOptions.map(limit => (
                      <Button
                        key={limit}
                        type="button"
                        onClick={() => setPageLimit(limit)}
                        disabled={loading}
                        variant={pageLimit === limit ? "orange" : "outline"}
                        size="sm"
                      >
                        {limit}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-12">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#FBFAF9] rounded-xl border border-gray-200 px-6 py-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Globe className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex items-center">
                    <h3 className="text-base font-semibold text-[#36322F]">Smart Crawling</h3>
                  </div>
                </div>
                
                <div className="bg-[#FBFAF9] rounded-xl border border-gray-200 px-6 py-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex items-center">
                    <h3 className="text-base font-semibold text-[#36322F]">Content Extraction</h3>
                  </div>
                </div>
                
                <div className="bg-[#FBFAF9] rounded-xl border border-gray-200 px-6 py-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Database className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex items-center">
                    <h3 className="text-base font-semibold text-[#36322F]">Intelligent Chunking</h3>
                  </div>
                </div>
                
                <div className="bg-[#FBFAF9] rounded-xl border border-gray-200 px-6 py-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Search className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex items-center">
                    <h3 className="text-base font-semibold text-[#36322F]">Semantic Search</h3>
                  </div>
                </div>
                
                <div className="bg-[#FBFAF9] rounded-xl border border-gray-200 px-6 py-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex items-center">
                    <h3 className="text-base font-semibold text-[#36322F]">RAG Pipeline</h3>
                  </div>
                </div>
                
                <div className="bg-[#FBFAF9] rounded-xl border border-gray-200 px-6 py-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex items-center">
                    <h3 className="text-base font-semibold text-[#36322F]">Instant API</h3>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* API Key Modal */}
      <Dialog open={showApiKeyModal} onOpenChange={setShowApiKeyModal}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle>Firecrawl API Key Required</DialogTitle>
            <DialogDescription>
              This tool requires a Firecrawl API key to crawl and index websites.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <Button
              onClick={() => window.open('https://www.firecrawl.dev', '_blank')}
              variant="outline"
              size="sm"
              className="flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
              Get Firecrawl API Key
            </Button>
            <div className="flex flex-col gap-2">
              <label htmlFor="firecrawl-key" className="text-sm font-medium">
                Firecrawl API Key
              </label>
              <Input
                id="firecrawl-key"
                type="password"
                placeholder="fc-..."
                value={firecrawlApiKey}
                onChange={(e) => setFirecrawlApiKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isValidatingApiKey) {
                    handleApiKeySubmit();
                  }
                }}
                disabled={isValidatingApiKey}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="code"
              onClick={() => setShowApiKeyModal(false)}
              disabled={isValidatingApiKey}
              className="font-medium"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApiKeySubmit}
              disabled={isValidatingApiKey || !firecrawlApiKey.trim()}
              variant="orange"
              className="font-medium"
            >
              {isValidatingApiKey ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validating...
                </>
              ) : (
                'Submit'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}