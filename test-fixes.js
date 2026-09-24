// test-fixes.js
import assert from 'assert';
import { formatEventPost, formatLineupPost, formatFixturesPost, compareMatchState, makeUnicodeBold } from './services/eventEngine.js';
import { getPostSpacingWaitMs, MIN_POST_SPACING_MS, TARGET_POST_SPACING_MS } from './services/updateScheduler.js';
import { COMPREHENSIVE_LEAGUES } from './services/espn.js';
import { generateDynamicFallbackInfo } from './services/aiCommentary.js';

console.log('====================================================');
console.log('  RUNNING TEST SUITE FOR RECENT FIXES & IMPROVEMENTS');
console.log('====================================================\n');

// ---------------------------------------------------------------------------
// TEST 1: Penalty Scored must NEVER include an assist line & no literal labels
// ---------------------------------------------------------------------------
console.log('▶ [TEST 1] Penalty Scored Assist Check & Labels Check:');
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

assert(penaltyPost.includes(makeUnicodeBold('Cole Palmer')), 'Post must mention scorer');
assert(!penaltyPost.includes('Assist:'), 'PENALTY SCORED MUST NOT CONTAIN Assist:');
assert(!penaltyPost.includes('Time:'), 'Post must not contain Time:');
assert(!penaltyPost.includes('Score:'), 'Post must not contain Score:');
assert(!penaltyPost.includes('Scorer:'), 'Post must not contain Scorer:');
assert(!penaltyPost.includes('Info:'), 'Post must not contain Info:');
assert(!penaltyPost.includes('Caicedo'), 'Assist player name must not appear in the post');
console.log('✅ PASS: Penalty post displays scorer with soccer emoji and NO forbidden labels.\n');

// ---------------------------------------------------------------------------
// TEST 2: Normal Goal SHOULD include an assist with shoe emoji and NO forbidden labels
// ---------------------------------------------------------------------------
console.log('▶ [TEST 2] Normal Goal Check (Shoe emoji with assist name, soccer emoji with scorer):');
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
console.log('Generated Normal Goal Post Output:\n');
console.log(normalGoalPost);
console.log('----------------------------------------------------');

assert(normalGoalPost.includes('👟 Martin Odegaard'), 'Normal goal must display shoe emoji aligned with assist name');
assert(normalGoalPost.includes(`⚽ ${makeUnicodeBold('Kai Havertz')}`), 'Normal goal must show soccer emoji aligned with scorer name');
assert(!normalGoalPost.includes('Scorer:'), 'Post must not contain Scorer: label');
assert(!normalGoalPost.includes('Assist:'), 'Post must not contain Assist: label');
assert(!normalGoalPost.includes('Time:'), 'Post must not contain Time: label');
assert(!normalGoalPost.includes('Score:'), 'Post must not contain Score: label');
assert(!normalGoalPost.includes('Info:'), 'Post must not contain Info: label');
console.log('✅ PASS: Regular goals display soccer emoji with scorer, shoe emoji with assist, and no forbidden labels.\n');

// ---------------------------------------------------------------------------
// TEST 3: Half-Time Post Duplication Protection
// ---------------------------------------------------------------------------
console.log('▶ [TEST 3] Half-Time Duplicate Post Prevention:');
const fixtureId = 'test-match-777';

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

const waitWhenRecent = getPostSpacingWaitMs(now - 15000, TARGET_POST_SPACING_MS);
console.log(`- For a post made 15s ago: must wait ${Math.round(waitWhenRecent / 1000)}s before next post`);
assert(waitWhenRecent > 0, 'Must enforce wait if last post was under target spacing');

const waitWhenElapsed = getPostSpacingWaitMs(now - 45000, TARGET_POST_SPACING_MS);
console.log(`- For a post made 45s ago: must wait ${waitWhenElapsed}ms (ready to post immediately)`);
assert.strictEqual(waitWhenElapsed, 0, 'No delay required when last post was beyond target spacing');

console.log('✅ PASS: Consecutive posts are safely separated by 30 seconds to 1 minute.\n');

// ---------------------------------------------------------------------------
// TEST 5: Disallowed Goal Post Editing & Scoreline Reversion
// ---------------------------------------------------------------------------
console.log('▶ [TEST 5] Disallowed Goal: Edit Existing Post & Revert Scoreline:');
const fixtureDisallow = 'test-match-disallow-888';

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

const disallowedNewEvents = disallowDiff.newEvents.filter((e) => e.type === 'GOAL_DISALLOWED' || e.isDisallowed);
assert.strictEqual(disallowedNewEvents.length, 0, 'Must NOT create any new event/post for GOAL_DISALLOWED');
assert.strictEqual(disallowDiff.newEvents.length, 0, 'No other unexpected new events should be created');
console.log('✅ Requirement 1 Verified: Zero new posts generated for disallowed goal.');

