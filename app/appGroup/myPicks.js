// app/(app)/myPicks.js
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
  Button,
  Image,
  RefreshControl
} from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { db } from '../../src/config/firebase'; // Adjust path if needed

// --- THEME COLORS (Navy / Cyan / Green) ---
const PRIMARY_COLOR = '#0D1B2A';    // Deep Navy
const SECONDARY_COLOR = '#00E5FF';  // Cyan
const ACCENT_COLOR = '#00E676';     // Green
const CARD_BACKGROUND = '#1B263B';  // Lighter Navy
const TEXT_COLOR_MAIN = '#FFFFFF';
const TEXT_COLOR_SUB = '#B0BEC5';
const LOSS_COLOR = '#FF5252';
const PENDING_COLOR = '#FFD700'; // Gold for pending

// --- CONFIGURATION ---
const MAX_WEEKS = 18;

const MyPicksScreen = () => {
  const { user, leagueKey } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [currentWeek, setCurrentWeek] = useState(1);
  const [allMatchups, setAllMatchups] = useState([]);
  const [displayablePicks, setDisplayablePicks] = useState([]);
  const [weeklyScore, setWeeklyScore] = useState(0);

  // This is the single, orchestrated function to load all data for the screen.
  const loadDataForWeek = useCallback(async (week) => {
    if (!user) {
      setError("Please log in to view your picks.");
      setIsLoading(false);
      setRefreshing(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Step 1: Fetch matchups if they are not already loaded
      let matchups = allMatchups;
      const { getWeeklyMatchups } = require('../../src/services/yahooFantasy');
      console.log(`MyPicks: LoadDataForWeek ${week}. LeagueKey: ${leagueKey}, User: ${user?.uid}`);

      if (leagueKey) {
        matchups = await getWeeklyMatchups(week, leagueKey);
        console.log(`MyPicks: Fetched ${matchups.length} matchups from API.`);
        setAllMatchups(matchups);
      } else {
        console.warn("MyPicks: No LeagueKey found, skipping fetch.");
      }

      // Step 2: Fetch user picks for the current week from Firestore
      const weekPicksDocRef = doc(db, "users", user.uid, "picks", `week_${week}`);
      const weekPicksDoc = await getDoc(weekPicksDocRef);
      const userPicksForWeek = weekPicksDoc.exists() ? weekPicksDoc.data() : {};
      console.log("MyPicks: User picks loaded:", Object.keys(userPicksForWeek).length);

      // Step 3: Process and combine the data for display
      const matchupsForThisWeek = matchups.filter(m => m && Number(m.Week) === Number(week));
      console.log(`MyPicks: Filtering for Week ${week}. Found: ${matchupsForThisWeek.length}`);
      if (matchups.length > 0) {
        console.log("MyPicks: Sample Matchup Week:", matchups[0]?.Week, typeof matchups[0]?.Week);
        console.log("MyPicks: Sample Matchup content:", JSON.stringify(matchups[0]));
      }

      let calculatedScore = 0;
      const processedPicks = matchupsForThisWeek.map(matchup => {
        const userPickAbbr = userPicksForWeek[matchup.UniqueID] || null;
        let pickStatus = 'PENDING';
        let pointsAwarded = 0;

        if (!userPickAbbr) {
          pickStatus = 'NO_PICK';
        } else {
          const winningTeam = String(matchup.WinningTeam || '').trim();
          if (winningTeam !== '') {
            let winnerAbbr = '';
            if (String(matchup.HomeTeamName).trim() === winningTeam) winnerAbbr = String(matchup.HomeTeamAB).trim().toUpperCase();
            else if (String(matchup.AwayTeamName).trim() === winningTeam) winnerAbbr = String(matchup.AwayTeamAB).trim().toUpperCase();
            else winnerAbbr = winningTeam.toUpperCase();

            // Handle Ties if needed, usually Yahoo handles winner logic, but simple compare:
            if (userPickAbbr.toUpperCase() === winnerAbbr) {
              pickStatus = 'CORRECT';
              pointsAwarded = 1;
              calculatedScore += 1;
            } else {
              pickStatus = 'INCORRECT';
            }
          }
        }
        return { ...matchup, userPickedTeamAbbr: userPickAbbr, pickStatus, pointsAwarded };
      });

      setDisplayablePicks(processedPicks);
      setWeeklyScore(calculatedScore);

    } catch (e) {
      console.error("MyPicksScreen: Error loading data:", e);
      setError("Failed to load your picks. Please try again.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user, leagueKey]); // REMOVED allMatchups to prevent infinite loop

  useFocusEffect(
    useCallback(() => {
      if (user !== undefined) {
        loadDataForWeek(currentWeek);
      }
    }, [currentWeek, user, loadDataForWeek])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (user !== undefined) {
      loadDataForWeek(currentWeek);
    } else {
      setRefreshing(false);
    }
  }, [currentWeek, user, loadDataForWeek]);

  const handleWeekChange = (newWeek) => {
    setCurrentWeek(newWeek);
  };

  const renderPickStatusIcon = (status) => {
    switch (status) {
      case 'CORRECT':
        return <Ionicons name="checkmark-circle" size={24} color={ACCENT_COLOR} />;
      case 'INCORRECT':
        return <Ionicons name="close-circle" size={24} color={LOSS_COLOR} />;
      case 'PENDING':
        return <Ionicons name="hourglass" size={22} color={PENDING_COLOR} />;
      case 'NO_PICK':
        return <Ionicons name="alert-circle" size={22} color={LOSS_COLOR} />;
      default:
        return null;
    }
  };

  const getTeamFullName = (teamAbbrOrName, matchup) => {
    if (!teamAbbrOrName || !matchup) return teamAbbrOrName || 'N/A';
    const term = String(teamAbbrOrName).trim();
    if (String(matchup.HomeTeamAB).trim().toUpperCase() === term.toUpperCase()) return matchup.HomeTeamName || term;
    if (String(matchup.AwayTeamAB).trim().toUpperCase() === term.toUpperCase()) return matchup.AwayTeamName || term;
    return term;
  };

  const renderContent = () => {
    if (isLoading && displayablePicks.length === 0 && !refreshing) {
      return <ActivityIndicator size="large" color={SECONDARY_COLOR} style={{ marginTop: 50 }} />;
    }
    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Retry" onPress={() => loadDataForWeek(currentWeek)} color={SECONDARY_COLOR} />
        </View>
      );
    }
    if (displayablePicks.length === 0 && !isLoading) {
      return <Text style={styles.noDataText}>No matchups found for Week {currentWeek}.</Text>;
    }

    return displayablePicks.map((item) => {
      const pickedTeamFullName = getTeamFullName(item.userPickedTeamAbbr, item);
      const winningTeamFullName = getTeamFullName(item.WinningTeam, item);

      return (
        <View key={item.UniqueID} style={styles.pickCard}>
          <View style={styles.matchupInfo}>
            {/* Away Team */}
            <View style={[styles.teamRow, { justifyContent: 'flex-end' }]}>
              <Text style={[styles.teamNameText, item.userPickedTeamAbbr === item.AwayTeamAB && styles.pickedTeamText]}>
                {item.AwayTeamAB}
              </Text>
              {item.AwayTeamLogo && <Image source={{ uri: item.AwayTeamLogo }} style={styles.teamLogo} />}
            </View>

            <Text style={styles.vsTextSmall}>AT</Text>

            {/* Home Team */}
            <View style={[styles.teamRow, { justifyContent: 'flex-start' }]}>
              {item.HomeTeamLogo && <Image source={{ uri: item.HomeTeamLogo }} style={styles.teamLogo} />}
              <Text style={[styles.teamNameText, item.userPickedTeamAbbr === item.HomeTeamAB && styles.pickedTeamText]}>
                {item.HomeTeamAB}
              </Text>
            </View>
          </View>

          {/* Result Row */}
          <View style={styles.resultRow}>
            <View style={styles.statusCol}>
              {renderPickStatusIcon(item.pickStatus)}
              <Text style={[
                styles.statusText,
                item.pickStatus === 'CORRECT' && { color: ACCENT_COLOR },
                item.pickStatus === 'INCORRECT' && { color: LOSS_COLOR },
                item.pickStatus === 'PENDING' && { color: PENDING_COLOR }
              ]}>
                {item.pickStatus.replace('_', ' ')}
              </Text>
            </View>

            {item.pickStatus === 'CORRECT' && (
              <Text style={styles.pointsText}>+1 PT</Text>
            )}
          </View>
        </View>
      );
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />

      {/* Header / Week Nav */}
      <View style={styles.weekNavigation}>
        <TouchableOpacity
          style={[styles.weekNavButton, (currentWeek === 1 || isLoading) && styles.weekNavButtonDisabled]}
          onPress={() => handleWeekChange(Math.max(1, currentWeek - 1))}
          disabled={currentWeek === 1 || isLoading}
        >
          <Ionicons name="chevron-back" size={24} color={currentWeek === 1 ? '#555' : SECONDARY_COLOR} />
        </TouchableOpacity>

        <View style={{ alignItems: 'center' }}>
          <Text style={styles.weekIndicatorText}>WEEK {currentWeek}</Text>
          <Text style={styles.scoreText}>{weeklyScore} PTS</Text>
        </View>

        <TouchableOpacity
          style={[styles.weekNavButton, (currentWeek >= MAX_WEEKS || isLoading) && styles.weekNavButtonDisabled]}
          onPress={() => handleWeekChange(currentWeek + 1)}
          disabled={currentWeek >= MAX_WEEKS || isLoading}
        >
          <Ionicons name="chevron-forward" size={24} color={currentWeek >= MAX_WEEKS ? '#555' : SECONDARY_COLOR} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 20, padding: 15 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SECONDARY_COLOR} />}
      >
        {renderContent()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PRIMARY_COLOR },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

  // Header
  weekNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 15,
    backgroundColor: CARD_BACKGROUND,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  weekNavButton: {
    padding: 5,
  },
  weekIndicatorText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TEXT_COLOR_SUB,
    letterSpacing: 1,
  },
  scoreText: { fontSize: 24, fontWeight: 'bold', color: ACCENT_COLOR },

  // Cards
  pickCard: {
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  matchupInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)'
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10
  },
  teamLogo: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff' },
  teamNameText: { fontSize: 18, fontWeight: 'bold', color: TEXT_COLOR_SUB },
  pickedTeamText: { color: SECONDARY_COLOR, textShadowColor: SECONDARY_COLOR, textShadowRadius: 5 },

  vsTextSmall: { fontSize: 12, fontWeight: 'bold', color: '#555', marginHorizontal: 10 },

  // Result Section
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
  },
  statusCol: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 14, fontWeight: 'bold' },
  pointsText: { fontSize: 16, fontWeight: 'bold', color: ACCENT_COLOR },


  errorText: { textAlign: 'center', color: LOSS_COLOR, marginTop: 20, fontSize: 16 },
  noDataText: { textAlign: 'center', color: TEXT_COLOR_SUB, marginTop: 50, fontSize: 16, fontStyle: 'italic' },
});

export default MyPicksScreen;