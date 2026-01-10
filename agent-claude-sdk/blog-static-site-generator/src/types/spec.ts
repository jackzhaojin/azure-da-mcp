/**
 * Static Site Specification
 * Defines the structure of the input spec file (JSON or markdown)
 */

export interface StaticSiteSpec {
  designSystem: {
    path: string;
    format: 'consolidated' | 'tokens';
  };
  content: {
    count: number;
    theme: string;
    topics: string[];
  };
  output: {
    directory: string;
    includeLandingPage: boolean;
    siteTitle?: string;
    siteDescription?: string;
  };
  deployment?: {
    storageAccount: string;
    resourceGroup: string;
    containerName?: string; // Default: '$web'
  };
}

export interface SpecParseInput {
  specPath: string;
}

export interface SpecParseResult {
  success: boolean;
  spec?: StaticSiteSpec;
  error?: string;
}
