// services/monitoringManager.js
import config from '../config/env.js';
import logger from '../utils/logger.js';
import db from './db.js';
import realFacebook from './facebook.js';
import mockFacebook from '../mock/mockFacebookClient.js';
import { fetchMatchDetails } from './espn.js';
import { compareMatchState, formatEventPost, formatLineupPost, isWhitelistedEvent, findMatchingLineupPlayer } from './eventEngine.js';
import {
  calculateScheduledUpdateTime,
  isUpdateAllowed,
  queuePendingUpdate,
  registerPostSchedule,
  getPostSpacingWaitMs,
  TARGET_POST_SPACING_MS,
} from './updateScheduler.js';

class MonitoringManager {
  constructor() {
    this.monitoredFixtureIds = new Set();
    this.isRunning = false;
    this.pollTimeoutId = null;
    this.cycleCount = 0;
    this.lastPollTimestamp = null;
    this.fullTimeGraceCycles = new Map(); // tracks full-time removal
    this.matchLocks = new Map(); // Per-match concurrency protection
    this.publishQueueLock = Promise.resolve(); // Global lock enforcing 30s - 1 min post separation
  }

  /**
   * Serializes Facebook post publishing with mandatory post spacing of at least 30 seconds to 1 minute.
   * Ensures no two posts are ever published at the same time across any matches.
   * @param {() => Promise<string|null>} postTask
   * @returns {Promise<string|null>}
   */
  async withPostSpacing(postTask) {
    const runTask = async () => {
      const lastPostAt = await db.getLastFacebookPostTime();
      const targetSpacing = config.isMockMode ? 1000 : TARGET_POST_SPACING_MS;
      const waitMs = getPostSpacingWaitMs(lastPostAt, targetSpacing);

      if (waitMs > 0) {
        const elapsedSec = lastPostAt ? Math.round((Date.now() - lastPostAt) / 1000) : 0;
        logger.info(`[POST SPACING] Enforcing 30 seconds – 1 minute delay between posts (last post was ${elapsedSec}s ago). Waiting ${Math.round(waitMs / 1000)}s before next Facebook post...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const postId = await postTask();

      if (postId) {
        await db.recordLastFacebookPostTime(new Date().toISOString());
      }
      return postId;
    };

    const nextLock = this.publishQueueLock.then(runTask, runTask);
    this.publishQueueLock = nextLock.then(() => {}, () => {});
    return nextLock;
  }

  get facebook() {
    return config.isMockMode ? mockFacebook : realFacebook;
  }

  /**
   * Concurrency protection: ensures only one polling cycle processes a match at any given time.
   * @template T
   * @param {string} fixtureId
   * @param {() => Promise<T>} task
   * @returns {Promise<T>}
   */
  async withMatchLock(fixtureId, task) {
    const id = String(fixtureId);
    while (this.matchLocks.has(id)) {
      await this.matchLocks.get(id);
    }

    let release;
    const lockPromise = new Promise((resolve) => {
      release = resolve;
    });
    this.matchLocks.set(id, lockPromise);

    try {
      return await task();
    } finally {
      this.matchLocks.delete(id);
      release();
    }
  }

  /**
   * Adds a fixture ID to the active monitoring set.
   * Enforces the maximum limit of 15 matches.
   * @param {string} fixtureId
   * @returns {boolean} true if added, false if limit reached
   */
  addMatch(fixtureId) {
    if (this.monitoredFixtureIds.size >= config.monitoring.maxMonitoredMatches) {
      logger.warn(`Cannot add fixture ${fixtureId}: maximum limit of ${config.monitoring.maxMonitoredMatches} matches reached.`);
      return false;
    }
    this.monitoredFixtureIds.add(String(fixtureId));
    logger.info(`Added fixture ${fixtureId} to monitoring queue. Current count: ${this.monitoredFixtureIds.size}/${config.monitoring.maxMonitoredMatches}`);
    return true;
  }

  /**
   * Removes a fixture ID from the active monitoring set.
   * @param {string} fixtureId
   * @returns {boolean}
   */
  removeMatch(fixtureId) {
    const deleted = this.monitoredFixtureIds.delete(String(fixtureId));
    if (deleted) {
      logger.info(`Removed fixture ${fixtureId} from monitoring. Remaining: ${this.monitoredFixtureIds.size}`);
    }
    return deleted;
  }

  /**
   * Replaces the entire monitored fixtures set.
   * @param {string[]} fixtureIds
   * @returns {number} number of fixtures added
   */
  setMonitoredMatches(fixtureIds) {
    this.monitoredFixtureIds.clear();
    const limited = fixtureIds.slice(0, config.monitoring.maxMonitoredMatches);
    limited.forEach((id) => this.monitoredFixtureIds.add(String(id)));
    logger.info(`Monitored fixtures set updated: ${this.monitoredFixtureIds.size} matches active.`);
    return this.monitoredFixtureIds.size;
  }

  /**
   * Returns list of currently monitored fixture IDs.
   * @returns {string[]}
   */
  getMonitoredFixtureIds() {
    return Array.from(this.monitoredFixtureIds);
  }

  /**
   * Starts the non-overlapping polling loop.
   */
  async start() {
    if (this.isRunning) {
      logger.warn('MonitoringManager is already running.');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting ESPN Football Live Monitor (Interval: ${config.monitoring.pollIntervalMs / 1000}s, Max Matches: ${config.monitoring.maxMonitoredMatches})`);
    this.scheduleNextCycle(100);
  }

  /**
   * Stops the monitoring loop gracefully.
   */
  stop() {
    this.isRunning = false;
    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }
    logger.info('MonitoringManager stopped.');
  }

  /**
   * Schedules the next polling cycle only after current cycle finishes.
   * @param {number} delayMs
   */
  scheduleNextCycle(delayMs = config.monitoring.pollIntervalMs) {
    if (!this.isRunning) return;
    this.pollTimeoutId = setTimeout(async () => {
      await this.runMonitoringCycle();
      if (this.isRunning) {
        this.scheduleNextCycle(config.monitoring.pollIntervalMs);
      }
    }, delayMs);
  }

  /**
   * Runs a single monitoring iteration across all monitored matches.
   */
  async runMonitoringCycle() {
    this.cycleCount++;
    this.lastPollTimestamp = new Date().toISOString();
    const fixtureIds = Array.from(this.monitoredFixtureIds);

    if (fixtureIds.length === 0) {
      logger.debug(`Polling cycle #${this.cycleCount}: No matches currently selected for monitoring.`);
      return;
    }

    logger.info(`[CYCLE #${this.cycleCount}] Polling ESPN data for ${fixtureIds.length} monitored matches...`);

    for (const fixtureId of fixtureIds) {
      try {
        await this.processMatch(fixtureId);
      } catch (err) {
        logger.error(`Error processing fixture ${fixtureId}: ${err.message}`);
      }
    }
  }

  /**
   * Processes a single match through the event comparison and publishing lifecycle.
   * Concurrency-protected via per-match locking.
   * @param {string} fixtureId
   */
  async processMatch(fixtureId) {
    return this.withMatchLock(fixtureId, async () => {
      const prevRecord = await db.getMatchRecord(fixtureId);
      const leagueSlug = prevRecord?.leagueSlug || 'eng.1';

      // 1. Fetch current normalized ESPN state
      const currentMatch = await fetchMatchDetails(fixtureId, leagueSlug, prevRecord);
      if (!currentMatch) {
        logger.warn(`Could not retrieve details for fixture ${fixtureId}; skipping this cycle.`);
        return;
      }

      // 2. Compare states and detect transitions/events
      const {
        newEvents,
        goalPostEdits,
        eventPostEdits,
        lineupPostAction,
        events: canonicalEvents,
        facebookPosts: canonicalFacebookPosts,
      } = compareMatchState(prevRecord, currentMatch);

      let lineupsPosted = Boolean(prevRecord?.lineupsPosted);
      let lineupPostId = prevRecord?.lineupPostId || null;

      // 3. Handle Starting Lineups
      if (lineupPostAction === 'PUBLISH' && !lineupsPosted) {
        const lineupMsg = formatLineupPost(currentMatch, currentMatch.lineups.home, currentMatch.lineups.away);
        logger.info(`Publishing official starting lineups for ${currentMatch.homeName} vs ${currentMatch.awayName}...`);
        lineupPostId = await this.withPostSpacing(async () => {
          return this.facebook.createPagePost(lineupMsg);
        });
        lineupsPosted = true;

        await db.saveMatchRecord(fixtureId, {
          ...currentMatch,
          lineupsPosted: true,
          lineupPostId,
          events: canonicalEvents,
          facebookPosts: canonicalFacebookPosts,
        });
      } else if (lineupPostAction === 'SKIP') {
        lineupsPosted = true;
      }

      // 4. ATOMIC SEQUENCE STEP 1: Persist pending events to DB BEFORE calling Facebook API
      if (newEvents.length > 0) {
        await db.saveMatchRecord(fixtureId, {
          matchId: fixtureId,
          fixtureId,
          homeName: currentMatch.homeName,
          awayName: currentMatch.awayName,
          homeTeam: currentMatch.homeName,
          awayTeam: currentMatch.awayName,
          leagueName: currentMatch.leagueName,
          leagueSlug: currentMatch.leagueSlug,
          lineupsPosted,
          lineupPostId,
          score: currentMatch.score,
          lastScore: currentMatch.score,
          status: currentMatch.status,
          lastStatus: currentMatch.status.state,
          lastPeriod: currentMatch.status.period,
          lastClock: currentMatch.status.clock,
          events: canonicalEvents,
          facebookPosts: canonicalFacebookPosts,
          eventStates: canonicalEvents,
        });
      }

      // 5. Publish New Events with duplicate pre-check and 30s - 1 min post spacing
      for (const ev of newEvents) {
        if (!isWhitelistedEvent(ev)) continue;

        // Disallowed goal protection: Never create a new post for a disallowed goal
        if (ev.type === 'GOAL_DISALLOWED' || ev.status === 'DISALLOWED' || ev.isDisallowed) {
          logger.warn(`[GOAL DISALLOWED PROTECTION] Blocked disallowed goal from creating a new post (${ev.eventId}).`);
          continue;
        }

        if (canonicalEvents[ev.eventId]?.status === 'DISALLOWED') {
          logger.warn(`[GOAL DISALLOWED PROTECTION] Event ${ev.eventId} is marked DISALLOWED in canonical state. Skipping publish.`);
          continue;
        }

        // PRE-CHECK 0: Red card lineup verification
        if (ev.type === 'RED_CARD') {
          const lineupList = [
            ...(currentMatch.lineups?.home || []),
            ...(currentMatch.lineups?.away || []),
            ...(currentMatch.lineups?.allHome || []),
            ...(currentMatch.lineups?.allAway || []),
            ...(currentMatch.lineups?.benchHome || []),
            ...(currentMatch.lineups?.benchAway || []),
          ];
          if (lineupList.length >= 7) {
            const matchedPlayer = findMatchingLineupPlayer(ev.player, lineupList);
            if (!matchedPlayer) {
              logger.warn(`[RED CARD REJECTED] Player "${ev.player}" is not in the match lineup for ${currentMatch.homeName} vs ${currentMatch.awayName}. Skipping publish.`);
              continue;
            }
            ev.player = matchedPlayer;
          }
        }

        // PRE-CHECK 1: Check if Facebook post already exists for this exact event
        const existingPostId =
          canonicalEvents[ev.eventId]?.facebookPostId ||
          Object.values(canonicalFacebookPosts || {}).find((p) => p.eventId === ev.eventId)?.postId ||
          Object.values(prevRecord?.facebookPosts || {}).find((p) => p.eventId === ev.eventId)?.postId;

        if (existingPostId) {
          logger.warn(`[DUPLICATE PROTECTION] Facebook post already exists (${existingPostId}) for event ${ev.eventId}. Skipping.`);
          continue;
        }

        // PRE-CHECK 1b: For goal events, ensure no post has already been made about this particular goal
        if (ev.type === 'GOAL' || ev.type === 'PENALTY_SCORED' || ev.type === 'OWN_GOAL') {
          const alreadyPostedGoal = Object.values(canonicalEvents).find((e) =>
            e.eventId !== ev.eventId &&
            (e.type === 'GOAL' || e.type === 'PENALTY_SCORED' || e.type === 'OWN_GOAL') &&
            e.facebookPostId &&
            e.status !== 'DISALLOWED' &&
            !e.isDisallowed &&
            ((e.scoreAfterEvent && ev.scoreAfterEvent && e.scoreAfterEvent.home === ev.scoreAfterEvent.home && e.scoreAfterEvent.away === ev.scoreAfterEvent.away && (ev.scoreAfterEvent.home > 0 || ev.scoreAfterEvent.away > 0)) ||
             (e.player && ev.player && String(e.player).toLowerCase().trim() === String(ev.player).toLowerCase().trim() && Math.abs((e.minute || 0) - (ev.minute || 0)) <= 3))
          );
          if (alreadyPostedGoal) {
            logger.warn(`[DUPLICATE GOAL PROTECTION] A post has already been made (${alreadyPostedGoal.facebookPostId}) for this goal. Skipping new post.`);
            continue;
          }
        }

        // PRE-CHECK 2: Special single-occurrence lifecycle events per match (HALF_TIME, KICKOFF, FULL_TIME)
        if (ev.type === 'HALF_TIME') {
          const alreadyHasHtPost =
            Boolean(canonicalEvents[`${fixtureId}:HALF_TIME`]?.facebookPostId) ||
            Object.values(canonicalFacebookPosts || {}).some((p) => p.type === 'HALF_TIME' || p.eventId?.endsWith(':HALF_TIME')) ||
            Object.values(prevRecord?.facebookPosts || {}).some((p) => p.type === 'HALF_TIME' || p.eventId?.endsWith(':HALF_TIME'));

          if (alreadyHasHtPost) {
            logger.warn(`[DUPLICATE PROTECTION] Half-time post already exists for match ${fixtureId}. Skipping duplicate publish.`);
            continue;
          }
        }

        if (ev.type === 'KICKOFF') {
          const alreadyHasKickoffPost =
            Boolean(canonicalEvents[`${fixtureId}:KICKOFF`]?.facebookPostId) ||
            Object.values(canonicalFacebookPosts || {}).some((p) => p.type === 'KICKOFF' || p.eventId?.endsWith(':KICKOFF')) ||
            Object.values(prevRecord?.facebookPosts || {}).some((p) => p.type === 'KICKOFF' || p.eventId?.endsWith(':KICKOFF'));

          if (alreadyHasKickoffPost) {
            logger.warn(`[DUPLICATE PROTECTION] Kickoff post already exists for match ${fixtureId}. Skipping duplicate publish.`);
            continue;
          }
        }

        if (ev.type === 'FULL_TIME') {
          const alreadyHasFtPost =
            Boolean(canonicalEvents[`${fixtureId}:FULL_TIME`]?.facebookPostId) ||
            Object.values(canonicalFacebookPosts || {}).some((p) => p.type === 'FULL_TIME' || p.eventId?.endsWith(':FULL_TIME')) ||
            Object.values(prevRecord?.facebookPosts || {}).some((p) => p.type === 'FULL_TIME' || p.eventId?.endsWith(':FULL_TIME'));

          if (alreadyHasFtPost) {
            logger.warn(`[DUPLICATE PROTECTION] Full-time post already exists for match ${fixtureId}. Skipping duplicate publish.`);
            continue;
          }
        }

        // GOAL RESOLUTION DELAY:
        // Delay ~10 seconds to determine whether scorer and assist names are resolved before posting
        const isGoalType = ev.type === 'GOAL' || ev.type === 'PENALTY_SCORED' || ev.type === 'OWN_GOAL';
        if (isGoalType) {
          const goalDelayMs = config.monitoring?.goalResolutionDelayMs !== undefined
            ? config.monitoring.goalResolutionDelayMs
            : (config.goalResolutionDelayMs !== undefined ? config.goalResolutionDelayMs : 10000);

          if (goalDelayMs > 0) {
            logger.info(`[GOAL RESOLUTION DELAY] Goal scored in ${currentMatch.homeName} vs ${currentMatch.awayName} (${ev.eventId}). Delaying for ${goalDelayMs / 1000}s to know whether scorer and assist names resolve...`);
            await new Promise((resolve) => setTimeout(resolve, goalDelayMs));
          }

          // After delay: Re-check whether scorer and assist names have resolved from ESPN
          try {
            const refreshedMatch = await fetchMatchDetails(fixtureId, leagueSlug, prevRecord);
            if (refreshedMatch?.events?.length > 0) {
              const resolvedGoal = refreshedMatch.events.find((re) =>
                (re.type === ev.type || (ev.type === 'GOAL' && (re.type === 'OWN_GOAL' || re.type === 'PENALTY_SCORED')) || re.type === 'GOAL_DISALLOWED') &&
                ((re.id && ev.rawId && String(re.id) === String(ev.rawId)) ||
                 (re.scoreAfterEvent && ev.scoreAfterEvent && re.scoreAfterEvent.home === ev.scoreAfterEvent.home && re.scoreAfterEvent.away === ev.scoreAfterEvent.away) ||
                 (Math.abs((re.minute || 0) - (ev.minute || 0)) <= 2 && (!re.teamId || !ev.teamId || String(re.teamId) === String(ev.teamId))))
              );

              if (resolvedGoal) {
                // If disallowed during delay, do not publish
                if (resolvedGoal.type === 'GOAL_DISALLOWED' || resolvedGoal.status === 'DISALLOWED' || resolvedGoal.isDisallowed) {
                  logger.warn(`[GOAL RESOLUTION] Goal ${ev.eventId} was disallowed during delay. Skipping publish.`);
                  canonicalEvents[ev.eventId] = {
                    ...canonicalEvents[ev.eventId],
                    status: 'DISALLOWED',
                    isDisallowed: true,
                  };
                  continue;
                }

                if (resolvedGoal.player && !ev.player) {
                  logger.info(`[GOAL RESOLUTION] Scorer name resolved after delay: "${resolvedGoal.player}"`);
                  ev.player = resolvedGoal.player;
                }
                if (resolvedGoal.assist && !ev.assist && ev.type !== 'PENALTY_SCORED') {
                  logger.info(`[GOAL RESOLUTION] Assist name resolved after delay: "${resolvedGoal.assist}"`);
                  ev.assist = resolvedGoal.assist;
                }
                if (resolvedGoal.ownGoal && !ev.ownGoal) {
                  ev.ownGoal = true;
                  ev.type = 'OWN_GOAL';
                }
                if (resolvedGoal.scoreAfterEvent) {
                  ev.scoreAfterEvent = resolvedGoal.scoreAfterEvent;
                }
                if (refreshedMatch.score) {
                  currentMatch.score = refreshedMatch.score;
                }

                if (canonicalEvents[ev.eventId]) {
                  canonicalEvents[ev.eventId].player = ev.player;
                  canonicalEvents[ev.eventId].assist = ev.assist;
                  canonicalEvents[ev.eventId].ownGoal = ev.ownGoal;
                  canonicalEvents[ev.eventId].scoreAfterEvent = ev.scoreAfterEvent;
                }
              }
            }
          } catch (err) {
            logger.warn(`[GOAL RESOLUTION] Error verifying resolved names after delay: ${err.message}`);
          }
        }

        const postMsg = formatEventPost(ev, currentMatch);
        logger.info(`Publishing new event: [${ev.type}] (${ev.eventId}) for ${currentMatch.homeName} vs ${currentMatch.awayName}`);

        // Enforce 1-2 min post separation between any posts
        const postId = await this.withPostSpacing(async () => {
          return this.facebook.createPagePost(postMsg);
        });

        if (postId) {
          const postedAt = new Date().toISOString();
          const earliestUpdateAt = calculateScheduledUpdateTime(postedAt);

          // Finalize event status and store Facebook post ID
          canonicalEvents[ev.eventId] = {
            ...canonicalEvents[ev.eventId],
            facebookPostId: postId,
            status: 'VALID',
            postedAt,
          };

          canonicalFacebookPosts[postId] = {
            postId,
            eventId: ev.eventId,
            type: ev.type,
            createdAt: postedAt,
            earliestUpdateAt,
          };

          // ATOMIC STEP 2: Persist Facebook post ID immediately
          await db.recordFacebookPost(fixtureId, postId, ev.eventId, ev.type, {
            createdAt: postedAt,
            earliestUpdateAt,
          });
        }
      }

      // 6. Apply Post Edits with 2–5 min delay protection
      const editsToApply = eventPostEdits?.length > 0 ? eventPostEdits : (goalPostEdits || []);
      for (const edit of editsToApply) {
        if (!edit.postId) continue;

        // User explicit rule: Stop editing goal posts created even if assists name is resolved
        // EXCEPTION: Update goal if the event that came in after goal is goal disallowed!
        const isGoalType = edit.event?.type === 'GOAL' || edit.event?.type === 'OWN_GOAL' || edit.event?.type === 'PENALTY_SCORED';
        const isDisallowedEdit = Boolean(
          edit.isDisallowed ||
          edit.event?.isDisallowed ||
          edit.event?.status === 'DISALLOWED' ||
          edit.type === 'GOAL_DISALLOWED' ||
          edit.event?.type === 'GOAL_DISALLOWED'
        );
        if (isGoalType && !isDisallowedEdit) {
          logger.info(`[GOAL EDIT DISABLED] Post ${edit.postId} for goal ${edit.eventId} will not be updated on Facebook (assists/details resolved). Goal posts are immutable.`);
          continue;
        }

        const postRecord = canonicalFacebookPosts[edit.postId] || prevRecord?.facebookPosts?.[edit.postId];
        if (postRecord) {
          registerPostSchedule(postRecord);
        }

        // Disallowed goal edits MUST apply immediately to edit the existing goal post without 2-5 min waiting delay
        if (postRecord && !isDisallowedEdit && !isUpdateAllowed(postRecord)) {
          queuePendingUpdate(postRecord, edit);
          continue;
        }

        const updatedMsg = formatEventPost(edit.event, currentMatch);
        logger.info(`Updating Facebook post ${edit.postId} (${edit.eventId}) with newly resolved details (isDisallowed=${isDisallowedEdit})...`);
        const success = await this.facebook.updatePagePost(edit.postId, updatedMsg);

        if (success && edit.eventId && canonicalEvents[edit.eventId]) {
          canonicalEvents[edit.eventId].lastContentSignature = edit.newContentSig;
          if (isDisallowedEdit) {
            canonicalEvents[edit.eventId].status = 'DISALLOWED';
            canonicalEvents[edit.eventId].isDisallowed = true;
          }
          if (postRecord) {
            delete postRecord.pendingUpdate;
            if (isDisallowedEdit) {
              postRecord.status = 'DISALLOWED';
            }
          }
          await db.saveMatchEvent(fixtureId, edit.eventId, canonicalEvents[edit.eventId]);
        }
      }

      // 6b. Process any held pending updates whose 2–5 min delay has now elapsed
      for (const postRecord of Object.values(canonicalFacebookPosts)) {
        if (!postRecord?.pendingUpdate) continue;

        const pending = postRecord.pendingUpdate;
        const isGoalType = pending.event?.type === 'GOAL' || pending.event?.type === 'OWN_GOAL' || pending.event?.type === 'PENALTY_SCORED';
        const isDisallowedPending = Boolean(
          pending.isDisallowed ||
          pending.event?.isDisallowed ||
          pending.event?.status === 'DISALLOWED' ||
          pending.type === 'GOAL_DISALLOWED' ||
          pending.event?.type === 'GOAL_DISALLOWED'
        );
        if (isGoalType && !isDisallowedPending) {
          logger.info(`[GOAL EDIT DISABLED] Dropping pending edit for goal post ${postRecord.postId}.`);
          delete postRecord.pendingUpdate;
          continue;
        }

        registerPostSchedule(postRecord);

        if (isUpdateAllowed(postRecord)) {
          const updatedMsg = formatEventPost(pending.event, currentMatch);
          logger.info(`[UPDATE SCHEDULER] Post ${postRecord.postId} (${pending.eventId}) waiting window (2–5 min) has elapsed. Applying scheduled update...`);
          const success = await this.facebook.updatePagePost(postRecord.postId, updatedMsg);

          if (success) {
            if (pending.eventId && canonicalEvents[pending.eventId]) {
              canonicalEvents[pending.eventId].lastContentSignature = pending.newContentSig;
              if (pending.isDisallowed) {
                canonicalEvents[pending.eventId].status = 'DISALLOWED';
              }
              await db.saveMatchEvent(fixtureId, pending.eventId, canonicalEvents[pending.eventId]);
            }
            delete postRecord.pendingUpdate;
          }
        }
      }

      // 7. Persist Final Canonical Match State
      const postedEventsList = Object.values(canonicalEvents)
        .filter((e) => e.facebookPostId || e.status === 'VALID' || e.status === 'POSTED')
        .map((e) => e.eventId);

      const goalPostsMap = {};
      for (const e of Object.values(canonicalEvents)) {
        if ((e.type === 'GOAL' || e.type === 'PENALTY_SCORED' || e.type === 'OWN_GOAL') && e.facebookPostId) {
          const key = e.goalKey || `${e.minute}:${e.scoreAfterEvent?.home}-${e.scoreAfterEvent?.away}`;
          goalPostsMap[key] = {
            postId: e.facebookPostId,
            scorer: e.player || null,
            assist: e.assist || null,
          };
        }
      }

      await db.saveMatchRecord(fixtureId, {
        matchId: fixtureId,
        fixtureId,
        homeId: currentMatch.homeId,
        awayId: currentMatch.awayId,
        homeName: currentMatch.homeName,
        awayName: currentMatch.awayName,
        homeTeam: currentMatch.homeName,
        awayTeam: currentMatch.awayName,
        leagueName: currentMatch.leagueName,
        leagueSlug: currentMatch.leagueSlug,
        lineupsPosted,
        lineupPostId,
        score: currentMatch.score,
        lastScore: currentMatch.score,
        status: currentMatch.status,
        lastStatus: currentMatch.status.state,
        lastPeriod: currentMatch.status.period,
        lastClock: currentMatch.status.clock,
        events: canonicalEvents,
        facebookPosts: canonicalFacebookPosts,
        // Backward-compatibility properties
        eventStates: canonicalEvents,
        postedEvents: postedEventsList,
        goalPosts: goalPostsMap,
      });

      // 8. Full-time retirement handling: retire after 3 grace cycles
      if (currentMatch.status.state === 'post') {
        const count = (this.fullTimeGraceCycles.get(fixtureId) || 0) + 1;
        this.fullTimeGraceCycles.set(fixtureId, count);
        if (count >= 3) {
          logger.info(`Match ${currentMatch.homeName} vs ${currentMatch.awayName} has completed (Full-Time grace period elapsed). Removing from active polling.`);
          this.monitoredFixtureIds.delete(fixtureId);
        }
      }
    });
  }
}

export const monitoringManager = new MonitoringManager();
export default monitoringManager;
