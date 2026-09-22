// utils/flags.js
import logger from './logger.js';

/**
 * Unicode England subdivision flag:
 * U+1F3F4 U+E0067 U+E0062 U+E0065 U+E006E U+E0067 U+E007F
 * Per prompt requirement: For England specifically, DO NOT use 🇬🇧.
 * Must be England flag (🏴󠁧󠁢󠁥󠁮󠁧󠁿).
 */
export const ENGLAND_FLAG = '🏴󠁧󠁢󠁥󠁮󠁧󠁿';

/**
 * Centralized mapping of normalized country names to flag emojis.
 */
export const COUNTRY_FLAGS = {
  England: ENGLAND_FLAG,
  'United Kingdom': ENGLAND_FLAG,
  Spain: '🇪🇸',
  Germany: '🇩🇪',
  France: '🇫🇷',
  Italy: '🇮🇹',
  Portugal: '🇵🇹',
  Netherlands: '🇳🇱',
  Belgium: '🇧🇪',
  Turkey: '🇹🇷',
  Greece: '🇬🇷',
  Ukraine: '🇺🇦',
  Norway: '🇳🇴',
  Sweden: '🇸🇪',
  Nigeria: '🇳🇬',
  'Saudi Arabia': '🇸🇦',
  'United States': '🇺🇸',
  USA: '🇺🇸',
  Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  Wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  Denmark: '🇩🇰',
  Switzerland: '🇨🇭',
  Austria: '🇦🇹',
  Poland: '🇵🇱',
  Croatia: '🇭🇷',
  Serbia: '🇷🇸',
  Czechia: '🇨🇿',
  Brazil: '🇧🇷',
  Argentina: '🇦🇷',
  Mexico: '🇲🇽',
  Colombia: '🇨🇴',
  Uruguay: '🇺🇾',
  Chile: '🇨🇱',
  Peru: '🇵🇪',
  Ecuador: '🇪🇨',
  Paraguay: '🇵🇾',
  Venezuela: '🇻🇪',
  Japan: '🇯🇵',
  'South Korea': '🇰🇷',
  Australia: '🇦🇺',
  China: '🇨🇳',
  Egypt: '🇪🇬',
  Morocco: '🇲🇦',
  Senegal: '🇸🇳',
  Ghana: '🇬🇭',
  Cameroon: '🇨🇲',
  'South Africa': '🇿🇦',
  Algeria: '🇩🇿',
  Tunisia: '🇹🇳',
  'Ivory Coast': '🇨🇮',
  DR_Congo: '🇨🇩',
  Mali: '🇲🇱',
  Zambia: '🇿🇲',
  Qatar: '🇶🇦',
  Canada: '🇨🇦',
  Ireland: '🇮🇪',
  'Northern Ireland': '🇬🇧',
};

/**
 * Normalization table mapping country variations, abbreviations,
 * and demonyms to the canonical country key.
 */