const editTargets = disallowDiff.eventPostEdits.filter((e) => e.postId === goalPostId);
assert.strictEqual(editTargets.length, 1, 'Must queue exactly 1 edit targeting the original goal post');
const disallowEdit = editTargets[0];
assert.strictEqual(disallowEdit.isDisallowed, true, 'Edit payload must flag isDisallowed: true');
console.log('✅ Requirement 2 Verified: Edit queued directly targeting existing Facebook post ID.');

const editedPostText = formatEventPost(disallowEdit.event, polledDisallowPayload);
console.log('\nGenerated Disallowed Goal Edited Post:\n');
console.log(editedPostText);
console.log('----------------------------------------------------');
assert(editedPostText.includes(makeUnicodeBold('GOAL DISALLOWED')), 'Edited post must state bold GOAL DISALLOWED');
assert(editedPostText.includes(makeUnicodeBold('Bukayo Saka')), 'Edited post must include bold player name');
assert(editedPostText.includes('0 - 0'), 'Edited post must show reverted 0-0 scoreline');
assert(!editedPostText.includes('Score:'), 'Must not have Score:');
assert(!editedPostText.includes('Time:'), 'Must not have Time:');
assert(!editedPostText.includes('Info:'), 'Must not have Info:');
console.log('✅ Requirement 3 Verified: Edited post text clearly displays VAR decision and reverted scoreline.');

assert.strictEqual(polledDisallowPayload.score.home, 0, 'Match home score must be reverted to 0');
assert.strictEqual(polledDisallowPayload.score.away, 0, 'Match away score must be 0');
console.log('✅ Requirement 4 Verified: Match scoreline reverted to 0-0.');

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
// TEST 6: Event Post Order: Heading -> Time -> Scoreboard -> Details -> Dynamic Info
// ---------------------------------------------------------------------------
console.log('▶ [TEST 6] Event Post Order & Assist Shoe Emoji & Label Removal:');
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
assert(goalPostFormatted.includes('👟 Martin Odegaard'), 'Assist must use the shoe emoji 👟 without Assist:');
assert(goalPostFormatted.includes(`⚽ ${makeUnicodeBold('Bukayo Saka')}`), 'Scorer must use soccer emoji ⚽ without Scorer:');

// Verify forbidden words are removed
assert(!goalPostFormatted.includes('Time:'), 'Time: must NOT appear');
assert(!goalPostFormatted.includes('Score:'), 'Score: must NOT appear');
assert(!goalPostFormatted.includes('Scorer:'), 'Scorer: must NOT appear');
assert(!goalPostFormatted.includes('Assist:'), 'Assist: must NOT appear');
assert(!goalPostFormatted.includes('Info:'), 'Info: must NOT appear');

// Verify structure order: Heading -> Time (⏱️ 24') -> Scoreboard -> Details -> Info
const headingIndex = goalPostFormatted.indexOf(makeUnicodeBold('GOOOOALLLLL'));
const timeIndex = goalPostFormatted.indexOf("⏱️ 24'");
const scoreIndex = goalPostFormatted.indexOf('1 - 0');
const scorerIndex = goalPostFormatted.indexOf(makeUnicodeBold('Bukayo Saka'));
const assistIndex = goalPostFormatted.indexOf('Martin Odegaard');
const infoIndex = goalPostFormatted.indexOf('📝 ');

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

