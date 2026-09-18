/**
 * CLI & Facebook Publishing Engine for the Web UI
 * Provides complete functional parity with the CLI interface:
 * 1. Post today's fixtures to Facebook
 * 2. Post yesterday's results to Facebook
 * 3. Format matches with flags, unicode bolding, and hashtags in WAT
 * 4. Facebook publishing with live Graph API or simulated mock logger
 * 5. Complete 15-step match lifecycle simulation
 */

import { MatchEventSummary } from '../types';
import { DateTime } from 'luxon';

// Unicode Mathematical Bold conversion
export function makeUnicodeBold(str: string): string {
  if (!str) return '';
  return str
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      // Uppercase A-Z (65-90) -> 1D400 (120064)
      if (code >= 65 && code <= 90) {
        return String.fromCodePoint(0x1d400 + (code - 65));
      }
      // Lowercase a-z (97-122) -> 1D41A (120090)
      if (code >= 97 && code <= 122) {
        return String.fromCodePoint(0x1d41a + (code - 97));
      }
      // Digits 0-9 (48-57) -> 1D7CE (120782)
      if (code >= 48 && code <= 57) {
        return String.fromCodePoint(0x1d7ce + (code - 48));
      }
      return char;
    })
    .join('');
}

// England flag constant (must be 🏴󠁧󠁢󠁥󠁮󠁧󠁿, NOT 🇬🇧)
export const ENGLAND_FLAG = '🏴󠁧󠁢󠁥󠁮󠁧󠁿';

/**
 * Returns flag emoji for a given competition or match
 */
export function getMatchFlag(match: any): string {
  if (!match) return '⚽';
  const slug = (match.leagueSlug || match.slug || match.league || '').toLowerCase();
  const name = (match.leagueName || match.league || match.name || '').toLowerCase();

  // Continental UEFA
  if (
    slug.includes('uefa.champions') ||
    slug.includes('uefa.europa') ||
    name.includes('champions league') ||
    name.includes('europa league') ||
    name.includes('conference league')
  ) {
    return '🇪🇺';
  }

  // England: Must be 🏴󠁧󠁢󠁥󠁮󠁧󠁿
  if (
    slug.startsWith('eng.') ||
    name.includes('premier league') ||
    name.includes('fa cup') ||
    name.includes('carabao') ||
    name.includes('english')
  ) {
    return ENGLAND_FLAG;
  }

  // Spain
  if (slug.startsWith('esp.') || name.includes('laliga') || name.includes('copa del rey') || name.includes('spanish')) {
    return '🇪🇸';
  }

  // Germany
  if (slug.startsWith('ger.') || name.includes('bundesliga') || name.includes('dfb-pokal') || name.includes('german')) {
    return '🇩🇪';
  }

  // Italy
  if (slug.startsWith('ita.') || name.includes('serie a') || name.includes('coppa italia') || name.includes('italian')) {
    return '🇮🇹';
  }

  // France
  if (slug.startsWith('fra.') || name.includes('ligue 1') || name.includes('coupe de france') || name.includes('french')) {
    return '🇫🇷';
  }

  // Nigeria
  if (slug.startsWith('nga.') || name.includes('npfl') || name.includes('nigeria')) {
    return '🇳🇬';
  }

  // Portugal
  if (slug.startsWith('por.') || name.includes('primeira liga')) {
    return '🇵🇹';
  }

  // Netherlands
  if (slug.startsWith('ned.') || name.includes('eredivisie')) {
    return '🇳🇱';
  }

  // Saudi Arabia
  if (slug.startsWith('sau.') || slug.startsWith('ksa.') || name.includes('saudi')) {
    return '🇸🇦';
  }

  // USA / MLS
  if (slug.startsWith('usa.') || name.includes('major league soccer') || name.includes('mls')) {
    return '🇺🇸';
  }

  // World / International
  if (slug.startsWith('fifa.') || name.includes('world cup') || name.includes('club world cup')) {
    return '🌍';
  }

  // Africa / CAF
  if (slug.startsWith('caf.') || name.includes('africa') || name.includes('afcon')) {
    return '🌍';
  }

  // South America / CONMEBOL
  if (slug.startsWith('conmebol.') || name.includes('libertadores') || name.includes('copa america')) {
    return '🌎';
  }

  return '⚽';
}

