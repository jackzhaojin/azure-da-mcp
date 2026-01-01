/**
 * PHASE 40: StrengthsCard Component
 *
 * Displays positive findings (strengths) with green styling and CheckCircle icons.
 * Provides collapsible accordion for better space management.
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, ChevronDown } from 'lucide-react';
import { Finding } from '@/types/evaluation';

interface StrengthsCardProps {
  strengths: Finding[];
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

/**
 * StrengthsCard - Display positive findings with celebratory green styling
 */
export function StrengthsCard({
  strengths,
  collapsible = true,
  defaultExpanded = true
}: StrengthsCardProps) {
  // Use a stable initial value to avoid re-renders
  const [isExpanded, setIsExpanded] = useState(() => defaultExpanded);

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
          <div className="space-y-4">
            {strengths.map((strength, index) => {
              // Remove ✨ emoji prefix if present in issue text
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
        </CardContent>
      )}
    </Card>
  );
}
