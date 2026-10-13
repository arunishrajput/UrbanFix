import { create } from 'zustand';
import type { DuplicateCheckResult, IssueDetail } from '@urbanfix/shared';

export interface DraftPhoto {
  key: string;
  previewUrl: string;
  uploadId: string | null;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
}

export interface DraftLocation {
  lat: number;
  lng: number;
  accuracy: number | null;
  source: 'gps' | 'photo' | 'map';
}

export const STEPS = ['Photo', 'Place', 'Type', 'Details', 'Check', 'Send'] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4 | 5;

interface ReportDraft {
  step: StepIndex;
  photos: DraftPhoto[];
  location: DraftLocation | null;
  address: string | null;
  categorySlug: string | null;
  categoryChosenByUser: boolean;
  description: string;
  duplicates: DuplicateCheckResult | null;
  dismissed: string[];
  result: { kind: 'created' | 'joined'; issue: IssueDetail; reopened?: boolean } | null;
  setStep: (s: StepIndex) => void;
  addPhoto: (p: DraftPhoto) => void;
  updatePhoto: (key: string, patch: Partial<DraftPhoto>) => void;
  removePhoto: (key: string) => void;
  setLocation: (l: DraftLocation) => void;
  setAddress: (a: string | null) => void;
  setCategory: (slug: string, byUser: boolean) => void;
  setDescription: (d: string) => void;
  setDuplicates: (d: DuplicateCheckResult | null) => void;
  dismiss: (ids: string[]) => void;
  setResult: (r: ReportDraft['result']) => void;
  reset: () => void;
}

const initial = {
  step: 0 as StepIndex,
  photos: [] as DraftPhoto[],
  location: null,
  address: null,
  categorySlug: null,
  categoryChosenByUser: false,
  description: '',
  duplicates: null,
  dismissed: [] as string[],
  result: null,
};

export const useReportDraft = create<ReportDraft>((set, get) => ({
  ...initial,
  setStep: (step) => set({ step }),
  addPhoto: (p) => set((s) => ({ photos: [...s.photos, p] })),
  updatePhoto: (key, patch) =>
    set((s) => ({ photos: s.photos.map((p) => (p.key === key ? { ...p, ...patch } : p)) })),
  removePhoto: (key) =>
    set((s) => {
      const p = s.photos.find((x) => x.key === key);
      if (p) URL.revokeObjectURL(p.previewUrl);
      return { photos: s.photos.filter((x) => x.key !== key) };
    }),
  setLocation: (location) => set({ location }),
  setAddress: (address) => set({ address }),
  setCategory: (categorySlug, byUser) =>
    set({ categorySlug, categoryChosenByUser: byUser || get().categoryChosenByUser }),
  setDescription: (description) => set({ description }),
  setDuplicates: (duplicates) => set({ duplicates }),
  dismiss: (ids) => set((s) => ({ dismissed: [...new Set([...s.dismissed, ...ids])] })),
  setResult: (result) => set({ result }),
  reset: () => {
    get().photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    set({ ...initial, photos: [], dismissed: [] });
  },
}));
