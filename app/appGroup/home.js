// app/(app)/home/index.js (Previously HomeScreen.js)
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Button,
  Image,
  RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useRouter, Link, useFocusEffect } from 'expo-router';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { useAuth } from '../../src/context/AuthContext';
import { db } from '../../src/config/firebase';

const ArrowRightIcon = () => <Text style={{ color: '#0D1B2A', fontSize: 16, fontWeight: 'bold' }}>GAME ON! ➤</Text>;

// --- THEME COLORS (Navy / Cyan / Green) ---
const PRIMARY_COLOR = '#0D1B2A';    // Deep Navy Background
const SECONDARY_COLOR = '#00E5FF';  // Cyan (Accents, Buttons)
const ACCENT_COLOR = '#00E676';     // Green (Highlights, Success)
const CARD_BACKGROUND = '#1B263B';  // Lighter Navy for Cards
const TEXT_COLOR_MAIN = '#FFFFFF';  // White text for dark mode
const TEXT_COLOR_SUB = '#B0BEC5';   // Light Grey for subtitles
const GOLD_COLOR = '#FFD700';
const SILVER_COLOR = '#C0C0C0';
const BRONZE_COLOR = '#CD7F32';

// --- Configuration for Yahoo Fantasy API ---
const MAX_WEEKS = 18;

// --- Weekly Picks Lock Schedule ---
// This schedule will now be used to determine the current week automatically.
const PICKS_LOCK_SCHEDULE = [
  { week: 1, date: '2025-09-04', lockTime: '19:15' },
  { week: 2, date: '2025-09-11', lockTime: '19:15' },
  { week: 3, date: '2025-09-18', lockTime: '19:15' },
  { week: 4, date: '2025-09-25', lockTime: '19:15' },
  { week: 5, date: '2025-10-02', lockTime: '19:15' },
  { week: 6, date: '2025-10-09', lockTime: '19:15' },
  { week: 7, date: '2025-10-16', lockTime: '19:15' },
  { week: 8, date: '2025-10-23', lockTime: '19:15' },
  { week: 9, date: '2025-10-30', lockTime: '19:15' },
  { week: 10, date: '2025-11-06', lockTime: '19:15' },
  { week: 11, date: '2025-11-13', lockTime: '19:15' },
  { week: 12, date: '2025-11-20', lockTime: '19:15' },
  { week: 13, date: '2025-11-27', lockTime: '19:15' },
  { week: 14, date: '2025-12-04', lockTime: '19:15' },
  { week: 15, date: '2025-12-11', lockTime: '19:15' },
  { week: 16, date: '2025-12-18', lockTime: '19:15' },
  { week: 17, date: '2025-12-25', lockTime: '12:00' },
  { week: 18, date: '2026-01-01', lockTime: '12:00' },
];

// parseSheetData removed as we now use Yahoo Service

// --- NEW HELPER FUNCTION ---
// This function determines the current week based on the schedule.
const getInitialWeek = () => {
  const now = new Date();
  // Find the first week whose lock time is in the future.
  for (const weekSchedule of PICKS_LOCK_SCHEDULE) {
    const lockDateTime = new Date(`${weekSchedule.date}T${weekSchedule.lockTime}:00`);
    if (lockDateTime > now) {
      console.log(`Current week determined to be: Week ${weekSchedule.week}`);
      return weekSchedule.week;
    }
  }
  // If all weeks are in the past, default to the last week of the season.
  console.log(`All weeks are in the past. Defaulting to Week ${MAX_WEEKS}`);
  return MAX_WEEKS;
};

