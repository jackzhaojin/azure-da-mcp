import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from "lucide-react";

/** Run/stage status chip — colors + iconography copied from the v1 eval app's BatchEvaluationTable. */
export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "running":
    case "working":
    case "submitted":
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 animate-pulse">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          running
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          completed
        </Badge>
      );
    case "completed_with_failures":
      return (
        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
          <AlertTriangle className="h-3 w-3 mr-1" />
          partial
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          <XCircle className="h-3 w-3 mr-1" />
          failed
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
          {status}
        </Badge>
      );
  }
}

/** Score text with the v1 color thresholds (90/75/60/40). */
export function ScoreText({ score, className = "" }: { score: number | undefined | null; className?: string }) {
  if (score === undefined || score === null) return <span className="text-muted-foreground">—</span>;
  const color =
    score >= 90
      ? "text-green-600"
      : score >= 75
        ? "text-blue-600"
        : score >= 60
          ? "text-yellow-600"
          : score >= 40
            ? "text-orange-600"
            : "text-red-600";
  return <span className={`${color} font-semibold ${className}`}>{Math.round(score)}</span>;
}
