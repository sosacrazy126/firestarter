'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Globe, Copy, Check, AlertCircle, FileText, Database, ArrowLeft, ExternalLink } from 'lucide-react'
import Image from 'next/image'
// Removed useChat - using custom implementation
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Source {
  url: string
  title: string
  snippet: string
}

interface SiteData {
  url: string
  namespace: string
  pagesCrawled: number
  metadata: {
    title: string
    description: string
    favicon?: string
    ogImage?: string
  }
  crawlId?: string
  crawlComplete?: boolean
  crawlDate?: string
}

// Simple markdown renderer component
function MarkdownContent({ content, onSourceClick, isStreaming = false }: { content: string; onSourceClick?: (index: number) => void; isStreaming?: boolean }) {
  // Simple markdown parsing
  const parseMarkdown = (text: string) => {
    // First, handle code blocks to prevent other parsing inside them
    const codeBlocks: string[] = [];
    let parsed = text.replace(/```([\s\S]*?)```/g, (_, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(`<pre class="bg-gray-50 border border-gray-200 p-4 rounded-lg overflow-x-auto my-4 text-sm"><code>${code.trim()}</code></pre>`);
      return placeholder;
    });
    
    // Handle inline code
    parsed = parsed.replace(/`([^`]+)`/g, '<code class="bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
    
    // Handle links [text](url) - must come before citations
    parsed = parsed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-orange-600 hover:text-orange-700 underline">$1</a>');
    
    // Handle citations [1], [2], etc.
    parsed = parsed.replace(/\[(\d+)\]/g, (_, num) => {
      return `<sup class="citation text-orange-600 cursor-pointer hover:text-orange-700 font-medium" data-citation="${num}">[${num}]</sup>`;
    });
    
    // Bold text
    parsed = parsed.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>');
    
    // Italic text  
    parsed = parsed.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Split into lines for processing
    const lines = parsed.split('\n');
    const processedLines = [];
    let inList = false;
    let listType = '';
    let inParagraph = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
      
      // Headers
      if (line.match(/^#{1,3}\s/)) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        if (line.match(/^###\s(.+)$/)) {
          processedLines.push(line.replace(/^###\s(.+)$/, '<h3 class="text-base font-semibold mt-4 mb-2 text-gray-900">$1</h3>'));
        } else if (line.match(/^##\s(.+)$/)) {
          processedLines.push(line.replace(/^##\s(.+)$/, '<h2 class="text-lg font-semibold mt-5 mb-3 text-gray-900">$1</h2>'));
        } else if (line.match(/^#\s(.+)$/)) {
          processedLines.push(line.replace(/^#\s(.+)$/, '<h1 class="text-xl font-bold mt-6 mb-3 text-gray-900">$1</h1>'));
        }
        continue;
      }
      
      // Lists
      const bulletMatch = line.match(/^[-*]\s(.+)$/);
      const numberedMatch = line.match(/^(\d+)\.\s(.+)$/);
      
      if (bulletMatch || numberedMatch) {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        
        const newListType = bulletMatch ? 'ul' : 'ol';
        if (!inList) {
          listType = newListType;
          processedLines.push(`<${listType} class="${listType === 'ul' ? 'list-disc' : 'list-decimal'} ml-6 my-3 space-y-1">`);
          inList = true;
        } else if (listType !== newListType) {
          processedLines.push(`</${listType}>`);
          listType = newListType;
          processedLines.push(`<${listType} class="${listType === 'ul' ? 'list-disc' : 'list-decimal'} ml-6 my-3 space-y-1">`);
        }
        
        const content = bulletMatch ? bulletMatch[1] : numberedMatch![2];
        processedLines.push(`<li class="text-gray-700 leading-relaxed">${content}</li>`);
        continue;
      } else if (inList && line === '') {
        processedLines.push(`</${listType}>`);
        inList = false;
        continue;
      }
      
      // Empty lines
      if (line === '') {
        if (inParagraph) {
          processedLines.push('</p>');
          inParagraph = false;
        }
        if (inList) {
          processedLines.push(`</${listType}>`);
          inList = false;
        }
        continue;
      }
      
      // Regular text - start new paragraph if needed
      if (!inParagraph && !inList && !line.startsWith('<')) {
        processedLines.push('<p class="text-gray-700 leading-relaxed mb-3">');
        inParagraph = true;
      }
      
      // Add line with space if in paragraph
      if (inParagraph) {
        processedLines.push(line + (nextLine && !nextLine.match(/^[-*#]|\d+\./) ? ' ' : ''));
      } else {
        processedLines.push(line);
      }
    }
    
    // Close any open tags
    if (inParagraph) {
      processedLines.push('</p>');
    }
    if (inList) {
      processedLines.push(`</${listType}>`);
    }
    
    parsed = processedLines.join('\n');
    
    // Restore code blocks
    codeBlocks.forEach((block, index) => {
      parsed = parsed.replace(`__CODE_BLOCK_${index}__`, block);
    });
    
    return parsed;
  };

  useEffect(() => {
    // Add click handlers for citations
    const citations = document.querySelectorAll('.citation');
    citations.forEach(citation => {
      citation.addEventListener('click', (e) => {
        const citationNum = parseInt((e.target as HTMLElement).getAttribute('data-citation') || '0');
        if (onSourceClick && citationNum > 0) {
          onSourceClick(citationNum - 1);
        }
      });
    });

    return () => {
      citations.forEach(citation => {
        citation.removeEventListener('click', () => {});
      });
    };
  }, [content, onSourceClick]);

  return (
    <div className="relative">
      <div 
        className="prose prose-sm max-w-none prose-gray prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-orange-600 prose-code:bg-orange-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-100 prose-pre:text-gray-800 prose-li:text-gray-700 prose-a:text-orange-600 prose-a:no-underline hover:prose-a:underline"
        dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }}
      />
      {isStreaming && (
        <span className="inline-block w-1 h-4 bg-gray-600 animate-pulse ml-1" />
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [siteData, setSiteData] = useState<SiteData | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [copiedItem, setCopiedItem] = useState<string | null>(null)
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; sources?: Source[] }>>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showApiModal, setShowApiModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'curl' | 'javascript' | 'python'>('curl')
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !siteData) return

    let processedInput = input.trim()
    
    // Check if the input looks like a URL without protocol
    const urlPattern = /^(?!https?:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/
    if (urlPattern.test(processedInput)) {
      processedInput = 'https://' + processedInput
    }

    const userMessage = { role: 'user' as const, content: processedInput }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/firestarter/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [userMessage],
          namespace: siteData.namespace,
          stream: true
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let sources: Source[] = []
      let content = ''
      let hasStartedStreaming = false

      if (!reader) throw new Error('No response body')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.trim() === '') continue
          
          // Handle Vercel AI SDK streaming format
          if (line.startsWith('0:')) {
            // Text content chunk
            const textContent = line.slice(2)
            if (textContent.startsWith('"') && textContent.endsWith('"')) {
              const text = JSON.parse(textContent)
              content += text
              
              // Add assistant message on first content
              if (!hasStartedStreaming) {
                hasStartedStreaming = true
                setMessages(prev => [...prev, { 
                  role: 'assistant' as const, 
                  content: content, 
                  sources: sources 
                }])
              } else {
                // Update the last message with new content
                setMessages(prev => {
                  const newMessages = [...prev]
                  const lastMessage = newMessages[newMessages.length - 1]
                  if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.content = content
                    lastMessage.sources = sources
                  }
                  return newMessages
                })
              }
              scrollToBottom()
            }
          } else if (line.startsWith('8:')) {
            // Streaming data chunk (sources, etc)
            try {
              const jsonStr = line.slice(2)
              const data = JSON.parse(jsonStr)
              console.log('[Dashboard] Stream data:', data)
              
              if (Array.isArray(data)) {
                // This might be our sources
                const sourcesData = data.find(item => item && typeof item === 'object' && 'type' in item && item.type === 'sources')
                if (sourcesData && sourcesData.sources) {
                  sources = sourcesData.sources
                }
              }
            } catch (e) {
              console.log('[Dashboard] Could not parse stream data:', line)
            }
          } else if (line.startsWith('e:') || line.startsWith('d:')) {
            // End metadata - we can ignore these
            console.log('[Dashboard] Stream ended')
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error)
      toast.error('Failed to get response')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Get namespace from URL params
    const namespaceParam = searchParams.get('namespace')
    console.log('[Dashboard] Loading with namespace:', namespaceParam)
    
    if (namespaceParam) {
      // Try to load data for this specific namespace
      const storedIndexes = localStorage.getItem('firestarter_indexes')
      if (storedIndexes) {
        const indexes = JSON.parse(storedIndexes)
        const matchingIndex = indexes.find((idx: any) => idx.namespace === namespaceParam)
        if (matchingIndex) {
          console.log('[Dashboard] Found matching index:', matchingIndex)
          setSiteData(matchingIndex)
          // Also update sessionStorage for consistency
          sessionStorage.setItem('firestarter_current_data', JSON.stringify(matchingIndex))
          // Clear messages when namespace changes
          setMessages([])
        } else {
          // Namespace not found in stored indexes
          router.push('/indexes')
        }
      } else {
        router.push('/indexes')
      }
    } else {
      // Fallback to sessionStorage if no namespace param
      const data = sessionStorage.getItem('firestarter_current_data')
      if (data) {
        const parsedData = JSON.parse(data)
        setSiteData(parsedData)
        // Add namespace to URL for consistency
        router.replace(`/dashboard?namespace=${parsedData.namespace}`)
      } else {
        router.push('/indexes')
      }
    }
  }, [router, searchParams])

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({
        top: scrollAreaRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }

  const handleDelete = () => {
    // Remove from localStorage
    const storedIndexes = localStorage.getItem('firestarter_indexes')
    if (storedIndexes && siteData) {
      const indexes = JSON.parse(storedIndexes)
      const updatedIndexes = indexes.filter((idx: any) => idx.namespace !== siteData.namespace)
      localStorage.setItem('firestarter_indexes', JSON.stringify(updatedIndexes))
    }
    
    sessionStorage.removeItem('firestarter_current_data')
    router.push('/indexes')
  }

  const copyToClipboard = (text: string, itemId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedItem(itemId)
    setTimeout(() => setCopiedItem(null), 2000)
  }


  if (!siteData) {
    console.log('[Dashboard] No siteData, showing loading...')
    return (
      <div className="min-h-screen bg-[#FBFAF9] flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }
  
  console.log('[Dashboard] Rendering with siteData:', siteData)

  const modelName = `firecrawl-${siteData.namespace}`
  
  // Check if we're in development mode
  const isDev = process.env.NODE_ENV === 'development' || (typeof window !== 'undefined' && window.location.hostname === 'localhost')
  const apiUrl = isDev ? 'http://localhost:3001/api/v1/chat/completions' : 'https://tools.firecrawl.dev/api/v1/chat/completions'
  
  const curlCommand = `curl ${apiUrl} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_FIRESTARTER_API_KEY" \\
  -d '{
    "model": "${modelName}",
    "messages": [
      {"role": "user", "content": "Your question here"}
    ]
  }'`
  
  const jsCode = `// Using fetch API
const response = await fetch('${apiUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_FIRESTARTER_API_KEY'
  },
  body: JSON.stringify({
    model: '${modelName}',
    messages: [
      { role: 'user', content: 'Your question here' }
    ]
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);`
  
  const pythonCode = `import requests

response = requests.post(
    '${apiUrl}',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_FIRESTARTER_API_KEY'
    },
    json={
        'model': '${modelName}',
        'messages': [
            {'role': 'user', 'content': 'Your question here'}
        ]
    }
)

data = response.json()
print(data['choices'][0]['message']['content'])`
  

  return (
    <div className="min-h-screen bg-[#FBFAF9]">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/indexes')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                {siteData.metadata.favicon ? (
                  <Image 
                    src={siteData.metadata.favicon} 
                    alt={siteData.metadata.title}
                    width={32}
                    height={32}
                    className="w-8 h-8"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement?.querySelector('.fallback-icon')?.classList.remove('hidden');
                    }}
                  />
                ) : (
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Globe className="w-5 h-5 text-gray-400" />
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-semibold text-[#36322F]">
                    {siteData.metadata.title.length > 50 
                      ? siteData.metadata.title.substring(0, 47) + '...' 
                      : siteData.metadata.title}
                  </h1>
                  <p className="text-sm text-gray-600">{siteData.url}</p>
                </div>
              </div>
            </div>
            
            <Button
              onClick={() => setShowDeleteModal(true)}
              variant="outline"
              size="sm"
              className="text-black hover:text-gray-700 hover:bg-gray-50 border-gray-300"
            >
              Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6 h-[600px]">
          {/* Stats Cards */}
          <div className="lg:w-1/4 flex flex-col gap-4 h-full">
            <div className="relative bg-white rounded-xl border border-gray-200 overflow-hidden flex-1">
              {/* OG Image Background */}
              {siteData.metadata.ogImage && (
                <div className="absolute inset-0 z-0">
                  <Image 
                    src={siteData.metadata.ogImage} 
                    alt=""
                    fill
                    className="object-contain opacity-30"
                    onError={(e) => {
                      e.currentTarget.parentElement!.style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-white/70 via-white/60 to-white/70"></div>
                </div>
              )}
              
              <div className="relative z-10 p-6 h-full flex flex-col">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-[#36322F]">
                    {siteData.metadata.title.length > 30 
                      ? siteData.metadata.title.substring(0, 27) + '...' 
                      : siteData.metadata.title}
                  </h2>
                  <p className="text-xs text-gray-600">Knowledge Base</p>
                </div>
                
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-700">
                      <FileText className="w-4 h-4" />
                      <span className="text-sm font-medium">Pages</span>
                    </div>
                    <span className="text-lg font-semibold text-[#36322F]">{siteData.pagesCrawled}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-700">
                      <Database className="w-4 h-4" />
                      <span className="text-sm font-medium">Chunks</span>
                    </div>
                    <span className="text-lg font-semibold text-[#36322F]">{Math.round(siteData.pagesCrawled * 3)}</span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-700">
                      <Globe className="w-4 h-4" />
                      <span className="text-sm font-medium">Namespace</span>
                    </div>
                    <span className="text-xs font-mono text-gray-800 break-all">{siteData.namespace.split('-').slice(0, -1).join('.')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200 flex flex-col flex-1">
              <h2 className="text-lg font-semibold text-[#36322F] mb-4">Quick Start</h2>
              <div className="space-y-4 flex-1">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">1. Test in Dashboard</h3>
                  <p className="text-xs text-gray-600">Use the chat panel to test responses and refine your queries</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">2. Get API Access</h3>
                  <p className="text-xs text-gray-600">Click below to see integration code in multiple languages</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">3. Deploy Anywhere</h3>
                  <p className="text-xs text-gray-600">Deploy chatbot script OR OpenAI-compatible endpoint API</p>
                </div>
              </div>
              <div className="mt-8">
                <Button
                  onClick={() => setShowApiModal(true)}
                  variant="orange"
                  className="w-full"
                >
                  View Integration Code
                </Button>
              </div>
            </div>
          </div>

          {/* Chat Panel and Sources */}
          <div className="lg:w-3/4 h-full">
            <div className="flex gap-6 h-full">
              {/* Chat Panel */}
              <div className="w-2/3 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden h-full">
                <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-6">
                  {messages.length === 0 && (
                    <div className="text-center py-20">
                      <div className="mb-4">
                        {siteData.metadata.favicon && (
                          <Image 
                            src={siteData.metadata.favicon} 
                            alt={siteData.metadata.title}
                            width={64}
                            height={64}
                            className="w-16 h-16 mx-auto mb-4 opacity-50"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-[#36322F] mb-2">
                        Chat with {siteData.metadata.title}
                      </h3>
                      <p className="text-gray-600">
                        Ask anything about their {siteData.pagesCrawled} indexed pages
                      </p>
                    </div>
                  )}
                
                  {messages.map((message, index) => (
              <div
                key={index}
                className={`mb-6 ${message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}
              >
                <div className={`max-w-[85%] ${message.role === 'user' ? 'ml-12' : 'mr-12'}`}>
                  <div
                    className={`px-5 py-4 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-orange-500 text-white'
                        : 'bg-white border border-gray-200 text-gray-800 shadow-sm'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <p className="text-[15px] leading-relaxed">{message.content}</p>
                    ) : (
                      <div className="prose prose-sm max-w-none prose-gray">
                        <MarkdownContent 
                          content={message.content} 
                          isStreaming={isLoading && index === messages.length - 1 && message.content !== ''}
                        />
                      </div>
                    )}
                  </div>
                
                  {/* Sources displayed below the message bubble */}
                  {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                  <div className="mt-4 ml-2">
                    <p className="text-xs font-medium text-gray-600 mb-3">References:</p>
                    <div className="grid grid-cols-1 gap-2 max-w-2xl">
                      {message.sources.map((source, idx) => (
                        <a
                          key={idx}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-3 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 hover:border-gray-300 transition-all group"
                        >
                          <span className="text-xs font-medium text-gray-500 mt-0.5">[{idx + 1}]</span>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-gray-800 group-hover:text-blue-600 transition-colors line-clamp-1">
                              {source.title.length > 60 
                                ? source.title.substring(0, 57) + '...' 
                                : source.title}
                            </h4>
                            {source.snippet && (
                              <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                {source.snippet.length > 100 
                                  ? source.snippet.substring(0, 97) + '...' 
                                  : source.snippet}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1 truncate">
                              {source.url}
                            </p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-blue-600 flex-shrink-0 mt-0.5" />
                        </a>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
              </div>
              ))}
              
              {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="flex justify-start mb-6">
                  <div className="max-w-[85%] mr-12">
                    <div className="px-5 py-4 rounded-2xl bg-white border border-gray-200 text-gray-800 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse delay-75" />
                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse delay-150" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
                </div>
                
                <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
                  <div className="relative">
                    <Input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={`Ask about ${siteData.metadata.title}...`}
                      className="w-full pr-12 placeholder:text-gray-400"
                      disabled={isLoading}
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !input.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-600 hover:text-orange-700 disabled:opacity-50 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>
              
              {/* Sources Panel */}
              <div className="w-1/3">
                <div className="bg-white rounded-xl p-6 border border-gray-200 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[#36322F]">Knowledge Base</h2>
                  </div>
                  
                  <div className="space-y-3 p-3 flex-1">
                    <div className="text-center py-8">
                      <Database className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        {siteData.pagesCrawled} pages indexed
                      </p>
                      <p className="text-xs text-gray-500 mb-4">
                        Ready to answer questions about {siteData.metadata.title}
                      </p>
                      <div className="space-y-2 text-left">
                        <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-xs text-gray-600">Total chunks</span>
                          <span className="text-xs font-medium text-gray-800">{Math.round(siteData.pagesCrawled * 3)}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-xs text-gray-600">Crawl date</span>
                          <span className="text-xs font-medium text-gray-800">
                            {siteData.crawlDate ? new Date(siteData.crawlDate).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-xs text-gray-600">Namespace</span>
                          <span className="text-xs font-mono text-gray-800 truncate max-w-[150px]">
                            {siteData.namespace.split('-').slice(0, -1).join('.')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Index</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the index for {siteData.metadata.title}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* API Modal */}
      <Dialog open={showApiModal} onOpenChange={setShowApiModal}>
        <DialogContent className="sm:max-w-4xl bg-white">
          <DialogHeader>
            <DialogTitle>API Access</DialogTitle>
            <DialogDescription>
              Use this index with any OpenAI-compatible API client.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 mb-6">
            <div>
              <span className="text-sm text-gray-600">Model Name:</span>
              <code className="ml-2 text-sm text-orange-600">{modelName}</code>
            </div>
            <div>
              <span className="text-sm text-gray-600">Endpoint:</span>
              <code className="ml-2 text-sm text-gray-700">/api/v1/chat/completions</code>
            </div>
          </div>
          
          {/* Language tabs */}
          <div className="mb-6">
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              <button
                onClick={() => setActiveTab('curl')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'curl'
                    ? 'text-orange-600 border-b-2 border-orange-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                cURL
              </button>
              <button
                onClick={() => setActiveTab('javascript')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'javascript'
                    ? 'text-orange-600 border-b-2 border-orange-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                JavaScript
              </button>
              <button
                onClick={() => setActiveTab('python')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'python'
                    ? 'text-orange-600 border-b-2 border-orange-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Python
              </button>
            </div>
            
            {/* Tab content */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {activeTab === 'curl' && 'cURL Command'}
                  {activeTab === 'javascript' && 'JavaScript Code'}
                  {activeTab === 'python' && 'Python Code'}
                </span>
                <button
                  onClick={() => copyToClipboard(
                    activeTab === 'curl' ? curlCommand : 
                    activeTab === 'javascript' ? jsCode : 
                    pythonCode, 
                    activeTab
                  )}
                  className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1"
                >
                  {copiedItem === activeTab ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedItem === activeTab ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="text-sm text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">
                <code>
                  {activeTab === 'curl' && curlCommand}
                  {activeTab === 'javascript' && jsCode}
                  {activeTab === 'python' && pythonCode}
                </code>
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}