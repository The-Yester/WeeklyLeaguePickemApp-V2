import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const YAHOO_BASE_URL = 'https://fantasysports.yahooapis.com/fantasy/v2';
// LEAGUE_KEY removed - now passed dynamically


// Helper to get headers with token
const getHeaders = async () => {
    let token = await SecureStore.getItemAsync('yahoo_access_token');

    // Fallback to AsyncStorage for legacy sessions
    if (!token) {
        token = await AsyncStorage.getItem('yahoo_access_token');
        if (token) {
            // Optional: Migrating it to SecureStore here helps subsequent calls
            await SecureStore.setItemAsync('yahoo_access_token', token);
        }
    }

    if (!token) {
        throw new Error('No Yahoo Access Token found. Please login.');
    }
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
};

// [NEW] Added Client ID for Refresh Flow
const YAHOO_CLIENT_ID = 'dj0yJmk9ZUJDMkJNYXJrOUt3JmQ9WVdrOU0yWmlOMGR3ZGtjbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWI5';
const YAHOO_TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token';

// Helper to refresh token
const refreshYahooAccessToken = async () => {
    try {
        console.log('🔄 Attempting to refresh Yahoo Access Token...');
        const refreshToken = await SecureStore.getItemAsync('yahoo_refresh_token');
        if (!refreshToken) {
            console.error('❌ No refresh token available in SecureStore.');
            throw new Error('No refresh token available. Please login again.');
        }

        const params = new URLSearchParams();
        params.append('client_id', YAHOO_CLIENT_ID);
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken);

        const response = await fetch(YAHOO_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('❌ Refresh Token Failed:', text);
            throw new Error(`Refresh Token Failed: ${text}`);
        }

        const data = await response.json();
        console.log('✅ Yahoo Token Refreshed Successfully!');

        // Save new tokens
        if (data.access_token) {
            await SecureStore.setItemAsync('yahoo_access_token', data.access_token);
        }
        if (data.refresh_token) {
            await SecureStore.setItemAsync('yahoo_refresh_token', data.refresh_token);
        }

        return data.access_token;

    } catch (e) {
        console.error('❌ Error refreshing token:', e);
        throw e;
    }
};

/**
 * Fetch Scoreboard directly from Yahoo API
 * This returns the matchups for a specific week or current week.
 */
export const getWeeklyMatchups = async (week = 'current', leagueKey) => {
    if (!leagueKey) throw new Error('getWeeklyMatchups requires a valid leagueKey');

    // Internal helper to perform the fetch with optional retry
    const performFetch = async (isRetry = false) => {
        const headers = await getHeaders();
        const weekParam = week === 'current' ? '' : `;week=${week}`;
        const url = `${YAHOO_BASE_URL}/league/${leagueKey}/scoreboard${weekParam}?format=json`;

        console.log(`🏈 Fetching Matchups (Week ${week}) - ${isRetry ? 'Retry' : 'Attempt 1'}`);

        const response = await fetch(url, { headers });

        if (!response.ok) {
            if (response.status === 401 && !isRetry) {
                console.warn('⚠️ Yahoo 401: Token expired. Refreshing...');
                await refreshYahooAccessToken();
                return performFetch(true); // Retry once
            }
            const text = await response.text();
            throw new Error(`Yahoo API Wrapper Error: ${response.status} ${text}`);
        }
        return response.json();
    };

    try {
        const data = await performFetch();

        // Parse the deep nested JSON from Yahoo
        const leagueData = data?.fantasy_content?.league;
        if (!leagueData) throw new Error('Invalid Yahoo API Response: Missing league data');

        // Robustly find 'scoreboard' in the league array/object
        let scoreboardWrapper = null;
        if (Array.isArray(leagueData)) {
            // It's mixed metadata and resources. Find the one with 'scoreboard'
            const sbNode = leagueData.find(x => x && x.scoreboard);
            scoreboardWrapper = sbNode?.scoreboard;
        } else {
            // Could be direct object
            scoreboardWrapper = leagueData.scoreboard;
        }

        if (!scoreboardWrapper) {
            console.warn('⚠️ No scoreboard found in Yahoo response.');
            return [];
        }

        // Robustly find 'matchups' in scoreboard
        let matchupsWrapper = null;
        if (scoreboardWrapper.matchups) {
            matchupsWrapper = scoreboardWrapper.matchups;
        } else if (scoreboardWrapper['0'] && scoreboardWrapper['0'].matchups) {
            matchupsWrapper = scoreboardWrapper['0'].matchups;
        } else {
            // Sometimes it's nested deep if 'scoreboard' is an object with '0' having the data
            const potentialMatchups = Object.values(scoreboardWrapper).find(val => val && val.matchups);
            if (potentialMatchups) matchupsWrapper = potentialMatchups.matchups;
        }

        if (!matchupsWrapper) {
            // Check if it's empty (no games this week)
            console.warn('⚠️ No matchups found in Scoreboard (possibly empty week).');
            return [];
        }

        const matchups = [];
        // Iterate keys to find numeric indices of matchups
        Object.keys(matchupsWrapper).forEach(key => {
            if (key !== 'count') {
                const matchupObj = matchupsWrapper[key]?.matchup;
                if (matchupObj) {
                    matchups.push(parseYahooMatchup(matchupObj));
                }
            }
        });

        console.log(`✅ Parsed ${matchups.length} matchups from Yahoo.`);
        return matchups;

    } catch (error) {
        console.error('❌ Error in getWeeklyMatchups:', error);
        throw error;
    }
};

