// services/espn.js
import axios from 'axios';
import config from '../config/env.js';
import logger from '../utils/logger.js';
import { isDateInTodayWAT, formatKickoffWAT, getTodayDateWAT, getTodayDateIsoWAT } from '../utils/time.js';
import { withRetry, resolveWithFallbacks } from '../utils/retry.js';
import { getCompetitionFlag } from '../utils/flags.js';

// ESPN API Base Hosts
export const SITE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
export const SITE_V3_BASE = 'https://site.api.espn.com/apis/v3/sports/soccer';
export const CORE_BASE = 'https://sports.core.api.espn.com/v2/sports/soccer';
export const CDN_BASE = 'https://cdn.espn.com/core/soccer';

// Comprehensive list of monitored football competitions / league slugs
// Includes domestic club leagues, European continental cups, senior international competitions, and Nigerian competitions.
export const COMPREHENSIVE_LEAGUES = [
  // Domestic Leagues - England & UK
  { slug: 'eng.1', name: 'English Premier League' },
  { slug: 'eng.2', name: 'English Championship' },
  { slug: 'eng.3', name: 'English League One' },
  { slug: 'eng.4', name: 'English League Two' },
  { slug: 'eng.5', name: 'English National League' },
  { slug: 'eng.fa', name: 'English FA Cup' },
  { slug: 'eng.league_cup', name: 'English Carabao Cup' },
  { slug: 'eng.trophy', name: 'EFL Trophy' },
  { slug: 'eng.charity', name: 'FA Community Shield' },
  { slug: 'eng.w.1', name: "Women's Super League" },
  { slug: 'sco.1', name: 'Scottish Premiership' },
  { slug: 'sco.2', name: 'Scottish Championship' },
  { slug: 'sco.tennents', name: 'Scottish Cup' },
  { slug: 'sco.cis', name: 'Scottish League Cup' },
  { slug: 'sco.challenge', name: 'SPFL Challenge Cup' },
  { slug: 'wal.1', name: 'Cymru Premier' },

  // Domestic Leagues & Cups - Europe
  { slug: 'esp.1', name: 'Spanish LaLiga' },
  { slug: 'esp.2', name: 'Spanish Segunda División' },
  { slug: 'esp.copa_del_rey', name: 'Spanish Copa del Rey' },
  { slug: 'esp.super_cup', name: 'Spanish Supercopa' },
  { slug: 'esp.w.1', name: 'Liga F' },
  { slug: 'ita.1', name: 'Italian Serie A' },
  { slug: 'ita.2', name: 'Italian Serie B' },
  { slug: 'ita.coppa_italia', name: 'Coppa Italia' },
  { slug: 'ita.super_cup', name: 'Supercoppa Italiana' },
  { slug: 'ger.1', name: 'German Bundesliga' },
  { slug: 'ger.2', name: 'German 2. Bundesliga' },
  { slug: 'ger.dfb_pokal', name: 'DFB-Pokal' },
  { slug: 'ger.super_cup', name: 'DFL-Supercup' },
  { slug: 'fra.1', name: 'French Ligue 1' },
  { slug: 'fra.2', name: 'French Ligue 2' },
  { slug: 'fra.coupe_de_france', name: 'Coupe de France' },
  { slug: 'fra.super_cup', name: 'Trophée des Champions' },
  { slug: 'por.1', name: 'Portuguese Primeira Liga' },
  { slug: 'por.taca.portugal', name: 'Taça de Portugal' },
  { slug: 'ned.1', name: 'Dutch Eredivisie' },
  { slug: 'ned.2', name: 'Dutch Eerste Divisie' },
  { slug: 'ned.cup', name: 'KNVB Beker' },
  { slug: 'bel.1', name: 'Belgian Pro League' },
  { slug: 'tur.1', name: 'Turkish Super Lig' },
  { slug: 'gre.1', name: 'Greek Super League' },
  { slug: 'nor.1', name: 'Norwegian Eliteserien' },
  { slug: 'swe.1', name: 'Swedish Allsvenskan' },
  { slug: 'den.1', name: 'Danish Superliga' },
  { slug: 'aut.1', name: 'Austrian Bundesliga' },
  { slug: 'sui.1', name: 'Swiss Super League' },
  { slug: 'pol.1', name: 'Polish Ekstraklasa' },
  { slug: 'rus.1', name: 'Russian Premier League' },
  { slug: 'ukr.1', name: 'Ukrainian Premier League' },

  // Middle East & Africa
  { slug: 'sau.1', name: 'Saudi Pro League' },
  { slug: 'ksa.1', name: 'Saudi Pro League' },
  { slug: 'ksa.kings.cup', name: 'King Cup' },
  { slug: 'nga.1', name: 'Nigerian Professional League' },
  { slug: 'rsa.1', name: 'South African Premiership' },
  { slug: 'egy.1', name: 'Egyptian Premier League' },
  { slug: 'mar.1', name: 'Moroccan Botola Pro' },

  // Americas
  { slug: 'usa.1', name: 'Major League Soccer (MLS)' },
  { slug: 'mls', name: 'Major League Soccer (MLS)' },
  { slug: 'usa.open', name: 'U.S. Open Cup' },
  { slug: 'usa.usl.1', name: 'USL Championship' },
  { slug: 'usa.usl.l1', name: 'USL League One' },
  { slug: 'usa.nwsl', name: 'NWSL' },
  { slug: 'usa.w.usl.1', name: 'USL Super League' },
  { slug: 'mex.1', name: 'Liga MX' },
  { slug: 'mex.2', name: 'Liga de Expansión MX' },
  { slug: 'mex.w.1', name: 'Liga MX Femenil' },
  { slug: 'bra.1', name: 'Campeonato Brasileiro Série A' },
  { slug: 'bra.2', name: 'Campeonato Brasileiro Série B' },
  { slug: 'bra.copa_do_brazil', name: 'Copa do Brasil' },
  { slug: 'arg.1', name: 'Argentine Primera División' },
  { slug: 'arg.copa', name: 'Copa de la Liga Profesional' },
  { slug: 'arg.2', name: 'Primera Nacional' },
  { slug: 'col.1', name: 'Categoría Primera A' },
  { slug: 'chi.1', name: 'Chilean Primera División' },
  { slug: 'uru.1', name: 'Uruguayan Primera División' },

  // Asia & Oceania
  { slug: 'jpn.1', name: 'J1 League' },
  { slug: 'kor.1', name: 'K League 1' },
  { slug: 'aus.1', name: 'A-League Men' },
  { slug: 'chn.1', name: 'Chinese Super League' },
  { slug: 'ind.1', name: 'Indian Super League' },

  // European Continental Competitions
  { slug: 'uefa.champions', name: 'UEFA Champions League' },
  { slug: 'uefa.europa', name: 'UEFA Europa League' },
  { slug: 'uefa.europa.conf', name: 'UEFA Europa Conference League' },
  { slug: 'uefa.super_cup', name: 'UEFA Super Cup' },
  { slug: 'uefa.wchampions', name: "UEFA Women's Champions League" },
  { slug: 'uefa.youth', name: 'UEFA Youth League' },

  // Other Continental Club Competitions
  { slug: 'conmebol.libertadores', name: 'Copa Libertadores' },
  { slug: 'conmebol.sudamericana', name: 'Copa Sudamericana' },
  { slug: 'conmebol.recopa', name: 'Recopa Sudamericana' },
  { slug: 'concacaf.champions', name: 'Concacaf Champions Cup' },
  { slug: 'concacaf.leagues.cup', name: 'Leagues Cup' },
  { slug: 'campeones.cup', name: 'Campeones Cup' },
  { slug: 'afc.champions', name: 'AFC Champions League' },
  { slug: 'afc.champions.east', name: 'AFC Champions League Elite East' },
  { slug: 'afc.champions.west', name: 'AFC Champions League Elite West' },
  { slug: 'afc.cup', name: 'AFC Champions League Two' },
  { slug: 'caf.champions', name: 'CAF Champions League' },
  { slug: 'caf.confed', name: 'CAF Confederation Cup' },

  // Senior International Competitions - Global & Continental
  { slug: 'fifa.world', name: 'FIFA World Cup' },
  { slug: 'fifa.worldq', name: 'FIFA World Cup Qualifying' },
  { slug: 'fifa.cwc', name: 'FIFA Club World Cup' },
  { slug: 'fifa.intercontinental_cup', name: 'FIFA Intercontinental Cup' },
  { slug: 'fifa.wwc', name: "FIFA Women's World Cup" },
  { slug: 'fifa.friendly', name: 'International Friendly' },
  { slug: 'club.friendly', name: 'Club Friendly' },
  { slug: 'uefa.euro', name: 'UEFA European Championship' },
  { slug: 'uefa.nations', name: 'UEFA Nations League' },
  { slug: 'uefa.euroq', name: 'UEFA European Championship Qualifying' },
  { slug: 'caf.nations', name: 'Africa Cup of Nations' },
  { slug: 'caf.nations_qual', name: 'Africa Cup of Nations Qualifying' },
  { slug: 'conmebol.america', name: 'Copa América' },
  { slug: 'conmebol.america_qual', name: 'Copa América Qualifying' },
  { slug: 'concacaf.gold', name: 'Concacaf Gold Cup' },
  { slug: 'concacaf.gold_qual', name: 'Concacaf Gold Cup Qualifying' },
  { slug: 'concacaf.nations.league', name: 'Concacaf Nations League' },
  { slug: 'afc.asian.cup', name: 'AFC Asian Cup' },
  { slug: 'afc.cupq', name: 'AFC Asian Cup Qualifiers' },
  { slug: 'fifa.worldq.ofc', name: 'FIFA World Cup Qualifying - OFC' },
];

