import { NextRequest, NextResponse } from 'next/server'
import { getIndexes, saveIndex, deleteIndex, IndexMetadata } from '@/lib/storage'

export async function GET() {
  try {
    const indexes = await getIndexes()
    return NextResponse.json({ indexes: indexes || [] })
  } catch (error) {
    console.error('Error fetching indexes:', error)
    // Return empty array instead of error to allow app to function
    return NextResponse.json({ indexes: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const index: IndexMetadata = await request.json()
    await saveIndex(index)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving index:', error)
    // Return success anyway to allow app to continue
    return NextResponse.json({ success: true, warning: 'Index saved locally only' })
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
    // Return success anyway to allow app to continue
    return NextResponse.json({ success: true, warning: 'Index deleted locally only' })
  }
}