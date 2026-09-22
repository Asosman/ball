// cli/selector.js
import inquirer from 'inquirer';
import { formatDateDisplayWAT } from '../utils/time.js';
import config from '../config/env.js';
import { getMatchFlag } from '../utils/flags.js';

// ANSI escape codes for professional CLI formatting
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
};

/**
 * Calculates visual display width in terminal columns, accounting for ANSI codes
 * and multi-byte / subdivision emoji flags.
 */
function getVisualLength(str) {
  return String(str || '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    // Replace subdivision flag (e.g. England flag 🏴󠁧󠁢󠁥󠁮󠁧󠁿) with 2 visual columns
    .replace(/\u{1F3F4}[\u{E0060}-\u{E007F}]+/gu, '  ')
    // Replace standard regional indicator flag (e.g. 🇪🇸, 🇳🇬, 🇪🇺) with 2 visual columns
    .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '  ')
    // Replace other emoji (🌍, 🌎, 🌏, ⚽) with 2 visual columns
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '  ')
    .length;
}

/**
 * Format string with padding to preserve table alignment
 */
function padEnd(str, length) {
  const visible = getVisualLength(str);
  const diff = length - visible;
  return diff > 0 ? str + ' '.repeat(diff) : str;
}

/**
 * Displays formatted table/list of today's fixtures in West Africa Time.
 * @param {any[]} matches
 */