// Single shared axios instance with configured timeout
const apiClient = axios.create({
  timeout: config.espn.requestTimeoutMs || 15000,
  headers: {
    'Accept': 'application/json',
  },
});

// Cache for athlete details to prevent duplicate requests
const athleteCache = new Map();

/**
 * Dynamically determines if an AFC Champions League Elite match is in the East or West region.
 * @param {string} homeName
 * @param {string} awayName
 * @returns {'east' | 'west'}
 */
export function getAfcRegion(homeName, awayName) {
  const westKeywords = [
    'hilal', 'nassr', 'ahli', 'sadd', 'gharafa', 'rayyan', 'ain', 'wasl', 
    'pakhtakor', 'persepolis', 'esteghlal', 'shorta', 'saudi', 'qatar', 'uae', 
    'uzbekistan', 'iran', 'iraq', 'baghdad', 'tehran', 'riyadh', 'dubai', 'doha', 'ahly'
  ];
  
  const eastKeywords = [
    'kobe', 'kawasaki', 'yokohama', 'hiroshima', 'central coast', 'mariners', 
    'gwangju', 'daejeon', 'ulsan', 'shanghai', 'shenhua', 'johor', 'buriram', 
    'kyoto', 'japan', 'korea', 'china', 'australia', 'thailand', 'malaysia', 
    'singapore', 'sanga', 'citizen', 'marinos', 'frontale', 'vissel', 'port',
    'sydney', 'melbourne', 'victory', 'adelaide'
  ];

  const h = (homeName || '').toLowerCase();
  const a = (awayName || '').toLowerCase();

  // Check West first
  for (const kw of westKeywords) {
    if (h.includes(kw) || a.includes(kw)) {
      return 'west';
    }
  }

  // Check East
  for (const kw of eastKeywords) {
    if (h.includes(kw) || a.includes(kw)) {
      return 'east';
    }
  }

  // Fallback default
  return 'east';
}

/**
 * Detects if a match or league is a women's league or competition.
 * @param {object} opts
 * @returns {boolean}
 */
