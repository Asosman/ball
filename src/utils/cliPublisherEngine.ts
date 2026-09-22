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
  if (match.countryFlag && match.countryFlag !== '⚽') return match.countryFlag;
  if (match.flag && match.flag !== '⚽') return match.flag;

  const slug = (match.leagueSlug || match.slug || match.league || '').toLowerCase();
  const name = (match.leagueName || match.league || match.name || '').toLowerCase();

  // Continental UEFA
  if (
    slug.includes('uefa.champions') ||
    slug.includes('uefa.europa') ||
    slug.includes('uefa.wchampions') ||
    name.includes('champions league') ||
    name.includes('europa league') ||
    name.includes('conference league') ||
    name.includes('uefa')
  ) {
    if (!name.includes('afc') && !name.includes('caf') && !name.includes('concacaf')) {
      return '🇪🇺';
    }
  }

  // Senior International UEFA
  if (slug.startsWith('uefa.euro') || slug.startsWith('uefa.nations') || name.includes('nations league') || name.includes('euro')) {
    return '🇪🇺';
  }

  // World / FIFA International
  if (slug.startsWith('fifa.') || name.includes('world cup') || name.includes('club world cup')) {
    return '🌍';
  }

  // Africa / CAF
  if (slug.startsWith('caf.') || name.includes('africa') || name.includes('afcon')) {
    return '🌍';
  }

  // South America / CONMEBOL
  if (slug.startsWith('conmebol.') || name.includes('libertadores') || name.includes('sudamericana') || name.includes('copa america') || name.includes('copa américa')) {
    return '🌎';
  }

  // North/Central America / CONCACAF
  if (slug.startsWith('concacaf.') || name.includes('gold cup') || name.includes('leagues cup')) {
    return '🌎';
  }

  // Asia / AFC
  if (slug.startsWith('afc.') || name.includes('asian cup') || name.includes('afc champions')) {
    return '🌏';
  }

  // England: Must be 🏴󠁧󠁢󠁥󠁮󠁧󠁿, NOT 🇬🇧
  if (
    slug.startsWith('eng.') ||
    name.includes('premier league') ||
    name.includes('fa cup') ||
    name.includes('carabao') ||
    name.includes('efl') ||
    name.includes('english')
  ) {
    return ENGLAND_FLAG;
  }

  // Scotland
  if (slug.startsWith('sco.') || name.includes('scottish') || name.includes('spfl')) {
    return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
  }

  // Wales
  if (slug.startsWith('wal.') || name.includes('welsh') || name.includes('cymru')) {
    return '🏴󠁧󠁢󠁷󠁬󠁳󠁿';
  }

  // Nigeria
  if (slug.startsWith('nga.') || name.includes('npfl') || name.includes('nigeria')) {
    return '🇳🇬';
  }

  // Spain
  if (slug.startsWith('esp.') || name.includes('laliga') || name.includes('copa del rey') || name.includes('spanish') || name.includes('liga f')) {
    return '🇪🇸';
  }

  // Germany
  if (slug.startsWith('ger.') || name.includes('bundesliga') || name.includes('dfb-pokal') || name.includes('german')) {
    return '🇩🇪';
  }

  // Italy
  if (slug.startsWith('ita.') || name.includes('serie a') || (name.includes('serie b') && !name.includes('brazil') && !slug.startsWith('bra.')) || name.includes('coppa italia') || name.includes('italian')) {
    return '🇮🇹';
  }

  // France
  if (slug.startsWith('fra.') || name.includes('ligue 1') || name.includes('ligue 2') || name.includes('coupe de france') || name.includes('french')) {
    return '🇫🇷';
  }

  // Portugal
  if (slug.startsWith('por.') || name.includes('primeira liga') || name.includes('taca de portugal') || name.includes('taça de portugal') || name.includes('portuguese')) {
    return '🇵🇹';
  }

  // Netherlands
  if (slug.startsWith('ned.') || name.includes('eredivisie') || name.includes('dutch') || name.includes('knvb')) {
    return '🇳🇱';
  }

  // Saudi Arabia - Checked before generic pro league
  if (slug.startsWith('sau.') || slug.startsWith('ksa.') || name.includes('saudi')) {
    return '🇸🇦';
  }

  // Belgium
  if (slug.startsWith('bel.') || name.includes('belgian') || name.includes('jupiler')) {
    return '🇧🇪';
  }

  // Turkey
  if (slug.startsWith('tur.') || name.includes('super lig') || name.includes('süper lig') || name.includes('turkish')) {
    return '🇹🇷';
  }

  // Greece
  if (slug.startsWith('gre.') || name.includes('super league greece') || name.includes('greek')) {
    return '🇬🇷';
  }

  // USA / MLS
  if (slug.startsWith('usa.') || slug === 'mls' || name.includes('major league soccer') || name.includes('mls') || name.includes('usl') || name.includes('nwsl')) {
    return '🇺🇸';
  }

  // Mexico
  if (slug.startsWith('mex.') || name.includes('liga mx') || name.includes('mexic')) {
    return '🇲🇽';
  }

  // Brazil
  if (slug.startsWith('bra.') || name.includes('brazil') || name.includes('brasil') || name.includes('brasileir') || (name.includes('serie b') && name.includes('brazil')) || slug === 'bra.2') {
    return '🇧🇷';
  }

  // Argentina
  if (slug.startsWith('arg.') || name.includes('argentin') || name.includes('primera nacional') || name.includes('copa de la liga')) {
    return '🇦🇷';
  }

  // Norway
  if (slug.startsWith('nor.') || name.includes('eliteserien') || name.includes('norwegian')) {
    return '🇳🇴';
  }

  // Sweden
  if (slug.startsWith('swe.') || name.includes('allsvenskan') || name.includes('swedish')) {
    return '🇸🇪';
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
 * Detects if a match or league is a women's league or competition.
 */
export function isWomenCompetition(match: any): boolean {
  if (!match) return false;
  if (match.isWomen) return true;
  const slug = String(match.leagueSlug || match.slug || match.league || '').toLowerCase();
  const name = String(match.leagueName || match.league || match.name || '').toLowerCase();
  const eventName = String(match.name || match.eventName || '').toLowerCase();
  const note = String(match.note || match.notes || match.altGameNote || '').toLowerCase();

  if (
    slug.includes('.w.') ||
    slug.endsWith('.w') ||
    slug.includes('wchampions') ||
    slug.includes('wwc') ||
    slug.includes('weuro') ||
    slug.includes('nwsl') ||
    slug.includes('wsl')
  ) {
    return true;
  }

  if (
    name.includes('women') ||
    name.includes('femenil') ||
    name.includes('femenina') ||
    name.includes('femminile') ||
    name.includes('féminine') ||
    name.includes('feminine') ||
    name.includes('frauen') ||
    name.includes('liga f') ||
    name.includes('nwsl') ||
    name.includes('wsl') ||
    eventName.includes('women') ||
    eventName.includes('femenil') ||
    note.includes('women')
  ) {
    return true;
  }

  return false;
}

/**
 * Prefixes (W) to team names for women's competitions
 */
export function formatWomenTeamName(teamName: string, isWomen: boolean): string {
  if (!teamName) return '';
  if (!isWomen) return teamName;
  if (teamName.startsWith('(W) ') || teamName.startsWith('(W)')) return teamName;
  const clean = teamName.replace(/\s+(Women|Ladies|Fem|Femenil|Femmes|Femminile)$/i, '').trim();
  return `(W) ${clean}`;
}

/**
 * Extracts clean home and away team names from a MatchEventSummary
 */
export function extractTeamNames(match: MatchEventSummary): { home: string; away: string } {
  const comp = match.competitions?.[0];
  const homeComp = comp?.competitors?.find((c) => c.homeAway === 'home');
  const awayComp = comp?.competitors?.find((c) => c.homeAway === 'away');

  const rawHome = homeComp?.team?.displayName || homeComp?.displayName || (match as any).homeName || 'Home Team';
  const rawAway = awayComp?.team?.displayName || awayComp?.displayName || (match as any).awayName || 'Away Team';

  const isWomen = isWomenCompetition(match);
  const home = formatWomenTeamName(rawHome, isWomen);
  const away = formatWomenTeamName(rawAway, isWomen);
  return { home, away };
}

/**
 * Detects whether a competition / match belongs to the "Top Leagues" category (including Saudi Pro League).
 * All other leagues in the world are classified into "Lower/World Leagues".
 */
export function isTopLeague(match: any): boolean {
  if (!match) return false;
  const slug = String(match.leagueSlug || match.slug || match.league || '').toLowerCase();
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

export function splitMatchesByTier<T = any>(matches: T[] = []): { top: T[]; low: T[] } {
  const top: T[] = [];
  const low: T[] = [];
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
export function formatTodayFixturesPost(
  matches: MatchEventSummary[],
  dateDisplay: string,
  options: { category?: 'top' | 'low' } = {}
): string {
  const grouped: Record<string, MatchEventSummary[]> = {};
  matches.forEach((m) => {
    const league = m.league || 'Football';
    if (!grouped[league]) grouped[league] = [];
    grouped[league].push(m);
  });

  let titleText = "TODAY'S FOOTBALL FIXTURES!";
  if (options.category === 'top') {
    titleText = "TODAY'S FOOTBALL FIXTURES — TOP LEAGUES!";
  } else if (options.category === 'low') {
    titleText = "TODAY'S FOOTBALL FIXTURES — WORLD LEAGUES!";
  }
  const titleEmoji = `🔥 ${makeUnicodeBold(titleText)} ⚽📅`;

  let subtitleText = "Don't miss any of the action!";
  if (options.category === 'top') {
    subtitleText = "Top Leagues & Saudi Pro League Action!";
  } else if (options.category === 'low') {
    subtitleText = "Global & Lower Leagues Worldwide!";
  }
  const subtitleEmoji = `📢 ${makeUnicodeBold(subtitleText)}`;

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
      const { home, away } = extractTeamNames(m);
      const homeBold = makeUnicodeBold(home);
      const awayBold = makeUnicodeBold(away);
      const flag = getMatchFlag(m);
      const kickoffWAT = formatKickoffWAT(m.date);
      lines.push(`${kickoffWAT} ${flag} ${homeBold} vs ${awayBold}`);
    });
  }

  const standardHashtags = '#Livescore #FootballNews #Matchday #LiveScore #ViralMatch #FootballFans';
  const callToAction = '💬 Drop your predictions and thoughts below! 👇';

  lines.push(`━━━━━━━━━━━━━━━━━━━`);
  lines.push(callToAction);
  lines.push(standardHashtags);
  return lines.join('\n');
}

