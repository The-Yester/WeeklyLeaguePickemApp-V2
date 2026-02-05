// app/(app)/home/profile.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  Platform,
  StatusBar,
  TouchableOpacity,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { useRouter, useLocalSearchParams, Link, useFocusEffect, Stack } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import * as Linking from 'expo-linking'; // Ensure Linking is imported
import { getLeagueStandings } from '../../src/services/yahooFantasy'; // [NEW] Import Standings

// --- THEME COLORS (Match Home Screen) ---
const PRIMARY_COLOR = '#0D1B2A';    // Deep Navy Background
const SECONDARY_COLOR = '#00E5FF';  // Cyan (Accents, Buttons)
const ACCENT_COLOR = '#00E676';     // Green (Highlights, Success)
const CARD_BACKGROUND = '#1B263B';  // Lighter Navy for Cards
const TEXT_COLOR_MAIN = '#FFFFFF';  // White text for dark mode
const TEXT_COLOR_SUB = '#B0BEC5';   // Light Grey for subtitles
const { width } = Dimensions.get('window');
const MAX_BIO_LENGTH = 120;
const MOOD_OPTIONS = [
  { id: 'ready', emoji: '🏈', text: 'Ready for Kickoff!' },
  { id: 'excited', emoji: '🎉', text: 'Excited for the games!' },
  { id: 'nervous', emoji: '😬', text: 'Nervous about my picks...' },
  { id: 'confident', emoji: '😎', text: 'Feeling confident!' },
  { id: 'studying', emoji: '🤔', text: 'Analyzing matchups...' },
  { id: 'celebrating', emoji: '🥳', text: 'Celebrating a W!' },
  { id: 'chill', emoji: '😌', text: 'Just chillin\'' },
  { id: 'focused', emoji: '🎯', text: 'Focused on the win.' },
  { id: 'superstitious', emoji: '🧦', text: 'Wearing my lucky socks!' },
  { id: 'anxious', emoji: '😰', text: 'This could go either way...' },
  { id: 'pumped', emoji: '💪', text: 'Pumped for the action!' },
  { id: 'vibes', emoji: '😌', text: 'Just here for the vibes.' },
  { id: 'competitive', emoji: '🥇', text: 'I’m in it to win it.' },
  { id: 'skeptical', emoji: '🤨', text: 'Not sure about these matchups...' }
];
const DEFAULT_MOOD = MOOD_OPTIONS[0];
// --- Configuration ---
// Removed Google Sheets Config

// parseSheetData removed

// This component is now defined outside to prevent re-creation on every render.
const ProfileSection = React.memo(({ title, children, iconName, onEditPress, isEditing, isOwnProfile }) => (
  <View style={styles.profileSection}>
    <View style={styles.sectionTitleContainer}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        {iconName && <Ionicons name={iconName} size={20} color={SECONDARY_COLOR} style={{ marginRight: 8 }} />}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {isOwnProfile && onEditPress && (
        <TouchableOpacity onPress={onEditPress} style={styles.editSectionButton}>
          <Ionicons name={isEditing ? 'close-circle-outline' : 'pencil-outline'} size={22} color={SECONDARY_COLOR} />
        </TouchableOpacity>
      )}
    </View>
    <View style={styles.sectionContent}>{children}</View>
  </View>
));


// --- GAMIFICATION HELPERS ---
const getBadges = (stats, rank) => {
  const badges = [];
  if (stats.accuracy >= 70) badges.push({ id: 'oracle', name: 'The Oracle', icon: 'eye', color: '#B388FF' });
  if (stats.accuracy >= 50 && stats.accuracy < 70) badges.push({ id: 'sharp', name: 'Sharp', icon: 'analytics', color: '#69F0AE' });
  if (rank === 1) badges.push({ id: 'champ', name: 'The Champ', icon: 'trophy', color: '#FFD700' });
  if (rank > 8) badges.push({ id: 'tank', name: 'The Tank', icon: 'construct', color: '#A1887F' });
  if (stats.correctPicks > 10) badges.push({ id: 'vet', name: 'Veteran', icon: 'ribbon', color: '#40C4FF' });
  // Default Badge
  if (badges.length === 0) badges.push({ id: 'rookie', name: 'Rookie', icon: 'leaf', color: '#81C784' });
  return badges;
};