export function isWomenCompetition(opts = {}) {
  const slug = String(opts.leagueSlug || opts.slug || opts.resolvedLeagueSlug || '').toLowerCase();
  const name = String(opts.leagueName || opts.league || opts.name || '').toLowerCase();
  const eventName = String(opts.eventName || opts.matchName || '').toLowerCase();
  const note = String(opts.altNote || opts.altGameNote || opts.notes || '').toLowerCase();

  // Slug matches
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

  // Name / description / keyword matches
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
 * Formats a team name by prefixing (W) if the match is a women's competition.
 * @param {string} teamName
 * @param {boolean} isWomen
 * @returns {string}
 */
export function formatWomenTeamName(teamName, isWomen) {
  if (!teamName) return '';
  if (!isWomen) return teamName;
  if (teamName.startsWith('(W) ') || teamName.startsWith('(W)')) return teamName;
  const clean = teamName.replace(/\s+(Women|Ladies|Fem|Femenil|Femmes|Femminile)$/i, '').trim();
  return `(W) ${clean}`;
}

/**
 * Normalizes an ESPN competition event into the application's standard NormalizedMatch shape.
 * @param {any} event
 * @param {string} [leagueSlugFallback]
 * @returns {any}
 */
export function normalizeMatch(event, leagueSlugFallback = 'soccer') {
  const comp = event.competitions?.[0] || {};
  const competitors = comp.competitors || [];
  const homeComp = competitors.find((c) => c.homeAway === 'home') || competitors[0] || {};
  const awayComp = competitors.find((c) => c.homeAway === 'away') || competitors[1] || {};

  const homeScore = parseInt(homeComp.score ?? '0', 10) || 0;
  const awayScore = parseInt(awayComp.score ?? '0', 10) || 0;

  const homeShootout = homeComp.shootoutScore !== undefined ? parseInt(homeComp.shootoutScore, 10) : null;
  const awayShootout = awayComp.shootoutScore !== undefined ? parseInt(awayComp.shootoutScore, 10) : null;
  const shootout = (homeShootout !== null && awayShootout !== null && !isNaN(homeShootout) && !isNaN(awayShootout))
    ? { home: homeShootout, away: awayShootout }
    : null;

  const statusType = comp.status?.type || event.status?.type || {};
  const state = statusType.state || 'pre'; // 'pre', 'in', 'post'

  let description = 'Scheduled';
  if (state === 'in') {
    if (statusType.name === 'STATUS_HALFTIME') {
      description = 'Halftime';
    } else if (comp.status?.period === 2) {
      description = 'Second half';
    } else {
      description = 'In Progress';
    }
  } else if (state === 'post') {
    description = statusType.shortDetail || 'Full Time';
  } else if (statusType.name === 'STATUS_POSTPONED') {
    description = 'Postponed';
  } else if (statusType.name === 'STATUS_CANCELED') {
    description = 'Cancelled';
  }

  let leagueSlug = event.league?.slug || comp.league?.slug || leagueSlugFallback;
  
  // Custom logic to handle AFC Champions League Elite regions
  if (leagueSlug === 'afc.champions' || leagueSlugFallback?.startsWith('afc.champions')) {
    const homeName = homeComp.team?.displayName || homeComp.team?.name || '';
    const awayName = awayComp.team?.displayName || awayComp.team?.name || '';
    const region = getAfcRegion(homeName, awayName);
    leagueSlug = `afc.champions.${region}`;
  }

  const leagueDef = COMPREHENSIVE_LEAGUES.find(
    (l) => l.slug === leagueSlug || l.slug === leagueSlugFallback
  );
  const rawAltNote = comp.altGameNote || comp.notes?.[0]?.headline || '';
  const leagueName =
    event.league?.name ||
    comp.league?.name ||
    leagueDef?.name ||
    rawAltNote ||
    (leagueSlug !== 'soccer' && leagueSlug !== 'all' ? leagueSlug : 'Soccer');

  const country =
    comp.venue?.address?.country ||
    event.competitions?.[0]?.venue?.address?.country ||
    '';
  const flag = getCompetitionFlag({
    leagueSlug,
    leagueName,
    country,
    venue: comp.venue,
  });

  const isWomen = isWomenCompetition({
    leagueSlug,
    leagueName,
    eventName: event.name,
    altNote: rawAltNote,
  });

  const rawHome = homeComp.team?.displayName || homeComp.team?.name || 'Home Team';
  const rawAway = awayComp.team?.displayName || awayComp.team?.name || 'Away Team';

  const homeName = formatWomenTeamName(rawHome, isWomen);
  const awayName = formatWomenTeamName(rawAway, isWomen);

  return {
    fixtureId: String(event.id || comp.id),
    uid: event.uid || `s:600~e:${event.id}`,
    homeName,
    awayName,
    isWomen,
    homeId: String(homeComp.id || homeComp.team?.id || ''),
    awayId: String(awayComp.id || awayComp.team?.id || ''),
    homeLogo: homeComp.team?.logo || '',
    awayLogo: awayComp.team?.logo || '',
    homeAbbreviation: homeComp.team?.abbreviation || '',
    awayAbbreviation: awayComp.team?.abbreviation || '',
    leagueName,
    leagueSlug,
    country,
    countryFlag: flag,
    flag,
    kickoff: event.date || comp.date || new Date().toISOString(),
    kickoffFormattedWAT: formatKickoffWAT(event.date || comp.date),
    venue: comp.venue?.fullName || '',
    status: {
      state,
      description,
      detail: statusType.detail || statusType.shortDetail || description,
      clock: comp.status?.displayClock || `${comp.status?.clock || 0}'`,
      period: comp.status?.period || 0,
      name: statusType.name || '',
    },
    score: {
      home: homeScore,
      away: awayScore,
    },
    shootout,
    lineups: {
      home: [],
      away: [],
    },
    lineupsAvailable: false,
    events: [],
    raw: {
      id: event.id,
      name: event.name,
      shortName: event.shortName,
    },
  };
}

/**
 * Creates a deterministic, stable signature for an event to prevent duplicate posts across polling cycles.
 * Never includes match score as an identity.
 * @param {object} ev
 * @param {string} fixtureId
 * @returns {string}
 */
export function eventSignature(ev, fixtureId) {
  const type = (ev.type || 'EVENT').toUpperCase();
  if (ev.id) {
    return `${fixtureId}:${type}:${ev.id}`;
  }
  const minute = ev.minute !== undefined && ev.minute !== null ? ev.minute : (ev.clock || '0');
  const period = ev.period || 1;
  const teamId = ev.teamId || '';
  return `${fixtureId}:${type}:p${period}:m${minute}:t${teamId}`;
}

/**
 * Resolves an athlete ID or $ref URL to a player display name.
 * Checks cache first to minimize external network requests.
 * @param {string} athleteRefOrId
 * @param {string} [leagueSlug='eng.1']
 * @returns {Promise<string>}
 */
export async function resolveAthlete(athleteRefOrId, leagueSlug = 'eng.1') {
  if (!athleteRefOrId) return '';
  if (athleteCache.has(athleteRefOrId)) {
    return athleteCache.get(athleteRefOrId);
  }

  const apiSlug = leagueSlug && leagueSlug.startsWith('afc.champions') ? 'afc.champions' : leagueSlug;
  let url = athleteRefOrId;
  if (!athleteRefOrId.startsWith('http')) {
    url = `${CORE_BASE}/leagues/${apiSlug}/athletes/${athleteRefOrId}`;
  }

  try {
    const res = await withRetry(() => apiClient.get(url), 2, `ResolveAthlete(${athleteRefOrId})`);
    const name = res.data?.displayName || res.data?.fullName || res.data?.name || '';
    if (name) {
      athleteCache.set(athleteRefOrId, name);
      return name;
    }
  } catch (err) {
    logger.debug(`Could not resolve athlete ${athleteRefOrId}: ${err.message}`);
  }

  return '';
}

/**
 * Fetches all football matches strictly scheduled for the current calendar date in West Africa Time (Africa/Lagos).
 *
 * Strict Date Guarantee:
 * - Current calendar day determined by Africa/Lagos
 * - Discovers fixtures via global 'all' scoreboard and core competitions
 * - Strictly filters out yesterday, tomorrow, and future matches
 * - Deduplicates by fixture ID
 * - Sorts chronologically
 *
 * @param {string} [targetDateWAT] optional override date in YYYY-MM-DD format (defaults to current date in WAT)
 * @returns {Promise<any[]>}
 */
export async function fetchTodaysMatches(targetDateWAT = null) {
  const activeDateWAT = targetDateWAT || getTodayDateIsoWAT();
  const dateStrForEspn = activeDateWAT.replace(/-/g, ''); // YYYYMMDD

  logger.info(`[ESPN] Fetching today's football matches...`);
  logger.info(`[ESPN] Date: ${activeDateWAT}`);
  logger.info(`[ESPN] Timezone: Africa/Lagos`);

  const matchesMap = new Map();
  let competitionsChecked = 0;
  let matchesDiscovered = 0;
  let duplicatesCount = 0;

  // Query the 17 monitored competitions in parallel with controlled concurrency
  const priorityLeagues = COMPREHENSIVE_LEAGUES;
  const leagueBatches = [];
  const batchSize = 6;

  for (let i = 0; i < priorityLeagues.length; i += batchSize) {
    leagueBatches.push(priorityLeagues.slice(i, i + batchSize));
  }

  for (const batch of leagueBatches) {
    await Promise.allSettled(
      batch.map(async (league) => {
        competitionsChecked++;
        try {
          let apiSlug = league.slug === 'sau.1' ? 'ksa.1' : (league.slug === 'mls' ? 'usa.1' : league.slug);
          if (apiSlug && apiSlug.startsWith('afc.champions')) {
            apiSlug = 'afc.champions';
          }
          const url = `${SITE_BASE}/${apiSlug}/scoreboard?dates=${dateStrForEspn}`;
          const res = await withRetry(() => apiClient.get(url), 1, `ESPN ${league.name} Scoreboard`);
          const events = res.data?.events || [];

          for (const ev of events) {
            matchesDiscovered++;
            const id = String(ev.id);
            if (matchesMap.has(id)) {
              duplicatesCount++;
              continue;
            }

            const kickoffUtc = ev.date || ev.competitions?.[0]?.date;
            if (isDateInTodayWAT(kickoffUtc, activeDateWAT)) {
              matchesMap.set(id, normalizeMatch(ev, league.slug));
            }
          }
        } catch (err) {
          logger.debug(`League scoreboard for ${league.slug} returned: ${err.message}`);
        }
      })
    );
  }

  // Also query the global 'all' scoreboard to discover ALL leagues and matches that the API gets
  try {
    competitionsChecked++;
    const allUrl = `${SITE_BASE}/all/scoreboard?dates=${dateStrForEspn}`;
    const allRes = await withRetry(() => apiClient.get(allUrl), 1, `ESPN Global Scoreboard`);
    const allEvents = allRes.data?.events || [];
    for (const ev of allEvents) {
      matchesDiscovered++;
      const id = String(ev.id);
      if (matchesMap.has(id)) {
        duplicatesCount++;
        continue;
      }
      const kickoffUtc = ev.date || ev.competitions?.[0]?.date;
      if (isDateInTodayWAT(kickoffUtc, activeDateWAT)) {
        matchesMap.set(id, normalizeMatch(ev, 'all'));
      }
    }
  } catch (err) {
    logger.debug(`Global scoreboard query returned: ${err.message}`);
  }

  const finalMatches = Array.from(matchesMap.values());

  // Sort chronologically by kickoff timestamp
  finalMatches.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());

  logger.info(`[ESPN] Competitions checked: ${competitionsChecked}`);
  logger.info(`[ESPN] Matches discovered: ${matchesDiscovered}`);
  logger.info(`[ESPN] Matches after strict WAT date filtering: ${finalMatches.length}`);
  logger.info(`[ESPN] Duplicates removed: ${duplicatesCount}`);

  return finalMatches;
}

