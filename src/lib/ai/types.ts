import { z } from 'zod';

export const generatedCoreValueDraftSchema = z.object({
  name: z.string().trim().min(2).max(120),
  shortDescription: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(2000),
  expectedBehaviors: z.array(z.string().trim().min(2).max(300)).min(1).max(10),
  antiPatterns: z.array(z.string().trim().min(2).max(300)).min(1).max(10),
  example: z.string().trim().min(2).max(1000),
  color: z.string().trim().regex(/^(#[0-9a-fA-F]{6}|blue|emerald|amber|purple|rose|slate)$/),
  iconName: z.string().trim().min(1).max(60).regex(/^[a-z0-9_-]+$/),
}).strict();

export type CoreValueGenerationInput = {
  basicInformation: string;
  organizationName?: string;
  locale?: string;
};
export type ProviderPrompt = { systemPrompt: string; userPrompt: string };

export type GeneratedCoreValueDraft = z.infer<typeof generatedCoreValueDraftSchema>;
export type AiProtocol = 'openai_compatible' | 'gemini' | 'claude';
export type AiProvider = 'openai' | 'openrouter' | 'sumopod' | 'gemini' | 'claude' | 'custom';

export type AiProviderConfig = {
  provider: AiProvider;
  protocol: AiProtocol;
  baseUrl?: string | null;
  model: string;
  apiKey: string;
};

export type OrganizationAiSettings = {
  organizationId: string;
  provider: AiProvider;
  protocol: AiProtocol;
  baseUrl: string | null;
  model: string;
  isEnabled: boolean;
  hasApiKey: boolean;
  maskedApiKey: string | null;
};

export type AiProviderErrorCode = 'unavailable' | 'timeout' | 'invalid_response' | 'rate_limited' | 'configuration';

export class AiProviderError extends Error {
  constructor(public readonly code: AiProviderErrorCode, message: string) {
    super(message);
    this.name = 'AiProviderError';
  }
}
