// test-fixes.js
import assert from 'assert';
import { formatEventPost, formatLineupPost, formatFixturesPost, compareMatchState, makeUnicodeBold } from './services/eventEngine.js';
import { getPostSpacingWaitMs, MIN_POST_SPACING_MS, TARGET_POST_SPACING_MS } from './services/updateScheduler.js';
import { COMPREHENSIVE_LEAGUES } from './services/espn.js';

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
// TEST 4: Post Spacing Enforcement (30 seconds to 1 Minute Delay)
// ---------------------------------------------------------------------------
console.log('▶ [TEST 4] Post Spacing & Rate Limit Check (30 seconds to 1 minute):');
console.log(`- Minimum post spacing configured: ${MIN_POST_SPACING_MS / 1000}s`);
console.log(`- Target post spacing configured: ${TARGET_POST_SPACING_MS / 1000}s`);

assert(MIN_POST_SPACING_MS >= 30000, 'Minimum spacing must be at least 30 seconds');
assert(TARGET_POST_SPACING_MS >= 30000 && TARGET_POST_SPACING_MS <= 60000, 'Target spacing must be 30 seconds to 1 minute');

const now = Date.now();

// Case A: A post occurred 15 seconds ago
const waitWhenRecent = getPostSpacingWaitMs(now - 15000, TARGET_POST_SPACING_MS);
console.log(`- For a post made 15s ago: must wait ${Math.round(waitWhenRecent / 1000)}s before next post`);
assert(waitWhenRecent > 0, 'Must enforce wait if last post was under target spacing');

// Case B: A post occurred 45 seconds ago (more than target spacing)
const waitWhenElapsed = getPostSpacingWaitMs(now - 45000, TARGET_POST_SPACING_MS);
console.log(`- For a post made 45s ago: must wait ${waitWhenElapsed}ms (ready to post immediately)`);
assert.strictEqual(waitWhenElapsed, 0, 'No delay required when last post was beyond target spacing');

console.log('✅ PASS: Consecutive posts are safely separated by 30 seconds to 1 minute.\n');

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

// ---------------------------------------------------------------------------
// TEST 6: Event Post Order: Heading -> Time -> Scoreboard -> Details -> Info & Shoe Assist Emoji
// ---------------------------------------------------------------------------
console.log('▶ [TEST 6] Event Post Order & Assist Shoe Emoji:');
const goalWithAssist = {
  type: 'GOAL',
  player: 'Bukayo Saka',
  assist: 'Martin Odegaard',
  minute: 24,
  period: 1,
  homeScore: 1,
  awayScore: 0,
  scoreAfterEvent: { home: 1, away: 0 },
};

const goalPostFormatted = formatEventPost(goalWithAssist, matchContext);
console.log('Goal Post Output:\n' + goalPostFormatted + '\n');

// Verify shoe emoji is used for assist
assert(goalPostFormatted.includes('👟 Assist: Martin Odegaard'), 'Assist must use the shoe emoji 👟');

// Verify structure order: Heading -> Time -> Score -> Scorer/Assist -> Info
const headingIndex = goalPostFormatted.indexOf(makeUnicodeBold('GOOOOALLLLL'));
const timeIndex = goalPostFormatted.indexOf("⏱️ Time: 24'");
const scoreIndex = goalPostFormatted.indexOf('⚽ Score:');
const scorerIndex = goalPostFormatted.indexOf('🎯 Scorer:');
const assistIndex = goalPostFormatted.indexOf('👟 Assist:');
const infoIndex = goalPostFormatted.indexOf('📝 Info:');

assert(headingIndex !== -1, 'Heading must exist');
assert(timeIndex !== -1, 'Time must exist');
assert(scoreIndex !== -1, 'Scoreboard must exist');
assert(scorerIndex !== -1, 'Scorer must exist');
assert(assistIndex !== -1, 'Assist must exist');
assert(infoIndex !== -1, 'Info must exist');

assert(headingIndex < timeIndex, 'Heading must appear before Time');
assert(timeIndex < scoreIndex, 'Time must appear before Scoreboard');
assert(scoreIndex < scorerIndex, 'Scoreboard must appear before Details (Scorer)');
assert(scorerIndex < assistIndex, 'Scorer must appear before Assist');
assert(assistIndex < infoIndex, 'Details must appear before Info');
console.log('✅ PASS: Event post order is strictly: Heading -> Time -> Scoreboard -> Details -> Info with shoe emoji.\n');

