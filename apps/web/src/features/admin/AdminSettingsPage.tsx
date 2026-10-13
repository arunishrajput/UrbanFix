import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { toast } from 'sonner';
import { settingsSchema, type AppSettings } from '@urbanfix/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { Skeleton } from '../../components/ui/misc';
import { api, ApiError } from '../../lib/api';
import { qk } from '../../lib/query';

export default function AdminSettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: qk.admin('settings'),
    queryFn: () => api<AppSettings>('/admin/settings'),
  });
  const form = useForm<z.input<typeof settingsSchema>, unknown, AppSettings>({
    resolver: zodResolver(settingsSchema),
    values: data,
  });
  const save = form.handleSubmit(async (v) => {
    try {
      await api('/admin/settings', { method: 'PUT', body: v });
      toast.success('Settings saved');
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      qc.invalidateQueries({ queryKey: qk.config });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save');
    }
  });
  if (!data) return <Skeleton className="h-96" />;
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <p className="sign-label">Administration</p>
        <h1 className="text-3xl font-black">Resolution verification</h1>
        <p className="text-sm text-muted">
          How citizens confirm fixes before an issue is closed as verified.
        </p>
      </div>
      <form onSubmit={save} className="card space-y-5 p-5" noValidate>
        <Input
          label="Verification window (hours)"
          type="number"
          {...form.register('windowHours')}
          hint="How long reporters have to respond after an issue is marked resolved."
          error={form.formState.errors.windowHours?.message}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Confirmations needed"
            type="number"
            {...form.register('minConfirmations')}
            hint="Capped at the number of reporters."
          />
          <Input
            label="Share of reporters who must confirm"
            type="number"
            step="0.05"
            {...form.register('ratio')}
            hint="0.5 = half of those who did not skip."
          />
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--signal)]"
            {...form.register('requireCompletionPhoto')}
          />
          <span>
            <span className="block font-semibold">Require a work-completion photo</span>
            <span className="text-muted">Staff must upload proof before marking an issue resolved.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--signal)]"
            {...form.register('autoVerifyOnSilence')}
          />
          <span>
            <span className="block font-semibold">Verify automatically when nobody responds</span>
            <span className="text-muted">
              Off by default: silence leaves the issue resolved but unverified.
            </span>
          </span>
        </label>
        <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
          A single “still not fixed” response with a photo always reopens the issue immediately.
        </p>
        <Button type="submit" loading={form.formState.isSubmitting}>
          Save settings
        </Button>
      </form>
    </div>
  );
}
