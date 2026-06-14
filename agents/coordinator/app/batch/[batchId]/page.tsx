import { BatchDetail } from "@/components/BatchDetail";

export const dynamic = "force-dynamic";

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  return <BatchDetail batchId={batchId} />;
}