const COUNTRY_ALIASES = {
  // England / UK
  eng: 'England',
  england: 'England',
  english: 'England',
  gbr: 'England',
  gb: 'England',
  uk: 'England',
  'united kingdom': 'England',
  'great britain': 'England',

  // Spain
  esp: 'Spain',
  spain: 'Spain',
  spanish: 'Spain',
  espana: 'Spain',
  españa: 'Spain',

  // Germany
  ger: 'Germany',
  germany: 'Germany',
  german: 'Germany',
  deu: 'Germany',
  deutschland: 'Germany',

  // France
  fra: 'France',
  france: 'France',
  french: 'France',

  // Italy
  ita: 'Italy',
  italy: 'Italy',
  italian: 'Italy',
  italia: 'Italy',

  // Portugal
  por: 'Portugal',
  portugal: 'Portugal',
  portuguese: 'Portugal',

  // Netherlands
  ned: 'Netherlands',
  netherlands: 'Netherlands',
  dutch: 'Netherlands',
  holland: 'Netherlands',
  nld: 'Netherlands',

  // Belgium
  bel: 'Belgium',
  belgium: 'Belgium',
  belgian: 'Belgium',

  // Turkey
  tur: 'Turkey',
  turkey: 'Turkey',
  turkish: 'Turkey',
  türkiye: 'Turkey',
  turkiye: 'Turkey',

  // Greece
  gre: 'Greece',
  greece: 'Greece',
  greek: 'Greece',
  grc: 'Greece',
  hellas: 'Greece',

  // Ukraine
  ukr: 'Ukraine',
  ukraine: 'Ukraine',
  ukrainian: 'Ukraine',

  // Norway
  nor: 'Norway',
  norway: 'Norway',
  norwegian: 'Norway',

  // Sweden
  swe: 'Sweden',
  sweden: 'Sweden',
  swedish: 'Sweden',

  // Nigeria
  nga: 'Nigeria',
  nigeria: 'Nigeria',
  nigerian: 'Nigeria',
  ngr: 'Nigeria',

  // Saudi Arabia
  sau: 'Saudi Arabia',
  saudi: 'Saudi Arabia',
  'saudi arabia': 'Saudi Arabia',
  'saudi arabian': 'Saudi Arabia',
  ksa: 'Saudi Arabia',

  // USA
  usa: 'United States',
  'united states': 'United States',
  'united states of america': 'United States',
  us: 'United States',
  american: 'United States',

  // Scotland & Wales
  sco: 'Scotland',
  scotland: 'Scotland',
  scottish: 'Scotland',
  wal: 'Wales',
  wales: 'Wales',
  welsh: 'Wales',

  // Others
  den: 'Denmark',
  denmark: 'Denmark',
  danish: 'Denmark',
  sui: 'Switzerland',
  switzerland: 'Switzerland',
  swiss: 'Switzerland',
  aut: 'Austria',
  austria: 'Austria',
  austrian: 'Austria',
  pol: 'Poland',
  poland: 'Poland',
  cro: 'Croatia',
  croatia: 'Croatia',
  srb: 'Serbia',
  serbia: 'Serbia',
  cze: 'Czechia',
  czechia: 'Czechia',
  'czech republic': 'Czechia',
  bra: 'Brazil',
  brazil: 'Brazil',
  brazilian: 'Brazil',
  brasil: 'Brazil',
  arg: 'Argentina',
  argentina: 'Argentina',
  argentine: 'Argentina',
  mex: 'Mexico',
  mexico: 'Mexico',
  mexican: 'Mexico',
  jpn: 'Japan',
  japan: 'Japan',
  japanese: 'Japan',
  kor: 'South Korea',
  korea: 'South Korea',
  'south korea': 'South Korea',
  korean: 'South Korea',
  aus: 'Australia',
  australia: 'Australia',
  australian: 'Australia',
  chn: 'China',
  china: 'China',
  egy: 'Egypt',
  egypt: 'Egypt',
  egyptian: 'Egypt',
  mar: 'Morocco',
  morocco: 'Morocco',
  moroccan: 'Morocco',
  sen: 'Senegal',
  senegal: 'Senegal',
  gha: 'Ghana',
  ghana: 'Ghana',
  ghanaian: 'Ghana',
  cmr: 'Cameroon',
  cameroon: 'Cameroon',
  rsa: 'South Africa',
  'south africa': 'South Africa',
  alg: 'Algeria',
  algeria: 'Algeria',
  tun: 'Tunisia',
  tunisia: 'Tunisia',
  civ: 'Ivory Coast',
  'ivory coast': 'Ivory Coast',
  "cote d'ivoire": 'Ivory Coast',
  "côte d'ivoire": 'Ivory Coast',
  qat: 'Qatar',
  qatar: 'Qatar',
  can: 'Canada',
  canada: 'Canada',
};

/**
 * Normalizes a country name or alias to canonical form.
 * @param {string} countryInput
 * @returns {string|null}
 */
