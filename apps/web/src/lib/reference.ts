import { useQuery } from '@tanstack/react-query';
import type { CategoryDTO, WardDTO } from '@urbanfix/shared';
import { api } from './api';
import { qk } from './query';

export interface PublicConfig {
  city: { name: string; center: { lat: number; lng: number } };
  aiEnabled: boolean;
  pushPublicKey: string | null;
  verification: { windowHours: number; requireCompletionPhoto: boolean };
  maxUploadMb: number;
}

export const useConfig = () =>
  useQuery({ queryKey: qk.config, queryFn: () => api<PublicConfig>('/config'), staleTime: 10 * 60_000 });

export const useCategories = () =>
  useQuery({
    queryKey: qk.categories,
    queryFn: () => api<CategoryDTO[]>('/categories'),
    staleTime: 10 * 60_000,
  });

export const useWards = () =>
  useQuery({ queryKey: qk.wards, queryFn: () => api<WardDTO[]>('/wards'), staleTime: 10 * 60_000 });

export function useCategoryMap() {
  const { data } = useCategories();
  return new Map((data ?? []).map((c) => [c.slug, c]));
}