/**
 * Alias for getTodayMatches for backwards/cross-module compatibility.
 * @param {string} [targetDateWAT]
 * @returns {Promise<any[]>}
 */
export async function getTodayMatches(targetDateWAT = null) {
  return fetchTodaysMatches(targetDateWAT);
}

/**
 * Fetches match summary payload from ESPN's SITE API.
 * Contains header, boxscore, rosters (lineups), keyEvents, commentary.
 * @param {string} fixtureId
 * @param {string} [leagueSlug='eng.1']
 * @returns {Promise<any>}
 */
export async function getMatchSummary(fixtureId, leagueSlug = 'eng.1') {
  let apiSlug = leagueSlug && leagueSlug.startsWith('afc.champions') ? 'afc.champions' : (leagueSlug || 'all');
  if (apiSlug === 'soccer') apiSlug = 'all';
  const url = `${SITE_BASE}/${apiSlug}/summary?event=${fixtureId}`;
  return withRetry(() => apiClient.get(url), config.espn.maxRetries, `MatchSummary(${fixtureId})`)
    .then((res) => res.data)
    .catch(async (err) => {
      // If specific league summary failed (e.g. 404), fall back to universal all/summary
      if (apiSlug !== 'all') {
        try {
          const fallbackUrl = `${SITE_BASE}/all/summary?event=${fixtureId}`;
          const fallbackRes = await apiClient.get(fallbackUrl);
          if (fallbackRes.data) return fallbackRes.data;
        } catch (fbErr) {
          logger.debug(`Universal summary fallback failed for ${fixtureId}: ${fbErr.message}`);
        }
      }
      logger.warn(`Failed to fetch match summary for fixture ${fixtureId}: ${err.message}`);
      return null;
    });
}

/**
 * Fetches detailed plays from the CORE ESPN API.
 * Used as fallback for event feeds, scorer/assist attribution, and penalties.
 * @param {string} fixtureId
 * @param {string} [leagueSlug='eng.1']
 * @returns {Promise<any[]>}
 */
export async function getMatchPlays(fixtureId, leagueSlug = 'eng.1') {
  const apiSlug = leagueSlug && leagueSlug.startsWith('afc.champions') ? 'afc.champions' : leagueSlug;
  const url = `${CORE_BASE}/leagues/${apiSlug}/events/${fixtureId}/competitions/${fixtureId}/plays?limit=300`;
  try {
    const res = await withRetry(() => apiClient.get(url), 2, `MatchPlays(${fixtureId})`);
    return res.data?.items || [];
  } catch (err) {
    logger.debug(`Could not fetch core plays for fixture ${fixtureId}: ${err.message}`);
    return [];
  }
}

/**
 * Extracts lineups using ESPN's multi-step fallback chain:
 * 1. summary?event={fixtureId} -> rosters[]
 * 2. CORE roster endpoint
 * 3. Athlete $ref resolution
 * Gated by pre-kickoff status in the event engine.
 * @param {string} fixtureId
 * @param {string} [leagueSlug='eng.1']
 * @param {any} [preloadedSummary]
 * @returns {Promise<{ home: string[], away: string[], startersHome: any[], startersAway: any[], hasLineups: boolean }>}
 */
export async function getMatchLineups(fixtureId, leagueSlug = 'eng.1', preloadedSummary = null) {
  const apiSlug = leagueSlug && leagueSlug.startsWith('afc.champions') ? 'afc.champions' : leagueSlug;
  const summary = preloadedSummary || (await getMatchSummary(fixtureId, apiSlug));

  // Step 1: Check summary.rosters
  const rosters = summary?.rosters;
  if (Array.isArray(rosters) && rosters.length >= 2) {
    const homeRoster = rosters.find((r) => r.homeAway === 'home') || rosters[0];
    const awayRoster = rosters.find((r) => r.homeAway === 'away') || rosters[1];

    const extractNames = (rosterObj) => {
      const athletes = rosterObj?.roster || [];
      const starters = athletes.filter((a) => a.starter === true);
      const chosen = starters.length >= 7 ? starters : athletes.slice(0, 11);
      return chosen
        .map((a) => a.athlete?.displayName || a.athlete?.fullName || a.athlete?.name || '')
        .filter(Boolean);
    };

    const homeNames = extractNames(homeRoster);
    const awayNames = extractNames(awayRoster);

    if (homeNames.length >= 7 && awayNames.length >= 7) {
      return {
        home: homeNames,
        away: awayNames,
        startersHome: homeRoster?.roster?.filter((a) => a.starter) || [],
        startersAway: awayRoster?.roster?.filter((a) => a.starter) || [],
        hasLineups: true,
      };
    }
  }

  // Step 2: Fallback to core competitor roster
  logger.debug(`Lineups not complete in summary for ${fixtureId}; attempting core roster fallback...`);
  try {
    const compUrl = `${CORE_BASE}/leagues/${apiSlug}/events/${fixtureId}/competitions/${fixtureId}`;
    const compRes = await apiClient.get(compUrl);
    const competitors = compRes.data?.competitors || [];

    if (competitors.length >= 2) {
      const fetchCoreRoster = async (teamRef) => {
        const rosterRef = teamRef?.roster?.$ref;
        if (!rosterRef) return [];
        const rRes = await apiClient.get(rosterRef);
        const entries = rRes.data?.entries || [];
        const starterEntries = entries.filter((e) => e.starter === true);
        const targetEntries = starterEntries.length >= 7 ? starterEntries : entries.slice(0, 11);

        const names = [];
        for (const entry of targetEntries) {
          if (entry.athlete?.$ref) {
            const name = await resolveAthlete(entry.athlete.$ref, apiSlug);
            if (name) names.push(name);
          }
        }
        return names;
      };

      const homeNames = await fetchCoreRoster(competitors[0]);
      const awayNames = await fetchCoreRoster(competitors[1]);

      if (homeNames.length >= 7 && awayNames.length >= 7) {
        return {
          home: homeNames,
          away: awayNames,
          startersHome: [],
          startersAway: [],
          hasLineups: true,
        };
      }
    }
  } catch (err) {
    logger.debug(`Core roster fallback failed for ${fixtureId}: ${err.message}`);
  }

  return {
    home: [],
    away: [],
    startersHome: [],
    startersAway: [],
    hasLineups: false,
  };
}

