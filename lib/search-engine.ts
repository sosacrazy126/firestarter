/* eslint-disable @typescript-eslint/no-explicit-any */
import { FirecrawlClient } from './firecrawl';
import { generateText, streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ContextProcessor } from './context-processor';

export type SearchPhase = 
  | 'understanding'
  | 'planning' 
  | 'searching'
  | 'analyzing'
  | 'synthesizing'
  | 'complete';

export type SearchEvent = 
  | { type: 'phase-update'; phase: SearchPhase; message: string }
  | { type: 'thinking'; message: string }
  | { type: 'searching'; query: string; index: number; total: number }
  | { type: 'found'; sources: Source[]; query: string }
  | { type: 'scraping'; url: string; index: number; total: number; query: string }
  | { type: 'content-chunk'; chunk: string }
  | { type: 'final-result'; content: string; sources: Source[]; followUpQuestions?: string[] }
  | { type: 'error'; error: string };

export interface Source {
  url: string;
  title: string;
  content?: string;
  quality?: number;
}

export interface SearchStep {
  id: SearchPhase | string;
  label: string;
  status: 'pending' | 'active' | 'completed';
  startTime?: number;
}

export class SearchEngine {
  private contextProcessor: ContextProcessor;
  
  constructor(private firecrawl: FirecrawlClient) {
    this.contextProcessor = new ContextProcessor();
  }

  getInitialSteps(): SearchStep[] {
    return [
      { id: 'understanding', label: 'Understanding request', status: 'pending' },
      { id: 'planning', label: 'Planning search', status: 'pending' },
      { id: 'searching', label: 'Searching sources', status: 'pending' },
      { id: 'analyzing', label: 'Analyzing content', status: 'pending' },
      { id: 'synthesizing', label: 'Synthesizing answer', status: 'pending' },
      { id: 'complete', label: 'Complete', status: 'pending' }
    ];
  }

