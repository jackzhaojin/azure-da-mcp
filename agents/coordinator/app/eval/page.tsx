import { DirectEvalCard } from "@/components/DirectEvalCard";

export const dynamic = "force-dynamic";

export default function EvalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Direct eval</h1>
        <p className="text-muted-foreground mt-2">
          The deterministic lane: score a single page by addressing the eval agent directly — bypassing the coordinator&apos;s
          orchestration. The result is still recorded in the same source-of-truth store and renders like any other run.
        </p>
      </div>
      <DirectEvalCard />
    </div>
  );
}