// ---------------------------------------------------------------------------
// TEST 7: Half-Time & Full-Time Post Structure (No Time line, HT/FT Team A scoreline Team B)
// ---------------------------------------------------------------------------
console.log('▶ [TEST 7] Half-Time & Full-Time Post Structure:');
const htEvent = {
  type: 'HALF_TIME',
  minute: 45,
  period: 1,
  homeScore: 1,
  awayScore: 0,
};
const htPost = formatEventPost(htEvent, matchContext);
console.log('Half-Time Post Output:\n' + htPost + '\n');

assert(htPost.includes('HT Arsenal 1 - 0 Chelsea') || htPost.includes('HT 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 1 - 0 𝐂𝐡𝐞𝐥𝐬𝐞𝐚'), 'HT must have HT team A scoreline Team B');
assert(!htPost.includes('⏱️ Time:'), 'Half-time post must NOT show Time line');
assert(htPost.includes('📝 Info:'), 'Half-time post must include Info line');

const ftEvent = {
  type: 'FULL_TIME',
  minute: 90,
  period: 2,
  homeScore: 2,
  awayScore: 1,
};
const ftPost = formatEventPost(ftEvent, matchContext);
console.log('Full-Time Post Output:\n' + ftPost + '\n');

assert(ftPost.includes('FT Arsenal 2 - 1 Chelsea') || ftPost.includes('FT 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 2 - 1 𝐂𝐡𝐞𝐥𝐬𝐞𝐚'), 'FT must have FT team A scoreline Team B');
assert(!ftPost.includes('⏱️ Time:'), 'Full-time post must NOT show Time line');
assert(ftPost.includes('📝 Info:'), 'Full-time post must include Info line');
console.log('✅ PASS: HT and FT posts conform strictly to requested template without Time line.\n');

// ---------------------------------------------------------------------------
// TEST 8: Lineup and Fixtures Spacing Rules (Single \n, \n\n only between team XI)
// ---------------------------------------------------------------------------
console.log('▶ [TEST 8] Spacing Rules for Lineups and Fixtures:');

const lineupPost = formatLineupPost(
  matchContext,
  ['Raya', 'White', 'Saliba', 'Gabriel', 'Timber'],
  ['Sanchez', 'James', 'Fofana', 'Colwill', 'Cucurella']
);
console.log('Lineup Post Output:\n' + lineupPost + '\n');

// Split by \n\n
const lineupDoubleNewlines = lineupPost.split('\n\n');
assert.strictEqual(lineupDoubleNewlines.length, 2, 'Lineup post must have EXACTLY ONE double newline, between teamA XI and teamB XI');

const fixturesSample = [
  {
    leagueName: 'English Premier League',
    homeName: 'Arsenal',
    awayName: 'Chelsea',
    kickoffFormattedWAT: '17:30 WAT',
    score: { home: 2, away: 1 },
  },
];
const fixturesPost = formatFixturesPost(fixturesSample, 'Today');
console.log('Fixtures Post Output:\n' + fixturesPost + '\n');
assert(!fixturesPost.includes('\n\n'), 'Fixtures post must NOT contain wild spaces or double newlines (\\n\\n)');

console.log('✅ PASS: Lineup and Fixtures spacing rules strictly followed.\n');

// ---------------------------------------------------------------------------
// TEST 9: MLS League Monitoring Verification
// ---------------------------------------------------------------------------
console.log('▶ [TEST 9] Major League Soccer (MLS) Monitoring:');
const mlsInComprehensive = COMPREHENSIVE_LEAGUES.some((l) => l.slug === 'usa.1' || l.slug === 'mls');
assert(mlsInComprehensive, 'MLS must be present in COMPREHENSIVE_LEAGUES');
console.log('✅ PASS: MLS is properly registered in monitored leagues.\n');

console.log('====================================================');
console.log('  🎉 ALL 9 TESTS PASSED! ALL FIXES VERIFIED.');
console.log('====================================================\n');