/**
 * Transform Yahoo Matchup JSON to App's Flat Matchup Object
 */
const parseYahooMatchup = (yahooMatchup) => {
    let metadata = {};
    let teamsWrapper = {};

    // Robustly find metadata (status) and teams
    // yahooMatchup is likely an object or array wrapper

    // Normalize to array of values to search
    const parts = Array.isArray(yahooMatchup) ? yahooMatchup : Object.values(yahooMatchup);

    const metaPart = parts.find(p => p && p.status); // Find part with 'status'
    const teamsPart = parts.find(p => p && p.teams); // Find part with 'teams'

    if (metaPart) metadata = metaPart;
    if (teamsPart) teamsWrapper = teamsPart.teams;

    const teams = [];
    if (teamsWrapper) {
        Object.keys(teamsWrapper).forEach(key => {
            if (key !== 'count') {
                const teamWrapper = teamsWrapper[key]?.team;
                if (teamWrapper) teams.push(parseYahooTeam(teamWrapper));
            }
        });
    }

    const team1 = teams[0] || {};
    const team2 = teams[1] || {};

    // [FIX] Fallback for missing week
    const safeWeek = metadata.week ? Number(metadata.week) : 0;
    const safeWeekLabel = metadata.week || '?';

    return {
        UniqueID: `yahoo_${safeWeek}_${team1.team_key}_${team2.team_key}`,
        Week: safeWeek,
        isFinished: metadata.status === 'postevent',
        status: metadata.status,
        MatchURL: metadata.matchup_url,

        GameDate: 'Week ' + safeWeekLabel,
        GameTimeET: metadata.status === 'postevent' ? 'Final' : 'Scheduled',

        // Team 1 (Away)
        AwayTeamName: team1.name,
        AwayTeamAB: team1.name ? team1.name.substring(0, 3).toUpperCase() : 'T1',
        AwayTeamLogo: team1.logo_url,
        AwayTeamProjectedPoints: team1.projected_points,
        AwayTeamActualPoints: team1.points,

        // Team 2 (Home)
        HomeTeamName: team2.name,
        HomeTeamAB: team2.name ? team2.name.substring(0, 3).toUpperCase() : 'T2',
        HomeTeamLogo: team2.logo_url,
        HomeTeamProjectedPoints: team2.projected_points,
        HomeTeamActualPoints: team2.points,

        WinningTeam: metadata.winner_team_key === team1.team_key ? team1.name : (metadata.winner_team_key === team2.team_key ? team2.name : null)
    };
};

