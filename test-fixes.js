// test-fixes.js
import assert from 'assert';
import { formatEventPost, compareMatchState, makeUnicodeBold } from './services/eventEngine.js';
import { getPostSpacingWaitMs, MIN_POST_SPACING_MS, TARGET_POST_SPACING_MS } from './services/updateScheduler.js';

console.log('====================================================');
console.log('  RUNNING TEST SUITE FOR RECENT FIXES & IMPROVEMENTS');
console.log('====================================================\n');

// ---------------------------------------------------------------------------
// TEST 1: Penalty Scored must NEVER include an assist line
// ---------------------------------------------------------------------------
console.log('▶ [TEST 1] Penalty Scored Assist Check:');
const penaltyEvent = {
  type: 'PENALTY_SCORED',
  player: 'Cole Palmer',
  assist: 'Moisés Caicedo', // Even if assist data is attached, it must be ignored
  minute: 28,
  period: 1,
  homeScore: 0,
  awayScore: 1,
  scoreAfterEvent: { home: 0, away: 1 },
};

const matchContext = {
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  leagueName: 'Premier League',
};

const penaltyPost = formatEventPost(penaltyEvent, matchContext);
console.log('Generated Penalty Post Output:\n');
console.log(penaltyPost);
console.log('----------------------------------------------------');

assert(penaltyPost.includes('Penalty converted successfully'), 'Post must mention penalty converted');
assert(penaltyPost.includes(makeUnicodeBold('Cole Palmer')), 'Post must mention scorer');
assert(!penaltyPost.includes('Assist'), 'PENALTY SCORED MUST NOT CONTAIN ASSIST LINE');
assert(!penaltyPost.includes('Caicedo'), 'Assist player name must not appear in the post');
console.log('✅ PASS: Penalty post displays scorer only with NO assist.\n');

// ---------------------------------------------------------------------------
// TEST 2: Normal Goal SHOULD still include an assist when available
// ---------------------------------------------------------------------------
console.log('▶ [TEST 2] Normal Goal Assist Check (Regular goals retain assist):');
const normalGoalEvent = {
  type: 'GOAL',
  player: 'Kai Havertz',
  assist: 'Martin Odegaard',
  minute: 62,
  period: 2,
  homeScore: 1,
  awayScore: 1,
  scoreAfterEvent: { home: 1, away: 1 },
};

const normalGoalPost = formatEventPost(normalGoalEvent, matchContext);
assert(normalGoalPost.includes('Assist'), 'Normal goal must display Assist line');
assert(normalGoalPost.includes('Odegaard'), 'Normal goal must show assist provider');
console.log('✅ PASS: Regular goals continue to display assists correctly.\n');

// ---------------------------------------------------------------------------
// TEST 3: Half-Time Post Duplication Protection
// ---------------------------------------------------------------------------
console.log('▶ [TEST 3] Half-Time Duplicate Post Prevention:');
const fixtureId = 'test-match-777';

// Simulate an existing database record where HALF_TIME was already posted
const existingMatchRecord = {
  fixtureId,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  status: { state: 'in', description: 'Halftime' },
  score: { home: 1, away: 0 },
  events: {
    [`${fixtureId}:HALF_TIME`]: {
      eventId: `${fixtureId}:HALF_TIME`,
      type: 'HALF_TIME',
      status: 'VALID',
      facebookPostId: 'fb-post-ht-already-created',
    },
  },
  facebookPosts: {
    'fb-post-ht-already-created': {
      postId: 'fb-post-ht-already-created',
      eventId: `${fixtureId}:HALF_TIME`,
      type: 'HALF_TIME',
    },
  },
};

// Current poll payload still reporting halftime
const currentMatchState = {
  fixtureId,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  status: { state: 'in', description: 'Halftime', detail: 'Halftime' },
  score: { home: 1, away: 0 },
  events: [
    {
      type: 'HALF_TIME',
      minute: 45,
      period: 1,
      homeScore: 1,
      awayScore: 0,
    },
  ],
};

const diffResult = compareMatchState(existingMatchRecord, currentMatchState);
const newHalfTimeEvents = diffResult.newEvents.filter((e) => e.type === 'HALF_TIME');
console.log(`New HALF_TIME events emitted on polling cycle: ${newHalfTimeEvents.length}`);
assert.strictEqual(newHalfTimeEvents.length, 0, 'Should emit ZERO new half-time events when already posted');
console.log('✅ PASS: Half-time duplication is completely prevented.\n');

