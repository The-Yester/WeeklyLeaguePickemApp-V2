// app/(app)/stats.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  Platform,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Button,
  TouchableOpacity,
  Image
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { BarChart, PieChart } from 'react-native-chart-kit';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig'; // Adjust path if needed

// --- Configuration ---
const GOOGLE_SHEETS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_SHEETS_API_KEY;
const SPREADSHEET_ID = '1rVuE_BNO9C9M69uZnAHfD5pTI9sno9UXQI4NTDPCQLY';
const SHEET_NAME_AND_RANGE = '2025Matchups!A:N';
const MAX_WEEKS = 18;

const PICKS_LOCK_SCHEDULE = [
  { week: 1, date: '2025-09-04', lockTime: '19:15' }, // 7:15 PM in 24-hour format
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
  { week: 17, date: '2025-12-25', lockTime: '12:00' }, // Noon
  { week: 18, date: '2026-01-01', lockTime: '12:00' },
];

// Colors
const PRIMARY_COLOR = '#1f366a';
const TEXT_COLOR_LIGHT = '#FFFFFF';
const TEXT_COLOR_DARK = '#333333';
const CARD_BACKGROUND = '#FFFFFF';
const BORDER_COLOR = '#E0E0E0';
const CHART_COLOR_CORRECT = '#4CAF50';
const CHART_COLOR_INCORRECT = '#F44336';
const FOOTBALL_FIELD_GREEN = '#4C956C';
const PENDING_PICK_COLOR = '#333333'

const screenWidth = Dimensions.get("window").width;

const parseSheetData = (jsonData) => {
  if (!jsonData || !Array.isArray(jsonData.values) || jsonData.values.length === 0) { return []; }
  const [headerRow, ...dataRows] = jsonData.values;
  if (!headerRow || !Array.isArray(headerRow)) { return []; }
  const headers = headerRow.map(header => String(header).trim());
  return dataRows.map(row => {
    if (!Array.isArray(row)) return null;
    const entry = {};
    headers.forEach((header, index) => {
      const value = (row[index] !== undefined && row[index] !== null) ? String(row[index]).trim() : '';
      if (value.toUpperCase() === 'TRUE') { entry[header] = true; }
      else if (value.toUpperCase() === 'FALSE') { entry[header] = false; }
      else if (header.includes("Points") || header === "Week" || header === "SeasonYear") {
         entry[header] = !isNaN(Number(value)) && value !== '' ? Number(value) : 0;
      }
      else { entry[header] = value; }
    });
    return entry;
  }).filter(Boolean);
};

