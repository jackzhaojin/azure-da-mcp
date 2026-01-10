/**
 * Design System Types
 * Defines the structure of parsed design system data
 */

export interface DesignSystem {
  tokens: {
    colors: Record<string, string>;
    typography: Record<string, string>;
    spacing: Record<string, string>;
    breakpoints?: Record<string, string>;
    shadows?: Record<string, string>;
    [key: string]: Record<string, string> | undefined;
  };
  blocks: Record<string, BlockDefinition>;
  foundations: string; // FOUNDATIONS.md content or extracted foundations text
}

export interface BlockDefinition {
  type: string;
  description?: string;
  variants?: string[];
  properties?: Record<string, any>;
  examples?: string[];
}

export interface ParseDesignSystemInput {
  path: string;
  format: 'consolidated' | 'tokens';
}

export interface ParseDesignSystemResult {
  success: boolean;
  designSystem?: DesignSystem;
  error?: string;
}