const HomeScreen = () => {
  const router = useRouter();
  const { user: loggedInUser, leagueKey } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [profileImageUri, setProfileImageUri] = useState(null);
  const [allMatchups, setAllMatchups] = useState([]);
  const [featuredMatchup, setFeaturedMatchup] = useState(null);
  const [totalUserScore, setTotalUserScore] = useState(0);
  const [leaderboardDisplayData, setLeaderboardDisplayData] = useState([]);
  const [leagueStandings, setLeagueStandings] = useState([]); // [NEW] W-L records
  const [currentWeek, setCurrentWeek] = useState(() => getInitialWeek());

  const [matchupOfTheWeek, setMatchupOfTheWeek] = useState(null);
  const [communityTrend, setCommunityTrend] = useState(null);
  const [weeklyMVP, setWeeklyMVP] = useState(null);

  const [isProcessingScore, setIsProcessingScore] = useState(false);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(true);

  // Fetch Matchups
  const fetchMatchupsFromYahoo = useCallback(async () => {
    try {
      const { getWeeklyMatchups } = require('../../src/services/yahooFantasy');
      if (!leagueKey) return [];
      // [OPTIMIZATION] Fetch ALL weeks to support MVP calculation (prev week) and current week features
      // Note: getWeeklyMatchups usually fetches one week. We might need to fetch multiple if not cached.
      // For now, let's assume we fetch Current Week for Matchup/Trends, and CurrentWeek - 1 for MVP.
      const matchups = await getWeeklyMatchups(currentWeek, leagueKey);
      return matchups;
    } catch (err) {
      console.error("Failed to fetch Yahoo matchups:", err);
      return [];
    }
  }, [currentWeek, leagueKey]);

  // Helper to fetch previous week for MVP
  const fetchPreviousWeekMatchups = useCallback(async (week) => {
    try {
      if (week <= 1) return [];
      const { getWeeklyMatchups } = require('../../src/services/yahooFantasy');
      if (!leagueKey) return [];
      return await getWeeklyMatchups(week - 1, leagueKey);
    } catch (err) { console.error("MVP Fetch Error", err); return []; }
  }, [leagueKey]);

  // [NEW] Fetch Standings
  const fetchStandingsFromYahoo = useCallback(async () => {
    try {
      const { getLeagueStandings } = require('../../src/services/yahooFantasy');
      if (!leagueKey) return [];
      const standings = await getLeagueStandings(leagueKey);
      return standings;
    } catch (err) {
      console.error("Failed to fetch Standings:", err);
      return [];
    }
  }, [leagueKey]);

  const fetchAllPicksForUser = useCallback(async (userId) => {
    if (!userId) return [];
    try {
      const picksCollectionRef = collection(db, "users", userId, "picks");
      const picksSnapshot = await getDocs(picksCollectionRef);
      let allPicks = [];
      picksSnapshot.forEach((doc) => {
        const weekPicks = doc.data();
        for (const gameUniqueID in weekPicks) {
          allPicks.push({ gameUniqueID, pickedTeamAbbr: weekPicks[gameUniqueID] });
        }
      });
      return allPicks;
    } catch (e) {
      console.error(`HomeScreen: Failed to fetch all picks for user ${userId}`, e);
      return [];
    }
  }, []);

  const calculateTotalUserScore = (matchups, picks) => {
    if (!matchups || !picks) return 0;
    let score = 0;
    matchups.forEach(matchup => {
      if (matchup.UniqueID && matchup.WinningTeam && String(matchup.WinningTeam).trim() !== '') {
        const userPickForGame = picks.find(pick => pick.gameUniqueID === matchup.UniqueID);
        const winningTeamFullName = String(matchup.WinningTeam).trim();
        let actualWinnerAbbr = null;
        if (String(matchup.HomeTeamName).trim() === winningTeamFullName) { actualWinnerAbbr = String(matchup.HomeTeamAB).trim().toUpperCase(); }
        else if (String(matchup.AwayTeamName).trim() === winningTeamFullName) { actualWinnerAbbr = String(matchup.AwayTeamAB).trim().toUpperCase(); }
        else { actualWinnerAbbr = winningTeamFullName.toUpperCase(); }
        const userPickedAbbr = userPickForGame ? String(userPickForGame.pickedTeamAbbr).trim().toUpperCase() : null;
        if (userPickForGame && actualWinnerAbbr && userPickedAbbr === actualWinnerAbbr) {
          score++;
        }
      }
    });
    return score;
  };

  const calculateAllScores = useCallback(async (matchups, allUsers, currentStandings) => {
    if (!allUsers || allUsers.length === 0) return [];

    // Pre-fetch all picks for efficiency (needed for Community Trend & MVP too)
    const allUsersPicksMap = await Promise.all(allUsers.map(async (user) => {
      const picks = await fetchAllPicksForUser(user.uid);
      return { ...user, picks };
    }));

    // [FEATURE 2] Community Trends
    const trend = calculateCommunityTrends(matchups, allUsersPicksMap);
    setCommunityTrend(trend);

    // Calculate Leaderboard Scores
    const userScoresPromises = allUsersPicksMap.map(async (user) => {
      const score = calculateTotalUserScore(matchups, user.picks);

      // Find Fantasy Record (Wins-Losses-Ties)
      // Attempt to match Firebase User Name with Yahoo Team Name or Manager Name
      // [FIX] Priority: 1. Stored Team Key, 2. Username Match, 3. Display Name Match
      const matchedTeam = currentStandings && currentStandings.find(t =>
        (user.teamKey && t.team_key === user.teamKey) ||
        (t.name && user.username && t.name.toLowerCase() === user.username.toLowerCase()) ||
        (t.name && user.name && t.name.toLowerCase() === user.name.toLowerCase())
      );

      const record = matchedTeam
        ? `${matchedTeam.wins}-${matchedTeam.losses}-${matchedTeam.ties}`
        : '-';

      return {
        id: user.uid,
        name: user.name || user.username || user.teamName || 'Unknown Player',
        score,
        avatarUri: matchedTeam?.logo_url || user.teamLogo || user.avatarUri || null,
        record: record,
        teamKey: user.teamKey,
        picks: user.picks // Keep picks for MVP
      };
    });

    const resolvedUserScores = await Promise.all(userScoresPromises);

    // [FIX] Safe sort to prevent crash (handle missing names)
    const sortedLeaderboard = resolvedUserScores.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB);
    });
    return sortedLeaderboard.map((user, index) => ({ ...user, rank: index + 1 }));
  }, [fetchAllPicksForUser]);

  const loadAllScreenData = useCallback(async () => {
    if (loggedInUser === undefined) return;

    setError(null);
    try {
      const usersCollectionRef = collection(db, "users");
      const [usersSnapshot, matchupsResult, standingsResult] = await Promise.all([
        getDocs(usersCollectionRef),
        fetchMatchupsFromYahoo(),
        fetchStandingsFromYahoo()
      ]);

      setLeagueStandings(standingsResult);

      const allUsers = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      setAllMatchups(matchupsResult);

      // [FEATURE 1] Best Matchup
      const bestMatch = determineBestMatchup(matchupsResult, standingsResult);
      setMatchupOfTheWeek(bestMatch);

      // [FEATURE 3] Weekly MVP (Previous Week)
      if (currentWeek > 1) {
        const prevWeekMatchups = await fetchPreviousWeekMatchups(currentWeek);
        if (prevWeekMatchups && prevWeekMatchups.length > 0) {
          // We need to calculate scores for EVERYONE for just that week
          // Since calculateAllScores is heavy and coupled, let's do a lightweight calc here
          // We need picks for everyone. Luckily calculateAllScores fetches them.
          // Let's defer MVP partial calc until we have picks inside calculateAllScores?
          // No, let's do it cleanly here.
          // Actually, we can just let calculateAllScores return the "full data" with picks, 
          // and then we run a quick MVP find on that data for the prev week.
        }
      }

      // Helper to find team in standings
      const findTeamInStandings = (user) => {
        return standingsResult && standingsResult.find(t =>
          (user.teamKey && t.team_key === user.teamKey) ||
          (t.name && user.username && t.name.toLowerCase() === user.username.toLowerCase()) ||
          (t.name && user.name && t.name.toLowerCase() === user.name.toLowerCase())
        );
      };

      if (loggedInUser) {
        setIsProcessingScore(true);
        const userDocRef = doc(db, "users", loggedInUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : null;

        // [FIX] Priority: 1. Live Yahoo Logo, 2. Stored TeamLogo, 3. Avatar (Deprecated)
        const myTeam = findTeamInStandings({ ...loggedInUser, ...userData });
        setProfileImageUri(myTeam?.logo_url || userData?.teamLogo || userData?.avatarUri || null);

        const userPicks = await fetchAllPicksForUser(loggedInUser.uid);
        const score = calculateTotalUserScore(matchupsResult, userPicks);
        setTotalUserScore(score);
        setIsProcessingScore(false);
      } else {
        setTotalUserScore(0);
        setProfileImageUri(null);
      }

      if (matchupsResult.length > 0 || allUsers.length > 0) {
        setIsLoadingLeaderboard(true);
        // Pass standings to calculation
        const leaderboard = await calculateAllScores(matchupsResult, allUsers, standingsResult);
        setLeaderboardDisplayData(leaderboard.slice(0, 12));

        // [FEATURE 3 CONTINUED] MVP Calculation using the fetched pick data from leaderboard
        if (currentWeek > 1) {
          const prevWeekMatchups = await fetchPreviousWeekMatchups(currentWeek);
          if (prevWeekMatchups && prevWeekMatchups.length > 0) {
            // Calculate score for each user for PREV week
            let bestScore = -1;
            let mvpUser = null;

            leaderboard.forEach(user => {
              // user.picks contains ALL picks. filter for prev week matchups?
              // actually calculateTotalUserScore handles matching by UniqueID.
              // So if we pass prevWeekMatchups, it works!
              const weekScore = calculateTotalUserScore(prevWeekMatchups, user.picks);
              if (weekScore > bestScore) {
                bestScore = weekScore;
                mvpUser = { ...user, weeklyScore: weekScore };
              }
            });
            setWeeklyMVP(mvpUser);
          }
        }

        setIsLoadingLeaderboard(false);
      } else {
        setLeaderboardDisplayData([]);
        setIsLoadingLeaderboard(false);
      }
    } catch (e) {
      console.error("HomeScreen: Error in loadAllScreenData:", e);
      setError("Failed to load data.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [loggedInUser, fetchMatchupsFromYahoo, fetchPreviousWeekMatchups, fetchStandingsFromYahoo, fetchAllPicksForUser, calculateAllScores]);

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        await loadAllScreenData();
      };


      if (!leagueKey && loggedInUser) {
        console.log('HomeScreen: Missing League Key, redirecting to setup...');
        router.replace('/appGroup/leagueSetup');
        return;
      }

      fetchData();

      return () => {
        // Optional cleanup function
      };
    }, [loadAllScreenData, leagueKey, loggedInUser])
  );

  useEffect(() => {
    if (allMatchups.length > 0) {
      const currentWeekMatchups = allMatchups.filter(m => m.Week === currentWeek);
      if (currentWeekMatchups.length > 0) {
        const featured = currentWeekMatchups.reduce((highestScoring, currentMatchup) => {
          const highestCombinedScore = (highestScoring.HomeTeamProjectedPoints || 0) + (highestScoring.AwayTeamProjectedPoints || 0);
          const currentCombinedScore = (currentMatchup.HomeTeamProjectedPoints || 0) + (currentMatchup.AwayTeamProjectedPoints || 0);
          return currentCombinedScore > highestCombinedScore ? currentMatchup : highestScoring;
        }, currentWeekMatchups[0]);
        setFeaturedMatchup(featured);
      } else {
        setFeaturedMatchup(null);
      }
    } else {
      setFeaturedMatchup(null);
    }
  }, [currentWeek, allMatchups]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAllScreenData();
  }, [loadAllScreenData]);

  const handleNavigateToMakePicks = () => router.push({ pathname: '/appGroup/makepicks', params: { week: currentWeek } });
  const navigateToProfile = () => router.push('/appGroup/profile');

  // --- NEW LOGIC: MATCHUP OF THE WEEK (High Stakes) ---
  const determineBestMatchup = (weekMatchups, standings) => {
    if (!weekMatchups?.length || !standings?.length) return null;

    // Calculate "Hype Score" based on team records
    const scoredMatchups = weekMatchups.map(m => {
      const homeTeam = standings.find(s => s.team_key === m.HomeTeamKey);
      const awayTeam = standings.find(s => s.team_key === m.AwayTeamKey);

      const homeWins = homeTeam?.wins || 0;
      const awayWins = awayTeam?.wins || 0;

      // Hype = Combined Wins + (Projected Points / 100 for tiebreaking)
      const hypeScore = (homeWins + awayWins) + ((Number(m.HomeTeamProjectedPoints) + Number(m.AwayTeamProjectedPoints)) / 200);
      return { ...m, hypeScore, homeRecord: homeTeam?.record, awayRecord: awayTeam?.record };
    });

    return scoredMatchups.sort((a, b) => b.hypeScore - a.hypeScore)[0];
  };

  // --- NEW LOGIC: COMMUNITY TRENDS (The Lock) ---
  const calculateCommunityTrends = (weekMatchups, allUserPicks) => {
    if (!weekMatchups?.length || !allUserPicks?.length) return null;

    let gameVotes = {}; // { gameID: { homeVotes: 0, awayVotes: 0, total: 0 } }

    allUserPicks.forEach(user => {
      user.picks.forEach(pick => {
        const game = weekMatchups.find(m => m.UniqueID === pick.gameUniqueID);
        if (game) {
          if (!gameVotes[game.UniqueID]) gameVotes[game.UniqueID] = { ...game, homeVotes: 0, awayVotes: 0, total: 0 };

          const pickedAbbr = String(pick.pickedTeamAbbr).trim().toUpperCase();
          const homeAbbr = String(game.HomeTeamAB).trim().toUpperCase();
          const awayAbbr = String(game.AwayTeamAB).trim().toUpperCase();

          if (pickedAbbr === homeAbbr) gameVotes[game.UniqueID].homeVotes++;
          if (pickedAbbr === awayAbbr) gameVotes[game.UniqueID].awayVotes++;
          gameVotes[game.UniqueID].total++;
        }
      });
    });

    // Find most lopsided game
    let topTrend = null;
    let maxPercentage = 0;

    Object.values(gameVotes).forEach(g => {
      if (g.total < 3) return; // Need minimum quorum
      const homePct = g.homeVotes / g.total;
      const awayPct = g.awayVotes / g.total;

      const gameMax = Math.max(homePct, awayPct);
      if (gameMax > maxPercentage) {
        maxPercentage = gameMax;
        topTrend = {
          ...g,
          pickedTeam: homePct > awayPct ? g.HomeTeamName : g.AwayTeamName,
          pickedTeamAbbr: homePct > awayPct ? g.HomeTeamAB : g.AwayTeamAB,
          percentage: Math.round(gameMax * 100)
        };
      }
    });

    return topTrend;
  };

  // --- NEW LOGIC: WEEKLY MVP (Previous Week) ---
  const calculateWeeklyMVP = (statsByWeek) => {
    // Find highest score in the previous completed week
    // Simplified: We need picking data per week. 
    // Current architecture fetches ALL picks. We can filter by week if we have weekly matchups?
    // Yes, allMatchups contains all weeks.
    return null; // Placeholder to implement inside loadAllScreenData properly
  };

  const podiumUsers = leaderboardDisplayData.slice(0, 3);
  const listUsers = leaderboardDisplayData.slice(3);

  if (isLoading && !refreshing) {
    return (
      <View style={[homeScreenStyles.container, homeScreenStyles.centered]}>
        <ActivityIndicator size="large" color={SECONDARY_COLOR} />
        <Text style={{ color: TEXT_COLOR_MAIN, marginTop: 10 }}>Loading Season Data...</Text>
      </View>
    );
  }

  return (
    <View style={homeScreenStyles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
      <ScrollView
        style={homeScreenStyles.scrollView}
        contentContainerStyle={homeScreenStyles.scrollViewContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SECONDARY_COLOR} />}
      >
        {/* HEADER SECTION */}
        <View style={homeScreenStyles.headerContainer}>
          <TouchableOpacity onPress={navigateToProfile}>
            {profileImageUri ? (
              <Image source={{ uri: profileImageUri }} style={homeScreenStyles.headerAvatar} />
            ) : (
              <View style={homeScreenStyles.headerAvatarPlaceholder}>
                <Ionicons name="person" size={24} color={PRIMARY_COLOR} />
              </View>
            )}
          </TouchableOpacity>

          <View style={homeScreenStyles.headerTextContainer}>
            <Text style={homeScreenStyles.welcomeLabel}>WELCOME BACK,</Text>
            <Text style={homeScreenStyles.usernameText}>
              {loggedInUser?.teamName || loggedInUser?.name || loggedInUser?.username || "Player"}
            </Text>
            <Text style={homeScreenStyles.weekSubText}>Week {currentWeek} • Season 2025</Text>
          </View>
        </View>

        {/* WEEK NAV & SCORE CARD */}
        <View style={homeScreenStyles.statsRow}>
          {/* Week Nav */}
          <View style={homeScreenStyles.weekNavCard}>
            <TouchableOpacity
              onPress={() => setCurrentWeek(prev => Math.max(1, prev - 1))}
              disabled={currentWeek === 1}
            >
              <Ionicons name="chevron-back" size={24} color={currentWeek === 1 ? '#555' : SECONDARY_COLOR} />
            </TouchableOpacity>

            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: TEXT_COLOR_SUB, fontSize: 10, fontWeight: 'bold' }}>CURRENT WEEK</Text>
              <Text style={{ color: TEXT_COLOR_MAIN, fontSize: 24, fontWeight: 'bold' }}>{currentWeek}</Text>
            </View>

            <TouchableOpacity
              onPress={() => setCurrentWeek(prev => prev + 1)}
              disabled={currentWeek >= MAX_WEEKS}
            >
              <Ionicons name="chevron-forward" size={24} color={currentWeek >= MAX_WEEKS ? '#555' : SECONDARY_COLOR} />
            </TouchableOpacity>
          </View>

          {/* User Score */}
          <View style={homeScreenStyles.scoreCard}>
            <Text style={{ color: TEXT_COLOR_SUB, fontSize: 10, fontWeight: 'bold' }}>POINTS CORRECT</Text>
            <Text style={{ color: ACCENT_COLOR, fontSize: 28, fontWeight: 'bold' }}>{totalUserScore}</Text>
          </View>
        </View>

        {/* ACTION BUTTON */}
        <TouchableOpacity style={homeScreenStyles.actionButton} onPress={handleNavigateToMakePicks}>
          <View>
            <Text style={homeScreenStyles.actionTitle}>MAKE PICKS</Text>
            <Text style={homeScreenStyles.actionSubtitle}>Lock: Thursday 7:15 PM CT</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={32} color={PRIMARY_COLOR} />
        </TouchableOpacity>

        {/* SHOWCASE SECTION (New Features) */}
        <View style={homeScreenStyles.showcaseSection}>
          {/* 1. WEEKLY MVP */}
          {weeklyMVP ? (
            <View style={homeScreenStyles.mvpCard}>
              <View style={homeScreenStyles.mvpHeader}>
                <Ionicons name="trophy" size={16} color={GOLD_COLOR} />
                <Text style={homeScreenStyles.mvpLabel}>WEEK {currentWeek > 1 ? currentWeek - 1 : 1} MVP</Text>
                <Ionicons name="trophy" size={16} color={GOLD_COLOR} />
              </View>
              <View style={homeScreenStyles.mvpContent}>
                <Image source={{ uri: weeklyMVP.avatarUri }} style={homeScreenStyles.mvpAvatar} />
                <View>
                  <Text style={homeScreenStyles.mvpName}>{weeklyMVP.name}</Text>
                  <Text style={homeScreenStyles.mvpScore}>{weeklyMVP.weeklyScore} PTS</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={[homeScreenStyles.mvpCard, { opacity: 0.5 }]}>
              <View style={homeScreenStyles.mvpHeader}><Text style={homeScreenStyles.mvpLabel}>WEEKLY MVP</Text></View>
              <View style={{ alignItems: 'center' }}><Text style={{ color: TEXT_COLOR_SUB, fontStyle: 'italic' }}>Winner revealed next week</Text></View>
            </View>
          )}

          {/* 2. MATCHUP OF THE WEEK */}
          {matchupOfTheWeek ? (
            <View style={homeScreenStyles.featuredCard}>
              <View style={homeScreenStyles.featuredHeader}>
                <Text style={homeScreenStyles.featuredLabel}>🔥 MATCHUP OF THE WEEK</Text>
              </View>
              <View style={homeScreenStyles.matchupRow}>
                <View style={homeScreenStyles.teamColumn}>
                  <Text style={homeScreenStyles.teamRecord}>{matchupOfTheWeek.awayRecord}</Text>
                  <Text style={homeScreenStyles.teamAbbrBig}>{matchupOfTheWeek.AwayTeamAB}</Text>
                </View>
                <View style={homeScreenStyles.vsColumn}>
                  <Text style={homeScreenStyles.vsText}>VS</Text>
                </View>
                <View style={homeScreenStyles.teamColumn}>
                  <Text style={homeScreenStyles.teamRecord}>{matchupOfTheWeek.homeRecord}</Text>
                  <Text style={homeScreenStyles.teamAbbrBig}>{matchupOfTheWeek.HomeTeamAB}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={[homeScreenStyles.featuredCard, { justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={homeScreenStyles.featuredLabel}>🔥 MATCHUP OF THE WEEK</Text>
              <Text style={{ color: TEXT_COLOR_SUB, fontStyle: 'italic', marginTop: 5 }}>No matchups scheduled</Text>
            </View>
          )}

          {/* 3. COMMUNITY TREND (THE LOCK) */}
          {communityTrend ? (
            <View style={homeScreenStyles.trendCard}>
              <View style={homeScreenStyles.trendHeader}>
                <Ionicons name="analytics" size={14} color={SECONDARY_COLOR} />
                <Text style={homeScreenStyles.trendLabel}>COMMUNITY "LOCK"</Text>
              </View>
              <View style={homeScreenStyles.trendContent}>
                <Text style={homeScreenStyles.trendText}>
                  <Text style={{ fontWeight: 'bold', color: ACCENT_COLOR }}>{communityTrend.percentage}%</Text> picked {communityTrend.pickedTeamAbbr}
                </Text>
                <View style={homeScreenStyles.progressBarBg}>
                  <View style={[homeScreenStyles.progressBarFill, { width: `${communityTrend.percentage}%` }]} />
                </View>
                <Text style={homeScreenStyles.trendVs}>vs {communityTrend.pickedTeamAbbr === communityTrend.HomeTeamAB ? communityTrend.AwayTeamAB : communityTrend.HomeTeamAB}</Text>
              </View>
            </View>
          ) : (
            <View style={[homeScreenStyles.trendCard, { justifyContent: 'center', alignItems: 'center' }]}>
              <View style={homeScreenStyles.trendHeader}>
                <Ionicons name="analytics" size={14} color={SECONDARY_COLOR} />
                <Text style={homeScreenStyles.trendLabel}>COMMUNITY "LOCK"</Text>
              </View>
              <Text style={{ color: TEXT_COLOR_SUB, fontStyle: 'italic' }}>Making picks...</Text>
            </View>
          )}
        </View>



        {/* LEADERBOARD SECTION */}
        <View style={homeScreenStyles.leaderboardContainer}>
          <Text style={homeScreenStyles.sectionTitle}>🏆 LEADERBOARD</Text>

          {leaderboardDisplayData.length === 0 ? (
            <Text style={homeScreenStyles.noDataText}>No data yet. Season starts soon!</Text>
          ) : (
            <>
              {/* PODIUM */}
              <View style={homeScreenStyles.podiumContainer}>
                {/* 2nd Place */}
                {podiumUsers[1] && <PodiumItem user={podiumUsers[1]} place={2} color={SILVER_COLOR} />}
                {/* 1st Place */}
                {podiumUsers[0] && <PodiumItem user={podiumUsers[0]} place={1} color={GOLD_COLOR} />}
                {/* 3rd Place */}
                {podiumUsers[2] && <PodiumItem user={podiumUsers[2]} place={3} color={BRONZE_COLOR} />}
              </View>

              {/* LIST */}
              <View style={homeScreenStyles.listContainer}>
                {listUsers.map((user) => (
                  <View key={user.id} style={homeScreenStyles.listItem}>
                    <Text style={homeScreenStyles.listRank}>{user.rank}</Text>
                    <Image
                      source={user.avatarUri ? { uri: user.avatarUri } : null}
                      style={homeScreenStyles.listAvatar}
                      defaultSource={null}
                    />
                    {!user.avatarUri && <View style={[homeScreenStyles.listAvatar, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}><Ionicons name="person" color="#555" size={16} /></View>}

                    <View style={homeScreenStyles.listInfo}>
                      <Text style={homeScreenStyles.listName} numberOfLines={1}>{user.name}</Text>
                      <Text style={homeScreenStyles.listRecord}>Record: {user.record}</Text>
                    </View>
                    <Text style={homeScreenStyles.listScore}>{user.score} pts</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

// --- SUB-COMPONENTS ---
const PodiumItem = ({ user, place, color }) => {
  const isFirst = place === 1;
  return (
    <View style={[homeScreenStyles.podiumItem, isFirst && { marginTop: 0, paddingBottom: 20 }]}>
      <View style={[homeScreenStyles.podiumAvatarValues, { borderColor: color }]}>
        {user.avatarUri ?
          <Image source={{ uri: user.avatarUri }} style={{ width: '100%', height: '100%', borderRadius: 100 }} />
          : <Ionicons name="person" size={isFirst ? 30 : 20} color="#555" />
        }
      </View>
      <View style={[homeScreenStyles.rankBadge, { backgroundColor: color }]}>
        <Text style={{ color: '#000', fontSize: 10, fontWeight: 'bold' }}>{place}</Text>
      </View>
      <Text style={homeScreenStyles.podiumName} numberOfLines={1}>{user.name}</Text>
      <Text style={homeScreenStyles.podiumScore}>{user.score} pts</Text>
      <Text style={homeScreenStyles.podiumRecord}>{user.record}</Text>
    </View>
  )
}

const homeScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY_COLOR,
  },
  centered: { justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollViewContent: { padding: 20, paddingTop: 40 }, // Header spacing

  // Header
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
  },
  headerAvatar: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: SECONDARY_COLOR,
  },
  headerAvatarPlaceholder: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: CARD_BACKGROUND,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: SECONDARY_COLOR,
  },
  headerTextContainer: { marginLeft: 15 },
  welcomeLabel: { color: TEXT_COLOR_SUB, fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  usernameText: { color: TEXT_COLOR_MAIN, fontSize: 22, fontWeight: 'bold' },
  weekSubText: { color: ACCENT_COLOR, fontSize: 14, marginTop: 2 },

  // Stats Row
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  weekNavCard: {
    flex: 1, marginRight: 10, backgroundColor: CARD_BACKGROUND, borderRadius: 12,
    padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  scoreCard: {
    flex: 0.8, backgroundColor: CARD_BACKGROUND, borderRadius: 12,
    padding: 15, justifyContent: 'center', alignItems: 'center'
  },

  // Action Button
  actionButton: {
    backgroundColor: SECONDARY_COLOR, borderRadius: 16, padding: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 30, shadowColor: SECONDARY_COLOR, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8
  },
  actionTitle: { color: PRIMARY_COLOR, fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  actionSubtitle: { color: PRIMARY_COLOR, fontSize: 12, opacity: 0.8 },

  // Leaderboard
  leaderboardContainer: { marginBottom: 20 },
  sectionTitle: { color: TEXT_COLOR_MAIN, fontSize: 18, fontWeight: 'bold', marginBottom: 15, letterSpacing: 1 },
  noDataText: { color: TEXT_COLOR_SUB, textAlign: 'center', fontStyle: 'italic', marginTop: 10 },

  // Podium
  podiumContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginBottom: 20, height: 180 },
  podiumItem: { width: '30%', alignItems: 'center', marginHorizontal: 5 },
  podiumAvatarValues: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 3,
    backgroundColor: CARD_BACKGROUND, justifyContent: 'center', alignItems: 'center', marginBottom: -10, zIndex: 1
  },
  rankBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginBottom: 8, zIndex: 2 },
  podiumName: { color: TEXT_COLOR_MAIN, fontWeight: 'bold', fontSize: 12, marginBottom: 2 },
  podiumScore: { color: SECONDARY_COLOR, fontWeight: 'bold', fontSize: 14 },
  podiumRecord: { color: TEXT_COLOR_SUB, fontSize: 10 },

  // List
  listContainer: { backgroundColor: CARD_BACKGROUND, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 10 },
  listItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)'
  },
  listRank: { color: TEXT_COLOR_SUB, width: 25, fontWeight: 'bold' },
  listAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 12, backgroundColor: '#333' },
  listInfo: { flex: 1 },
  listName: { color: TEXT_COLOR_MAIN, fontWeight: '600', fontSize: 14 },
  listRecord: { color: TEXT_COLOR_SUB, fontSize: 11 },
  listScore: { color: ACCENT_COLOR, fontWeight: 'bold', fontSize: 15 },

  // Featured (Legacy / Updated)
  featuredCard: {
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.3)', // Red tint for matchup
  },

  // Showcase Features
  showcaseSection: {
    marginVertical: 15,
    gap: 10,
  },
  mvpCard: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)', // Gold tint
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_COLOR,
    padding: 10,
    flexDirection: 'column',
  },
  mvpHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    gap: 5,
  },
  mvpLabel: {
    color: GOLD_COLOR,
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  mvpContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 15,
  },
  mvpAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: GOLD_COLOR,
  },
  mvpName: {
    color: TEXT_COLOR_MAIN,
    fontWeight: 'bold',
    fontSize: 16,
  },
  mvpScore: {
    color: TEXT_COLOR_SUB,
    fontSize: 12,
  },

  matchupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 5,
  },
  teamColumn: {
    alignItems: 'center',
    flex: 1,
  },
  vsColumn: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: {
    color: ACCENT_COLOR,
    fontWeight: 'bold',
    fontSize: 18,
  },
  teamAbbrBig: {
    color: TEXT_COLOR_MAIN,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  teamRecord: {
    color: TEXT_COLOR_SUB,
    fontSize: 10,
    marginBottom: 2,
  },
  featuredLabel: {
    color: '#FF5252',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 5,
  },

  trendCard: {
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  trendLabel: {
    color: SECONDARY_COLOR,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  trendContent: {
    gap: 5,
  },
  trendText: {
    color: TEXT_COLOR_MAIN,
    fontSize: 14,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: ACCENT_COLOR,
  },
  trendVs: {
    color: TEXT_COLOR_SUB,
    fontSize: 10,
    fontStyle: 'italic',
    alignSelf: 'flex-end',
  },

  // Legacy / Misc
  teamAbbr: { color: TEXT_COLOR_MAIN, fontWeight: 'bold', fontSize: 16 },
  projPoints: { color: TEXT_COLOR_SUB, fontSize: 12 }
});

export default HomeScreen;