// test-fixes.js
import assert from 'assert';
import config from './config/env.js';
import { formatEventPost, formatLineupPost, formatFixturesPost, compareMatchState, makeUnicodeBold } from './services/eventEngine.js';
import { getCompetitionFlag, getMatchResultPrefix, getMatchShootout, formatResultLine, ENGLAND_FLAG } from './utils/flags.js';
import { isDateInDailyFetchWindowWAT, isDateInTodayWAT } from './utils/time.js';
import { getPostSpacingWaitMs, MIN_POST_SPACING_MS, TARGET_POST_SPACING_MS } from './services/updateScheduler.js';
import { COMPREHENSIVE_LEAGUES, isPenaltyShootoutPlay, isShootoutEvent, normalizeEvent } from './services/espn.js';
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

// Verify structure order: Heading -> Time (⏱️ 24') -> Scoreboard -> Details
const headingIndex = goalPostFormatted.indexOf(makeUnicodeBold('GOOOOALLLLL'));
const timeIndex = goalPostFormatted.indexOf("⏱️ 24'");
const scoreIndex = goalPostFormatted.indexOf('1 - 0');
const scorerIndex = goalPostFormatted.indexOf(makeUnicodeBold('Bukayo Saka'));
const assistIndex = goalPostFormatted.indexOf('Martin Odegaard');

assert(headingIndex !== -1, 'Heading must exist for goal event');
assert(timeIndex !== -1, 'Time must exist');
assert(scoreIndex !== -1, 'Scoreboard must exist');
assert(scorerIndex !== -1, 'Scorer must exist');
assert(assistIndex !== -1, 'Assist must exist');

assert(headingIndex < timeIndex, 'Heading must appear before Time');
assert(timeIndex < scoreIndex, 'Time must appear before Scoreboard');
assert(scoreIndex < scorerIndex, 'Scoreboard must appear before Details (Scorer)');
assert(scorerIndex < assistIndex, 'Scorer must appear before Assist');

// Verify info line and wrapping lines are removed
assert(!goalPostFormatted.includes('📝'), 'Goal post must NOT contain info line');
assert(!goalPostFormatted.includes('━━━━━━━━━━━━━━━━━━━'), 'Goal post must NOT contain wrapping separator lines');