const StatsScreen = () => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [allMatchups, setAllMatchups] = useState([]);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [isWeekLocked, setIsWeekLocked] = useState(false);

  const [allUsersPicks, setAllUsersPicks] = useState([]); 
  const [loggedInUserStats, setLoggedInUserStats] = useState({ correct: 0, incorrect: 0, accuracy: 0, totalPickedGames: 0 });
  const [topUsersChartData, setTopUsersChartData] = useState(null);

  const checkLockStatus = (week) => {
    const weekSchedule = PICKS_LOCK_SCHEDULE.find(s => s.week === week);
    if (!weekSchedule) { setIsWeekLocked(false); return false; }
    const lockDateTime = new Date(`${weekSchedule.date}T${weekSchedule.lockTime}:00`);
    const locked = new Date() >= lockDateTime;
    setIsWeekLocked(locked);
    return locked;
  };

  const loadStats = useCallback(async (week) => {
    if (!user) {
      setError("Please log in to view stats.");
      setIsLoading(false);
      setRefreshing(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    checkLockStatus(week);
    try {
      const allMatchupsPromise = fetchMatchupsFromSheet();
      const usersCollectionRef = collection(db, "users");
      const usersSnapshotPromise = getDocs(usersCollectionRef);
      
      const [matchups, usersSnapshot] = await Promise.all([allMatchupsPromise, usersSnapshotPromise]);
      setAllMatchups(matchups);

      if (matchups.length === 0) { throw new Error("Game data could not be loaded."); }

      const allUsers = usersSnapshot.docs.map(doc => doc.data());
      
      const allUserStatsPromises = allUsers.map(async (u) => {
        const picksCollectionRef = collection(db, "users", u.uid, "picks");
        const picksSnapshot = await getDocs(picksCollectionRef);
        
        let allPicksForUser = [];
        picksSnapshot.forEach(doc => {
            const weekPicks = doc.data();
            for (const gameUniqueID in weekPicks) {
                allPicksForUser.push({ gameUniqueID, pickedTeamAbbr: weekPicks[gameUniqueID] });
            }
        });

        let correct = 0, incorrect = 0;
        matchups.forEach(matchup => {
          if (matchup.UniqueID && matchup.WinningTeam && String(matchup.WinningTeam).trim() !== '') {
            const userPick = allPicksForUser.find(p => p.gameUniqueID === matchup.UniqueID);
            if (userPick) {
              const winningTeam = String(matchup.WinningTeam).trim();
              let winnerAbbr = '';
              if (String(matchup.HomeTeamName).trim() === winningTeam) winnerAbbr = String(matchup.HomeTeamAB).trim().toUpperCase();
              else if (String(matchup.AwayTeamName).trim() === winningTeam) winnerAbbr = String(matchup.AwayTeamAB).trim().toUpperCase();
              else winnerAbbr = winningTeam.toUpperCase();
              
              if (userPick.pickedTeamAbbr.toUpperCase() === winnerAbbr) { correct++; } else { incorrect++; }
            }
          }
        });
        
        const totalPickedGames = correct + incorrect;
        const accuracy = totalPickedGames > 0 ? (correct / totalPickedGames) * 100 : 0;
        return { uid: u.uid, name: u.name || u.username, correct, incorrect, accuracy, totalPickedGames };
      });
      
      const resolvedUserStats = await Promise.all(allUserStatsPromises);

      const currentUserStats = resolvedUserStats.find(u => u.uid === user.uid);
      if (currentUserStats) setLoggedInUserStats(currentUserStats);

      const sortedByCorrect = [...resolvedUserStats].sort((a, b) => b.correct - a.correct);
      const topUsers = sortedByCorrect.slice(0, 5);
      if (topUsers.length > 0) {
        setTopUsersChartData({
          labels: topUsers.map(u => u.name.substring(0, 10)),
          datasets: [{ data: topUsers.map(u => u.correct) }],
        });
      } else {
        setTopUsersChartData(null);
      }

      const weeklyPicksPromises = allUsers.map(async (u) => {
        const weekPicksDocRef = doc(db, "users", u.uid, "picks", `week_${week}`);
        const weekPicksDoc = await getDoc(weekPicksDocRef);
        return { ...u, picks: weekPicksDoc.exists() ? weekPicksDoc.data() : {} };
      });
      const usersWithWeeklyPicks = await Promise.all(weeklyPicksPromises);
      setAllUsersPicks(usersWithWeeklyPicks);

    } catch (e) {
      console.error("StatsScreen: Error loading data:", e);
      setError("Failed to load stats. Please try again later.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user, fetchMatchupsFromSheet]);

  useFocusEffect(
    useCallback(() => {
        if (user !== undefined) {
            loadStats(currentWeek);
        }
    }, [currentWeek, user, loadStats])
  );
  
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStats(currentWeek);
  }, [currentWeek, loadStats]);

  const fetchMatchupsFromSheet = useCallback(async () => {
    if (!GOOGLE_SHEETS_API_KEY || GOOGLE_SHEETS_API_KEY.includes('YOUR_GOOGLE_SHEETS_API_KEY')) { throw new Error('API Key is not configured.'); }
    const encodedSheetNameAndRange = encodeURIComponent(SHEET_NAME_AND_RANGE);
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodedSheetNameAndRange}?key=${GOOGLE_SHEETS_API_KEY}`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();
    return parseSheetData(jsonData);
  }, []);

  const pieChartData = loggedInUserStats.correct + loggedInUserStats.incorrect > 0 ? [
    { name: 'Correct', population: loggedInUserStats.correct, color: CHART_COLOR_CORRECT, legendFontColor: TEXT_COLOR_DARK, legendFontSize: 14 },
    { name: 'Incorrect', population: loggedInUserStats.incorrect, color: CHART_COLOR_INCORRECT, legendFontColor: TEXT_COLOR_DARK, legendFontSize: 14 },
  ] : [];

  const renderContent = () => {
    if (isLoading && !refreshing) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          <Text style={{marginTop: 10, color: TEXT_COLOR_DARK}}>Loading Stats...</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={[styles.centered, {padding: 20}]}>
          <Ionicons name="alert-circle-outline" size={50} color={PRIMARY_COLOR} />
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Retry" onPress={loadStats} color={PRIMARY_COLOR}/>
        </View>
      );
    }

    const weeklyMatchups = allMatchups.filter(m => m && m.Week === currentWeek);

    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{paddingBottom: 20}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY_COLOR]} tintColor={PRIMARY_COLOR}/>}
      >
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>My Pick Performance</Text>
          {user ? (
            <>
              <View style={styles.statRow}><Text style={styles.statLabel}>Correct Picks:</Text><Text style={styles.statValue}>{loggedInUserStats.correct}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>Incorrect Picks:</Text><Text style={styles.statValue}>{loggedInUserStats.incorrect}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>Games Picked (Completed):</Text><Text style={styles.statValue}>{loggedInUserStats.totalPickedGames}</Text></View>
              <View style={styles.statRow}><Text style={styles.statLabel}>Accuracy:</Text><Text style={styles.statValue}>{loggedInUserStats.accuracy.toFixed(1)}%</Text></View>
              {pieChartData.length > 0 ? (
                <View style={styles.chartContainer}>
                  <PieChart
                    data={pieChartData}
                    width={screenWidth - 60}
                    height={220}
                    chartConfig={{
                      backgroundColor: '#1cc910',
                      backgroundGradientFrom: '#eff3ff',
                      backgroundGradientTo: '#efefef',
                      decimalPlaces: 0,
                      color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                      style: { borderRadius: 16 },
                    }}
                    accessor={"population"}
                    backgroundColor={"transparent"}
                    paddingLeft={"15"}
                    absolute
                  />
                </View>
              ) : (
                <Text style={styles.noChartDataText}>Make some picks for completed games to see your chart!</Text>
              )}
            </>
          ) : (
            <Text style={styles.noChartDataText}>Login to see your stats.</Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Top Pickers (Correct Picks)</Text>
          {topUsersChartData && topUsersChartData.labels && topUsersChartData.labels.length > 0 ? (
            <View style={styles.chartContainer}>
              <BarChart
                data={topUsersChartData}
                width={screenWidth - 50}
                height={450}
                yAxisLabel=""
                yAxisSuffix=" picks"
                chartConfig={{
                  backgroundColor: CARD_BACKGROUND,
                  backgroundGradientFrom: CARD_BACKGROUND,
                  backgroundGradientTo: CARD_BACKGROUND,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(31, 54, 106, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  style: { borderRadius: 16 },
                  barPercentage: 0.7,
                }}
                verticalLabelRotation={Platform.OS === 'ios' ? 0 : 20}
                fromZero={true}
                style={styles.chartStyle}
              />
            </View>
          ) : (
            <Text style={styles.noChartDataText}>Not enough data for the top pickers chart yet.</Text>
          )}
        </View>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Weekly Picks Breakdown</Text>
          <View style={styles.weekNavigation}>
            <TouchableOpacity
                style={[styles.weekNavButton, (currentWeek === 1 || isLoading) && styles.weekNavButtonDisabled]}
                onPress={() => setCurrentWeek(prev => Math.max(1, prev - 1))}
                disabled={currentWeek === 1 || isLoading}
            >
                <Ionicons name="chevron-back-outline" size={18} color={TEXT_COLOR_LIGHT} />
                <Text style={styles.weekNavButtonText}>Prev</Text>
            </TouchableOpacity>

            <Text style={styles.weekIndicatorText}>Week {currentWeek}</Text>

            <TouchableOpacity
                style={[styles.weekNavButton, (isLoading || currentWeek >= MAX_WEEKS) && styles.weekNavButtonDisabled]}
                onPress={() => setCurrentWeek(prev => prev + 1)}
                disabled={isLoading || currentWeek >= MAX_WEEKS}
            >
                <Text style={styles.weekNavButtonText}>Next</Text>
                <Ionicons name="chevron-forward-outline" size={18} color={TEXT_COLOR_LIGHT} />
            </TouchableOpacity>
          </View>
          {isWeekLocked ? (
            allUsersPicks.map(userData => (
              <View key={userData.uid} style={styles.userPicksContainer}>
                <View style={styles.userPicksHeader}>
                  {userData.avatarUri ? (
                    <Image source={{ uri: userData.avatarUri }} style={styles.userAvatar} />
                  ) : (
                    <Ionicons name="person-circle-outline" size={24} color={PRIMARY_COLOR} />
                  )}
                  <Text style={styles.userPicksName}>{userData.name || userData.username}</Text>
                </View>
                {weeklyMatchups.map(matchup => {
                  const pick = userData.picks[matchup.UniqueID];
                  const pickedTeam = pick === matchup.HomeTeamAB ? matchup.HomeTeamName : (pick === matchup.AwayTeamAB ? matchup.AwayTeamName : 'No Pick');
                  return (
                    <View key={matchup.UniqueID} style={styles.pickRow}>
                      <Text style={styles.pickMatchupText}>{`${matchup.AwayTeamAB} @ ${matchup.HomeTeamAB}`}</Text>
                      <Text style={[styles.pickValueText, !pick && styles.noPickValueText]}>{pickedTeam}</Text>
                    </View>
                  );
                })}
              </View>
            ))
          ) : (
            <View style={styles.picksNotLockedContainer}>
              <Ionicons name="lock-open-outline" size={30} color={PENDING_PICK_COLOR} />
              <Text style={styles.picksNotLockedText}>Picks for this week are not locked yet.</Text>
              <Text style={styles.picksNotLockedSubText}>Check back after the deadline to see everyone's selections!</Text>
            </View>
          )}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>League Statistics</Text>
      </View>
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e9eef2' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  header: { backgroundColor: PRIMARY_COLOR, paddingHorizontal: 15, paddingVertical: 15, paddingTop: Platform.select({ android: StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 20, ios: 40, default: 20 }), alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: TEXT_COLOR_LIGHT },
  scrollView: { flex: 1 },
  sectionCard: { backgroundColor: CARD_BACKGROUND, borderRadius: 12, padding: 15, marginVertical: 10, marginHorizontal: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: PRIMARY_COLOR, marginBottom: 15, textAlign: 'center' },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER_COLOR },
  statLabel: { fontSize: 16, color: TEXT_COLOR_DARK },
  statValue: { fontSize: 16, fontWeight: 'bold', color: PRIMARY_COLOR },
  chartContainer: { alignItems: 'center', marginTop: 10, paddingRight: 10 },
  chartStyle: { marginVertical: 8, borderRadius: 16 },
  noChartDataText: { textAlign: 'center', color: '#777', marginTop: 20, fontStyle: 'italic', paddingBottom: 10 },
  errorText: { color: PRIMARY_COLOR, textAlign: 'center', marginBottom: 15, fontSize: 16, fontWeight: '500' },
  userPicksContainer: {
    marginVertical: 10,
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    overflow: 'hidden',
  },
  userPicksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 10,
  },
  userPicksName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
    marginLeft: 8,
  },
  pickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  pickMatchupText: {
    fontSize: 14,
    color: '#666',
  },
  pickValueText: {
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_COLOR_DARK,
  },
  noPickValueText: {
    fontStyle: 'italic',
    color: '#999',
  },
  picksNotLockedContainer: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: '#FFFDE7',
    borderRadius: 8,
  },
  picksNotLockedText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: PENDING_PICK_COLOR,
    marginTop: 10,
    textAlign: 'center',
  },
  picksNotLockedSubText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginTop: 5,
  },
  weekNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    borderColor: BORDER_COLOR,
    marginBottom: 10,
  },
  weekNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  weekNavButtonDisabled: {
    backgroundColor: '#BDBDBD',
    elevation: 0,
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
  userAvatar: {
  width: 50,
  height: 50,
  borderRadius: 25,
  }
});

export default StatsScreen;