/**
 * Clean team name into PascalCase hashtag
 */
export function sanitizeToHashtag(str: string): string {
  if (!str) return '';
  const cleaned = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();
  if (!cleaned) return '';
  const words = cleaned
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return `#${words.join('')}`;
}

/**
 * Format match kickoff time in WAT (West Africa Time, Africa/Lagos)
 */
export function formatKickoffWAT(dateStr: string): string {
  if (!dateStr) return 'TBD';
  try {
    const dt = DateTime.fromISO(dateStr, { zone: 'utc' }).setZone('Africa/Lagos');
    return dt.toFormat('HH:mm');
  } catch {
    return 'TBD';
  }
}

/**
 * Extracts clean home and away team names from a MatchEventSummary
 */
export function extractTeamNames(match: MatchEventSummary): { home: string; away: string } {
  const comp = match.competitions?.[0];
  const homeComp = comp?.competitors?.find((c) => c.homeAway === 'home');
  const awayComp = comp?.competitors?.find((c) => c.homeAway === 'away');

  const home = homeComp?.team?.displayName || homeComp?.displayName || 'Home Team';
  const away = awayComp?.team?.displayName || awayComp?.displayName || 'Away Team';
  return { home, away };
}

/**
 * Extracts current score from a MatchEventSummary
 */
export function extractScore(match: MatchEventSummary): { home: number; away: number } {
  const comp = match.competitions?.[0];
  const homeComp = comp?.competitors?.find((c) => c.homeAway === 'home');
  const awayComp = comp?.competitors?.find((c) => c.homeAway === 'away');

  const home = parseInt(homeComp?.score || '0', 10) || 0;
  const away = parseInt(awayComp?.score || '0', 10) || 0;
  return { home, away };
}

/**
 * Formats Today's Fixtures Post for Facebook
 * Exactly matches the CLI's formatFixturesPost
 */
export function formatTodayFixturesPost(matches: MatchEventSummary[], dateDisplay: string): string {
  const grouped: Record<string, MatchEventSummary[]> = {};
  matches.forEach((m) => {
    const league = m.league || 'Football';
    if (!grouped[league]) grouped[league] = [];
    grouped[league].push(m);
  });

  const titleText = "TODAY'S FOOTBALL FIXTURES!";
  const titleEmoji = `🔥 ${makeUnicodeBold(titleText)} ⚽📅`;
  const subtitleEmoji = `📢 ${makeUnicodeBold("Don't miss any of the action!")}`;

  const lines = [
    `⚡ ${titleEmoji} ⚡`,
    `━━━━━━━━━━━━━━━━━━━`,
    `📅 Date: ${dateDisplay}`,
    `📢 ${subtitleEmoji}`,
    `🕐 All times are in West Africa Time (WAT)\n`,
  ];

  for (const [league, groupMatches] of Object.entries(grouped)) {
    lines.push(`🏆 ${makeUnicodeBold(league.toUpperCase())}\n`);
    groupMatches.forEach((m) => {
      const { home, away } = extractTeamNames(m);
      const homeBold = makeUnicodeBold(home);
      const awayBold = makeUnicodeBold(away);
      const flag = getMatchFlag(m);
      const kickoffWAT = formatKickoffWAT(m.date);
      lines.push(`${kickoffWAT} ${flag} ${homeBold} vs ${awayBold}`);
    });
    lines.push('');
  }

  const standardHashtags = '#Livescore #FootballNews #Matchday #LiveScore #ViralMatch #FootballFans';
  const callToAction = '💬 Drop your predictions and thoughts below! 👇';

  lines.push(`━━━━━━━━━━━━━━━━━━━\n${callToAction}\n\n${standardHashtags}`);
  return lines.join('\n');
}

/**
 * Formats Yesterday's Results Post for Facebook
 * Exactly matches the CLI's formatFixturesPost for yesterday
 */
