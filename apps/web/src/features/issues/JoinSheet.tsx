import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { IssueDetail, JoinIssueResult } from '@urbanfix/shared';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { api, ApiError } from '../../lib/api';
import { ensureSession } from '../../lib/auth';
import { useGeolocation } from '../../lib/geo';
import { qk } from '../../lib/query';
import { uploadPhoto } from '../report/uploads';

/** Add your own photo as evidence to an existing issue. */
export function JoinSheet({
  issue,
  open,
  onOpenChange,
}: {
  issue: IssueDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ id: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState('');
  const geo = useGeolocation({ auto: open, targetAccuracy: 50 });

  const join = useMutation({
    mutationFn: () =>
      api<JoinIssueResult>(`/issues/${issue.id}/join`, {
        body: {
          lat: geo.fix?.lat ?? issue.lat,
          lng: geo.fix?.lng ?? issue.lng,
          accuracyM: geo.fix?.accuracy,
          description: description || undefined,
          uploadIds: [upload!.id],
        },
      }),
    onSuccess: (res) => {
      qc.setQueryData(qk.issue(issue.id), res.issue);
      qc.invalidateQueries({ queryKey: qk.issueTimeline(issue.id) });
      qc.invalidateQueries({ queryKey: qk.issueReports(issue.id) });
      toast.success(
        res.reopened
          ? 'Thanks — the issue has been reopened'
          : `You joined ${res.issue.reporterCount - 1} other citizens on this issue`,
      );
      onOpenChange(false);
      setUpload(null);
      setDescription('');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add your report'),
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Report this too"
      description="Your photo becomes evidence on this issue and raises its priority."
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            await ensureSession();
            const u = await uploadPhoto(file);
            setUpload({ id: u.id, preview: u.thumbUrl });
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Upload failed');
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        onClick={() => input.current?.click()}
        className="flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-surface-2 font-display font-bold text-muted"
      >
        {busy ? (
          <LoaderCircle className="size-6 animate-spin" />
        ) : upload ? (
          <img src={upload.preview} alt="Your photo" className="size-full object-cover" />
        ) : (
          <span className="inline-flex items-center gap-2">
            <Camera className="size-5" /> Take a photo
          </span>
        )}
      </button>
      <div className="mt-4">
        <Textarea
          label="Comment (optional)"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        {geo.fix
          ? `Location captured (±${Math.round(geo.fix.accuracy)} m).`
          : geo.status === 'error'
            ? 'Location unavailable — you need to be near the issue.'
            : 'Getting your location…'}
      </p>
      <Button
        className="mt-4 w-full"
        size="lg"
        disabled={!upload}
        loading={join.isPending}
        onClick={() => join.mutate()}
      >
        Add my report
      </Button>
    </Sheet>
  );
}
