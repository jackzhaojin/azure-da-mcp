/**
 * PHASE 40: StrengthsCard Component
 *
 * Displays positive findings (strengths) with green styling and CheckCircle icons.
 * Supports both flat list and grouped-by-dimension layouts.
 */

'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, ChevronDown } from 'lucide-react';
import { Finding, Dimension } from '@/types/evaluation';

interface StrengthsCardProps {
  strengths: Finding[];
  collapsible?: boolean;
  defaultExpanded?: boolean;
  groupByDimension?: boolean; // New prop for grouped layout
}

/**
 * Get dimension label with proper capitalization
 */
function getDimensionLabel(dimension: Dimension): string {
  return dimension.charAt(0).toUpperCase() + dimension.slice(1);
}

/**
 * StrengthsCard - Display positive findings with celebratory green styling
 */
export function StrengthsCard({
  strengths,
  collapsible = true,
  defaultExpanded = true,
  groupByDimension = false
}: StrengthsCardProps) {
  // Use a stable initial value to avoid re-renders
  const [isExpanded, setIsExpanded] = useState(() => defaultExpanded);

  // Group strengths by dimension if requested
  const groupedStrengths = useMemo(() => {
    if (!groupByDimension) return null;

    const groups: Record<Dimension, Finding[]> = {
      structure: [],
      accessibility: [],
      content: [],
      visual: []
    };

    strengths.forEach(strength => {
      if (strength.dimension && groups[strength.dimension]) {
        groups[strength.dimension].push(strength);
      }
    });

    return groups;
  }, [strengths, groupByDimension]);

  if (strengths.length === 0) {
    return null;
  }

  return (
    <Card className="border-l-4 border-green-500">
      <CardHeader
        className={`bg-green-50 ${collapsible ? 'cursor-pointer hover:bg-green-100 transition-colors' : ''}`}
        onClick={() => collapsible && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-green-900 flex items-center gap-2">
            <span>✨</span>
            <span>{strengths.length} Strength{strengths.length > 1 ? 's' : ''} Found</span>
          </CardTitle>
          {collapsible && (
            <ChevronDown
              className={`h-5 w-5 text-green-700 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-4">
          {groupByDimension && groupedStrengths ? (
            // Grouped layout: 2x2 grid by dimension
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(['structure', 'accessibility', 'content', 'visual'] as Dimension[]).map(dimension => {
                const dimensionStrengths = groupedStrengths[dimension];
                if (dimensionStrengths.length === 0) return null;

                return (
                  <div key={dimension}>
                    <h4 className="font-semibold text-sm mb-3 text-green-800">
                      {getDimensionLabel(dimension)} ({dimensionStrengths.length})
                    </h4>
                    <div className="space-y-3">
                      {dimensionStrengths.map((strength, index) => {
                        const issueText = strength.issue.replace(/^✨\s*/, '');
                        return (
                          <div key={`${dimension}-${index}`} className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 space-y-1">
                              <p className="text-sm font-medium text-gray-900">{issueText}</p>
                              <p className="text-xs text-green-700/70">{strength.recommendation}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Flat layout: Simple list
            <div className="space-y-4">
              {strengths.map((strength, index) => {
                const issueText = strength.issue.replace(/^✨\s*/, '');
                return (
                  <div key={index} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium text-gray-900">{issueText}</p>
                      <p className="text-sm text-green-700/70">{strength.recommendation}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