  async search(
    query: string, 
    onEvent: (event: SearchEvent) => void,
    context?: { query: string; response: string }[]
  ): Promise<void> {
    try {
      // Phase 1: Understanding
      onEvent({ 
        type: 'phase-update', 
        phase: 'understanding',
        message: 'Analyzing your request...'
      });
      
      // Generate understanding of the query with context
      let understanding: string;
      try {
        understanding = await this.analyzeQuery(query, context);
      } catch (error) {
        onEvent({ 
          type: 'error', 
          error: error instanceof Error ? error.message : 'Failed to analyze query'
        });
        throw error;
      }
      
      onEvent({ 
        type: 'thinking', 
        message: understanding
      });

      // Phase 2: Planning
      onEvent({ 
        type: 'phase-update', 
        phase: 'planning',
        message: 'Planning search strategy...'
      });
      
      const searchQueries = await this.generateSearchQueries(query, context);
      
      onEvent({ 
        type: 'thinking', 
        message: searchQueries.length > 3 
          ? `I detected ${searchQueries.length} different questions/topics. I'll search for each one separately.`
          : `I'll search for ${searchQueries.length} different aspects of your question`
      });

      // Phase 3: Searching
      onEvent({ 
        type: 'phase-update', 
        phase: 'searching',
        message: 'Searching the web...'
      });
      
      const allSources: Source[] = [];
      
      for (let i = 0; i < searchQueries.length; i++) {
        const searchQuery = searchQueries[i];
        
        onEvent({ 
          type: 'searching', 
          query: searchQuery,
          index: i + 1,
          total: searchQueries.length
        });
        
        const results = await this.firecrawl.search(searchQuery, {
          limit: 5,
          scrapeOptions: {
            formats: ['markdown']
          }
        });
        
        const sources = results.data.map((r: any) => ({
          url: r.url,
          title: r.title,
          content: r.markdown || r.content || '',
          quality: 0
        }));
        
        onEvent({ 
          type: 'found', 
          sources,
          query: searchQuery
        });
        
        // Process sources - check if content already exists from search
        const topSources = sources.slice(0, 3);
        
        for (let j = 0; j < topSources.length; j++) {
          const source = topSources[j];
          
          // If we already have content from search, use it
          if (source.content && source.content.length > 100) {
            source.quality = this.scoreContent(source.content, query);
            allSources.push(source);
            onEvent({ 
              type: 'scraping', 
              url: source.url,
              index: j + 1,
              total: topSources.length,
              query: searchQuery
            });
            
            // Generate a brief summary of what was found
            const summary = await this.summarizeContent(source.content, searchQuery);
            if (summary) {
              onEvent({ 
                type: 'thinking', 
                message: summary
              });
            }
          } else {
            // Otherwise try to scrape
            onEvent({ 
              type: 'scraping', 
              url: source.url,
              index: j + 1,
              total: topSources.length,
              query: searchQuery
            });
            
            try {
              const scraped = await this.firecrawl.scrapeUrl(source.url, 15000);
              if (scraped.success && scraped.markdown) {
                source.content = scraped.markdown;
                source.quality = this.scoreContent(scraped.markdown, query);
                allSources.push(source);
                
                // Generate a brief summary of what was found
                const summary = await this.summarizeContent(scraped.markdown, searchQuery);
                if (summary) {
                  onEvent({ 
                    type: 'thinking', 
                    message: summary
                  });
                }
              } else if (scraped.error === 'timeout') {
                // Handle timeout specifically
                console.warn(`Scraping ${source.url} timed out after 15 seconds`);
                onEvent({ 
                  type: 'thinking', 
                  message: `${new URL(source.url).hostname} is taking too long to respond, moving on...`
                });
              }
            } catch (error) {
              // Log error but continue with other sources
              console.warn(`Failed to scrape ${source.url}:`, error);
              onEvent({ 
                type: 'thinking', 
                message: `Couldn't access ${new URL(source.url).hostname}, trying other sources...`
              });
            }
          }
          
          await this.simulateWork(300);
        }
      }

      // Phase 4: Analyzing
      onEvent({ 
        type: 'phase-update', 
        phase: 'analyzing',
        message: 'Analyzing gathered information...'
      });
      
      await this.simulateWork(1500);
      
      onEvent({ 
        type: 'thinking', 
        message: `Found ${allSources.length} relevant sources with quality information`
      });

      // Phase 5: Synthesizing
      onEvent({ 
        type: 'phase-update', 
        phase: 'synthesizing',
        message: 'Creating comprehensive answer...'
      });
      
      // Process sources with context processor
      onEvent({ 
        type: 'thinking', 
        message: `Processing ${allSources.length} sources with AI summarization for optimal relevance...`
      });
      
      const processedSources = await this.contextProcessor.processSources(
        query,
        allSources,
        searchQueries
      );
      
      // Stream the answer
      const answer = await this.generateStreamingAnswer(
        query, 
        processedSources,
        (chunk) => onEvent({ type: 'content-chunk', chunk }),
        context
      );

      // Generate follow-up questions
      const followUpQuestions = await this.generateFollowUpQuestions(query, answer, processedSources, context);

      // Phase 6: Complete
      onEvent({ 
        type: 'phase-update', 
        phase: 'complete',
        message: 'Search complete!'
      });
      
      onEvent({ 
        type: 'final-result', 
        content: answer,
        sources: allSources.filter(s => s.content),
        followUpQuestions
      });
      
    } catch (error) {
      onEvent({ 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Search failed' 
      });
    }
  }

