'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Send, Globe, Copy, Check, AlertCircle, FileText, Database, ArrowLeft, ExternalLink } from 'lucide-react'
// import ReactMarkdown from 'react-markdown'
// import remarkGfm from 'remark-gfm'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{
    url: string
    title: string
    snippet: string
  }>
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
function MarkdownContent({ content }: { content: string }) {
  // Simple markdown parsing
  const parseMarkdown = (text: string) => {
    // Handle links [text](url) - must come before citations
    let parsed = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-orange-600 hover:text-orange-700 underline">$1</a>');
    
    // Handle citations [1], [2], etc.
    parsed = parsed.replace(/\[(\d+)\]/g, '<sup class="citation text-orange-600 cursor-pointer hover:text-orange-700">[$1]</sup>');
    
    // Bold text
    parsed = parsed.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
    
    // Italic text  
    parsed = parsed.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Headers
    parsed = parsed.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>');
    parsed = parsed.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>');
    parsed = parsed.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3">$1</h1>');
    
    // Handle list blocks
    const listBlocks = parsed.split('\n');
    let inList = false;
    const processedLines = [];
    
    for (let i = 0; i < listBlocks.length; i++) {
      const line = listBlocks[i];
      const isListItem = line.match(/^- (.+)$/) || line.match(/^(\d+)\. (.+)$/);
      
      if (isListItem && !inList) {
        processedLines.push('<ul class="space-y-1 my-3">');
        inList = true;
      } else if (!isListItem && inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      
      if (line.match(/^- (.+)$/)) {
        processedLines.push(line.replace(/^- (.+)$/, '<li class="ml-5 list-disc">$1</li>'));
      } else if (line.match(/^(\d+)\. (.+)$/)) {
        processedLines.push(line.replace(/^(\d+)\. (.+)$/, '<li class="ml-5 list-decimal">$2</li>'));
      } else {
        processedLines.push(line);
      }
    }
    
    if (inList) {
      processedLines.push('</ul>');
    }
    
    parsed = processedLines.join('\n');
    
    // Code blocks
    parsed = parsed.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto my-3"><code>$1</code></pre>');
    
    // Inline code
    parsed = parsed.replace(/`(.+?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
    
    // Paragraphs
    parsed = parsed.split('\n\n').map(para => {
      if (para.trim() && !para.includes('<h') && !para.includes('<ul') && !para.includes('<pre')) {
        return `<p class="mb-3">${para}</p>`;
      }
      return para;
    }).join('\n');
    
    // Clean up
    parsed = parsed.replace(/<p class="mb-3"><\/p>/g, '');
    parsed = parsed.replace(/\n/g, ' ');
    
    return parsed;
  };

  return (
    <div className="text-gray-700">
      <div 
        dangerouslySetInnerHTML={{ __html: parseMarkdown(content) }} 
        className="markdown-content leading-relaxed [&>p]:text-sm [&>ul]:text-sm [&>ol]:text-sm [&_li]:text-sm [&>h1]:text-gray-900 [&>h2]:text-gray-900 [&>h3]:text-gray-900"
      />
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter()
  const [siteData, setSiteData] = useState<SiteData | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showApiModal, setShowApiModal] = useState(false)
  const [copiedItem, setCopiedItem] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'curl' | 'javascript' | 'python'>('curl')
  const chatContainerRef = useRef<HTMLDivElement>(null)
  
  // Function to scroll to bottom
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }
  
  // Estimate chunks based on pages crawled
  const totalChunks = Math.round(siteData?.pagesCrawled || 0) * 3 // Estimate 3 chunks per page

  useEffect(() => {
    // First try sessionStorage for current data
    const currentData = sessionStorage.getItem('firestarter_current_data')
    if (currentData) {
      const data = JSON.parse(currentData)
      setSiteData(data)
    } else {
      // No current data, redirect to create new
      router.push('/firestarter')
    }
  }, [router])
  
  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !siteData) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    const currentInput = input
    setInput('')
    setLoading(true)
    
    // Scroll to bottom after adding user message
    setTimeout(scrollToBottom, 100)

    // Don't add placeholder message, we'll add it when we get the first content

    try {
      const response = await fetch('/api/firestarter/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: currentInput,
          namespace: siteData.namespace,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          stream: true
        })
      })

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let streamedContent = ''
      let sources: Array<{ url: string; title: string; snippet: string }> = []
      let assistantMessageAdded = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.type === 'sources') {
                sources = data.sources
              } else if (data.type === 'content') {
                streamedContent += data.content
                
                // Add assistant message on first content chunk
                if (!assistantMessageAdded) {
                  const assistantMessage: Message = {
                    role: 'assistant',
                    content: streamedContent,
                    sources: sources
                  }
                  setMessages(prev => [...prev, assistantMessage])
                  assistantMessageAdded = true
                } else {
                  // Update existing message
                  setMessages(prev => {
                    const newMessages = [...prev]
                    if (newMessages[newMessages.length - 1].role === 'assistant') {
                      newMessages[newMessages.length - 1] = {
                        ...newMessages[newMessages.length - 1],
                        content: streamedContent,
                        sources: sources
                      }
                    }
                    return newMessages
                  })
                }
                
                // Scroll to bottom as content streams in
                scrollToBottom()
              } else if (data.type === 'done') {
                break
              } else if (data.type === 'error') {
                throw new Error(data.error)
              }
            } catch (parseError) {
              console.error('Error parsing stream data:', parseError)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error)
      // Add error message
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        sources: []
      }
      setMessages(prev => [...prev, errorMessage])
      toast.error('Failed to get response')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = () => {
    sessionStorage.removeItem('firestarter_current_data')
    router.push('/firestarter')
  }

  const copyToClipboard = (text: string, itemId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedItem(itemId)
    setTimeout(() => setCopiedItem(null), 2000)
  }

  if (!siteData) {
    return (
      <div className="min-h-screen bg-[#FBFAF9] flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

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
                  <h1 className="text-xl font-semibold text-[#36322F]">{siteData.metadata.title}</h1>
                  <p className="text-sm text-gray-600">{siteData.url}</p>
                </div>
              </div>
            </div>
            
            <Button
              onClick={() => setShowDeleteModal(true)}
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
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
                  <h2 className="text-lg font-semibold text-[#36322F]">{siteData.metadata.title}</h2>
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
                    <span className="text-lg font-semibold text-[#36322F]">{totalChunks}</span>
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
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6">
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
                className={`mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'}`}
              >
                <div
                  className={`inline-block max-w-[80%] px-4 py-3 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {message.role === 'user' ? (
                    <p>{message.content}</p>
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <MarkdownContent content={message.content} />
                    </div>
                  )}
                  
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-300">
                      <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />
                        Sources ({message.sources.length})
                      </p>
                      <div className="space-y-1">
                        {message.sources.slice(0, 3).map((source, idx) => (
                          <a
                            key={idx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block p-2 bg-white/50 rounded hover:bg-white/70 transition-colors group"
                          >
                            <p className="text-xs font-medium text-gray-800 group-hover:text-orange-600 truncate">
                              {source.title}
                            </p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {source.url}
                            </p>
                          </a>
                        ))}
                        {message.sources.length > 3 && (
                          <p className="text-xs text-gray-500 italic">
                            +{message.sources.length - 3} more sources
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              ))}
              
              {loading && (
                <div className="text-left mb-4">
                  <div className="inline-block px-3 py-2 bg-gray-100 rounded-2xl">
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce delay-100" />
                      <div className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce delay-200" />
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
                      disabled={loading}
                    />
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
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
                          <span className="text-xs font-medium text-gray-800">{totalChunks}</span>
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

      {/* Delete Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              Delete Site Index?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the index for {siteData.metadata.title}? 
              This will remove all crawled data and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteModal(false)}
              className="px-6"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              variant="destructive"
              className="px-6"
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