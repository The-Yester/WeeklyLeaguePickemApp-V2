// src/services/fantasyApi.js
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

// --- Option A: Direct fetch with an access token (client-side) ---
export async function yahooGet({ path, accessToken, format = 'json' }) {
  if (!accessToken) throw new Error('Missing access token');
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}format=${format}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yahoo API error ${res.status}: ${text}`);
  }

  return res.json();
}

// --- Option B: Via a Cloud Function proxy (recommended for production) ---
// Implement a function like `functions/src/fantasy/proxy.js` that:
// - Accepts a relative `path`
// - Adds server-stored tokens or refreshes them
// - Calls Yahoo and returns the JSON
export async function yahooProxy({ path, format = 'json', extra = {} }) {
  const call = httpsCallable(functions, 'yahooFantasyProxy');
  const { data } = await call({ path, format, ...extra });
  return data;
}

// --- Example convenience wrappers ---
export async function getUserGames(params) {
  // GET /users;games
  return yahooGet({ path: '/users;use_login=1/games', ...params });
}

export async function getLeaguesForUser({ accessToken }) {
  // GET /users;use_login=1/games;game_keys=nfl/leagues
  const path = '/users;use_login=1/games;game_keys=nfl/leagues';
  return yahooGet({ path, accessToken });
}

export async function getLeagueStandings({ leagueKey, accessToken }) {
  // GET /league/{league_key}/standings
  const path = `/league/${leagueKey}/standings`;
  return yahooGet({ path, accessToken });
}