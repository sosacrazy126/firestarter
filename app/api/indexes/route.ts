import { NextRequest, NextResponse } from 'next/server'
import { getIndexes, saveIndex, deleteIndex, IndexMetadata } from '@/lib/storage'

export async function GET() {
  try {
    const indexes = await getIndexes()
    return NextResponse.json({ indexes })
  } catch (error) {
    console.error('Error fetching indexes:', error)
    return NextResponse.json({ error: 'Failed to fetch indexes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const index: IndexMetadata = await request.json()
    await saveIndex(index)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving index:', error)
    return NextResponse.json({ error: 'Failed to save index' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const namespace = searchParams.get('namespace')
    
    if (!namespace) {
      return NextResponse.json({ error: 'Namespace is required' }, { status: 400 })
    }
    
    await deleteIndex(namespace)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting index:', error)
    return NextResponse.json({ error: 'Failed to delete index' }, { status: 500 })
  }
}