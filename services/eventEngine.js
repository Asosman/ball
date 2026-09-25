// services/eventEngine.js
import { buildMatchHashtags } from '../utils/hashtags.js';
import logger from '../utils/logger.js';
import config from '../config/env.js';
import { getMatchFlag } from '../utils/flags.js';
import { generateDynamicFallbackInfo } from './aiCommentary.js';

/**
 * Strict Event Whitelist
 * Only events explicitly listed in this set are permitted to generate Facebook posts.
 * Everything else (injuries, substitutions, yellow cards, generic status changes, etc.) is ignored.
 */
export const WHITELISTED_EVENT_TYPES = new Set([
  'LINEUP',
  'KICKOFF',
  'GOAL',
  'OWN_GOAL',
  'PENALTY_SCORED',
  'RED_CARD',
  'GOAL_DISALLOWED',
  'HALF_TIME',
  'FULL_TIME',
  'EXTRA_TIME',
  'AFTER_EXTRA_TIME_OR_SHOOTOUT',
]);

/**
 * Checks whether an event qualifies under the strict event whitelist.
 * @param {object} ev
 * @returns {boolean}
 */
export function isWhitelistedEvent(ev) {
  if (!ev || !ev.type) return false;
  // Penalty shootouts are post-match tiebreakers. Shootout kicks are NEVER match goals or in-game penalties.
  if (ev.period === 5 || ev.isShootout || ev.shootoutPlay) {
    return false;
  }
  const text = (ev.text || ev.description || '').toLowerCase();
  if (text.includes('penalty shootout') || /\b\d+\s*\(\d+\)/.test(text)) {
    return false;
  }
  const type = ev.type.toUpperCase();
  if (WHITELISTED_EVENT_TYPES.has(type)) return true;
  if (type === 'OWN_GOAL') return true;
  if (type === 'HALFTIME' || type === 'HALF_TIME' || type === 'HALF-TIME' || type === 'HALF TIME' || type === 'HT') return true;
  if (type === 'FULLTIME' || type === 'FULL_TIME' || type === 'FULL_TIME_PENDING_ET') return true;
  if (type === 'EXTRA_TIME_START' || type === 'EXTRA_TIME') return true;
  if (type === 'FULL_TIME_POST_ET' || type === 'AFTER_EXTRA_TIME_OR_SHOOTOUT') return true;
  return false;
}

export const EVENT_EMOJIS = {
  LINEUP: '📋',
  KICKOFF: '🟢',
  GOAL: '⚽',
  OWN_GOAL: '😱',
  PENALTY_SCORED: '🥅',
  RED_CARD: '🟥',
  GOAL_DISALLOWED: '🚨',
  HALF_TIME: '⏱️',
  FULL_TIME: '🏁',
  EXTRA_TIME: '⏱️',
  AFTER_EXTRA_TIME_OR_SHOOTOUT: '🏆',
};

/**
 * Converts a standard string to Unicode Mathematical Bold characters.
 * @param {string} str
 * @returns {string}
 */
export function makeUnicodeBold(str) {
  if (!str) return '';
  return str.split('').map(char => {
    const code = char.charCodeAt(0);
    // Uppercase A-Z (65-90) -> 1D400 (120064)
    if (code >= 65 && code <= 90) {
      return String.fromCodePoint(0x1D400 + (code - 65));
    }
    // Lowercase a-z (97-122) -> 1D41A (120090)
    if (code >= 97 && code <= 122) {
      return String.fromCodePoint(0x1D41A + (code - 97));
    }
    // Digits 0-9 (48-57) -> 1D7CE (120782)
    if (code >= 48 && code <= 57) {
      return String.fromCodePoint(0x1D7CE + (code - 48));
    }
    return char;
  }).join('');
}

/**
 * Parses goal scoreline directly from commentary or play text.
 * E.g. "Goal! Platense 1, Fluminense 0. Guido Mainero (Platense)..." -> { home: 1, away: 0 }
 * @param {string} text
 * @param {string} homeName
 * @param {string} awayName
 * @returns {{ home: number, away: number } | null}
 */
