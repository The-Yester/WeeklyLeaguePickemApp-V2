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
import { useAuth } from '../../context/AuthContext';
import { db } from '../firebaseConfig'; // Adjust path if needed

// --- Configuration ---
const GOOGLE_SHEETS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_SHEETS_API_KEY;
const SPREADSHEET_ID = '1rVuE_BNO9C9M69uZnAHfD5pTI9sno9UXQI4NTDPCQLY';
const SHEET_NAME_AND_RANGE = '2025Matchups!A:N';
const MAX_WEEKS = 18;

// --- Colors ---
const PRIMARY_COLOR = '#1f366a';
const TEXT_COLOR_LIGHT = '#FFFFFF';
const TEXT_COLOR_DARK = '#333333';
const CARD_BACKGROUND = '#FFFFFF';
const CORRECT_PICK_COLOR = '#4CAF50';
const INCORRECT_PICK_COLOR = '#F44336';
const PENDING_PICK_COLOR = '#FF9800';
const BORDER_COLOR = '#E0E0E0';


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

const MyPicksScreen = () => {
  const { user } = useAuth();
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
      if (matchups.length === 0) {
        if (!GOOGLE_SHEETS_API_KEY || GOOGLE_SHEETS_API_KEY.includes('YOUR_GOOGLE_SHEETS_API_KEY')) {
          throw new Error('API Key is not configured.');
        }
        const encodedSheetNameAndRange = encodeURIComponent(SHEET_NAME_AND_RANGE);
        const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodedSheetNameAndRange}?key=${GOOGLE_SHEETS_API_KEY}`;
        const response = await fetch(apiUrl);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
        }
        const jsonData = await response.json();
        matchups = parseSheetData(jsonData);
        setAllMatchups(matchups);
      }

      // Step 2: Fetch user picks for the current week from Firestore
      const weekPicksDocRef = doc(db, "users", user.uid, "picks", `week_${week}`);
      const weekPicksDoc = await getDoc(weekPicksDocRef);
      const userPicksForWeek = weekPicksDoc.exists() ? weekPicksDoc.data() : {};

      // Step 3: Process and combine the data for display
      const matchupsForThisWeek = matchups.filter(m => m && m.Week === week);
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
  }, [user, allMatchups]);

  // useFocusEffect runs data loading when the screen comes into focus or week changes
  useFocusEffect(
    useCallback(() => {
      if (user !== undefined) { // Wait until auth state is determined
        loadDataForWeek(currentWeek);
      }
    }, [currentWeek, user, loadDataForWeek])
  );
  
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if(user !== undefined) {
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
        return <Ionicons name="checkmark-circle" size={24} color={CORRECT_PICK_COLOR} />;
      case 'INCORRECT':
        return <Ionicons name="close-circle" size={24} color={INCORRECT_PICK_COLOR} />;
      case 'PENDING':
        return <Ionicons name="hourglass-outline" size={22} color={PENDING_PICK_COLOR} />;
      case 'NO_PICK':
        return <Text style={styles.noPickText}>-</Text>; 
      default:
        return null;
    }
  };
  
  const getTeamFullName = (teamAbbrOrName, matchup) => {
    if (!teamAbbrOrName || !matchup) return teamAbbrOrName || 'N/A';
    const term = String(teamAbbrOrName).trim();
    if (String(matchup.HomeTeamAB).trim().toUpperCase() === term.toUpperCase()) return matchup.HomeTeamName || term;
    if (String(matchup.AwayTeamAB).trim().toUpperCase() === term.toUpperCase()) return matchup.AwayTeamName || term;
    return term; // Fallback for full names
  };

  const renderContent = () => {
    if (isLoading && displayablePicks.length === 0 && !refreshing) {
      return <ActivityIndicator size="large" color={PRIMARY_COLOR} style={{ marginTop: 50 }} />;
    }
    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Retry" onPress={() => loadDataForWeek(currentWeek)} color={PRIMARY_COLOR} />
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
            <View style={styles.teamRow}>
              {item.AwayTeamLogo && <Image source={{uri: item.AwayTeamLogo}} style={styles.teamLogo}/>}
              <Text style={styles.teamNameText}>{item.AwayTeamName || 'Away Team'} ({item.AwayTeamAB})</Text>
            </View>
            <Text style={styles.vsTextSmall}>vs</Text>
            <View style={styles.teamRow}>
              {item.HomeTeamLogo && <Image source={{uri: item.HomeTeamLogo}} style={styles.teamLogo}/>}
              <Text style={styles.teamNameText}>{item.HomeTeamName || 'Home Team'} ({item.HomeTeamAB})</Text>
            </View>
          </View>
          <View style={styles.pickDetails}>
            <Text style={styles.detailTitle}>Your Pick:</Text>
            <Text style={[ styles.detailValue, item.pickStatus === 'CORRECT' && styles.correctText, item.pickStatus === 'INCORRECT' && styles.incorrectText, ]}>
              {item.userPickedTeamAbbr ? pickedTeamFullName : 'No Pick'}
            </Text>
          </View>
          <View style={styles.pickDetails}>
            <Text style={styles.detailTitle}>Result:</Text>
            <Text style={styles.detailValue}>
              {item.WinningTeam ? winningTeamFullName : 'Pending'}
            </Text>
          </View>
          <View style={styles.pickStatusRow}>
            {renderPickStatusIcon(item.pickStatus)}
            <Text style={[ styles.statusText, item.pickStatus === 'CORRECT' && styles.correctText, item.pickStatus === 'INCORRECT' && styles.incorrectText, item.pickStatus === 'PENDING' && styles.pendingText, ]}>
              {item.pickStatus.replace('_', ' ')}
              {item.pickStatus === 'CORRECT' && ` (+${item.pointsAwarded} pt)`}
            </Text>
          </View>
        </View>
      );
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Picks</Text>
      </View>
      <View style={styles.weekNavigation}>
          <TouchableOpacity
              style={[styles.weekNavButton, (currentWeek === 1 || isLoading) && styles.weekNavButtonDisabled]}
              onPress={() => handleWeekChange(Math.max(1, currentWeek - 1))}
              disabled={currentWeek === 1 || isLoading}
          >
              <Ionicons name="chevron-back-outline" size={18} color={TEXT_COLOR_LIGHT} />
              <Text style={styles.weekNavButtonText}>Prev</Text>
          </TouchableOpacity>

          <Text style={styles.weekIndicatorText}>Week {currentWeek}</Text>

          <TouchableOpacity
              style={[styles.weekNavButton, (currentWeek >= MAX_WEEKS || isLoading) && styles.weekNavButtonDisabled]}
              onPress={() => handleWeekChange(currentWeek + 1)}
              disabled={currentWeek >= MAX_WEEKS || isLoading}
          >
              <Text style={styles.weekNavButtonText}>Next</Text>
              <Ionicons name="chevron-forward-outline" size={18} color={TEXT_COLOR_LIGHT} />
          </TouchableOpacity>
      </View>
       <View style={styles.scoreSummary}>
        <Text style={styles.scoreText}>Week {currentWeek} Score: {weeklyScore} pts</Text>
      </View>
      <ScrollView
        contentContainerStyle={{paddingBottom: 20}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY_COLOR]} tintColor={PRIMARY_COLOR} />}
      >
        {renderContent()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f7' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  header: { backgroundColor: PRIMARY_COLOR, padding: 15, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 10 : 40, alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: TEXT_COLOR_LIGHT },
  weekNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#e0e0e0',
    borderBottomWidth: 1,
    borderBottomColor: '#c0c0c0',
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
  scoreSummary: { paddingVertical: 10, alignItems: 'center', backgroundColor: '#CFD8DC', borderBottomWidth: 1, borderBottomColor: BORDER_COLOR },
  scoreText: { fontSize: 18, fontWeight: 'bold', color: PRIMARY_COLOR },
  scrollView: { flex: 1 },
  pickCard: { backgroundColor: CARD_BACKGROUND, borderRadius: 8, padding: 15, marginVertical: 8, marginHorizontal: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
  matchupInfo: { marginBottom: 10, alignItems: 'center' },
  teamRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  teamLogo: { width: 30, height: 30, borderRadius: 15, marginRight: 10, resizeMode: 'contain' },
  teamNameText: { fontSize: 16, fontWeight: '500', color: TEXT_COLOR_DARK },
  vsTextSmall: { fontSize: 12, fontWeight: 'bold', color: '#777', marginVertical: 2 },
  pickDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 8 },
  detailTitle: { fontSize: 14, fontWeight: '600', color: TEXT_COLOR_DARK },
  detailValue: { fontSize: 14, color: PRIMARY_COLOR, fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 5 },
  pickStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  statusText: { marginLeft: 8, fontSize: 16, fontWeight: 'bold' },
  noPickText: { fontSize: 16, fontWeight: 'bold', color: '#777' },
  correctText: { color: CORRECT_PICK_COLOR },
  incorrectText: { color: INCORRECT_PICK_COLOR },
  pendingText: { color: PENDING_PICK_COLOR },
  errorText: { textAlign: 'center', color: 'red', marginTop: 20, fontSize: 16 },
  noDataText: { textAlign: 'center', color: '#666', marginTop: 50, fontSize: 16 },
});

export default MyPicksScreen;