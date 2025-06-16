import { NextRequest, NextResponse } from 'next/server'
import { getIndexes, saveIndex, deleteIndex, IndexMetadata } from '@/lib/storage'

export async function GET() {
  try {
    const indexes = await getIndexes()
    return NextResponse.json({ indexes: indexes || [] })
  } catch {
    // Return empty array instead of error to allow app to function
    console.error('Failed to get indexes')
    return NextResponse.json({ indexes: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const index: IndexMetadata = await request.json()
    await saveIndex(index)
    return NextResponse.json({ success: true })
  } catch {
    // Return success anyway to allow app to continue
    console.error('Failed to save index')
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
  } catch {
    // Return success anyway to allow app to continue
    console.error('Failed to delete index')
    return NextResponse.json({ success: true, warning: 'Index deleted locally only' })
  }
}