export function normalizeCountryName(countryInput) {
  if (!countryInput || typeof countryInput !== 'string') return null;
  const cleaned = countryInput
    .trim()
    .toLowerCase()
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ');
  return COUNTRY_ALIASES[cleaned] || COUNTRY_ALIASES[cleaned.replace(/[^a-z0-9 ]/g, '')] || null;
}

/**
 * Looks up country flag for a country name or abbreviation.
 * @param {string} country
 * @returns {string|null}
 */
export function getCountryFlag(country) {
  if (!country) return null;
  const canonical = normalizeCountryName(country);
  if (canonical && COUNTRY_FLAGS[canonical]) {
    return COUNTRY_FLAGS[canonical];
  }
  return null;
}

/**
 * Removes any leading emoji flag or placeholder from a string to prevent flag duplication.
 * @param {string} text
 * @returns {string}
 */
export function stripLeadingFlag(text) {
  if (!text || typeof text !== 'string') return '';
  // Strip common emoji flags, regional indicator symbols, and sport fallback
  return text
    .replace(/^(\u{1F3F4}[\u{E0060}-\u{E007F}]+|[\u{1F1E6}-\u{1F1FF}]{2}|[\u{1F300}-\u{1F5FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}])\s*/u, '')
    .trim();
}

/**
 * Implements the competition flag priority system:
 *
 * Priority 1 — Continental Competition:
 * If genuine European continental competition (UCL, UEL, UECL, Super Cup) -> 🇪🇺
 *
 * Priority 2 — Senior International Competitions:
 * - UEFA European Championship, UEFA Nations League, UEFA Euro Qualifiers -> 🇪🇺
 * - FIFA World Cup, World Cup Qualifiers, Confederations Cup, Club World Cup -> 🌍
 * - Africa Cup of Nations (AFCON), AFCON Qualifiers, CHAN -> 🌍
 * - Copa América, Copa América Qualifiers -> 🌎
 * - CONCACAF Gold Cup, CONCACAF Nations League, Gold Cup Qualifiers -> 🌎
 * - AFC Asian Cup, AFC Asian Cup Qualifiers -> 🌏
 * - OFC Nations Cup, OFC Qualifiers -> 🌏
 *
 * Priority 3 — Domestic Competitions:
 * National country flag associated with the domestic league/cup (Premier League -> 🏴󠁧󠁢󠁥󠁮󠁧󠁿, LaLiga -> 🇪🇸, NPFL -> 🇳🇬, etc.)
 *
 * Priority 4 — Fallback:
 * Safe default: ⚽ (never throw an exception, logs debug in development).
 *
 * @param {string|object} competition slug, competition name, or match object
 * @returns {string} flag emoji
 */