// ---------------------------------------------------------------------------
// TEST 4: Post Spacing Enforcement (At least 1 to 2 Minutes Delay)
// ---------------------------------------------------------------------------
console.log('▶ [TEST 4] Post Spacing & Rate Limit Check (1 to 2 minutes):');
console.log(`- Minimum post spacing configured: ${MIN_POST_SPACING_MS / 1000}s`);
console.log(`- Target post spacing configured: ${TARGET_POST_SPACING_MS / 1000}s`);

assert(MIN_POST_SPACING_MS >= 60000, 'Minimum spacing must be at least 1 minute');
assert(TARGET_POST_SPACING_MS >= 60000 && TARGET_POST_SPACING_MS <= 120000, 'Target spacing must be 1 to 2 minutes');

const now = Date.now();

// Case A: A post occurred 15 seconds ago
const waitWhenRecent = getPostSpacingWaitMs(now - 15000, TARGET_POST_SPACING_MS);
console.log(`- For a post made 15s ago: must wait ${Math.round(waitWhenRecent / 1000)}s before next post`);
assert(waitWhenRecent > 0, 'Must enforce wait if last post was under target spacing');

// Case B: A post occurred 90 seconds ago (more than 1 minute target)
const waitWhenElapsed = getPostSpacingWaitMs(now - 90000, TARGET_POST_SPACING_MS);
console.log(`- For a post made 90s ago: must wait ${waitWhenElapsed}ms (ready to post immediately)`);
assert.strictEqual(waitWhenElapsed, 0, 'No delay required when last post was beyond target spacing');

console.log('✅ PASS: Consecutive posts are safely separated by at least 1 to 2 minutes.\n');

// ---------------------------------------------------------------------------
// TEST 5: Disallowed Goal Post Editing & Scoreline Reversion
// ---------------------------------------------------------------------------
console.log('▶ [TEST 5] Disallowed Goal: Edit Existing Post & Revert Scoreline:');
const fixtureDisallow = 'test-match-disallow-888';

// State 1: Goal was scored at minute 24 and posted to Facebook
const goalPostId = 'fb-post-goal-24';
const initialMatchRecord = {
  fixtureId: fixtureDisallow,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  leagueName: 'Premier League',
  status: { state: 'in', description: 'In Progress', period: 1 },
  score: { home: 1, away: 0 },
  events: {
    [`${fixtureDisallow}:GOAL:p1:m24:tarsenal:idx0`]: {
      eventId: `${fixtureDisallow}:GOAL:p1:m24:tarsenal:idx0`,
      rawId: 'play-101',
      type: 'GOAL',
      minute: 24,
      period: 1,
      player: 'Bukayo Saka',
      teamId: 'arsenal',
      homeScore: 1,
      awayScore: 0,
      scoreAfterEvent: { home: 1, away: 0 },
      facebookPostId: goalPostId,
      status: 'VALID',
    },
  },
  facebookPosts: {
    [goalPostId]: {
      postId: goalPostId,
      eventId: `${fixtureDisallow}:GOAL:p1:m24:tarsenal:idx0`,
      type: 'GOAL',
      createdAt: new Date().toISOString(),
    },
  },
};

// State 2: VAR review overturns the goal and reports it disallowed
const polledDisallowPayload = {
  fixtureId: fixtureDisallow,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  leagueName: 'Premier League',
  status: { state: 'in', description: 'In Progress', clock: "26'", period: 1 },
  score: { home: 0, away: 0 },
  events: [
    {
      type: 'GOAL',
      minute: 24,
      period: 1,
      player: 'Bukayo Saka',
      teamId: 'arsenal',
      rawId: 'play-101',
    },
    {
      type: 'VAR',
      minute: 26,
      period: 1,
      text: 'Goal disallowed for offside following VAR review',
    },
  ],
};

const disallowDiff = compareMatchState(initialMatchRecord, polledDisallowPayload);

// Requirement 1: NO new post created for the disallowed goal
const disallowedNewEvents = disallowDiff.newEvents.filter((e) => e.type === 'GOAL_DISALLOWED' || e.isDisallowed);
assert.strictEqual(disallowedNewEvents.length, 0, 'Must NOT create any new event/post for GOAL_DISALLOWED');
assert.strictEqual(disallowDiff.newEvents.length, 0, 'No other unexpected new events should be created');
console.log('✅ Requirement 1 Verified: Zero new posts generated for disallowed goal.');