/**
 * Creates the dedicated Today's Fixtures post for Top Leagues (including Saudi Pro League).
 */
export function formatTodayTopFixturesPost(matches: MatchEventSummary[], dateDisplay: string): string {
  const topMatches = matches.some((m) => !isTopLeague(m)) ? matches.filter(isTopLeague) : matches;
  return formatTodayFixturesPost(topMatches, dateDisplay, { category: 'top' });
}

/**
 * Creates the dedicated Today's Fixtures post for Lower / Other Leagues worldwide.
 */
export function formatTodayLowFixturesPost(matches: MatchEventSummary[], dateDisplay: string): string {
  const lowMatches = matches.some(isTopLeague) ? matches.filter((m) => !isTopLeague(m)) : matches;
  return formatTodayFixturesPost(lowMatches, dateDisplay, { category: 'low' });
}

/**
 * Formats Yesterday's Results Post for Facebook
 * Exactly matches the CLI's formatFixturesPost for yesterday
 */
export function formatYesterdayResultsPost(
  matches: MatchEventSummary[],
  dateDisplay: string,
  options: { category?: 'top' | 'low' } = {}
): string {
  const grouped: Record<string, MatchEventSummary[]> = {};
  matches.forEach((m) => {
    const league = m.league || 'Football';
    if (!grouped[league]) grouped[league] = [];
    grouped[league].push(m);
  });

  let titleText = 'RESULTS ARE IN!';
  if (options.category === 'top') {
    titleText = "YESTERDAY'S RESULTS — TOP LEAGUES!";
  } else if (options.category === 'low') {
    titleText = "YESTERDAY'S RESULTS — WORLD LEAGUES!";
  }
  const titleEmoji = `🏆 ${makeUnicodeBold(titleText)} ⚽🔥`;

  let subtitleText = "Yesterday's Final Scores";
  if (options.category === 'top') {
    subtitleText = 'Top Leagues & Saudi Pro League Final Scores';
  } else if (options.category === 'low') {
    subtitleText = 'Global & Lower Leagues Final Scores';
  }
  const subtitleEmoji = `📅 ${makeUnicodeBold(subtitleText)}`;

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
      const { home, away } = extractTeamNames(m);
      const { home: hScore, away: aScore } = extractScore(m);
      const homeBold = makeUnicodeBold(home);
      const awayBold = makeUnicodeBold(away);
      const flag = getMatchFlag(m);
      lines.push(`FT ${flag} ${homeBold} ${hScore} : ${aScore} ${awayBold}`);
    });
  }

  const standardHashtags = '#Livescore #FootballNews #Matchday #LiveScore #ViralMatch #FootballFans';
  const callToAction = '💬 What do you think about the scorelines? 👇';

  lines.push(`━━━━━━━━━━━━━━━━━━━`);
  lines.push(callToAction);
  lines.push(standardHashtags);
  return lines.join('\n');
}

/**
 * Creates the dedicated Yesterday's Results post for Top Leagues (including Saudi Pro League).
 */
export function formatYesterdayTopResultsPost(matches: MatchEventSummary[], dateDisplay: string): string {
  const topMatches = matches.some((m) => !isTopLeague(m)) ? matches.filter(isTopLeague) : matches;
  return formatYesterdayResultsPost(topMatches, dateDisplay, { category: 'top' });
}

/**
 * Creates the dedicated Yesterday's Results post for Lower / Other Leagues worldwide.
 */
export function formatYesterdayLowResultsPost(matches: MatchEventSummary[], dateDisplay: string): string {
  const lowMatches = matches.some(isTopLeague) ? matches.filter((m) => !isTopLeague(m)) : matches;
  return formatYesterdayResultsPost(lowMatches, dateDisplay, { category: 'low' });
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
    try {
      localStorage.setItem('fb_last_post_time', String(Date.now()));
    } catch {
      // ignore
    }
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
    try {
      localStorage.setItem('fb_last_post_time', String(Date.now()));
    } catch {
      // ignore
    }
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
