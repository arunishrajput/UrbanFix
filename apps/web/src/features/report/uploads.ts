import { useQueries } from '@tanstack/react-query';
import type { PhotoAnalysis, PhotoKind, UploadDTO } from '@urbanfix/shared';
import { api } from '../../lib/api';
import { preparePhoto } from '../../lib/image';
import { qk } from '../../lib/query';

export async function uploadPhoto(file: File, kind: PhotoKind = 'REPORT'): Promise<UploadDTO> {
  const blob = await preparePhoto(file);
  const form = new FormData();
  form.append('file', blob, file.name.replace(/\.\w+$/, '') + '.jpg');
  return api<UploadDTO>('/uploads', { method: 'POST', body: form, query: { kind } });
}

/** Polls uploads until their AI analysis finishes (socket events also invalidate these). */
export function useUploads(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: qk.upload(id),
      queryFn: () => api<UploadDTO>(`/uploads/${id}`),
      refetchInterval: (q: { state: { data?: UploadDTO } }) =>
        q.state.data?.analysisStatus === 'PENDING' ? 2000 : false,
      staleTime: Infinity,
    })),
  });
}

/** The most confident category suggestion across the analysed photos. */
export function bestSuggestion(uploads: (UploadDTO | undefined)[]): PhotoAnalysis | null {
  return (
    uploads
      .map((u) => u?.analysis)
      .filter((a): a is PhotoAnalysis => Boolean(a?.categorySlug))
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null
  );
}
