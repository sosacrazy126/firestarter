# Testing Sources in Firestarter

## Current Implementation

The sources from RAG results are now included in the streaming response using Vercel AI SDK:

1. **API Route** (`/api/firestarter/query/route.ts`):
   - Sources are prepared from the search results
   - When streaming is enabled, sources are included via `toDataStreamResponse({ data: { sources } })`
   - Each source includes: url, title, and snippet

2. **Dashboard** (`/app/dashboard/page.tsx`):
   - Parses the streaming response for sources data
   - Updates messages with sources when found
   - Displays sources below each assistant message

3. **Source Display**:
   - Shows as "References:" section below the answer
   - Each source shows:
     - Citation number [1], [2], etc.
     - Title (truncated to 60 chars)
     - Snippet (truncated to 100 chars)
     - URL
     - Clickable link with external icon

## Testing Steps

1. Start the dev server: `npm run dev`
2. Create a new chatbot by entering a URL
3. After crawling completes, ask a question
4. Verify that sources appear below the answer
5. Click on sources to verify they open in new tabs

## Expected Behavior

When you ask a question, the response should:
1. Stream the answer text
2. Include relevant sources at the bottom
3. Sources should be clickable and open in new tabs
4. Each source should show a preview snippet