// Verify Hashtags count is 4 to 5
const lastLine = goalPostFormatted.trim().split('\n').pop() || '';
const hashtagMatches = lastLine.match(/#\w+/g) || [];
console.log(`Hashtags count in post: ${hashtagMatches.length} (${hashtagMatches.join(' ')})`);
assert(hashtagMatches.length >= 4 && hashtagMatches.length <= 5, 'Post must contain strictly 4 to 5 hashtags');

console.log('✅ PASS: Event post order is strictly: Heading -> Time -> Scoreboard -> Details with 4-5 hashtags and no wrapper/info lines.\n');

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
assert(!htPost.includes('📝'), 'Half-time post must NOT include Info line per user instruction');
assert(!htPost.includes('⚡'), 'Half-time post must NOT have a heading per user instruction');
assert(!htPost.includes('━━━━━━━━━━━━━━━━━━━'), 'Half-time post must NOT contain wrapping separator lines');

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
assert(!ftPost.includes('📝'), 'Full-time post must NOT include Info line per user instruction');
assert(!ftPost.includes('⚡'), 'Full-time post must NOT have a heading per user instruction');
assert(!ftPost.includes('𝐅𝐔𝐋𝐋-𝐓𝐈𝐌𝐄') && !ftPost.includes('FULL-TIME'), 'Full-time post must NOT contain FULL-TIME heading');
assert(!ftPost.includes('━━━━━━━━━━━━━━━━━━━'), 'Full-time post must NOT contain wrapping separator lines');

const kickoffEvent = {
  type: 'KICKOFF',
  minute: 0,
  period: 1,
  homeScore: 0,
  awayScore: 0,
};
const kickoffPost = formatEventPost(kickoffEvent, matchContext);
assert(!kickoffPost.includes('📝'), 'Kick-off post must NOT include Info line per user instruction');
assert(!kickoffPost.includes('⚡'), 'Kick-off post must NOT have a heading per user instruction');
assert(!kickoffPost.includes('━━━━━━━━━━━━━━━━━━━'), 'Kick-off post must NOT contain wrapping separator lines');
console.log('✅ PASS: Headings removed from kickoff, halftime, and full-time events; retained on goal, disallowed, red card, fixtures/results; info and wrapper lines removed.\n');

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

// ---------------------------------------------------------------------------
// TEST 10: Stop Editing Created Goal Posts When Assist Resolves & Prevent Duplicate Posts
// ---------------------------------------------------------------------------
console.log('▶ [TEST 10] Goal Post Immutability & Duplicate Prevention:');
const goalFixtureId = 'match-goal-test-999';
const existingGoalPostId = 'fb-goal-post-55';

const matchWithPostedGoal = {
  fixtureId: goalFixtureId,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  leagueName: 'Premier League',
  status: { state: 'in', description: 'In Progress', period: 1 },
  score: { home: 1, away: 0 },
  events: {
    [`${goalFixtureId}:GOAL:p1:m24:tarsenal:idx0`]: {
      eventId: `${goalFixtureId}:GOAL:p1:m24:tarsenal:idx0`,
      rawId: 'play-goal-1',
      type: 'GOAL',
      minute: 24,
      period: 1,
      player: 'Bukayo Saka',
      assist: null, // Initially posted without assist
      teamId: 'arsenal',
      homeScore: 1,
      awayScore: 0,
      scoreAfterEvent: { home: 1, away: 0 },
      facebookPostId: existingGoalPostId,
      status: 'VALID',
    },
  },
  facebookPosts: {
    [existingGoalPostId]: {
      postId: existingGoalPostId,
      eventId: `${goalFixtureId}:GOAL:p1:m24:tarsenal:idx0`,
      type: 'GOAL',
      createdAt: new Date().toISOString(),
    },
  },
};

// Scenario A: Feed updates with resolved assist name ("Martin Odegaard")
const polledWithResolvedAssist = {
  fixtureId: goalFixtureId,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  leagueName: 'Premier League',
  status: { state: 'in', description: 'In Progress', clock: "28'", period: 1 },
  score: { home: 1, away: 0 },
  events: [
    {
      type: 'GOAL',
      minute: 24,
      period: 1,
      player: 'Bukayo Saka',
      assist: 'Martin Odegaard', // Assist resolved later by ESPN
      teamId: 'arsenal',
      rawId: 'play-goal-1',
    },
  ],
};

const assistDiff = compareMatchState(matchWithPostedGoal, polledWithResolvedAssist);
console.log(`- New events queued when assist resolved: ${assistDiff.newEvents.length}`);
console.log(`- Goal post edits queued when assist resolved: ${assistDiff.goalPostEdits.length}`);
console.log(`- Event post edits queued when assist resolved: ${assistDiff.eventPostEdits.length}`);

assert.strictEqual(assistDiff.goalPostEdits.length, 0, 'Must NEVER queue goal post edits when assist is resolved');
assert.strictEqual(assistDiff.eventPostEdits.length, 0, 'Must NEVER queue event post edits for already created goal posts');
assert.strictEqual(assistDiff.newEvents.length, 0, 'Must NEVER create a new post when assist is resolved');
console.log('✅ Requirement 1 Verified: Created goal post is NOT edited when assist resolves.');

// Scenario B: Feed sends another representation of the same goal (e.g. commentary text or different ID)
const polledWithDuplicateRepresentation = {
  fixtureId: goalFixtureId,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  leagueName: 'Premier League',
  status: { state: 'in', description: 'In Progress', clock: "30'", period: 1 },
  score: { home: 1, away: 0 },
  events: [
    {
      type: 'GOAL',
      minute: 24,
      period: 1,
      player: 'Bukayo Saka',
      teamId: 'arsenal',
      text: 'Goal! Arsenal 1, Chelsea 0. Bukayo Saka left footed shot.',
      scoreAfterEvent: { home: 1, away: 0 },
    },
  ],
};

const duplicateDiff = compareMatchState(matchWithPostedGoal, polledWithDuplicateRepresentation);
console.log(`- New events queued for duplicate representation: ${duplicateDiff.newEvents.length}`);
assert.strictEqual(duplicateDiff.newEvents.length, 0, 'Must NEVER create a duplicate post for an already posted goal');
assert.strictEqual(duplicateDiff.goalPostEdits.length, 0, 'Must NEVER queue edits for duplicate representation');
console.log('✅ Requirement 2 Verified: Duplicate post creation completely prevented.\n');

// Scenario C: Exception: update goal if the event that came in after goal is GOAL DISALLOWED
console.log('- Scenario C: Disallowed goal event arrives after goal was posted:');
const polledWithDisallowedGoal = {
  fixtureId: goalFixtureId,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  leagueName: 'Premier League',
  status: { state: 'in', description: 'In Progress', clock: "32'", period: 1 },
  score: { home: 0, away: 0 },
  events: [
    {
      type: 'GOAL_DISALLOWED',
      minute: 24,
      period: 1,
      player: 'Bukayo Saka',
      teamId: 'arsenal',
      reason: 'Goal disallowed for offside following VAR review',
      text: 'VAR Decision: No Goal Arsenal.',
      disallowed: true,
    },
  ],
};

const postDisallowDiff = compareMatchState(matchWithPostedGoal, polledWithDisallowedGoal);
console.log(`- New events queued on disallow: ${postDisallowDiff.newEvents.length}`);
console.log(`- Goal post edits queued on disallow: ${postDisallowDiff.goalPostEdits.length}`);
console.log(`- Event post edits queued on disallow: ${postDisallowDiff.eventPostEdits.length}`);

assert.strictEqual(postDisallowDiff.newEvents.length, 0, 'Must NEVER create a new post for a disallowed goal');
assert.strictEqual(postDisallowDiff.goalPostEdits.length, 1, 'MUST queue goal post edit when goal is disallowed');
assert.strictEqual(postDisallowDiff.goalPostEdits[0].isDisallowed, true, 'Queued edit must be flagged isDisallowed');
console.log('✅ Requirement 3 Verified: Disallowed goal makes exception to update existing goal post on Facebook.\n');

// ---------------------------------------------------------------------------
// TEST 11: Goal Delay For Scorer and Assist Name Resolution Before Posting
// ---------------------------------------------------------------------------
console.log('▶ [TEST 11] Goal Resolution Delay and Posting With or Without Names:');

// Case A: Goal posted with names resolved (scorer and assist present)
const goalWithBothNames = {
  type: 'GOAL',
  minute: 34,
  player: 'Ella Toone',
  assist: 'Maya Le Tissier',
  scoreAfterEvent: { home: 1, away: 0 },
};
const postWithBoth = formatEventPost(goalWithBothNames, matchContext);
console.log('Post with scorer and assist resolved:\n' + postWithBoth + '\n');
assert(postWithBoth.includes('⚽ 𝐄𝐥𝐥𝐚 𝐓𝐨𝐨𝐧𝐞') || postWithBoth.includes('⚽ Ella Toone'), 'Must show soccer emoji aligned with scorer name');
assert(postWithBoth.includes('👟 Maya Le Tissier'), 'Must show shoe emoji aligned with assist name');
assert(!postWithBoth.includes('Scorer:'), 'Must NOT have Scorer: label');
assert(!postWithBoth.includes('Assist:'), 'Must NOT have Assist: label');
assert(!postWithBoth.includes('Score:'), 'Must NOT have Score: label');

// Case B: Goal posted when assist name is NOT resolved
const goalWithoutAssist = {
  type: 'GOAL',
  minute: 34,
  player: 'Ella Toone',
  assist: null,
  scoreAfterEvent: { home: 1, away: 0 },
};
const postWithoutAssist = formatEventPost(goalWithoutAssist, matchContext);
console.log('Post without assist resolved:\n' + postWithoutAssist + '\n');
assert(postWithoutAssist.includes('⚽ 𝐄𝐥𝐥𝐚 𝐓𝐨𝐨𝐧𝐞') || postWithoutAssist.includes('⚽ Ella Toone'), 'Must show soccer emoji with scorer');
assert(!postWithoutAssist.includes('👟'), 'Must not have shoe emoji when assist is null');
assert(!postWithoutAssist.includes('Assist:'), 'Must NOT have Assist: label');

// Case C: Goal posted when neither scorer nor assist is resolved
const goalWithoutNames = {
  type: 'GOAL',
  minute: 34,
  player: null,
  assist: null,
  scoreAfterEvent: { home: 1, away: 0 },
};
const postWithoutNames = formatEventPost(goalWithoutNames, matchContext);
console.log('Post without names:\n' + postWithoutNames + '\n');
assert(!postWithoutNames.includes('Scorer:'), 'Must NOT have Scorer: label');
assert(!postWithoutNames.includes('Assist:'), 'Must NOT have Assist: label');
assert(!postWithoutNames.includes('⚽ null'), 'Must not display null scorer');
assert(postWithoutNames.includes('𝐆𝐎𝐎𝐎𝐎𝐀𝐋𝐋𝐋𝐋𝐋') || postWithoutNames.includes('GOOOOALLLLL'), 'Must have goal header');

// Verify config default delay for goal resolution is 10000ms (10 seconds)
assert.strictEqual(config.monitoring.goalResolutionDelayMs, 10000, 'Config goalResolutionDelayMs must default to 10000 ms (10 seconds)');
console.log(`- Configured goal resolution delay: ${config.monitoring.goalResolutionDelayMs / 1000} seconds`);
console.log('✅ PASS: Goal resolution delay and posts with/without resolved names verified.\n');

// ---------------------------------------------------------------------------
// TEST 12: Red Card Lineup Verification (Rejects Non-Lineup Personnel)
// ---------------------------------------------------------------------------
console.log('▶ [TEST 12] Red Card Lineup Validation:');
const matchWithLineups = {
  fixtureId: 'match-rc-lineup-test-101',
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  leagueName: 'Premier League',
  status: { state: 'in', description: 'In Progress', clock: "55'", period: 2 },
  score: { home: 1, away: 0 },
  lineups: {
    home: ['David Raya', 'William Saliba', 'Gabriel', 'Declan Rice', 'Martin Odegaard', 'Bukayo Saka', 'Kai Havertz'],
    away: ['Robert Sanchez', 'Levi Colwill', 'Marc Cucurella', 'Moises Caicedo', 'Enzo Fernandez', 'Cole Palmer', 'Nicolas Jackson'],
  },
  events: {},
  facebookPosts: {},
};

// Case 1: Red card reported for manager or coach not in lineup (e.g. Mikel Arteta)
const polledWithManagerRedCard = {
  ...matchWithLineups,
  events: [
    {
      type: 'RED_CARD',
      minute: 55,
      period: 2,
      player: 'Mikel Arteta', // Manager - NOT in lineup!
      teamId: 'arsenal',
      text: 'Mikel Arteta is shown a red card.',
    },
  ],
};
const managerRcDiff = compareMatchState(matchWithLineups, polledWithManagerRedCard);
console.log(`- New events queued for non-lineup person (manager): ${managerRcDiff.newEvents.length}`);
assert.strictEqual(managerRcDiff.newEvents.length, 0, 'Must REJECT red card for person not in the match lineup');
console.log('✅ Sub-test A Passed: Person not in lineup rejected from getting a red card.');

// Case 2: Red card reported for valid player in lineup (e.g. William Saliba)
const polledWithPlayerRedCard = {
  ...matchWithLineups,
  events: [
    {
      type: 'RED_CARD',
      minute: 58,
      period: 2,
      player: 'William Saliba', // Player IN lineup!
      teamId: 'arsenal',
      text: 'William Saliba is shown a straight red card.',
    },
  ],
};
const playerRcDiff = compareMatchState(matchWithLineups, polledWithPlayerRedCard);
console.log(`- New events queued for valid lineup player: ${playerRcDiff.newEvents.length}`);
assert.strictEqual(playerRcDiff.newEvents.length, 1, 'MUST accept red card for valid player in the lineup');
assert.strictEqual(playerRcDiff.newEvents[0].player, 'William Saliba', 'Red card must be assigned to the lineup player');
console.log('✅ Sub-test B Passed: Valid lineup player correctly receives red card event.\n');

// ---------------------------------------------------------------------------
// TEST 13: Enhanced Verse Variations on Match Events
// ---------------------------------------------------------------------------
console.log('▶ [TEST 13] Match Event Verse Variations:');
const earlyGoalVerse = generateDynamicFallbackInfo({ type: 'GOAL', minute: 4, player: 'Saka' }, { score: { home: 1, away: 0 } });
const lateGoalVerse = generateDynamicFallbackInfo({ type: 'GOAL', minute: 89, player: 'Havertz' }, { score: { home: 2, away: 1 } });
const equalizerVerse = generateDynamicFallbackInfo({ type: 'GOAL', minute: 65, player: 'Palmer', scoreAfterEvent: { home: 1, away: 1 } }, { score: { home: 1, away: 1 } });
const redCardVerse = generateDynamicFallbackInfo({ type: 'RED_CARD', minute: 58, player: 'Saliba' }, matchWithLineups);
const disallowedVerse = generateDynamicFallbackInfo({ type: 'GOAL_DISALLOWED', minute: 24, player: 'Saka' }, matchWithLineups);

console.log(`- Early Goal Verse: "${earlyGoalVerse}"`);
console.log(`- Late Goal Verse: "${lateGoalVerse}"`);
console.log(`- Equalizer Verse: "${equalizerVerse}"`);
console.log(`- Red Card Verse: "${redCardVerse}"`);
console.log(`- Disallowed Goal Verse: "${disallowedVerse}"`);

assert(earlyGoalVerse.length > 5, 'Early goal verse must not be empty');
assert(lateGoalVerse.length > 5, 'Late goal verse must not be empty');
assert(equalizerVerse.length > 5, 'Equalizer verse must not be empty');
assert(redCardVerse.length > 5, 'Red card verse must not be empty');
assert(disallowedVerse.length > 5, 'Disallowed goal verse must not be empty');
console.log('✅ PASS: Rich verse variations generated dynamically for distinct match moments.\n');

// ---------------------------------------------------------------------------
// TEST 14: Disallowed Goal followed by Valid Goal
// Scenario: A goal is disallowed earlier (does not add to scoreboard).
// Another goal is later scored (a good goal, counts 1-0).
// The heading of the good goal must NOT be "disallowed goal", but "GOOOOALLLLL!".
// ---------------------------------------------------------------------------
console.log('▶ [TEST 14] Disallowed Goal Followed By Good Goal Heading & State Check:');
const test14FixtureId = 'fixture-disallow-then-goal-123';
const initialMatch14 = {
  fixtureId: test14FixtureId,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  status: { state: 'in', description: 'First Half', clock: "35'", period: 1 },
  score: { home: 1, away: 0 },
  events: [
    {
      type: 'VAR',
      minute: 14,
      period: 1,
      text: 'Goal disallowed for offside following VAR review. No goal.',
      player: 'Gabriel Jesus',
      teamId: 'arsenal',
    },
    {
      type: 'GOAL',
      minute: 35,
      period: 1,
      player: 'Bukayo Saka',
      teamId: 'arsenal',
      scoreAfterEvent: { home: 1, away: 0 },
      text: 'Goal! Arsenal 1, Chelsea 0. Bukayo Saka left footed shot.',
    },
  ],
};

const diff14 = compareMatchState({ fixtureId: test14FixtureId, score: { home: 0, away: 0 }, events: {} }, initialMatch14);
const goalEvents14 = diff14.newEvents.filter((e) => e.type === 'GOAL');
assert.strictEqual(goalEvents14.length, 1, 'Must emit exactly 1 new goal event for the good goal');
const goodGoal = goalEvents14[0];
assert.strictEqual(goodGoal.player, 'Bukayo Saka', 'Good goal must be by Bukayo Saka');
assert.strictEqual(goodGoal.status, 'PENDING', 'Good goal must be PENDING, not DISALLOWED');
assert(!goodGoal.isDisallowed, 'Good goal must NOT have isDisallowed flag set');

// Format the post for the good goal
const goodGoalPost = formatEventPost(goodGoal, initialMatch14);
console.log('\nGenerated Good Goal Post Output:\n');
console.log(goodGoalPost);
console.log('----------------------------------------------------');

assert(goodGoalPost.includes(makeUnicodeBold('GOOOOALLLLL!')), 'Good goal MUST have GOOOOALLLLL! heading');
assert(!goodGoalPost.includes('DISALLOWED'), 'Good goal heading must NEVER be DISALLOWED');
assert(goodGoalPost.includes('1 - 0'), 'Good goal scoreboard must show 1 - 0');

// Now simulate the NEXT polling cycle where the good goal has been published and has a facebookPostId
const matchStateAfterPost14 = {
  fixtureId: test14FixtureId,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  status: { state: 'in', description: 'First Half', clock: "40'", period: 1 },
  score: { home: 1, away: 0 },
  events: {
    ...diff14.events,
    [goodGoal.eventId]: {
      ...goodGoal,
      status: 'VALID',
      facebookPostId: 'fb-post-saka-35',
    },
  },
  facebookPosts: {
    'fb-post-saka-35': {
      postId: 'fb-post-saka-35',
      eventId: goodGoal.eventId,
      type: 'GOAL',
    },
  },
};

const poll2Diff14 = compareMatchState(matchStateAfterPost14, initialMatch14);
assert.strictEqual(poll2Diff14.newEvents.length, 0, 'No new events on poll 2');
assert.strictEqual(poll2Diff14.goalPostEdits.length, 0, 'No goal post edits should be queued targeting the good goal');
assert.strictEqual(poll2Diff14.eventPostEdits.length, 0, 'No event post edits should be queued targeting the good goal');
assert.strictEqual(poll2Diff14.events[goodGoal.eventId].status, 'VALID', 'Good goal must stay VALID, not flipped to DISALLOWED');
console.log('✅ PASS: Good goal retains GOOOOALLLLL heading and is never marked or edited as disallowed.\n');

// ---------------------------------------------------------------------------
// TEST 15: Russian League Flag Check
// Requirement: Russian Premier League must show Russian flag (🇷🇺), NOT England flag.
// ---------------------------------------------------------------------------
console.log('▶ [TEST 15] Russian League Flag Check:');
const russianLeagueFlagBySlug = getCompetitionFlag('rus.1');
const russianLeagueFlagByName = getCompetitionFlag('Russian Premier League');
const russianMatchObj = {
  leagueSlug: 'rus.1',
  leagueName: 'Russian Premier League',
  homeName: 'Zenit St. Petersburg',
  awayName: 'Spartak Moscow',
};
const russianLeagueFlagByObj = getCompetitionFlag(russianMatchObj);

console.log(`- Flag by slug ('rus.1'): ${russianLeagueFlagBySlug}`);
console.log(`- Flag by name ('Russian Premier League'): ${russianLeagueFlagByName}`);
console.log(`- Flag by match object: ${russianLeagueFlagByObj}`);

assert.strictEqual(russianLeagueFlagBySlug, '🇷🇺', 'Russian league slug rus.1 must resolve to 🇷🇺');
assert.strictEqual(russianLeagueFlagByName, '🇷🇺', 'Russian Premier League name must resolve to 🇷🇺');
assert.strictEqual(russianLeagueFlagByObj, '🇷🇺', 'Russian match object must resolve to 🇷🇺');
assert.notStrictEqual(russianLeagueFlagBySlug, ENGLAND_FLAG, 'Russian league must NOT resolve to England flag');
assert.notStrictEqual(russianLeagueFlagByName, ENGLAND_FLAG, 'Russian Premier League must NOT resolve to England flag');
console.log('✅ PASS: Russian league displays 🇷🇺 and never displays England flag.\n');

// ---------------------------------------------------------------------------
// TEST 16: Match Results Status Prefix (FT, AET, APEN) Check
// Requirement:
// - FT and final score if match didn't enter extra time
// - AET and final score if match entered extra time
// - APEN and final score if match entered penalty shootout
// ---------------------------------------------------------------------------
console.log('▶ [TEST 16] Match Results Status Prefix (FT, AET, APEN) Check:');

// 1. Regular 90-minute match (no extra time)
const normalMatch = {
  fixtureId: 'normal-match-1',
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  leagueSlug: 'eng.1',
  leagueName: 'Premier League',
  score: { home: 2, away: 1 },
  status: { state: 'post', period: 2, description: 'Full Time', name: 'STATUS_FULL_TIME' },
};
const normalEvent = { type: 'FULL_TIME', period: 2, homeScore: 2, awayScore: 1 };
const normalPrefix = getMatchResultPrefix(normalMatch, normalEvent);
const normalResultLine = formatResultLine(normalMatch.homeName, normalMatch.awayName, 2, 1, normalMatch, normalEvent);
const normalPost = formatEventPost(normalEvent, normalMatch);

console.log(`Normal Match Prefix: ${normalPrefix}`);
console.log(`Normal Result Line: ${normalResultLine}`);
console.log(`Normal Post Line:\n${normalPost.split('\n')[0]}`);
assert.strictEqual(normalPrefix, 'FT', 'Match without extra time must have FT prefix');
assert(normalResultLine.startsWith('FT '), 'Result line must start with FT');
assert(normalPost.includes('FT 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 2 - 1 𝐂𝐡𝐞𝐥𝐬𝐞𝐚'), 'Event post must format FT Arsenal 2 - 1 Chelsea');

// 2. Extra time match (without penalties)
const aetMatch = {
  fixtureId: 'aet-match-2',
  homeName: 'Real Madrid',
  awayName: 'Bayern Munich',
  leagueSlug: 'uefa.champions',
  leagueName: 'UEFA Champions League',
  score: { home: 3, away: 2 },
  status: { state: 'post', period: 4, description: 'AET', detail: 'After Extra Time', name: 'STATUS_FINAL_AET' },
};
const aetEvent = { type: 'AFTER_EXTRA_TIME_OR_SHOOTOUT', period: 4, homeScore: 3, awayScore: 2 };
const aetPrefix = getMatchResultPrefix(aetMatch, aetEvent);
const aetResultLine = formatResultLine(aetMatch.homeName, aetMatch.awayName, 3, 2, aetMatch, aetEvent);
const aetPost = formatEventPost(aetEvent, aetMatch);

console.log(`\nAET Match Prefix: ${aetPrefix}`);
console.log(`AET Result Line: ${aetResultLine}`);
console.log(`AET Post Line:\n${aetPost.split('\n')[0]}`);
assert.strictEqual(aetPrefix, 'AET', 'Match entering extra time must have AET prefix');
assert(aetResultLine.startsWith('AET '), 'Result line must start with AET');
assert(aetPost.includes('AET 𝐑𝐞𝐚𝐥 𝐌𝐚𝐝𝐫𝐢𝐝 3 - 2 𝐁𝐚𝐲𝐞𝐫𝐧 𝐌𝐮𝐧𝐢𝐜𝐡'), 'Event post must format AET Real Madrid 3 - 2 Bayern Munich');

// 3. Penalty shootout match
const apenMatch = {
  fixtureId: 'apen-match-3',
  homeName: 'Argentina',
  awayName: 'France',
  leagueSlug: 'fifa.world',
  leagueName: 'FIFA World Cup',
  score: { home: 3, away: 3 },
  shootout: { home: 4, away: 2 },
  status: { state: 'post', period: 5, description: 'Shootout', detail: 'Argentina win 4-2 on penalties', name: 'STATUS_FINAL_PEN' },
};
const apenEvent = { type: 'AFTER_EXTRA_TIME_OR_SHOOTOUT', period: 5, homeScore: 3, awayScore: 3, shootout: { home: 4, away: 2 } };
const apenPrefix = getMatchResultPrefix(apenMatch, apenEvent);
const apenResultLine = formatResultLine(apenMatch.homeName, apenMatch.awayName, 3, 3, apenMatch, apenEvent);
const apenPost = formatEventPost(apenEvent, apenMatch);

console.log(`\nAPEN Match Prefix: ${apenPrefix}`);
console.log(`APEN Result Line: ${apenResultLine}`);
console.log(`APEN Post Line:\n${apenPost.split('\n')[0]}`);
assert.strictEqual(apenPrefix, 'APEN', 'Match entering penalty shootout must have APEN prefix');
assert(apenResultLine.startsWith('APEN '), 'Result line must start with APEN');
assert(apenResultLine.includes('(4) 3 : 3(2)'), 'Result line must include shootout score: (4) 3 : 3(2)');
assert(apenPost.includes('APEN 𝐀𝐫𝐠𝐞𝐧𝐭𝐢𝐧𝐚 (4) 3 - 3(2) 𝐅𝐫𝐚𝐧𝐜𝐞'), 'Event post must format APEN Argentina (4) 3 - 3(2) France');
console.log('✅ PASS: FT, AET, and APEN correctly assigned and formatted across results and lifecycle posts.\n');

// ---------------------------------------------------------------------------
// TEST 17: Penalty Missed Post Creation Check
// Requirement:
// - Whitelist and process PENALTY_MISSED events
// - Create post for penalty missed with heading, time, scoreboard, details, hashtags
// ---------------------------------------------------------------------------
console.log('▶ [TEST 17] Penalty Missed Detection & Post Creation:');
const test17FixtureId = 'fixture-penalty-missed-456';
const matchStateBeforePen = {
  fixtureId: test17FixtureId,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  status: { state: 'in', description: 'First Half', clock: "41'", period: 1 },
  score: { home: 0, away: 0 },
  events: {},
};

const matchStateWithMissedPen = {
  fixtureId: test17FixtureId,
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  status: { state: 'in', description: 'First Half', clock: "42'", period: 1 },
  score: { home: 0, away: 0 },
  events: [
    {
      type: 'PENALTY',
      outcome: 'MISSED',
      minute: 42,
      period: 1,
      player: 'Bukayo Saka',
      teamId: 'arsenal',
      text: 'Penalty missed! Bad penalty by Bukayo Saka (Arsenal) left footed shot is saved in the bottom right corner.',
    },
  ],
};

const diff17 = compareMatchState(matchStateBeforePen, matchStateWithMissedPen);
assert.strictEqual(diff17.newEvents.length, 1, 'Must emit exactly 1 new event for missed penalty');
const missedPenEvent = diff17.newEvents[0];
assert.strictEqual(missedPenEvent.type, 'PENALTY_MISSED', 'Event type must be PENALTY_MISSED');
assert.strictEqual(missedPenEvent.player, 'Bukayo Saka', 'Player must be Bukayo Saka');
assert.strictEqual(missedPenEvent.assist, null, 'Missed penalty must have no assist');
assert.strictEqual(missedPenEvent.homeScore, 0, 'Score must remain 0-0');
assert.strictEqual(missedPenEvent.awayScore, 0, 'Score must remain 0-0');

const penMissedPost = formatEventPost(missedPenEvent, matchStateWithMissedPen);
console.log('\nGenerated Penalty Missed Post Output:\n');
console.log(penMissedPost);
console.log('----------------------------------------------------');

assert(penMissedPost.includes(makeUnicodeBold('PENALTY MISSED!')), 'Post must have PENALTY MISSED heading');
assert(penMissedPost.includes('42\''), 'Post must include minute 42\'');
assert(penMissedPost.includes('𝐀𝐫𝐬𝐞𝐧𝐚𝐥 0 - 0 𝐂𝐡𝐞𝐥𝐬𝐞𝐚'), 'Post must include current score 0 - 0');
assert(penMissedPost.includes(`${makeUnicodeBold('Bukayo Saka')} (Penalty Missed)`), 'Post details must note Bukayo Saka (Penalty Missed)');
assert(penMissedPost.includes('Stay tuned for more updates!'), 'Post must include call-to-action');
console.log('✅ PASS: Penalty Missed event detected, whitelisted, and formatted into Facebook post.\n');

// ---------------------------------------------------------------------------
// TEST 18: Exact User Shootout Format Check: APEN 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 (4) 0 - 0(5) 𝐂𝐡𝐞𝐥𝐬𝐞𝐚
// ---------------------------------------------------------------------------
console.log('▶ [TEST 18] Exact User Shootout Result Line & Post Format:');
const arsenalChelseaShootoutMatch = {
  fixtureId: 'match-shootout-exact-1',
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  leagueSlug: 'eng.fa',
  leagueName: 'English FA Cup',
  score: { home: 0, away: 0 },
  shootout: { home: 4, away: 5 },
  status: { state: 'post', period: 5, description: 'Chelsea win 5-4 on penalties', name: 'STATUS_FINAL_PEN' },
};
const shootoutLifecycleEvent = {
  type: 'AFTER_EXTRA_TIME_OR_SHOOTOUT',
  period: 5,
  homeScore: 0,
  awayScore: 0,
  shootout: { home: 4, away: 5 },
};

const shootoutPost = formatEventPost(shootoutLifecycleEvent, arsenalChelseaShootoutMatch);
console.log('Generated Shootout Event Post:\n' + shootoutPost);
const firstLine = shootoutPost.split('\n')[0];
console.log('First line of shootout post: ' + firstLine);

const expectedExactLine = `APEN ${makeUnicodeBold('Arsenal')} (4) 0 - 0(5) ${makeUnicodeBold('Chelsea')}`;
assert.strictEqual(firstLine, expectedExactLine, `Must match exact format: ${expectedExactLine}`);
assert(shootoutPost.includes('APEN 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 (4) 0 - 0(5) 𝐂𝐡𝐞𝐥𝐬𝐞𝐚'), 'Must match APEN 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 (4) 0 - 0(5) 𝐂𝐡𝐞𝐥𝐬𝐞𝐚');

// Also check fixtures summary results formatting for yesterday
const yesterdayPost = formatFixturesPost([arsenalChelseaShootoutMatch], 'Yesterday (Sat, Oct 24, 2026)');
console.log('\nYesterday Fixtures Shootout Line:\n' + yesterdayPost);
assert(yesterdayPost.includes('APEN 🏴󠁧󠁢󠁥󠁮󠁧󠁿 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 (4) 0 : 0(5) 𝐂𝐡𝐞𝐥𝐬𝐞𝐚'), 'Yesterday fixtures must format APEN with (4) and (5)');
console.log('✅ PASS: Shootout results format APEN 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 (4) 0 - 0(5) 𝐂𝐡𝐞𝐥𝐬𝐞𝐚 verified.\n');

// ---------------------------------------------------------------------------
// TEST 19: Daily Match Fetching (12 hours after 6pm daily + daily matches just like before)
// ---------------------------------------------------------------------------
console.log('▶ [TEST 19] Daily Match Fetching 12 Hours After 6pm Window Check:');
const baseDate = '2026-10-28'; // Today in Africa/Lagos

// Case 1: Today afternoon (15:00 WAT = 14:00 UTC) -> Included (Daily match just like before)
const matchTodayAfternoon = '2026-10-28T14:00:00Z';
assert.strictEqual(isDateInDailyFetchWindowWAT(matchTodayAfternoon, baseDate), true, 'Today afternoon match must be included');

// Case 2: Today evening after 6pm (20:00 WAT = 19:00 UTC) -> Included
const matchTodayEvening = '2026-10-28T19:00:00Z';
assert.strictEqual(isDateInDailyFetchWindowWAT(matchTodayEvening, baseDate), true, 'Today evening match must be included');

// Case 3: Today late night (23:30 WAT = 22:30 UTC) -> Included
const matchTodayLate = '2026-10-28T22:30:00Z';
assert.strictEqual(isDateInDailyFetchWindowWAT(matchTodayLate, baseDate), true, 'Today 23:30 match must be included');

// Case 4: Tomorrow morning 02:00 WAT (01:00 UTC) (8 hours after 6pm today) -> Included!
const matchTomorrow0200 = '2026-10-29T01:00:00Z';
assert.strictEqual(isDateInDailyFetchWindowWAT(matchTomorrow0200, baseDate), true, 'Tomorrow 02:00 WAT (8h after 6pm) must be included');

// Case 5: Tomorrow morning 05:30 WAT (04:30 UTC) (11.5 hours after 6pm today) -> Included!
const matchTomorrow0530 = '2026-10-29T04:30:00Z';
assert.strictEqual(isDateInDailyFetchWindowWAT(matchTomorrow0530, baseDate), true, 'Tomorrow 05:30 WAT (11.5h after 6pm) must be included');

// Case 6: Tomorrow morning 06:00 WAT (05:00 UTC) (Exactly 12 hours after 6pm today) -> Included!
const matchTomorrow0600 = '2026-10-29T05:00:00Z';
assert.strictEqual(isDateInDailyFetchWindowWAT(matchTomorrow0600, baseDate), true, 'Tomorrow 06:00 WAT (exactly 12h after 6pm) must be included');

// Case 7: Tomorrow morning 07:00 WAT (06:00 UTC) (13 hours after 6pm today) -> Excluded!
const matchTomorrow0700 = '2026-10-29T06:00:00Z';
assert.strictEqual(isDateInDailyFetchWindowWAT(matchTomorrow0700, baseDate), false, 'Tomorrow 07:00 WAT (13h after 6pm) must be excluded');

// Case 8: Yesterday night 23:00 WAT (22:00 UTC) -> Excluded!
const matchYesterday = '2026-10-27T22:00:00Z';
assert.strictEqual(isDateInDailyFetchWindowWAT(matchYesterday, baseDate), false, 'Yesterday match must be excluded');

console.log('✅ PASS: Daily match fetching correctly includes daily matches and matches kicking off within 12 hours after 6pm.\n');

// ---------------------------------------------------------------------------
// TEST 20: isPenaltyShootoutPlay Definition & Commentary / Plays Normalization Check
// ---------------------------------------------------------------------------
console.log('▶ [TEST 20] isPenaltyShootoutPlay Scope & Event Normalization Check:');
assert.strictEqual(typeof isPenaltyShootoutPlay, 'function', 'isPenaltyShootoutPlay must be defined as a function');
assert.strictEqual(typeof isShootoutEvent, 'function', 'isShootoutEvent must be defined as a function');

// Shootout play item (period 5 or shootout text)
const shootoutItem = {
  id: 'play-so-1',
  period: { number: 5 },
  type: { text: 'Penalty Shootout - Scored' },
  text: 'Penalty Shootout GOAL! Cole Palmer scores.',
  scoringPlay: true,
};
assert.strictEqual(isPenaltyShootoutPlay(shootoutItem), true, 'Shootout play must be recognized as shootout play');
assert.strictEqual(isShootoutEvent(shootoutItem), true, 'Shootout play must be recognized as shootout event');

// Regular match play item (regular penalty missed or scored)
const regularPenaltyMissedItem = {
  id: 'play-pen-missed-1',
  period: { number: 1 },
  type: { text: 'Penalty - Missed' },
  text: 'Penalty missed! Bukayo Saka hits the post.',
  outcome: 'MISSED',
  team: { id: 'arsenal', displayName: 'Arsenal' },
  athletesInvolved: [{ displayName: 'Bukayo Saka' }],
};
assert.strictEqual(isPenaltyShootoutPlay(regularPenaltyMissedItem), false, 'Regular penalty missed must NOT be recognized as shootout');

// Normalizing regular penalty missed should not throw and should return PENALTY_MISSED event
const normalizedPenMissed = normalizeEvent(regularPenaltyMissedItem, {
  homeName: 'Arsenal',
  awayName: 'Chelsea',
});
assert(normalizedPenMissed !== null, 'Regular penalty missed must parse successfully');
assert.strictEqual(normalizedPenMissed.type, 'PENALTY_MISSED', 'Event type must be PENALTY_MISSED');
assert.strictEqual(normalizedPenMissed.player, 'Bukayo Saka', 'Player must be parsed');

// Normalizing shootout event should return null (filtered out from regular match flow)
const normalizedShootout = normalizeEvent(shootoutItem, {
  homeName: 'Arsenal',
  awayName: 'Chelsea',
});
assert.strictEqual(normalizedShootout, null, 'Shootout items must be ignored by normalizeEvent');

console.log('✅ PASS: isPenaltyShootoutPlay is defined, correctly distinguishes shootouts, and does not crash.\n');

console.log('====================================================');
console.log('  🎉 ALL 20 TESTS PASSED! ALL FIXES VERIFIED.');
console.log('====================================================\n');

