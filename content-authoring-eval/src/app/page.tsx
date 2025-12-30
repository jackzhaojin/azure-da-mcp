'use client';

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEvaluations } from "@/hooks/useEvaluations";

export default function DashboardPage() {
  const { sortedEvaluations } = useEvaluations();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            View current and past CMS migration quality evaluations
          </p>
        </div>
        <Link href="/evaluate">
          <Button size="lg">New Evaluation</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Evaluations</CardTitle>
          <CardDescription>
            {sortedEvaluations.length === 0
              ? "No evaluations yet. Click \"New Evaluation\" to get started."
              : `${sortedEvaluations.length} evaluation${sortedEvaluations.length === 1 ? '' : 's'} found`
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedEvaluations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground mb-4">
                Your evaluation history will appear here
              </p>
              <Link href="/evaluate">
                <Button>Start Your First Evaluation</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedEvaluations.map((evaluation) => (
                <Card key={evaluation.id} className="border">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">
                          {/* PHASE 32: Handle discriminated union */}
                          {evaluation.type === 'single'
                            ? evaluation.request.migratedUrl
                            : `Batch: ${evaluation.batchId}`
                          }
                        </CardTitle>
                        <CardDescription>
                          {new Date(evaluation.metadata.createdAt).toLocaleString()}
                        </CardDescription>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                        evaluation.summary.grade === 'excellent' ? 'bg-green-100 text-green-800' :
                        evaluation.summary.grade === 'good' ? 'bg-blue-100 text-blue-800' :
                        evaluation.summary.grade === 'acceptable' ? 'bg-yellow-100 text-yellow-800' :
                        evaluation.summary.grade === 'needs-improvement' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {(evaluation.summary.grade || 'critical').toUpperCase()}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      {evaluation.type === 'single' ? (
                        <>
                          {/* Single-page evaluation card */}
                          <div className="flex items-center gap-6">
                            <div>
                              <p className="text-sm text-muted-foreground">Overall Score</p>
                              <p className="text-2xl font-bold">{evaluation.summary.overallScore}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Passed Dimensions</p>
                              <p className="text-2xl font-bold">
                                {evaluation.summary.passedDimensions}/{evaluation.summary.totalDimensions}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Total Findings</p>
                              <p className="text-2xl font-bold">{evaluation.findings?.length || 0}</p>
                            </div>
                          </div>
                          <Link href={`/results/${evaluation.id}`}>
                            <Button variant="outline">View Details</Button>
                          </Link>
                        </>
                      ) : (
                        <>
                          {/* Batch evaluation card */}
                          <div className="flex items-center gap-6">
                            <div>
                              <p className="text-sm text-muted-foreground">Average Score</p>
                              <p className="text-2xl font-bold">{evaluation.summary.averageScore.toFixed(0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Total Pages</p>
                              <p className="text-2xl font-bold">{evaluation.summary.totalPages}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Successful</p>
                              <p className="text-2xl font-bold text-green-600">{evaluation.summary.successfulPages}</p>
                            </div>
                            {evaluation.summary.failedPages > 0 && (
                              <div>
                                <p className="text-sm text-muted-foreground">Failed</p>
                                <p className="text-2xl font-bold text-red-600">{evaluation.summary.failedPages}</p>
                              </div>
                            )}
                          </div>
                          <Link href={`/batch/results/${evaluation.batchId}`}>
                            <Button variant="outline">View Batch</Button>
                          </Link>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