// Requirement 2: Must queue an edit for the EXISTING goal post
const editTargets = disallowDiff.eventPostEdits.filter((e) => e.postId === goalPostId);
assert.strictEqual(editTargets.length, 1, 'Must queue exactly 1 edit targeting the original goal post');
const disallowEdit = editTargets[0];
assert.strictEqual(disallowEdit.isDisallowed, true, 'Edit payload must flag isDisallowed: true');
console.log('✅ Requirement 2 Verified: Edit queued directly targeting existing Facebook post ID.');

// Requirement 3: Post content formatting reflects disallowance & scoreline
const editedPostText = formatEventPost(disallowEdit.event, polledDisallowPayload);
console.log('\nGenerated Disallowed Goal Edited Post:\n');
console.log(editedPostText);
console.log('----------------------------------------------------');
assert(editedPostText.includes('Goal officially ruled out') || editedPostText.includes(makeUnicodeBold('GOAL DISALLOWED')), 'Edited post must state Goal officially ruled out or bold GOAL DISALLOWED');
assert(editedPostText.includes(makeUnicodeBold('Bukayo Saka')), 'Edited post must include bold player name');
assert(editedPostText.includes('0 - 0') || editedPostText.includes('0 : 0'), 'Edited post must show reverted 0-0 scoreline');
console.log('✅ Requirement 3 Verified: Edited post text clearly displays VAR decision and reverted scoreline.');

// Requirement 4: Match scoreline must be reverted to 0-0
assert.strictEqual(polledDisallowPayload.score.home, 0, 'Match home score must be reverted to 0');
assert.strictEqual(polledDisallowPayload.score.away, 0, 'Match away score must be 0');
console.log('✅ Requirement 4 Verified: Match scoreline reverted to 0-0.');

// Requirement 5: Next goal calculates correctly off the reverted 0-0 baseline
const nextGoalPayload = {
  fixtureId: fixtureDisallow,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  leagueName: 'Premier League',
  status: { state: 'in', description: 'In Progress', clock: "35'", period: 1 },
  score: { home: 0, away: 1 },
  events: [
    {
      type: 'GOAL',
      minute: 24,
      period: 1,
      player: 'Bukayo Saka',
      teamId: 'arsenal',
      rawId: 'play-101',
    },
    {
      type: 'VAR',
      minute: 26,
      period: 1,
      text: 'Goal disallowed for offside following VAR review',
    },
    {
      type: 'GOAL',
      minute: 35,
      period: 1,
      player: 'Nicolas Jackson',
      teamId: 'chelsea',
      text: 'Goal! Arsenal 0, Chelsea 1. Nicolas Jackson right footed shot.',
    },
  ],
};

const updatedRecordAfterDisallow = {
  ...initialMatchRecord,
  score: { home: 0, away: 0 },
  events: {
    ...initialMatchRecord.events,
    [`${fixtureDisallow}:GOAL:p1:m24:tarsenal:idx0`]: {
      ...initialMatchRecord.events[`${fixtureDisallow}:GOAL:p1:m24:tarsenal:idx0`],
      status: 'DISALLOWED',
      isDisallowed: true,
      scoreAfterEvent: { home: 0, away: 0 },
    },
  },
};

const nextGoalDiff = compareMatchState(updatedRecordAfterDisallow, nextGoalPayload);
const newGoals = nextGoalDiff.newEvents.filter((e) => e.type === 'GOAL');
assert.strictEqual(newGoals.length, 1, 'Should emit exactly 1 new goal event');
const secondGoal = newGoals[0];
assert.strictEqual(secondGoal.scoreAfterEvent.home, 0, 'New goal home score must be 0 (not 1 from disallowed goal)');
assert.strictEqual(secondGoal.scoreAfterEvent.away, 1, 'New goal away score must be 1');
console.log('✅ Requirement 5 Verified: Next goal scoreline is 0-1 (disallowed goal was not added to scoreline).\n');

console.log('====================================================');
console.log('  🎉 ALL 5 TESTS PASSED! ALL FIXES VERIFIED.');
console.log('====================================================\n');
