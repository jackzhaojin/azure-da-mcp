/**
 * API Client for E2E Tests
 * Makes real HTTP calls to Next.js API routes
 */

import { request, APIRequestContext } from '@playwright/test';

export interface EvaluationRequest {
  migratedUrl: string;
  sourceUrl?: string;
  pdfUrl?: string;
  mode?: 'deterministic' | 'agentic' | 'full';
}

export interface EvaluationResponse {
  mode?: string;
  finalScore?: number;
  score?: number; // Accessibility API uses score directly
  deterministic?: {
    score: number;
    [key: string]: unknown;
  };
  agentic?: {
    score: number;
    findings?: Array<{
      severity: string;
      issue: string;
      recommendation: string;
      dimension?: string;
      details?: Record<string, unknown>;
    }>;
    strengths?: string[];
  };
  error?: string;
  duration?: number;
  [key: string]: unknown; // Allow other agent-specific fields
}

export class EvalAPIClient {
  private context: APIRequestContext;
  private baseUrl: string;

  constructor(context: APIRequestContext, baseUrl: string = 'http://localhost:3000') {
    this.context = context;
    this.baseUrl = baseUrl;
  }

  static async create(baseUrl?: string): Promise<EvalAPIClient> {
    const context = await request.newContext({
      baseURL: baseUrl || 'http://localhost:3000',
    });
    return new EvalAPIClient(context, baseUrl);
  }

  async evaluateStructure(req: EvaluationRequest): Promise<EvaluationResponse> {
    return this.callAgent('structure', req);
  }

  async evaluateAccessibility(req: EvaluationRequest): Promise<EvaluationResponse> {
    return this.callAgent('accessibility', req);
  }

  async evaluateContent(req: EvaluationRequest): Promise<EvaluationResponse> {
    return this.callAgent('content', req);
  }

  async evaluateVisual(req: EvaluationRequest): Promise<EvaluationResponse> {
    return this.callAgent('visual', req);
  }

  private async callAgent(agent: string, req: EvaluationRequest): Promise<EvaluationResponse> {
    const startTime = Date.now();

    const response = await this.context.post(`/api/evaluate/${agent}`, {
      data: req,
      timeout: 180000, // 3 minutes
    });

    const duration = Date.now() - startTime;
    const json = await response.json();

    return {
      ...json,
      duration,
    };
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }
}
