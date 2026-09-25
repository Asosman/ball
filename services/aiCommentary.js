// services/aiCommentary.js
import { GoogleGenAI } from '@google/genai';

let aiClient = null;

function getAiClient() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch {
      aiClient = null;
    }
  }
  return aiClient;
}

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
  'Hammered into the roof of the net with sheer power and precision!',
  'Acrobatic finish leaving the defense completely static!',
  'Breathtaking swerve on the ball that completely deceived the keeper!',
  'Carved open with precision and guided effortlessly across the goal line!',
  'Pure venom in the strike from distance that crashes off the woodwork and in!',
  'Instinctive flick at the near post that catches everyone off guard!',
  'Chested down and buried with supreme technique and elegance!',
  'Ruthless predator in the box seizing upon the loose ball!',
  'Unbelievable trajectory from out wide that dips into the far netting!',
  'Laser-accurate drive through a crowded penalty box into the bottom corner!',
  'Explosive acceleration followed by an ice-cool finish under pressure!',
  'Sensational teamwork concluded with a sublime first-time finish!',
  'A thunderbolt of a strike that nearly tears the net apart!',
  'Precision, power, and perfection on full display with that finish!',
  'Dinked gracefully over the sprawling keeper to cap a flowing move!',
  'Defensive line breached and punished with ruthless efficiency!',
  'Spectacular half-volley driven cleanly into the corner pocket!',
  'Audacious strike executed with total authority and swagger!',
  'Pounced on the defensive hesitation and slotted home with ease!',
  'Sumptuous technique on display as the ball sails into the top bins!',
  'Glancing header that kisses the inside of the post on its way in!',
  'A moment of pure magic that brings the entire stadium to its feet!',
  'Picked out the top corner with mathematical precision from the edge of the area!',
  'Fierce low drive skidding off the turf beyond the outstretched glove!',
  'Ripped into the side netting after turning the defender inside out!',
  'Masterclass in finishing with a devastating strike into the net!'
];

const EARLY_GOAL_PHRASES = [
  'Flying out of the blocks with an explosive early breakthrough!',
  'Dream start! An early bolt from the blue stuns the defense!',
  'Sensational opener in the early exchanges sets an electric tempo!',
  'Lightning strike within the opening minutes blows the match wide open!',
  'Early statement of intent delivered with an unstoppable strike!'
];

const LATE_GOAL_PHRASES = [
  'Sensational late drama! A clutch strike that sends the crowd into delirium!',
  'Late heartbreak for the defense as the net ripples in the dying embers!',
  'Incredible scenes! A dramatic late goal completely transforms the contest!',
  'Clutch moment delivered with nerves of steel in the final stages!',
  'Agonizingly late breakthrough that could prove to be the decisive blow!'
];

const EQUALIZER_PHRASES = [
  'Instant response! Parity restored in breathtaking fashion!',
  'Back on level terms! Momentum swings decisively with that equalizer!',
  'Game on! The contest is blown wide open once again!',
  'Crucial leveling blow delivered right when their team needed it most!',
  'Parity restored as the equalizer ignites pure passion on the pitch!'
];

const EXTENDED_LEAD_PHRASES = [
  'Commanding advantage established with an emphatic finish!',
  'Extending the cushion with ruthless and unstoppable efficiency!',
  'Turning the screw! A comfortable cushion earned with true class!',
  'Dominance stamped on the scoreboard with another clinical strike!',
  'Cruising with confidence as the lead is doubled with authority!'
];

const ASSIST_HIGHLIGHT_PHRASES = [
  'Unselfish vision and a pinpoint delivery rewarded with a clinical finish!',
  'Carved open by an exquisite assist and tucked away with class!',
  'Sublime build-up play and a telepathic assist create magic on the pitch!',
  'Deliciously weighted delivery put on a silver platter for the finish!',
  'Vision of the highest order to craft the opportunity and bury the ball!'
];

const PENALTY_PHRASES = [
  'Ice in the veins! Dispatches the penalty with sheer confidence!',
  'Goalkeeper sent the wrong way as the spot-kick hits the back of the net!',
  'Calm, composed, and tucked cleanly into the bottom corner from the spot!',
  'Hammered relentlessly straight down the middle into the roof of the net!',
  'Stutter-step run-up executed to perfection to convert the penalty!',
  'Nerves of absolute steel! Sent the keeper diving hopelessly from twelve yards!',
  'Pressure? What pressure! Dispatches the spot-kick with supreme swagger!',
  'Smashed emphatically into the top corner leaving no doubt whatsoever!',
  'Ice-cold penalty conversion to shift momentum entirely in their favor!',
  'Side-foot composure from the spot as the ball nestles into the side netting!',
  'Spot-kick mastered with flawless technique under intense spotlight!',
  'Unforgiving power from the penalty spot that gives the keeper no chance!'
];

const OWN_GOAL_PHRASES = [
  'Heartbreak in defense as the deflection turns directly into the net!',
  'Disastrous mix-up at the back results in an agonizing own goal!',
  'Unfortunate touch off the defender leaves the goalkeeper stranded!',
  'Tough deflection under intense pressure sends the ball across the line!',
  'Agonizing moment in the penalty box as the cruel deflection finds the net!',
  'Disastrous misunderstanding at the back leads to an unfortunate own goal!',
  'Sheer cruelty of football on display as the ball deflects across the line!',
  'Despair for the defender as an errant touch trickles into their own goal!',
  'Unlucky deflection wrong-footing the goalkeeper under heavy attacking siege!',
  'Misfortune strikes at the back with a deflection that nestles into the net!'
];

