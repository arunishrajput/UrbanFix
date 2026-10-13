import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { toast } from 'sonner';
import {
  categoryUpsertSchema,
  LABELS,
  PRIORITIES,
  type CategoryDTO,
  type CategoryUpsertInput,
} from '@urbanfix/shared';
import { Button } from '../../components/ui/Button';
import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { Input, SelectNative, Textarea } from '../../components/ui/Field';
import { ICON_NAMES } from '../../components/ui/icons';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/misc';
import { api, ApiError } from '../../lib/api';
import { qk } from '../../lib/query';

function Editor({
  category,
  open,
  onOpenChange,
  all,
}: {
  category: CategoryDTO | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  all: CategoryDTO[];
}) {
  const qc = useQueryClient();
  const form = useForm<z.input<typeof categoryUpsertSchema>, unknown, CategoryUpsertInput>({
    resolver: zodResolver(categoryUpsertSchema),
    values: category
      ? { ...category }
      : {
          slug: '',
          name: '',
          icon: 'CircleHelp',
          color: '#64748b',
          description: '',
          defaultPriority: 'MEDIUM',
          slaHours: 72,
          duplicateRadiusM: 50,
          relatedSlugs: [],
          isActive: true,
          sortOrder: 200,
        },
  });
  const watch = useWatch({ control: form.control });
  const save = form.handleSubmit(async (v) => {
    try {
      await api(category ? `/admin/categories/${category.id}` : '/admin/categories', {
        method: category ? 'PUT' : 'POST',
        body: v,
      });
      toast.success('Category saved');
      qc.invalidateQueries({ queryKey: qk.categories });
      qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
      onOpenChange(false);
    } catch (err) {
      form.setError('root', { message: err instanceof ApiError ? err.message : 'Could not save' });
    }
  });
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? `Edit ${category.name}` : 'New category'}
    >
      <form onSubmit={save} className="space-y-4" noValidate>
        <div className="flex items-center gap-3">
          <CategoryIcon
            category={{
              icon: watch.icon ?? 'CircleHelp',
              color: watch.color ?? '#64748b',
              name: watch.name ?? '',
            }}
            size="lg"
          />
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <Input label="Name" {...form.register('name')} error={form.formState.errors.name?.message} />
            <Input
              label="Slug"
              {...form.register('slug')}
              disabled={Boolean(category)}
              error={form.formState.errors.slug?.message}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectNative label="Icon" {...form.register('icon')}>
            {ICON_NAMES.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </SelectNative>
          <Input label="Colour" type="color" className="h-11 p-1" {...form.register('color')} />
          <SelectNative label="Default priority" {...form.register('defaultPriority')}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {LABELS.priority[p]}
              </option>
            ))}
          </SelectNative>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="SLA (hours)"
            type="number"
            {...form.register('slaHours')}
            error={form.formState.errors.slaHours?.message}
          />
          <Input
            label="Duplicate radius (m)"
            type="number"
            {...form.register('duplicateRadiusM')}
            hint="Search distance for similar open issues"
          />
          <Input label="Sort order" type="number" {...form.register('sortOrder')} />
        </div>
        <Textarea label="Description" rows={2} {...form.register('description')} />
        <fieldset>
          <legend className="text-sm font-semibold">Related categories</legend>
          <p className="text-xs text-muted">
            Reports in related categories can still be matched as duplicates.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {all
              .filter((c) => c.slug !== watch.slug)
              .map((c) => {
                const on = watch.relatedSlugs?.includes(c.slug);
                return (
                  <button
                    type="button"
                    key={c.slug}
                    aria-pressed={on}
                    onClick={() =>
                      form.setValue(
                        'relatedSlugs',
                        on
                          ? (watch.relatedSlugs ?? []).filter((s) => s !== c.slug)
                          : [...(watch.relatedSlugs ?? []), c.slug],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${on ? 'border-ink bg-ink text-bg' : 'border-line'}`}
                  >
                    {c.name}
                  </button>
                );
              })}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="size-4 accent-[var(--signal)]" {...form.register('isActive')} />{' '}
          Citizens can choose this category
        </label>
        {form.formState.errors.root && (
          <p className="text-sm text-cone-ink">{form.formState.errors.root.message}</p>
        )}
        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          Save category
        </Button>
      </form>
    </Sheet>
  );
}

export default function AdminCategoriesPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: qk.admin('categories'),
    queryFn: () => api<CategoryDTO[]>('/admin/categories'),
  });
  const [editing, setEditing] = useState<CategoryDTO | null>(null);
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: (id: string) =>
      api<{ deleted: boolean; deactivated: boolean }>(`/admin/categories/${id}`, { method: 'DELETE' }),
    onSuccess: (r) => {
      toast.success(r.deleted ? 'Category deleted' : 'Category is in use, so it was deactivated instead');
      qc.invalidateQueries({ queryKey: ['admin', 'categories'] });
      qc.invalidateQueries({ queryKey: qk.categories });
    },
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sign-label">Administration</p>
          <h1 className="text-3xl font-black">Categories</h1>
        </div>
        <Button onClick={() => (setEditing(null), setOpen(true))}>
          <Plus className="size-4" /> New category
        </Button>
      </div>
      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <li key={c.id} className={`card flex gap-3 p-4 ${c.isActive ? '' : 'opacity-60'}`}>
              <CategoryIcon category={c} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-display font-extrabold">
                  {c.name}{' '}
                  {!c.isActive && <span className="text-xs font-semibold text-muted">(inactive)</span>}
                </p>
                <p className="line-clamp-2 text-xs text-muted">{c.description}</p>
                <p className="mt-2 font-mono text-[0.7rem] text-muted">
                  SLA {c.slaHours} h · radius {c.duplicateRadiusM} m · {LABELS.priority[c.defaultPriority]}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => (setEditing(c), setOpen(true))}
                  className="rounded-lg p-2 hover:bg-surface-2"
                  aria-label={`Edit ${c.name}`}
                >
                  <Pencil className="size-4" />
                </button>
                {c.isActive && (
                  <button
                    onClick={() => remove.mutate(c.id)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:text-cone-ink"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Editor category={editing} open={open} onOpenChange={setOpen} all={data ?? []} />
    </div>
  );
}
