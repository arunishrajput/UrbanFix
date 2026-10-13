/**
 * Photo analysis job: Gemini vision (category, caption, severity, moderation,
 * OCR) plus a multimodal embedding for duplicate detection. Falls back to
 * heuristics when AI is unavailable so the report flow never blocks on it.
 */
import { and, eq, ne, sql } from 'drizzle-orm';
import type { PhotoAnalysis } from '@urbanfix/shared';
import { config } from '../../config';
import { logger } from '../../core/logger';
import { emitTo, rooms } from '../../core/realtime';
import { storage } from '../../core/storage';
import { db, schema } from '../../db/client';
import { categoryById, getCategories } from '../../lib/categories';
import { recomputePriority } from '../issues/events';
import { embedImage } from './embedding.service';
import { AiUnavailableError } from './gemini.client';
import { fallbackTitle, heuristicAnalysis } from './heuristics';
import { analyzeIssuePhoto } from './vision.service';

const { photos, reports, issues } = schema;

export async function analyzePhoto(photoId: string) {
  const photo = await db.query.photos.findFirst({ where: eq(photos.id, photoId) });
  if (!photo || photo.analysisStatus === 'DONE') return;
  const categories = (await getCategories()).filter((c) => c.isActive);

  let analysis: PhotoAnalysis;
  let embedding: number[] | null = null;
  let status: 'DONE' | 'FAILED' | 'SKIPPED' = 'DONE';

  if (!config.aiAvailable) {
    analysis = heuristicAnalysis(categories);
    status = 'SKIPPED';
  } else {
    const image = await storage.get(photo.variants.medium);
    const [vision, vector] = await Promise.allSettled([
      analyzeIssuePhoto(image, 'image/webp', categories),
      embedImage(image, 'image/webp'),
    ]);
    if (vision.status === 'fulfilled') {
      analysis = vision.value;
    } else {
      const reason = vision.reason as Error;
      logger.warn({ photoId, err: reason.message }, 'photo analysis failed; using heuristics');
      analysis = heuristicAnalysis(categories);
      status = reason instanceof AiUnavailableError ? 'SKIPPED' : 'FAILED';
    }
    if (vector.status === 'fulfilled') embedding = vector.value;
  }

  await db
    .update(photos)
    .set({ analysis, analysisStatus: status, embedding, moderationFlags: analysis.moderation.flags })
    .where(eq(photos.id, photoId));

  if (photo.reportId) await applyToReport(photo.id, photo.reportId, analysis);
  emitTo(rooms.user(photo.uploadedById), 'upload:analyzed', { id: photo.id, analysisStatus: status });
}

/** The photo was already submitted: update moderation, severity, title and priority. */
async function applyToReport(photoId: string, reportId: string, analysis: PhotoAnalysis) {
  await db.transaction(async (tx) => {
    const [report] = await tx.select().from(reports).where(eq(reports.id, reportId)).for('update');
    if (!report) return;
    const [issue] = await tx.select().from(issues).where(eq(issues.id, report.issueId)).for('update');
    if (!issue) return;

    if (analysis.source === 'gemini' && !analysis.moderation.safe) {
      await tx.update(photos).set({ status: 'HIDDEN' }).where(eq(photos.id, photoId));
      await tx.update(reports).set({ moderationStatus: 'FLAGGED' }).where(eq(reports.id, reportId));
      if (issue.coverPhotoId === photoId) {
        const [next] = await tx
          .select({ id: photos.id })
          .from(photos)
          .where(and(eq(photos.issueId, issue.id), eq(photos.status, 'ATTACHED'), ne(photos.id, photoId)))
          .limit(1);
        await tx
          .update(issues)
          .set({ coverPhotoId: next?.id ?? null })
          .where(eq(issues.id, issue.id));
      }
      return;
    }

    if (report.moderationStatus === 'PENDING') {
      const pending = await tx
        .select({ id: photos.id })
        .from(photos)
        .where(and(eq(photos.reportId, reportId), ne(photos.analysisStatus, 'DONE')));
      if (!pending.length)
        await tx.update(reports).set({ moderationStatus: 'APPROVED' }).where(eq(reports.id, reportId));
    }
    if (!report.ai || (analysis.severity ?? 0) > (report.ai.severity ?? 0)) {
      await tx.update(reports).set({ ai: analysis }).where(eq(reports.id, reportId));
    }

    const category = await categoryById(issue.categoryId);
    const updates: Partial<typeof issues.$inferInsert> = {};
    if (analysis.severity && analysis.severity > (issue.severity ?? 0)) updates.severity = analysis.severity;
    // Replace the placeholder title once the AI caption is available.
    if (analysis.caption && category && issue.title === fallbackTitle(category.name, issue.address)) {
      updates.title = analysis.caption;
    }
    if (Object.keys(updates).length) {
      await tx
        .update(issues)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(eq(issues.id, issue.id));
      await recomputePriority(tx, issue.id);
    }
  });
}
