import AsyncStorage from '@react-native-async-storage/async-storage';

const YAHOO_BASE_URL = 'https://fantasysports.yahooapis.com/fantasy/v2';
const LEAGUE_KEY = '449.l.66645'; // Hardcoded for 2024-2025 season based on user snippets, can be dynamic later

// Helper to get headers with token
const getHeaders = async () => {
    const token = await AsyncStorage.getItem('yahoo_access_token');
    if (!token) {
        throw new Error('No Yahoo Access Token found. Please login.');
    }
    return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
};

/**
 * Fetch Scoreboard directly from Yahoo API
 * This returns the matchups for a specific week or current week.
 * 
 * Yahoo API Structure:
 * league -> scoreboard -> matchups
 */
export const getWeeklyMatchups = async (week = 'current') => {
    try {
        const headers = await getHeaders();
        console.log(`🏈 Fetching Yahoo Matchups for Week: ${week}`);

        // Yahoo API allows 'current' as a week value, or an integer.
        // If week is provided and is not 'current', ensure it's a number.
        const weekParam = week === 'current' ? '' : `;week=${week}`;

        const url = `${YAHOO_BASE_URL}/league/${LEAGUE_KEY}/scoreboard${weekParam}?format=json`;
        console.log('🌐 Yahoo API URL:', url);

        const response = await fetch(url, { headers });

        if (!response.ok) {
            // If 401, we might need to refresh token (not implemented yet for MVP)
            if (response.status === 401) {
                console.error('❌ Yahoo API 401 Unauthorized - Token might be expired');
            }
            const text = await response.text();
            console.error('❌ Yahoo API Error Body:', text);
            throw new Error(`Yahoo API returned ${response.status}: ${text}`);
        }

        const data = await response.json();

        // Parse the deep nested JSON from Yahoo
        // structure: fantasy_content -> league -> [0] (metadata) -> [1] -> scoreboard -> 0 -> matchups

        const leagueData = data?.fantasy_content?.league;
        if (!leagueData) throw new Error('Invalid Yahoo API Response: Missing league data');

        // leagueData is usually an array mixed with objects. 
        // index 0 is metadata, index 1 is scoreboard wrapper.
        const scoreboardWrapper = leagueData[1]?.scoreboard;

        // scoreboardWrapper might be an object containing '0' -> matchups
        const matchupsWrapper = scoreboardWrapper && scoreboardWrapper['0'] ? scoreboardWrapper['0'].matchups : null;

        if (!matchupsWrapper) {
            console.warn('⚠️ No matchups found in Yahoo response (possibly pre-season or empty week).');
            return [];
        }

        // matchupsWrapper is an object (with count) or array.
        // Yahoo JSON is notoriously weird. It often returns objects with numerical keys.
        // We need to iterate over the keys that are numbers.

        const matchups = [];
        // Iterate over keys since Yahoo uses "0", "1", "2"... keys for array items in JSON
        Object.keys(matchupsWrapper).forEach(key => {
            if (key !== 'count') {
                const matchupObj = matchupsWrapper[key]?.matchup;
                if (matchupObj) {
                    // matchupObj has '0' -> status/teams, '1' -> ?
                    // We need to parse this into our app's "Matchup" format
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
    // yahooMatchup is an object containing nested arrays/objects
    // usually: 
    // '0': { status: 'postevent', ... }
    // '0': { teams: { '0': {...}, '1': {...} } } <-- Wait, allow me to double check Yahoo structure
    // Actually, usually:
    // index 0: metadata (status, week, etc)
    // index 1: teams

    // Let's safely try to find the parts
    let metadata = {};
    let teamsWrapper = {};

    // Yahoo arrays sometimes come as objects with keys "0", "1".
    // We treat yahooMatchup as the wrapper.

    // Check if it's an array
    if (Array.isArray(yahooMatchup)) {
        // usually [0] is metadata, [1] is teams
        // But sometimes format varies.
        // Let's search for the object that has 'teams'
        const teamsObj = yahooMatchup.find(x => x && x.teams);
        const metaObj = yahooMatchup.find(x => x && x.status);

        if (teamsObj) teamsWrapper = teamsObj.teams;
        if (metaObj) metadata = metaObj;
    } else {
        // It's an object with keys?
        // Let's assume standard array-like object
        metadata = yahooMatchup['0'] || {};
        teamsWrapper = yahooMatchup['1']?.teams || {};
    }

    const teams = [];
    Object.keys(teamsWrapper).forEach(key => {
        if (key !== 'count') {
            const teamWrapper = teamsWrapper[key]?.team;
            if (teamWrapper) teams.push(parseYahooTeam(teamWrapper));
        }
    });

    const team1 = teams[0] || {};
    const team2 = teams[1] || {};

    // Map to our app's internal "Matchup" structure used in home.js/makepicks.js
    // We need to determine which is Home/Away. Yahoo usually lists them.
    // But for simplicty, let's assume team1 is Away, team2 is Home (common convention, but need verification).
    // Actually Yahoo doesn't explicitly say Home/Away in the 'teams' list order always.
    // But we can check 'is_owned_by_current_login' or just map them.

    // For NFL, usually the second team (index 1) is the home team in Yahoo's display, 
    // but in API they are just participants.
    // Let's Map them roughly.

    // We need:
    // UniqueID (can be yahoo matchup id? or just a generated one)
    // Week
    // GameDate, GameTimeET
    // HomeTeamAB, HomeTeamName, HomeTeamLogo, HomeTeamProjectedPoints
    // AwayTeamAB, AwayTeamName, AwayTeamLogo, AwayTeamProjectedPoints
    // WinningTeam (if finished)

    return {
        UniqueID: `yahoo_${metadata.week}_${team1.team_key}_${team2.team_key}`, // Unique ID
        Week: Number(metadata.week),
        isFinished: metadata.status === 'postevent',
        status: metadata.status,

        // Yahoo doesn't give specific Game Date/Time in scoreboard easily without 'games' resource?
        // Actually usually it's in the 'game_start_date' but maybe not per matchup?
        // Matchup usually implies stats.
        // For fantasy matchups, there isn't a single "Game Date" because it's players playing all week.
        // But the user's app seems to treat these as "Games" between fantasy teams.
        // So global "lock time" applies.

        GameDate: 'Week ' + metadata.week, // Placeholder
        GameTimeET: 'Locked', // Placeholder

        // Team 1 (Assign as Away)
        AwayTeamName: team1.name,
        AwayTeamAB: team1.name ? team1.name.substring(0, 3).toUpperCase() : 'T1', // Placeholder abbr
        AwayTeamLogo: team1.logo_url,
        AwayTeamProjectedPoints: team1.projected_points,
        AwayTeamActualPoints: team1.points,

        // Team 2 (Assign as Home)
        HomeTeamName: team2.name,
        HomeTeamAB: team2.name ? team2.name.substring(0, 3).toUpperCase() : 'T2',
        HomeTeamLogo: team2.logo_url,
        HomeTeamProjectedPoints: team2.projected_points,
        HomeTeamActualPoints: team2.points,

        WinningTeam: metadata.winner_team_key === team1.team_key ? team1.name : (metadata.winner_team_key === team2.team_key ? team2.name : null)
    };
};

const parseYahooTeam = (teamWrapper) => {
    // teamWrapper is an array of objects
    // [0] -> team metadata (key, name, logos, etc)
    // [1] -> team points 
    // [2] -> team projected points

    let info = {};
    let points = 0;
    let projected_points = 0;

    if (Array.isArray(teamWrapper)) {
        // Flatten
        teamWrapper.forEach(part => {
            if (Array.isArray(part)) {
                // It's a list data
                part.forEach(sub => {
                    if (sub.team_key) info = { ...info, ...sub };
                });
            } else if (typeof part === 'object') {
                if (part.team_key) info = { ...info, ...part };
                if (part.team_points) points = Number(part.team_points.total);
                if (part.team_projected_points) projected_points = Number(part.team_projected_points.total);
            }
        });
    }

    // Logos is an array
    const logo_url = info.team_logos && info.team_logos[0] ? info.team_logos[0].url : null;

    return {
        team_key: info.team_key,
        name: info.name,
        logo_url,
        points,
        projected_points
    };
}
