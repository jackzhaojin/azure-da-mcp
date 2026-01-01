'use client';

import { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Radar, Bar } from 'react-chartjs-2';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EvaluationReport, Severity } from '@/types/evaluation';
import { StrengthsCard } from '@/components/StrengthsCard';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  RadialLinearScale,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ResultsViewProps {
  report: EvaluationReport;
}

/**
 * Severity badge component with consistent styling
 */
function SeverityBadge({ severity }: { severity: Severity }) {
  const variants: Record<Severity, { className: string; label: string }> = {
    critical: { className: 'bg-red-100 text-red-800 border-red-200', label: 'CRITICAL' },
    serious: { className: 'bg-orange-100 text-orange-800 border-orange-200', label: 'SERIOUS' },
    moderate: { className: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'MODERATE' },
    minor: { className: 'bg-blue-100 text-blue-800 border-blue-200', label: 'MINOR' },
    info: { className: 'bg-green-100 text-green-800 border-green-200', label: 'STRENGTH' },
  };

  const variant = variants[severity];

  return (
    <Badge variant="outline" className={variant.className}>
      {variant.label}
    </Badge>
  );
}

/**
 * Grade badge component
 */
function GradeBadge({ grade }: { grade: string }) {
  const variants: Record<string, string> = {
    excellent: 'bg-green-100 text-green-800 border-green-200',
    good: 'bg-blue-100 text-blue-800 border-blue-200',
    acceptable: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'needs-improvement': 'bg-orange-100 text-orange-800 border-orange-200',
    critical: 'bg-red-100 text-red-800 border-red-200',
  };

  return (
    <Badge variant="outline" className={variants[grade] || variants.critical}>
      {grade.toUpperCase().replace('-', ' ')}
    </Badge>
  );
}

/**
 * Enhanced ResultsView component with visualizations
 */
