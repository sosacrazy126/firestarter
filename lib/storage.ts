import { Redis } from '@upstash/redis'

export interface IndexMetadata {
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

interface StorageAdapter {
  getIndexes(): Promise<IndexMetadata[]>
  getIndex(namespace: string): Promise<IndexMetadata | null>
  saveIndex(index: IndexMetadata): Promise<void>
  deleteIndex(namespace: string): Promise<void>
}

class LocalStorageAdapter implements StorageAdapter {
  private readonly STORAGE_KEY = 'firestarter_indexes'

  async getIndexes(): Promise<IndexMetadata[]> {
    if (typeof window === 'undefined') return []
    
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('Error reading from localStorage:', error)
      return []
    }
  }

  async getIndex(namespace: string): Promise<IndexMetadata | null> {
    const indexes = await this.getIndexes()
    return indexes.find(i => i.namespace === namespace) || null
  }

  async saveIndex(index: IndexMetadata): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('localStorage is not available on the server')
    }
    
    const indexes = await this.getIndexes()
    const existingIndex = indexes.findIndex(i => i.namespace === index.namespace)
    
    if (existingIndex !== -1) {
      indexes[existingIndex] = index
    } else {
      indexes.unshift(index)
    }
    
    // Keep only the last 50 indexes
    const limitedIndexes = indexes.slice(0, 50)
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(limitedIndexes))
    } catch (error) {
      console.error('Error saving to localStorage:', error)
      throw error
    }
  }

  async deleteIndex(namespace: string): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('localStorage is not available on the server')
    }
    
    const indexes = await this.getIndexes()
    const filteredIndexes = indexes.filter(i => i.namespace !== namespace)
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredIndexes))
    } catch (error) {
      console.error('Error deleting from localStorage:', error)
      throw error
    }
  }
}

class RedisStorageAdapter implements StorageAdapter {
  private redis: Redis
  private readonly INDEXES_KEY = 'firestarter:indexes'
  private readonly INDEX_KEY_PREFIX = 'firestarter:index:'

  constructor() {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Redis configuration missing')
    }
    
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }

  async getIndexes(): Promise<IndexMetadata[]> {
    try {
      const indexes = await this.redis.get<IndexMetadata[]>(this.INDEXES_KEY)
      return indexes || []
    } catch (error) {
      console.error('Error fetching indexes from Redis:', error)
      return []
    }
  }

  async getIndex(namespace: string): Promise<IndexMetadata | null> {
    try {
      const index = await this.redis.get<IndexMetadata>(`${this.INDEX_KEY_PREFIX}${namespace}`)
      return index
    } catch (error) {
      console.error('Error fetching index from Redis:', error)
      return null
    }
  }

  async saveIndex(index: IndexMetadata): Promise<void> {
    try {
      // Save individual index
      await this.redis.set(`${this.INDEX_KEY_PREFIX}${index.namespace}`, index)
      
      // Update indexes list
      const indexes = await this.getIndexes()
      const existingIndex = indexes.findIndex(i => i.namespace === index.namespace)
      
      if (existingIndex !== -1) {
        indexes[existingIndex] = index
      } else {
        indexes.unshift(index)
      }
      
      // Keep only the last 50 indexes
      const limitedIndexes = indexes.slice(0, 50)
      await this.redis.set(this.INDEXES_KEY, limitedIndexes)
    } catch (error) {
      console.error('Error saving index to Redis:', error)
      throw error
    }
  }

  async deleteIndex(namespace: string): Promise<void> {
    try {
      // Delete individual index
      await this.redis.del(`${this.INDEX_KEY_PREFIX}${namespace}`)
      
      // Update indexes list
      const indexes = await this.getIndexes()
      const filteredIndexes = indexes.filter(i => i.namespace !== namespace)
      await this.redis.set(this.INDEXES_KEY, filteredIndexes)
    } catch (error) {
      console.error('Error deleting index from Redis:', error)
      throw error
    }
  }
}

// Factory function to get the appropriate storage adapter
function getStorageAdapter(): StorageAdapter {
  // Use Redis if both environment variables are set
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new RedisStorageAdapter()
  }
  
  // Check if we're on the server
  if (typeof window === 'undefined') {
    throw new Error('No storage adapter available on the server. Please configure Redis by setting UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.')
  }
  
  // Otherwise, use localStorage (only on client)
  return new LocalStorageAdapter()
}

// Lazy initialization to avoid errors at module load time
let storage: StorageAdapter | null = null

function getStorage(): StorageAdapter | null {
  if (!storage) {
    try {
      storage = getStorageAdapter()
    } catch {
      // This is expected on the server without Redis configured
      return null
    }
  }
  return storage
}

export const getIndexes = async (): Promise<IndexMetadata[]> => {
  const adapter = getStorage()
  if (!adapter) {
    console.warn('No storage adapter available')
    return []
  }
  
  try {
    return await adapter.getIndexes()
  } catch (error) {
    console.error('Storage adapter error:', error)
    return []
  }
}

export const getIndex = async (namespace: string): Promise<IndexMetadata | null> => {
  const adapter = getStorage()
  if (!adapter) {
    console.warn('No storage adapter available')
    return null
  }
  
  try {
    return await adapter.getIndex(namespace)
  } catch (error) {
    console.error('Storage adapter error:', error)
    return null
  }
}

export const saveIndex = async (index: IndexMetadata): Promise<void> => {
  const adapter = getStorage()
  if (!adapter) {
    console.warn('No storage adapter available - index not saved')
    return
  }
  
  try {
    return await adapter.saveIndex(index)
  } catch (error) {
    console.error('Storage adapter error:', error)
    // Don't throw - this allows the app to continue functioning
  }
}

export const deleteIndex = async (namespace: string): Promise<void> => {
  const adapter = getStorage()
  if (!adapter) {
    console.warn('No storage adapter available - index not deleted')
    return
  }
  
  try {
    return await adapter.deleteIndex(namespace)
  } catch (error) {
    console.error('Storage adapter error:', error)
    // Don't throw - this allows the app to continue functioning
  }
}