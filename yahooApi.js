// yahooApi.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { yahooCredentials } from './yahooConfig'; // Assumes this file is at the root

const YAHOO_API_BASE_URL = 'https://fantasysports.yahooapis.com/fantasy/v2';

// This function transforms the complex Yahoo API data into the simple format your app uses
const parseYahooMatchupData = (yahooData) => {
    if (!yahooData?.fantasy_content?.league?.[0]?.scoreboard?.[0]?.matchups) {
        console.warn("Could not find matchups in Yahoo API response.");
        return [];
    }

    const matchups = yahooData.fantasy_content.league[0].scoreboard[0].matchups;
    const transformedMatchups = [];

    for (const key in matchups) {
        if (key === 'count') continue; // Skip the 'count' property

        const matchup = matchups[key].matchup;
        if (!matchup || !matchup[0]?.teams) continue;

        const week = matchup[0].week;
        const teams = matchup[0].teams;
        
        // Team at index 0 is always away, team at index 1 is always home
        const awayTeam = teams['0'].team[0];
        const homeTeam = teams['1'].team[0];

        transformedMatchups.push({
            UniqueID: matchup.matchup_grade_key || `${week}-${awayTeam[1].team_id}-${homeTeam[1].team_id}`,
            Week: parseInt(week, 10),
            AwayTeamName: awayTeam[2].name,
            AwayTeamAB: awayTeam[3].team_abbreviation,
            AwayTeamLogo: awayTeam[5].team_logos[0].team_logo.url,
            AwayTeamProjectedPoints: parseFloat(awayTeam[7].projected_points[0].total),
            HomeTeamName: homeTeam[2].name,
            HomeTeamAB: homeTeam[3].team_abbreviation,
            HomeTeamLogo: homeTeam[5].team_logos[0].team_logo.url,
            HomeTeamProjectedPoints: parseFloat(homeTeam[7].projected_points[0].total),
            // The API won't provide a WinningTeam until after the game, so this will be null
            WinningTeam: null, 
        });
    }
    return transformedMatchups;
};


// This is the main function your screen will call
export const fetchYahooMatchupsForWeek = async (leagueKey, week) => {
    const accessToken = await AsyncStorage.getItem('yahooAccessToken');
    if (!accessToken) {
        throw new Error("User is not logged in with Yahoo.");
    }

    const url = `${YAHOO_API_BASE_URL}/league/${leagueKey}/scoreboard;week=${week}?format=json`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            // Here you would add logic to handle a 401 Unauthorized error by refreshing the token
            console.error("Yahoo API Error:", response.status, await response.text());
            throw new Error("Failed to fetch data from Yahoo Fantasy API.");
        }

        const data = await response.json();
        return parseYahooMatchupData(data);

    } catch (error) {
        console.error("Error in fetchYahooMatchupsForWeek:", error);
        throw error;
    }
};