export function getCompetitionFlag(competition) {
  let slug = '';
  let name = '';
  let countryHint = '';

  if (typeof competition === 'string') {
    if (competition.includes('.') || competition.length <= 15) {
      slug = competition.toLowerCase();
    } else {
      name = competition;
    }
  } else if (competition && typeof competition === 'object') {
    slug = (competition.leagueSlug || competition.slug || '').toLowerCase();
    name = competition.leagueName || competition.name || competition.displayName || '';
    countryHint =
      competition.country ||
      competition.venue?.address?.country ||
      competition.competitions?.[0]?.venue?.address?.country ||
      '';
  }

  const s = slug.toLowerCase();
  const n = name.toLowerCase();

  // ==========================================
  // PRIORITY 1: EUROPEAN CONTINENTAL CLUB COMPETITIONS
  // ==========================================
  if (
    s === 'uefa.champions' ||
    s === 'uefa.europa' ||
    s === 'uefa.europa.conf' ||
    s === 'uefa.conference' ||
    s === 'uefa.super_cup' ||
    s === 'uefa.wchampions' ||
    s.startsWith('uefa.wchampions') ||
    n.includes('uefa champions league') ||
    n.includes('uefa europa league') ||
    n.includes('uefa conference league') ||
    n.includes('uefa europa conference league') ||
    n.includes('uefa super cup') ||
    n.includes('uefa women') ||
    (n.includes('champions league') && !n.includes('afc') && !n.includes('caf') && !n.includes('concacaf')) ||
    (n.includes('europa league') && !n.includes('afc') && !n.includes('caf'))
  ) {
    return '🇪🇺';
  }

  // ==========================================
  // PRIORITY 2: SENIOR INTERNATIONAL COMPETITIONS
  // ==========================================

  // 2A: UEFA Senior International Competitions (European Championship / Nations League)
  if (
    s === 'uefa.euro' ||
    s === 'uefa.nations' ||
    s === 'uefa.euroq' ||
    s.startsWith('uefa.euro') ||
    s.startsWith('uefa.nations') ||
    s.startsWith('uefa.w.nations') ||
    s.startsWith('uefa.weuro') ||
    n.includes('uefa european championship') ||
    n.includes('uefa nations league') ||
    n.includes('european championship qualifying') ||
    n.includes('euro qualifying') ||
    n.includes('weuro')
  ) {
    return '🇪🇺';
  }

  // 2B: Global Senior International (FIFA World Cup, Qualifiers, Confederations Cup, Club World Cup)
  if (
    s === 'fifa.world' ||
    s === 'fifa.worldq' ||
    s.startsWith('fifa.worldq') ||
    s === 'fifa.confederations' ||
    s === 'fifa.cwc' ||
    s === 'fifa.wwc' ||
    s.startsWith('fifa.') ||
    n.includes('fifa world cup') ||
    n.includes('world cup qualifying') ||
    n.includes('fifa confederations') ||
    n.includes('fifa club world cup') ||
    n.includes('fifa intercontinental') ||
    n.includes('club world cup')
  ) {
    return '🌍';
  }

  // 2C: CAF Senior International & Continental (AFCON, AFCON Qualifiers, CHAN)
  if (
    s.startsWith('caf.') ||
    n.includes('africa cup of nations') ||
    n.includes('afcon') ||
    n.includes('african nations championship') ||
    n.includes('caf champions') ||
    n.includes('caf confed')
  ) {
    return '🌍';
  }

  // 2D: CONMEBOL Senior International & Continental (Copa América, Qualifiers, Libertadores)
  if (
    s.startsWith('conmebol.') ||
    n.includes('copa américa') ||
    n.includes('copa america') ||
    n.includes('copa libertadores') ||
    n.includes('copa sudamericana') ||
    n.includes('libertadores') ||
    n.includes('sudamericana') ||
    n.includes('recopa sudamericana')
  ) {
    return '🌎';
  }

  // 2E: CONCACAF Senior International & Continental (Gold Cup, Nations League, Qualifiers, Leagues Cup)
  if (
    s.startsWith('concacaf.') ||
    n.includes('gold cup') ||
    n.includes('concacaf nations league') ||
    n.includes('concacaf champions') ||
    n.includes('leagues cup') ||
    n.includes('campeones cup')
  ) {
    return '🌎';
  }

  // 2F: AFC Senior International & Continental (Asian Cup, Asian Qualifiers, AFC Champions)
  if (
    s.startsWith('afc.') ||
    n.includes('afc asian cup') ||
    n.includes('asian cup') ||
    n.includes('afc champions') ||
    n.includes('afc cup')
  ) {
    return '🌏';
  }

  // 2G: OFC Senior International & Qualifiers
  if (s.startsWith('ofc.') || s === 'fifa.worldq.ofc' || n.includes('ofc')) {
    return '🌏';
  }

  // ==========================================
  // PRIORITY 3: DOMESTIC LEAGUES & CUPS
  // ==========================================

  // 3A: England (Premier League, FA Cup, Carabao Cup, EFL Trophy, Championship)
  // Per prompt rule: England MUST be 🏴󠁧󠁢󠁥󠁮󠁧󠁿, NOT 🇬🇧
  if (
    s.startsWith('eng.') ||
    n.includes('premier league') ||
    n.includes('fa cup') ||
    n.includes('carabao') ||
    n.includes('efl') ||
    n.includes('english') ||
    n.includes('community shield') ||
    n.includes('fa trophy')
  ) {
    return ENGLAND_FLAG;
  }

  // 3B: Nigeria (NPFL / Nigerian Professional League)
  if (
    s.startsWith('nga.') ||
    s === 'nigeria.1' ||
    n.includes('nigerian') ||
    n.includes('nigeria') ||
    n.includes('npfl')
  ) {
    return '🇳🇬';
  }

  // 3C: Spain (LaLiga, Copa del Rey, Supercopa, Liga F)
  if (
    s.startsWith('esp.') ||
    n.includes('laliga') ||
    n.includes('copa del rey') ||
    n.includes('spanish') ||
    n.includes('copa de la reina') ||
    n.includes('liga f')
  ) {
    return '🇪🇸';
  }

  // 3D: Germany (Bundesliga, DFB-Pokal)
  if (s.startsWith('ger.') || n.includes('bundesliga') || n.includes('dfb-pokal') || n.includes('german')) {
    return '🇩🇪';
  }

  // 3E: Italy (Serie A, Coppa Italia, Serie B)
  if (
    s.startsWith('ita.') ||
    n.includes('serie a') ||
    (n.includes('serie b') && !n.includes('brazil') && !s.startsWith('bra.')) ||
    n.includes('coppa italia') ||
    n.includes('italian')
  ) {
    return '🇮🇹';
  }

  // 3F: France (Ligue 1, Ligue 2, Coupe de France)
  if (
    s.startsWith('fra.') ||
    n.includes('ligue 1') ||
    n.includes('ligue 2') ||
    n.includes('coupe de france') ||
    n.includes('french')
  ) {
    return '🇫🇷';
  }

  // 3G: Portugal (Primeira Liga, Taça de Portugal)
  if (
    s.startsWith('por.') ||
    n.includes('primeira liga') ||
    n.includes('taca de portugal') ||
    n.includes('taça de portugal') ||
    n.includes('portuguese')
  ) {
    return '🇵🇹';
  }

  // 3H: Netherlands (Eredivisie, KNVB Beker)
  if (s.startsWith('ned.') || n.includes('eredivisie') || n.includes('dutch') || n.includes('knvb')) {
    return '🇳🇱';
  }

  // 3I: Saudi Arabia (Saudi Pro League, King Cup) - MUST BE CHECKED BEFORE BELGIAN PRO LEAGUE
  if (
    s.startsWith('sau.') ||
    s.startsWith('ksa.') ||
    n.includes('saudi pro league') ||
    n.includes('saudi')
  ) {
    return '🇸🇦';
  }

  // 3J: Belgium (Belgian Pro League, Jupiler Pro League)
  if (s.startsWith('bel.') || n.includes('belgian') || n.includes('jupiler')) {
    return '🇧🇪';
  }

  // 3K: Turkey (Turkish Super Lig)
  if (s.startsWith('tur.') || n.includes('super lig') || n.includes('süper lig') || n.includes('turkish')) {
    return '🇹🇷';
  }

  // 3L: Greece (Greek Super League)
  if (s.startsWith('gre.') || n.includes('super league greece') || n.includes('greek super league') || n.includes('greek')) {
    return '🇬🇷';
  }

  // 3M: Ukraine (Ukrainian Premier League)
  if (s.startsWith('ukr.') || n.includes('ukrainian') || n.includes('ukraine')) {
    return '🇺🇦';
  }

  // 3N: Norway (Norwegian Eliteserien)
  if (s.startsWith('nor.') || n.includes('eliteserien') || n.includes('norwegian')) {
    return '🇳🇴';
  }

  // 3O: Sweden (Swedish Allsvenskan)
  if (s.startsWith('swe.') || n.includes('allsvenskan') || n.includes('swedish')) {
    return '🇸🇪';
  }

  // 3P: United States (Major League Soccer, USL, NWSL)
  if (
    s.startsWith('usa.') ||
    s === 'mls' ||
    n.includes('major league soccer') ||
    n.includes('mls') ||
    n.includes('usl') ||
    n.includes('nwsl') ||
    n.includes('u.s. open cup') ||
    n.includes('us open cup')
  ) {
    return '🇺🇸';
  }

  // 3Q: Scotland (Scottish Premiership, SPFL, Scottish Cup)
  if (s.startsWith('sco.') || n.includes('scottish') || n.includes('spfl')) {
    return '🏴󠁧󠁢󠁳󠁣󠁴󠁿';
  }

  // 3R: Wales (Cymru Premier, Welsh Cup)
  if (s.startsWith('wal.') || n.includes('welsh') || n.includes('cymru')) {
    return '🏴󠁧󠁢󠁷󠁬󠁳󠁿';
  }

  // 3S: Brazil (Brasileirão, Copa do Brasil, Brazil Serie B, State Championships)
  if (
    s.startsWith('bra.') ||
    n.includes('brazil') ||
    n.includes('brasil') ||
    n.includes('brasileir') ||
    n.includes('copa do brasil') ||
    (n.includes('serie b') && n.includes('brazil')) ||
    s === 'bra.2'
  ) {
    return '🇧🇷';
  }

  // 3T: Argentina (Liga Profesional, Copa Argentina, Primera Nacional)
  if (
    s.startsWith('arg.') ||
    n.includes('argentin') ||
    n.includes('primera nacional') ||
    n.includes('copa de la liga profesional')
  ) {
    return '🇦🇷';
  }

  // 3U: Mexico (Liga MX, Copa MX, Liga de Expansión)
  if (s.startsWith('mex.') || n.includes('liga mx') || n.includes('mexic')) {
    return '🇲🇽';
  }

  // 3R: Check country hint from venue/competition metadata if available
  if (countryHint) {
    const flagFromCountry = getCountryFlag(countryHint);
    if (flagFromCountry) {
      return flagFromCountry;
    }
  }

  // Check if slug starts with 3-letter country code
  const prefixMatch = s.match(/^([a-z]{3})\./);
  if (prefixMatch) {
    const flagFromPrefix = getCountryFlag(prefixMatch[1]);
    if (flagFromPrefix) {
      return flagFromPrefix;
    }
  }

  // ==========================================
  // PRIORITY 4: SAFE FALLBACK
  // ==========================================
  logger.debug(`[FlagEngine] Unmapped competition: slug="${slug}", name="${name}" -> using fallback ⚽`);
  return '⚽';
}

