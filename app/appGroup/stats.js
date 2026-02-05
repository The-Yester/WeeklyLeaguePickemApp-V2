// app/(app)/stats.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  StatusBar,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Image,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { BarChart, PieChart } from 'react-native-chart-kit';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../../src/context/AuthContext';
import { db } from '../../src/config/firebase';

// --- THEME COLORS ---
const PRIMARY_COLOR = '#0D1B2A';
const SECONDARY_COLOR = '#00E5FF';
const ACCENT_COLOR = '#00E676';
const CARD_BACKGROUND = '#1B263B';
const TEXT_COLOR_MAIN = '#FFFFFF';
const TEXT_COLOR_SUB = '#B0BEC5';
const LOSS_COLOR = '#FF5252';
const GOLD_COLOR = '#FFD700';

const screenWidth = Dimensions.get("window").width;

// --- CONFIG ---
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

const StatsScreen = () => {
  const { user, leagueKey } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data State
  const [seasonLeadersChart, setSeasonLeadersChart] = useState(null);
  const [mySeasonStats, setMySeasonStats] = useState({ correct: 0, incorrect: 0, accuracy: 0, total: 0 });

  // New Stats State
  const [myBadges, setMyBadges] = useState({ maxStreak: 0, perfectWeeks: 0, efficiency: 0 });
  const [crystalBallStats, setCrystalBallStats] = useState({ correct: 0, total: 0, percentage: 0 });

  // Weekly Breakdown State
  const [currentWeekMatchups, setCurrentWeekMatchups] = useState([]);
  const [currentWeekPicks, setCurrentWeekPicks] = useState([]);
  const [currentWeekNum, setCurrentWeekNum] = useState(1);
  const [isWeekLocked, setIsWeekLocked] = useState(false);

  const loadSeasonStats = useCallback(async () => {
    if (!user || !leagueKey) return;
    setIsLoading(true);

    try {
      const { getWeeklyMatchups } = require('../../src/services/yahooFantasy');

      // 1. Determine Current Week & Lock
      const now = new Date();
      let determinedWeek = 1;
      for (let i = 0; i < PICKS_LOCK_SCHEDULE.length; i++) {
        const s = PICKS_LOCK_SCHEDULE[i];
        const lockDate = new Date(`${s.date}T${s.lockTime}:00`);
        if (lockDate > now) {
          determinedWeek = s.week;
          break;
        }
        if (i === PICKS_LOCK_SCHEDULE.length - 1) determinedWeek = 18;
      }
      setCurrentWeekNum(determinedWeek);
      const weekSchedule = PICKS_LOCK_SCHEDULE.find(s => s.week === determinedWeek);
      const lockDateTime = weekSchedule ? new Date(`${weekSchedule.date}T${weekSchedule.lockTime}:00`) : new Date();
      setIsWeekLocked(now >= lockDateTime);

      // 2. Fetch Users
      const usersSnap = await getDocs(collection(db, "users"));
      const allUsers = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

      // 3. Fetch Season Matchups (Limited Scope for Performance)
      // We will fetch up to determinedWeek.
      const weeksToFetch = Array.from({ length: determinedWeek }, (_, i) => i + 1);
      const chunkedWeeks = [];
      while (weeksToFetch.length) chunkedWeeks.push(weeksToFetch.splice(0, 5));

      let allSeasonMatchups = [];
      for (const chunk of chunkedWeeks) {
        const promises = chunk.map(w => getWeeklyMatchups(w, leagueKey));
        const results = await Promise.all(promises);
        results.forEach(r => allSeasonMatchups.push(...r));
      }

      // Sort matchups chronologically for Streak Calculation
      allSeasonMatchups.sort((a, b) => {
        if (a.Week !== b.Week) return a.Week - b.Week;
        return a.UniqueID.localeCompare(b.UniqueID); // Stable fallback
      });

      // 4. Calculate Scores & Badges
      const userStatsPromises = allUsers.map(async (u) => {
        const picksRef = collection(db, "users", u.uid, "picks");
        const picksSnap = await getDocs(picksRef);

        let userCorrect = 0;
        let userPicksMap = {};
        picksSnap.forEach(doc => Object.assign(userPicksMap, doc.data()));

        // Streak & Badge Tracking (Only for Logged In User)
        let currentStreak = 0;
        let maxStreak = 0;
        let closeGameCorrect = 0;
        let closeGameTotal = 0;

        // Perfect Week Tracking
        // Group matchups by week
        const matchupsByWeek = {};
        allSeasonMatchups.forEach(m => {
          if (!matchupsByWeek[m.Week]) matchupsByWeek[m.Week] = [];
          matchupsByWeek[m.Week].push(m);
        });

        let perfectWeeks = 0;

        // Iterate Weeks for Perfect Check
        for (const wk in matchupsByWeek) {
          const weekMatches = matchupsByWeek[wk];
          const finishedMatches = weekMatches.filter(m => m.WinningTeam);
          if (finishedMatches.length > 0) {
            let weekCorrect = 0;
            finishedMatches.forEach(m => {
              const pick = userPicksMap[m.UniqueID];
              const winnerAbbr = m.WinningTeam === m.HomeTeamName ? m.HomeTeamAB : (m.WinningTeam === m.AwayTeamName ? m.AwayTeamAB : null);
              if (pick && winnerAbbr && pick === winnerAbbr) weekCorrect++;
            });
            if (weekCorrect === finishedMatches.length && finishedMatches.length >= 4) { // Only count if >4 games (avoid bye usage tricks?)
              perfectWeeks++;
            }
          }
        }

        allSeasonMatchups.forEach(m => {
          if (m.WinningTeam) {
            const pick = userPicksMap[m.UniqueID];
            const winnerAbbr = m.WinningTeam === m.HomeTeamName ? m.HomeTeamAB : (m.WinningTeam === m.AwayTeamName ? m.AwayTeamAB : null);

            const isCorrect = (pick && winnerAbbr && pick === winnerAbbr);
            if (isCorrect) {
              userCorrect++;
              if (u.uid === user.uid) currentStreak++;
            } else {
              if (u.uid === user.uid) {
                maxStreak = Math.max(maxStreak, currentStreak);
                currentStreak = 0;
              }
            }

            // Crystal Ball: Close Games (Diff <= 10)
            // Only if we have actual scores (HomeTeamActualPoints)
            // Yahoo API returns points as strings usually?
            const hPts = Number(m.HomeTeamActualPoints);
            const aPts = Number(m.AwayTeamActualPoints);
            if (!isNaN(hPts) && !isNaN(aPts) && Math.abs(hPts - aPts) <= 10) {
              if (u.uid === user.uid) {
                closeGameTotal++;
                if (isCorrect) closeGameCorrect++;
              }
            }
          }
        });

        // Finalize Streak
        if (u.uid === user.uid) maxStreak = Math.max(maxStreak, currentStreak);

        return {
          ...u,
          correct: userCorrect,
          name: u.name || u.username || 'User',
          maxStreak, // Only relevant for logged in, but we can store
          perfectWeeks,
          closeGameCorrect,
          closeGameTotal
        };
      });

      const usersWithScores = await Promise.all(userStatsPromises);

      // 5. Update UI Data

      // Leaderboard
      const sorted = [...usersWithScores].sort((a, b) => b.correct - a.correct).slice(0, 5);
      if (sorted.length > 0) {
        setSeasonLeadersChart({
          labels: sorted.map(u => u.name.split(' ')[0]),
          datasets: [{ data: sorted.map(u => u.correct) }]
        });
      }

      // My Stats
      const me = usersWithScores.find(u => u.uid === user.uid);
      let totalCompletedGames = allSeasonMatchups.filter(m => m.WinningTeam).length;

      if (me) {
        setMySeasonStats({
          correct: me.correct,
          incorrect: totalCompletedGames - me.correct,
          total: totalCompletedGames,
          accuracy: totalCompletedGames > 0 ? ((me.correct / totalCompletedGames) * 100).toFixed(1) : '0.0'
        });

        setMyBadges({
          maxStreak: me.maxStreak,
          perfectWeeks: me.perfectWeeks,
          efficiency: totalCompletedGames > 0 ? (me.correct / totalCompletedGames).toFixed(2) : 0
        });

        setCrystalBallStats({
          correct: me.closeGameCorrect,
          total: me.closeGameTotal,
          percentage: me.closeGameTotal > 0 ? Math.round((me.closeGameCorrect / me.closeGameTotal) * 100) : 0
        });
      }

      // Breakdown Data
      const thisWeekMatchups = allSeasonMatchups.filter(m => m.Week === determinedWeek);
      setCurrentWeekMatchups(thisWeekMatchups);

      const weekPicksPromises = allUsers.map(async (u) => {
        const weekDoc = await getDoc(doc(db, "users", u.uid, "picks", `week_${determinedWeek}`));
        return { ...u, picks: weekDoc.exists() ? weekDoc.data() : {} };
      });
      const weekPicksRes = await Promise.all(weekPicksPromises);
      setCurrentWeekPicks(weekPicksRes);

    } catch (err) {
      console.error("Season Stats Error:", err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user, leagueKey]);

  useEffect(() => {
    loadSeasonStats();
  }, [loadSeasonStats]);

  const onRefresh = () => {
    setRefreshing(true);
    loadSeasonStats();
  };

  // --- RENDERERS ---

  const renderBadges = () => (
    <View style={styles.badgeRow}>
      <View style={styles.badgeCard}>
        <Ionicons name="flame" size={24} color="#FF6D00" />
        <Text style={styles.badgeValue}>{myBadges.maxStreak}</Text>
        <Text style={styles.badgeLabel}>MAX STREAK</Text>
      </View>
      <View style={styles.badgeCard}>
        <Ionicons name="diamond" size={24} color={SECONDARY_COLOR} />
        <Text style={styles.badgeValue}>{myBadges.perfectWeeks}</Text>
        <Text style={styles.badgeLabel}>PERFECT WKS</Text>
      </View>
      <View style={styles.badgeCard}>
        <Ionicons name="speedometer" size={24} color={ACCENT_COLOR} />
        <Text style={styles.badgeValue}>{myBadges.efficiency}</Text>
        <Text style={styles.badgeLabel}>EFFICIENCY</Text>
      </View>
    </View>
  );

  const renderCrystalBall = () => (
    <View style={styles.crystalBallCard}>
      <View style={styles.crystalHeader}>
        <Ionicons name="color-wand" size={20} color="#D1C4E9" />
        <Text style={styles.crystalTitle}>THE CRYSTAL BALL</Text>
      </View>
      <Text style={styles.crystalSub}>Accuracy in Close Games ({'<'}10 pts)</Text>

      <View style={styles.crystalContent}>
        <Text style={styles.crystalBigText}>{crystalBallStats.percentage}%</Text>
        <View>
          <Text style={styles.crystalSmallText}>{crystalBallStats.correct} Correct</Text>
          <Text style={styles.crystalSmallText}>{crystalBallStats.total} Close Calls</Text>
        </View>
      </View>
    </View>
  );

  const renderPieChart = () => {
    const data = [
      { name: 'Correct', population: mySeasonStats.correct, color: ACCENT_COLOR, legendFontColor: TEXT_COLOR_MAIN, legendFontSize: 12 },
      { name: 'Incorrect', population: mySeasonStats.incorrect, color: LOSS_COLOR, legendFontColor: TEXT_COLOR_MAIN, legendFontSize: 12 },
    ];
    return (
      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>MY SEASON RECORD</Text>
        {mySeasonStats.total > 0 ? (
          <PieChart
            data={data}
            width={screenWidth - 60}
            height={200}
            chartConfig={{ color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})` }}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute
          />
        ) : (
          <Text style={styles.noDataText}>No completed games yet this season.</Text>
        )}
        <Text style={styles.accuracyText}>{mySeasonStats.accuracy}% Accuracy</Text>
      </View>
    );
  };

  const renderBarChart = () => {
    if (!seasonLeadersChart) return null;
    return (
      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>SEASON LEADERS (TOTAL CORRECT)</Text>
        <BarChart
          data={seasonLeadersChart}
          width={screenWidth - 60}
          height={220}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={{
            backgroundColor: CARD_BACKGROUND,
            backgroundGradientFrom: CARD_BACKGROUND,
            backgroundGradientTo: CARD_BACKGROUND,
            decimalPlaces: 0,
            color: (opacity = 1) => SECONDARY_COLOR,
            labelColor: (opacity = 1) => TEXT_COLOR_SUB,
            barPercentage: 0.7,
          }}
          style={{ borderRadius: 16 }}
          fromZero
        />
      </View>
    );
  };

  const renderWeekBreakdown = () => {
    if (!isWeekLocked) {
      return (
        <View style={styles.lockedContainer}>
          <Ionicons name="lock-closed" size={48} color={SECONDARY_COLOR} />
          <Text style={styles.lockedTitle}>WEEK {currentWeekNum} PENDING</Text>
          <Text style={styles.lockedSub}>
            Community picks revealed after Thursday kickoff.
          </Text>
        </View>
      );
    }
    return (
      <View>
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>WEEK {currentWeekNum} BREAKDOWN</Text>
        {currentWeekMatchups.map((matchup, index) => {
          const homePickers = currentWeekPicks.filter(u => u.picks[matchup.UniqueID] === matchup.HomeTeamAB);
          const awayPickers = currentWeekPicks.filter(u => u.picks[matchup.UniqueID] === matchup.AwayTeamAB);

          return (
            <View key={index} style={styles.matchupCard}>
              {/* Header */}
              <View style={styles.matchupHeader}>
                <View style={styles.teamHeaderCol}>
                  <Text style={styles.teamAbbr}>{matchup.AwayTeamAB}</Text>
                  <View style={[styles.pickCountBadge, { backgroundColor: SECONDARY_COLOR }]}>
                    <Text style={styles.pickCountText}>{awayPickers.length}</Text>
                  </View>
                </View>
                <Text style={styles.vsText}>AT</Text>
                <View style={styles.teamHeaderCol}>
                  <Text style={styles.teamAbbr}>{matchup.HomeTeamAB}</Text>
                  <View style={[styles.pickCountBadge, { backgroundColor: ACCENT_COLOR }]}>
                    <Text style={styles.pickCountText}>{homePickers.length}</Text>
                  </View>
                </View>
              </View>
              {/* Rows */}
              <View style={styles.pickersRow}>
                <View style={[styles.pickersCol, { borderRightWidth: 1, borderColor: '#333' }]}>
                  {awayPickers.map(u => (
                    <View key={u.uid} style={styles.pickerItem}>
                      <Image source={u.avatarUri ? { uri: u.avatarUri } : null} style={styles.miniAvatar} />
                      <Text style={styles.pickerName} numberOfLines={1}>{u.name || u.username}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.pickersCol}>
                  {homePickers.map(u => (
                    <View key={u.uid} style={styles.pickerItem}>
                      <Image source={u.avatarUri ? { uri: u.avatarUri } : null} style={styles.miniAvatar} />
                      <Text style={styles.pickerName} numberOfLines={1}>{u.name || u.username}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SECONDARY_COLOR} />}
        contentContainerStyle={{ padding: 15, paddingBottom: 40 }}
      >
        <Text style={styles.pageHeader}>SEASON STATS</Text>
        {renderBadges()}
        {renderCrystalBall()}
        {renderPieChart()}
        {renderBarChart()}
        {renderWeekBreakdown()}
      </ScrollView>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={SECONDARY_COLOR} />
          <Text style={{ color: TEXT_COLOR_MAIN, marginTop: 10 }}>Crunching Season Data...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PRIMARY_COLOR },
  pageHeader: { color: TEXT_COLOR_MAIN, fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  sectionTitle: { color: SECONDARY_COLOR, fontSize: 14, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 },
  chartCard: {
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardTitle: { color: TEXT_COLOR_SUB, fontSize: 12, fontWeight: 'bold', marginBottom: 10, alignSelf: 'flex-start' },
  noDataText: { color: TEXT_COLOR_SUB, fontStyle: 'italic', marginVertical: 20 },
  accuracyText: { color: TEXT_COLOR_MAIN, fontSize: 16, fontWeight: 'bold', marginTop: 10 },

  // Badges
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  badgeCard: {
    backgroundColor: CARD_BACKGROUND,
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  badgeValue: { color: TEXT_COLOR_MAIN, fontSize: 18, fontWeight: 'bold', marginVertical: 4 },
  badgeLabel: { color: TEXT_COLOR_SUB, fontSize: 10, fontWeight: 'bold' },

  // Crystal Ball
  crystalBallCard: {
    backgroundColor: '#262A4A', // Slightly purple tint
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#9575CD',
  },
  crystalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  crystalTitle: { color: '#D1C4E9', fontWeight: 'bold', fontSize: 14 },
  crystalSub: { color: '#B39DDB', fontSize: 11, marginBottom: 10, fontStyle: 'italic' },
  crystalContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  crystalBigText: { color: '#EDE7F6', fontSize: 32, fontWeight: 'bold' },
  crystalSmallText: { color: '#D1C4E9', fontSize: 12 },


  // Locked State
  lockedContainer: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SECONDARY_COLOR,
    borderStyle: 'dashed',
    marginTop: 20,
  },
  lockedTitle: { color: TEXT_COLOR_MAIN, fontSize: 18, fontWeight: 'bold', marginTop: 10 },
  lockedSub: { color: TEXT_COLOR_SUB, textAlign: 'center', marginTop: 5 },

  // Matchup Breakdown
  matchupCard: {
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  matchupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderBottomWidth: 1,
    borderColor: '#333',
  },
  teamHeaderCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    justifyContent: 'center'
  },
  teamAbbr: {
    color: TEXT_COLOR_MAIN,
    fontWeight: '900',
    fontSize: 16,
    textAlign: 'center'
  },
  vsText: {
    color: TEXT_COLOR_SUB,
    fontSize: 10,
    fontWeight: 'bold',
    marginHorizontal: 10
  },
  pickCountBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  pickCountText: { color: '#000', fontSize: 10, fontWeight: 'bold' },

  pickersRow: { flexDirection: 'row', minHeight: 60 },
  pickersCol: { flex: 1, padding: 10, gap: 8 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#555' },
  pickerName: { color: TEXT_COLOR_SUB, fontSize: 12, flex: 1 },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 27, 42, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  }

});

export default StatsScreen;