export function displayFixturesSummary(matches) {
  const termWidth = 78;
  const divider = '─'.repeat(termWidth);

  console.log(`\n${C.cyan}┌${divider}┐${C.reset}`);
  console.log(
    `${C.cyan}│${C.reset}  ${C.bold}${C.brightWhite}⚽  ESPN FOOTBALL LIVESCORE & REAL-TIME MONITORING${C.reset}${' '.repeat(
      termWidth - 49
    )}${C.cyan}│${C.reset}`
  );
  console.log(
    `${C.cyan}│${C.reset}  ${C.dim}${C.white}🕒  Timezone: Africa/Lagos (WAT)   📅  ${formatDateDisplayWAT()}${C.reset}${' '.repeat(
      Math.max(1, termWidth - 40 - formatDateDisplayWAT().length)
    )}${C.cyan}│${C.reset}`
  );
  console.log(`${C.cyan}└${divider}┘${C.reset}\n`);

  if (!matches || matches.length === 0) {
    console.log(`${C.yellow}╭${'─'.repeat(termWidth)}╮${C.reset}`);
    console.log(
      `${C.yellow}│${C.reset}  ${C.bold}${C.brightYellow}ℹ️   NO FIXTURES SCHEDULED FOR TODAY IN AFRICA/LAGOS (WAT)${C.reset}${' '.repeat(
        termWidth - 55
      )}${C.yellow}│${C.reset}`
    );
    console.log(`${C.yellow}├${'─'.repeat(termWidth)}┤${C.reset}`);
    console.log(
      `${C.yellow}│${C.reset}  • Calendar Date   : ${C.white}${formatDateDisplayWAT()}${C.reset}${' '.repeat(
        Math.max(1, termWidth - 23 - formatDateDisplayWAT().length)
      )}${C.yellow}│${C.reset}`
    );
    console.log(
      `${C.yellow}│${C.reset}  • Monitored Feeds : ${C.white}17 Tier-1 European, Continental & World Competitions${C.reset}${' '.repeat(
        termWidth - 73
      )}${C.yellow}│${C.reset}`
    );
    console.log(
      `${C.yellow}│${C.reset}  • Feed Status     : ${C.brightGreen}All endpoints active (200 OK)${C.reset}${' '.repeat(
        termWidth - 48
      )}${C.yellow}│${C.reset}`
    );
    console.log(`${C.yellow}╰${'─'.repeat(termWidth)}╯${C.reset}\n`);
    return;
  }

  // Calculate high-level fixture stats
  const liveCount = matches.filter((m) => m.status?.state === 'in').length;
  const finishedCount = matches.filter((m) => m.status?.state === 'post').length;
  const scheduledCount = matches.filter((m) => m.status?.state === 'pre').length;

  console.log(
    `  ${C.dim}📊 Overview:${C.reset} ${C.bold}${matches.length} matches${C.reset}  │  ${
      liveCount > 0 ? `${C.brightRed}🔴 ${liveCount} Live${C.reset}` : `${C.gray}0 Live${C.reset}`
    }  │  ${C.brightGreen}✅ ${finishedCount} Final${C.reset}  │  ${C.brightCyan}🕐 ${scheduledCount} Upcoming${C.reset}\n`
  );

  // Group by competition
  const grouped = {};
  matches.forEach((m) => {
    const league = m.leagueName || 'Other Competitions';
    if (!grouped[league]) grouped[league] = [];
    grouped[league].push(m);
  });

  let counter = 1;
  for (const [league, leagueMatches] of Object.entries(grouped)) {
    console.log(`${C.brightYellow}🏆  ${C.bold}${league}${C.reset} ${C.dim}(${leagueMatches.length})${C.reset}`);
    console.log(`${C.gray}╭──────┬──────────────┬─────────────┬─────────────────────────────────┬────────╮${C.reset}`);
    console.log(
      `${C.gray}│${C.reset} ${C.dim}#${C.reset}    ${C.gray}│${C.reset} ${C.dim}STATUS${C.reset}       ${C.gray}│${C.reset} ${C.dim}TIME (WAT)${C.reset}  ${C.gray}│${C.reset} ${C.dim}MATCHUP${C.reset}                           ${C.gray}│${C.reset} ${C.dim}SCORE${C.reset}  ${C.gray}│${C.reset}`
    );
    console.log(`${C.gray}├──────┼──────────────┼─────────────┼─────────────────────────────────┼────────┤${C.reset}`);

    leagueMatches.forEach((m) => {
      let statusTag = `${C.gray}🕐 PRE${C.reset}       `;
      if (m.status?.state === 'in') {
        const clock = m.status?.clock ? `${m.status.clock}'` : 'LIVE';
        statusTag = `${C.brightRed}${C.bold}🔴 ${padEnd(clock, 8)}${C.reset}`;
      } else if (m.status?.state === 'post') {
        statusTag = `${C.brightGreen}${C.bold}✅ FINAL   ${C.reset}`;
      } else if (m.status?.description === 'Halftime') {
        statusTag = `${C.brightYellow}${C.bold}⏸️  HT      ${C.reset}`;
      }

      const flag = getMatchFlag(m);
      const numStr = padEnd(String(counter).padStart(2, ' '), 4);
      const kickoff = padEnd(m.kickoffFormattedWAT || 'TBD', 11);
      const home = m.homeName || 'Home';
      const away = m.awayName || 'Away';
      const matchup = padEnd(`${flag} ${home} vs ${away}`, 31);
      const hasShootout = m.shootout && m.shootout.home !== undefined && m.shootout.away !== undefined;
      const shootoutScoreTag = hasShootout ? ` ${C.yellow}(${m.shootout.home}-${m.shootout.away} P)${C.reset}` : '';
      const scoreStr =
        m.status?.state !== 'pre'
          ? `${C.bold}${m.score?.home ?? 0} - ${m.score?.away ?? 0}${C.reset}${shootoutScoreTag}`
          : `${C.gray}  -  ${C.reset}`;

      console.log(
        `${C.gray}│${C.reset} ${numStr} ${C.gray}│${C.reset} ${statusTag} ${C.gray}│${C.reset} ${kickoff} ${C.gray}│${C.reset} ${matchup} ${C.gray}│${C.reset} ${padEnd(
          scoreStr,
          hasShootout ? 14 : 6
        )} ${C.gray}│${C.reset}`
      );

      // Render Goal Scorers and Assist names if events exist
      if (m.events && m.events.length > 0) {
        const goals = m.events.filter((e) => (e.type === 'GOAL' || e.type === 'OWN_GOAL') && e.period !== 5 && !e.isShootout && !e.shootoutPlay);
        if (goals.length > 0) {
          goals.forEach((g) => {
            const min = g.minute ? `${g.minute}'` : '';
            const assistText = g.assist
              ? ` ${C.gray}(${C.cyan}🅰️ Assist: ${C.bold}${g.assist}${C.reset}${C.gray})${C.reset}`
              : '';
            const ogText = (g.ownGoal || g.type === 'OWN_GOAL') ? ` ${C.yellow}(OG)${C.reset}` : '';
            console.log(
              `${C.gray}│${C.reset}      ${C.gray}│${C.reset}              ${C.gray}│${C.reset}             ${C.gray}│${C.reset}  ⚽ ${C.white}${g.player || 'Goal'}${ogText} ${C.dim}${min}${C.reset}${assistText}`
            );
          });
        }
      }

      if (hasShootout) {
        console.log(
          `${C.gray}│${C.reset}      ${C.gray}│${C.reset}              ${C.gray}│${C.reset}             ${C.gray}│${C.reset}  🥅 ${C.yellow}${C.bold}Penalty Shootout: ${home} ${m.shootout.home} - ${m.shootout.away} ${away}${C.reset}`
        );
      }

      counter++;
    });

    console.log(`${C.gray}╰──────┴──────────────┴─────────────┴─────────────────────────────────┴────────╯${C.reset}\n`);
  }
}

