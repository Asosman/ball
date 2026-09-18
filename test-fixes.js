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

console.log('====================================================');
console.log('  🎉 ALL 4 TESTS PASSED! ALL FIXES VERIFIED.');
console.log('====================================================\n');