const parseYahooTeam = (teamWrapper) => {
    // teamWrapper is an array/object mix
    // Flatten it to find info
    let info = {};
    let points = 0;
    let projected_points = 0;

    const parts = Array.isArray(teamWrapper) ? teamWrapper : Object.values(teamWrapper);

    parts.forEach(part => {
        if (Array.isArray(part)) {
            // [CRITICAL FIX] Yahoo often puts the core metadata (name, logos) inside an array at index 0
            // We need to recursively flatten or iterate this array too.
            part.forEach(sub => {
                if (sub && typeof sub === 'object') {
                    if (sub.team_key) info = { ...info, ...sub };
                    if (sub.name) info = { ...info, ...sub };
                    if (sub.team_logos) info = { ...info, ...sub };
                }
            });
        } else if (typeof part === 'object' && part !== null) {
            if (part.team_key) info = { ...info, ...part };
            // Check keys directly on object
            if (part.name) info = { ...info, name: part.name };
            if (part.team_logos) info = { ...info, team_logos: part.team_logos };

            if (part.team_points) points = Number(part.team_points.total);
            if (part.team_projected_points) projected_points = Number(part.team_projected_points.total);
        }
    });

    const logo_url = info.team_logos && info.team_logos[0] ? info.team_logos[0].url : null;

    if (!info.name) {
        console.warn('⚠️ Parse Warning: Team Name missing. Key:', info.team_key, 'Raw:', JSON.stringify(teamWrapper).substring(0, 50) + "...");
    }

    return {
        team_key: info.team_key,
        name: info.name,
        logo_url,
        points,
        projected_points
    };
}

/**
 * Validates a user-provided League ID (e.g., '66645') against the user's actual Yahoo Leagues.
 * Returns the full league_key (e.g., '449.l.66645') and metadata if found.
 */
export const validateAndLinkLeague = async (userInputId) => {
    const performFetch = async (isRetry = false) => {
        const headers = await getHeaders();
        // Fetch User's Teams directly (users -> games -> leagues -> teams)
        // This gives us the League Metadata AND the User's Team in that league
        const url = `${YAHOO_BASE_URL}/users;use_login=1/games;game_codes=nfl/leagues/teams?format=json`;
        console.log(`🔍 Validating League & Team ID: ${userInputId} (Attempt ${isRetry ? 2 : 1})`);

        const response = await fetch(url, { headers });

        if (!response.ok) {
            if (response.status === 401 && !isRetry) {
                console.warn('⚠️ Yahoo 401 in Validation: Token expired. Refreshing...');
                await refreshYahooAccessToken();
                return performFetch(true);
            }
            const text = await response.text();
            throw new Error(`Yahoo API Wrapper Error: ${text}`);
        }
        return response.json();
    };

    try {
        const data = await performFetch();
        console.log("🔍 RAW YAHOO RESPONSE (Validation):", JSON.stringify(data, null, 2).substring(0, 200) + "...");

        const userObj = data?.fantasy_content?.users?.['0'];

        // Yahoo returns 'user' as an array: [ {guid:..}, {games:..} ]
        // We need to safely find the element that has 'games'
        const userArray = userObj?.user;
        let gamesWrapper = null;

        if (Array.isArray(userArray)) {
            const gamesNode = userArray.find(u => u.games);
            gamesWrapper = gamesNode?.games;
        } else {
            // Fallback if structure is flat (rare but possible in some endpoints)
            gamesWrapper = userObj?.games;
        }

        if (!gamesWrapper) {
            console.error('❌ Could not find "games" in user object:', JSON.stringify(userObj, null, 2));
            throw new Error('No NFL games found for this user.');
        }

        // Iterate through ALL games (seasons) returned
        let foundLeague = null;

        // gamesWrapper has a 'count' and then keys '0', '1', etc.
        Object.keys(gamesWrapper).forEach(gameKey => {
            if (gameKey !== 'count') {
                const gameNode = gamesWrapper[gameKey]?.game;
                let leaguesWrapper = null;

                // Yahoo often returns 'game' as an array: [ {metadata}, {leagues: ...} ]
                if (Array.isArray(gameNode)) {
                    const leagueNode = gameNode.find(g => g.leagues);
                    leaguesWrapper = leagueNode?.leagues;
                } else {
                    leaguesWrapper = gameNode?.leagues;
                }

                if (leaguesWrapper && leaguesWrapper.count > 0) {
                    Object.keys(leaguesWrapper).forEach(lKey => {
                        if (lKey !== 'count') {
                            const leagueEntry = leaguesWrapper[lKey]?.league;
                            // leagueEntry is usually array: [ {league_metadata}, {teams: ...} ]
                            if (Array.isArray(leagueEntry)) {
                                const leagueMeta = leagueEntry[0];
                                const teamsWrapper = leagueEntry.find(x => x.teams)?.teams;

                                if (String(leagueMeta.league_id) === String(userInputId)) {
                                    // Found the league! Now get the team.
                                    // teamsWrapper -> '0' -> team -> [ {team_meta}, ... ]
                                    const teamObj = teamsWrapper?.['0']?.team;
                                    const teamInfo = parseYahooTeam(teamObj); // Reuse our parser

                                    foundLeague = {
                                        league_key: leagueMeta.league_key,
                                        name: leagueMeta.name,
                                        season: leagueMeta.season,
                                        league_id: leagueMeta.league_id,
                                        // User Team Info
                                        team_key: teamInfo.team_key,
                                        team_name: teamInfo.name,
                                        team_logo: teamInfo.logo_url
                                    };
                                }
                            }
                        }
                    });
                }
            }
        });

        if (!foundLeague) {
            throw new Error(`You are not a member of league ID ${userInputId}. Please check the ID and try again.`);
        }

        console.log('✅ League & Team Found:', foundLeague);
        return foundLeague;

    } catch (error) {
        console.error('❌ Error in validateAndLinkLeague:', error);
        throw error;
    }
};
const parseYahooStandings = (standingsWrapper) => {
    const teams = [];
    Object.keys(standingsWrapper).forEach(key => {
        if (key !== 'count') {
            const teamWrapper = standingsWrapper[key]?.team;
            if (teamWrapper) {
                // teamWrapper is [ {metadata}, {standings: {outcome_totals: {wins, losses, ties}, points_for}} ]
                // It's messy. Let's parse carefully.

                let info = {};
                let stats = { wins: 0, losses: 0, ties: 0, points: 0 };

                if (Array.isArray(teamWrapper)) {
                    // Part 0: Metadata
                    const metadata = teamWrapper[0];
                    if (metadata) info = { ...metadata };

                    // Part 2: Standings Data (usually index 2, sometimes 1?)
                    // Let's find the object with 'team_standings'
                    const standingsObj = teamWrapper.find(x => x && x.team_standings);
                    if (standingsObj) {
                        const ts = standingsObj.team_standings;
                        if (ts.outcome_totals) {
                            stats.wins = Number(ts.outcome_totals.wins);
                            stats.losses = Number(ts.outcome_totals.losses);
                            stats.ties = Number(ts.outcome_totals.ties);
                        }
                        if (ts.points_for) {
                            stats.points = Number(ts.points_for);
                        }
                    }
                }

                // Logos is an array in metadata
                const logo_url = info.team_logos && info.team_logos[0] ? info.team_logos[0].url : null;

                teams.push({
                    team_key: info.team_key,
                    name: info.name,
                    logo_url,
                    rank: info.team_standings?.rank || 0, // Sometimes rank is top level?
                    wins: stats.wins,
                    losses: stats.losses,
                    ties: stats.ties,
                    points: stats.points
                });
            }
        }
    });
    return teams;
};

