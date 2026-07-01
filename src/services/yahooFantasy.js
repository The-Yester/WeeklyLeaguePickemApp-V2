import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from '../config/firebase';

// --- MOCK YAHOO DATA FOR DEMO USER ---
const MOCK_TEAMS = [
    { key: 'demo_team_1', name: 'Gridiron Gladiators', logo: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100', ab: 'GG' },
    { key: 'demo_team_2', name: 'Touchdown Titans', logo: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100', ab: 'TT' },
    { key: 'demo_team_3', name: 'Red Zone Rangers', logo: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=100', ab: 'RZR' },
    { key: 'demo_team_4', name: 'Blitz Brigade', logo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100', ab: 'BB' },
    { key: 'demo_team_5', name: 'Hail Mary Heroes', logo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100', ab: 'HMH' },
    { key: 'demo_team_6', name: 'End Zone Emperors', logo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100', ab: 'EZE' },
    { key: 'demo_team_7', name: 'Sack Masters', logo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100', ab: 'SM' },
    { key: 'demo_team_8', name: 'Fantasy Footballers', logo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100', ab: 'FF' }
];

const getMockWeeklyMatchups = (week) => {
    const weekNum = week === 'current' ? 1 : Number(week);
    const pairings = [
        [[1, 2], [3, 4], [5, 6], [7, 8]], // Week 1 / 5 / 9 / 13 / 17
        [[1, 3], [2, 4], [5, 7], [6, 8]], // Week 2 / 6 / 10 / 14 / 18
        [[1, 4], [2, 3], [5, 8], [6, 7]], // Week 3 / 7 / 11 / 15
        [[1, 5], [2, 6], [3, 7], [4, 8]], // Week 4 / 8 / 12 / 16
    ];
    
    const pairingIndex = Math.max(0, (weekNum - 1) % pairings.length);
    const weekPairings = pairings[pairingIndex];
    
    return weekPairings.map(([t1Idx, t2Idx], idx) => {
        const team1 = MOCK_TEAMS[t1Idx - 1];
        const team2 = MOCK_TEAMS[t2Idx - 1];
        
        const isFinished = weekNum < 3;
        const status = isFinished ? 'postevent' : 'scheduled';
        
        const seed1 = (weekNum * 7 + idx * 13) % 30;
        const seed2 = (weekNum * 11 + idx * 17) % 30;
        const proj1 = 95.0 + seed1;
        const proj2 = 92.0 + seed2;
        
        const act1 = isFinished ? proj1 + ((seed1 - 15) / 2) : 0;
        const act2 = isFinished ? proj2 + ((seed2 - 15) / 2) : 0;
        
        let winningTeam = null;
        if (isFinished) {
            winningTeam = act1 > act2 ? team1.name : team2.name;
        }
        
        return {
            UniqueID: `yahoo_${weekNum}_${team1.key}_${team2.key}`,
            Week: weekNum,
            isFinished,
            status,
            MatchURL: 'https://football.fantasysports.yahoo.com',
            GameDate: `Week ${weekNum}`,
            GameTimeET: isFinished ? 'Final' : 'Sunday 1:00 PM',
            
            // Team 1 (Away)
            AwayTeamKey: team1.key,
            AwayTeamName: team1.name,
            AwayTeamAB: team1.ab,
            AwayTeamLogo: team1.logo,
            AwayTeamProjectedPoints: Number(proj1.toFixed(1)),
            AwayTeamActualPoints: Number(act1.toFixed(1)),
            
            // Team 2 (Home)
            HomeTeamKey: team2.key,
            HomeTeamName: team2.name,
            HomeTeamAB: team2.ab,
            HomeTeamLogo: team2.logo,
            HomeTeamProjectedPoints: Number(proj2.toFixed(1)),
            HomeTeamActualPoints: Number(act2.toFixed(1)),
            
            WinningTeam: winningTeam
        };
    });
};

const getMockLeagueStandings = () => {
    return [
        { team_key: 'demo_team_1', name: 'Gridiron Gladiators', logo_url: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100', rank: 1, wins: 2, losses: 0, ties: 0, points: 235.4 },
        { team_key: 'demo_team_2', name: 'Touchdown Titans', logo_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100', rank: 2, wins: 2, losses: 0, ties: 0, points: 218.2 },
        { team_key: 'demo_team_3', name: 'Red Zone Rangers', logo_url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=100', rank: 3, wins: 1, losses: 1, ties: 0, points: 210.5 },
        { team_key: 'demo_team_4', name: 'Blitz Brigade', logo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100', rank: 4, wins: 1, losses: 1, ties: 0, points: 198.6 },
        { team_key: 'demo_team_5', name: 'Hail Mary Heroes', logo_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100', rank: 5, wins: 1, losses: 1, ties: 0, points: 192.1 },
        { team_key: 'demo_team_6', name: 'End Zone Emperors', logo_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100', rank: 6, wins: 1, losses: 1, ties: 0, points: 185.7 },
        { team_key: 'demo_team_7', name: 'Sack Masters', logo_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100', rank: 7, wins: 0, losses: 2, ties: 0, points: 172.4 },
        { team_key: 'demo_team_8', name: 'Fantasy Footballers', logo_url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100', rank: 8, wins: 0, losses: 2, ties: 0, points: 160.8 }
    ];
};


const callYahooProxy = async (path, method = 'GET', body = null) => {
    try {
        const functions = getFunctions(app);
        const yahooFantasyProxy = httpsCallable(functions, 'yahooFantasyProxy');
        const response = await yahooFantasyProxy({ path, method, body });
        return response.data;
    } catch (e) {
        console.error(`❌ yahooFantasyProxy call failed for path ${path}:`, e);
        throw e;
    }
};

/**
 * Fetch Scoreboard directly from Yahoo API via Cloud Function Proxy
 * This returns the matchups for a specific week or current week.
 */
export const getWeeklyMatchups = async (week = 'current', leagueKey) => {
    if (!leagueKey) throw new Error('getWeeklyMatchups requires a valid leagueKey');

    // Bypass for Demo mode
    if (leagueKey === 'demo-league' || (typeof leagueKey === 'string' && leagueKey.includes('demo'))) {
        console.log(`🏈 Demo Mode: Returning mock matchups for Week ${week}`);
        return getMockWeeklyMatchups(week);
    }

    try {
        const weekParam = week === 'current' ? '' : `;week=${week}`;
        const path = `/league/${leagueKey}/scoreboard${weekParam}`;
        console.log(`🏈 Fetching Matchups (Week ${week}) via Proxy`);
        const data = await callYahooProxy(path);

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

    // 1. Direct object property extraction if available
    if (yahooMatchup && typeof yahooMatchup === 'object' && !Array.isArray(yahooMatchup)) {
        if (yahooMatchup.status) metadata.status = yahooMatchup.status;
        if (yahooMatchup.week) metadata.week = yahooMatchup.week;
        if (yahooMatchup.matchup_url) metadata.matchup_url = yahooMatchup.matchup_url;
        if (yahooMatchup.winner_team_key) metadata.winner_team_key = yahooMatchup.winner_team_key;
        if (yahooMatchup.teams) teamsWrapper = yahooMatchup.teams;
    }

    // 2. Fallback to array values (XML-to-JSON format wrapper support)
    const parts = Array.isArray(yahooMatchup) ? yahooMatchup : Object.values(yahooMatchup);

    const metaPart = parts.find(p => p && typeof p === 'object' && p.status); // Find part with 'status'
    const teamsPart = parts.find(p => p && typeof p === 'object' && p.teams); // Find part with 'teams'

    if (metaPart) metadata = { ...metadata, ...metaPart };
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

    // Extract league_id and team_ids from keys to build correct Yahoo Matchup webpage URL
    let matchupUrl = metadata.matchup_url || null;
    if (team1.team_key && team2.team_key) {
        const leagueIdMatch = team1.team_key.match(/\.l\.(\d+)/);
        const leagueId = leagueIdMatch ? leagueIdMatch[1] : null;
        const awayTeamIdMatch = team1.team_key.match(/\.t\.(\d+)/);
        const awayTeamId = awayTeamIdMatch ? awayTeamIdMatch[1] : null;
        const homeTeamIdMatch = team2.team_key.match(/\.t\.(\d+)/);
        const homeTeamId = homeTeamIdMatch ? homeTeamIdMatch[1] : null;
        
        if (leagueId && awayTeamId && homeTeamId) {
            matchupUrl = `https://football.fantasysports.yahoo.com/f1/${leagueId}/matchup?week=${safeWeek}&mid1=${awayTeamId}&mid2=${homeTeamId}`;
        }
    }

    return {
        UniqueID: `yahoo_${safeWeek}_${team1.team_key}_${team2.team_key}`,
        Week: safeWeek,
        isFinished: metadata.status === 'postevent',
        status: metadata.status,
        MatchURL: matchupUrl,

        GameDate: 'Week ' + safeWeekLabel,
        GameTimeET: metadata.status === 'postevent' ? 'Final' : 'Scheduled',

        // Team 1 (Away)
        AwayTeamKey: team1.team_key,
        AwayTeamName: team1.name,
        AwayTeamAB: team1.name ? team1.name.substring(0, 3).toUpperCase() : 'T1',
        AwayTeamLogo: team1.logo_url,
        AwayTeamProjectedPoints: team1.projected_points,
        AwayTeamActualPoints: team1.points,

        // Team 2 (Home)
        HomeTeamKey: team2.team_key,
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
    // Helper to recursively find team_logos
    const findLogoUrl = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.team_logos && Array.isArray(obj.team_logos) && obj.team_logos.length > 0) {
            // Check for direct url (standard) or nested team_logo object (custom)
            if (obj.team_logos[0].team_logo && obj.team_logos[0].team_logo.url) {
                return obj.team_logos[0].team_logo.url;
            }
            if (obj.team_logos[0].url) {
                return obj.team_logos[0].url;
            }
        }

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const found = findLogoUrl(obj[key]);
                if (found) return found;
            }
        }
        return null;
    };

    // Use recursive search for logo
    const logo_url = findLogoUrl(teamWrapper);



    // Continue with existing parsing for other fields
    let info = {};
    let points = 0;
    let projected_points = 0;

    const parts = Array.isArray(teamWrapper) ? teamWrapper : Object.values(teamWrapper);

    parts.forEach(part => {
        if (Array.isArray(part)) {
            part.forEach(sub => {
                if (sub && typeof sub === 'object') {
                    if (sub.team_key) info = { ...info, ...sub };
                    if (sub.name) info = { ...info, ...sub };
                }
            });
        } else if (typeof part === 'object' && part !== null) {
            if (part.team_key) info = { ...info, ...part };
            if (part.name) info = { ...info, name: part.name };

            if (part.team_points) points = Number(part.team_points.total);
            if (part.team_projected_points) projected_points = Number(part.team_projected_points.total);
        }
    });

    if (!info.name) {
        console.warn('⚠️ Parse Warning: Team Name missing. Key:', info.team_key);
    }



    return {
        team_key: info.team_key,
        name: info.name,
        logo_url, // Use the deep-found logo
        points,
        projected_points
    };
}

/**
 * Validates a user-provided League ID (e.g., '66645') against the user's actual Yahoo Leagues.
 * Returns the full league_key (e.g., '449.l.66645') and metadata if found.
 */
export const validateAndLinkLeague = async (userInputId) => {
    try {
        const path = '/users;use_login=1/games;game_codes=nfl/leagues/teams';
        console.log(`🔍 Validating League & Team ID via Proxy: ${userInputId}`);
        const data = await callYahooProxy(path);
        
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
                // Reuse robust team parser for metadata/logos
                const teamInfo = parseYahooTeam(teamWrapper);

                // Extract standings stats separately as they might be deep
                let stats = { wins: 0, losses: 0, ties: 0, points: 0 };

                // Need to find 'team_standings' which parseYahooTeam doesn't look for explicitly yet
                const parts = Array.isArray(teamWrapper) ? teamWrapper : Object.values(teamWrapper);
                const standingsObj = parts.find(x => x && x.team_standings);

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
                    // Rank is often here too
                    if (ts.rank) teamInfo.rank = ts.rank;
                }

                teams.push({
                    team_key: teamInfo.team_key,
                    name: teamInfo.name,
                    logo_url: teamInfo.logo_url,
                    rank: teamInfo.rank || 0,
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

    // Bypass for Demo mode
    if (leagueKey === 'demo-league' || (typeof leagueKey === 'string' && leagueKey.includes('demo'))) {
        console.log(`🏆 Demo Mode: Returning mock standings for League: ${leagueKey}`);
        return getMockLeagueStandings();
    }

    try {
        const path = `/league/${leagueKey}/standings`;
        console.log(`🏆 Fetching Standings via Proxy (League: ${leagueKey})`);
        const data = await callYahooProxy(path);

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
        throw error;
    }
};

/**
 * [NEW] Helper to filter League Standings for a specific Team Key
 */
export const getUserStanding = async (leagueKey, teamKey) => {
    if (!leagueKey || !teamKey) return null;
    if (leagueKey === 'demo-league' || (typeof leagueKey === 'string' && leagueKey.includes('demo'))) {
        const standings = getMockLeagueStandings();
        return standings.find(t => t.team_key === teamKey) || null;
    }
    try {
        const standings = await getLeagueStandings(leagueKey);
        const myTeam = standings.find(t => t.team_key === teamKey);
        return myTeam || null;
    } catch (e) {
        console.error("Failed to get user standing:", e);
        return null;
    }
};

/**
 * [NEW] Fetch User Global Profile Metadata
 * Attempts to get 'Fantasy Level' or Rank if available.
 */
export const getUserProfile = async () => {
    try {
        // Bypass for Demo mode
        if (auth?.currentUser?.isAnonymous) {
            console.log(`👤 Demo Mode: Returning mock profile`);
            return {
                guid: 'demo_guid',
                is_demo: true,
                fantasy_level: 'Diamond',
            };
        }
        const path = '/users;use_login=1/games;game_codes=nfl';
        console.log(`👤 Fetching User Profile via Proxy`);
        const data = await callYahooProxy(path);
        
        // Return the user object (wrapper)
        return data?.fantasy_content?.users?.['0']?.user?.[0] || null;
    } catch (error) {
        console.error('❌ Error in getUserProfile:', error);
        return null;
    }
};