export function formatYesterdayResultsPost(matches: MatchEventSummary[], dateDisplay: string): string {
  const grouped: Record<string, MatchEventSummary[]> = {};
  matches.forEach((m) => {
    const league = m.league || 'Football';
    if (!grouped[league]) grouped[league] = [];
    grouped[league].push(m);
  });

  const titleText = 'RESULTS ARE IN!';
  const titleEmoji = `🏆 ${makeUnicodeBold(titleText)} ⚽🔥`;
  const subtitleEmoji = `📅 ${makeUnicodeBold("Yesterday's Final Scores")}`;

  const lines = [
    `⚡ ${titleEmoji} ⚡`,
    `━━━━━━━━━━━━━━━━━━━`,
    `📅 Date: ${dateDisplay}`,
    `📢 ${subtitleEmoji}`,
    `🕐 All times are in West Africa Time (WAT)\n`,
  ];

  for (const [league, groupMatches] of Object.entries(grouped)) {
    lines.push(`🏆 ${makeUnicodeBold(league.toUpperCase())}\n`);
    groupMatches.forEach((m) => {
      const { home, away } = extractTeamNames(m);
      const { home: hScore, away: aScore } = extractScore(m);
      const homeBold = makeUnicodeBold(home);
      const awayBold = makeUnicodeBold(away);
      const flag = getMatchFlag(m);
      lines.push(`FT ${flag} ${homeBold} ${hScore} : ${aScore} ${awayBold}`);
    });
    lines.push('');
  }

  const standardHashtags = '#Livescore #FootballNews #Matchday #LiveScore #ViralMatch #FootballFans';
  const callToAction = '💬 What do you think about the scorelines? 👇';

  lines.push(`━━━━━━━━━━━━━━━━━━━\n${callToAction}\n\n${standardHashtags}`);
  return lines.join('\n');
}

export interface PublishedPostRecord {
  id: string;
  type: 'TODAY_FIXTURES' | 'YESTERDAY_RESULTS' | 'LIVE_EVENT' | 'LINEUP' | 'SIMULATION';
  message: string;
  timestamp: string;
  isSimulated: boolean;
  status: 'PUBLISHED' | 'SIMULATED' | 'FAILED';
  error?: string;
}

const PUBLISHED_POSTS_KEY = 'fb_published_posts_history';

