import { BulkRunCard } from "@/components/BulkRunCard";

export const dynamic = "force-dynamic";

export default function BulkPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk run</h1>
        <p className="text-muted-foreground mt-2">
          Evaluate a batch of pages against their sources (PDF or webpage), or run a batch of topics end-to-end. Upload a
          source→target batch as JSON — each item is its own durable run, grouped so you can watch, retry, and export the
          whole batch.
        </p>
      </div>
      <BulkRunCard />
    </div>
  );
}