export function parseGoalScoreFromText(text, homeName, awayName) {
  if (!text) return null;
  const cleanH = (homeName || '').replace(/^\(w\)\s*/i, '').toLowerCase().trim();
  const cleanA = (awayName || '').replace(/^\(w\)\s*/i, '').toLowerCase().trim();
  const hLower = (homeName || '').toLowerCase().trim();
  const aLower = (awayName || '').toLowerCase().trim();

  // Pattern 1: Team names with score e.g. "Arsenal 1, Chelsea 0" or "Goal! Arsenal 1, Chelsea 0." or "Own Goal by Sven Botman, Newcastle United. Manchester United 1, Newcastle United 0."
  const p1 = text.match(/(?:Goal!.*?\b|Own\s*Goal.*?\b|\b)([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+),\s*([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+)/i);
  if (p1) {
    const t1 = p1[1].trim().toLowerCase();
    const s1 = parseInt(p1[2], 10);
    const t2 = p1[3].trim().toLowerCase();
    const s2 = parseInt(p1[4], 10);

    const matchesHomeT1 = (cleanH && (t1.includes(cleanH) || cleanH.includes(t1))) || (hLower && (t1.includes(hLower) || hLower.includes(t1)));
    const matchesAwayT2 = (cleanA && (t2.includes(cleanA) || cleanA.includes(t2))) || (aLower && (t2.includes(aLower) || aLower.includes(t2)));
    const matchesAwayT1 = (cleanA && (t1.includes(cleanA) || cleanA.includes(t1))) || (aLower && (t1.includes(aLower) || aLower.includes(t1)));
    const matchesHomeT2 = (cleanH && (t2.includes(cleanH) || cleanH.includes(t2))) || (hLower && (t2.includes(hLower) || hLower.includes(t2)));

    if (matchesHomeT1 || matchesAwayT2) {
      return { home: s1, away: s2 };
    } else if (matchesAwayT1 || matchesHomeT2) {
      return { home: s2, away: s1 };
    }
    return { home: s1, away: s2 };
  }

  // Pattern 2: Scoreline in text e.g. "1-0" or "(1 - 0)" or "1–0"
  const p2 = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (p2) {
    const s1 = parseInt(p2[1], 10);
    const s2 = parseInt(p2[2], 10);
    const afterMatch = text.slice(p2.index + p2[0].length, p2.index + p2[0].length + 10).toLowerCase();
    if (s1 <= 15 && s2 <= 15 && !afterMatch.includes('yard') && !afterMatch.includes('met') && !afterMatch.includes('ft')) {
      return { home: s1, away: s2 };
    }
  }

  return null;
}

/**
 * Determines whether the home or away team scored based on multiple attributes:
 * teamId, teamName, commentary text parenthetical team, and lineups.
 * @param {object} ev
 * @param {object} currentMatch
 * @returns {'home' | 'away' | null}
 */
export function detectScoringTeam(ev, currentMatch) {
  const rawHome = (currentMatch.homeName || currentMatch.homeTeam || '').toLowerCase().trim();
  const rawAway = (currentMatch.awayName || currentMatch.awayTeam || '').toLowerCase().trim();
  const homeName = rawHome.replace(/^\(w\)\s*/i, '').trim();
  const awayName = rawAway.replace(/^\(w\)\s*/i, '').trim();
  const homeId = String(currentMatch.homeId || currentMatch.raw?.homeId || '').toLowerCase().trim();
  const awayId = String(currentMatch.awayId || currentMatch.raw?.awayId || '').toLowerCase().trim();

  const evTeamId = String(ev.teamId || '').toLowerCase().trim();
  const evTeamName = String(ev.teamName || ev.team || '').toLowerCase().trim();
  const player = String(ev.player || '').toLowerCase().trim();
  const text = String(ev.text || ev.description || '').toLowerCase();

  // 1. By Team ID
  if (homeId && evTeamId === homeId) return 'home';
  if (awayId && evTeamId === awayId) return 'away';
  if (evTeamId === 'home') return 'home';
  if (evTeamId === 'away') return 'away';

  // 2. By Team Name
  if (evTeamName) {
    if (homeName && (evTeamName.includes(homeName) || homeName.includes(evTeamName))) return 'home';
    if (awayName && (evTeamName.includes(awayName) || awayName.includes(evTeamName))) return 'away';
  }

  // 3. By Team in parentheses in commentary text e.g. "Guido Mainero (Platense)"
  const parenMatch = (ev.text || '').match(/\(([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\)/);
  if (parenMatch) {
    const pTeam = parenMatch[1].toLowerCase().trim();
    if (homeName && (pTeam.includes(homeName) || homeName.includes(pTeam))) return 'home';
    if (awayName && (pTeam.includes(awayName) || awayName.includes(pTeam))) return 'away';
  }

  // 4. By Player in Lineups / Rosters
  if (player) {
    const inHome = (currentMatch.lineups?.home || []).some((p) => {
      const pl = String(p).toLowerCase();
      return pl.includes(player) || player.includes(pl);
    });
    if (inHome) return 'home';

    const inAway = (currentMatch.lineups?.away || []).some((p) => {
      const pl = String(p).toLowerCase();
      return pl.includes(player) || player.includes(pl);
    });
    if (inAway) return 'away';
  }

  // 5. Team name mentioned in free text
  if (homeName && text.includes(homeName) && (!awayName || !text.includes(awayName))) return 'home';
  if (awayName && text.includes(awayName) && (!homeName || !text.includes(homeName))) return 'away';

  return null;
}

/**
 * Formats a team name for Starting XI post (with (𝐖) prefix for women teams if specified)
 * @param {string} teamName
 * @returns {string}
 */
export function formatTeamNameForStartingXI(teamName) {
  if (!teamName) return '';
  const isWomen = /^\(w\)\s*/i.test(teamName) || /\s*\(w\)$/i.test(teamName);
  const cleanName = teamName.replace(/^\(w\)\s*/i, '').replace(/\s*\(w\)$/i, '').trim();
  const boldName = makeUnicodeBold(cleanName.toUpperCase());
  return isWomen ? `(𝐖) ${boldName}` : boldName;
}

/**
 * Matches a player name against official match lineups / squad lists.
 * Returns the official matched player name if found, or null.
 * @param {string} targetName
 * @param {string[]} lineupList
 * @returns {string|null}
 */
export function findMatchingLineupPlayer(targetName, lineupList = []) {
  if (!targetName || typeof targetName !== 'string') return null;
  const cleanTarget = targetName.toLowerCase().trim().replace(/^(mr|coach|manager)\.?\s+/i, '');
  if (!cleanTarget || cleanTarget.length < 2) return null;

  const targetParts = cleanTarget.split(/\s+/).filter(Boolean);
  const targetSurname = targetParts[targetParts.length - 1];

  for (const candidate of lineupList) {
    if (!candidate || typeof candidate !== 'string') continue;
    const cleanCand = candidate.toLowerCase().trim();
    if (cleanCand === cleanTarget) return candidate;

    // Full name inclusion
    if (cleanCand.includes(cleanTarget) || cleanTarget.includes(cleanCand)) {
      return candidate;
    }

    // Match surname if surname is at least 3 letters
    const candParts = cleanCand.split(/\s+/).filter(Boolean);
    const candSurname = candParts[candParts.length - 1];
    if (targetSurname.length >= 3 && candSurname === targetSurname) {
      return candidate;
    }
  }

  return null;
}

/**
 * Builds the Facebook post body for an allowed in-game event.
 * @param {object} event
 * @param {object} currentMatch
 * @param {string} [customInfoLine]
 * @returns {string}
 */
export function formatEventPost(event, currentMatch, customInfoLine) {
  const clock = event.minute !== undefined && event.minute !== null ? `${event.minute}'` : (currentMatch.status?.clock || 'Live');
  const home = makeUnicodeBold(currentMatch.homeName || currentMatch.homeTeam || 'Home');
  const away = makeUnicodeBold(currentMatch.awayName || currentMatch.awayTeam || 'Away');
  
  // CRITICAL SCORE RULE:
  // Each goal event must preserve the score immediately after THAT event.
  // NEVER replace historical event scores with the current match score!
  let homeScore = event.scoreAfterEvent?.home ?? event.homeScore ?? (currentMatch.score?.home ?? 0);
  let awayScore = event.scoreAfterEvent?.away ?? event.awayScore ?? (currentMatch.score?.away ?? 0);

  const type = (event.type || '').toUpperCase();

  // CRITICAL SAFEGUARD: A goal, own goal, or penalty scored event can NEVER display 0 - 0!
  if ((type === 'GOAL' || type === 'OWN_GOAL' || type === 'PENALTY_SCORED') && (event.status !== 'DISALLOWED' && !event.isDisallowed) && homeScore === 0 && awayScore === 0) {
    if (currentMatch.score && (currentMatch.score.home > 0 || currentMatch.score.away > 0)) {
      homeScore = currentMatch.score.home;
      awayScore = currentMatch.score.away;
    } else {
      const parsed = parseGoalScoreFromText(event.text || event.description, currentMatch.homeName, currentMatch.awayName);
      if (parsed && (parsed.home > 0 || parsed.away > 0)) {
        homeScore = parsed.home;
        awayScore = parsed.away;
      } else {
        const scoringTeam = detectScoringTeam(event, currentMatch);
        const isOwnGoal = Boolean(event.ownGoal || type === 'OWN_GOAL');
        if (scoringTeam === 'away') {
          if (isOwnGoal) {
            homeScore = 1;
          } else {
            awayScore = 1;
          }
        } else {
          if (isOwnGoal) {
            awayScore = 1;
          } else {
            homeScore = 1;
          }
        }
      }
    }
  }

  let eventHeader = '📢 MATCH EVENT!';
  let eventLine = customInfoLine || generateDynamicFallbackInfo(event, currentMatch);
  const detailLines = [];

  switch (type) {
    case 'KICKOFF':
      eventHeader = '🟢 KICK-OFF! WE ARE UNDERWAY! 🔥';
      if (!customInfoLine) eventLine = generateDynamicFallbackInfo(event, currentMatch);
      break;

    case 'OWN_GOAL':
      eventHeader = '😱 𝐎𝐖𝐍 𝐆𝐎𝐀𝐋! 🤦‍♂️📉';
      if (!customInfoLine) eventLine = generateDynamicFallbackInfo(event, currentMatch);
      if (event.player) {
        const teamSuffix = event.teamName ? ` (${event.teamName})` : '';
        detailLines.push(`🤦‍♂️ ${makeUnicodeBold(event.player)}${teamSuffix} (OG)`);
      }
      break;

    case 'GOAL':
      if (event.status === 'DISALLOWED' || event.isDisallowed) {
        eventHeader = '🚨 GOAL DISALLOWED! VAR DECISION! 📺❌';
        if (!customInfoLine) eventLine = generateDynamicFallbackInfo(event, currentMatch);
        if (event.player) {
          detailLines.push(`❌ ${makeUnicodeBold(event.player)}`);
        }
        if (event.disallowedReason || event.reason) {
          detailLines.push(`📺 ${event.disallowedReason || event.reason}`);
        }
        break;
      }
      if (event.ownGoal) {
        eventHeader = '😱 𝐎𝐖𝐍 𝐆𝐎𝐀𝐋! 🤦‍♂️📉';
        if (!customInfoLine) eventLine = generateDynamicFallbackInfo(event, currentMatch);
        if (event.player) {
          const teamSuffix = event.teamName ? ` (${event.teamName})` : '';
          detailLines.push(`🤦‍♂️ ${makeUnicodeBold(event.player)}${teamSuffix} (OG)`);
        }
        break;
      }
      eventHeader = '🔥 GOOOOALLLLL! ⚽💥';
      if (!customInfoLine) eventLine = generateDynamicFallbackInfo(event, currentMatch);
      if (event.player) {
        detailLines.push(`⚽ ${makeUnicodeBold(event.player)}`);
      }
      if (event.assist) {
        detailLines.push(`👟 ${event.assist}`);
      }
      break;

    case 'PENALTY_SCORED':
      if (event.status === 'DISALLOWED' || event.isDisallowed) {
        eventHeader = '🚨 PENALTY GOAL DISALLOWED! VAR DECISION! 📺❌';
        if (!customInfoLine) eventLine = generateDynamicFallbackInfo(event, currentMatch);
        if (event.player) {
          detailLines.push(`❌ ${makeUnicodeBold(event.player)}`);
        }
        if (event.disallowedReason || event.reason) {
          detailLines.push(`📺 ${event.disallowedReason || event.reason}`);
        }
        break;
      }
      eventHeader = '⚽ PENALTY SCORED! ICE COLD! 🥶🥅';
      if (!customInfoLine) eventLine = generateDynamicFallbackInfo(event, currentMatch);
      if (event.player) {
        detailLines.push(`⚽ ${makeUnicodeBold(event.player)} (Penalty)`);
      }
      // Note: Penalty goals strictly do not have an assist per soccer conventions
      break;

    case 'RED_CARD':
      eventHeader = '🟥 RED CARD! DRAMA IN THE MATCH! 🤯';
      if (!customInfoLine) eventLine = generateDynamicFallbackInfo(event, currentMatch);
      if (event.player) {
        detailLines.push(`🟥 ${makeUnicodeBold(event.player)}`);
      }
      break;

    case 'GOAL_DISALLOWED':
      eventHeader = '🚨 GOAL DISALLOWED! VAR DECISION! 📺❌';
      if (!customInfoLine) eventLine = generateDynamicFallbackInfo(event, currentMatch);
      if (event.player) {
        detailLines.push(`❌ ${makeUnicodeBold(event.player)}`);
      }
      if (event.disallowedReason || event.reason || event.text) {
        detailLines.push(`📺 ${event.disallowedReason || event.reason || event.text}`);
      }
      break;

    case 'HALF_TIME':
    case 'HALFTIME':
      eventHeader = '⏱️ HALF-TIME WHISTLE! ⏸️';
      if (!customInfoLine) eventLine = generateDynamicFallbackInfo(event, currentMatch);
      break;

    case 'FULL_TIME':
    case 'FULLTIME':
    case 'FULL_TIME_PENDING_ET':
      eventHeader = '🏁 FULL-TIME! 90 MINUTES COMPLETE! 🏆';
      if (!customInfoLine) eventLine = generateDynamicFallbackInfo(event, currentMatch);
      break;

    case 'EXTRA_TIME':
    case 'EXTRA_TIME_START':
      eventHeader = '⏱️ EXTRA TIME UNDERWAY! ⚔️🔥';
      if (!customInfoLine) eventLine = 'Extra time underway! 30 additional minutes of high-stakes play!';
      break;

    case 'AFTER_EXTRA_TIME_OR_SHOOTOUT':
    case 'FULL_TIME_POST_ET': {
      const shootout = currentMatch.shootout || event.shootout;
      if (shootout && shootout.home !== undefined && shootout.away !== undefined) {
        eventHeader = '🏆 MATCH DECIDED ON PENALTIES! FINAL RESULT! 🧤⚽';
        if (!customInfoLine) eventLine = 'Final whistle after extra time and penalty shootout!';
        detailLines.push(`Score after Extra Time: ${home} ${homeScore} - ${awayScore} ${away}`);
        detailLines.push(`Penalty Shootout: ${home} ${shootout.home} - ${shootout.away} ${away}`);
      } else {
        eventHeader = '🏁 FINAL WHISTLE AFTER EXTRA TIME! 🏆🔥';
        if (!customInfoLine) eventLine = `Match finished after extra time! (${homeScore} - ${awayScore})`;
      }
      break;
    }

    default:
      eventHeader = `📢 MATCH EVENT: ${type}`;
      eventLine = `Action underway on the pitch!`;
  }

  const customHashtags = buildMatchHashtags(currentMatch.homeName, currentMatch.awayName, currentMatch.leagueName);
  const boldHeader = makeUnicodeBold(eventHeader);

  const isHalfTime = (type === 'HALF_TIME' || type === 'HALFTIME' || type === 'HT');
  const isFullTime = (type === 'FULL_TIME' || type === 'FULLTIME' || type === 'FULL_TIME_PENDING_ET' || type === 'FT' || type === 'AFTER_EXTRA_TIME_OR_SHOOTOUT' || type === 'FULL_TIME_POST_ET');

  if (isHalfTime) {
    const sections = [
      `⚡ ${boldHeader} ⚡`,
      `━━━━━━━━━━━━━━━━━━━`,
      `HT ${home} ${homeScore} - ${awayScore} ${away}`,
    ];
    if (detailLines.length > 0) {
      sections.push(detailLines.join('\n'));
    }
    // Info removed from half-time per user instruction
    sections.push(`━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for more updates! 👇\n\n${customHashtags}`);
    return sections.join('\n');
  }

  if (isFullTime) {
    const sections = [
      `⚡ ${boldHeader} ⚡`,
      `━━━━━━━━━━━━━━━━━━━`,
      `FT ${home} ${homeScore} - ${awayScore} ${away}`,
    ];
    if (detailLines.length > 0) {
      sections.push(detailLines.join('\n'));
    }
    // Info removed from full-time per user instruction
    sections.push(`━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for more updates! 👇\n\n${customHashtags}`);
    return sections.join('\n');
  }

  const sections = [
    `⚡ ${boldHeader} ⚡`,
    `━━━━━━━━━━━━━━━━━━━`,
    `⏱️ ${clock}`,
    `${home} ${homeScore} - ${awayScore} ${away}`,
  ];

  if (detailLines.length > 0) {
    sections.push(detailLines.join('\n'));
  }

  const isKickoff = (type === 'KICKOFF');
  // Info removed from kick-off per user instruction; retained for other match events
  if (!isKickoff && eventLine) {
    sections.push(`📝 ${eventLine}`);
  }

  sections.push(`━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for more updates! 👇\n\n${customHashtags}`);

  return sections.join('\n');
}

/**
 * Builds the lineup post body.
 * Formatting:
 * (𝐖) 𝐌𝐀𝐍𝐂𝐇𝐄𝐒𝐓𝐄𝐑 𝐔𝐍𝐈𝐓𝐄𝐃 startingXI; player1, player2, ...
 *
 * (𝐖) 𝐒𝐇𝐄𝐅𝐅𝐈𝐄𝐋𝐃 𝐔𝐍𝐈𝐓𝐄𝐃 startingXI; player1, player2, ...
 * ━━━━━━━━━━━━━━━━━━━
 * 👉 Who is winning this clash? Leave your predictions below! 👇
 * #Livescore #FootballNews #Matchday #LiveScore
 *
 * @param {object} currentMatch
 * @param {string[]} homeLineup
 * @param {string[]} awayLineup
 * @returns {string}
 */
export function formatLineupPost(currentMatch, homeLineup, awayLineup) {
  const homeHeader = formatTeamNameForStartingXI(currentMatch.homeName || currentMatch.homeTeam || 'Home');
  const awayHeader = formatTeamNameForStartingXI(currentMatch.awayName || currentMatch.awayTeam || 'Away');
  
  const homeSection = `${homeHeader} startingXI; ${homeLineup.join(', ')}`;
  const awaySection = `${awayHeader} startingXI; ${awayLineup.join(', ')}`;
  const hashtags = buildMatchHashtags(currentMatch.homeName, currentMatch.awayName, currentMatch.leagueName);

  return [
    homeSection,
    '',
    awaySection,
    '━━━━━━━━━━━━━━━━━━━',
    '👉 Who is winning this clash? Leave your predictions below! 👇',
    hashtags,
  ].join('\n');
}

/**
 * Detects whether a competition / match belongs to the "Top Leagues" category (including Saudi Pro League).
 * All other leagues in the world are classified into "Lower/World Leagues".
 * @param {object} match
 * @returns {boolean}
 */
export function isTopLeague(match) {
  if (!match) return false;
  const slug = String(match.leagueSlug || match.slug || match.resolvedLeagueSlug || '').toLowerCase();
  const name = String(match.leagueName || match.league || match.name || '').toLowerCase();

  // 1. Explicit Saudi Pro League inclusion as requested
  if (
    slug.startsWith('sau.') ||
    slug.startsWith('ksa.') ||
    name.includes('saudi') ||
    name.includes('roshn')
  ) {
    return true;
  }

  // 2. England Premier League, FA Cup, Carabao Cup
  if (
    slug === 'eng.1' ||
    slug === 'eng.fa' ||
    slug === 'eng.league_cup' ||
    (name.includes('premier league') && !name.includes('women') && !name.includes('wsl') && !name.includes('egyptian') && !name.includes('cymru')) ||
    name === 'english premier league' ||
    name === 'fa cup' ||
    name === 'carabao cup'
  ) {
    return true;
  }

  // 3. Spain LaLiga, Copa del Rey
  if (
    slug === 'esp.1' ||
    slug === 'esp.copa_del_rey' ||
    slug === 'esp.super_cup' ||
    (name.includes('laliga') && !name.includes('2') && !name.includes('hypermotion')) ||
    name.includes('spanish laliga') ||
    name === 'copa del rey'
  ) {
    return true;
  }

  // 4. Italy Serie A, Coppa Italia
  if (
    slug === 'ita.1' ||
    slug === 'ita.coppa_italia' ||
    slug === 'ita.super_cup' ||
    (name.includes('serie a') && !name.includes('brazil') && !name.includes('femminile')) ||
    name.includes('italian serie a') ||
    name === 'coppa italia'
  ) {
    return true;
  }

  // 5. Germany Bundesliga, DFB-Pokal
  if (
    slug === 'ger.1' ||
    slug === 'ger.dfb_pokal' ||
    slug === 'ger.super_cup' ||
    (name.includes('bundesliga') && !name.includes('2.') && !name.includes('austrian') && !name.includes('frauen')) ||
    name.includes('german bundesliga') ||
    name === 'dfb-pokal'
  ) {
    return true;
  }

  // 6. France Ligue 1, Coupe de France
  if (
    slug === 'fra.1' ||
    slug === 'fra.coupe_de_france' ||
    slug === 'fra.super_cup' ||
    (name.includes('ligue 1') && !name.includes('orange') && !name.includes('femmes')) ||
    name.includes('french ligue 1') ||
    name === 'coupe de france'
  ) {
    return true;
  }

  // 7. UEFA Tier 1 Competitions (Senior Men's)
  if (
    slug === 'uefa.champions' ||
    slug === 'uefa.europa' ||
    slug === 'uefa.europa.conf' ||
    slug === 'uefa.super_cup' ||
    name.includes('uefa champions league') ||
    name.includes('uefa europa league') ||
    name.includes('uefa conference league') ||
    name.includes('uefa europa conference league') ||
    name.includes('uefa super cup')
  ) {
    if (!name.includes('women') && !name.includes('youth') && !slug.includes('wchampions')) {
      return true;
    }
  }

  // 8. Major Senior International / Continental
  if (
    slug === 'fifa.world' ||
    slug === 'fifa.cwc' ||
    slug === 'uefa.euro' ||
    slug === 'uefa.nations' ||
    slug === 'caf.nations' ||
    slug === 'conmebol.america' ||
    slug === 'conmebol.libertadores' ||
    name.includes('fifa world cup') ||
    name.includes('club world cup') ||
    name.includes('copa libertadores') ||
    name.includes('copa america') ||
    name.includes('copa américa') ||
    name.includes('africa cup of nations') ||
    name.includes('uefa nations league') ||
    name.includes('uefa european championship')
  ) {
    if (!name.includes('women') && !name.includes('u20') && !name.includes('u17') && !name.includes('qualifying')) {
      return true;
    }
  }

  return false;
}

/**
 * Splits an array of matches into Top Leagues (incl. Saudi Pro League) and Lower/World Leagues.
 * @param {any[]} matches
 * @returns {{ top: any[], low: any[] }}
 */
export function splitMatchesByTier(matches = []) {
  const top = [];
  const low = [];
  for (const m of matches) {
    if (isTopLeague(m)) {
      top.push(m);
    } else {
      low.push(m);
    }
  }
  return { top, low };
}

/**
 * Builds today's fixtures summary post grouped by competition.
 * Supports options.category: 'top' | 'low' for dedicated posts.
 * @param {any[]} matches
 * @param {string} dateDisplay
 * @param {object} [options={}]
 * @returns {string}
 */
export function formatFixturesPost(matches, dateDisplay, options = {}) {
  const isYesterday = dateDisplay.toLowerCase().includes('yesterday');
  const category = options.category;
  const grouped = {};
  for (const m of matches) {
    const comp = m.leagueName || 'Football';
    if (!grouped[comp]) grouped[comp] = [];
    grouped[comp].push(m);
  }

  let titleText = isYesterday ? 'RESULTS ARE IN!' : "TODAY'S FOOTBALL FIXTURES!";
  if (!isYesterday && category === 'top') {
    titleText = "TODAY'S FOOTBALL FIXTURES — TOP LEAGUES!";
  } else if (!isYesterday && category === 'low') {
    titleText = "TODAY'S FOOTBALL FIXTURES — WORLD LEAGUES!";
  } else if (isYesterday && category === 'top') {
    titleText = "YESTERDAY'S RESULTS — TOP LEAGUES!";
  } else if (isYesterday && category === 'low') {
    titleText = "YESTERDAY'S RESULTS — WORLD LEAGUES!";
  }

  const titleEmoji = isYesterday ? `🏆 ${makeUnicodeBold(titleText)} ⚽🔥` : `🔥 ${makeUnicodeBold(titleText)} ⚽📅`;

  let subtitleText = "Don't miss any of the action!";
  if (isYesterday) {
    if (category === 'top') {
      subtitleText = "Top Leagues & Saudi Pro League Final Scores";
    } else if (category === 'low') {
      subtitleText = "Global & Lower Leagues Final Scores";
    } else {
      subtitleText = "Yesterday's Final Scores";
    }
  } else if (category === 'top') {
    subtitleText = "Top Leagues & Saudi Pro League Action!";
  } else if (category === 'low') {
    subtitleText = "Global & Lower Leagues Worldwide!";
  }
  const subtitleEmoji = isYesterday ? `📅 ${makeUnicodeBold(subtitleText)}` : `📢 ${makeUnicodeBold(subtitleText)}`;
  
  const lines = [
    `⚡ ${titleEmoji} ⚡`,
    `━━━━━━━━━━━━━━━━━━━`,
    `📅 Date: ${dateDisplay}`,
    `📢 ${subtitleEmoji}`,
    `🕐 All times are in West Africa Time (WAT)`,
  ];

  for (const [league, groupMatches] of Object.entries(grouped)) {
    lines.push(`🏆 ${makeUnicodeBold(league.toUpperCase())}`);
    groupMatches.forEach((m) => {
      const homeBold = makeUnicodeBold(m.homeName);
      const awayBold = makeUnicodeBold(m.awayName);
      const flag = getMatchFlag(m);
      if (isYesterday) {
        lines.push(`FT ${flag} ${homeBold} ${m.score?.home ?? 0} : ${m.score?.away ?? 0} ${awayBold}`);
      } else {
        lines.push(`${m.kickoffFormattedWAT || 'TBD'} ${flag} ${homeBold} vs ${awayBold}`);
      }
    });
  }

  const standardHashtags = '#Livescore #FootballNews #Matchday #LiveScore';
  const callToAction = isYesterday
    ? '💬 What do you think about the scorelines? 👇'
    : '💬 Drop your predictions and thoughts below! 👇';

  lines.push(`━━━━━━━━━━━━━━━━━━━`);
  lines.push(callToAction);
  lines.push(standardHashtags);

  return lines.join('\n');
}

/**
 * Creates the dedicated Today's Fixtures post for Top Leagues (including Saudi Pro League).
 * @param {any[]} matches
 * @param {string} dateDisplay
 * @returns {string}
 */
export function formatTodayTopFixturesPost(matches, dateDisplay) {
  const topMatches = matches.some(m => !isTopLeague(m)) ? matches.filter(isTopLeague) : matches;
  return formatFixturesPost(topMatches, dateDisplay, { category: 'top' });
}

/**
 * Creates the dedicated Today's Fixtures post for Lower / Other Leagues worldwide.
 * @param {any[]} matches
 * @param {string} dateDisplay
 * @returns {string}
 */
export function formatTodayLowFixturesPost(matches, dateDisplay) {
  const lowMatches = matches.some(isTopLeague) ? matches.filter(m => !isTopLeague(m)) : matches;
  return formatFixturesPost(lowMatches, dateDisplay, { category: 'low' });
}

/**
 * Creates the dedicated Yesterday's Results post for Top Leagues (including Saudi Pro League).
 * @param {any[]} matches
 * @param {string} dateDisplay
 * @returns {string}
 */
export function formatYesterdayTopResultsPost(matches, dateDisplay) {
  const topMatches = matches.some(m => !isTopLeague(m)) ? matches.filter(isTopLeague) : matches;
  return formatFixturesPost(topMatches, dateDisplay, { category: 'top' });
}

/**
 * Creates the dedicated Yesterday's Results post for Lower / Other Leagues worldwide.
 * @param {any[]} matches
 * @param {string} dateDisplay
 * @returns {string}
 */
export function formatYesterdayLowResultsPost(matches, dateDisplay) {
  const lowMatches = matches.some(isTopLeague) ? matches.filter(m => !isTopLeague(m)) : matches;
  return formatFixturesPost(lowMatches, dateDisplay, { category: 'low' });
}

/**
 * Creates a deterministic, stable canonical ID for an event.
 * Strictly NEVER uses match score as an event identity.
 * @param {object} ev
 * @param {string} fixtureId
 * @param {number} [occurrenceIndex=0]
 * @returns {string}
 */
export function getCanonicalEventId(ev, fixtureId, occurrenceIndex = 0) {
  const type = (ev.type || 'EVENT').toUpperCase();

  // 1. Kickoff: exactly one per match
  if (type === 'KICKOFF') {
    return `${fixtureId}:KICKOFF`;
  }

  // 2. Half-time: exactly one per match
  if (type === 'HALF_TIME' || type === 'HALFTIME' || type === 'HALF-TIME' || type === 'HALF TIME' || type === 'HT') {
    return `${fixtureId}:HALF_TIME`;
  }

  // 3. Full-time (normal 90 mins): exactly one per match
  if (type === 'FULL_TIME' || type === 'FULLTIME' || type === 'FULL_TIME_PENDING_ET') {
    return `${fixtureId}:FULL_TIME`;
  }

  // 4. Extra-time start: exactly one per match
  if (type === 'EXTRA_TIME' || type === 'EXTRA_TIME_START') {
    return `${fixtureId}:EXTRA_TIME`;
  }

  // 5. After extra-time / shootout: exactly one per match
  if (type === 'AFTER_EXTRA_TIME_OR_SHOOTOUT' || type === 'FULL_TIME_POST_ET') {
    return `${fixtureId}:AFTER_EXTRA_TIME_OR_SHOOTOUT`;
  }

  // 6. Lineups: exactly one per match
  if (type === 'LINEUP') {
    return `${fixtureId}:LINEUP`;
  }

  // 7. Stable ESPN ID when provided by feed
  if (ev.id) {
    return `${fixtureId}:${type}:${ev.id}`;
  }

  // 8. Deterministic fallback using stable attributes (period, minute, teamId, occurrence)
  // NEVER include current match score in event identity!
  const period = ev.period || 1;
  const minute = ev.minute !== undefined && ev.minute !== null ? ev.minute : (ev.clock || '0');
  const teamId = ev.teamId ? String(ev.teamId).toLowerCase().trim() : 'team';
  return `${fixtureId}:${type}:p${period}:m${minute}:t${teamId}:idx${occurrenceIndex}`;
}

/**
 * Builds a normalized signature of the event content to detect substantive changes.
 * Uses event scoreAfterEvent, NOT the mutable current match score.
 * @param {object} ev
 * @returns {string}
 */
export function getEventContentSignature(ev) {
  const eventType = (ev.type || '').toUpperCase();
  const homeScore = ev.scoreAfterEvent?.home ?? ev.homeScore ?? '';
  const awayScore = ev.scoreAfterEvent?.away ?? ev.awayScore ?? '';
  const player = (ev.player || '').trim();
  const assist = (ev.assist || '').trim();
  const minute = ev.minute !== undefined && ev.minute !== null ? ev.minute : '';
  const status = ev.status || 'VALID';
  const description = ev.description || ev.text || '';
  return `${eventType}|${homeScore}-${awayScore}|${player}|${assist}|${minute}|${status}|${description}`;
}

/**
 * Core event comparator with strict whitelist filtering and canonical state management.
 * Compares current normalized match state against previous canonical state stored in db.
 * Returns only whitelisted new events to publish and updates to existing posts.
 *
 * @param {any} prevRecord
 * @param {any} currentMatch
 * @returns {{
 *   newEvents: any[],
 *   goalPostEdits: any[],
 *   eventPostEdits: any[],
 *   injuryPostEdits: any[],
 *   lineupPostAction: 'PUBLISH'|'SKIP'|null,
 *   events: Record<string, any>,
 *   facebookPosts: Record<string, any>,
 *   eventStates: Record<string, any>
 * }}
 */
export function compareMatchState(prevRecord, currentMatch) {
  const fixtureId = String(currentMatch.fixtureId || currentMatch.matchId);
  const newEvents = [];
  const goalPostEdits = [];
  const eventPostEdits = [];
  const injuryPostEdits = [];
  let lineupPostAction = null;

  // 1. Initialize Canonical Events and Facebook Posts maps
  const canonicalEvents = { ...(prevRecord?.events || {}) };
  const facebookPosts = { ...(prevRecord?.facebookPosts || {}) };

  // Migrate legacy eventStates or postedEvents if events is empty
  if (Object.keys(canonicalEvents).length === 0) {
    if (prevRecord?.eventStates && Object.keys(prevRecord.eventStates).length > 0) {
      for (const [key, state] of Object.entries(prevRecord.eventStates)) {
        canonicalEvents[key] = {
          eventId: key,
          type: state.eventType || 'EVENT',
          status: state.status || 'VALID',
          facebookPostId: state.facebookPostId || null,
          postedAt: state.postedAt || new Date().toISOString(),
          lastContentSignature: state.lastContentSignature || '',
          scoreAfterEvent: state.scoreAfterEvent || prevRecord.lastScore || { home: 0, away: 0 },
        };
        if (state.facebookPostId) {
          facebookPosts[state.facebookPostId] = {
            postId: state.facebookPostId,
            eventId: key,
            type: state.eventType,
            createdAt: state.postedAt,
          };
        }
      }
    } else if (prevRecord?.postedEvents?.length > 0) {
      for (const sig of prevRecord.postedEvents) {
        canonicalEvents[sig] = {
          eventId: sig,
          type: sig.split(':')[1] || 'EVENT',
          status: 'VALID',
          facebookPostId: null,
          postedAt: new Date().toISOString(),
          lastContentSignature: sig,
          scoreAfterEvent: prevRecord.lastScore || { home: 0, away: 0 },
        };
      }
    }
  }

  // 2. HARD GATE: LINEUP pre-kickoff publishing rule
  const lineupsAlreadyPosted = Boolean(prevRecord?.lineupsPosted);
  const isPreKickoff = currentMatch.status?.state === 'pre';

  if (!lineupsAlreadyPosted) {
    if (isPreKickoff) {
      const hasHome = currentMatch.lineups?.home?.length >= 7;
      const hasAway = currentMatch.lineups?.away?.length >= 7;
      if (hasHome && hasAway) {
        lineupPostAction = 'PUBLISH';
      }
    } else {
      logger.info(`[LINEUP GATE] Match ${currentMatch.homeName} vs ${currentMatch.awayName} has kicked off (state=${currentMatch.status?.state}). Lineup publishing permanently skipped.`);
      lineupPostAction = 'SKIP';
    }
  }

  // 3. Gather candidate events
  const candidateEvents = [];

  // Lifecycle: KICK-OFF
  const prevStatus = prevRecord?.status?.state || prevRecord?.lastStatus || 'pre';
  const currStatus = currentMatch.status?.state || 'pre';

  if (prevStatus === 'pre' && currStatus === 'in') {
    candidateEvents.push({
      type: 'KICKOFF',
      minute: 1,
      period: 1,
      homeScore: 0,
      awayScore: 0,
      scoreAfterEvent: { home: 0, away: 0 },
      teamId: 'all',
      occurrenceTime: currentMatch.kickoff,
    });
  }

  // Lifecycle: HALF-TIME (Strictly at most one half-time event per match)
  const halfTimeAlreadyHandled =
    Boolean(canonicalEvents[`${fixtureId}:HALF_TIME`]) ||
    Object.values(canonicalEvents).some(
      (e) => (e.type === 'HALF_TIME' || e.eventId?.endsWith(':HALF_TIME')) &&
             (e.facebookPostId || e.status === 'VALID' || e.status === 'POSTED')
    ) ||
    Object.values(facebookPosts).some(
      (p) => p.type === 'HALF_TIME' || p.eventId?.endsWith(':HALF_TIME')
    ) ||
    Boolean(prevRecord?.postedEvents?.some((sig) => sig.includes('HALF_TIME') || sig.includes('HALFTIME')));

  if (
    !halfTimeAlreadyHandled &&
    (currentMatch.status?.description === 'Halftime' ||
     currentMatch.status?.name === 'STATUS_HALFTIME' ||
     currentMatch.status?.detail?.toLowerCase().includes('halftime'))
  ) {
    candidateEvents.push({
      type: 'HALF_TIME',
      minute: 45,
      period: 1,
      homeScore: currentMatch.score?.home ?? 0,
      awayScore: currentMatch.score?.away ?? 0,
      scoreAfterEvent: { home: currentMatch.score?.home ?? 0, away: currentMatch.score?.away ?? 0 },
      teamId: 'all',
    });
  }

  // Lifecycle: EXTRA TIME START
  const prevPeriod = prevRecord?.status?.period ?? prevRecord?.lastPeriod ?? 0;
  const currPeriod = currentMatch.status?.period ?? 0;
  if (
    (prevPeriod === 2 && currPeriod === 3) ||
    (currPeriod === 3 && prevStatus === 'in' && !canonicalEvents[`${fixtureId}:EXTRA_TIME`])
  ) {
    candidateEvents.push({
      type: 'EXTRA_TIME',
      minute: 90,
      period: 3,
      homeScore: currentMatch.score?.home ?? 0,
      awayScore: currentMatch.score?.away ?? 0,
      scoreAfterEvent: { home: currentMatch.score?.home ?? 0, away: currentMatch.score?.away ?? 0 },
      teamId: 'all',
    });
  }

  // Lifecycle: FULL-TIME in normal 90 mins
  if (currStatus === 'post' && currPeriod <= 2) {
    candidateEvents.push({
      type: 'FULL_TIME',
      minute: 90,
      period: 2,
      homeScore: currentMatch.score?.home ?? 0,
      awayScore: currentMatch.score?.away ?? 0,
      scoreAfterEvent: { home: currentMatch.score?.home ?? 0, away: currentMatch.score?.away ?? 0 },
      teamId: 'all',
    });
  }

  // Lifecycle: AFTER EXTRA TIME / SHOOTOUT SCORELINE
  if (currStatus === 'post' && currPeriod >= 3) {
    candidateEvents.push({
      type: 'AFTER_EXTRA_TIME_OR_SHOOTOUT',
      minute: 120,
      period: currPeriod || 5,
      homeScore: currentMatch.score?.home ?? 0,
      awayScore: currentMatch.score?.away ?? 0,
      shootout: currentMatch.shootout || null,
      scoreAfterEvent: { home: currentMatch.score?.home ?? 0, away: currentMatch.score?.away ?? 0 },
      teamId: 'all',
    });
  }

  // In-game events from currentMatch.events (with strict whitelist filtering)
  // Detect if live score dropped (e.g. scoreboard corrected/decremented due to VAR)
  const prevH = prevRecord?.score?.home ?? prevRecord?.lastScore?.home ?? 0;
  const prevA = prevRecord?.score?.away ?? prevRecord?.lastScore?.away ?? 0;
  const currH = currentMatch.score?.home ?? 0;
  const currA = currentMatch.score?.away ?? 0;

  if (currH < prevH || currA < prevA) {
    const droppedTeam = currH < prevH ? 'home' : 'away';
    const activeGoals = Object.values(canonicalEvents).filter(
      (e) => (e.type === 'GOAL' || e.type === 'PENALTY_SCORED' || e.type === 'OWN_GOAL') &&
             e.status !== 'DISALLOWED' && !e.isDisallowed
    );
    const targetGoal = [...activeGoals].reverse().find((g) => detectScoringTeam(g, currentMatch) === droppedTeam) || activeGoals[activeGoals.length - 1];

    if (targetGoal && targetGoal.status !== 'DISALLOWED') {
      logger.info(`[SCORE DROP DETECTED] Score reverted (${prevH}-${prevA} -> ${currH}-${currA}). Disallowing goal ${targetGoal.eventId}.`);
      targetGoal.status = 'DISALLOWED';
      targetGoal.isDisallowed = true;
      targetGoal.disallowedReason = 'Goal ruled out after review';
      targetGoal.scoreAfterEvent = { home: currH, away: currA };
      targetGoal.homeScore = currH;
      targetGoal.awayScore = currA;
      targetGoal.lastContentSignature = getEventContentSignature(targetGoal);

      if (targetGoal.facebookPostId) {
        const editPayload = {
          postId: targetGoal.facebookPostId,
          event: { ...targetGoal },
          eventId: targetGoal.eventId,
          eventKey: targetGoal.eventId,
          goalKey: targetGoal.goalKey,
          newContentSig: targetGoal.lastContentSignature,
          isDisallowed: true,
        };
        goalPostEdits.push(editPayload);
        eventPostEdits.push(editPayload);
      }
    }
  }

  for (const rawEv of currentMatch.events || []) {
    let ev = { ...rawEv };

    // Standardize aliases
    if (
      ev.type === 'HALFTIME' ||
      ev.type === 'HALF-TIME' ||
      ev.type === 'HALF TIME' ||
      ev.type === 'HT'
    ) {
      ev.type = 'HALF_TIME';
    }
    if (ev.type === 'FULLTIME' || ev.type === 'FULL TIME' || ev.type === 'FT') ev.type = 'FULL_TIME';
    if (ev.type === 'EXTRA_TIME_START') ev.type = 'EXTRA_TIME';
    if (ev.type === 'FULL_TIME_POST_ET') ev.type = 'AFTER_EXTRA_TIME_OR_SHOOTOUT';

    // Strict half-time single occurrence guard
    if (ev.type === 'HALF_TIME') {
      if (halfTimeAlreadyHandled || candidateEvents.some((c) => c.type === 'HALF_TIME')) {
        continue;
      }
    }

    // Handle VAR events: only allowed if directly resulting in a disallowed goal
    if (ev.type === 'VAR') {
      const text = (ev.text || ev.description || '').toLowerCase();
      if (text.includes('disallowed') || text.includes('no goal') || text.includes('overturned')) {
        ev.type = 'GOAL_DISALLOWED';
        ev.reason = ev.text || ev.description;
      } else {
        continue;
      }
    }

    // Disallowed goal normalization: if a goal has disallowed/status DISALLOWED, treat as GOAL_DISALLOWED
    if (ev.type === 'GOAL' && (ev.disallowed === true || ev.isDisallowed === true || ev.status === 'DISALLOWED')) {
      ev.type = 'GOAL_DISALLOWED';
      ev.reason = ev.reason || ev.text || ev.description || 'Goal disallowed by referee / VAR review';
    }

    // Handle Penalty events: only PENALTY_SCORED is allowed (and penalties have NO assists)
    if (ev.type === 'PENALTY') {
      if (ev.outcome === 'SCORED') {
        ev.type = 'PENALTY_SCORED';
        ev.assist = null;
      } else {
        continue;
      }
    }

    if (ev.type === 'GOAL') {
      const text = (ev.text || ev.description || '').toLowerCase();
      const typeText = (ev.typeText || '').toLowerCase();
      if (
        ev.penaltyKick === true ||
        typeText.includes('penalty') ||
        text.includes('penalty') ||
        text.includes('from the spot') ||
        text.includes('converts')
      ) {
        ev.type = 'PENALTY_SCORED';
        ev.outcome = 'SCORED';
        ev.assist = null;
      }
    }

    // Strict Whitelist Gate
    if (!isWhitelistedEvent(ev)) {
      continue;
    }

    // Defense-in-depth RED_CARD validation to prevent false positives
    if (ev.type === 'RED_CARD') {
      const text = (ev.text || ev.description || '').toLowerCase();
      const negationPattern = /\b(?:no\s+red\s+card|not\s+(?:a\s+)?red\s+card|avoid(?:s|ed|ing)?\s+(?:a\s+)?red\s+card|escap(?:es|ed|ing)?\s+(?:a\s+)?red\s+card|red\s+card\s+(?:overturned|rescinded|cancelled|canceled)|overturned\s+(?:the\s+)?red\s+card|instead\s+of\s+a\s+red\s+card|rather\s+than\s+a\s+red\s+card)\b/i;
      const nonDismissalSentOff = /\bsent\s+off[\s-]*(?:target|balance|the\s+(?:crossbar|post|woodwork|bar|line)|(?:the\s+(?:pitch|field)\s+)?(?:on\s+a\s+stretcher|for\s+treatment|injured))\b/i;
      const pastHistoricalSentOff = /\b(?:was|had\s+been)\s+sent\s+off\s+(?:in\s+the|last|earlier|previously|against)\b/i;
      const avoidSentOff = /\b(?:avoid(?:s|ed|ing)?|escap(?:es|ed|ing)?|not)\s+being\s+sent\s+off\b/i;

      if (
        negationPattern.test(text) ||
        nonDismissalSentOff.test(text) ||
        pastHistoricalSentOff.test(text) ||
        avoidSentOff.test(text)
      ) {
        logger.debug(`[EventEngine] Discarding false-positive RED_CARD: "${ev.text || ev.description}"`);
        continue;
      }
    }

    candidateEvents.push(ev);
  }

  // Track occurrence count for deterministic IDs without score
  const occurrenceTracker = new Map();

  // 4. Process each candidate event against canonical state
  for (const ev of candidateEvents) {
    if (!isWhitelistedEvent(ev)) continue;

    const type = (ev.type || '').toUpperCase();
    const minute = ev.minute !== undefined && ev.minute !== null ? ev.minute : 0;
    const period = ev.period || 1;
    const teamId = ev.teamId ? String(ev.teamId).toLowerCase().trim() : 'team';
    const occKey = `${type}:${period}:${minute}:${teamId}`;
    const occIndex = occurrenceTracker.get(occKey) || 0;
    occurrenceTracker.set(occKey, occIndex + 1);

    // =========================================================================
    // DISALLOWED GOAL HANDLER:
    // A disallowed goal must NEVER create a new post or enter newEvents.
    // It must locate the previously recorded goal, mark it as DISALLOWED,
    // revert the match scoreline, and immediately edit the existing goal's Facebook post.
    // =========================================================================
    const isDisallowCandidate =
      type === 'GOAL_DISALLOWED' ||
      Boolean(ev.disallowed) ||
      Boolean(ev.isDisallowed) ||
      ev.status === 'DISALLOWED';

    if (isDisallowCandidate) {
      const disallowSig = `DISALLOW_HANDLED:${ev.id || `${ev.period || 1}:${ev.minute || 0}:${(ev.reason || ev.text || ev.description || '').slice(0, 30)}`}`;
      if (canonicalEvents[disallowSig]) {
        continue;
      }

      let goalToDisallow = null;

      // 1. Match by rawId / id / playId / eventId
      if (ev.rawId || ev.id || ev.playId) {
        const idStr = String(ev.rawId || ev.id || ev.playId);
        goalToDisallow = Object.values(canonicalEvents).find(
          (e) => (e.rawId === idStr || e.eventId === idStr || String(e.id) === idStr) &&
                 (e.type === 'GOAL' || e.type === 'PENALTY_SCORED' || e.type === 'OWN_GOAL') &&
                 e.status !== 'DISALLOWED' && !e.isDisallowed
        );
      }

      // 2. Match by player name on an active goal
      if (!goalToDisallow && ev.player) {
        const pNorm = String(ev.player).toLowerCase().trim();
        goalToDisallow = Object.values(canonicalEvents).find(
          (e) => (e.type === 'GOAL' || e.type === 'PENALTY_SCORED' || e.type === 'OWN_GOAL') &&
                 e.status !== 'DISALLOWED' && !e.isDisallowed &&
                 e.player &&
                 (String(e.player).toLowerCase().trim() === pNorm ||
                  String(e.player).toLowerCase().includes(pNorm) ||
                  pNorm.includes(String(e.player).toLowerCase().trim()))
        );
      }

      // 3. Match by commentary text mentioning an active goal's player
      if (!goalToDisallow && (ev.reason || ev.text || ev.description)) {
        const fullText = (ev.reason || ev.text || ev.description).toLowerCase();
        goalToDisallow = Object.values(canonicalEvents).find(
          (e) => (e.type === 'GOAL' || e.type === 'PENALTY_SCORED' || e.type === 'OWN_GOAL') &&
                 e.status !== 'DISALLOWED' && !e.isDisallowed &&
                 e.player &&
                 fullText.includes(String(e.player).toLowerCase().trim())
        );
      }

      // 4. Match by closest active goal in the same period
      if (!goalToDisallow) {
        const activeGoalsInPeriod = Object.values(canonicalEvents).filter(
          (e) => (e.type === 'GOAL' || e.type === 'PENALTY_SCORED' || e.type === 'OWN_GOAL') &&
                 e.status !== 'DISALLOWED' && !e.isDisallowed &&
                 (e.period || 1) === (ev.period || 1)
        );
        let closest = null;
        let minDiff = Infinity;
        for (const ag of activeGoalsInPeriod) {
          const diff = Math.abs((ag.minute || 0) - (ev.minute || 0));
          if (diff < minDiff) {
            minDiff = diff;
            closest = ag;
          }
        }
        if (closest) goalToDisallow = closest;
      }

      // 5. Fallback: most recent active goal if within 10 minutes of disallow event
      if (!goalToDisallow) {
        const activeGoals = Object.values(canonicalEvents).filter(
          (e) => (e.type === 'GOAL' || e.type === 'PENALTY_SCORED' || e.type === 'OWN_GOAL') &&
                 e.status !== 'DISALLOWED' && !e.isDisallowed &&
                 Math.abs((e.minute || 0) - (ev.minute || 0)) <= 10
        );
        if (activeGoals.length > 0) {
          goalToDisallow = activeGoals[activeGoals.length - 1];
        }
      }

      // Mark this disallow event as handled in canonical state to avoid reprocessing on future polls
      canonicalEvents[disallowSig] = {
        type: 'DISALLOW_HANDLED',
        targetEventId: goalToDisallow?.eventId || null,
        timestamp: Date.now(),
      };

      if (goalToDisallow) {
        logger.info(`[GOAL DISALLOWED] Goal ${goalToDisallow.eventId} (${goalToDisallow.player || 'scorer'}) is officially disallowed.`);
        goalToDisallow.status = 'DISALLOWED';
        goalToDisallow.isDisallowed = true;
        goalToDisallow.disallowedReason = ev.reason || ev.text || ev.description || 'Goal disallowed for offside following VAR review';

        // Recalculate scoreline without this disallowed goal
        const remainingGoals = Object.values(canonicalEvents)
          .filter((e) => (e.type === 'GOAL' || e.type === 'PENALTY_SCORED' || e.type === 'OWN_GOAL') &&
                         e.eventId !== goalToDisallow.eventId &&
                         e.status !== 'DISALLOWED' && !e.isDisallowed)
          .sort((a, b) => (a.minute || 0) - (b.minute || 0));

        let recalculatedHome = 0;
        let recalculatedAway = 0;
        for (const rg of remainingGoals) {
          const st = detectScoringTeam(rg, currentMatch);
          const isOg = Boolean(rg.ownGoal || rg.type === 'OWN_GOAL');
          if (st === 'home') {
            if (isOg) recalculatedAway += 1;
            else recalculatedHome += 1;
          } else if (st === 'away') {
            if (isOg) recalculatedHome += 1;
            else recalculatedAway += 1;
          }
        }

        currentMatch.score = { home: recalculatedHome, away: recalculatedAway };
        goalToDisallow.scoreAfterEvent = { home: recalculatedHome, away: recalculatedAway };
        goalToDisallow.homeScore = recalculatedHome;
        goalToDisallow.awayScore = recalculatedAway;
        goalToDisallow.lastContentSignature = getEventContentSignature(goalToDisallow);

        if (goalToDisallow.facebookPostId) {
          logger.info(`[GOAL DISALLOWED EDIT] Queuing Facebook post edit for ${goalToDisallow.facebookPostId} (${goalToDisallow.eventId})`);
          const editPayload = {
            postId: goalToDisallow.facebookPostId,
            event: { ...goalToDisallow },
            eventId: goalToDisallow.eventId,
            eventKey: goalToDisallow.eventId,
            goalKey: goalToDisallow.goalKey,
            newContentSig: goalToDisallow.lastContentSignature,
            isDisallowed: true,
          };
          goalPostEdits.push(editPayload);
          eventPostEdits.push(editPayload);
        }
      } else {
        const recentlyDisallowed = Object.values(canonicalEvents).find(
          (e) => (e.type === 'GOAL' || e.type === 'PENALTY_SCORED' || e.type === 'OWN_GOAL') &&
                 (e.status === 'DISALLOWED' || e.isDisallowed) &&
                 (e.period || 1) === (ev.period || 1)
        );
        if (recentlyDisallowed) {
          logger.info(`[GOAL DISALLOWED] Goal ${recentlyDisallowed.eventId} was already marked DISALLOWED in current state.`);
          if (ev.reason || ev.text || ev.description) {
            recentlyDisallowed.disallowedReason = ev.reason || ev.text || ev.description;
          }
        } else {
          logger.warn(`[GOAL DISALLOWED] Received disallowed goal notification (${ev.text || ev.reason}) but found no active goal to disallow.`);
        }
      }

      // CRITICAL: NEVER push to newEvents or publish a new post for GOAL_DISALLOWED
      continue;
    }

    const generatedEventId = getCanonicalEventId(ev, fixtureId, occIndex);

    // Find if event already exists in canonical match state
    let matchedEvent = canonicalEvents[generatedEventId];

    if (!matchedEvent) {
      // Secondary lookup: by raw ESPN ID
      if (ev.id) {
        matchedEvent = Object.values(canonicalEvents).find((e) => e.rawId === String(ev.id));
      }
      // Tertiary lookup: by exact (type, period, minute, teamId, occurrence)
      if (!matchedEvent) {
        const isGoalType = (t) => t === 'GOAL' || t === 'OWN_GOAL' || t === 'PENALTY_SCORED';
        matchedEvent = Object.values(canonicalEvents).find(
          (e) => (e.type === type || (isGoalType(type) && isGoalType(e.type))) &&
                 e.period === period && e.minute === minute && (!e.teamId || e.teamId === teamId)
        );
      }
    }

    // Comprehensive Goal Deduplication & Matching:
    // Ensure that commentary updates or alternative feed representations of an existing goal
    // are matched to the existing goal rather than creating a duplicate post with an inflated scoreline.
    if (!matchedEvent && (type === 'GOAL' || type === 'OWN_GOAL' || type === 'PENALTY_SCORED')) {
      const isGoalType = (t) => t === 'GOAL' || t === 'OWN_GOAL' || t === 'PENALTY_SCORED';
      const parsedTextScore = parseGoalScoreFromText(ev.text || ev.description, currentMatch.homeName, currentMatch.awayName);
      const evScore = parsedTextScore || ev.scoreAfterEvent;

      // 1. Match by exact scoreline if known (every goal in a match produces a unique scoreline)
      if (evScore && (evScore.home > 0 || evScore.away > 0)) {
        matchedEvent = Object.values(canonicalEvents).find(
          (e) => isGoalType(e.type) &&
                 e.scoreAfterEvent &&
                 e.scoreAfterEvent.home === evScore.home &&
                 e.scoreAfterEvent.away === evScore.away
        );
      }

      // 2. Match by player and minute within 3 minutes
      if (!matchedEvent && ev.player) {
        const pNorm = String(ev.player).toLowerCase().trim();
        matchedEvent = Object.values(canonicalEvents).find(
          (e) => isGoalType(e.type) &&
                 e.player &&
                 (String(e.player).toLowerCase().trim() === pNorm ||
                  String(e.player).toLowerCase().includes(pNorm) ||
                  pNorm.includes(String(e.player).toLowerCase().trim())) &&
                 Math.abs((e.minute || 0) - minute) <= 3
        );
      }

      // 3. Match by minute within 1 minute and same period
      if (!matchedEvent) {
        matchedEvent = Object.values(canonicalEvents).find(
          (e) => isGoalType(e.type) &&
                 e.period === period &&
                 Math.abs((e.minute || 0) - minute) <= 1 &&
                 (!e.teamId || !teamId || e.teamId === teamId || teamId === 'team')
        );
      }

      // 4. Match by total score capacity:
      // If the match header score has total N goals, and canonicalEvents already has N valid goals,
      // any extra candidate goal in the feed MUST belong to an existing goal rather than creating an extra goal.
      if (!matchedEvent) {
        const totalHeaderGoals = (currentMatch.score?.home || 0) + (currentMatch.score?.away || 0);
        const validGoals = Object.values(canonicalEvents).filter(
          (e) => isGoalType(e.type) && e.status !== 'DISALLOWED' && !e.isDisallowed
        );
        if (totalHeaderGoals > 0 && validGoals.length >= totalHeaderGoals) {
          let closest = null;
          let minDiff = Infinity;
          for (const vg of validGoals) {
            const diff = Math.abs((vg.minute || 0) - minute);
            if (diff < minDiff) {
              minDiff = diff;
              closest = vg;
            }
          }
          if (closest && minDiff <= 3) {
            matchedEvent = closest;
          }
        }
      }
    }

    // CASE A: EXISTING EVENT
    if (matchedEvent) {
      // If event was previously disallowed or cancelled, ignore
      if (matchedEvent.status === 'DISALLOWED' || matchedEvent.status === 'REVERSED' || matchedEvent.status === 'CANCELLED') {
        continue;
      }

      // Check if this candidate is a VAR disallow of the existing event
      if (ev.type === 'GOAL_DISALLOWED' || ev.disallowed === true) {
        logger.info(`[GOAL DISALLOWED] Goal ${matchedEvent.eventId} is officially disallowed.`);
        matchedEvent.status = 'DISALLOWED';
        matchedEvent.disallowedReason = ev.reason || ev.text || 'Disallowed by referee/VAR';
        matchedEvent.lastContentSignature = getEventContentSignature(matchedEvent);

        if (matchedEvent.facebookPostId) {
          const editPayload = {
            postId: matchedEvent.facebookPostId,
            event: matchedEvent,
            eventId: matchedEvent.eventId,
            eventKey: matchedEvent.eventId,
            goalKey: matchedEvent.goalKey,
            newContentSig: matchedEvent.lastContentSignature,
            isDisallowed: true,
          };
          goalPostEdits.push(editPayload);
          eventPostEdits.push(editPayload);
        }
        continue;
      }

      // Check for newly arrived substantive info (scorer, assist, player on red card, own goal)
      let contentChanged = false;
      const prevSig = matchedEvent.lastContentSignature || '';

      if (ev.player && !matchedEvent.player) {
        matchedEvent.player = ev.player;
        contentChanged = true;
      } else if (ev.player && matchedEvent.player !== ev.player) {
        matchedEvent.player = ev.player;
        contentChanged = true;
      }

      if ((ev.ownGoal || type === 'OWN_GOAL') && !matchedEvent.ownGoal) {
        matchedEvent.ownGoal = true;
        matchedEvent.type = 'OWN_GOAL';
        contentChanged = true;
      }

      if ((ev.type === 'PENALTY_SCORED' || type === 'PENALTY_SCORED') && matchedEvent.type === 'GOAL') {
        matchedEvent.type = 'PENALTY_SCORED';
        matchedEvent.outcome = 'SCORED';
        matchedEvent.assist = null;
        contentChanged = true;
      }

      if (matchedEvent.type === 'PENALTY_SCORED') {
        if (matchedEvent.assist) {
          matchedEvent.assist = null;
          contentChanged = true;
        }
      } else if (ev.assist && !matchedEvent.assist) {
        matchedEvent.assist = ev.assist;
        contentChanged = true;
      }

      // Check if an existing goal was previously saved with an un-updated score (0-0)
      if ((matchedEvent.type === 'GOAL' || matchedEvent.type === 'OWN_GOAL' || matchedEvent.type === 'PENALTY_SCORED') &&
          matchedEvent.status !== 'DISALLOWED' &&
          matchedEvent.scoreAfterEvent?.home === 0 &&
          matchedEvent.scoreAfterEvent?.away === 0) {
        let correctedScore = null;
        if (ev.scoreAfterEvent && (ev.scoreAfterEvent.home > 0 || ev.scoreAfterEvent.away > 0)) {
          correctedScore = { ...ev.scoreAfterEvent };
        } else {
          const textScore = parseGoalScoreFromText(ev.text || matchedEvent.text || matchedEvent.description, currentMatch.homeName, currentMatch.awayName);
          if (textScore && (textScore.home > 0 || textScore.away > 0)) {
            correctedScore = textScore;
          } else if (currentMatch.score && (currentMatch.score.home + currentMatch.score.away === 1)) {
            correctedScore = { home: currentMatch.score.home, away: currentMatch.score.away };
          } else {
            const scoringTeam = detectScoringTeam(ev, currentMatch) || detectScoringTeam(matchedEvent, currentMatch);
            const isOg = Boolean(matchedEvent.ownGoal || ev.ownGoal || matchedEvent.type === 'OWN_GOAL');
            if (scoringTeam === 'away') {
              correctedScore = isOg ? { home: 1, away: 0 } : { home: 0, away: 1 };
            } else {
              correctedScore = isOg ? { home: 0, away: 1 } : { home: 1, away: 0 };
            }
          }
        }
        if (correctedScore && (correctedScore.home > 0 || correctedScore.away > 0)) {
          logger.info(`[SCORE CORRECTION] Correcting 0-0 score for goal ${matchedEvent.eventId} to ${correctedScore.home}-${correctedScore.away}`);
          matchedEvent.scoreAfterEvent = correctedScore;
          matchedEvent.homeScore = correctedScore.home;
          matchedEvent.awayScore = correctedScore.away;
          contentChanged = true;
        }
      }

      if (contentChanged) {
        const newSig = getEventContentSignature(matchedEvent);
        matchedEvent.lastContentSignature = newSig;

        const isGoalType = (matchedEvent.type === 'GOAL' || matchedEvent.type === 'OWN_GOAL' || matchedEvent.type === 'PENALTY_SCORED');
        const isDisallowedGoal = Boolean(matchedEvent.isDisallowed || matchedEvent.status === 'DISALLOWED');

        // CRITICAL USER RULE:
        // Stop editing goal posts created even if assist's name is resolved;
        // EXCEPTION: Update goal if the event that came in after goal is goal disallowed!
        if (isGoalType && matchedEvent.facebookPostId && !isDisallowedGoal) {
          logger.info(`[GOAL POST IMMUTABLE] Post ${matchedEvent.facebookPostId} already created for goal ${matchedEvent.eventId}. Skipping Facebook post edit (assists/details resolved). Goal post remains as originally created.`);
        } else if (matchedEvent.facebookPostId) {
          logger.info(`[EVENT UPDATE] Queueing update for Facebook post ${matchedEvent.facebookPostId} (${matchedEvent.eventId}) with newly resolved details (isDisallowed=${isDisallowedGoal}).`);
          const editPayload = {
            postId: matchedEvent.facebookPostId,
            event: { ...matchedEvent },
            eventId: matchedEvent.eventId,
            eventKey: matchedEvent.eventId,
            goalKey: matchedEvent.goalKey,
            newContentSig: newSig,
            isDisallowed: isDisallowedGoal,
          };
          eventPostEdits.push(editPayload);
          if (isDisallowedGoal) {
            goalPostEdits.push(editPayload);
          }
        }
      }
      continue;
    }

    // CASE B: NEW EVENT
    // Determine scoreAfterEvent for this new event
    let scoreAfterEvent = null;
    if (type === 'GOAL' || type === 'PENALTY_SCORED' || type === 'OWN_GOAL') {
      // Baseline: Find the score of the most recent valid goal recorded before this event
      let lastGoalHome = 0;
      let lastGoalAway = 0;
      for (const eg of Object.values(canonicalEvents)) {
        if ((eg.type === 'GOAL' || eg.type === 'PENALTY_SCORED' || eg.type === 'OWN_GOAL') &&
            eg.status !== 'DISALLOWED' && !eg.isDisallowed) {
          const gh = eg.scoreAfterEvent?.home ?? eg.homeScore ?? 0;
          const ga = eg.scoreAfterEvent?.away ?? eg.awayScore ?? 0;
          if (gh + ga > lastGoalHome + lastGoalAway) {
            lastGoalHome = gh;
            lastGoalAway = ga;
          }
        }
      }
      const lastGoalTotal = lastGoalHome + lastGoalAway;

      // 1. Parse score from commentary/play text (e.g. "Goal! Arsenal 2, Chelsea 0.")
      const textScore = parseGoalScoreFromText(ev.text || ev.description, currentMatch.homeName, currentMatch.awayName);

      if (textScore && (textScore.home + textScore.away > lastGoalTotal)) {
        scoreAfterEvent = textScore;
      } else if (ev.scoreAfterEvent && (ev.scoreAfterEvent.home + ev.scoreAfterEvent.away > lastGoalTotal)) {
        scoreAfterEvent = { ...ev.scoreAfterEvent };
      } else if (ev.homeScore !== undefined && ev.homeScore !== null && ev.awayScore !== undefined && ev.awayScore !== null) {
        const hs = parseInt(ev.homeScore, 10);
        const as = parseInt(ev.awayScore, 10);
        if (hs + as > lastGoalTotal) {
          scoreAfterEvent = { home: hs, away: as };
        }
      } else if (currentMatch.score && (currentMatch.score.home + currentMatch.score.away > lastGoalTotal)) {
        // Live match header scoreboard score already incremented for this goal
        scoreAfterEvent = { home: currentMatch.score.home, away: currentMatch.score.away };
      }

      // 2. Score in feed has not incremented yet (scoreboard is lagging):
      // determine scoring team and calculate safely off the previous goal baseline
      if (!scoreAfterEvent) {
        const scoringTeam = detectScoringTeam(ev, currentMatch);
        const isOwnGoal = Boolean(ev.ownGoal || type === 'OWN_GOAL');

        if (scoringTeam === 'home') {
          scoreAfterEvent = isOwnGoal
            ? { home: lastGoalHome, away: lastGoalAway + 1 }
            : { home: lastGoalHome + 1, away: lastGoalAway };
        } else if (scoringTeam === 'away') {
          scoreAfterEvent = isOwnGoal
            ? { home: lastGoalHome + 1, away: lastGoalAway }
            : { home: lastGoalHome, away: lastGoalAway + 1 };
        } else if (currentMatch.score && (currentMatch.score.home > 0 || currentMatch.score.away > 0)) {
          scoreAfterEvent = { home: currentMatch.score.home, away: currentMatch.score.away };
        } else {
          scoreAfterEvent = isOwnGoal
            ? { home: lastGoalHome, away: lastGoalAway + 1 }
            : { home: lastGoalHome + 1, away: lastGoalAway };
        }
      }

      // 3. Clamping safeguard:
      // A goal's total score must never exceed Math.max(currentScoreTotal, lastGoalTotal + 1)
      // unless textScore explicitly stated a higher scoreline.
      const currentScoreTotal = (currentMatch.score?.home || 0) + (currentMatch.score?.away || 0);
      if (currentScoreTotal > 0 && !textScore) {
        if ((scoreAfterEvent.home + scoreAfterEvent.away) > Math.max(currentScoreTotal, lastGoalTotal + 1)) {
          scoreAfterEvent = { home: currentMatch.score.home, away: currentMatch.score.away };
        }
      }

      // Sync currentMatch.score immediately so match record reflects the new scoreline
      if (scoreAfterEvent && (scoreAfterEvent.home + scoreAfterEvent.away > (currentMatch.score?.home || 0) + (currentMatch.score?.away || 0))) {
        currentMatch.score = { home: scoreAfterEvent.home, away: scoreAfterEvent.away };
      }
    } else if (ev.scoreAfterEvent) {
      scoreAfterEvent = { ...ev.scoreAfterEvent };
    } else if (ev.homeScore !== undefined && ev.homeScore !== null && ev.awayScore !== undefined && ev.awayScore !== null) {
      scoreAfterEvent = { home: parseInt(ev.homeScore, 10), away: parseInt(ev.awayScore, 10) };
    } else {
      scoreAfterEvent = { home: currentMatch.score?.home ?? 0, away: currentMatch.score?.away ?? 0 };
    }

    // Check timing gate (5 min window or mock mode)
    const occurrenceTime = ev.occurrenceTime || new Date().toISOString();
    const eventTimestamp = new Date(occurrenceTime).getTime();
    const elapsedMs = Date.now() - eventTimestamp;
    const isEligible = config.isMockMode || (elapsedMs >= 0 && elapsedMs <= 300000);

    const eventId = generatedEventId;
    const goalKey = (type === 'GOAL' || type === 'PENALTY_SCORED' || type === 'OWN_GOAL')
      ? `${minute}:p${period}:${teamId}:${occIndex}`
      : null;

    if (!isEligible) {
      logger.info(`[TIMING GATE] Skip event post for ${currentMatch.homeName} vs ${currentMatch.awayName} (${type}): outside [0, 5] minutes window.`);
      canonicalEvents[eventId] = {
        eventId,
        eventKey: eventId,
        rawId: ev.id || null,
        type,
        minute,
        period,
        teamId: ev.teamId || null,
        player: ev.player || null,
        assist: ev.assist || null,
        scoreAfterEvent,
        status: 'EXPIRED',
        facebookPostId: null,
        postedAt: null,
        lastContentSignature: null,
      };
      continue;
    }

    // User explicit rule:
    // "let it not update or create new posts if a post has already been made about that particular goal"
    if (type === 'GOAL' || type === 'PENALTY_SCORED' || type === 'OWN_GOAL') {
      const alreadyPostedGoal = Object.values(canonicalEvents).find((eg) => {
        if (!eg.facebookPostId && eg.status !== 'POSTED' && eg.status !== 'VALID') return false;
        if (eg.status === 'DISALLOWED' || eg.isDisallowed) return false;
        if (eg.type !== 'GOAL' && eg.type !== 'OWN_GOAL' && eg.type !== 'PENALTY_SCORED') return false;

        // 1. Same scoreline
        if (scoreAfterEvent && eg.scoreAfterEvent &&
            scoreAfterEvent.home === eg.scoreAfterEvent.home &&
            scoreAfterEvent.away === eg.scoreAfterEvent.away &&
            (scoreAfterEvent.home > 0 || scoreAfterEvent.away > 0)) {
          return true;
        }
        // 2. Same player and close minute
        if (ev.player && eg.player &&
            (String(ev.player).toLowerCase().trim() === String(eg.player).toLowerCase().trim() ||
             String(ev.player).toLowerCase().includes(String(eg.player).toLowerCase().trim()) ||
             String(eg.player).toLowerCase().includes(String(ev.player).toLowerCase().trim())) &&
            Math.abs((eg.minute || 0) - minute) <= 3) {
          return true;
        }
        // 3. Same period and minute for same team
        if (Math.abs((eg.minute || 0) - minute) <= 1 && (eg.period || 1) === period && eg.teamId === teamId) {
          return true;
        }
        return false;
      });

      if (alreadyPostedGoal) {
        logger.info(`[DUPLICATE GOAL BLOCKED] Post ${alreadyPostedGoal.facebookPostId || alreadyPostedGoal.eventId} has already been made about this goal. Skipping new post creation.`);
        continue;
      }
    }

    // Red card lineup validation:
    // Ensure red cards are only attributed to players actually in the match's lineup/squad.
    // If a coach, manager, staff member, or non-lineup person was detected, reject the event!
    if (type === 'RED_CARD') {
      const lineupList = [
        ...(currentMatch.lineups?.home || []),
        ...(currentMatch.lineups?.away || []),
        ...(currentMatch.lineups?.allHome || []),
        ...(currentMatch.lineups?.allAway || []),
        ...(currentMatch.lineups?.benchHome || []),
        ...(currentMatch.lineups?.benchAway || []),
      ];

      if (lineupList.length >= 7) {
        const matchedLineupPlayer = findMatchingLineupPlayer(ev.player, lineupList);
        if (!matchedLineupPlayer) {
          logger.warn(`[RED CARD REJECTED] Player "${ev.player}" is not in the match lineup for ${currentMatch.homeName} vs ${currentMatch.awayName}. Rejecting invalid red card.`);
          continue;
        }
        ev.player = matchedLineupPlayer;
      }
    }

    const newRecord = {
      eventId,
      eventKey: eventId,
      rawId: ev.id ? String(ev.id) : null,
      type,
      minute,
      period,
      teamId: ev.teamId || null,
      player: ev.player || null,
      assist: type === 'PENALTY_SCORED' ? null : (ev.assist || null),
      scoreAfterEvent,
      homeScore: scoreAfterEvent.home,
      awayScore: scoreAfterEvent.away,
      ownGoal: Boolean(ev.ownGoal || type === 'OWN_GOAL'),
      isSecondYellow: Boolean(ev.isSecondYellow),
      description: ev.description || ev.text || '',
      text: ev.text || '',
      reason: ev.reason || '',
      status: 'PENDING',
      facebookPostId: null,
      postedAt: null,
      occurrenceTime,
      goalKey,
      lastContentSignature: getEventContentSignature({ ...ev, scoreAfterEvent, status: 'PENDING' }),
    };

    canonicalEvents[eventId] = newRecord;

    // Guard against duplicate half-time events in the same cycle
    if (type === 'HALF_TIME' && newEvents.some((e) => e.type === 'HALF_TIME')) {
      continue;
    }

    newEvents.push({
      ...newRecord,
      sig: eventId,
      contentSignature: newRecord.lastContentSignature,
    });
  }

  return {
    newEvents,
    goalPostEdits,
    eventPostEdits,
    injuryPostEdits,
    lineupPostAction,
    events: canonicalEvents,
    facebookPosts,
    eventStates: canonicalEvents, // backward-compatibility alias
  };
}

export default {
  WHITELISTED_EVENT_TYPES,
  isWhitelistedEvent,
  EVENT_EMOJIS,
  formatEventPost,
  formatLineupPost,
  formatFixturesPost,
  formatTodayTopFixturesPost,
  formatTodayLowFixturesPost,
  isTopLeague,
  splitMatchesByTier,
  compareMatchState,
  findMatchingLineupPlayer,
  getCanonicalEventId,
  getEventContentSignature,
};
