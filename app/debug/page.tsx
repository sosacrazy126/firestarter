'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function DebugPage() {
  const [namespace, setNamespace] = useState('firecrawl-dev-1749845075753')
  interface DebugResults {
    [key: string]: unknown
  }
  const [results, setResults] = useState<DebugResults | null>(null)
  const [loading, setLoading] = useState(false)

  const runDebug = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/firestarter/debug?namespace=${namespace}`)
      const data = await response.json()
      setResults(data)
    } catch (error) {
      setResults({ error: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FBFAF9] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Firestarter Debug</h1>
        
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Namespace</label>
              <Input
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                placeholder="Enter namespace to debug"
              />
            </div>
            
            <Button onClick={runDebug} disabled={loading}>
              {loading ? 'Running...' : 'Run Debug'}
            </Button>
          </div>
          
          {results && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold mb-2">Results:</h2>
              <pre className="bg-gray-100 p-4 rounded overflow-auto text-xs">
                {JSON.stringify(results, null, 2)}
              </pre>
            </div>
          )}
        </div>
        
        <div className="mt-6 bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Instructions:</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>First, go to the Indexes page and crawl a website</li>
            <li>Note the namespace that&apos;s returned (it will be shown in the response)</li>
            <li>Enter that namespace above and click &quot;Run Debug&quot;</li>
            <li>This will show you what documents are stored in Upstash</li>
          </ol>
        </div>
      </div>
    </div>
  )
}