const RED_CARD_PHRASES = [
  'Major drama on the pitch as the referee brandishes the red card!',
  'Down to 10! A moment of madness changes the entire complexion of the clash!',
  'Second yellow shown! The player makes the long walk to the dressing room!',
  'Straight red card issued after a reckless high-stakes challenge!',
  'Major turning point as the referee produces a straight red card!',
  'Down to ten! An uphill battle begins after an ill-timed challenge!',
  'Disaster struck! The dismissal puts massive pressure on the remaining ten!',
  'Tensions flare over the line and the referee reaches into the back pocket!',
  'A moment of recklessness proves costly as the red card is brandished!',
  'Marching orders issued! Numerical disadvantage to test their resolve!',
  'High drama on the pitch! A reckless challenge punished with expulsion!',
  'Referee shows no hesitation in brandishing the red card after the challenge!'
];

const DISALLOWED_PHRASES = [
  'Heartbreak after VAR review! The goal is officially overturned!',
  'Marginal offside flag halts the celebrations after VAR check!',
  'Whistle blown for an infringement in the buildup; scoreline remains unchanged!',
  'VAR rules no goal! A huge sigh of relief for the defending side!',
  'VAR heartbreak! The celebrations are abruptly cut short after video review!',
  'Cruel VAR blow! The initial joy is wiped away as the referee signals no goal!',
  'Whistle sounds after video review! Infringement identified and goal wiped off!',
  'Huge reprieve for the defending side as VAR overturns the goal decision!',
  'Screen check confirms no goal! The referee chalks it off following review!',
  'Celebrations extinguished! Review proves offside in the buildup!'
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

/**
 * Picks a pseudo-random yet deterministic phrase if given a seed key, or random
 */
function pickDynamicPhrase(array, seed = '') {
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
 * Generates an AI-powered or dynamic commentary info line for any football match event.
 * @param {object} event
 * @param {object} match
 * @returns {Promise<string>}
 */
export async function generateAiEventCommentary(event, match) {
  const type = (event.type || '').toUpperCase();
  const player = event.player || '';
  const assist = event.assist || '';
  const minute = event.minute ? `${event.minute}'` : '';
  const home = match.homeName || match.homeTeam || 'Home';
  const away = match.awayName || match.awayTeam || 'Away';
  const desc = event.text || event.description || '';

  const ai = getAiClient();
  if (ai) {
    try {
      const prompt = `You are a world-class live football commentator for Facebook. Write ONE single, dynamic, exciting, short commentary sentence (strictly 8-14 words max). Do NOT include labels like 'Info:', 'Commentary:', or hashtags. Event details: Match: ${home} vs ${away}, Event: ${type}, Player: ${player}, Assist: ${assist}, Minute: ${minute}, Details: ${desc}`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      const text = response?.text?.trim();
      if (text) {
        // Clean any prefixes or quotes
        const cleaned = text
          .replace(/^(Info|Commentary|Note|Update):\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .replace(/#\w+/g, '')
          .trim();
        if (cleaned.length >= 10 && cleaned.length <= 150) {
          return cleaned;
        }
      }
    } catch {
      // Fallback to high-entropy dynamic generator
    }
  }

  // Dynamic fallback per event type with unique seed based on minute, player, and timestamp
  const seed = `${type}_${minute}_${player}_${assist}_${Date.now()}_${Math.random()}`;
  return generateDynamicFallbackInfo(event, match, seed);
}

/**
 * Synchronous dynamic fallback generator ensuring no two events get the same info line.
 */
export function generateDynamicFallbackInfo(event, match = {}, customSeed = '') {
  const type = (event.type || '').toUpperCase();
  const minuteNum = typeof event.minute === 'number' ? event.minute : parseInt(event.minute || '0', 10);
  const minute = event.minute ? `${event.minute}'` : '';
  const player = event.player || '';
  const assist = event.assist || '';
  const seed = customSeed || `${type}_${minute}_${player}_${assist}_${event.eventId || ''}_${Date.now()}_${Math.random()}`;

  const homeScore = event.scoreAfterEvent?.home ?? match?.score?.home ?? 0;
  const awayScore = event.scoreAfterEvent?.away ?? match?.score?.away ?? 0;

  if (type === 'GOAL') {
    if (event.status === 'DISALLOWED' || event.isDisallowed) {
      return pickDynamicPhrase(DISALLOWED_PHRASES, seed);
    }
    if (event.ownGoal) {
      return pickDynamicPhrase(OWN_GOAL_PHRASES, seed);
    }

    // Build situational phrase pool for this specific match moment
    let contextualPool = [...GOAL_PHRASES];

    if (minuteNum > 0 && minuteNum <= 15) {
      contextualPool = [...EARLY_GOAL_PHRASES, ...contextualPool];
    } else if (minuteNum >= 80) {
      contextualPool = [...LATE_GOAL_PHRASES, ...contextualPool];
    }

    if (assist) {
      contextualPool = [...ASSIST_HIGHLIGHT_PHRASES, ...contextualPool];
    }

    if (homeScore > 0 && homeScore === awayScore) {
      contextualPool = [...EQUALIZER_PHRASES, ...contextualPool];
    } else if (Math.abs(homeScore - awayScore) >= 2) {
      contextualPool = [...EXTENDED_LEAD_PHRASES, ...contextualPool];
    }

    return pickDynamicPhrase(contextualPool, seed);
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