  private async simulateWork(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private async analyzeQuery(query: string, context?: { query: string; response: string }[]): Promise<string> {
    try {
      let contextPrompt = '';
      if (context && context.length > 0) {
        contextPrompt = '\n\nPrevious conversation:\n';
        context.forEach(c => {
          // Limit context response to avoid token issues
          const limitedResponse = c.response.length > 1000 
            ? c.response.slice(0, 1000) + '...' 
            : c.response;
          contextPrompt += `User: ${c.query}\nAssistant: ${limitedResponse}\n\n`;
        });
      }
      
      const result = await generateText({
        model: openai('gpt-4o'),
        prompt: `Analyze this search query and explain what you understand the user is looking for: "${query}"
${contextPrompt}
Instructions:
- Start with a clear, concise title in quotes (e.g., "Researching egg shortage" or "Understanding climate change impacts")
- Then explain in 1-2 sentences what aspects of the topic the user wants to know about
- If this relates to previous questions, acknowledge that connection
- Finally, mention that you'll search for the latest information to help answer their question
- DO NOT use any markdown formatting, code blocks, or special characters

Keep it natural and conversational, showing you truly understand their request.`,
      });
      
      return result.text.trim();
    } catch (error) {
      console.error('Error analyzing query:', error);
      // Check if it's an API key error
      if (error instanceof Error && error.message.includes('API key')) {
        throw new Error('OpenAI API key is required. Please set OPENAI_API_KEY in your environment variables.');
      }
      throw error;
    }
  }

  private async generateSearchQueries(query: string, context?: { query: string; response: string }[]): Promise<string[]> {
    let contextPrompt = '';
    if (context && context.length > 0) {
      contextPrompt = '\n\nPrevious conversation context:\n';
      context.forEach(c => {
        // Limit context response to avoid token issues
        const limitedResponse = c.response.length > 500 
          ? c.response.slice(0, 500) + '...' 
          : c.response;
        contextPrompt += `User: ${c.query}\nAssistant discussed: ${limitedResponse}\n\n`;
      });
      contextPrompt += '\nIf the current query refers to items from the previous conversation (like "Which phone" when phones were discussed), make sure to include those specific items in your search queries.\n';
    }
    
    const result = await generateText({
      model: openai('gpt-4o'),
      prompt: `Analyze this query and generate appropriate search queries: "${query}"
${contextPrompt}
Instructions:
- For simple queries (e.g., "What is X?") → use just 1 search
- For queries with multiple distinct questions → create a separate search for EACH question
- For lists or multiple items → create individual searches for each item
- Don't artificially group unrelated topics together
- Each search should be focused and specific
- If the query refers to previous context (like "which one" or "the best of those"), include the specific items from context

Examples:
- "What is firecrawl?" → 1 search: "firecrawl overview features documentation"
- "What is X? How does Y work? Where to buy Z?" → 3 separate searches
- "Tell me about A, B, C, D, and E" → 5 separate searches (one for each)
- "Compare React vs Vue vs Angular" → 3 searches (one for each framework)
- "What are the top 10 programming languages?" → 1 search (single topic)

Important: If the user asks about multiple distinct things, create separate searches. Don't force them into fewer searches.

Return ONLY the search queries, one per line. Do not include any markdown, code blocks, backticks, bullet points, or explanations - just the plain text search queries.`,
    });
    
    const queries = result.text
      .split('\n')
      .map(q => q.trim())
      .map(q => q.replace(/^["']|["']$/g, '')) // Remove surrounding quotes
      .filter(q => q.length > 0)
      .filter(q => !q.match(/^```/)) // Filter out markdown code blocks
      .filter(q => !q.match(/^[-*#]/)) // Filter out markdown lists/headers
      .filter(q => q.length > 3); // Filter out very short strings
    
    // Allow up to 12 searches for complex queries
    return queries.slice(0, 12);
  }

  private scoreContent(content: string, query: string): number {
    const queryWords = query.toLowerCase().split(' ');
    const contentLower = content.toLowerCase();
    
    let score = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) score += 0.2;
    }
    
    return Math.min(score, 1);
  }

  private async summarizeContent(content: string, query: string): Promise<string> {
    try {
      // Limit content for summarization to avoid token limits
      const maxContentLength = 8000;
      const truncatedContent = content.length > maxContentLength 
        ? content.slice(0, maxContentLength) + '...' 
        : content;
      
      const result = await generateText({
        model: openai('gpt-4o'),
        prompt: `Extract one key finding from this content that's relevant to the search query: "${query}"

Content: ${truncatedContent}

Instructions:
- Return just ONE sentence summarizing the most important finding
- Make it specific and factual (include numbers, dates, or specific details if relevant)
- Keep it under 100 characters
- Don't include any prefixes like "The article states" or "According to"`,
      });
      
      return result.text.trim();
    } catch (error) {
      console.warn('Failed to summarize content:', error);
      return '';
    }
  }

  private async generateStreamingAnswer(
    query: string, 
    sources: Source[],
    onChunk: (chunk: string) => void,
    context?: { query: string; response: string }[]
  ): Promise<string> {
    // Sources are already processed by ContextProcessor
    const sourcesText = sources
      .map((s, i) => {
        if (!s.content) return `[${i + 1}] ${s.title}\n[No content available]`;
        return `[${i + 1}] ${s.title}\n${s.content}`;
      })
      .join('\n\n');
    
    let contextPrompt = '';
    if (context && context.length > 0) {
      contextPrompt = '\n\nPrevious conversation for context:\n';
      context.forEach(c => {
        // Limit context response to avoid token issues
        const limitedResponse = c.response.length > 1000 
          ? c.response.slice(0, 1000) + '...' 
          : c.response;
        contextPrompt += `User: ${c.query}\nAssistant: ${limitedResponse}\n\n`;
      });
    }
    
    try {
      const { textStream } = await streamText({
        model: openai('gpt-4o'),
        prompt: `Answer this question: "${query}"
${contextPrompt}
Based on these sources:
${sourcesText}

Provide a clear, comprehensive answer with citations [1], [2], etc. Use markdown formatting for better readability. If this question relates to previous topics discussed, make connections where relevant.`,
      });
    
      let fullText = '';
      
      for await (const chunk of textStream) {
        fullText += chunk;
        onChunk(chunk);
      }
      
      return fullText;
    } catch (error) {
      console.error('Error generating streaming answer:', error);
      
      // Provide a fallback response with the error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const fallbackResponse = `I encountered an error while processing your request. The sources were found successfully, but there was an issue generating the response.

Error: ${errorMessage}

Here are the sources that were found:
${sources.map((s, i) => `[${i + 1}] ${s.title} - ${s.url}`).join('\n')}`;
      
      // Stream the error message
      for (const char of fallbackResponse) {
        onChunk(char);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      return fallbackResponse;
    }
  }

  private async generateFollowUpQuestions(
    originalQuery: string,
    answer: string,
    sources: Source[],
    context?: { query: string; response: string }[]
  ): Promise<string[]> {
    try {
      let contextPrompt = '';
      if (context && context.length > 0) {
        contextPrompt = '\n\nPrevious conversation topics:\n';
        context.forEach(c => {
          contextPrompt += `- ${c.query}\n`;
        });
        contextPrompt += '\nConsider the full conversation flow when generating follow-ups.\n';
      }
      
      const result = await generateText({
        model: openai('gpt-4o'),
        prompt: `Based on this search query and answer, generate 3 relevant follow-up questions that the user might want to explore next.

Original query: "${originalQuery}"

Answer summary: ${answer.length > 1000 ? answer.slice(0, 1000) + '...' : answer}
${contextPrompt}
Instructions:
- Generate exactly 3 follow-up questions
- Each question should explore a different aspect or dig deeper into the topic
- Questions should be natural and conversational
- They should build upon the information provided in the answer
- Make them specific and actionable
- Keep each question under 80 characters
- Return only the questions, one per line, no numbering or bullets
- Consider the entire conversation context when generating questions

Examples of good follow-up questions:
- "How does this compare to [alternative]?"
- "What are the latest developments in [specific aspect]?"
- "Can you explain [technical term] in more detail?"
- "What are the practical applications of this?"
- "How has this changed over the past year?"`,
      });
      
      const questions = result.text
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0 && q.length < 80)
        .slice(0, 3);
      
      return questions.length > 0 ? questions : [];
    } catch (error) {
      console.warn('Failed to generate follow-up questions:', error);
      return [];
    }
  }
}