// utils/hashtags.js

const STANDARD_HASHTAGS = ['#Livescore', '#FootballNews', '#Matchday', '#LiveScore', '#Football'];

const LEAGUE_HASHTAG_MAP = {
  'uefa champions league': ['#UCL'],
  'uefa europa league': ['#UEL'],
  'uefa europa conference league': ['#UECL'],
  'uefa conference league': ['#UECL'],
  'english premier league': ['#PremierLeague', '#EPL'],
  'premier league': ['#PremierLeague', '#EPL'],
  'laliga': ['#LaLiga'],
  'spanish laliga': ['#LaLiga'],
  'serie a': ['#SerieA'],
  'italian serie a': ['#SerieA'],
  'bundesliga': ['#Bundesliga'],
  'german bundesliga': ['#Bundesliga'],
  'french ligue 1': ['#Ligue1'],
  'ligue 1': ['#Ligue1'],
  'major league soccer': ['#MLS'],
  'major league soccer (mls)': ['#MLS'],
  'mls': ['#MLS'],
  'fa cup': ['#FACup'],
  'carabao cup': ['#CarabaoCup'],
  'copa del rey': ['#CopaDelRey'],
  'copa libertadores': ['#Libertadores'],
  'fifa world cup': ['#WorldCup'],
  'afc champions league elite east': ['#ACLElite'],
  'afc champions league elite west': ['#ACLElite'],
  'saudi pro league': ['#SaudiProLeague', '#RoshnSaudiLeague'],
  'roshn saudi league': ['#RoshnSaudiLeague'],
};

/**
 * Cleans a team or entity name into a PascalCase hashtag string.
 * Strips punctuation, collapses whitespace.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeToHashtag(str) {
  if (!str) return '';
  // Remove special characters, accents/punctuation except spaces
  const cleaned = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();

  if (!cleaned) return '';

  // Convert words to PascalCase
  const words = cleaned.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return `#${words.join('')}`;
}

/**
 * Builds standard and match-specific hashtags strictly capped at 4 to 5 hashtags.
 * @param {string} homeName
 * @param {string} awayName
 * @param {string} leagueName
 * @returns {string}
 */
export function buildMatchHashtags(homeName, awayName, leagueName) {
  const customTags = [];

  // Match specific: League
  if (leagueName) {
    const key = leagueName.trim().toLowerCase();
    const mapped = LEAGUE_HASHTAG_MAP[key];
    if (mapped && mapped.length > 0) {
      customTags.push(mapped[0]);
    } else {
      const customTag = sanitizeToHashtag(leagueName);
      if (customTag && !customTags.includes(customTag)) customTags.push(customTag);
    }
  }

  // Match specific: Home and Away teams
  const homeTag = sanitizeToHashtag(homeName);
  if (homeTag && !customTags.includes(homeTag)) customTags.push(homeTag);

  const awayTag = sanitizeToHashtag(awayName);
  if (awayTag && !customTags.includes(awayTag)) customTags.push(awayTag);

  // Combine custom tags + standard fallback pool
  const result = [];
  for (const t of customTags) {
    if (!result.includes(t)) result.push(t);
    if (result.length >= 5) break;
  }

  for (const t of STANDARD_HASHTAGS) {
    if (result.length >= 5) break;
    if (!result.includes(t)) result.push(t);
  }

  // Strictly enforce 4 to 5 hashtags
  const finalTags = result.slice(0, 5);
  return finalTags.join(' ');
}

export default buildMatchHashtags;