const getSpiritAnimal = (rank, accuracy) => {
  if (rank === 1) return { animal: 'Lion', icon: 'paw', desc: 'King of the Jungle', color: '#FFD54F' };
  if (accuracy > 65) return { animal: 'Hawk', icon: 'eye-outline', desc: 'Eyes on the Prize', color: '#4FC3F7' };
  if (rank > 8) return { animal: 'Turtle', icon: 'happy-outline', desc: 'Slow & Steady', color: '#AED581' };
  return { animal: 'Fox', icon: 'flash-outline', desc: 'Cunning & Quick', color: '#FF8A65' };
};

const ProfileScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user: loggedInUser } = useAuth();

  const profileUserId = params.userId || loggedInUser?.uid;
  const isOwnProfile = !params.userId || params.userId === loggedInUser?.uid;

  const [isLoading, setIsLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [aboutMeText, setAboutMeText] = useState('');
  const [isEditingAboutMe, setIsEditingAboutMe] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState(null);
  const [currentMood, setCurrentMood] = useState(DEFAULT_MOOD);
  const [isEditingMood, setIsEditingMood] = useState(false);
  const [leagueMates, setLeagueMates] = useState([]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [userStats, setUserStats] = useState({ correctPicks: 0, incorrectPicks: 0, accuracy: 0, gamesGraded: 0 });
  const [isLoadingStatsData, setIsLoadingStatsData] = useState(true);

  // Helper function to calculate stats
  const calculateStats = (matchups, userPicks) => {
    setIsLoadingStatsData(true);
    let correct = 0, incorrect = 0, totalPickedAndCompleted = 0;
    if (matchups && userPicks) {
      matchups.forEach(matchup => {
        if (matchup.UniqueID && matchup.WinningTeam && String(matchup.WinningTeam).trim() !== '') {
          const userPickForGame = userPicks.find(p => p.gameUniqueID === matchup.UniqueID);
          if (userPickForGame) {
            totalPickedAndCompleted++;
            const winningTeam = String(matchup.WinningTeam).trim();
            let winnerAbbr = '';
            if (String(matchup.HomeTeamName || '').trim() === winningTeam) winnerAbbr = String(matchup.HomeTeamAB || '').trim().toUpperCase();
            else if (String(matchup.AwayTeamName || '').trim() === winningTeam) winnerAbbr = String(matchup.AwayTeamAB || '').trim().toUpperCase();
            else winnerAbbr = winningTeam.toUpperCase();

            if (userPickForGame.pickedTeamAbbr.toUpperCase() === winnerAbbr) {
              correct++;
            } else {
              incorrect++;
            }
          }
        }
      });
    }
    const accuracy = totalPickedAndCompleted > 0 ? (correct / totalPickedAndCompleted) * 100 : 0;
    setUserStats({ correctPicks: correct, incorrectPicks: incorrect, accuracy, gamesGraded: totalPickedAndCompleted });
    setIsLoadingStatsData(false);
  };

  const fetchMatchupsFromYahoo = useCallback(async () => {
    try {
      const { getWeeklyMatchups } = require('../../src/services/yahooFantasy');
      // Fetching "all" matchups for stats.
      // For MVP, we will fetch just the current week (defaulting to 1).
      const week = 1;
      const matchups = await getWeeklyMatchups(week);
      return matchups;
    } catch (err) {
      console.error("Failed to fetch Yahoo matchups:", err);
      throw err;
    }
  }, []);

  // This is the single, orchestrated function to load all data for the screen.
  const loadAllData = useCallback(async () => {
    if (!profileUserId) {
      setIsLoading(false);
      return;
    }

    console.log(`ProfileScreen: Loading all data for user: ${profileUserId}`);
    setIsLoading(true);
    try {
      // 1. Fetch User Data from Firestore
      const userDocRef = doc(db, "users", profileUserId);
      const commentsCollectionRef = collection(db, "users", profileUserId, "comments");
      const commentsQuery = query(commentsCollectionRef, orderBy('timestamp', 'desc'));
      const usersCollectionRef = collection(db, "users");
      const picksCollectionRef = collection(db, "users", profileUserId, "picks");

      const userDocSnap = await getDoc(userDocRef);

      let userData = null;
      let leagueKeyToUse = null;

      if (userDocSnap.exists()) {
        userData = userDocSnap.data();
        setProfileData(userData);
        setAboutMeText(userData.aboutMe || "Tell everyone a little about yourself!");
        const foundMood = MOOD_OPTIONS.find(mood => mood.id === userData.moodId);
        setCurrentMood(foundMood || DEFAULT_MOOD);
        setProfileImageUri(userData.avatarUri || userData.teamLogo || null);

        leagueKeyToUse = userData.leagueKey;
      } else {
        Alert.alert("Error", "Profile not found.");
        setIsLoading(false);
        return;
      }

      // 2. Prepare Promisses for Parallel Fetching dependent on User Data
      //    (Matchups need leagueKey)
      let allMatchupsPromise = Promise.resolve([]);
      if (leagueKeyToUse) {
        const { getWeeklyMatchups } = require('../../src/services/yahooFantasy');
        allMatchupsPromise = getWeeklyMatchups('current', leagueKeyToUse)
          .catch(err => { console.warn("Matchups fetch failed:", err); return []; });
      }

      const yahooProfilePromise = (async () => {
        try {
          const { getUserProfile } = require('../../src/services/yahooFantasy');
          return await getUserProfile();
        } catch (e) { console.warn("Yahoo Profile Fetch Error:", e); return null; }
      })();

      const [commentsSnapshot, usersSnapshot, allMatchups, picksSnapshot, userGlobalProfile] = await Promise.all([
        getDocs(commentsQuery),
        getDocs(usersCollectionRef),
        allMatchupsPromise,
        getDocs(picksCollectionRef),
        yahooProfilePromise
      ]);

      // 3. Process Yahoo Standings (Needs leagueKey & teamKey)
      if (userData.leagueKey && userData.teamKey) {
        const { getUserStanding } = require('../../src/services/yahooFantasy');
        try {
          const standing = await getUserStanding(userData.leagueKey, userData.teamKey);
          if (standing) {
            setProfileData(prev => ({
              ...prev,
              record: `${standing.wins}-${standing.losses}-${standing.ties}`,
              rank: standing.rank,
              points: standing.points,
              teamLogo: standing.logo_url
            }));
            if (standing.logo_url) {
              setProfileImageUri(standing.logo_url);
            }
          }
        } catch (err) { console.warn("Failed to fetch user standing record:", err); }

        // [NEW] Fetch All Standings for Badge Context if needed (usually rank is enough)
        // We already got specific user standing, which is enough for MVP gamification.
      }

      // 4. Process Remaining Data
      const allUsers = (usersSnapshot && Array.isArray(usersSnapshot.docs))
        ? usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }))
        : [];
      const userMap = new Map(allUsers.map(u => [u.uid, u]));

      const fetchedComments = commentsSnapshot.docs.map(doc => {
        const commentData = { id: doc.id, ...doc.data() };
        const author = userMap.get(commentData.authorId);
        return { ...commentData, authorAvatarUri: author?.avatarUri || author?.teamLogo || null };
      });

      setComments(fetchedComments);
      setLeagueMates(allUsers.filter(u => u.uid !== profileUserId));

      let allPicksForUser = [];
      picksSnapshot.forEach((weekDoc) => {
        const weekPicks = weekDoc.data();
        for (const gameUniqueID in weekPicks) {
          allPicksForUser.push({ gameUniqueID, pickedTeamAbbr: weekPicks[gameUniqueID] });
        }
      });
      calculateStats(allMatchups, allPicksForUser);

    } catch (e) {
      console.error("ProfileScreen: Failed to load profile data:", e);
      Alert.alert("Error", "Could not load profile data.");
    } finally {
      setIsLoading(false);
    }
  }, [profileUserId, fetchMatchupsFromYahoo]);

  // CORRECTED: useFocusEffect now calls the async function inside a standard function
  useFocusEffect(
    useCallback(() => {
      const fetchData = () => {
        loadAllData();
      };

      fetchData();

      return () => {
        // Optional cleanup function can go here
        console.log("Leaving Profile Screen");
      };
    }, [loadAllData])
  );



  const handleSaveAboutMe = async () => {
    if (!isOwnProfile || !profileUserId) return;
    try {
      const userDocRef = doc(db, "users", profileUserId);
      await updateDoc(userDocRef, { aboutMe: aboutMeText });
      setIsEditingAboutMe(false);
      Alert.alert("Success", "Your bio has been updated!");
    } catch (e) { console.error("Failed to save About Me to Firestore:", e); }
  };

  const handleSelectMood = async (selectedMood) => {
    if (!isOwnProfile || !profileUserId) return;
    setCurrentMood(selectedMood);
    try {
      const userDocRef = doc(db, "users", profileUserId);
      await updateDoc(userDocRef, { moodId: selectedMood.id });
      setIsEditingMood(false);
    } catch (e) { console.error("Failed to save mood to Firestore:", e); }
  };

  const handleAddComment = async () => {
    if (!loggedInUser || !loggedInUser.uid || !profileUserId) {
      Alert.alert("Error", "You must be logged in to post a comment.");
      return;
    }
    if (!newComment.trim()) {
      Alert.alert("Empty Note", "Please write something to post.");
      return;
    }
    try {
      const commentsCollectionRef = collection(db, "users", profileUserId, "comments");
      await addDoc(commentsCollectionRef, {
        text: newComment.trim(),
        authorName: loggedInUser.name || loggedInUser.username,
        authorId: loggedInUser.uid,
        timestamp: serverTimestamp(),
      });
      setNewComment('');
      Alert.alert("Success", "Your comment has been posted!");
      loadAllData();
    } catch (e) {
      console.error("Failed to add comment:", e);
      Alert.alert("Error", "Could not post your comment.");
    }
  };

  if (isLoading) { return <View style={styles.centered}><ActivityIndicator size="large" color={PRIMARY_COLOR} /></View>; }
  if (!profileData) { return <View style={styles.centered}><Text style={styles.errorText}>Profile not found.</Text></View>; }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back-outline" size={28} color={TEXT_COLOR_MAIN} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {profileData.teamName ? `${profileData.teamName} Profile` : "Profile"}
          </Text>
          {/* Spacer to balance title if needed, or remove for left alignment preference */}
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">

          {/* [NEW] Profile Header - Grid Layout */}
          <View style={styles.profileHeader}>
            <View style={styles.profileHeaderGrid}>

              {/* Left Column: Logo & Name */}
              <View style={styles.profileLeftCol}>
                <View style={styles.profilePicContainer}>
                  {profileImageUri ? (
                    <Image source={{ uri: profileImageUri }} style={styles.profileImage} />
                  ) : (
                    <View style={[styles.profileImage, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)' }]}>
                      <Ionicons name="shield-outline" size={40} color={TEXT_COLOR_SUB} />
                    </View>
                  )}
                </View>
                <Text style={styles.teamNameMain} numberOfLines={2}>
                  {profileData.teamName || "Unknown Team"}
                </Text>
                {profileData.name && <Text style={styles.managerName}>Mgr: {profileData.name}</Text>}
              </View>

              {/* Right Column: Stats & Mood */}
              <View style={styles.profileRightCol}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>FANTASY FOOTBALL RECORD</Text>
                  <Text style={[styles.statValue, { color: ACCENT_COLOR }]}>
                    {profileData.record || '0-0-0'}
                  </Text>
                </View>

                <View style={styles.statRowSplit}>
                  <View style={styles.statBoxSmall}>
                    <Text style={styles.statLabel}>FF RANK</Text>
                    <Text style={[styles.statValue, { color: SECONDARY_COLOR }]}>
                      #{profileData.rank || '-'}
                    </Text>
                  </View>
                  <View style={styles.statBoxSmall}>
                    <Text style={styles.statLabel}>FF PTS</Text>
                    <Text style={styles.statValue}>
                      {profileData.points ? profileData.points.toFixed(1) : '0'}
                    </Text>
                  </View>
                </View>

                {/* Mood Section Moved Here */}
                <View style={styles.moodSection}>
                  {isEditingMood && isOwnProfile ? (
                    <TouchableOpacity style={styles.moodEditButton} onPress={() => setIsEditingMood(false)}>
                      <Text style={styles.moodEditText}>Save Mood</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.moodDisplay} onPress={() => isOwnProfile && setIsEditingMood(true)} disabled={!isOwnProfile}>
                      <Text style={styles.moodText}>{currentMood.emoji} {currentMood.text}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

            </View>
          </View>

          {isEditingMood && isOwnProfile && (
            <View style={styles.moodSelectorContainer}>
              <Text style={styles.moodSelectorTitle}>Select Your Mood:</Text>
              {MOOD_OPTIONS.map(mood => (
                <TouchableOpacity key={mood.id} style={styles.moodOption} onPress={() => handleSelectMood(mood)}>
                  <Text style={styles.moodOptionText}>{mood.emoji} {mood.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.mainContent}>
            <View style={styles.leftColumn}>
              <ProfileSection
                title="About Me"
                iconName="information-circle-outline"
                onEditPress={() => setIsEditingAboutMe(!isEditingAboutMe)}
                isEditing={isEditingAboutMe}
                isOwnProfile={isOwnProfile}
              >
                {isEditingAboutMe ? (
                  <>
                    <TextInput
                      style={styles.textInputBio}
                      multiline
                      maxLength={MAX_BIO_LENGTH}
                      onChangeText={setAboutMeText}
                      value={aboutMeText}
                      placeholder="Tell us about yourself..."
                      textAlignVertical="top"
                    />
                    <Text style={styles.charCount}>{MAX_BIO_LENGTH - aboutMeText.length} characters remaining</Text>
                    <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={handleSaveAboutMe}>
                      <Text style={styles.actionButtonText}>Save Bio</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={styles.aboutMeText}>{aboutMeText || "No bio yet. Tap the pencil to add one!"}</Text>
                )}
              </ProfileSection>

              {/* [NEW] BADGES & SPIRIT ANIMAL */}
              <View style={styles.gamificationRow}>
                <View style={styles.spiritAnimalCard}>
                  <View style={[styles.spiritIconBg, { backgroundColor: getSpiritAnimal(profileData.rank || 10, userStats.accuracy).color + '30' }]}>
                    <Ionicons name={getSpiritAnimal(profileData.rank || 10, userStats.accuracy).icon} size={24} color={getSpiritAnimal(profileData.rank || 10, userStats.accuracy).color} />
                  </View>
                  <View>
                    <Text style={styles.spiritTitle}>{getSpiritAnimal(profileData.rank || 10, userStats.accuracy).animal}</Text>
                    <Text style={styles.spiritDesc}>{getSpiritAnimal(profileData.rank || 10, userStats.accuracy).desc}</Text>
                  </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.badgeScroller}>
                  {getBadges(userStats, profileData.rank || 10).map(badge => (
                    <View key={badge.id} style={styles.badgeItem}>
                      <View style={[styles.badgeIcon, { backgroundColor: badge.color + '20', borderColor: badge.color }]}>
                        <Ionicons name={badge.icon} size={16} color={badge.color} />
                      </View>
                      <Text style={styles.badgeText}>{badge.name}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>

              <ProfileSection title="My Pick Stats" iconName="stats-chart-outline">
                {isLoadingStatsData ? (
                  <ActivityIndicator size="small" color={PRIMARY_COLOR} />
                ) : (
                  <>
                    <Text style={styles.statsText}>Correct Picks: {userStats.correctPicks}</Text>
                    <Text style={styles.statsText}>Incorrect Picks: {userStats.incorrectPicks}</Text>
                    <Text style={styles.statsText}>Games Graded: {userStats.gamesGraded}</Text>
                    <Text style={styles.statsText}>
                      Pick Accuracy: {userStats.accuracy.toFixed(1)}%
                    </Text>
                  </>
                )}
                <TouchableOpacity onPress={() => router.push('/appGroup/stats')}>
                  <Text style={styles.linkText}>View Full Stats Breakdown</Text>
                </TouchableOpacity>
              </ProfileSection>
            </View>

            <View style={styles.rightColumn}>
              <ProfileSection title="Managers" iconName="people-outline">
                {leagueMates.length > 0 ? leagueMates.slice(0, 12).map(mate => (
                  <View key={mate.uid}>
                    <Link href={{ pathname: '/(app)/home/profile', params: { userId: mate.uid } }} asChild>
                      <TouchableOpacity style={styles.friendItemContainer}>
                        <Ionicons name="person-outline" size={16} color={SECONDARY_COLOR} style={{ marginRight: 5 }} />
                        <Text style={styles.friendItem}>{mate.name || mate.username}</Text>
                      </TouchableOpacity>
                    </Link>
                  </View>
                )) : <Text style={styles.smallTextMuted}>No other managers found.</Text>}
                {leagueMates.length > 8 && <Text style={styles.linkText}>...and more!</Text>}
              </ProfileSection>

              <ProfileSection title="The League Record" iconName="football-outline">
                <TouchableOpacity
                  style={styles.yahooLinkButton}
                  onPress={() => Linking.openURL('https://football.fantasysports.yahoo.com/f1/66645?lhst=stand#leaguehomestandings')}
                >
                  <Ionicons name="logo-yahoo" size={30} color={TEXT_COLOR_MAIN} style={{ marginRight: 8 }} />
                  <Text style={styles.yahooLinkButtonText}>View on Y!</Text>
                </TouchableOpacity>
              </ProfileSection>
            </View>
          </View>

          <View style={styles.footerCommentSection}>
            <Text style={styles.sectionTitle}>Public Post / Smack Talk</Text>
            <TextInput
              style={[styles.textInput, styles.commentInput]}
              placeholder={`Leave a comment for ${profileData.name || 'this user'}...`}
              value={newComment}
              onChangeText={setNewComment}
              multiline={true}
            />
            <TouchableOpacity style={[styles.actionButton, styles.postButton]} onPress={handleAddComment}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={TEXT_COLOR_MAIN} style={{ marginRight: 5 }} />
              <Text style={styles.actionButtonText}>Post Comment</Text>
            </TouchableOpacity>
            <View style={styles.commentsList}>
              {comments.length > 0 ? comments.map(comment => {
                const timestamp = comment.timestamp ? new Date(comment.timestamp.toDate()).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '...';
                return (
                  <View key={comment.id} style={styles.commentItem}>
                    <View style={styles.commentHeader}>
                      <View style={styles.commentAvatar}>
                        {comment.authorAvatarUri ? (
                          <Image source={{ uri: comment.authorAvatarUri }} style={styles.commentAvatarImage} />
                        ) : (
                          <Ionicons name="person-circle" size={32} color={PRIMARY_COLOR} />
                        )}
                      </View>
                      <View style={styles.commentAuthorInfo}>
                        <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                        <Text style={styles.commentTimestamp}>{timestamp}</Text>
                      </View>
                    </View>
                    <Text style={styles.commentText}>{comment.text}</Text>
                  </View>
                )
              }) : <Text style={styles.smallTextMuted}>No comments yet. Be the first!</Text>}
            </View>
          </View>
        </ScrollView>
      </View >
    </KeyboardAvoidingView >
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY_COLOR, // Dark Background
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    backgroundColor: PRIMARY_COLOR,
  },
  loadingText: {
    marginTop: 10,
    color: TEXT_COLOR_MAIN,
  },
  errorText: {
    color: '#FF5252',
    textAlign: 'center',
  },
  header: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 15,
    paddingTop: Platform.select({ android: 10, ios: 50, default: 20 }), // Adjusted for non-translucent StatusBar
    paddingBottom: 15,
    alignItems: 'center',
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TEXT_COLOR_MAIN,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 38, // Balance back button width roughly
  },
  scrollView: {
    backgroundColor: 'transparent',
  },
  profileHeader: {
    backgroundColor: CARD_BACKGROUND,
    padding: 20,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 10,
  },
  // [NEW] GRID LAYOUT STYLES
  profileHeaderGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  profileLeftCol: {
    flex: 0.45,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 10,
  },
  profileRightCol: {
    flex: 0.55,
    justifyContent: 'center',
  },
  profilePicContainer: {
    width: width * 0.28,
    height: width * 0.28,
    borderRadius: (width * 0.28) / 8, // Squircle-ish
    borderWidth: 2,
    borderColor: SECONDARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: (width * 0.28) / 8 - 2,
  },
  teamNameMain: {
    fontSize: 18,
    fontWeight: 'bold',
    color: SECONDARY_COLOR,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 2,
    lineHeight: 22,
  },
  managerName: {
    fontSize: 12,
    color: TEXT_COLOR_SUB,
    textAlign: 'center',
  },
  // Stats Grid
  statBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statRowSplit: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statBoxSmall: {
    flex: 0.48,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statLabel: {
    fontSize: 10,
    color: TEXT_COLOR_SUB,
    fontWeight: 'bold',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TEXT_COLOR_MAIN,
  },
  statsText: {
    fontSize: 14,
    color: TEXT_COLOR_SUB,
    marginBottom: 5,
  },
  // Mood
  moodSection: {
    marginTop: 5,
    alignItems: 'center',
  },
  moodDisplay: {
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
  },
  moodText: {
    fontSize: 14,
    color: SECONDARY_COLOR,
    fontWeight: '600',
  },
  moodEditButton: {
    backgroundColor: SECONDARY_COLOR,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  moodEditText: {
    color: PRIMARY_COLOR,
    fontWeight: 'bold',
    fontSize: 12,
  },
  moodContainer: {
    // Redundant with new layout but kept for safety if referenced
    marginTop: 5,
    alignItems: 'center',
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: 10,
  },
  moodSelectorContainer: {
    marginHorizontal: 10,
    marginVertical: 10,
    padding: 10,
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  moodSelectorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: SECONDARY_COLOR,
    marginBottom: 10,
    textAlign: 'center',
  },
  moodOption: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    margin: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  selectedMoodOption: {
    backgroundColor: 'rgba(0, 229, 255, 0.2)',
    borderColor: SECONDARY_COLOR,
  },
  moodOptionText: {
    fontSize: 14,
    color: TEXT_COLOR_MAIN,
  },
  moodEditToggleButton: {
    // Legacy
  },

  // Content Layout
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    padding: 10,
  },
  leftColumn: {
    flex: 1, // Balanced columns
    marginRight: 5,
  },
  rightColumn: {
    flex: 1,
    marginLeft: 5,
  },

  // Sections
  profileSection: {
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 15,
    overflow: 'hidden',
  },
  sectionTitleContainer: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: SECONDARY_COLOR,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionContent: {
    padding: 12,
  },

  // Text & Inputs
  aboutMeText: {
    fontSize: 14,
    lineHeight: 20,
    color: TEXT_COLOR_SUB,
    minHeight: 40,
  },
  textInputBio: {
    textAlign: 'left',
    writingDirection: 'ltr',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    fontSize: 14,
    color: TEXT_COLOR_MAIN,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  charCount: {
    fontSize: 10,
    color: TEXT_COLOR_SUB,
    textAlign: 'right',
    marginBottom: 5,
  },
  editButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 5,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: ACCENT_COLOR,
  },
  cancelButton: {
    backgroundColor: '#546E7A',
  },
  actionButtonText: {
    color: '#000', // Buttons like Accent Color usually have dark text
    fontWeight: 'bold',
    fontSize: 12,
  },

  // Links & Lists
  friendItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  friendItem: {
    fontSize: 13,
    color: TEXT_COLOR_MAIN,
  },
  linkText: {
    color: SECONDARY_COLOR,
    marginTop: 8,
    fontWeight: '600',
    fontSize: 12,
  },
  smallTextMuted: {
    fontSize: 12,
    color: TEXT_COLOR_SUB,
    marginTop: 5,
    textAlign: 'center'
  },

  // Comments
  footerCommentSection: {
    margin: 10,
    padding: 10,
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  commentInput: {
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    fontSize: 14,
    color: TEXT_COLOR_MAIN,
    marginBottom: 10,
  },
  postButton: {
    backgroundColor: SECONDARY_COLOR,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  commentsList: {
    marginTop: 15,
  },
  commentItem: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: 'bold',
    color: SECONDARY_COLOR,
  },
  commentTimestamp: {
    fontSize: 10,
    color: TEXT_COLOR_SUB,
  },
  commentText: {
    fontSize: 14,
    color: TEXT_COLOR_MAIN,
    lineHeight: 20,
  },
  commentAvatarImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },

  // Misc
  yahooLinkButton: {
    backgroundColor: '#500095',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 5,
  },
  yahooLinkButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  editIconOverlay: { display: 'none' }, // Check if used

  // [NEW] Gamification Styles
  gamificationRow: {
    marginBottom: 15,
  },
  spiritAnimalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BACKGROUND,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  spiritIconBg: {
    width: 40, height: 40,
    borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  spiritTitle: {
    color: TEXT_COLOR_MAIN, fontWeight: 'bold', fontSize: 16,
  },
  spiritDesc: {
    color: TEXT_COLOR_SUB, fontSize: 12,
  },
  badgeScroller: {
    flexDirection: 'row',
  },
  badgeItem: {
    alignItems: 'center',
    marginRight: 15,
    width: 60,
  },
  badgeIcon: {
    width: 40, height: 40,
    borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
    marginBottom: 4,
  },
  badgeText: {
    color: TEXT_COLOR_SUB,
    fontSize: 10,
    textAlign: 'center',
  },
});

export default ProfileScreen;