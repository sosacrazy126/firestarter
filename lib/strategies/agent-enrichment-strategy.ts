import { SpecializedAgentService } from '../services/specialized-agents';
import { EnrichmentStrategy } from './enrichment-strategy';
import type { EnrichmentField, RowEnrichmentResult, EnrichmentResult } from '../types';
import { parseEmail } from './email-parser';

export class AgentEnrichmentStrategy {
  private agentService: SpecializedAgentService;
  private fallbackStrategy: EnrichmentStrategy;

  constructor(
    openaiApiKey: string,
    firecrawlApiKey: string,
  ) {
    this.agentService = new SpecializedAgentService(openaiApiKey, firecrawlApiKey);
    this.fallbackStrategy = new EnrichmentStrategy({ openaiApiKey, firecrawlApiKey });
  }

  async enrichRow(
    row: Record<string, string>,
    fields: EnrichmentField[],
    emailColumn: string
  ): Promise<RowEnrichmentResult> {
    const email = row[emailColumn];
    
    if (!email) {
      return {
        rowIndex: 0, // Will be set by caller
        originalData: row,
        enrichments: {},
        status: 'error',
        error: 'No email found in specified column',
      };
    }

    try {
      // Parse email for context
      const parsedEmail = parseEmail(email);
      
      // Build context from email and any other row data
      const context: Record<string, string> = {
        email,
      };

      if (parsedEmail) {
        if (parsedEmail.companyName) context.companyName = parsedEmail.companyName;
        if (parsedEmail.firstName) context.firstName = parsedEmail.firstName;
        if (parsedEmail.lastName) context.lastName = parsedEmail.lastName;
        if (parsedEmail.domain) context.domain = parsedEmail.domain;
      }

      // Add any additional context from the row
      Object.entries(row).forEach(([key, value]) => {
        if (key !== emailColumn && value) {
          context[key] = value;
        }
      });

      // Check if we should use specialized agents based on field types
      const shouldUseAgents = this.shouldUseSpecializedAgents(fields);

      if (shouldUseAgents) {
        console.log('🤖 Using specialized agents for enrichment...');
        
        // Use specialized agents
        const agentResults = await this.agentService.enrichWithSpecializedAgents(
          context,
          fields
        );

        // Transform agent results to match expected format
        const enrichments: Record<string, EnrichmentResult> = {};
        const allSources = new Set<string>();

        Object.entries(agentResults).forEach(([fieldName, result]) => {
          enrichments[fieldName] = {
            field: fieldName,
            value: result.value as string | number | boolean | string[],
            confidence: result.confidence,
            sourceContext: result.sources?.map((source: string) => ({
              url: source,
              snippet: ''
            }))
          };
          if (Array.isArray(result.sources)) {
            result.sources.forEach((source: string) => allSources.add(source));
          }
        });

        return {
          rowIndex: 0, // Will be set by caller
          originalData: row,
          enrichments,
          status: 'completed',
        };
      } else {
        // Fall back to traditional enrichment strategy
        console.log('📊 Using traditional enrichment strategy...');
        const enrichments = await this.fallbackStrategy.enrichRow(row, fields);
        return {
          rowIndex: 0, // Will be set by caller
          originalData: row,
          enrichments,
          status: 'completed',
        };
      }
    } catch (error) {
      console.error('Enrichment error:', error);
      return {
        rowIndex: 0, // Will be set by caller
        originalData: row,
        enrichments: {},
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private shouldUseSpecializedAgents(fields: EnrichmentField[]): boolean {
    // Determine if specialized agents would be beneficial
    const specializedFieldPatterns = [
      'company', 'industry', 'employee', 'fund', 'invest', 'valuation',
      'ceo', 'founder', 'executive', 'product', 'service', 'tech',
      'email', 'phone', 'social', 'contact'
    ];

    const fieldNames = fields.map(f => f.name.toLowerCase());
    const fieldDescriptions = fields.map(f => f.description.toLowerCase()).join(' ');
    
    // Use agents if we have fields that match specialized patterns
    return specializedFieldPatterns.some(pattern => 
      fieldNames.some(name => name.includes(pattern)) ||
      fieldDescriptions.includes(pattern)
    );
  }

}