export function getPublishedPosts(): PublishedPostRecord[] {
  try {
    const raw = localStorage.getItem(PUBLISHED_POSTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePublishedPost(post: PublishedPostRecord) {
  try {
    const current = getPublishedPosts();
    const updated = [post, ...current.slice(0, 99)]; // Keep latest 100
    localStorage.setItem(PUBLISHED_POSTS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save published post:', err);
  }
}

export function clearPublishedPosts() {
  localStorage.removeItem(PUBLISHED_POSTS_KEY);
}

/**
 * Publishes a formatted post to Facebook Page Graph API or simulates publishing
 */
export async function publishToFacebook(
  message: string,
  type: PublishedPostRecord['type'] = 'TODAY_FIXTURES'
): Promise<{ success: boolean; postId: string; isSimulated: boolean; error?: string }> {
  // Check localStorage or env credentials
  let pageId = '';
  let accessToken = '';
  try {
    pageId = localStorage.getItem('fb_page_id') || (import.meta as any).env?.VITE_FACEBOOK_PAGE_ID || '';
    accessToken = localStorage.getItem('fb_access_token') || (import.meta as any).env?.VITE_FACEBOOK_PAGE_ACCESS_TOKEN || '';
  } catch {
    // ignore
  }

  const isConfigured = Boolean(pageId && accessToken);

  if (!isConfigured) {
    // Simulated publish
    const mockId = `sim_post_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const record: PublishedPostRecord = {
      id: mockId,
      type,
      message,
      timestamp: new Date().toISOString(),
      isSimulated: true,
      status: 'SIMULATED',
    };
    savePublishedPost(record);
    return {
      success: true,
      postId: mockId,
      isSimulated: true,
    };
  }

  // Real Facebook Graph API call
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        access_token: accessToken,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const errMsg = data.error?.message || `HTTP ${res.status}: Failed to publish`;
      const record: PublishedPostRecord = {
        id: `err_${Date.now()}`,
        type,
        message,
        timestamp: new Date().toISOString(),
        isSimulated: false,
        status: 'FAILED',
        error: errMsg,
      };
      savePublishedPost(record);
      return { success: false, postId: '', isSimulated: false, error: errMsg };
    }

    const postId = data.id || `post_${Date.now()}`;
    const record: PublishedPostRecord = {
      id: postId,
      type,
      message,
      timestamp: new Date().toISOString(),
      isSimulated: false,
      status: 'PUBLISHED',
    };
    savePublishedPost(record);
    return { success: true, postId, isSimulated: false };
  } catch (err: any) {
    const errMsg = err?.message || 'Network error connecting to Facebook Graph API';
    const record: PublishedPostRecord = {
      id: `err_${Date.now()}`,
      type,
      message,
      timestamp: new Date().toISOString(),
      isSimulated: false,
      status: 'FAILED',
      error: errMsg,
    };
    savePublishedPost(record);
    return { success: false, postId: '', isSimulated: false, error: errMsg };
  }
}

/**
 * 15-step match lifecycle simulation data (Arsenal vs Chelsea)
 */
export const SIMULATION_LIFECYCLE_STEPS = [
  {
    step: 1,
    title: 'Pre-match (Scheduled, 0-0)',
    clock: "0'",
    score: '0 - 0',
    status: 'Scheduled',
    eventDetected: null,
    actionTaken: 'No action. Match has not kicked off, waiting for lineups.',
  },
  {
    step: 2,
    title: 'Lineups Confirmed (Starting XI)',
    clock: "0'",
    score: '0 - 0',
    status: 'Pre-Game',
    eventDetected: 'LINEUP',
    actionTaken: 'Generated Official Starting XI Facebook post for Arsenal & Chelsea.',
    facebookPost: `🔥 𝐎𝐅𝐅𝐈𝐂𝐈𝐀𝐋 𝐒𝐓𝐀𝐑𝐓𝐈𝐍𝐆 𝐋𝐈𝐍𝐄𝐔𝐏𝐒 𝐀𝐑𝐄 𝐎𝐔𝐓! 📋⚽\n\n💥 𝐀𝐑𝐒𝐄𝐍𝐀𝐋 🆚 𝐂𝐇𝐄𝐋𝐒𝐄𝐀\n━━━━━━━━━━━━━━━━━━━\n\n𝐀𝐑𝐒𝐄𝐍𝐀𝐋 startingXI; David Raya, Ben White, William Saliba, Gabriel Magalhães, Jurriën Timber, Thomas Partey, Declan Rice, Martin Ødegaard, Bukayo Saka, Kai Havertz, Gabriel Martinelli\n\n𝐂𝐇𝐄𝐋𝐒𝐄𝐀 startingXI; Robert Sánchez, Malo Gusto, Wesley Fofana, Levi Colwill, Marc Cucurella, Moisés Caicedo, Enzo Fernández, Noni Madueke, Cole Palmer, Pedro Neto, Nicolas Jackson\n\n━━━━━━━━━━━━━━━━━━━\n👉 Who is winning this clash? Leave your predictions below! 👇\n\n#Livescore #FootballNews #Matchday #LineupNews`,
  },
  {
    step: 3,
    title: 'Match Kickoff (1st Half Underway)',
    clock: "1'",
    score: '0 - 0',
    status: 'In Progress (1st Half)',
    eventDetected: 'KICKOFF',
    actionTaken: 'Published Kick-off event post.',
    facebookPost: `🟢 𝐊𝐈𝐂𝐊-𝐎𝐅𝐅! 𝐖𝐄 𝐀𝐑𝐄 𝐔𝐍𝐃𝐄𝐑𝐖𝐀𝐘! 🔥\n━━━━━━━━━━━━━━━━━━━\n🏆 PREMIER LEAGUE\n💥 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 🆚 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n⏱️ Clock: 1'\n📝 Info: 🟢 Kick-off! The match has officially started!\n⚽ Score: 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 0 - 0 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for more updates! 👇\n\n#PremierLeague #EPL #Arsenal #Chelsea #LiveScore`,
  },
  {
    step: 4,
    title: 'Bukayo Saka Goal (Arsenal 1 - 0)',
    clock: "14'",
    score: '1 - 0',
    status: 'In Progress (1st Half)',
    eventDetected: 'GOAL',
    actionTaken: 'Published ⚽ GOAL post for Bukayo Saka (Assist: Martin Ødegaard).',
    facebookPost: `⚽ 𝐆𝐎𝐎𝐎𝐀𝐀𝐀𝐋! 💥🔥\n━━━━━━━━━━━━━━━━━━━\n🏆 PREMIER LEAGUE\n💥 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 🆚 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n⏱️ Clock: 14'\n📝 Info: ⚽ GOAL! Bukayo Saka scores for Arsenal!\n⚽ Score: 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 1 - 0 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n🎯 Goal: 𝐁𝐮𝐤𝐚𝐲𝐨 𝐒𝐚𝐤𝐚 (Arsenal)\n👟 Assist: 𝐌𝐚𝐫𝐭𝐢𝐧 𝐎𝐝𝐞𝐠𝐚𝐚𝐫𝐝\n━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for more updates! 👇\n\n#PremierLeague #EPL #Arsenal #Chelsea #LiveScore`,
  },
  {
    step: 5,
    title: 'VAR Review & Disallowance (Offside)',
    clock: "16'",
    score: '0 - 0',
    status: 'In Progress (1st Half)',
    eventDetected: 'GOAL_DISALLOWED',
    actionTaken: 'Edited previous goal post with [VAR DISALLOWED] prefix & updated scoreline to 0 - 0.',
    facebookPost: `🚨 𝐍𝐎 𝐆𝐎𝐀𝐋! 𝐕𝐀𝐑 𝐎𝐕𝐄𝐑𝐓𝐔𝐑𝐍𝐄𝐃 ❌\n━━━━━━━━━━━━━━━━━━━\n🏆 PREMIER LEAGUE\n💥 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 🆚 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n⏱️ Clock: 16'\n📝 Info: 🚨 Goal Disallowed by VAR: Offside in buildup\n⚽ Score: 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 0 - 0 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n⚠️ Previous goal by Bukayo Saka has been ruled out.\n━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for more updates! 👇\n\n#PremierLeague #EPL #Arsenal #Chelsea #LiveScore`,
  },
  {
    step: 6,
    title: 'Cole Palmer Penalty Scored (0 - 1)',
    clock: "28'",
    score: '0 - 1',
    status: 'In Progress (1st Half)',
    eventDetected: 'PENALTY_SCORED',
    actionTaken: 'Published 🥅 PENALTY SCORED post for Cole Palmer (Chelsea). Verified single post.',
    facebookPost: `🥅 𝐏𝐄𝐍𝐀𝐋𝐓𝐘 𝐒𝐂𝐎𝐑𝐄𝐃! 🎯⚽\n━━━━━━━━━━━━━━━━━━━\n🏆 PREMIER LEAGUE\n💥 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 🆚 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n⏱️ Clock: 28'\n📝 Info: 🥅 Penalty converted! Cool as you like from the spot!\n⚽ Score: 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 0 - 1 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n🎯 Penalty: 𝐂𝐨𝐥𝐞 𝐏𝐚𝐥𝐦𝐞𝐫 (Chelsea)\n━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for more updates! 👇\n\n#PremierLeague #EPL #Arsenal #Chelsea #LiveScore`,
  },
  {
    step: 7,
    title: 'Red Card for Enzo Fernández',
    clock: "39'",
    score: '0 - 1',
    status: 'In Progress (1st Half)',
    eventDetected: 'RED_CARD',
    actionTaken: 'Published 🟥 RED CARD post for Enzo Fernández (Chelsea).',
    facebookPost: `🟥 𝐑𝐄𝐃 𝐂𝐀𝐑𝐃! 𝐎𝐅𝐅 𝐓𝐇𝐄 𝐏𝐈𝐓𝐂𝐇! 🚨\n━━━━━━━━━━━━━━━━━━━\n🏆 PREMIER LEAGUE\n💥 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 🆚 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n⏱️ Clock: 39'\n📝 Info: 🟥 Red card issued! Chelsea down to 10 men!\n⚽ Score: 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 0 - 1 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n🟥 Player: 𝐄𝐧𝐳𝐨 𝐅𝐞𝐫𝐧𝐚𝐧𝐝𝐞𝐳 (Chelsea)\n━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for more updates! 👇\n\n#PremierLeague #EPL #Arsenal #Chelsea #LiveScore`,
  },
  {
    step: 8,
    title: 'Half-Time Whistle (0 - 1)',
    clock: "HT",
    score: '0 - 1',
    status: 'Half Time',
    eventDetected: 'HALF_TIME',
    actionTaken: 'Published ⏱️ HALF-TIME summary post.',
    facebookPost: `⏱️ 𝐇𝐀𝐋𝐅-𝐓𝐈𝐌𝐄 𝐖𝐇𝐈𝐒𝐓𝐋𝐄! ⏸️\n━━━━━━━━━━━━━━━━━━━\n🏆 PREMIER LEAGUE\n💥 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 🆚 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n⏱️ Clock: Half-Time\n📝 Info: ⏱️ Whistle blown for the break!\n⚽ Score: 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 0 - 1 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for 2nd half action! 👇\n\n#PremierLeague #EPL #Arsenal #Chelsea #LiveScore`,
  },
  {
    step: 9,
    title: 'Kai Havertz Goal (Arsenal 1 - 1)',
    clock: "62'",
    score: '1 - 1',
    status: 'In Progress (2nd Half)',
    eventDetected: 'GOAL',
    actionTaken: 'Published ⚽ GOAL post for Kai Havertz (Arsenal).',
    facebookPost: `⚽ 𝐆𝐎𝐎𝐎𝐀𝐀𝐀𝐋! 💥🔥\n━━━━━━━━━━━━━━━━━━━\n🏆 PREMIER LEAGUE\n💥 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 🆚 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n⏱️ Clock: 62'\n📝 Info: ⚽ GOAL! Kai Havertz heads in the equalizer!\n⚽ Score: 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 1 - 1 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n🎯 Goal: 𝐊𝐚𝐢 𝐇𝐚𝐯𝐞𝐫𝐭𝐳 (Arsenal)\n👟 Assist: 𝐃𝐞𝐜𝐥𝐚𝐧 𝐑𝐢𝐜𝐞\n━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for more updates! 👇\n\n#PremierLeague #EPL #Arsenal #Chelsea #LiveScore`,
  },
  {
    step: 10,
    title: 'Gabriel Martinelli 90+2 Winner (2 - 1)',
    clock: "90+2'",
    score: '2 - 1',
    status: 'In Progress (2nd Half)',
    eventDetected: 'GOAL',
    actionTaken: 'Published ⚽ GOAL post for Gabriel Martinelli.',
    facebookPost: `⚽ 𝐋𝐀𝐓𝐄 𝐆𝐎𝐎𝐎𝐀𝐀𝐀𝐋! 💥🔥\n━━━━━━━━━━━━━━━━━━━\n🏆 PREMIER LEAGUE\n💥 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 🆚 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n⏱️ Clock: 90+2'\n📝 Info: ⚽ Incredible late drama! Martinelli finds the top corner!\n⚽ Score: 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 2 - 1 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n🎯 Goal: 𝐆𝐚𝐛𝐫𝐢𝐞𝐥 𝐌𝐚𝐫𝐭𝐢𝐧𝐞𝐥𝐥𝐢 (Arsenal)\n━━━━━━━━━━━━━━━━━━━\n📱 Stay tuned for more updates! 👇\n\n#PremierLeague #EPL #Arsenal #Chelsea #LiveScore`,
  },
  {
    step: 11,
    title: 'Full-Time Whistle (Arsenal 2 - 1 Chelsea)',
    clock: "FT",
    score: '2 - 1',
    status: 'Final / Completed',
    eventDetected: 'FULL_TIME',
    actionTaken: 'Published 🏁 FULL-TIME post. Match completed.',
    facebookPost: `🏁 𝐅𝐔𝐋𝐋-𝐓𝐈𝐌𝐄! 𝐌𝐀𝐓𝐂𝐇 𝐄𝐍𝐃𝐄𝐃! 🏆🔥\n━━━━━━━━━━━━━━━━━━━\n🏆 PREMIER LEAGUE\n💥 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 🆚 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n⏱️ Clock: Full Time\n📝 Info: 🏁 The referee blows the final whistle! Arsenal take all 3 points!\n⚽ Score: 𝐀𝐫𝐬𝐞𝐧𝐚𝐥 2 - 1 𝐂𝐡𝐞𝐥𝐬𝐞𝐚\n━━━━━━━━━━━━━━━━━━━\n💬 What did you think of the game? Leave your review below! 👇\n\n#PremierLeague #EPL #Arsenal #Chelsea #LiveScore`,
  },
];
