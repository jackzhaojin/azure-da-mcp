import { BatchEvaluationForm } from '@/components/BatchEvaluationForm';

export default function BatchEvaluatePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Batch Evaluation</h1>
        <p className="text-muted-foreground mt-2">
          Evaluate multiple pages at once for efficient quality assessment
        </p>
      </div>

      <BatchEvaluationForm />
    </div>
  );
}
