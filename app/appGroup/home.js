// app/(app)/home/index.js (Previously HomeScreen.js)
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
  Button,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useRouter, Link, useFocusEffect } from 'expo-router';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { useAuth } from '../../src/context/AuthContext';
import { db } from '../../src/config/firebase'; // Adjust this path if needed

const ArrowRightIcon = () => <Text style={{ color: 'white', fontSize: 16 }}>GAME ON! ➤</Text>;

// Colors
const PRIMARY_COLOR = '#1f366a';
const SECONDARY_COLOR = 'green';
const ACCENT_COLOR = '#FF9800';
const HEADER_ICON_COLOR = '#FFFFFF';
const TEXT_COLOR_DARK = '#333333';
const TEXT_COLOR_LIGHT = '#FFFFFF';
const GOLD_COLOR = '#FFC107'; // Brighter Gold
const SILVER_COLOR = '#C0C0C0';
const BRONZE_COLOR = '#CD7F32'; // Standard Bronze
const CARD_BACKGROUND = '#FFFFFF';
const BORDER_COLOR = '#E0E0E0';
const PODIUM_TEXT_COLOR = '#424242'; // Dark grey for podium text

// --- Configuration for Yahoo Fantasy API ---
// Removed Google Sheets Config
// const SPREADSHEET_ID = '...';
// const SHEET_NAME_AND_RANGE = '...';
const MAX_WEEKS = 18; // Define the maximum week number

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
  const { user: loggedInUser } = useAuth(); // Get user from context

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [profileImageUri, setProfileImageUri] = useState(null); // State for profile image
  const [allMatchups, setAllMatchups] = useState([]);
  const [featuredMatchup, setFeaturedMatchup] = useState(null);
  const [totalUserScore, setTotalUserScore] = useState(0);
  const [leaderboardDisplayData, setLeaderboardDisplayData] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(() => getInitialWeek());

  const [isProcessingScore, setIsProcessingScore] = useState(false);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(true);


  // Helper functions are defined outside the data loading flow.
  // Helper functions are defined outside the data loading flow.
  const fetchMatchupsFromYahoo = useCallback(async () => {
    try {
      const { getWeeklyMatchups } = require('../../src/services/yahooFantasy');
      // Fetch ALL matchups? Or just current week?
      // The original app fetched ALL rows from the sheet (A:N).
      // Yahoo API is week-based.
      // For the home screen, we need "current week" mostly, but "stats" needs all.
      // Leaderboard needs "all past weeks".

      // This is tricky. Yahoo API doesn't give "all season matchups" in one call easily.
      // We might need to fetch current week for display.
      // For Leaderboard (total score), we technically need all past weeks results.

      // For MVP/first pass: Fetch CURRENT week for display.
      // Leaderboard calculation might be incorrect if we don't have all data.
      // Let's assume for now we just show Week 1-18 logic if we can iterate, 
      // OR just fetch 'current' week to unblock the UI.

      const matchups = await getWeeklyMatchups(currentWeek);
      return matchups;
    } catch (err) {
      console.error("Failed to fetch Yahoo matchups:", err);
      throw err;
    }
  }, [currentWeek]);

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

  const calculateAllScores = useCallback(async (matchups, allUsers) => {
    if (!allUsers || allUsers.length === 0) return [];
    const userScoresPromises = allUsers.map(async (user) => {
      const userPicks = await fetchAllPicksForUser(user.uid);
      const score = calculateTotalUserScore(matchups, userPicks);
      return { id: user.uid, name: user.name || user.username, score, avatarUri: user.avatarUri || null };
    });

    const resolvedUserScores = await Promise.all(userScoresPromises);
    const sortedLeaderboard = resolvedUserScores.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return sortedLeaderboard.map((user, index) => ({ ...user, rank: index + 1 }));
  }, [fetchAllPicksForUser]);

  const loadAllScreenData = useCallback(async () => {
    if (loggedInUser === undefined) return;

    console.log("HomeScreen: Starting data load...");
    setIsLoading(true);
    setError(null);
    try {
      const usersCollectionRef = collection(db, "users");
      const [usersSnapshot, matchupsResult] = await Promise.all([
        getDocs(usersCollectionRef),
        fetchMatchupsFromYahoo()
      ]);

      const allUsers = usersSnapshot.docs.map(doc => doc.data());
      setAllMatchups(matchupsResult);


      if (loggedInUser) {
        setIsProcessingScore(true);
        const userDocRef = doc(db, "users", loggedInUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : null;

        console.log("Avatar URI:", userData?.avatarUri);
        setProfileImageUri(userData?.avatarUri || null);

        const userPicks = await fetchAllPicksForUser(loggedInUser.uid);
        const score = calculateTotalUserScore(matchupsResult, userPicks);
        setTotalUserScore(score);
        setIsProcessingScore(false);
      } else {
        setTotalUserScore(0);
        setProfileImageUri(null);
      }

      if (matchupsResult.length > 0) {
        setIsLoadingLeaderboard(true);
        const leaderboard = await calculateAllScores(matchupsResult, allUsers);
        setLeaderboardDisplayData(leaderboard.slice(0, 12));
        setIsLoadingLeaderboard(false);
      } else {
        setLeaderboardDisplayData([]);
        setIsLoadingLeaderboard(false);
      }
    } catch (e) {
      console.error("HomeScreen: Error in loadAllScreenData:", e);
      setError("Failed to load screen data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [loggedInUser, fetchMatchupsFromYahoo, fetchAllPicksForUser, calculateAllScores]);

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        await loadAllScreenData();
      };

      fetchData();

      return () => {
        // Optional cleanup function
      };
    }, [loadAllScreenData])
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

  const handleNavigateToMakePicks = () => {
    const path = '/appGroup/makepicks';
    console.log(`HomeScreen: Navigating to MakePicks, path: ${path}, params: week ${currentWeek}`);
    router.push({ pathname: path, params: { week: currentWeek } });
  };

  const navigateToSettings = () => {
    const path = '/appGroup/settings';
    console.log(`HomeScreen: Navigating to Settings, path: ${path}`);
    router.push(path);
  };

  const navigateToProfile = () => {
    const path = '/appGroup/profile';
    console.log(`HomeScreen: Navigating to Profile, path: ${path}`);
    router.push(path);
  };

  const getRankStyle = (rank) => {
    if (rank === 1) return homeScreenStyles.rankGold;
    if (rank === 2) return homeScreenStyles.rankSilver;
    if (rank === 3) return homeScreenStyles.rankBronze;
    return null;
  };
  const renderRankIcon = (rank) => {
    if (rank === 1) return <Ionicons name="trophy" size={18} color={GOLD_COLOR} style={homeScreenStyles.leaderboardRankIcon} />;
    if (rank === 2) return <Ionicons name="trophy" size={16} color={SILVER_COLOR} style={homeScreenStyles.leaderboardRankIcon} />;
    if (rank === 3) return <Ionicons name="trophy" size={14} color={BRONZE_COLOR} style={homeScreenStyles.leaderboardRankIcon} />;
    return <Text style={homeScreenStyles.leaderboardRankNumber}>{rank}</Text>;
  };

  // Prepare data for podium and list
  const podiumUsers = leaderboardDisplayData.slice(0, 3); // Top 3
  const listUsers = leaderboardDisplayData.slice(3);    // Ranks 4-12

  if (isLoading) { return <View style={homeScreenStyles.centeredFull}><ActivityIndicator size="large" color={PRIMARY_COLOR} /><Text style={homeScreenStyles.loadingText}>Loading Home...</Text></View>; }
  if (error) { return <View style={homeScreenStyles.centeredFull}><Text style={homeScreenStyles.errorText}>{error}</Text><Button title="Retry" onPress={loadAllScreenData} /></View>; }

  return (
    <View style={homeScreenStyles.container}>
      <ScrollView style={homeScreenStyles.scrollView} contentContainerStyle={homeScreenStyles.scrollViewContent}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginBottom: 10 }}>
          <TouchableOpacity onPress={navigateToProfile}>
            {profileImageUri ? (
              <Image source={{ uri: profileImageUri }} style={homeScreenStyles.welcomeAvatar} />
            ) : (
              <View style={homeScreenStyles.welcomeAvatarPlaceholder}>
                <Ionicons name="person-outline" size={24} color={PRIMARY_COLOR} />
              </View>
            )}
          </TouchableOpacity>

          <View style={{ marginLeft: 10, alignItems: 'center' }}>
            <Text style={homeScreenStyles.welcomeText}>
              WELCOME BACK,
            </Text>
            <Text style={homeScreenStyles.welcomeText}>
              {loggedInUser?.name || loggedInUser?.username || "User"}!
            </Text>
            <Text style={homeScreenStyles.subHeaderText}>
              Week {currentWeek}. Time to make your picks!
            </Text>
          </View>
        </View>


        <View style={homeScreenStyles.weekNavigation}>
          <TouchableOpacity
            style={[homeScreenStyles.weekNavButton, (currentWeek === 1 || isLoading) && homeScreenStyles.weekNavButtonDisabled]}
            onPress={() => setCurrentWeek(prev => Math.max(1, prev - 1))}
            disabled={currentWeek === 1 || isLoading}
          >
            <Ionicons name="chevron-back-outline" size={18} color={TEXT_COLOR_LIGHT} />
            <Text style={homeScreenStyles.weekNavButtonText}>Prev</Text>
          </TouchableOpacity>

          <Text style={homeScreenStyles.weekIndicatorText}>Week {currentWeek}</Text>

          <TouchableOpacity
            style={[homeScreenStyles.weekNavButton, (currentWeek >= MAX_WEEKS || isLoading) && homeScreenStyles.weekNavButtonDisabled]}
            onPress={() => setCurrentWeek(prev => prev + 1)}
            disabled={currentWeek >= MAX_WEEKS || isLoading}
          >
            <Text style={homeScreenStyles.weekNavButtonText}>Next</Text>
            <Ionicons name="chevron-forward-outline" size={18} color={TEXT_COLOR_LIGHT} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={homeScreenStyles.actionCard} onPress={handleNavigateToMakePicks}>
          <View>
            <Text style={homeScreenStyles.actionCardTitle}>Make Your Picks for Week {currentWeek}</Text>
            <Text style={homeScreenStyles.actionCardSubtitle}>Picks lock every Thursday at 7:15 PM CT</Text>
          </View>
          <ArrowRightIcon />
        </TouchableOpacity>

        <View style={homeScreenStyles.summaryCard}>
          <Text style={homeScreenStyles.summaryCardTitle}>Your Current Score</Text>
          {isProcessingScore ? (
            <ActivityIndicator size="small" color={PRIMARY_COLOR} />
          ) : (
            <Text style={homeScreenStyles.summaryCardScore}>{totalUserScore} pts</Text>
          )}
        </View>

        {featuredMatchup ? (
          <View style={homeScreenStyles.featuredMatchupContainer}>
            <Text style={homeScreenStyles.sectionTitle}>⭐ Featured Matchup This Week</Text>
            <View style={homeScreenStyles.matchupCard}>
              <View style={homeScreenStyles.teamDisplay}>
                <View style={[homeScreenStyles.teamLogoCircle, { backgroundColor: '#007ACC' }]}>
                  <Text style={homeScreenStyles.teamLogoText}>{featuredMatchup.AwayTeamAB || 'N/A'}</Text>
                </View>
                <Text style={homeScreenStyles.teamName}>{featuredMatchup.AwayTeamName || 'Away Team'}</Text>
                <Text style={homeScreenStyles.teamProjected}>
                  {(featuredMatchup.AwayTeamProjectedPoints !== undefined ? Number(featuredMatchup.AwayTeamProjectedPoints).toFixed(1) : '0.0')} Proj.
                </Text>
              </View>
              <Text style={homeScreenStyles.vsText}>VS</Text>
              <View style={homeScreenStyles.teamDisplay}>
                <View style={[homeScreenStyles.teamLogoCircle, { backgroundColor: '#D32F2F' }]}>
                  <Text style={homeScreenStyles.teamLogoText}>{featuredMatchup.HomeTeamAB || 'N/A'}</Text>
                </View>
                <Text style={homeScreenStyles.teamName}>{featuredMatchup.HomeTeamName || 'Home Team'}</Text>
                <Text style={homeScreenStyles.teamProjected}>
                  {(featuredMatchup.HomeTeamProjectedPoints !== undefined ? Number(featuredMatchup.HomeTeamProjectedPoints).toFixed(1) : '0.0')} Proj.
                </Text>
              </View>
            </View>
          </View>
        ) : (
          allMatchups.length > 0 &&
          <View style={homeScreenStyles.featuredMatchupContainer}>
            <Text style={homeScreenStyles.sectionTitle}>No matchups found for Week {currentWeek}.</Text>
          </View>
        )}

        {/* Mini Leaderboard Section - NEW PODIUM STYLE */}
        <View style={homeScreenStyles.leaderboardSectionCard}>
          <Text style={homeScreenStyles.leaderboardSectionTitle}>🏆 Pick'em Standings 🏆</Text>
          {isLoadingLeaderboard ? (
            <ActivityIndicator size="large" color={PRIMARY_COLOR} style={{ marginVertical: 30 }} />
          ) : leaderboardDisplayData.length > 0 ? (
            <>
              {/* Podium for Top 3 */}
              <View style={homeScreenStyles.podiumContainer}>
                {/* 2nd Place */}
                {podiumUsers[1] && (
                  <View style={[homeScreenStyles.podiumSpot, homeScreenStyles.podiumSecond]}>
                    <Link href={{ pathname: '/appGroup/profile', params: { userId: podiumUsers[1].id } }} asChild>
                      <TouchableOpacity>
                        <View style={[homeScreenStyles.podiumAvatarContainer, homeScreenStyles.podiumAvatarSilver]}>
                          {podiumUsers[1].avatarUri ? (
                            <Image source={{ uri: podiumUsers[1].avatarUri }} style={homeScreenStyles.leaderboardAvatarImage} />
                          ) : (
                            <Ionicons name="american-football" size={30} color={TEXT_COLOR_DARK} />
                          )}
                        </View>
                      </TouchableOpacity>
                    </Link>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={homeScreenStyles.podiumName}>{podiumUsers[1].name}</Text>
                    <Text style={homeScreenStyles.podiumScore}>{podiumUsers[1].score} pts</Text>
                    <View style={homeScreenStyles.rankBadgeSilver}><Text style={homeScreenStyles.rankBadgeText}>2nd</Text></View>
                  </View>
                )}
                {/* 1st Place */}
                {podiumUsers[0] && (
                  <View style={[homeScreenStyles.podiumSpot, homeScreenStyles.podiumFirst]}>
                    <Link href={{ pathname: '/appGroup/profile', params: { userId: podiumUsers[0].id } }} asChild>
                      <TouchableOpacity>
                        <View style={[homeScreenStyles.podiumAvatarContainer, homeScreenStyles.podiumAvatarGold]}>
                          {podiumUsers[0].avatarUri ? (
                            <Image source={{ uri: podiumUsers[0].avatarUri }} style={homeScreenStyles.leaderboardAvatarImage} />
                          ) : (
                            <Ionicons name="american-football" size={40} color={TEXT_COLOR_DARK} />
                          )}
                        </View>
                      </TouchableOpacity>
                    </Link>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={homeScreenStyles.podiumName}>{podiumUsers[0].name}</Text>
                    <Text style={homeScreenStyles.podiumScore}>{podiumUsers[0].score} pts</Text>
                    <Ionicons name="trophy" size={30} color={GOLD_COLOR} style={{ marginTop: 5 }} />
                  </View>
                )}
                {/* 3rd Place */}
                {podiumUsers[2] && (
                  <View style={[homeScreenStyles.podiumSpot, homeScreenStyles.podiumThird]}>
                    <Link href={{ pathname: '/appGroup/profile', params: { userId: podiumUsers[2].id } }} asChild>
                      <TouchableOpacity>
                        <View style={[homeScreenStyles.podiumAvatarContainer, homeScreenStyles.podiumAvatarBronze]}>
                          {podiumUsers[2].avatarUri ? (
                            <Image source={{ uri: podiumUsers[2].avatarUri }} style={homeScreenStyles.leaderboardAvatarImage} />
                          ) : (
                            <Ionicons name="american-football" size={28} color={TEXT_COLOR_DARK} />
                          )}
                        </View>
                      </TouchableOpacity>
                    </Link>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={homeScreenStyles.podiumName}>{podiumUsers[2].name}</Text>
                    <Text style={homeScreenStyles.podiumScore}>{podiumUsers[2].score} pts</Text>
                    <View style={homeScreenStyles.rankBadgeBronze}><Text style={homeScreenStyles.rankBadgeText}>3rd</Text></View>
                  </View>
                )}
              </View>

              {/* List for Ranks 4 onwards */}
              {listUsers.length > 0 && <Text style={homeScreenStyles.listHeader}>Ranks 4 - {leaderboardDisplayData.length}</Text>}
              {listUsers.map((userEntry) => (
                <Link key={userEntry.id} href={{ pathname: '/appGroup/profile', params: { userId: userEntry.id } }} asChild>
                  <TouchableOpacity style={homeScreenStyles.leaderboardEntryCardList}>
                    <Text style={homeScreenStyles.leaderboardRankNumberList}>{userEntry.rank}.</Text>
                    <View style={homeScreenStyles.leaderboardAvatarPlaceholderList}>
                      {userEntry.avatarUri ? (
                        <Image source={{ uri: userEntry.avatarUri }} style={homeScreenStyles.leaderboardAvatarImageSmall} />
                      ) : (
                        <Ionicons name="american-football-outline" size={20} color={PRIMARY_COLOR} />
                      )}
                    </View>
                    <Text style={homeScreenStyles.leaderboardNameList} numberOfLines={1} ellipsizeMode="tail">{userEntry.name}</Text>
                    <Text style={homeScreenStyles.leaderboardScoreList}>{userEntry.score} pts</Text>
                  </TouchableOpacity>
                </Link>
              ))}
            </>
          ) : (
            <Text style={homeScreenStyles.noDataText}>No leaderboard data yet. Be the first!</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

// Styles (homeScreenStyles) remain the same
const homeScreenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 20,
  },
  weekNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#F9F9F9',
    borderBottomWidth: 1,
    borderBottomColor: '#F9F9F9',
  },
  weekNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  weekNavButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  weekNavButtonText: {
    color: TEXT_COLOR_LIGHT,
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 4,
  },
  weekIndicatorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
  },
  welcomeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    padding: 10,
    backgroundColor: 'rgba(29, 54, 106, 0.05)', // Light background tint
    borderRadius: 12,
  },
  welcomeAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginRight: 10,
    resizeMode: 'cover',
  },
  welcomeAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  welcomeTextContainer: {
    flex: 1, // Allow text container to take remaining space
    justifyContent: 'center', // Vertically center the text line
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 5,
  },
  welcomeNameText: {
    fontSize: 22, // Larger name
    fontWeight: 'bold',
    color: TEXT_COLOR_DARK,
  },
  subHeaderText: {
    fontSize: 16,
    color: '#555555',
    marginBottom: 25,
  },
  actionCard: {
    backgroundColor: SECONDARY_COLOR,
    borderRadius: 50,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  actionCardSubtitle: {
    fontSize: 13,
    color: '#E0E0E0',
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  summaryCardTitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 5,
  },
  summaryCardScore: {
    fontSize: 36,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
    marginBottom: 10,
  },
  linkButton: {
    paddingVertical: 5,
  },
  linkButtonText: {
    fontSize: 14,
    color: ACCENT_COLOR,
    fontWeight: '600',
  },
  leaderboardSectionCard: {
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 10,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3,
  },
  leaderboardSectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
    marginBottom: 25,
    textAlign: 'center',
  },
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'center', // Center the podium items
    alignItems: 'flex-end',
    marginBottom: 25,
    minHeight: 180,
  },
  podiumSpot: {
    alignItems: 'center',
    width: '32%', // Give a bit more space
    marginHorizontal: '1%',
    paddingBottom: 10, // Base padding for all spots
  },
  podiumFirst: {
    order: 2,
    transform: [{ translateY: -20 }], // Elevate 1st place
  },
  podiumSecond: {
    order: 1,
    paddingTop: 20, // Push down slightly for podium effect
  },
  podiumThird: {
    order: 3,
    paddingTop: 30, // Push down more for podium effect
  },
  podiumAvatarContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E8EAF6', // Lighter grey for avatar background
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 3,
  },
  podiumAvatarGold: { borderColor: GOLD_COLOR, width: 80, height: 80, borderRadius: 40 },
  podiumAvatarSilver: { borderColor: SILVER_COLOR, width: 65, height: 65, borderRadius: 32.5 },
  podiumAvatarBronze: { borderColor: BRONZE_COLOR, width: 60, height: 60, borderRadius: 30 },
  podiumName: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_COLOR_DARK,
    textAlign: 'center',
    marginTop: 4,
  },
  podiumScore: {
    fontSize: 13,
    color: '#444', // Slightly darker score text
    textAlign: 'center',
  },
  podiumRankText: { // For 2nd and 3rd text
    fontSize: 13,
    fontWeight: 'bold',
    color: TEXT_COLOR_DARK,
    marginTop: 4,
  },
  rankBadgeSilver: { backgroundColor: SILVER_COLOR, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginTop: 4 },
  rankBadgeBronze: { backgroundColor: BRONZE_COLOR, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginTop: 4 },
  rankBadgeText: { color: TEXT_COLOR_DARK, fontSize: 10, fontWeight: 'bold' },
  listHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
    marginTop: 20, // Space above list
    marginBottom: 10,
    paddingLeft: 5,
  },
  leaderboardEntryCardList: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 5,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0', // Lighter separator
  },
  leaderboardRankNumberList: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_COLOR_DARK, // Darker rank number
    width: 30, // Fixed width for alignment
    textAlign: 'center',
    marginRight: 5,
  },
  leaderboardAvatarPlaceholderList: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    backgroundColor: '#E8E8E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  leaderboardNameList: {
    flex: 1,
    fontSize: 15,
    color: TEXT_COLOR_DARK,
  },
  leaderboardScoreList: {
    fontSize: 15,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
  },
  leaderboardAvatarImage: { // For Podium
    width: '100%',
    height: '100%',
    borderRadius: 50, // Ensures the image is circular within its container
  },
  leaderboardAvatarImageSmall: { // For List
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  noDataText: { textAlign: 'center', color: '#777', fontStyle: 'italic', paddingVertical: 10, },
  fullLeaderboardButton: { marginTop: 20, paddingVertical: 12, backgroundColor: PRIMARY_COLOR, borderRadius: 8, alignItems: 'center', },
  fullLeaderboardButtonText: { color: TEXT_COLOR_LIGHT, fontSize: 16, fontWeight: '600', },

  featuredMatchupContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 15,
  },
  matchupCard: {},
  teamDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#F9F9F9',
    padding: 10,
    borderRadius: 8,
  },
  teamLogoCircle: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  teamLogoText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  teamName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#444444',
    flex: 1,
  },
  teamProjected: {
    fontSize: 14,
    color: PRIMARY_COLOR,
    fontWeight: '500',
  },
  vsText: {
    textAlign: 'center',
    fontWeight: 'bold',
    color: '#777777',
    marginVertical: 8,
    fontSize: 14,
  },
});

export default HomeScreen;