export function ResultsView({ report }: ResultsViewProps) {
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');

  /**
   * Radar chart data for 4 dimensions
   */
  const radarChartData = useMemo(() => {
    return {
      labels: ['Structure', 'Accessibility', 'Content Fidelity', 'Visual Correctness'],
      datasets: [
        {
          label: 'Scores',
          data: [
            report.results.structure?.score || 0,
            report.results.accessibility?.score || 0,
            report.results.content?.score || 0,
            report.results.visual?.score || 0,
          ],
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 2,
          pointBackgroundColor: 'rgba(59, 130, 246, 1)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgba(59, 130, 246, 1)',
        },
      ],
    };
  }, [report]);

  /**
   * Bar chart data for severity distribution (issues only, excludes strengths)
   */
  const severityChartData = useMemo(() => {
    const severityCounts: Record<Severity, number> = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
      info: 0,
    };

    // Only count non-info findings (issues)
    report.findings.filter(f => f.severity !== 'info').forEach((finding) => {
      severityCounts[finding.severity]++;
    });

    return {
      labels: ['Critical', 'Serious', 'Moderate', 'Minor'],
      datasets: [
        {
          label: 'Issues Count',
          data: [
            severityCounts.critical,
            severityCounts.serious,
            severityCounts.moderate,
            severityCounts.minor,
          ],
          backgroundColor: [
            'rgba(239, 68, 68, 0.8)', // red-500
            'rgba(249, 115, 22, 0.8)', // orange-500
            'rgba(234, 179, 8, 0.8)', // yellow-500
            'rgba(59, 130, 246, 0.8)', // blue-500
          ],
          borderColor: [
            'rgba(239, 68, 68, 1)',
            'rgba(249, 115, 22, 1)',
            'rgba(234, 179, 8, 1)',
            'rgba(59, 130, 246, 1)',
          ],
          borderWidth: 1,
        },
      ],
    };
  }, [report]);

  /**
   * Split findings into issues and strengths
   */
  const issues = useMemo(() => {
    return report.findings.filter((f) => f.severity !== 'info');
  }, [report.findings]);

  const strengths = useMemo(() => {
    return report.findings.filter((f) => f.severity === 'info');
  }, [report.findings]);

  /**
   * Filtered issues based on severity (excludes strengths)
   */
  const filteredFindings = useMemo(() => {
    if (severityFilter === 'all') {
      return issues;
    }
    return issues.filter((f) => f.severity === severityFilter);
  }, [issues, severityFilter]);

  /**
   * Recommendations derived from findings
   */
  const recommendations = useMemo(() => {
    return report.findings
      .filter((f) => f.severity === 'critical' || f.severity === 'serious')
      .map((f) => f.recommendation);
  }, [report.findings]);

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      <Card>
        <CardHeader>
          <CardTitle>Overall Assessment</CardTitle>
          <CardDescription>
            Evaluation completed on {new Date(report.metadata.completedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Overall Score</p>
              <p className="text-4xl font-bold">{report.summary.overallScore}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Grade</p>
              <div className="flex justify-center">
                <GradeBadge grade={report.summary.grade} />
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Passed Dimensions</p>
              <p className="text-4xl font-bold">
                {report.summary.passedDimensions}/{report.summary.totalDimensions}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Total Findings</p>
              <p className="text-4xl font-bold">{report.findings.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Agent Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {report.results.structure && (
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Structure</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{report.results.structure.score}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {report.results.structure.findings.length} findings
              </p>
            </CardContent>
          </Card>
        )}
        {report.results.accessibility && (
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Accessibility</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{report.results.accessibility.score}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {report.results.accessibility.findings.length} findings
              </p>
            </CardContent>
          </Card>
        )}
        {report.results.content && (
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Content Fidelity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{report.results.content.score}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {report.results.content.findings.length} findings
              </p>
            </CardContent>
          </Card>
        )}
        {report.results.visual && (
          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Visual Correctness</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{report.results.visual.score}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {report.results.visual.findings.length} findings
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Dimension Scores</CardTitle>
            <CardDescription>Performance across all evaluation dimensions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center">
              <Radar
                data={radarChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    r: {
                      min: 0,
                      max: 100,
                      ticks: {
                        stepSize: 20,
                      },
                    },
                  },
                  plugins: {
                    legend: {
                      display: false,
                    },
                  },
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Severity Distribution Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Severity Distribution</CardTitle>
            <CardDescription>Breakdown of findings by severity level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <Bar
                data={severityChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false,
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        stepSize: 1,
                      },
                    },
                  },
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Issues Table with Severity Filtering (excludes strengths) */}
      <Card>
        <CardHeader>
          <CardTitle>🎯 Issues</CardTitle>
          <CardDescription>
            Issues discovered during evaluation ({filteredFindings.length} of {issues.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={severityFilter} onValueChange={(v) => setSeverityFilter(v as Severity | 'all')}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All ({issues.length})</TabsTrigger>
              <TabsTrigger value="critical">
                Critical ({issues.filter((f) => f.severity === 'critical').length})
              </TabsTrigger>
              <TabsTrigger value="serious">
                Serious ({issues.filter((f) => f.severity === 'serious').length})
              </TabsTrigger>
              <TabsTrigger value="moderate">
                Moderate ({issues.filter((f) => f.severity === 'moderate').length})
              </TabsTrigger>
              <TabsTrigger value="minor">
                Minor ({issues.filter((f) => f.severity === 'minor').length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={severityFilter} className="mt-0">
              {filteredFindings.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No {severityFilter !== 'all' ? severityFilter : ''} findings
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Severity</TableHead>
                        <TableHead className="w-[120px]">Dimension</TableHead>
                        <TableHead>Issue</TableHead>
                        <TableHead>Recommendation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFindings.map((finding, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <SeverityBadge severity={finding.severity} />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {finding.dimension}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{finding.issue}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {finding.recommendation}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Strengths Section */}
      {strengths.length > 0 && (
        <StrengthsCard
          strengths={strengths}
          collapsible
          defaultExpanded={strengths.length <= 10}
        />
      )}

      {/* Recommendations List */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Priority Recommendations</CardTitle>
            <CardDescription>
              Critical and serious issues requiring immediate attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-800 text-xs font-medium flex items-center justify-center">
                    {index + 1}
                  </span>
                  <span className="text-sm">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
