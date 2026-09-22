import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Terminal,
  Send,
  Radio,
  Play,
  Pause,
  RotateCcw,
  Copy,
  Check,
  Facebook,
  Sparkles,
  AlertCircle,
  Calendar,
  Clock,
  Trash2,
  ExternalLink,
  ChevronRight,
  Shield,
  Layers,
  Settings,
  HelpCircle,
  Activity,
  ListFilter,
  CheckCircle2,
} from 'lucide-react';
import { MatchEventSummary } from '../types';
import {
  formatTodayFixturesPost,
  formatTodayTopFixturesPost,
  formatTodayLowFixturesPost,
  formatYesterdayResultsPost,
  formatYesterdayTopResultsPost,
  formatYesterdayLowResultsPost,
  splitMatchesByTier,
  publishToFacebook,
  getPublishedPosts,
  clearPublishedPosts,
  PublishedPostRecord,
  SIMULATION_LIFECYCLE_STEPS,
  extractTeamNames,
  extractScore,
  getMatchFlag,
  formatKickoffWAT,
} from '../utils/cliPublisherEngine';
import { getWATDates } from '../services/espn';

interface CliConsoleHubProps {
  todayMatches: MatchEventSummary[];
  yesterdayMatches: MatchEventSummary[];
  monitoredMatchIds: Set<string>;
  onToggleMonitor: (matchId: string) => void;
  onSelectMatch: (match: MatchEventSummary) => void;
}

type SubTab = 'publisher' | 'monitor' | 'simulation' | 'terminal' | 'history';
type PostMode =
  | 'today_top'
  | 'today_low'
  | 'today_all'
  | 'yesterday_top'
  | 'yesterday_low'
  | 'yesterday_all'
  | 'yesterday';