/**
 * Determines whether a raw item or play is from a post-match penalty shootout.
 * Shootout kicks are tiebreakers and must NEVER be treated as match goals or in-game penalties.
 * @param {any} item
 * @returns {boolean}
 */
export function isShootoutEvent(item) {
  if (!item) return false;
  const play = item.play || {};
  const periodNum = item.period?.number ?? play.period?.number ?? (typeof item.period === 'number' ? item.period : null) ?? (typeof play.period === 'number' ? play.period : null);
  if (periodNum === 5) return true;

  const periodType = String(item.period?.type || play.period?.type || item.period?.slug || play.period?.slug || '').toUpperCase();
  if (periodType.includes('SHOOTOUT')) return true;

  const typeText = String(item.type?.text || play.type?.text || item.type?.type || play.type?.type || '').toLowerCase();
  if (typeText.includes('shootout')) return true;

  const text = String(item.text || play.text || item.shortText || play.shortText || '').toLowerCase();
  if (text.includes('penalty shootout') || text.includes('shootout')) return true;
  if (item.shootoutPlay === true || item.isShootout === true || play.shootout === true) return true;

  // ESPN shootout commentary scoreline pattern like "Barnsley 3(1)" or "3(1), Barnsley 3(2)" or "3(4)"
  if (/\b\d+\s*\(\d+\)/.test(text)) return true;

  return false;
}

/**
 * Normalizes an in-match event from ESPN keyEvents, commentary, or plays.
 * Handles goals, red cards, injuries, penalties, VAR, state transitions.
 * @param {any} item
 * @param {any} matchContext
 * @returns {any|null}
 */