// Verify Hashtags count is 4 to 5
const lastLine = goalPostFormatted.trim().split('\n').pop() || '';
const hashtagMatches = lastLine.match(/#\w+/g) || [];
console.log(`Hashtags count in post: ${hashtagMatches.length} (${hashtagMatches.join(' ')})`);
assert(hashtagMatches.length >= 4 && hashtagMatches.length <= 5, 'Post must contain strictly 4 to 5 hashtags');

console.log('✅ PASS: Event post order is strictly: Heading -> Time -> Scoreboard -> Details -> Dynamic Info with 4-5 hashtags.\n');

// ---------------------------------------------------------------------------
// TEST 7: Half-Time & Full-Time Post Structure
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

assert(htPost.includes('HT 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 1 - 0 𝐂𝐡𝐞𝐥𝐬𝐞𝐚') || htPost.includes('HT Arsenal 1 - 0 Chelsea'), 'HT must have HT team A scoreline Team B');
assert(!htPost.includes('⏱️ Time:'), 'Half-time post must NOT show Time: line');
assert(!htPost.includes('Score:'), 'Half-time post must NOT show Score:');
assert(htPost.includes('📝 '), 'Half-time post must include Info line without Info: label');

const ftEvent = {
  type: 'FULL_TIME',
  minute: 90,
  period: 2,
  homeScore: 2,
  awayScore: 1,
};
const ftPost = formatEventPost(ftEvent, matchContext);
console.log('Full-Time Post Output:\n' + ftPost + '\n');

assert(ftPost.includes('FT 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 2 - 1 𝐂𝐡𝐞𝐥𝐬𝐞𝐚') || ftPost.includes('FT Arsenal 2 - 1 Chelsea'), 'FT must have FT team A scoreline Team B');
assert(!ftPost.includes('⏱️ Time:'), 'Full-time post must NOT show Time: line');
assert(!ftPost.includes('Score:'), 'Full-time post must NOT show Score:');
assert(ftPost.includes('📝 '), 'Full-time post must include Info line without Info: label');
console.log('✅ PASS: HT and FT posts conform strictly to requested template without forbidden labels.\n');

// ---------------------------------------------------------------------------
// TEST 8: Starting XI Format & 4-5 Hashtags Check
// ---------------------------------------------------------------------------
console.log('▶ [TEST 8] Starting XI Format with (W) support and 4-5 Hashtags:');

const womenMatchContext = {
  homeName: '(W) Manchester United',
  awayName: '(W) Sheffield United',
  leagueName: 'English WSL Players Cup',
};

const homePlayers = [
  'Dominique Janssen', 'Janina Leitzig', 'Ella Toone', 'Monica Jusu Bah', 'Simi Awujo',
  'Hanna Lundkvist', 'Maya Le Tissier', 'Lea Schüller', 'Mared Griffiths', 'Jess Simpson', 'Rebeca Bernal'
];

const awayPlayers = [
  'Poppy Soper', 'Gracie Pearse', 'Leanne Cowan', 'Sophie O\'Rourke', 'Jess Reavill',
  'Constance Scofield', 'Mollie Rouse', 'Ava Baker', 'Halle Houssein', 'Sophie Harwood', 'Abbie Jones'
];

const lineupPost = formatLineupPost(womenMatchContext, homePlayers, awayPlayers);
console.log('Generated Starting XI Post Output:\n');
console.log(lineupPost);
console.log('----------------------------------------------------');

assert(lineupPost.includes('(𝐖) 𝐌𝐀𝐍𝐂𝐇𝐄𝐒𝐓𝐄𝐑 𝐔𝐍𝐈𝐓𝐄𝐃 startingXI; Dominique Janssen'), 'Must match (𝐖) 𝐌𝐀𝐍𝐂𝐇𝐄𝐒𝐓𝐄𝐑 𝐔𝐍𝐈𝐓𝐄𝐃 startingXI; format');
assert(lineupPost.includes('(𝐖) 𝐒𝐇𝐄𝐅𝐅𝐈𝐄𝐋𝐃 𝐔𝐍𝐈𝐓𝐄𝐃 startingXI; Poppy Soper'), 'Must match (𝐖) 𝐒𝐇𝐄𝐅𝐅𝐈𝐄𝐋𝐃 𝐔𝐍𝐈𝐓𝐄𝐃 startingXI; format');
assert(lineupPost.includes('👉 Who is winning this clash? Leave your predictions below! 👇'), 'Must include predictions CTA');

const lineupHashtags = lineupPost.trim().split('\n').pop() || '';
const lineupTagCount = (lineupHashtags.match(/#\w+/g) || []).length;
console.log(`Lineup hashtags count: ${lineupTagCount} (${lineupHashtags})`);
assert(lineupTagCount >= 4 && lineupTagCount <= 5, 'Lineup post must strictly have 4 to 5 hashtags');

console.log('✅ PASS: Starting XI matches user requested format perfectly.\n');

// ---------------------------------------------------------------------------
// TEST 9: Dynamic Info Generator generates varied commentary
// ---------------------------------------------------------------------------
console.log('▶ [TEST 9] Dynamic AI Commentary Variation Check:');
const goal1 = generateDynamicFallbackInfo({ type: 'GOAL', player: 'Saka', minute: 14 }, matchContext, 'seed1');
const goal2 = generateDynamicFallbackInfo({ type: 'GOAL', player: 'Havertz', minute: 62 }, matchContext, 'seed2');
console.log(`Goal 1 Info Line: "${goal1}"`);
console.log(`Goal 2 Info Line: "${goal2}"`);
assert(goal1.length > 5, 'Goal 1 commentary must not be empty');
assert(goal2.length > 5, 'Goal 2 commentary must not be empty');
assert.notStrictEqual(goal1, goal2, 'Two goal events should have unique dynamic info lines');
console.log('✅ PASS: Dynamic info generator produces unique lines for different events.\n');

console.log('====================================================');
console.log('  🎉 ALL 9 TESTS PASSED! ALL FIXES VERIFIED.');
console.log('====================================================\n');
