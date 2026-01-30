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
  KeyboardAvoidingView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams, Link, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import * as Linking from 'expo-linking'; // Ensure Linking is imported

// Colors and Constants
const PRIMARY_COLOR = '#1f366a';
const TEXT_COLOR_LIGHT = '#FFFFFF';
const TEXT_COLOR_DARK = '#333333';
const CARD_BACKGROUND_LIGHT = '#F0F4F7';
const CARD_BACKGROUND_DARK = '#E8EAF6';
const BORDER_COLOR = '#B0BEC5';
const MYSPACE_BLUE_ACCENT = '#3B5998';
const MYSPACE_PINK_ACCENT = '#FF69B4';
const INPUT_BACKGROUND = '#FFFFFF';
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
        {iconName && <Ionicons name={iconName} size={20} color={MYSPACE_BLUE_ACCENT} style={{ marginRight: 8 }} />}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {isOwnProfile && onEditPress && (
        <TouchableOpacity onPress={onEditPress} style={styles.editSectionButton}>
          <Ionicons name={isEditing ? 'close-circle-outline' : 'pencil-outline'} size={22} color={MYSPACE_BLUE_ACCENT} />
        </TouchableOpacity>
      )}
    </View>
    <View style={styles.sectionContent}>{children}</View>
  </View>
));


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
      const userDocRef = doc(db, "users", profileUserId);
      const commentsCollectionRef = collection(db, "users", profileUserId, "comments");
      const commentsQuery = query(commentsCollectionRef, orderBy('timestamp', 'desc'));
      const usersCollectionRef = collection(db, "users");
      const allMatchupsPromise = fetchMatchupsFromYahoo();
      const picksCollectionRef = collection(db, "users", profileUserId, "picks");
      const picksSnapshotPromise = getDocs(picksCollectionRef);

      const [userDocSnap, commentsSnapshot, usersSnapshot, allMatchups, picksSnapshot] = await Promise.all([
        getDoc(userDocRef),
        getDocs(commentsQuery),
        getDocs(usersCollectionRef),
        allMatchupsPromise,
        picksSnapshotPromise
      ]);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        setProfileData(userData);
        setAboutMeText(userData.aboutMe || "Tell everyone a little about yourself!");
        const foundMood = MOOD_OPTIONS.find(mood => mood.id === userData.moodId);
        setCurrentMood(foundMood || DEFAULT_MOOD);
        // UPDATED: Get avatar URI from Firestore document
        setProfileImageUri(userData.avatarUri || null);
      } else { Alert.alert("Error", "Profile not found."); }

      const allUsers = (usersSnapshot && Array.isArray(usersSnapshot.docs))
        ? usersSnapshot.docs.map(doc => doc.data())
        : [];
      const userMap = new Map(allUsers.map(u => [u.uid, u]));

      const fetchedComments = commentsSnapshot.docs.map(doc => {
        const commentData = { id: doc.id, ...doc.data() };
        const author = userMap.get(commentData.authorId);
        // Get the author's avatar from the map we already created
        return { ...commentData, authorAvatarUri: author?.avatarUri || null };
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

  const handlePickImage = async () => {
    if (!isOwnProfile || !profileUserId) return;
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission Required", "You need to allow access to your photos.");
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5,
    });
    if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
      const imageUri = pickerResult.assets[0].uri;
      setProfileImageUri(imageUri); // Optimistically update UI
      try {
        // UPDATED: Save the URI to Firestore instead of AsyncStorage
        const userDocRef = doc(db, "users", profileUserId);
        await updateDoc(userDocRef, { avatarUri: imageUri });
        Alert.alert("Success", "Profile picture updated!");
      } catch (e) {
        console.error("Failed to save profile image URI to Firestore:", e);
        Alert.alert("Error", "Could not save profile picture.");
        setProfileImageUri(profileData.avatarUri || null);
      }
    }
  };

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
        <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back-outline" size={28} color={TEXT_COLOR_LIGHT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{profileData.username || profileData.name}'s </Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
          <View style={styles.profileHeader}>
            <TouchableOpacity onPress={handlePickImage} disabled={!isOwnProfile} style={styles.profilePicContainer}>
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} style={styles.profileImage} />
              ) : (
                <Ionicons name="person-circle-outline" size={width * 0.3} color={PRIMARY_COLOR} />
              )}
              {isOwnProfile && (
                <View style={styles.editIconOverlay}>
                  <Ionicons name="camera-outline" size={20} color={TEXT_COLOR_LIGHT} />
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.profileName}>{profileData.name}</Text>
            <Text style={styles.profileUsername}>"{profileData.username}"</Text>
            <View style={styles.moodContainer}>
              {isEditingMood && isOwnProfile ? (
                <TouchableOpacity style={[styles.actionButton, styles.cancelButton, styles.moodEditToggleButton]} onPress={() => setIsEditingMood(false)}>
                  <Text style={styles.actionButtonText}>Done</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.moodDisplay} onPress={() => isOwnProfile && setIsEditingMood(true)} disabled={!isOwnProfile}>
                  <Text style={styles.profileStatus}>Mood: {currentMood.emoji} {currentMood.text}</Text>
                  {isOwnProfile && <Ionicons name="pencil-outline" size={16} color={MYSPACE_PINK_ACCENT} style={{ marginLeft: 5 }} />}
                </TouchableOpacity>
              )}
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
                <TouchableOpacity onPress={() => router.push('/(app)/stats')}>
                  <Text style={styles.linkText}>View Full Stats Breakdown</Text>
                </TouchableOpacity>
              </ProfileSection>
            </View>

            <View style={styles.rightColumn}>
              <ProfileSection title="Managers" iconName="people-outline">
                {leagueMates.length > 0 ? leagueMates.slice(0, 12).map(mate => (
                  <Link key={mate.uid} href={{ pathname: '/(app)/home/profile', params: { userId: mate.uid } }} asChild>
                    <TouchableOpacity style={styles.friendItemContainer}>
                      <Ionicons name="person-outline" size={16} color={MYSPACE_BLUE_ACCENT} style={{ marginRight: 5 }} />
                      <Text style={styles.friendItem}>{mate.name || mate.username}</Text>
                    </TouchableOpacity>
                  </Link>
                )) : <Text style={styles.smallTextMuted}>No other managers found.</Text>}
                {leagueMates.length > 8 && <Text style={styles.linkText}>...and more!</Text>}
              </ProfileSection>

              <ProfileSection title="The League Record" iconName="football-outline">
                <TouchableOpacity
                  style={styles.yahooLinkButton}
                  onPress={() => Linking.openURL('https://football.fantasysports.yahoo.com/f1/66645?lhst=stand#leaguehomestandings')}
                >
                  <Ionicons name="logo-yahoo" size={30} color={TEXT_COLOR_LIGHT} style={{ marginRight: 8 }} />
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
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={TEXT_COLOR_LIGHT} style={{ marginRight: 5 }} />
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
      </View>
    </KeyboardAvoidingView>
  );
};

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#DCE1E8',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
  },
  loadingText: {
    marginTop: 10,
    color: TEXT_COLOR_DARK,
  },
  errorText: {
    color: TEXT_COLOR_DARK,
    textAlign: 'center',
  },
  header: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 15,
    paddingVertical: 15,
    paddingTop: Platform.select({ android: StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 20, ios: 40, default: 20 }),
    alignItems: 'center',
    flexDirection: 'row',
  },
  backButton: {
    marginRight: 95,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TEXT_COLOR_LIGHT,
    flexShrink: 1,
  },
  scrollView: {
    backgroundColor: '#fff',
  },
  profileHeader: {
    backgroundColor: CARD_BACKGROUND_DARK,
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderColor: MYSPACE_BLUE_ACCENT,
  },
  profilePicContainer: {
    width: width * 0.35,
    height: width * 0.35,
    borderRadius: (width * 0.35) / 8,
    borderWidth: 3,
    borderColor: MYSPACE_BLUE_ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#FFF',
    position: 'relative',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: (width * 0.35) / 8 - 3,
  },
  editIconOverlay: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 5,
    borderRadius: 15,
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
    marginBottom: 2,
  },
  profileUsername: {
    fontSize: 16,
    fontStyle: 'italic',
    color: TEXT_COLOR_DARK,
    marginBottom: 5,
  },
  profileStatus: {
    fontSize: 14,
    color: MYSPACE_PINK_ACCENT,
    fontWeight: '600',
  },
  moodContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  moodDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  moodSelectorContainer: {
    marginHorizontal: 10,
    marginVertical: 10,
    padding: 10,
    backgroundColor: CARD_BACKGROUND_DARK,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  moodSelectorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
    marginBottom: 10,
    textAlign: 'center',
  },
  moodOption: {
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  moodOptionText: {
    fontSize: 16,
    color: TEXT_COLOR_DARK,
  },
  moodEditToggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    padding: 10,
  },
  leftColumn: {
    flex: 2,
    marginRight: 5,
  },
  rightColumn: {
    flex: 1,
    marginLeft: 5,
  },
  profileSection: {
    backgroundColor: CARD_BACKGROUND_LIGHT,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    marginBottom: 15,
    padding: 0,
    overflow: 'hidden',
  },
  sectionTitleContainer: {
    backgroundColor: CARD_BACKGROUND_DARK,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderColor: BORDER_COLOR,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editSectionButton: {
    padding: 5,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: PRIMARY_COLOR,
  },
  sectionContent: {
    flex: 1,
    padding: 12,
  },
  aboutMeText: {
    fontSize: 14,
    lineHeight: 20,
    color: TEXT_COLOR_DARK,
    minHeight: 60,
  },
  textInputBio: {
    textAlign: 'left',   // <== Important
    writingDirection: 'ltr', // Optional
    backgroundColor: INPUT_BACKGROUND,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 5,
    color: TEXT_COLOR_DARK,
  },
  textInput: {
    textAlign: 'left',   // <== Important
    writingDirection: 'ltr', // Optional
    backgroundColor: INPUT_BACKGROUND,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    fontSize: 14,
    marginBottom: 10,
    color: TEXT_COLOR_DARK,
  },
  charCount: {
    fontSize: 12,
    color: '#777',
    textAlign: 'right',
    marginBottom: 10,
  },
  editButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 5,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 4,
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: MYSPACE_BLUE_ACCENT,
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  cancelButton: {
    backgroundColor: '#757575',
  },
  postButton: {
    backgroundColor: MYSPACE_PINK_ACCENT,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  actionButtonText: {
    color: TEXT_COLOR_LIGHT,
    fontWeight: '600',
    fontSize: 14,
  },
  statsText: {
    fontSize: 14,
    color: TEXT_COLOR_DARK,
    marginBottom: 5,
  },
  friendItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  friendItem: {
    fontSize: 14,
    color: TEXT_COLOR_DARK,
  },
  linkText: {
    color: MYSPACE_BLUE_ACCENT,
    marginTop: 8,
    fontWeight: '600',
  },
  trophyContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 5,
  },
  smallText: {
    fontSize: 12,
    color: '#777',
    textAlign: 'center',
  },
  smallTextMuted: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  footerCommentSection: {
    margin: 10,
    padding: 10,
    backgroundColor: CARD_BACKGROUND_DARK,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  commentInput: {
    minHeight: 60,
    textAlignVertical: 'top',
    backgroundColor: INPUT_BACKGROUND,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    fontSize: 14,
    color: TEXT_COLOR_DARK,
  },
  postButton: {
    backgroundColor: MYSPACE_PINK_ACCENT,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  commentsList: {
    marginTop: 15,
  },
  commentItem: {
    backgroundColor: CARD_BACKGROUND_LIGHT,
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentAvatar: {
    marginRight: 10,
  },
  commentAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16, // Makes it a circle
  },
  commentAuthorInfo: {
    flexDirection: 'column',
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TEXT_COLOR_DARK,
  },
  commentTimestamp: {
    fontSize: 12,
    color: '#666',
  },
  commentText: {
    fontSize: 14,
    color: TEXT_COLOR_DARK,
    lineHeight: 20,
  },
  smallTextMuted: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
    textAlign: 'center'
  },
  commentMeta: {
    fontSize: 10,
    color: '#777',
    marginTop: 5,
    textAlign: 'right',
  },
  yahooLinkButton: {
    backgroundColor: '#500095', // Yahoo Purple
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  yahooLinkButtonText: {
    color: TEXT_COLOR_LIGHT,
    fontWeight: 'bold',
    fontSize: 10,
  },
  commentAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  }
});

export default ProfileScreen;