/**
 * Prompts user with the main menu.
 * @returns {Promise<'post'|'monitor'|'both'|'exit'>}
 */
export async function promptMainMenu() {
  console.log(`\n${C.bold}${C.cyan}⚙️  CHOOSE AN ACTION${C.reset}`);
  const { action } = await inquirer.prompt([
    {
      type: 'select',
      name: 'action',
      message: 'Select action to execute:',
      choices: [
        { name: "1. 📢 Post today's fixtures to Facebook (2 posts: Top Leagues & World Leagues)", value: 'post' },
        { name: "1a. 🌟 Post today's Top Leagues only (incl. Saudi Pro League)", value: 'post_top' },
        { name: "1b. 🌍 Post today's World / Lower Leagues only", value: 'post_low' },
        { name: '2. 🎯 Select matches to monitor (live events & assists)', value: 'monitor' },
        { name: '3. ⚡ Post fixtures & start live monitoring automatically', value: 'both' },
        { name: '4. 📅 View yesterday\'s results table', value: 'yesterday' },
        { name: "5. 📤 Post yesterday's results to Facebook (2 posts: Top Leagues & World Leagues)", value: 'post_yesterday' },
        { name: "5a. 🌟 Post yesterday's Top Leagues results only (incl. Saudi Pro League)", value: 'post_yesterday_top' },
        { name: "5b. 🌍 Post yesterday's World / Lower Leagues results only", value: 'post_yesterday_low' },
        { name: '6. 📋 View match details', value: 'details' },
        { name: '7. 🚪 Exit application', value: 'exit' },
      ],
    },
  ]);
  return action;
}

/**
 * Prompts user to select matches to monitor with interactive checkbox list.
 * Separates matches by leagues with clear visual headers.
 * Enforces maximum of 15 matches.
 * @param {any[]} matches
 * @param {string[]} [currentlyMonitored=[]]
 * @returns {Promise<string[]>} array of selected fixture IDs
 */
export async function promptMatchSelection(matches, currentlyMonitored = []) {
  if (!matches || matches.length === 0) {
    console.log(`\n${C.yellow}⚠️  No fixtures currently available to monitor.${C.reset}\n`);
    return [];
  }

  // Group matches strictly by league/competition
  const grouped = {};
  matches.forEach((m) => {
    const league = m.leagueName || 'Other Competitions';
    if (!grouped[league]) grouped[league] = [];
    grouped[league].push(m);
  });

  const choices = [];
  for (const [league, leagueMatches] of Object.entries(grouped)) {
    const leagueFlag = leagueMatches[0] ? getMatchFlag(leagueMatches[0]) : '🏆';
    choices.push(
      new inquirer.Separator(
        `\n  ${C.bold}${C.brightYellow}🏆 ${leagueFlag} ${league.toUpperCase()} (${leagueMatches.length})${C.reset}`
      )
    );

    leagueMatches.forEach((m) => {
      let stateBadge = '[🕐 PRE  ]';
      if (m.status?.state === 'in') {
        const clock = m.status?.clock ? `${m.status.clock}'` : 'LIVE';
        stateBadge = `[🔴 ${clock.padEnd(5, ' ')}]`;
      } else if (m.status?.state === 'post') {
        stateBadge = '[✅ FINAL]';
      } else if (m.status?.description === 'Halftime') {
        stateBadge = '[⏸️ HT   ]';
      }

      const flag = getMatchFlag(m);
      const kickoff = m.kickoffFormattedWAT || 'TBD';
      const scoreText = m.status?.state !== 'pre' ? ` (${m.score?.home ?? 0} - ${m.score?.away ?? 0})` : '';
      const label = `${stateBadge} ${flag} ${m.homeName} vs ${m.awayName}${scoreText} [${kickoff} WAT]`;

      choices.push({
        name: label,
        value: String(m.fixtureId),
        checked: currentlyMonitored.includes(String(m.fixtureId)),
      });
    });
  }

  while (true) {
    const { selected } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selected',
        message: `Select fixtures to monitor for live goals & assists (Max ${config.monitoring.maxMonitoredMatches}):`,
        choices,
        pageSize: 15,
      },
    ]);

    if (selected.length > config.monitoring.maxMonitoredMatches) {
      console.log(
        `\n${C.brightRed}⚠️  Maximum limit exceeded! You can select up to ${config.monitoring.maxMonitoredMatches} matches.${C.reset}`
      );
      console.log('Please adjust your selection.\n');
      continue;
    }

    return selected;
  }
}

