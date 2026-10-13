import { Sparkles } from 'lucide-react';
import type { PhotoAnalysis } from '@urbanfix/shared';
import { Textarea } from '../../../components/ui/Field';
import { useReportDraft } from '../store';

const MAX = 1000;

export function DetailsStep({ suggestion }: { suggestion: PhotoAnalysis | null }) {
  const { description, setDescription } = useReportDraft();
  const ai = suggestion?.source === 'gemini' ? suggestion.descriptionSuggestion : null;
  return (
    <div>
      <h2 className="text-2xl font-black">Anything the crew should know?</h2>
      <p className="mt-1 text-sm text-muted">
        Optional. How long has it been like this, is it dangerous, the nearest landmark.
      </p>
      <div className="mt-5">
        <Textarea
          label="Description (optional)"
          value={description}
          maxLength={MAX}
          rows={5}
          placeholder="e.g. Bin has overflowed for three days, next to the bus stop opposite the bakery."
          onChange={(e) => setDescription(e.target.value)}
          hint={`${description.length}/${MAX}`}
        />
      </div>
      {ai && !description && (
        <button
          onClick={() => setDescription(ai)}
          className="mt-3 flex w-full items-start gap-3 rounded-2xl border border-dashed border-lane bg-[#fffbea] p-3 text-left text-sm dark:bg-[#2a2410]"
        >
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[#a37f00]" />
          <span>
            <span className="block font-bold">Use the suggested description</span>
            <span className="text-muted">{ai}</span>
          </span>
        </button>
      )}
      {suggestion?.severity && suggestion.source === 'gemini' && (
        <p className="mt-4 text-xs text-muted">
          Estimated severity <span className="font-mono font-bold text-ink">{suggestion.severity}/5</span>
          {suggestion.severityReason ? ` — ${suggestion.severityReason}` : ''}
        </p>
      )}
    </div>
  );
}
