/** Registers every job handler. Imported by the worker, and by the API in inline mode. */
import { registerJob } from '../core/jobs';
import { analyzePhoto } from '../modules/ai/analyze';
import { evaluateBadges } from '../modules/gamification/service';
import { deliverNotifications } from '../modules/notifications/service';
import { closeRoundJob } from '../modules/verification/service';
import { cleanupDraftUploads, refreshAnalytics, slaCheck } from './maintenance';

registerJob('analyze-photo', ({ photoId }) => analyzePhoto(photoId));
registerJob('notify', ({ notificationIds }) => deliverNotifications(notificationIds));
registerJob('close-verification', ({ roundId }) => closeRoundJob(roundId));
registerJob('award-badges', ({ userId }) => evaluateBadges(userId));
registerJob('refresh-analytics', () => refreshAnalytics());
registerJob('sla-check', () => slaCheck());
registerJob('cleanup-uploads', () => cleanupDraftUploads());
