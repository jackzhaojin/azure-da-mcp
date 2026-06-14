import { BulkRunCard } from "@/components/BulkRunCard";

export const dynamic = "force-dynamic";

export default function BulkPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bulk run</h1>
        <p className="text-muted-foreground mt-2">
          Submit a batch of URLs to evaluate, or a batch of topics to run end-to-end. Each item is its own durable run,
          grouped so you can watch, retry, and export the whole batch.
        </p>
      </div>
      <BulkRunCard />
    </div>
  );
}
