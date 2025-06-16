import { useState, useEffect } from 'react'
import { IndexMetadata } from '@/lib/storage'

// Check if we should use Redis (server-side storage)
const useRedis = !!(process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL && process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN)

export function useStorage() {
  const [indexes, setIndexes] = useState<IndexMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchIndexes = async () => {
    setLoading(true)
    setError(null)
    
    try {
      if (useRedis) {
        // Fetch from API endpoint
        const response = await fetch('/api/indexes')
        if (!response.ok) {
          throw new Error('Failed to fetch indexes')
        }
        const data = await response.json()
        setIndexes(data.indexes || [])
      } else {
        // Use localStorage
        const stored = localStorage.getItem('firestarter_indexes')
        setIndexes(stored ? JSON.parse(stored) : [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch indexes')
      setIndexes([])
    } finally {
      setLoading(false)
    }
  }

  const saveIndex = async (index: IndexMetadata) => {
    try {
      if (useRedis) {
        // Save via API endpoint
        const response = await fetch('/api/indexes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(index)
        })
        if (!response.ok) {
          throw new Error('Failed to save index')
        }
        // Refresh indexes
        await fetchIndexes()
      } else {
        // Save to localStorage
        const currentIndexes = [...indexes]
        const existingIndex = currentIndexes.findIndex(i => i.namespace === index.namespace)
        
        if (existingIndex !== -1) {
          currentIndexes[existingIndex] = index
        } else {
          currentIndexes.unshift(index)
        }
        
        // Keep only the last 50 indexes
        const limitedIndexes = currentIndexes.slice(0, 50)
        localStorage.setItem('firestarter_indexes', JSON.stringify(limitedIndexes))
        setIndexes(limitedIndexes)
      }
    } catch (err) {
      throw err
    }
  }

  const deleteIndex = async (namespace: string) => {
    try {
      if (useRedis) {
        // Delete via API endpoint
        const response = await fetch(`/api/indexes?namespace=${namespace}`, {
          method: 'DELETE'
        })
        if (!response.ok) {
          throw new Error('Failed to delete index')
        }
        // Refresh indexes
        await fetchIndexes()
      } else {
        // Delete from localStorage
        const filteredIndexes = indexes.filter(i => i.namespace !== namespace)
        localStorage.setItem('firestarter_indexes', JSON.stringify(filteredIndexes))
        setIndexes(filteredIndexes)
      }
    } catch (err) {
      throw err
    }
  }

  useEffect(() => {
    fetchIndexes()
  }, [])

  return {
    indexes,
    loading,
    error,
    saveIndex,
    deleteIndex,
    refresh: fetchIndexes,
    isUsingRedis: useRedis
  }
}