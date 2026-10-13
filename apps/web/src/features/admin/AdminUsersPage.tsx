import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  adminCreateUserSchema,
  LABELS,
  USER_ROLES,
  type AdminCreateUserInput,
  type AdminUserRow,
  type PagedResult,
  type UserRole,
} from '@urbanfix/shared';
import { Button } from '../../components/ui/Button';
import { Input, SelectNative } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/misc';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { timeAgo } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import { qk } from '../../lib/query';
import { useWards } from '../../lib/reference';

function CreateUser({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: wards } = useWards();
  const form = useForm<AdminCreateUserInput>({
    resolver: zodResolver(adminCreateUserSchema),
    defaultValues: { role: 'STAFF' },
  });
  const submit = form.handleSubmit(async (v) => {
    try {
      await api('/admin/users', { body: { ...v, wardId: v.wardId || null } });
      toast.success(`${v.name} can now sign in`);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      form.reset({ role: 'STAFF' });
      onOpenChange(false);
    } catch (err) {
      form.setError('root', {
        message: err instanceof ApiError ? err.message : 'Could not create the account',
      });
    }
  });
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add a person"
      description="Create accounts for officials, field staff or other administrators."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Full name" {...form.register('name')} error={form.formState.errors.name?.message} />
        <Input
          label="Email"
          type="email"
          {...form.register('email')}
          error={form.formState.errors.email?.message}
        />
        <Input
          label="Temporary password"
          type="text"
          {...form.register('password')}
          error={form.formState.errors.password?.message}
          hint="Share it securely; they can change it later."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectNative label="Role" {...form.register('role')}>
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {LABELS.role[r]}
              </option>
            ))}
          </SelectNative>
          <SelectNative label="Ward (optional)" {...form.register('wardId')}>
            <option value="">City-wide</option>
            {wards?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </SelectNative>
        </div>
        {form.formState.errors.root && (
          <p className="text-sm text-cone-ink">{form.formState.errors.root.message}</p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </Sheet>
  );
}

export default function AdminUsersPage() {
  const me = useAuth((s) => s.user);
  const qc = useQueryClient();
  const { data: wards } = useWards();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const dq = useDebounced(q, 300);
  const params = { q: dq || undefined, role: role || undefined, page, pageSize: 25 };
  const { data } = useQuery({
    queryKey: qk.admin('users', params),
    queryFn: () => api<PagedResult<AdminUserRow>>('/admin/users', { query: params }),
    placeholderData: keepPreviousData,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      role?: UserRole;
      status?: 'ACTIVE' | 'SUSPENDED';
      wardId?: string | null;
    }) => api(`/admin/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sign-label">Administration</p>
          <h1 className="text-3xl font-black">People</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> Add official or staff
        </Button>
      </div>
      <div className="card flex flex-wrap gap-2 p-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search people</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            className="field pl-9"
            placeholder="Search name or email"
            value={q}
            onChange={(e) => (setQ(e.target.value), setPage(1))}
          />
        </label>
        <select
          aria-label="Role"
          className="field w-auto"
          value={role}
          onChange={(e) => (setRole(e.target.value as UserRole | ''), setPage(1))}
        >
          <option value="">All roles</option>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {LABELS.role[r]}
            </option>
          ))}
        </select>
      </div>
      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-surface-2 text-left text-[0.7rem] uppercase tracking-wider text-muted">
              <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:font-display [&>th]:font-extrabold">
                <th>Person</th>
                <th>Role</th>
                <th>Ward</th>
                <th className="text-right">Reports</th>
                <th className="text-right">Reputation</th>
                <th>Last seen</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((u) => (
                <tr
                  key={u.id}
                  className={cn('[&>td]:px-3 [&>td]:py-2', u.status === 'SUSPENDED' && 'opacity-60')}
                >
                  <td>
                    <p className="font-semibold">{u.isGuest ? 'Guest' : u.name}</p>
                    <p className="font-mono text-xs text-muted">{u.email ?? 'no email (guest)'}</p>
                  </td>
                  <td>
                    <select
                      aria-label={`Role for ${u.name}`}
                      className="field w-auto py-1.5 text-sm"
                      value={u.role}
                      disabled={u.id === me?.id || u.isGuest}
                      onChange={(e) => update.mutate({ id: u.id, role: e.target.value as UserRole })}
                    >
                      {USER_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {LABELS.role[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {u.role === 'CITIZEN' ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <select
                        aria-label={`Ward for ${u.name}`}
                        className="field w-auto py-1.5 text-sm"
                        value={u.wardId ?? ''}
                        onChange={(e) => update.mutate({ id: u.id, wardId: e.target.value || null })}
                      >
                        <option value="">City-wide</option>
                        {wards?.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="text-right font-mono">{u.reportCount}</td>
                  <td className="text-right font-mono">{u.reputation}</td>
                  <td className="text-xs text-muted">{u.lastSeenAt ? timeAgo(u.lastSeenAt) : 'never'}</td>
                  <td>
                    <Button
                      size="sm"
                      variant={u.status === 'SUSPENDED' ? 'outline' : 'ghost'}
                      disabled={u.id === me?.id}
                      onClick={() =>
                        update.mutate({ id: u.id, status: u.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED' })
                      }
                    >
                      {u.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-sm text-muted">
            <span>{data.total} people</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={page * data.pageSize >= data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
      <CreateUser open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