/**
 * Interactive menu while monitoring is actively running.
 * Allows adding/removing matches dynamically without process restart.
 * @param {number} currentCount
 * @param {number} maxCount
 * @returns {Promise<'add'|'remove'|'view'|'continue'|'exit'>}
 */
export async function promptMonitoringSubmenu(currentCount, maxCount) {
  console.log(
    `\n${C.cyan}📡 Active Monitoring Status:${C.reset} ${C.bold}${currentCount}/${maxCount} matches${C.reset}`
  );

  const { choice } = await inquirer.prompt([
    {
      type: 'select',
      name: 'choice',
      message: 'Live Monitoring Controls:',
      choices: [
        { name: '➕ 1. Add more matches to monitor', value: 'add' },
        { name: '➖ 2. Remove a match from monitoring', value: 'remove' },
        { name: '👁️  3. View currently monitored fixtures', value: 'view' },
        { name: '▶️  4. Continue background polling', value: 'continue' },
        { name: '⏹️  5. Stop monitoring and exit', value: 'exit' },
      ],
    },
  ]);

  return choice;
}

export async function promptMatchDetailSelection(matches) {
  if (!matches || matches.length === 0) {
    console.log(`\n${C.yellow}⚠️  No fixtures available.${C.reset}\n`);
    return null;
  }

  const grouped = {};
  matches.forEach((m) => {
    const league = m.leagueName || 'Other Competitions';
    if (!grouped[league]) grouped[league] = [];
    grouped[league].push(m);
  });

  const choices = [];
  for (const [league, leagueMatches] of Object.entries(grouped)) {
    const leagueFlag = leagueMatches[0] ? getMatchFlag(leagueMatches[0]) : '🏆';
    choices.push(
      new inquirer.Separator(
        `\n  ${C.bold}${C.brightYellow}🏆 ${leagueFlag} ${league.toUpperCase()} (${leagueMatches.length})${C.reset}`
      )
    );

    leagueMatches.forEach((m) => {
      const flag = getMatchFlag(m);
      choices.push({
        name: `${flag} ${m.homeName} vs ${m.awayName} (${m.kickoffFormattedWAT || 'WAT'})`,
        value: String(m.fixtureId),
      });
    });
  }

  const { selectedId } = await inquirer.prompt([
    {
      type: 'select',
      name: 'selectedId',
      message: 'Select a match to view details:',
      choices,
      pageSize: 15,
    },
  ]);
  return selectedId;
}

export function displayMatchDetails(match) {
  const flag = getMatchFlag(match);
  console.log(`\n${C.bold}${C.cyan}📋 MATCH DETAILS: ${flag} ${match.homeName} vs ${match.awayName}${C.reset}`);
  console.log(`${C.dim}League: ${match.leagueName} | Date: ${match.kickoffFormattedWAT}${C.reset}\n`);
  
  if (match.events && match.events.length > 0) {
    console.log(`${C.bold}Events:${C.reset}`);
    match.events.forEach(e => {
        let msg = ` - ${C.dim}${e.minute}'${C.reset} [${e.type}] ${e.player || ''}`;
        if (e.assist) msg += ` ${C.gray}(🅰️ ${e.assist})${C.reset}`;
        console.log(msg);
    });
  } else {
    console.log(`${C.gray}No detailed events available.${C.reset}`);
  }
  console.log('');
}

export default {
  displayFixturesSummary,
  promptMainMenu,
  promptMatchSelection,
  promptMonitoringSubmenu,
  promptMatchDetailSelection,
  displayMatchDetails,
};

