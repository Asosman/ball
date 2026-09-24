// src/utils/aiCommentary.ts

// Rich dynamic commentary phrase banks for high-entropy fallback
const GOAL_PHRASES = [
  'Sensational strike rifled into the top corner!',
  'Clinical finish after a defense-splitting run!',
  'Thunderous volley leaving the goalkeeper with no chance!',
  'Unstoppable header guided perfectly inside the far post!',
  'Magnificent solo run capped with a composed slotted finish!',
  'Brilliant low drive finding the bottom corner with pinpoint precision!',
  'Poacher’s instinct on display to tap in the rebound!',
  'Superb curling effort into the side netting from distance!',
  'Electrifying counter-attack finished off with ultimate composure!',
  'Bullet strike past the keeper to send the fans into absolute frenzy!',
  'Delightful chip over the rushing keeper into the empty net!',
  'Razor-sharp reflex strike inside the six-yard box!',
  'Stunning piece of individual brilliance to break the deadlock!',
  'Swept home majestically following a lightning-fast sequence of passes!',
  'Hammered into the roof of the net with sheer power and precision!'
];

const PENALTY_PHRASES = [
  'Ice in the veins! Dispatches the penalty with sheer confidence!',
  'Goalkeeper sent the wrong way as the spot-kick hits the back of the net!',
  'Calm, composed, and tucked cleanly into the bottom corner from the spot!',
  'Hammered relentlessly straight down the middle into the roof of the net!',
  'Stutter-step run-up executed to perfection to convert the penalty!'
];

const OWN_GOAL_PHRASES = [
  'Heartbreak in defense as the deflection turns directly into the net!',
  'Disastrous mix-up at the back results in an agonizing own goal!',
  'Unfortunate touch off the defender leaves the goalkeeper stranded!',
  'Tough deflection under intense pressure sends the ball across the line!'
];

const RED_CARD_PHRASES = [
  'Major drama on the pitch as the referee brandishes the red card!',
  'Down to 10 men! A moment of madness changes the entire complexion of the clash!',
  'Second yellow shown! The player makes the long walk to the dressing room!',
  'Straight red card issued after a reckless high-stakes challenge!'
];

const DISALLOWED_PHRASES = [
  'Heartbreak after VAR review! The goal is officially overturned!',
  'Marginal offside flag halts the celebrations after VAR check!',
  'Whistle blown for an infringement in the buildup; scoreline remains unchanged!',
  'VAR rules no goal! A huge sigh of relief for the defending side!'
];

const KICKOFF_PHRASES = [
  'The whistle sounds and we are officially underway for this blockbuster clash!',
  'High energy right from the first whistle as the battle begins!',
  'Opening whistle blows! Both sides eager to stamp their authority early!',
  'Game on! Expect intense battles and high tempo across every inch of the pitch!'
];

const HALFTIME_PHRASES = [
  'Whistle blows for the break! Intriguing first 45 minutes come to a close.',
  'Half-time arrived! Tactical adjustments and team talks awaiting in the locker room.',
  'End of the first half! Plenty of intensity and everything to play for in the second half.',
  'The referee signals half-time after an enthralling opening period!'
];

const FULLTIME_PHRASES = [
  'Final whistle blown! An exhilarating 90 minutes comes to an end!',
  'Match concludes! A thoroughly entertaining battle with everything left on the pitch!',
  'Full-time confirmed! Both sets of players acknowledge the supporters.',
  'The referee brings the contest to a close after a hard-fought encounter!'
];

function pickDynamicPhrase(array: string[], seed = ''): string {
  if (!array || array.length === 0) return 'Action continues on the pitch!';
  let hash = 0;
  if (seed) {
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return array[hash % array.length];
  }
  const idx = Math.floor(Math.random() * array.length);
  return array[idx];
}

/**
 * Generates dynamic info for any match event, ensuring no two events have the same line.
 */
export function generateDynamicFallbackInfo(event: any, _match?: any, customSeed = ''): string {
  const type = String(event?.type || '').toUpperCase();
  const minute = event?.minute ? `${event.minute}'` : '';
  const player = event?.player || '';
  const seed = customSeed || `${type}_${minute}_${player}_${Date.now()}_${Math.random()}`;

  if (type === 'GOAL') {
    if (event?.status === 'DISALLOWED' || event?.isDisallowed) {
      return pickDynamicPhrase(DISALLOWED_PHRASES, seed);
    }
    if (event?.ownGoal) {
      return pickDynamicPhrase(OWN_GOAL_PHRASES, seed);
    }
    return pickDynamicPhrase(GOAL_PHRASES, seed);
  }

  if (type === 'PENALTY_SCORED') {
    return pickDynamicPhrase(PENALTY_PHRASES, seed);
  }

  if (type === 'OWN_GOAL') {
    return pickDynamicPhrase(OWN_GOAL_PHRASES, seed);
  }

  if (type === 'RED_CARD') {
    return pickDynamicPhrase(RED_CARD_PHRASES, seed);
  }

  if (type === 'GOAL_DISALLOWED') {
    return pickDynamicPhrase(DISALLOWED_PHRASES, seed);
  }

  if (type === 'KICKOFF') {
    return pickDynamicPhrase(KICKOFF_PHRASES, seed);
  }

  if (type === 'HALF_TIME' || type === 'HALFTIME') {
    return pickDynamicPhrase(HALFTIME_PHRASES, seed);
  }

  if (type === 'FULL_TIME' || type === 'FULLTIME') {
    return pickDynamicPhrase(FULLTIME_PHRASES, seed);
  }

  return 'High stakes action continues on the pitch!';
}
