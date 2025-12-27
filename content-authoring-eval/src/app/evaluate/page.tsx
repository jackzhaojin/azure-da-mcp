import { EvaluationForm } from '@/components/EvaluationForm';

export default function EvaluatePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Evaluation</h1>
        <p className="text-muted-foreground mt-2">
          Evaluate a migrated webpage against the original content
        </p>
      </div>

      <EvaluationForm />
    </div>
  );
}