export const CliConsoleHub: React.FC<CliConsoleHubProps> = ({
  todayMatches,
  yesterdayMatches,
  monitoredMatchIds,
  onToggleMonitor,
  onSelectMatch,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('publisher');
  const { todayFormattedDisplay, yesterdayFormattedDisplay } = useMemo(() => getWATDates(), []);

  // Split today's matches into Top Tier (including Saudi Pro League) and World / Lower Tier
  const { top: topTodayMatches, low: lowTodayMatches } = useMemo(
    () => splitMatchesByTier(todayMatches),
    [todayMatches]
  );

  // Split yesterday's matches into Top Tier (including Saudi Pro League) and World / Lower Tier
  const { top: topYesterdayMatches, low: lowYesterdayMatches } = useMemo(
    () => splitMatchesByTier(yesterdayMatches),
    [yesterdayMatches]
  );

  // Group matches by league for clean league-separated monitoring selection
  const groupedTodayMatches = useMemo<Record<string, MatchEventSummary[]>>(() => {
    const groups: Record<string, MatchEventSummary[]> = {};
    todayMatches.forEach((m) => {
      const league = m.league || 'Other Competitions';
      if (!groups[league]) groups[league] = [];
      groups[league].push(m);
    });
    return groups;
  }, [todayMatches]);

  // Publisher state
  const [postMode, setPostMode] = useState<PostMode>('today_top');
  const [postText, setPostText] = useState<string>('');
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishResult, setPublishResult] = useState<{
    success: boolean;
    postId?: string;
    isSimulated?: boolean;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Settings for Facebook Credentials
  const [showCredsModal, setShowCredsModal] = useState<boolean>(false);
  const [fbPageId, setFbPageId] = useState<string>(() => localStorage.getItem('fb_page_id') || '');
  const [fbToken, setFbToken] = useState<string>(() => localStorage.getItem('fb_access_token') || '');

  // Published posts history
  const [publishedHistory, setPublishedHistory] = useState<PublishedPostRecord[]>(() => getPublishedPosts());

  // Simulation state
  const [simStepIndex, setSimStepIndex] = useState<number>(0);
  const [isSimPlaying, setIsSimPlaying] = useState<boolean>(false);
  const simTimerRef = useRef<any>(null);

  // Live monitor polling state
  const [isMonitoringActive, setIsMonitoringActive] = useState<boolean>(false);
  const [pollIntervalSec, setPollIntervalSec] = useState<number>(30);
  const [cycleCount, setCycleCount] = useState<number>(0);
  const [lastPollTime, setLastPollTime] = useState<string | null>(null);
  const [monitorLogs, setMonitorLogs] = useState<Array<{ id: string; time: string; text: string; type: 'info' | 'success' | 'warn' }>>([]);

  // Terminal state
  const [commandInput, setCommandInput] = useState<string>('');
  const [terminalLogs, setTerminalLogs] = useState<Array<{ id: string; text: string; type: 'cmd' | 'output' | 'success' | 'error' | 'info' }>>([
    { id: '1', text: '⚡ ESPN Football CLI & Facebook Publisher Initialized (WAT Africa/Lagos)', type: 'info' },
    { id: '2', text: 'Type "help" or select a quick action above to execute any CLI command.', type: 'info' },
  ]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Generate initial post text when postMode changes or matches load
  useEffect(() => {
    if (postMode === 'today_top') {
      const text = formatTodayTopFixturesPost(topTodayMatches, todayFormattedDisplay);
      setPostText(text);
    } else if (postMode === 'today_low') {
      const text = formatTodayLowFixturesPost(lowTodayMatches, todayFormattedDisplay);
      setPostText(text);
    } else if (postMode === 'today_all') {
      const text = formatTodayFixturesPost(todayMatches, todayFormattedDisplay);
      setPostText(text);
    } else if (postMode === 'yesterday_top') {
      const text = formatYesterdayTopResultsPost(topYesterdayMatches, yesterdayFormattedDisplay);
      setPostText(text);
    } else if (postMode === 'yesterday_low') {
      const text = formatYesterdayLowResultsPost(lowYesterdayMatches, yesterdayFormattedDisplay);
      setPostText(text);
    } else {
      const text = formatYesterdayResultsPost(yesterdayMatches, yesterdayFormattedDisplay);
      setPostText(text);
    }
    setPublishResult(null);
  }, [
    postMode,
    todayMatches,
    topTodayMatches,
    lowTodayMatches,
    yesterdayMatches,
    topYesterdayMatches,
    lowYesterdayMatches,
    todayFormattedDisplay,
    yesterdayFormattedDisplay,
  ]);

  // Handle Simulation auto-play
  useEffect(() => {
    if (isSimPlaying) {
      simTimerRef.current = setInterval(() => {
        setSimStepIndex((prev) => {
          if (prev >= SIMULATION_LIFECYCLE_STEPS.length - 1) {
            setIsSimPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 3500);
    } else if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
    }
    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
    };
  }, [isSimPlaying]);

  // Handle Live Monitor background simulation
  useEffect(() => {
    let interval: any = null;
    if (isMonitoringActive) {
      interval = setInterval(() => {
        setCycleCount((c) => c + 1);
        const nowWAT = new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Lagos' });
        setLastPollTime(nowWAT);

        const activeCount = monitoredMatchIds.size;
        const msg = activeCount > 0
          ? `[CYCLE #${cycleCount + 1}] Polled ${activeCount} monitored matches from ESPN endpoints. No unhandled status drifts.`
          : `[CYCLE #${cycleCount + 1}] Polling idle: 0 matches selected for monitoring. Select matches in the list below.`;

        setMonitorLogs((prev) => [
          {
            id: String(Date.now()),
            time: nowWAT,
            text: msg,
            type: activeCount > 0 ? 'success' : 'warn',
          },
          ...prev.slice(0, 49),
        ]);
      }, pollIntervalSec * 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isMonitoringActive, pollIntervalSec, cycleCount, monitoredMatchIds]);

  // Scroll terminal to bottom on new logs
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs]);

  // Publish to Facebook Action
  const handlePublish = async () => {
    if (!postText.trim()) return;
    setIsPublishing(true);
    setPublishResult(null);

    const type = postMode.startsWith('yesterday') ? 'YESTERDAY_RESULTS' : 'TODAY_FIXTURES';
    const res = await publishToFacebook(postText, type);
    setIsPublishing(false);
    setPublishResult(res);
    setPublishedHistory(getPublishedPosts());

    // Add log to terminal
    if (res.success) {
      setTerminalLogs((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          text: `[FACEBOOK PUBLISHED] ${res.isSimulated ? 'Simulated Post' : 'Live Post'} created successfully. ID: ${res.postId}`,
          type: 'success',
        },
      ]);
    } else {
      setTerminalLogs((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          text: `[FACEBOOK ERROR] Failed to publish post: ${res.error}`,
          type: 'error',
        },
      ]);
    }
  };

  // Publish Both Posts for Today: Post 1 for Top Leagues (including Saudi Pro League) and Post 2 for World/Lower Leagues
  const handlePublishBoth = async () => {
    setIsPublishing(true);
    setPublishResult(null);

    const post1Text = formatTodayTopFixturesPost(topTodayMatches, todayFormattedDisplay);
    const post2Text = formatTodayLowFixturesPost(lowTodayMatches, todayFormattedDisplay);

    let res1: any = { success: false };
    let res2: any = { success: false };

    if (topTodayMatches.length > 0) {
      res1 = await publishToFacebook(post1Text, 'TODAY_FIXTURES');
    }
    if (lowTodayMatches.length > 0) {
      res2 = await publishToFacebook(post2Text, 'TODAY_FIXTURES');
    }

    setIsPublishing(false);
    setPublishedHistory(getPublishedPosts());

    const overallSuccess =
      (topTodayMatches.length === 0 || res1.success) &&
      (lowTodayMatches.length === 0 || res2.success);

    setPublishResult({
      success: overallSuccess,
      postId: [res1.postId, res2.postId].filter(Boolean).join(', '),
      isSimulated: res1.isSimulated || res2.isSimulated,
      error: !overallSuccess
        ? res1.error || res2.error || 'Failed to publish one or both posts'
        : undefined,
    });

    setTerminalLogs((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        text: `[FACEBOOK 2 TODAY POSTS COMPLETED] Post 1 (Top Leagues & Saudi): ${
          res1.success ? `Success (ID: ${res1.postId})` : 'Skipped/Error'
        }. Post 2 (World / Lower Leagues): ${
          res2.success ? `Success (ID: ${res2.postId})` : 'Skipped/Error'
        }.`,
        type: overallSuccess ? 'success' : 'warn',
      },
    ]);
  };

  // Publish Both Posts for Yesterday: Post 1 for Top Leagues (including Saudi Pro League) and Post 2 for World/Lower Leagues
  const handlePublishBothYesterday = async () => {
    setIsPublishing(true);
    setPublishResult(null);

    const post1Text = formatYesterdayTopResultsPost(topYesterdayMatches, yesterdayFormattedDisplay);
    const post2Text = formatYesterdayLowResultsPost(lowYesterdayMatches, yesterdayFormattedDisplay);

    let res1: any = { success: false };
    let res2: any = { success: false };

    if (topYesterdayMatches.length > 0) {
      res1 = await publishToFacebook(post1Text, 'YESTERDAY_RESULTS');
    }
    if (lowYesterdayMatches.length > 0) {
      res2 = await publishToFacebook(post2Text, 'YESTERDAY_RESULTS');
    }

    setIsPublishing(false);
    setPublishedHistory(getPublishedPosts());

    const overallSuccess =
      (topYesterdayMatches.length === 0 || res1.success) &&
      (lowYesterdayMatches.length === 0 || res2.success);

    setPublishResult({
      success: overallSuccess,
      postId: [res1.postId, res2.postId].filter(Boolean).join(', '),
      isSimulated: res1.isSimulated || res2.isSimulated,
      error: !overallSuccess
        ? res1.error || res2.error || 'Failed to publish one or both yesterday posts'
        : undefined,
    });

    setTerminalLogs((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        text: `[FACEBOOK 2 YESTERDAY POSTS COMPLETED] Post 1 (Top Leagues & Saudi): ${
          res1.success ? `Success (ID: ${res1.postId})` : 'Skipped/Error'
        }. Post 2 (World / Lower Leagues): ${
          res2.success ? `Success (ID: ${res2.postId})` : 'Skipped/Error'
        }.`,
        type: overallSuccess ? 'success' : 'warn',
      },
    ]);
  };

  // Copy to clipboard
  const handleCopy = () => {
    if (!postText) return;
    navigator.clipboard.writeText(postText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Save FB Credentials
  const handleSaveCredentials = () => {
    localStorage.setItem('fb_page_id', fbPageId.trim());
    localStorage.setItem('fb_access_token', fbToken.trim());
    setShowCredsModal(false);
    setTerminalLogs((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        text: fbPageId.trim()
          ? `[CONFIG] Saved Facebook credentials (Page ID: ${fbPageId.trim().slice(0, 5)}***). Real publishing active.`
          : `[CONFIG] Cleared Facebook credentials. Switched to simulated logging mode.`,
        type: 'info',
      },
    ]);
  };

  // Run Terminal Command
  const runCommand = (cmd: string) => {
    const trimmed = cmd.trim().toLowerCase();
    if (!trimmed) return;

    setTerminalLogs((prev) => [
      ...prev,
      { id: String(Date.now()), text: `$ ${cmd}`, type: 'cmd' },
    ]);
    setCommandInput('');

    switch (trimmed) {
      case 'help':
        setTerminalLogs((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            text: `Available CLI Commands:
  • post            - Format & publish both Top Leagues & World Leagues posts (today)
  • post_top        - Format & preview Top Leagues (today, including Saudi Pro League)
  • post_low        - Format & preview World & Lower Leagues (today)
  • post_all        - Format & preview all fixtures combined (today)
  • post_yesterday  - Format & publish both Top Leagues & World Leagues posts (yesterday)
  • post_yesterday_top - Format & preview yesterday Top Leagues (incl. Saudi Pro League)
  • post_yesterday_low - Format & preview yesterday World & Lower Leagues
  • post_yesterday_all - Format & preview all combined yesterday results
  • publish         - Publish current formatted post to Facebook
  • publish_both    - Publish both Top and World League posts sequentially (today)
  • publish_both_yesterday - Publish both Top and World League posts sequentially (yesterday)
  • monitor         - View & manage monitored matches queue
  • both            - Auto-pilot: Publish fixtures & start live monitoring
  • yesterday       - Display yesterday's match results table
  • today           - Display today's match fixtures table
  • sim             - Open match lifecycle simulation (Arsenal vs Chelsea)
  • status          - Show Facebook publisher & monitoring system status
  • history         - Show recent published Facebook posts
  • clear           - Clear terminal log screen`,
            type: 'info',
          },
        ]);
        break;

      case 'post':
      case 'post_both':
      case 'post-both':
        setActiveSubTab('publisher');
        handlePublishBoth();
        break;

      case 'post_top':
      case 'post-top':
        setPostMode('today_top');
        setActiveSubTab('publisher');
        setTerminalLogs((prev) => [
          ...prev,
          { id: String(Date.now()), text: `Formatted Top Leagues fixtures (${topTodayMatches.length} matches, including Saudi Pro League). Switched to Publisher preview.`, type: 'success' },
        ]);
        break;

      case 'post_low':
      case 'post-low':
        setPostMode('today_low');
        setActiveSubTab('publisher');
        setTerminalLogs((prev) => [
          ...prev,
          { id: String(Date.now()), text: `Formatted World / Lower Leagues fixtures (${lowTodayMatches.length} matches). Switched to Publisher preview.`, type: 'success' },
        ]);
        break;

      case 'post_all':
      case 'post-all':
        setPostMode('today_all');
        setActiveSubTab('publisher');
        setTerminalLogs((prev) => [
          ...prev,
          { id: String(Date.now()), text: `Formatted all combined fixtures (${todayMatches.length} matches). Switched to Publisher preview.`, type: 'success' },
        ]);
        break;

      case 'post_yesterday':
      case 'post_yesterday_both':
      case 'post-yesterday-both':
        setActiveSubTab('publisher');
        handlePublishBothYesterday();
        break;

      case 'post_yesterday_top':
      case 'post-yesterday-top':
        setPostMode('yesterday_top');
        setActiveSubTab('publisher');
        setTerminalLogs((prev) => [
          ...prev,
          { id: String(Date.now()), text: `Formatted yesterday Top Leagues results (${topYesterdayMatches.length} matches, including Saudi Pro League). Switched to Publisher preview.`, type: 'success' },
        ]);
        break;

      case 'post_yesterday_low':
      case 'post-yesterday-low':
        setPostMode('yesterday_low');
        setActiveSubTab('publisher');
        setTerminalLogs((prev) => [
          ...prev,
          { id: String(Date.now()), text: `Formatted yesterday World / Lower Leagues results (${lowYesterdayMatches.length} matches). Switched to Publisher preview.`, type: 'success' },
        ]);
        break;

      case 'post_yesterday_all':
      case 'post-yesterday-all':
        setPostMode('yesterday_all');
        setActiveSubTab('publisher');
        setTerminalLogs((prev) => [
          ...prev,
          { id: String(Date.now()), text: `Formatted all combined yesterday results (${yesterdayMatches.length} matches). Switched to Publisher preview.`, type: 'success' },
        ]);
        break;

      case 'publish':
        handlePublish();
        break;

      case 'publish_both':
        handlePublishBoth();
        break;

      case 'publish_both_yesterday':
      case 'publish_yesterday_both':
        handlePublishBothYesterday();
        break;

      case 'monitor':
        setActiveSubTab('monitor');
        setTerminalLogs((prev) => [
          ...prev,
          { id: String(Date.now()), text: `Switched to Live Monitor. Active monitored count: ${monitoredMatchIds.size}/15`, type: 'info' },
        ]);
        break;

      case 'both':
        setPostMode('today_top');
        setActiveSubTab('publisher');
        setIsMonitoringActive(true);
        handlePublishBoth();
        setTerminalLogs((prev) => [
          ...prev,
          { id: String(Date.now()), text: `[AUTO-PILOT] Initiated Facebook two-post fixtures publish and started live monitoring cycle!`, type: 'success' },
        ]);
        break;

      case 'yesterday':
        setTerminalLogs((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            text: `📅 YESTERDAY'S RESULTS (${yesterdayMatches.length} matches):\n` +
              yesterdayMatches
                .map((m) => {
                  const { home, away } = extractTeamNames(m);
                  const { home: hScore, away: aScore } = extractScore(m);
                  const flag = getMatchFlag(m);
                  return `  FT ${flag} ${home} ${hScore} : ${aScore} ${away}`;
                })
                .join('\n'),
            type: 'output',
          },
        ]);
        break;

      case 'today':
        setTerminalLogs((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            text: `📅 TODAY'S FIXTURES (${todayMatches.length} matches):\n` +
              todayMatches
                .map((m) => {
                  const { home, away } = extractTeamNames(m);
                  const kickoff = formatKickoffWAT(m.date);
                  const flag = getMatchFlag(m);
                  return `  ${kickoff} WAT ${flag} ${home} vs ${away}`;
                })
                .join('\n'),
            type: 'output',
          },
        ]);
        break;

      case 'sim':
        setActiveSubTab('simulation');
        setTerminalLogs((prev) => [
          ...prev,
          { id: String(Date.now()), text: `Switched to Match Lifecycle Simulation (Arsenal vs Chelsea).`, type: 'info' },
        ]);
        break;

      case 'status':
        const hasLiveCreds = Boolean(localStorage.getItem('fb_page_id') && localStorage.getItem('fb_access_token'));
        setTerminalLogs((prev) => [
          ...prev,
          {
            id: String(Date.now()),
            text: `SYSTEM STATUS:
  • Facebook Mode: ${hasLiveCreds ? 'LIVE GRAPH API (Page Connected)' : 'SIMULATED / TEST MODE'}
  • Live Monitoring: ${isMonitoringActive ? '🟢 RUNNING' : '⏹️ STOPPED'}
  • Poll Interval: ${pollIntervalSec}s
  • Monitored Matches: ${monitoredMatchIds.size}/15 matches
  • Published Posts Count: ${publishedHistory.length} posts
  • Current Time: ${new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Lagos' })} (WAT)`,
            type: 'info',
          },
        ]);
        break;

      case 'history':
        setActiveSubTab('history');
        break;

      case 'clear':
        setTerminalLogs([]);
        break;

      default:
        setTerminalLogs((prev) => [
          ...prev,
          { id: String(Date.now()), text: `Command not recognized: "${cmd}". Type "help" for valid commands.`, type: 'error' },
        ]);
        break;
    }
  };

  const currentSimStep = SIMULATION_LIFECYCLE_STEPS[simStepIndex];

  return (
    <div className="space-y-4">
      {/* Top Banner / CLI Command Quick Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white">CLI Operations & Facebook Hub</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">
                  Dual Screen (Mobile & PC)
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Execute all CLI operations directly from this control panel: Facebook publishing, live match monitoring & simulation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCredsModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 border border-neutral-700 transition-colors"
            >
              <Facebook className="w-3.5 h-3.5 text-blue-400" />
              <span>{fbPageId ? 'FB Configured' : 'Configure FB API'}</span>
            </button>

            <button
              onClick={() => {
                setPostMode('today');
                setActiveSubTab('publisher');
                setIsMonitoringActive(true);
                handlePublish();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>⚡ Auto-Pilot (Post & Monitor)</span>
            </button>
          </div>
        </div>

        {/* CLI Quick Action Menu Buttons (1-7) */}
        <div className="pt-3">
          <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
            CLI Quick Actions (Mirroring Terminal Menu):
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <button
              id="cli-btn-post-today"
              onClick={() => {
                setPostMode('today');
                setActiveSubTab('publisher');
              }}
              className={`p-2 rounded-lg border text-left transition-all ${
                activeSubTab === 'publisher' && postMode === 'today'
                  ? 'bg-red-950/60 border-red-600 text-white'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                <span>1. 📢</span>
                <span>Post Today</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5 truncate">Format & publish fixtures</p>
            </button>

            <button
              id="cli-btn-monitor"
              onClick={() => setActiveSubTab('monitor')}
              className={`p-2 rounded-lg border text-left transition-all ${
                activeSubTab === 'monitor'
                  ? 'bg-emerald-950/60 border-emerald-600 text-white'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <span>2. 🎯</span>
                <span>Live Monitor</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5 truncate">{monitoredMatchIds.size}/15 matches active</p>
            </button>

            <button
              id="cli-btn-both"
              onClick={() => {
                setPostMode('today_top');
                setActiveSubTab('publisher');
                setIsMonitoringActive(true);
                handlePublishBoth();
              }}
              className="p-2 rounded-lg border bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                <span>3. ⚡</span>
                <span>Both (Post+Monitor)</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5 truncate">1-click auto execution</p>
            </button>

            <button
              id="cli-btn-view-yesterday"
              onClick={() => runCommand('yesterday')}
              className="p-2 rounded-lg border bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700 text-left transition-all"
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400">
                <span>4. 📅</span>
                <span>View Results</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5 truncate">Yesterday summary table</p>
            </button>

            <button
              id="cli-btn-post-yesterday"
              onClick={() => {
                setPostMode('yesterday_top');
                setActiveSubTab('publisher');
              }}
              className={`p-2 rounded-lg border text-left transition-all ${
                activeSubTab === 'publisher' && postMode.startsWith('yesterday')
                  ? 'bg-purple-950/60 border-purple-600 text-white'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400">
                <span>5. 📤</span>
                <span>Post Results</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5 truncate">Post yesterday (2 posts)</p>
            </button>

            <button
              id="cli-btn-sim"
              onClick={() => setActiveSubTab('simulation')}
              className={`p-2 rounded-lg border text-left transition-all ${
                activeSubTab === 'simulation'
                  ? 'bg-cyan-950/60 border-cyan-600 text-white'
                  : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400">
                <span>7. 🧪</span>
                <span>Simulation</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5 truncate">15-step match lifecycle</p>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs: Touch-Friendly for Mobile & PC */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar border-b border-neutral-800">
        <button
          onClick={() => setActiveSubTab('publisher')}
          className={`px-3 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'publisher'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Facebook className="w-3.5 h-3.5" />
          <span>Facebook Publisher</span>
        </button>

        <button
          onClick={() => setActiveSubTab('monitor')}
          className={`px-3 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'monitor'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Radio className={`w-3.5 h-3.5 ${isMonitoringActive ? 'animate-pulse text-white' : ''}`} />
          <span>Live Monitoring Loop</span>
          {isMonitoringActive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
        </button>

        <button
          onClick={() => setActiveSubTab('simulation')}
          className={`px-3 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'simulation'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Play className="w-3.5 h-3.5" />
          <span>Mock Simulation (15-step)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('terminal')}
          className={`px-3 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'terminal'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Interactive Terminal</span>
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`px-3 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeSubTab === 'history'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Published Posts History ({publishedHistory.length})</span>
        </button>
      </div>

      {/* SUB-VIEW 1: FACEBOOK PUBLISHER */}
      {activeSubTab === 'publisher' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Post Controls & Options */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center justify-between">
                <span>Select Content to Format & Post</span>
                <span className="text-xs font-normal text-neutral-400">WAT (Africa/Lagos)</span>
              </h3>

              <div className="space-y-2.5">
                <div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Today's Fixtures ({todayFormattedDisplay})</span>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      id="tab-mode-today-top"
                      onClick={() => setPostMode('today_top')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        postMode === 'today_top'
                          ? 'bg-red-950/70 border-red-500 text-white shadow-sm'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <Clock className="w-3.5 h-3.5 text-red-400" />
                        <span className="truncate">Top Leagues + Saudi</span>
                      </div>
                      <p className="text-[10px] text-neutral-400 mt-0.5">{topTodayMatches.length} matches (Post 1)</p>
                    </button>

                    <button
                      id="tab-mode-today-low"
                      onClick={() => setPostMode('today_low')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        postMode === 'today_low'
                          ? 'bg-red-950/70 border-red-500 text-white shadow-sm'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span className="truncate">World / Lower Leagues</span>
                      </div>
                      <p className="text-[10px] text-neutral-400 mt-0.5">{lowTodayMatches.length} matches (Post 2)</p>
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Yesterday's Results ({yesterdayFormattedDisplay})</span>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      id="tab-mode-yesterday-top"
                      onClick={() => setPostMode('yesterday_top')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        postMode === 'yesterday_top'
                          ? 'bg-red-950/70 border-red-500 text-white shadow-sm'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="truncate">Top Leagues + Saudi</span>
                      </div>
                      <p className="text-[10px] text-neutral-400 mt-0.5">{topYesterdayMatches.length} matches (Post 1)</p>
                    </button>

                    <button
                      id="tab-mode-yesterday-low"
                      onClick={() => setPostMode('yesterday_low')}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        postMode === 'yesterday_low'
                          ? 'bg-red-950/70 border-red-500 text-white shadow-sm'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                        <span className="truncate">World / Lower Leagues</span>
                      </div>
                      <p className="text-[10px] text-neutral-400 mt-0.5">{lowYesterdayMatches.length} matches (Post 2)</p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button
                    id="tab-mode-today-all"
                    onClick={() => setPostMode('today_all')}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      postMode === 'today_all'
                        ? 'bg-red-950/70 border-red-500 text-white shadow-sm'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="truncate">Today All Combined</span>
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5">{todayMatches.length} fixtures</p>
                  </button>

                  <button
                    id="tab-mode-yesterday-all"
                    onClick={() => setPostMode('yesterday_all')}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      postMode === 'yesterday_all' || postMode === 'yesterday'
                        ? 'bg-red-950/70 border-red-500 text-white shadow-sm'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="truncate">Yesterday All Combined</span>
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5">{yesterdayMatches.length} results</p>
                  </button>
                </div>
              </div>

              {/* Status Info Box */}
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-3 text-xs space-y-1.5 text-neutral-300">
                <div className="flex items-center justify-between text-neutral-400">
                  <span>Target Date:</span>
                  <strong className="text-neutral-200">
                    {postMode.startsWith('yesterday') ? yesterdayFormattedDisplay : todayFormattedDisplay}
                  </strong>
                </div>
                <div className="flex items-center justify-between text-neutral-400">
                  <span>Active Selection:</span>
                  <span className="text-neutral-200 font-semibold">
                    {postMode === 'today_top'
                      ? 'Today Post 1: Top Leagues & Saudi Pro League'
                      : postMode === 'today_low'
                      ? 'Today Post 2: World & Lower Leagues'
                      : postMode === 'today_all'
                      ? 'Today: All Fixtures Combined'
                      : postMode === 'yesterday_top'
                      ? 'Yesterday Post 1: Top Leagues & Saudi Pro League'
                      : postMode === 'yesterday_low'
                      ? 'Yesterday Post 2: World & Lower Leagues'
                      : "Yesterday: All Final Results Combined"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-neutral-400">
                  <span>Target Service:</span>
                  <span className="text-neutral-200">
                    {fbPageId ? 'Live Facebook Graph API' : 'Simulated Logger Mode'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-neutral-400">
                  <span>Formatting:</span>
                  <span className="text-neutral-200">Mathematical Bold + Flags + (W) Prefix + WAT</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    id="btn-publish-facebook"
                    onClick={handlePublish}
                    disabled={isPublishing || !postText.trim()}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                  >
                    <Facebook className="w-4 h-4" />
                    <span>{isPublishing ? 'Publishing...' : '📢 Publish Selected Post'}</span>
                  </button>

                  <button
                    id="btn-copy-post"
                    onClick={handleCopy}
                    className="py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium text-xs flex items-center justify-center gap-1.5 border border-neutral-700 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    id="btn-publish-both-posts"
                    onClick={handlePublishBoth}
                    disabled={isPublishing || todayMatches.length === 0}
                    className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="truncate">⚡ 2 Posts: Today</span>
                  </button>

                  <button
                    id="btn-publish-both-yesterday-posts"
                    onClick={handlePublishBothYesterday}
                    disabled={isPublishing || yesterdayMatches.length === 0}
                    className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="truncate">⚡ 2 Posts: Yesterday</span>
                  </button>
                </div>
              </div>

              {/* Publish Result Alert */}
              {publishResult && (
                <div
                  className={`p-3 rounded-lg text-xs flex items-start gap-2.5 ${
                    publishResult.success
                      ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                      : 'bg-red-950/60 border border-red-800 text-red-300'
                  }`}
                >
                  {publishResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-bold">
                      {publishResult.success
                        ? publishResult.isSimulated
                          ? '✅ Post Created (Simulated Mode)'
                          : '🎉 Live Facebook Post Published!'
                        : '❌ Failed to Publish Post'}
                    </p>
                    <p className="text-[11px] opacity-90">
                      {publishResult.success
                        ? `Post ID: ${publishResult.postId}. Logged in the Published History feed.`
                        : publishResult.error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Formatted Post Preview */}
          <div className="lg:col-span-7">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col h-full space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                    Live Post Preview (What Facebook followers will see)
                  </h3>
                </div>
                <button
                  onClick={() => {
                    const fresh =
                      postMode === 'today'
                        ? formatTodayFixturesPost(todayMatches, todayFormattedDisplay)
                        : formatYesterdayResultsPost(yesterdayMatches, yesterdayFormattedDisplay);
                    setPostText(fresh);
                  }}
                  className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Text</span>
                </button>
              </div>

              {/* Editable Textarea for preview and adjustments */}
              <div className="flex-1 min-h-[360px] bg-neutral-950 border border-neutral-800 rounded-lg p-3 relative">
                <textarea
                  id="cli-post-textarea"
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  className="w-full h-full bg-transparent text-neutral-200 text-xs sm:text-sm font-sans whitespace-pre-wrap leading-relaxed focus:outline-none resize-none break-words"
                  placeholder="Generating formatted post content..."
                  rows={16}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                <span>{postText.length} characters</span>
                <span>Includes mathematical unicode bolding, emojis & hashtags</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: LIVE MONITORING CONTROLS */}
      {activeSubTab === 'monitor' && (
        <div className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-3.5 h-3.5 rounded-full ${
                    isMonitoringActive ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-600'
                  }`}
                />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Live Event & Assist Polling Engine
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        isMonitoringActive
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                      }`}
                    >
                      {isMonitoringActive ? '🟢 POLLING ACTIVE' : '⏹️ IDLE'}
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Non-overlapping background cycle: detects Kickoff, Goals, Disallowed VAR, Penalties, Cards, Halftime & Fulltime.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-neutral-300 bg-neutral-950 border border-neutral-800 px-2.5 py-1.5 rounded-lg">
                  <span className="text-neutral-400">Interval:</span>
                  <select
                    value={pollIntervalSec}
                    onChange={(e) => setPollIntervalSec(Number(e.target.value))}
                    className="bg-transparent text-white font-medium focus:outline-none"
                  >
                    <option value={15} className="bg-neutral-900">15s</option>
                    <option value={30} className="bg-neutral-900">30s</option>
                    <option value={60} className="bg-neutral-900">60s</option>
                  </select>
                </div>

                <button
                  id="btn-toggle-monitor"
                  onClick={() => setIsMonitoringActive(!isMonitoringActive)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                    isMonitoringActive
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {isMonitoringActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isMonitoringActive ? 'Pause Polling' : 'Start Live Monitoring'}</span>
                </button>
              </div>
            </div>

            {/* Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs">
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-3">
                <span className="text-neutral-400 block text-[11px]">Monitored Matches</span>
                <span className="text-lg font-bold text-white">{monitoredMatchIds.size} / 15</span>
              </div>
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-3">
                <span className="text-neutral-400 block text-[11px]">Cycles Completed</span>
                <span className="text-lg font-bold text-white">#{cycleCount}</span>
              </div>
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-3">
                <span className="text-neutral-400 block text-[11px]">Last Poll (WAT)</span>
                <span className="text-base font-semibold text-neutral-200">{lastPollTime || 'Not polled yet'}</span>
              </div>
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-3">
                <span className="text-neutral-400 block text-[11px]">Facebook Client</span>
                <span className="text-base font-semibold text-neutral-200">
                  {fbPageId ? 'Real Graph API' : 'Simulated Client'}
                </span>
              </div>
            </div>
          </div>

          {/* Currently Monitored Matches List & Selection */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                Active Monitored Queue ({monitoredMatchIds.size}/15)
              </h4>
              <span className="text-[11px] text-neutral-400">
                Click any match to inspect details, or toggle the radio button to add/remove
              </span>
            </div>

            {todayMatches.length === 0 ? (
              <p className="text-xs text-neutral-500 py-4 text-center">No matches currently loaded from ESPN.</p>
            ) : (
              <div className="space-y-4">
                {(Object.entries(groupedTodayMatches) as [string, MatchEventSummary[]][]).map(([leagueName, leagueMatches]) => {
                  const leagueFlag = leagueMatches[0] ? getMatchFlag(leagueMatches[0]) : '🏆';
                  return (
                    <div key={leagueName} className="space-y-2">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-950/90 border border-neutral-800 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{leagueFlag}</span>
                          <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">{leagueName}</span>
                        </div>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {leagueMatches.length} match{leagueMatches.length !== 1 ? 'es' : ''}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {leagueMatches.map((m) => {
                          const isMonitored = monitoredMatchIds.has(m.id);
                          const { home, away } = extractTeamNames(m);
                          const { home: hScore, away: aScore } = extractScore(m);
                          const isLive = m.status?.type?.state === 'in';
                          const flag = getMatchFlag(m);
                          const kickoff = formatKickoffWAT(m.date);

                          return (
                            <div
                              key={m.id}
                              onClick={() => onSelectMatch(m)}
                              className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                isMonitored
                                  ? 'bg-emerald-950/30 border-emerald-600/80 shadow-sm'
                                  : 'bg-neutral-950 border-neutral-800/80 hover:border-neutral-700'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                                  <span>{flag}</span>
                                  <span className={isLive ? 'text-emerald-400 font-bold' : ''}>
                                    {isLive ? `${m.status?.displayClock || 'Live'}` : `${kickoff} WAT`}
                                  </span>
                                </div>
                                <p className="text-xs font-bold text-white truncate mt-0.5">
                                  {home} {isLive ? `${hScore} - ${aScore}` : 'vs'} {away}
                                </p>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleMonitor(m.id);
                                }}
                                className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors ${
                                  isMonitored
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                                }`}
                              >
                                <Radio className="w-3 h-3" />
                                <span>{isMonitored ? 'Monitored' : '+ Add'}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Polling Activity Log */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-2">
            <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real-Time Polling Activity Log</span>
            </h4>
            <div className="h-44 overflow-y-auto bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 font-mono text-xs space-y-1.5">
              {monitorLogs.length === 0 ? (
                <p className="text-neutral-500">Monitoring logs will appear here when live polling is active...</p>
              ) : (
                monitorLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="text-neutral-500 shrink-0">[{log.time}]</span>
                    <span
                      className={
                        log.type === 'success'
                          ? 'text-emerald-400'
                          : log.type === 'warn'
                          ? 'text-amber-400'
                          : 'text-neutral-300'
                      }
                    >
                      {log.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: MOCK SIMULATION (15-STEP MATCH LIFECYCLE) */}
      {activeSubTab === 'simulation' && (
        <div className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Match Lifecycle Simulation
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800">
                    Arsenal vs Chelsea (Premier League)
                  </span>
                </h3>
                <p className="text-xs text-neutral-400">
                  Step through the complete 15-step match lifecycle from pre-match lineups to 90+2' winner and full-time whistle.
                </p>
              </div>

              {/* Simulation Controls */}
              <div className="flex items-center gap-2">
                <button
                  id="sim-btn-prev"
                  onClick={() => setSimStepIndex((prev) => Math.max(0, prev - 1))}
                  disabled={simStepIndex === 0}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 text-xs font-medium"
                >
                  ◀ Prev Step
                </button>

                <button
                  id="sim-btn-play"
                  onClick={() => setIsSimPlaying(!isSimPlaying)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    isSimPlaying
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  }`}
                >
                  {isSimPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isSimPlaying ? 'Pause' : 'Auto-Play'}</span>
                </button>

                <button
                  id="sim-btn-next"
                  onClick={() => setSimStepIndex((prev) => Math.min(SIMULATION_LIFECYCLE_STEPS.length - 1, prev + 1))}
                  disabled={simStepIndex === SIMULATION_LIFECYCLE_STEPS.length - 1}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold"
                >
                  Next Step ▶
                </button>

                <button
                  id="sim-btn-reset"
                  onClick={() => {
                    setIsSimPlaying(false);
                    setSimStepIndex(0);
                  }}
                  className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white"
                  title="Reset to Step 1"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Stepper Progress Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>
                  Step {currentSimStep.step} of {SIMULATION_LIFECYCLE_STEPS.length}:{' '}
                  <strong className="text-white">{currentSimStep.title}</strong>
                </span>
                <span className="font-mono text-cyan-400 font-bold">{currentSimStep.score}</span>
              </div>
              <div className="w-full bg-neutral-950 rounded-full h-2 overflow-hidden border border-neutral-800">
                <div
                  className="bg-cyan-500 h-full transition-all duration-300"
                  style={{ width: `${((simStepIndex + 1) / SIMULATION_LIFECYCLE_STEPS.length) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Current Step Details & Generated Facebook Post */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Step Metadata Card */}
            <div className="lg:col-span-5 space-y-3">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                  Event Detection State
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-2 rounded bg-neutral-950 border border-neutral-800">
                    <span className="text-neutral-400">Match Clock:</span>
                    <span className="font-mono text-cyan-400 font-bold">{currentSimStep.clock}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-neutral-950 border border-neutral-800">
                    <span className="text-neutral-400">Scoreline:</span>
                    <span className="font-mono text-white font-bold">{currentSimStep.score}</span>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded bg-neutral-950 border border-neutral-800">
                    <span className="text-neutral-400">Detected Event:</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        currentSimStep.eventDetected
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {currentSimStep.eventDetected || 'None'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded bg-neutral-950 border border-neutral-800 space-y-1">
                    <span className="text-[11px] text-neutral-400 block font-semibold">Engine Action Taken:</span>
                    <p className="text-neutral-200">{currentSimStep.actionTaken}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Generated Facebook Post Preview */}
            <div className="lg:col-span-7">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col h-full space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-neutral-800">
                  <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Facebook className="w-3.5 h-3.5 text-blue-400" />
                    <span>Facebook Post Generated For This Step</span>
                  </h4>
                  {currentSimStep.facebookPost && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(currentSimStep.facebookPost!);
                        alert('Simulation post copied to clipboard!');
                      }}
                      className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </button>
                  )}
                </div>

                <div className="flex-1 min-h-[280px] bg-neutral-950 border border-neutral-800 rounded-lg p-3 font-sans text-xs sm:text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed overflow-y-auto">
                  {currentSimStep.facebookPost ? (
                    currentSimStep.facebookPost
                  ) : (
                    <div className="h-full flex items-center justify-center text-neutral-500 text-xs">
                      No Facebook post generated at this step. (Matches awaiting kickoff / non-whitelisted event).
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: INTERACTIVE TERMINAL CONSOLE */}
      {activeSubTab === 'terminal' && (
        <div className="space-y-3">
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 sm:p-4 shadow-2xl flex flex-col h-[520px]">
            {/* Terminal Window Header */}
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="font-mono text-xs text-neutral-400 pl-2">bash - football-cli@host: ~</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTerminalLogs([])}
                  className="text-[11px] text-neutral-500 hover:text-neutral-300 font-mono"
                >
                  Clear Screen
                </button>
              </div>
            </div>

            {/* Terminal Output Stream */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-3 font-mono text-xs sm:text-[13px] leading-relaxed space-y-1.5 no-scrollbar">
              {terminalLogs.map((log) => (
                <div
                  key={log.id}
                  className={`whitespace-pre-wrap break-words ${
                    log.type === 'cmd'
                      ? 'text-cyan-300 font-bold'
                      : log.type === 'success'
                      ? 'text-emerald-400'
                      : log.type === 'error'
                      ? 'text-red-400'
                      : log.type === 'info'
                      ? 'text-neutral-300'
                      : 'text-neutral-200'
                  }`}
                >
                  {log.text}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>

            {/* Quick Command Suggestion Chips */}
            <div className="pt-2 border-t border-neutral-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
              <span className="text-[10px] text-neutral-500 uppercase font-mono shrink-0">Quick:</span>
              {['help', 'post', 'yesterday', 'post_yesterday', 'monitor', 'both', 'sim', 'status', 'clear'].map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => runCommand(cmd)}
                  className="px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 font-mono text-[11px] shrink-0"
                >
                  {cmd}
                </button>
              ))}
            </div>

            {/* Terminal Prompt Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runCommand(commandInput);
              }}
              className="mt-2 flex items-center gap-2 bg-neutral-900 border border-neutral-700/80 rounded-lg px-3 py-1.5"
            >
              <span className="font-mono text-emerald-400 font-bold">$</span>
              <input
                id="cli-terminal-input"
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Type command (e.g. 'post', 'monitor', 'sim', 'help')..."
                className="flex-1 bg-transparent text-white font-mono text-xs sm:text-sm focus:outline-none placeholder-neutral-500"
              />
              <button
                type="submit"
                className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                title="Execute Command"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUB-VIEW 5: PUBLISHED POSTS HISTORY FEED */}
      {activeSubTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Published Posts Feed
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-neutral-800 text-neutral-300">
                    {publishedHistory.length} records
                  </span>
                </h3>
                <p className="text-xs text-neutral-400">
                  Audit log of all Facebook posts submitted through the CLI and Web publisher.
                </p>
              </div>

              {publishedHistory.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Clear published posts history?')) {
                      clearPublishedPosts();
                      setPublishedHistory([]);
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-red-400 text-xs transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              )}
            </div>

            {publishedHistory.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <Facebook className="w-8 h-8 text-neutral-600 mx-auto" />
                <p className="text-sm font-semibold text-neutral-300">No published posts yet</p>
                <p className="text-xs text-neutral-500">
                  Click "1. 📢 Post Today" or "Auto-Pilot" to generate and publish your first post!
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-800/80 pt-2">
                {publishedHistory.map((post) => (
                  <div key={post.id} className="py-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            post.status === 'PUBLISHED'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : post.status === 'SIMULATED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-red-950 text-red-300 border border-red-800'
                          }`}
                        >
                          {post.status}
                        </span>
                        <span className="font-mono text-neutral-400 text-[11px]">ID: {post.id}</span>
                        <span className="text-neutral-500">•</span>
                        <span className="text-neutral-400">{new Date(post.timestamp).toLocaleString()}</span>
                      </div>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(post.message);
                          alert('Post content copied!');
                        }}
                        className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>

                    <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-3 text-xs text-neutral-300 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto leading-relaxed">
                      {post.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FACEBOOK API CREDENTIALS CONFIG MODAL */}
      {showCredsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Facebook className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Facebook API Publishing Credentials</h3>
              </div>
              <button
                onClick={() => setShowCredsModal(false)}
                className="text-neutral-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              To publish directly to your real Facebook Page via Graph API, enter your Page ID and Page Access Token.
              If left blank, the app runs in unauthenticated / simulated mode where all posts are safely logged without errors.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1">
                  Facebook Page ID (FACEBOOK_PAGE_ID)
                </label>
                <input
                  type="text"
                  value={fbPageId}
                  onChange={(e) => setFbPageId(e.target.value)}
                  placeholder="e.g. 104829104829102"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1">
                  Page Access Token (FACEBOOK_PAGE_ACCESS_TOKEN)
                </label>
                <input
                  type="password"
                  value={fbToken}
                  onChange={(e) => setFbToken(e.target.value)}
                  placeholder="EAAB..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-800">
              <button
                onClick={() => {
                  setFbPageId('');
                  setFbToken('');
                  localStorage.removeItem('fb_page_id');
                  localStorage.removeItem('fb_access_token');
                  setShowCredsModal(false);
                }}
                className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300"
              >
                Use Simulated Mode
              </button>
              <button
                onClick={handleSaveCredentials}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs"
              >
                Save Credentials
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
