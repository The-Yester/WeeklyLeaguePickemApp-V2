// app/(app)/home/makepicks.js
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
import { useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { collection, doc, setDoc, getDoc, getDocs } from 'firebase/firestore'; // Import Firestore functions
import { useAuth } from '../../../context/AuthContext'; // Import useAuth to get user
import { db } from '../../../config/firebaseConfig'; // Import db instance
import * as Linking from 'expo-linking'; // ADDED: Import Linking for opening URLs
import { useUnsavedChanges } from '../../../context/UnsavedChangesContext';
import { fetchYahooMatchupsForWeek } from '../../../yahooApi'; 

// --- Configuration ---
const GOOGLE_SHEETS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_SHEETS_API_KEY;
const SPREADSHEET_ID = '1rVuE_BNO9C9M69uZnAHfD5pTI9sno9UXQI4NTDPCQLY';
const SHEET_NAME_AND_RANGE = '2025Matchups!A:N';
const MAX_WEEKS = 18; // Define the maximum week number

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
const SELECTED_PICK_COLOR = '#4CAF50';
const UNSELECTED_PICK_COLOR = '#FFFFFF';
const TEXT_ON_SELECTED_COLOR = '#0000FF';
const TEXT_ON_UNSELECTED_COLOR = '#333333';
const PROJECTION_TEXT_COLOR = '#555555';
const TEXT_COLOR_LIGHT = '#FFFFFF';
const AWAY_DISTRIBUTION_COLOR = '#42A5F5';
const HOME_DISTRIBUTION_COLOR = '#EF5350';

const parseSheetData = (jsonData) => {
  if (!jsonData || !Array.isArray(jsonData.values) || jsonData.values.length < 2) {
    return [];
  }
  const [headerRow, ...dataRows] = jsonData.values;
  const headers = headerRow.map(header => String(header).trim());
  return dataRows.map(row => {
    if (!Array.isArray(row)) return null;
    const entry = {};
    headers.forEach((header, index) => {
      const value = (row[index] !== undefined && row[index] !== null) ? String(row[index]).trim() : '';
      if (value.toUpperCase() === 'TRUE') { entry[header] = true; }
      else if (value.toUpperCase() === 'FALSE') { entry[header] = false; }
      else if (!isNaN(Number(value)) && value !== '') { entry[header] = Number(value); }
      else { entry[header] = value; }
    });
    return entry;
  }).filter(Boolean);
};

const havePicksChanged = (savedPicks, currentPicks) => {
    const savedKeys = Object.keys(savedPicks);
    const currentKeys = Object.keys(currentPicks);
    if (savedKeys.length !== currentKeys.length) return true;
    for (const key of savedKeys) {
        if (savedPicks[key] !== currentPicks[key]) return true;
    }
    return false;
};

// Reusable component for displaying a team within the pick card
const TeamDisplay = ({ teamName, teamAbbr, teamLogo, projectedPoints, isSelected }) => {
    return (
        <View style={styles.teamContent}>
            <View style={styles.teamLogoContainer}>
                {teamLogo ? (
                    <Image source={{ uri: teamLogo }} style={styles.teamLogo} />
                ) : (
                    <View style={styles.teamLogoPlaceholder}>
                        <Text style={styles.teamLogoPlaceholderText}>{teamAbbr.substring(0, 1)}</Text>
                    </View>
                )}
            </View>
            <View style={styles.teamTextContainer}>
                <Text style={[styles.teamName, isSelected && styles.selectedTeamText]} numberOfLines={2} ellipsizeMode="tail">
                    {teamName || 'N/A'}
                </Text>
                <Text style={[styles.teamProjection, isSelected && styles.selectedTeamTextDetail]}>
                    Proj: {(projectedPoints !== undefined ? Number(projectedPoints).toFixed(1) : '0.0')}
                </Text>
            </View>
        </View>
    );
};

const MakePicksScreen = ({ route }) => {
  const params = useLocalSearchParams();
  const navigation = useNavigation(); // Get navigation object for listeners
  const { user: loggedInUser } = useAuth(); // Get user from context
  const { setHasUnsavedChanges } = useUnsavedChanges();

  const initialWeek = params.week ? parseInt(params.week, 10) : 1;

  const [currentWeek, setCurrentWeek] = useState(initialWeek);
  const [allMatchups, setAllMatchups] = useState([]);
  const [currentWeekMatchups, setCurrentWeekMatchups] = useState([]);

  const [currentPicks, setCurrentPicks] = useState({});
  const [savedPicks, setSavedPicks] = useState({}); // To track the last saved state
  const [isWeekLocked, setIsWeekLocked] = useState(false); // State for lock status

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pickDistribution, setPickDistribution] = useState({});

  const arePicksDirty = havePicksChanged(savedPicks, currentPicks);
  const [leagueKey, setLeagueKey] = useState('66645');

  useEffect(() => {
    setHasUnsavedChanges(arePicksDirty);
    
    // Cleanup function to reset the flag when leaving the screen
    return () => {
      setHasUnsavedChanges(false);
    };
  }, [arePicksDirty, setHasUnsavedChanges]);

  const checkLockStatus = (week) => {
    const weekSchedule = PICKS_LOCK_SCHEDULE.find(s => s.week === week);
    if (!weekSchedule) {
        setIsWeekLocked(false);
        return false;
    }
    const lockDateTimeString = `${weekSchedule.date}T${weekSchedule.lockTime}:00`;
    const lockDateTime = new Date(lockDateTimeString);
    const now = new Date();
    const locked = now >= lockDateTime;
    setIsWeekLocked(locked);
    return locked;
  };

  const fetchMatchupsFromSheet = useCallback(async () => {
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
    return parseSheetData(jsonData);
  }, []);

  const calculatePickDistribution = useCallback(async (week, matchups) => {
    console.log(`\n--- Calculating Pick Distribution for Week ${week} ---`);
    const usersCollectionRef = collection(db, "users");
    const usersSnapshot = await getDocs(usersCollectionRef);
    if (usersSnapshot.empty) {
        console.log("No users found in database. Distribution cannot be calculated.");
        return {};
    }
    console.log(`Found ${usersSnapshot.size} total users in the database.`);
    
    const allPicksPromises = usersSnapshot.docs.map(userDoc => {
        const weekPicksDocRef = doc(db, "users", userDoc.id, "picks", `week_${week}`);
        return getDoc(weekPicksDocRef);
    });

    const allWeekPicksSnapshots = await Promise.all(allPicksPromises);
    
    const distribution = {};
    const matchupsForWeek = matchups.filter(m => m && m.Week === week);

    console.log(`Processing distribution for ${matchupsForWeek.length} matchups this week.`);
    matchupsForWeek.forEach(matchup => {
      let awayPicks = 0;
      let homePicks = 0;
      
      allWeekPicksSnapshots.forEach((weekPicksDoc, index) => {
        if (weekPicksDoc.exists()) {
          const picks = weekPicksDoc.data();
          const pickForThisGame = picks[matchup.UniqueID];
          
          // --- NEW DEBUGGING LOG ---
          if (pickForThisGame) {
              console.log(
                `User #${index + 1} | Game: ${matchup.UniqueID} | Pick: "${pickForThisGame}" | ` +
                `Comparing against Away: "${matchup.AwayTeamAB}" and Home: "${matchup.HomeTeamAB}"`
              );
          }
          // --- END NEW LOG ---

          if (pickForThisGame === matchup.AwayTeamAB) {
            awayPicks++;
          } else if (pickForThisGame === matchup.HomeTeamAB) {
            homePicks++;
          }
        }
      });

      const totalPicks = awayPicks + homePicks;
      distribution[matchup.UniqueID] = {
        awayPercent: totalPicks > 0 ? (awayPicks / totalPicks) * 100 : 0,
        homePercent: totalPicks > 0 ? (homePicks / totalPicks) * 100 : 0,
        totalPicks: totalPicks
      };
      console.log(`-> Game ${matchup.UniqueID} Final Tally: Away: ${awayPicks}, Home: ${homePicks}, Total: ${totalPicks}`);
    });
    
    console.log("--- Finished Calculating Distribution ---");
    return distribution;
  }, []);

  const loadDataForWeek = useCallback(async (week) => {
    if (!loggedInUser) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    checkLockStatus(week);
    try {
        // Fetch matchups directly from Yahoo API
        const matchups = await fetchYahooMatchupsForWeek(leagueKey, week);
        setCurrentWeekMatchups(matchups);

        // Fetch this user's picks from Firestore (this part doesn't change)
        const weekPicksDocRef = doc(db, "users", loggedInUser.uid, "picks", `week_${week}`);
        const weekPicksDoc = await getDoc(weekPicksDocRef);
        const picksData = weekPicksDoc.exists() ? weekPicksDoc.data() : {};
        setCurrentPicks(picksData);
        setSavedPicks(picksData);

    } catch(e) {
        console.error("MakePicksScreen: Failed to load data:", e);
        setError("Could not load matchups or your picks.");
    } finally {
        setIsLoading(false);
    }
  }, [loggedInUser, leagueKey]);

  useFocusEffect(
    useCallback(() => {
      if (loggedInUser !== undefined) {
        loadDataForWeek(currentWeek);
      }
    }, [currentWeek, loggedInUser, loadDataForWeek])
  );

  const handlePickSelection = (gameUniqueID, pickedTeamAbbr) => {
    if (isWeekLocked) {
        Alert.alert("Picks Locked", "Picks for this week are locked and cannot be changed.");
        return;
    }
    setCurrentPicks(prevPicks => ({ ...prevPicks, [gameUniqueID]: pickedTeamAbbr }));
  };

  const handleSavePicks = async () => {
    if (!loggedInUser || !loggedInUser.uid) {
      Alert.alert("Error", "You must be logged in to save picks.");
      return;
    }
    
    try {
      const weekPicksDocRef = doc(db, "users", loggedInUser.uid, "picks", `week_${currentWeek}`);
      await setDoc(weekPicksDocRef, currentPicks);
      setSavedPicks(currentPicks);
      Alert.alert("Picks Saved!", `Your picks for Week ${currentWeek} have been saved successfully.`);
    } catch (e) {
      console.error("Failed to save picks to Firestore:", e);
      Alert.alert("Error", "Could not save your picks. Please try again.");
    }
  };

  const handleWeekChange = (newWeek) => {
    if (arePicksDirty) {
      Alert.alert(
        'Unsaved Picks',
        'You are leaving this page without saving your picks. Click OK to continue or Cancel to stay on this page.',
        [
          { text: "Cancel", style: 'cancel', onPress: () => {} },
          { text: 'OK', style: 'destructive', onPress: () => setCurrentWeek(newWeek) },
        ]
      );
    } else {
      setCurrentWeek(newWeek);
    }
  };

  const handleViewOnYahoo = (matchup) => {
    // This function uses Linking.openURL()
    if (!matchup.MatchURL || typeof matchup.MatchURL !== 'string' || !matchup.MatchURL.startsWith('http')) {
      Alert.alert("Missing Info", "A valid Yahoo Fantasy matchup link is not available for this game.");
      return;
    }
    const url = matchup.MatchURL;
    Linking.openURL(url).catch(err => {
      console.error("Failed to open URL:", err);
      Alert.alert("Could not open page", "Unable to open the link in your browser.");
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        <Text style={{marginTop: 10}}>Loading Week {currentWeek}...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, {padding: 20}]}>
        <Text style={styles.errorText}>{error}</Text>
        <Button title="Retry" onPress={() => loadDataForWeek(currentWeek)}/>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Make Your Picks - Week {currentWeek}</Text>
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

      {isWeekLocked && (
        <View style={styles.lockedContainer}>
            <Ionicons name="lock-closed" size={24} color={'#D32F2F'} />
            <Text style={styles.lockedText}>Picks for this week are now locked.</Text>
        </View>
      )}

      {(isLoading && currentWeekMatchups.length === 0) ? ( // Show loading if actively fetching for a new week and no matchups yet for it
        <View style={[styles.container, styles.centered]}>
            <ActivityIndicator size="large" color={PRIMARY_COLOR} />
            <Text style={{marginTop: 10}}>Loading Week {currentWeek}...</Text>
        </View>
      ) : currentWeekMatchups.length === 0 && !isLoading ? (
        <View style={styles.centered}>
            <Text style={styles.noMatchupsText}>No matchups found for Week {currentWeek}.</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          {currentWeekMatchups.length > 0 ? (
            currentWeekMatchups.map((matchup) => {
              const distribution = pickDistribution[matchup.UniqueID] || { awayPercent: 0, homePercent: 0, totalPicks: 0 };

              return (
                <View key={matchup.UniqueID} style={styles.matchupCard}>
                  <Text style={styles.gameDateTime}>
                    {matchup.GameDate} at {matchup.GameTimeET || `Week ${currentWeek}`}
                  </Text>

                  <View style={styles.teamsContainer}>
                    {/* Away Team */}
                    <TouchableOpacity
                      disabled={isWeekLocked}
                      style={[
                        styles.teamButton,
                        currentPicks[matchup.UniqueID] === matchup.AwayTeamAB && styles.selectedTeamButton,
                        isWeekLocked && styles.disabledTeamButton
                      ]}
                      onPress={() => handlePickSelection(matchup.UniqueID, matchup.AwayTeamAB)}
                    >
                      <TeamDisplay
                        teamName={matchup.AwayTeamName}
                        teamAbbr={matchup.AwayTeamAB}
                        teamLogo={matchup.AwayTeamLogo}
                        projectedPoints={matchup.AwayTeamProjectedPoints}
                        isSelected={currentPicks[matchup.UniqueID] === matchup.AwayTeamAB}
                      />
                    </TouchableOpacity>

                    <View style={styles.vsContainer}>
                      <Text style={styles.vsText}>VS</Text>
                      <TouchableOpacity style={styles.yahooButton} onPress={() => handleViewOnYahoo(matchup)}>
                        <Image source={require('../../../assets/images/yahoo-logo.png')} style={styles.yahooLogo} />
                        <Text style={styles.yahooButtonText}>View</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Home Team */}
                    <TouchableOpacity
                      disabled={isWeekLocked}
                      style={[
                        styles.teamButton,
                        currentPicks[matchup.UniqueID] === matchup.HomeTeamAB && styles.selectedTeamButton,
                        isWeekLocked && styles.disabledTeamButton
                      ]}
                      onPress={() => handlePickSelection(matchup.UniqueID, matchup.HomeTeamAB)}
                    >
                      <TeamDisplay
                        teamName={matchup.HomeTeamName}
                        teamAbbr={matchup.HomeTeamAB}
                        teamLogo={matchup.HomeTeamLogo}
                        projectedPoints={matchup.HomeTeamProjectedPoints}
                        isSelected={currentPicks[matchup.UniqueID] === matchup.HomeTeamAB}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.distributionOuterContainer}>
                    <View style={styles.distributionBar}>
                      <View style={{
                        backgroundColor: AWAY_DISTRIBUTION_COLOR,
                        width: `${distribution.awayPercent}%`,
                        height: '100%',
                        justifyContent: 'center'
                      }}>
                        <Text style={styles.distributionText}>
                          {distribution.awayPercent > 15 ? `${distribution.awayPercent.toFixed(0)}%` : ''}
                        </Text>
                      </View>
                      <View style={{
                        backgroundColor: HOME_DISTRIBUTION_COLOR,
                        width: `${distribution.homePercent}%`,
                        height: '100%',
                        justifyContent: 'center',
                        alignItems: 'flex-end'
                      }}>
                        <Text style={styles.distributionText}>
                          {distribution.homePercent > 15 ? `${distribution.homePercent.toFixed(0)}%` : ''}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.totalPicksText}>
                      {distribution.totalPicks} total pick(s)
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.centered}>
              <Text style={styles.noMatchupsText}>No matchups found for Week {currentWeek}.</Text>
            </View>
          )}

          {currentWeekMatchups.length > 0 && !isWeekLocked && (
            <View style={styles.saveButtonContainer}>
              <TouchableOpacity style={styles.saveButton} onPress={handleSavePicks}>
                <Text style={styles.saveButtonText}>Save Picks for Week</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f7',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 15,
    paddingVertical: 15,
    paddingTop: Platform.select({ android: StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 20, ios: 40, default: 20 }),
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
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
  scrollView: {
    flex: 1,
  },
  matchupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 10, 
    paddingHorizontal: 15, 
    marginVertical: 8,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  gameDateTime: {
    fontSize: 12,
    color: '#555555',
    textAlign: 'center',
    marginBottom: 10,
  },
  teamsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start', 
  },
  teamButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 5, 
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PRIMARY_COLOR,
    backgroundColor: UNSELECTED_PICK_COLOR,
    marginHorizontal: 5,
    alignItems: 'center', 
  },
  selectedTeamButton: {
    backgroundColor: SELECTED_PICK_COLOR,
    borderColor: SELECTED_PICK_COLOR,
  },
  teamName: { 
    fontSize: 18,
    fontWeight: 'bold', 
    color: TEXT_ON_UNSELECTED_COLOR,
    textAlign: 'center', 
    marginBottom: 8, 
    width: '100%', 
  },
  selectedTeamText: { 
    color: TEXT_ON_SELECTED_COLOR,
  },
  selectedTeamTextDetail: { 
    color: TEXT_ON_SELECTED_COLOR, 
  },
  detailsRow: { 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%', 
    paddingHorizontal: 5, 
  },
  teamProjection: {
    fontSize: 14,
    color: PROJECTION_TEXT_COLOR,
  },
  teamLogo: {
    width: 60, 
    height: 60, 
    borderRadius: 30, // Half of width/height to make it circular
    resizeMode: 'contain',
    // overflow: 'hidden', // Optional: ensures content clips to the border radius
  },
  saveButtonContainer: {
    marginHorizontal: 20,
    marginVertical: 30,
  },
  saveButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 15,
    borderRadius: 30, // Pill shape
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  saveButtonDisabled: {
    backgroundColor: '#BDBDBD', // Grey out when disabled
  },
  saveButtonText: {
    color: TEXT_COLOR_LIGHT,
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 16,
  },
  noMatchupsText: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginTop: 20,
  },
  lockedContainer: {
    backgroundColor: '#FFEBEE', // Light red background
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#FFCDD2', // Darker red border
  },
  lockedText: {
    marginLeft: 10,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#D32F2F', // Red text
  },
  disabledTeamButton: {
      backgroundColor: '#EEEEEE', // Grey out disabled buttons
      borderColor: '#BDBDBD',
  },
  vsContainer: { // New container for VS text and Yahoo button
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
    paddingTop: 20, 
  },
  vsText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#777777',
  },
  yahooButton: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6a0dad', // Yahoo purple
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  yahooLogo: {
    width: 16,
    height: 16,
    marginRight: 5,
  },
  yahooButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  teamContent: {
    alignItems: 'center',
  },
  teamLogoContainer: {
    height: 60, // Fixed height for the logo area
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamLogo: {
    width: 55,
    height: 55,
    borderRadius: 27.5, // Half of width/height to make it a circle
    resizeMode: 'contain',
  },
  teamLogoPlaceholder: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: '#E8EAF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamLogoPlaceholderText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
  },
  teamTextContainer: {
    alignItems: 'center',
    height: 60, // Fixed height for text area to ensure uniformity
  },
  teamName: { 
    fontSize: 16,
    fontWeight: 'bold', 
    color: TEXT_ON_UNSELECTED_COLOR,
    textAlign: 'center', 
    minHeight: 38, // Ensure space for two lines of text
  },
  teamProjection: {
    fontSize: 13,
    color: PROJECTION_TEXT_COLOR,
    marginTop: 'auto', // Push to the bottom of its container
  },
  selectedTeamText: { 
    color: TEXT_ON_SELECTED_COLOR,
  },
  selectedTeamTextDetail: { 
    color: 'rgba(255, 255, 255, 0.8)', 
  },
  distributionOuterContainer: {
    paddingHorizontal: 5,
    marginTop: 15,
  },
  distributionBar: {
    flexDirection: 'row',
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
  },
  distributionText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    paddingHorizontal: 5,
  },
  totalPicksText: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  }
});

export default MakePicksScreen;