/**
 * Convenience getter for a match object.
 * @param {object} match
 * @returns {string} flag emoji
 */
export function getMatchFlag(match) {
  if (!match) return '⚽';
  if (match.flag) return match.flag;
  if (match.countryFlag) return match.countryFlag;
  return getCompetitionFlag(match);
}

/**
 * Formats a fixture line with its country flag:
 * Example: "12:00 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Arsenal vs Chelsea"
 * @param {string} kickoff time string or "TBD"
 * @param {string} home home team display string
 * @param {string} away away team display string
 * @param {object} match match metadata
 * @returns {string}
 */
export function formatFixtureLine(kickoff, home, away, match) {
  const flag = getMatchFlag(match);
  const cleanHome = stripLeadingFlag(home);
  const cleanAway = stripLeadingFlag(away);
  const time = kickoff || 'TBD';
  return `${time} ${flag} ${cleanHome} vs ${cleanAway}`;
}

/**
 * Formats a result line with its country flag:
 * Example: "FT 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Arsenal 3 : 1 Manchester United"
 * @param {string} home home team display string
 * @param {string} away away team display string
 * @param {number|string} homeScore
 * @param {number|string} awayScore
 * @param {object} match match metadata
 * @returns {string}
 */
export function formatResultLine(home, away, homeScore, awayScore, match) {
  const flag = getMatchFlag(match);
  const cleanHome = stripLeadingFlag(home);
  const cleanAway = stripLeadingFlag(away);
  const hScore = homeScore ?? 0;
  const aScore = awayScore ?? 0;
  return `FT ${flag} ${cleanHome} ${hScore} : ${aScore} ${cleanAway}`;
}
