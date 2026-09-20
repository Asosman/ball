// services/updateScheduler.js
import logger from '../utils/logger.js';

// Configuration: 2 to 5 minutes delay window
export const MIN_UPDATE_DELAY_MS = 2 * 60 * 1000; // 2 minutes (120,000 ms)
export const MAX_UPDATE_DELAY_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)

// Configuration: At least 30 seconds to 1 minute separation between Facebook posts
export const MIN_POST_SPACING_MS = 30 * 1000; // 30 seconds (30,000 ms) minimum
export const TARGET_POST_SPACING_MS = 35 * 1000; // 35 seconds target
export const MAX_POST_SPACING_MS = 60 * 1000; // 1 minute (60,000 ms) maximum

/**
 * Calculates remaining cooldown milliseconds required before a new post can be published.
 * Ensures posts are spaced by at least 30 seconds to 1 minute.
 * @param {number|string|null} lastPostTime
 * @param {number} [targetSpacingMs=TARGET_POST_SPACING_MS]
 * @returns {number} remaining ms to wait (0 if ready)
 */
export function getPostSpacingWaitMs(lastPostTime, targetSpacingMs = TARGET_POST_SPACING_MS) {
  if (!lastPostTime) return 0;
  const lastTime = typeof lastPostTime === 'number' ? lastPostTime : new Date(lastPostTime).getTime();
  if (isNaN(lastTime) || lastTime <= 0) return 0;
  const elapsed = Date.now() - lastTime;
  if (elapsed >= targetSpacingMs) return 0;
  return targetSpacingMs - elapsed;
}

/**
 * Calculates a randomized timestamp between 2 and 5 minutes after createdAt.
 * @param {string|number|Date} createdAt
 * @returns {string} ISO timestamp
 */
export function calculateScheduledUpdateTime(createdAt) {
  const baseTime = createdAt ? new Date(createdAt).getTime() : Date.now();
  const randomOffset = Math.floor(MIN_UPDATE_DELAY_MS + Math.random() * (MAX_UPDATE_DELAY_MS - MIN_UPDATE_DELAY_MS));
  return new Date(baseTime + randomOffset).toISOString();
}

/**
 * Initializes or normalizes creation and update schedule timestamps on a post record.
 * @param {object} postRecord
 * @param {string} [createdAt]
 * @returns {object} updated postRecord
 */
export function registerPostSchedule(postRecord, createdAt) {
  if (!postRecord) return postRecord;
  if (!postRecord.createdAt) {
    postRecord.createdAt = createdAt || new Date().toISOString();
  }
  if (!postRecord.earliestUpdateAt) {
    postRecord.earliestUpdateAt = calculateScheduledUpdateTime(postRecord.createdAt);
  }
  return postRecord;
}

/**
 * Determines whether a post is currently permitted to be updated.
 * Enforces:
 * 1. Minimum 2-minute mandatory hold period after creation.
 * 2. Randomized 2–5 minute window before allowing updates.
 * 3. Survives bot restarts by calculating elapsed time from persistent createdAt / earliestUpdateAt.
 *
 * @param {object} postRecord
 * @param {number} [nowTimestamp=Date.now()]
 * @returns {boolean}
 */
export function isUpdateAllowed(postRecord, nowTimestamp = Date.now()) {
  if (!postRecord || !postRecord.createdAt) {
    // If no record exists, default to allowing normal update logic
    return true;
  }

  const createdTime = new Date(postRecord.createdAt).getTime();
  const elapsedMs = nowTimestamp - createdTime;

  // Strict rule: No update allowed during the first 2 minutes
  if (elapsedMs < MIN_UPDATE_DELAY_MS) {
    return false;
  }

  // Ensure scheduled target exists
  if (!postRecord.earliestUpdateAt) {
    postRecord.earliestUpdateAt = calculateScheduledUpdateTime(postRecord.createdAt);
  }

  const targetTime = new Date(postRecord.earliestUpdateAt).getTime();
  return nowTimestamp >= targetTime;
}

/**
 * Returns the remaining delay in milliseconds for a post update.
 * @param {object} postRecord
 * @param {number} [nowTimestamp=Date.now()]
 * @returns {number} remaining ms (0 if ready)
 */
export function getRemainingDelayMs(postRecord, nowTimestamp = Date.now()) {
  if (!postRecord || !postRecord.createdAt) return 0;
  if (!postRecord.earliestUpdateAt) {
    postRecord.earliestUpdateAt = calculateScheduledUpdateTime(postRecord.createdAt);
  }
  const targetTime = new Date(postRecord.earliestUpdateAt).getTime();
  return Math.max(0, targetTime - nowTimestamp);
}

/**
 * Queues or updates the latest pending edit state for a held post.
 * If multiple events occur during the waiting window, this keeps only the latest state.
 * @param {object} postRecord
 * @param {object} editPayload
 */
export function queuePendingUpdate(postRecord, editPayload) {
  if (!postRecord) return;
  const remainingSec = Math.round(getRemainingDelayMs(postRecord) / 1000);
  postRecord.pendingUpdate = {
    ...editPayload,
    queuedAt: new Date().toISOString(),
    scheduledAt: postRecord.earliestUpdateAt,
  };
  logger.info(
    `[UPDATE SCHEDULER] Post ${postRecord.postId || editPayload.postId} is in 2–5 min holding window (${remainingSec}s remaining). Update held with latest event state.`
  );
}

export default {
  MIN_UPDATE_DELAY_MS,
  MAX_UPDATE_DELAY_MS,
  calculateScheduledUpdateTime,
  registerPostSchedule,
  isUpdateAllowed,
  getRemainingDelayMs,
  queuePendingUpdate,
};