export const getLeagueStandings = async (leagueKey) => {
    if (!leagueKey) throw new Error('getLeagueStandings requires a valid leagueKey');

    const performFetch = async (isRetry = false) => {
        const headers = await getHeaders();
        const url = `${YAHOO_BASE_URL}/league/${leagueKey}/standings?format=json`;
        console.log(`🏆 Fetching Standings (League: ${leagueKey}) - ${isRetry ? 'Retry' : 'Attempt 1'}`);

        const response = await fetch(url, { headers });

        if (!response.ok) {
            if (response.status === 401 && !isRetry) {
                console.warn('⚠️ Yahoo 401 in Standings: Token expired. Refreshing...');
                await refreshYahooAccessToken();
                return performFetch(true);
            }
            const text = await response.text();
            throw new Error(`Yahoo API Wrapper Error: ${response.status} ${text}`);
        }
        return response.json();
    };

    try {
        const data = await performFetch();
        // Parse: fantasy_content -> league -> [1] -> standings -> [0] -> teams
        const leagueData = data?.fantasy_content?.league;
        const standingsWrapper = leagueData?.[1]?.standings?.[0]?.teams;

        if (!standingsWrapper) {
            console.warn('⚠️ No standings found in Yahoo response.');
            return [];
        }

        const standings = parseYahooStandings(standingsWrapper);
        console.log(`✅ Parsed ${standings.length} teams from Standings.`);
        return standings;

    } catch (error) {
        console.error('❌ Error in getLeagueStandings:', error);
        // Return empty array instead of crashing, as this is secondary data
        return [];
    }
};