function _normalizeEvent(item, matchContext = {}) {
  if (!item) return null;

  // Penalty Shootout kicks are tiebreakers, NOT regular match goals or in-game penalties!
  if (isShootoutEvent(item)) {
    return null;
  }

  const text = (item.text || item.alternativeText || '').trim();
  const lowerText = text.toLowerCase();
  const typeText = (item.type?.text || item.type?.type || '').toLowerCase();

  // Determine clock / minute
  let minute = null;
  let stoppageTime = null;
  const clockStr = item.clock?.displayValue || item.time?.displayValue || item.clock?.value || '';

  if (clockStr) {
    const match = String(clockStr).match(/(\d+)(?:\+(\d+))?/);
    if (match) {
      minute = parseInt(match[1], 10);
      if (match[2]) {
        stoppageTime = parseInt(match[2], 10);
      }
    }
  }

  // Fallback: extract minute from text e.g. "(37')"
  if (minute === null) {
    const textMinMatch = text.match(/(\d+)'/);
    if (textMinMatch) {
      minute = parseInt(textMinMatch[1], 10);
    }
  }

  const teamId = String(item.team?.id || item.competitor?.id || item.teamId || '');
  const teamName = String(item.team?.displayName || item.team?.name || item.competitor?.displayName || item.competitor?.name || '');
  const rawAthletes =
    item.athletesInvolved ||
    item.participants?.map((p) => p.athlete || p) ||
    item.play?.participants?.map((p) => p.athlete || p) ||
    [];

  const getAthleteName = (a) => {
    if (!a) return '';
    if (typeof a === 'string') return a;
    if (a.athlete) {
      return a.athlete.displayName || a.athlete.name || a.athlete.fullName || a.athlete.shortName || '';
    }
    return a.displayName || a.name || a.fullName || a.shortName || '';
  };

  let primaryAthlete = getAthleteName(rawAthletes[0]);
  let secondaryAthlete = getAthleteName(rawAthletes[1]);

  // 1. GOAL & DISALLOWED GOAL Detection
  // 1. GOAL & DISALLOWED GOAL & OWN GOAL Detection
  if (
    item.scoringPlay === true ||
    item.ownGoal === true ||
    typeText.includes('goal') ||
    typeText.includes('own') ||
    typeText.includes('autogol') ||
    lowerText.includes('goal') ||
    lowerText.includes('own goal') ||
    lowerText.includes('own-goal') ||
    lowerText.includes('autogol') ||
    lowerText.includes('gol en contra')
  ) {
    const isOwnGoal =
      item.ownGoal === true ||
      lowerText.includes('own goal') ||
      lowerText.includes('own-goal') ||
      lowerText.includes('autogol') ||
      lowerText.includes('gol en contra') ||
      typeText.includes('own goal') ||
      typeText.includes('own-goal') ||
      typeText.includes('autogol');
    const isDisallowed =
      lowerText.includes('disallowed') ||
      lowerText.includes('overturned') ||
      lowerText.includes('no goal') ||
      typeText.includes('disallowed');

    const isPenaltyKick =
      item.penaltyKick === true ||
      typeText.includes('penalty') ||
      lowerText.includes('penalty') ||
      lowerText.includes('from the spot');

    const isPenaltyScored =
      isPenaltyKick &&
      !isDisallowed &&
      !isOwnGoal &&
      (
        lowerText.includes('scores') ||
        lowerText.includes('converted') ||
        lowerText.includes('converts') ||
        lowerText.includes('penalty goal') ||
        typeText.includes('scored') ||
        typeText.includes('penalty goal') ||
        typeText.includes('penalty - scored') ||
        item.scoringPlay === true ||
        item.outcome === 'SCORED'
      ) &&
      !lowerText.includes('missed') &&
      !lowerText.includes('saved') &&
      !lowerText.includes('hit the post') &&
      !lowerText.includes('over the bar');

    if (isPenaltyKick && !isPenaltyScored && !isDisallowed) {
      // Missed, saved, or non-scoring penalties are never goals
      return null;
    }

    let scorer = primaryAthlete;
    let assist = secondaryAthlete || null;

    // Free text regex extraction if athletesInvolved was empty
    if (!scorer && isOwnGoal) {
      const ogMatch = text.match(/(?:Own\s*Goal\s+by|Autogol\s+de|Gol\s+en\s+contra\s+de)\s+([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.'-]+?)(?:\s*\(|,|\.|$)/i);
      if (ogMatch) {
        scorer = ogMatch[1].trim();
      }
    }
    if (!scorer && isPenaltyScored) {
      const penMatch = text.match(/penalty (?:taken by|scored by|converted by) ([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.-]+?)(?:\.|$|\()/i);
      if (penMatch) {
        scorer = penMatch[1].trim();
      }
    }
    if (!scorer) {
      const scorerMatch = text.match(/(?:Goal!|Goal\s+).*?([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.-]+?)(?:\s+\(| scored|\.|$)/);
      if (scorerMatch) {
        scorer = scorerMatch[1].trim();
      }
    }

    let playerTeam = teamName;
    if (isOwnGoal && text) {
      const tmMatch = text.match(/(?:Own\s*Goal\s+by|Autogol\s+de|Gol\s+en\s+contra\s+de)\s+[A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.'-]+?(?:,|\()\s*([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)(?:\)|\.|$)/i);
      if (tmMatch) {
        playerTeam = tmMatch[1].trim();
      }
    }

    if (!assist && !isOwnGoal && lowerText.includes('assisted by')) {
      const assistMatch = text.match(
        /assisted by\s+([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.'-]+?)(?=\s+(?:with|following|after|through|from|via|on|\(|,|;|\.|$)|[.,;)]|$)/i
      );
      if (assistMatch) {
        let cleanAssist = assistMatch[1].trim().replace(/[.,;)]+$/, '').trim();
        cleanAssist = cleanAssist.replace(/\s+(?:with|following|after|through|from|via|on)$/i, '').trim();
        if (cleanAssist.length >= 2 && cleanAssist.length <= 40) {
          assist = cleanAssist;
        }
      }
    }

    let extractedHomeScore = item.homeScore !== undefined && item.homeScore !== null ? parseInt(item.homeScore, 10) : null;
    let extractedAwayScore = item.awayScore !== undefined && item.awayScore !== null ? parseInt(item.awayScore, 10) : null;

    // Parse score from text like "Goal! Platense 1, Fluminense 0." or "Own Goal by Sven Botman, Newcastle United. Manchester United 1, Newcastle United 0."
    if (text) {
      const p1 = text.match(/(?:Goal!.*?\b|Own\s*Goal.*?\b|\b)([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+),\s*([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+)/i);
      if (p1) {
        const t1 = p1[1].trim().toLowerCase();
        const s1 = parseInt(p1[2], 10);
        const t2 = p1[3].trim().toLowerCase();
        const s2 = parseInt(p1[4], 10);
        const hName = (matchContext.homeName || '').toLowerCase().trim();
        const aName = (matchContext.awayName || '').toLowerCase().trim();
        if (hName && (t1.includes(hName) || hName.includes(t1))) {
          extractedHomeScore = s1;
          extractedAwayScore = s2;
        } else if (aName && (t1.includes(aName) || aName.includes(t1))) {
          extractedHomeScore = s2;
          extractedAwayScore = s1;
        } else {
          extractedHomeScore = s1;
          extractedAwayScore = s2;
        }
      } else if (extractedHomeScore === null || (extractedHomeScore === 0 && extractedAwayScore === 0)) {
        const p2 = text.match(/(\d+)\s*[-–]\s*(\d+)/);
        if (p2) {
          const s1 = parseInt(p2[1], 10);
          const s2 = parseInt(p2[2], 10);
          const afterMatch = text.slice(p2.index + p2[0].length, p2.index + p2[0].length + 10).toLowerCase();
          if (s1 <= 15 && s2 <= 15 && !afterMatch.includes('yard') && !afterMatch.includes('met') && !afterMatch.includes('ft')) {
            extractedHomeScore = s1;
            extractedAwayScore = s2;
          }
        }
      }
    }

    if (isDisallowed) {
      return {
        type: 'GOAL_DISALLOWED',
        teamId,
        teamName,
        player: scorer || null,
        assist: assist || null,
        minute: minute || 0,
        stoppageTime,
        period: item.period?.number || 1,
        homeScore: extractedHomeScore,
        awayScore: extractedAwayScore,
        disallowed: true,
        reason: text,
        text,
      };
    }

    const hasValidScore = extractedHomeScore !== null && extractedAwayScore !== null && (extractedHomeScore > 0 || extractedAwayScore > 0);
    const finalType = isOwnGoal ? 'OWN_GOAL' : isPenaltyScored ? 'PENALTY_SCORED' : 'GOAL';

    return {
      type: finalType,
      outcome: isPenaltyScored ? 'SCORED' : undefined,
      teamId,
      teamName: playerTeam || teamName,
      player: scorer || null,
      assist: (isOwnGoal || isPenaltyScored) ? null : (assist || null),
      minute: minute || 0,
      stoppageTime,
      period: item.period?.number || 1,
      homeScore: extractedHomeScore,
      awayScore: extractedAwayScore,
      scoreAfterEvent: hasValidScore ? { home: extractedHomeScore, away: extractedAwayScore } : null,
      ownGoal: isOwnGoal,
      disallowed: false,
      text,
    };
  }

  // 2. RED CARD Detection
  // Strict, false-positive-free detection:
  // - Handles negation (e.g. "no red card", "avoided a red card", "escaped a red card", "red card overturned")
  // - Handles non-dismissal sports phrases with "sent off" (e.g. "sent off target", "sent off the crossbar/post/woodwork/bar/line", "sent off balance", "sent off on a stretcher", "sent off for treatment")
  // - Handles historical references (e.g. "was sent off in the reverse fixture", "had been sent off earlier this season")
  // - Handles regular yellow cards (ESPN item.yellowCard === true && !item.redCard)
  // - Requires affirmative dismissal language or official ESPN redCard flag
  // - Requires an identified player for free-text / commentary detections
  const isYellowOnly = item.yellowCard === true && item.redCard !== true && !typeText.includes('second yellow') && !typeText.includes('2nd yellow');
  const confirmsSecondYellow = (lowerText.includes('second yellow') || lowerText.includes('2nd yellow')) &&
                              (lowerText.includes('sent off') || lowerText.includes('red card'));
  const isExcludedYellow = isYellowOnly && !confirmsSecondYellow;

  const negationPattern = /\b(?:no\s+red\s+card|not\s+(?:a\s+)?red\s+card|avoid(?:s|ed|ing)?\s+(?:a\s+)?red\s+card|escap(?:es|ed|ing)?\s+(?:a\s+)?red\s+card|red\s+card\s+(?:overturned|rescinded|cancelled|canceled)|overturned\s+(?:the\s+)?red\s+card|instead\s+of\s+a\s+red\s+card|rather\s+than\s+a\s+red\s+card)\b/i;
  const nonDismissalSentOff = /\bsent\s+off[\s-]*(?:target|balance|the\s+(?:crossbar|post|woodwork|bar|line)|(?:the\s+(?:pitch|field)\s+)?(?:on\s+a\s+stretcher|for\s+treatment|injured))\b/i;
  const pastHistoricalSentOff = /\b(?:was|had\s+been)\s+sent\s+off\s+(?:in\s+the|last|earlier|previously|against)\b/i;
  const avoidSentOff = /\b(?:avoid(?:s|ed|ing)?|escap(?:es|ed|ing)?|not)\s+being\s+sent\s+off\b/i;

  const isNegatedOrNonDismissal =
    negationPattern.test(text) ||
    nonDismissalSentOff.test(text) ||
    pastHistoricalSentOff.test(text) ||
    avoidSentOff.test(text);

  const officialRed = item.redCard === true || typeText === 'red card' || typeText === 'second yellow card' || typeText === 'red-card';
  const textAffirmative =
    /\b(?:is|was|has\s+been)\s+shown\s+(?:a\s+|the\s+)?(?:straight\s+)?red\s+card\b/i.test(text) ||
    /\b(?:receives|received|gets|given)\s+(?:a\s+|the\s+)?(?:straight\s+)?red\s+card\b/i.test(text) ||
    /\b(?:is|was|has\s+been)\s+sent\s+off\b/i.test(text) ||
    /\b(?:second\s+yellow\s+card\s+and\s+is\s+sent\s+off|shown\s+a\s+second\s+yellow\s+card)\b/i.test(text) ||
    /\bstraight\s+red\s+card\b/i.test(text) ||
    /\bsees\s+red\b/i.test(text);

  if (!isExcludedYellow && !isNegatedOrNonDismissal && (officialRed || textAffirmative)) {
    const isSecondYellow =
      typeText.includes('second yellow') ||
      typeText.includes('2nd yellow') ||
      lowerText.includes('second yellow') ||
      lowerText.includes('2nd yellow');

    let player = primaryAthlete;
    if (!player) {
      const cardMatch = text.match(/([A-Z][a-zA-Z\s.-]+?)\s+(?:(?:is|was|has\s+been)\s+)?(?:shown\s+(?:a\s+|the\s+)?(?:straight\s+)?red\s+card|receives?\s+(?:a\s+|the\s+)?(?:straight\s+)?red\s+card|sent\s+off|sees\s+red)/i);
      if (cardMatch) player = cardMatch[1].trim();
    }

    if (player || officialRed) {
      return {
        type: 'RED_CARD',
        player: player || null,
        teamId,
        minute: minute || 0,
        period: item.period?.number || 1,
        isSecondYellow,
        description: text,
        text,
      };
    }
  }

  // 3. PENALTIES Detection (Only whitelisted PENALTY SCORED is permitted)
  if (item.penaltyKick === true || typeText.includes('penalty') || lowerText.includes('penalty') || lowerText.includes('from the spot')) {
    const isScored =
      !lowerText.includes('missed') &&
      !lowerText.includes('saved') &&
      !lowerText.includes('hit the post') &&
      !lowerText.includes('over the bar') &&
      (
        lowerText.includes('scores') ||
        lowerText.includes('converted') ||
        lowerText.includes('converts') ||
        lowerText.includes('penalty goal') ||
        typeText.includes('scored') ||
        typeText.includes('penalty goal') ||
        typeText.includes('penalty - scored') ||
        item.scoringPlay === true ||
        item.outcome === 'SCORED'
      );

    if (isScored) {
      let player = primaryAthlete;
      if (!player) {
        const penMatch = text.match(/penalty (?:taken by|scored by|converted by) ([A-ZÀ-ÖØ-öø-ÿ][a-zA-ZÀ-ÖØ-öø-ÿ\s.-]+?)(?:\.|$|\()/i);
        if (penMatch) player = penMatch[1].trim();
      }

      let extractedHomeScore = item.homeScore !== undefined && item.homeScore !== null ? parseInt(item.homeScore, 10) : null;
      let extractedAwayScore = item.awayScore !== undefined && item.awayScore !== null ? parseInt(item.awayScore, 10) : null;

      if ((extractedHomeScore === null || (extractedHomeScore === 0 && extractedAwayScore === 0)) && text) {
        const p1 = text.match(/\b([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+),\s*([A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+?)\s+(\d+)/i);
        if (p1) {
          const t1 = p1[1].trim().toLowerCase();
          const s1 = parseInt(p1[2], 10);
          const t2 = p1[3].trim().toLowerCase();
          const s2 = parseInt(p1[4], 10);
          const hName = (matchContext.homeName || '').toLowerCase().trim();
          const aName = (matchContext.awayName || '').toLowerCase().trim();
          if (hName && (t1.includes(hName) || hName.includes(t1))) {
            extractedHomeScore = s1;
            extractedAwayScore = s2;
          } else if (aName && (t1.includes(aName) || aName.includes(t1))) {
            extractedHomeScore = s2;
            extractedAwayScore = s1;
          } else {
            extractedHomeScore = s1;
            extractedAwayScore = s2;
          }
        } else {
          const p2 = text.match(/(\d+)\s*[-–]\s*(\d+)/);
          if (p2) {
            extractedHomeScore = parseInt(p2[1], 10);
            extractedAwayScore = parseInt(p2[2], 10);
          }
        }
      }

      const hasValidScore = extractedHomeScore !== null && extractedAwayScore !== null && (extractedHomeScore > 0 || extractedAwayScore > 0);

      return {
        type: 'PENALTY_SCORED',
        outcome: 'SCORED',
        player: player || null,
        teamId,
        teamName,
        minute: minute || 0,
        period: item.period?.number || 1,
        homeScore: extractedHomeScore,
        awayScore: extractedAwayScore,
        scoreAfterEvent: hasValidScore ? { home: extractedHomeScore, away: extractedAwayScore } : null,
        text,
      };
    }

    // Missed penalties, saved penalties, or penalty awarded are strictly ignored per whitelist
    return null;
  }

  // 4. HALFTIME & FULLTIME Detection
  if (
    typeText.includes('halftime') ||
    lowerText.includes('half time') ||
    lowerText.includes('half-time')
  ) {
    return {
      type: 'HALF_TIME',
      minute: minute || 45,
      period: 1,
      homeScore: item.homeScore ?? matchContext.score?.home ?? 0,
      awayScore: item.awayScore ?? matchContext.score?.away ?? 0,
      text: text || 'Halftime',
    };
  }

  if (
    typeText.includes('full time') ||
    typeText.includes('final') ||
    lowerText.includes('full time') ||
    lowerText.includes('full-time')
  ) {
    return {
      type: 'FULL_TIME',
      minute: minute || 90,
      period: 2,
      homeScore: item.homeScore ?? matchContext.score?.home ?? 0,
      awayScore: item.awayScore ?? matchContext.score?.away ?? 0,
      text: text || 'Full Time',
    };
  }

  // 5. VAR Detection (Only allowed if directly resulting in a disallowed goal)
  if (typeText.includes('var') || lowerText.includes('var decision') || lowerText.includes('var:')) {
    const isDisallowed =
      lowerText.includes('disallowed') ||
      lowerText.includes('overturned') ||
      lowerText.includes('no goal');

    if (isDisallowed) {
      return {
        type: 'GOAL_DISALLOWED',
        teamId,
        player: primaryAthlete || null,
        minute: minute || 0,
        period: item.period?.number || 1,
        homeScore: item.homeScore !== undefined ? item.homeScore : null,
        awayScore: item.awayScore !== undefined ? item.awayScore : null,
        reason: text,
        text,
      };
    }

    // General VAR checks/reviews are ignored per whitelist
    return null;
  }

  return null;
}

export function normalizeEvent(item, matchContext = {}) {
  const result = _normalizeEvent(item, matchContext);
  if (result) {
    if (item.id) {
      result.id = String(item.id);
    } else if (item.play?.id) {
      result.id = String(item.play.id);
    }
    let occurrenceTime = null;
    let rawTime = item.wallclock || item.wallClock || item.play?.wallclock || item.play?.wallClock || item.timestamp || item.date;
    if (rawTime) {
      const d = new Date(rawTime);
      if (!isNaN(d.getTime())) {
        occurrenceTime = d.toISOString();
      }
    }
    if (!occurrenceTime && matchContext.kickoff && result.minute !== undefined && result.minute !== null) {
      const kickoff = new Date(matchContext.kickoff);
      if (!isNaN(kickoff.getTime())) {
        const extraMinutes = result.minute + (result.minute > 45 ? 15 : 0);
        occurrenceTime = new Date(kickoff.getTime() + extraMinutes * 60 * 1000).toISOString();
      }
    }
    if (!occurrenceTime) {
      occurrenceTime = new Date().toISOString();
    }
    result.occurrenceTime = occurrenceTime;
  }
  return result;
}

/**
 * Fetches comprehensive match details, merging data across all ESPN endpoints.
 * @param {string} fixtureId
 * @param {string} [leagueSlug='eng.1']
 * @param {any} [existingMatch]
 * @returns {Promise<any>}
 */
export async function fetchMatchDetails(fixtureId, leagueSlug = 'eng.1', existingMatch = null) {
  const summary = await getMatchSummary(fixtureId, leagueSlug);
  let normalized;
  
  if (existingMatch) {
    normalized = {
      ...existingMatch,
      status: {
        state: existingMatch.lastStatus,
        period: existingMatch.lastPeriod,
        clock: existingMatch.lastClock,
        description: '', // or initialize as needed
        detail: '',
        name: ''
      },
      score: existingMatch.lastScore
    };
  } else {
    normalized = normalizeMatch(summary?.header || { id: fixtureId }, leagueSlug);
  }

  // Update status and scores from summary
  if (summary?.header?.competitions?.[0]) {
    const comp = summary.header.competitions[0];
    const statusType = comp.status?.type || {};
    normalized.status.state = statusType.state || normalized.status.state;
    normalized.status.clock = comp.status?.displayClock || normalized.status.clock;
    normalized.status.period = comp.status?.period ?? normalized.status.period;
    normalized.status.name = statusType.name || normalized.status.name;

    const competitors = comp.competitors || [];
    const homeComp = competitors.find((c) => c.homeAway === 'home') || competitors[0];
    const awayComp = competitors.find((c) => c.homeAway === 'away') || competitors[1];
    if (homeComp?.score !== undefined) normalized.score.home = parseInt(homeComp.score, 10) || 0;
    if (awayComp?.score !== undefined) normalized.score.away = parseInt(awayComp.score, 10) || 0;

    const isWomen = normalized.isWomen || isWomenCompetition({ leagueSlug: normalized.leagueSlug, leagueName: normalized.leagueName });
    if (homeComp) {
      normalized.homeId = String(homeComp.id || homeComp.team?.id || normalized.homeId || '');
      if (homeComp.team?.displayName || homeComp.team?.name) {
        normalized.homeName = formatWomenTeamName(homeComp.team.displayName || homeComp.team.name, isWomen);
      }
    }
    if (awayComp) {
      normalized.awayId = String(awayComp.id || awayComp.team?.id || normalized.awayId || '');
      if (awayComp.team?.displayName || awayComp.team?.name) {
        normalized.awayName = formatWomenTeamName(awayComp.team.displayName || awayComp.team.name, isWomen);
      }
    }

    const homeShootout = homeComp?.shootoutScore !== undefined ? parseInt(homeComp.shootoutScore, 10) : null;
    const awayShootout = awayComp?.shootoutScore !== undefined ? parseInt(awayComp.shootoutScore, 10) : null;
    if (homeShootout !== null && awayShootout !== null && !isNaN(homeShootout) && !isNaN(awayShootout)) {
      normalized.shootout = { home: homeShootout, away: awayShootout };
    }
  }

  // Fallback: extract shootout score from summary.shootout if not present on competitors
  if (!normalized.shootout && summary?.shootout?.length >= 2) {
    const t1 = summary.shootout[0];
    const t2 = summary.shootout[1];
    const s1 = t1.shots?.filter((s) => s.didScore).length || 0;
    const s2 = t2.shots?.filter((s) => s.didScore).length || 0;
    const hId = String(normalized.homeId || '');
    if (String(t1.id) === hId || (t1.team && normalized.homeName && t1.team.toLowerCase().includes(normalized.homeName.toLowerCase()))) {
      normalized.shootout = { home: s1, away: s2 };
    } else {
      normalized.shootout = { home: s2, away: s1 };
    }
  }

  // Lineups Resolution
  const lineupsResult = await getMatchLineups(fixtureId, leagueSlug, summary);
  normalized.lineups = {
    home: lineupsResult.home,
    away: lineupsResult.away,
  };
  normalized.lineupsAvailable = lineupsResult.hasLineups;

  // Key events from summary
  const keyEvents = summary?.keyEvents || [];
  const extractedEvents = [];

  for (const item of keyEvents) {
    if (isShootoutEvent(item)) continue;
    const parsed = normalizeEvent(item, normalized);
    if (parsed) {
      extractedEvents.push(parsed);
    }
  }

  // Check commentary to enrich assists and capture goals, own goals, or other whitelisted events
  if (summary?.commentary?.length > 0) {
    for (const com of summary.commentary) {
      if (isShootoutEvent(com)) continue;
      const isGoal =
        com.play?.type?.text === 'Goal' ||
        com.play?.type?.text === 'Own Goal' ||
        (com.text && (
          com.text.toLowerCase().includes('goal!') ||
          com.text.toLowerCase().includes('own goal') ||
          com.text.toLowerCase().includes('autogol')
        ));
      if (isGoal) {
        const parsed = normalizeEvent(com, normalized);
        if (parsed) {
          const existing = extractedEvents.find(
            (e) => (e.type === 'GOAL' || e.type === 'OWN_GOAL' || e.type === 'PENALTY_SCORED') &&
                   ((e.id && parsed.id && String(e.id) === String(parsed.id)) ||
                    (e.scoreAfterEvent && parsed.scoreAfterEvent && e.scoreAfterEvent.home === parsed.scoreAfterEvent.home && e.scoreAfterEvent.away === parsed.scoreAfterEvent.away) ||
                    (e.minute === parsed.minute || (e.player && parsed.player && e.player.toLowerCase() === parsed.player.toLowerCase())) ||
                    (Math.abs((e.minute || 0) - (parsed.minute || 0)) <= 2 && (!e.player || !parsed.player || e.player.toLowerCase() === parsed.player.toLowerCase())))
          );
          if (existing) {
            if (!existing.assist && parsed.assist) {
              existing.assist = parsed.assist;
            }
            if (!existing.ownGoal && parsed.ownGoal) {
              existing.ownGoal = true;
              existing.type = 'OWN_GOAL';
            }
            if (parsed.type === 'PENALTY_SCORED' && existing.type === 'GOAL') {
              existing.type = 'PENALTY_SCORED';
              existing.outcome = 'SCORED';
              existing.assist = null;
              if (!existing.player && parsed.player) existing.player = parsed.player;
            }
          } else {
            extractedEvents.push(parsed);
          }
        }
      }
    }

    // Scan commentary for other allowed events (e.g. RED_CARD, GOAL_DISALLOWED, PENALTY_SCORED)
    for (const com of summary.commentary) {
      if (isShootoutEvent(com)) continue;
      const parsed = normalizeEvent(com, normalized);
      if (parsed) {
        if (parsed.type === 'GOAL' || parsed.type === 'OWN_GOAL') continue; // Goals & Own goals already handled above

        if (parsed.type === 'PENALTY_SCORED') {
          const existing = extractedEvents.find(
            (e) => (e.type === 'GOAL' || e.type === 'PENALTY_SCORED') &&
                   ((e.id && parsed.id && String(e.id) === String(parsed.id)) ||
                    (e.scoreAfterEvent && parsed.scoreAfterEvent && e.scoreAfterEvent.home === parsed.scoreAfterEvent.home && e.scoreAfterEvent.away === parsed.scoreAfterEvent.away) ||
                    (e.minute === parsed.minute) ||
                    (e.player && parsed.player && e.player.toLowerCase() === parsed.player.toLowerCase()) ||
                    (Math.abs((e.minute || 0) - (parsed.minute || 0)) <= 2 && (!e.player || !parsed.player || e.player.toLowerCase() === parsed.player.toLowerCase())))
          );
          if (existing) {
            existing.type = 'PENALTY_SCORED';
            existing.outcome = 'SCORED';
            existing.assist = null;
            if (!existing.player && parsed.player) existing.player = parsed.player;
            continue;
          }
        }

        const isDuplicate = extractedEvents.some(
          (e) => e.type === parsed.type && e.minute === parsed.minute
        );

        if (!isDuplicate) {
          extractedEvents.push(parsed);
        }
      }
    }
  }

  normalized.events = extractedEvents;
  return normalized;
}

export default {
  SITE_BASE,
  SITE_V3_BASE,
  CORE_BASE,
  CDN_BASE,
  COMPREHENSIVE_LEAGUES,
  fetchTodaysMatches,
  getTodayMatches,
  getMatchSummary,
  getMatchPlays,
  getMatchLineups,
  resolveAthlete,
  normalizeMatch,
  normalizeEvent,
  eventSignature,
  fetchMatchDetails,
  isWomenCompetition,
  formatWomenTeamName,
};
