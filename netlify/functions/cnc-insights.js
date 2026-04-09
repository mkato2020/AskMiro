/**
 * Crown n Cradle — Dashboard API (Netlify Function)
 * Returns live YouTube + Instagram insights + calendar data
 * Supports autopilot toggle via GET/POST ?action=autopilot
 */

import { getStore } from '@netlify/blobs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

const YT_CLIENT_ID = process.env.CNC_YT_CLIENT_ID;
const YT_CLIENT_SECRET = process.env.CNC_YT_CLIENT_SECRET;
const ytRefreshToken = process.env.CNC_YT_REFRESH_TOKEN;
const igAccessToken = process.env.CNC_IG_ACCESS_TOKEN;
const igUserId = process.env.CNC_IG_USER_ID;

// Embedded calendar data
const CALENDAR = {"weeks":[{"week":1,"theme":"sleep","slots":[{"slot":"morning","topic":"Why your baby fights sleep"},{"slot":"evening","topic":"The real reason rocking them to sleep works"},{"slot":"morning","topic":"Letting them cry breaks something inside them"},{"slot":"evening","topic":"Your baby remembers your voice from the womb"},{"slot":"morning","topic":"The Fade Out method"},{"slot":"evening","topic":"Why white noise works like magic"},{"slot":"morning","topic":"What 3am wake-ups are really about"},{"slot":"evening","topic":"One thing to say when they won't stay in bed"},{"slot":"morning","topic":"You're not failing at bedtime"},{"slot":"evening","topic":"Someday they won't need you at bedtime"}]},{"week":2,"theme":"behavior","slots":[{"slot":"morning","topic":"Your child isn't ignoring you"},{"slot":"evening","topic":"Why they always say no first"},{"slot":"morning","topic":"Gentle parenting means no boundaries"},{"slot":"evening","topic":"Your toddler hits because they love too big"},{"slot":"morning","topic":"The Whisper Trick"},{"slot":"evening","topic":"Say this instead of stop crying"},{"slot":"morning","topic":"What their tantrum is really saying"},{"slot":"evening","topic":"The one phrase that ends power struggles"},{"slot":"morning","topic":"You're not raising a difficult child"},{"slot":"evening","topic":"They chose you on their hardest days too"}]},{"week":3,"theme":"feeding","slots":[{"slot":"morning","topic":"Why your toddler suddenly won't eat"},{"slot":"evening","topic":"They eat better when you stop watching"},{"slot":"morning","topic":"If they don't eat their veggies they'll be unhealthy"},{"slot":"evening","topic":"Your picky eater isn't broken"},{"slot":"morning","topic":"The Division of Responsibility"},{"slot":"evening","topic":"Put a safe food on every plate"},{"slot":"morning","topic":"Why they eat the same food every single day"},{"slot":"evening","topic":"How to introduce new foods without a fight"},{"slot":"morning","topic":"You're not a bad parent if dinner is cereal"},{"slot":"evening","topic":"The meal they remember isn't the perfect one"}]},{"week":4,"theme":"you_the_parent","slots":[{"slot":"morning","topic":"Why parenting feels so much harder than it should"},{"slot":"evening","topic":"You don't need to enjoy every moment"},{"slot":"morning","topic":"Good parents don't lose their temper"},{"slot":"evening","topic":"Your kids don't need a perfect parent"},{"slot":"morning","topic":"The Repair Conversation"},{"slot":"evening","topic":"Three words that reset any hard day"},{"slot":"morning","topic":"Why mom rage is actually grief"},{"slot":"evening","topic":"You were someone before you were mom"},{"slot":"morning","topic":"The fact that you worry means you care"},{"slot":"evening","topic":"A letter to the parent reading this at 2am"}]}],"posted":["Why your baby fights sleep","The real reason rocking them to sleep works","Letting them cry breaks something inside them","The Fade Out method","Why white noise works like magic","What 3am wake-ups are really about","One thing to say when they won't stay in bed","You're not failing at bedtime","Someday they won't need you at bedtime","Your baby remembers your voice from the womb","If they don't eat their veggies they'll be unhealthy","Your picky eater isn't broken"]};

async function getYouTubeAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID, client_secret: YT_CLIENT_SECRET,
      refresh_token: ytRefreshToken, grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function fetchYouTube() {
  if (!YT_CLIENT_ID || !ytRefreshToken) return { error: 'YouTube not configured' };

  // Cache YouTube data for 10 minutes to avoid burning 10K daily quota
  const store = getStore('cnc-config');
  const CACHE_KEY = 'yt-cache';
  const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
  try {
    const cached = await store.get(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed._cachedAt < CACHE_TTL) {
        return parsed.data;
      }
    }
  } catch (e) {}

  const accessToken = await getYouTubeAccessToken();
  if (!accessToken) return { error: 'Failed to refresh YouTube token' };

  let channel = {};
  try {
    const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&mine=true',
      { headers: { Authorization: 'Bearer ' + accessToken } });
    const chData = await chRes.json();
    if (chData.error) return { error: chData.error.message || 'YouTube API error', channel: {}, videos: [], totals: { totalViews: 0, totalLikes: 0, totalComments: 0, avgViews: 0 } };
    if (chData.items && chData.items[0]) {
      const ch = chData.items[0];
      channel = { name: ch.snippet.title, subscribers: parseInt(ch.statistics.subscriberCount || 0),
        totalViews: parseInt(ch.statistics.viewCount || 0), totalVideos: parseInt(ch.statistics.videoCount || 0) };
    }
  } catch (e) {}

  let videos = [];
  try {
    const searchRes = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=25&order=date',
      { headers: { Authorization: 'Bearer ' + accessToken } });
    const searchData = await searchRes.json();
    const videoIds = (searchData.items || []).map(i => i.id.videoId).filter(Boolean);
    if (videoIds.length > 0) {
      const statsRes = await fetch('https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=' + videoIds.join(','),
        { headers: { Authorization: 'Bearer ' + accessToken } });
      const statsData = await statsRes.json();
      videos = (statsData.items || []).map(item => ({
        videoId: item.id, title: item.snippet.title, publishedAt: item.snippet.publishedAt,
        views: parseInt(item.statistics.viewCount || 0), likes: parseInt(item.statistics.likeCount || 0),
        comments: parseInt(item.statistics.commentCount || 0), url: 'https://youtube.com/shorts/' + item.id,
      })).sort((a, b) => b.views - a.views);
    }
  } catch (e) {}

  const totals = {
    totalViews: videos.reduce((s, v) => s + v.views, 0),
    totalLikes: videos.reduce((s, v) => s + v.likes, 0),
    totalComments: videos.reduce((s, v) => s + v.comments, 0),
    avgViews: videos.length ? Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length) : 0,
  };
  const result = { channel, videos, totals };

  // Cache the result
  try { await store.set(CACHE_KEY, JSON.stringify({ _cachedAt: Date.now(), data: result })); } catch (e) {}

  return result;
}

async function fetchInstagram() {
  if (!igAccessToken || !igUserId) return { error: 'Instagram not configured' };

  let profile = {};
  try {
    const pRes = await fetch('https://graph.instagram.com/v21.0/' + igUserId + '?fields=username,media_count,account_type&access_token=' + igAccessToken);
    profile = await pRes.json();
  } catch (e) {}

  let media = [];
  try {
    const mRes = await fetch('https://graph.instagram.com/v21.0/' + igUserId + '/media?fields=id,caption,media_type,timestamp,permalink,like_count,comments_count&limit=25&access_token=' + igAccessToken);
    const mData = await mRes.json();
    media = (mData.data || []).map(item => ({
      id: item.id, caption: (item.caption || '').split('\n')[0].slice(0, 80),
      postedAt: item.timestamp, url: item.permalink,
      likes: item.like_count || 0, comments: item.comments_count || 0,
    }));
  } catch (e) {}

  const mediaWithInsights = [];
  for (const m of media) {
    let views = 0, shares = 0, saves = 0;
    try {
      const iRes = await fetch('https://graph.instagram.com/v21.0/' + m.id + '/insights?metric=plays,shares,saved&access_token=' + igAccessToken);
      const iData = await iRes.json();
      if (iData.data) {
        for (const metric of iData.data) {
          if (metric.name === 'plays') views = metric.values?.[0]?.value || 0;
          if (metric.name === 'shares') shares = metric.values?.[0]?.value || 0;
          if (metric.name === 'saved') saves = metric.values?.[0]?.value || 0;
        }
      }
    } catch (e) {}
    mediaWithInsights.push({ ...m, views, shares, saves });
  }

  const totals = {
    totalPosts: profile.media_count || media.length,
    totalViews: mediaWithInsights.reduce((s, m) => s + m.views, 0),
    totalLikes: mediaWithInsights.reduce((s, m) => s + m.likes, 0),
    totalShares: mediaWithInsights.reduce((s, m) => s + m.shares, 0),
    totalSaves: mediaWithInsights.reduce((s, m) => s + m.saves, 0),
  };
  return { profile, media: mediaWithInsights, totals };
}

// ── API Usage & Cost Tracking ────────────────────────────────
async function fetchApiUsage() {
  const usage = {};

  // 1. Anthropic — billing via API (api.anthropic.com)
  const anthropicKey = process.env.CNC_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      // Anthropic doesn't have a public usage API yet — estimate from production logs
      // We track calls via blob store instead
      const store = getStore('cnc-config');
      const raw = await store.get('api-usage-anthropic');
      const data = raw ? JSON.parse(raw) : { calls: 0, inputTokens: 0, outputTokens: 0 };
      const costPerMInputToken = 3.00;  // Claude Sonnet $3/M input
      const costPerMOutputToken = 15.00; // Claude Sonnet $15/M output
      const inputCost = (data.inputTokens / 1_000_000) * costPerMInputToken;
      const outputCost = (data.outputTokens / 1_000_000) * costPerMOutputToken;
      // Get stored balance
      const balRaw = await store.get('balance-anthropic');
      const balance = balRaw ? JSON.parse(balRaw) : null;
      const spent = Math.round((inputCost + outputCost) * 100) / 100;
      const remaining = balance ? Math.max(0, Math.round((balance.amount - spent) * 100) / 100) : null;
      usage.claude = {
        service: 'Claude API',
        calls: data.calls,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        spent,
        cost: spent,
        balance: balance ? balance.amount : null,
        remaining,
        balanceUpdatedAt: balance ? balance.updatedAt : null,
        lastCall: data.lastCall || null,
        unit: 'USD',
        status: 'active',
        note: 'Script generation + QA',
      };
    } catch { usage.claude = { service: 'Claude API', status: 'no data', cost: 0 }; }
  } else {
    usage.claude = { service: 'Claude API', status: 'not configured', cost: 0 };
  }

  // 2. ElevenLabs — character usage via API
  const elKey = process.env.CNC_ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY;
  if (elKey) {
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
        headers: { 'xi-api-key': elKey },
      });
      const data = await res.json();
      usage.elevenlabs = {
        service: 'ElevenLabs',
        tier: data.tier || 'unknown',
        charactersUsed: data.character_count || 0,
        charactersLimit: data.character_limit || 0,
        percentUsed: data.character_limit ? Math.round((data.character_count / data.character_limit) * 100) : 0,
        nextReset: data.next_character_count_reset_unix ? new Date(data.next_character_count_reset_unix * 1000).toISOString() : null,
        cost: data.tier === 'free' ? 0 : data.tier === 'starter' ? 5 : data.tier === 'creator' ? 22 : data.tier === 'pro' ? 99 : 0,
        unit: 'USD/mo',
        status: 'active',
        note: 'Voiceover generation',
      };
    } catch (e) { usage.elevenlabs = { service: 'ElevenLabs', status: 'error: ' + e.message, cost: 0 }; }
  } else {
    usage.elevenlabs = { service: 'ElevenLabs', status: 'not configured', cost: 0 };
  }

  // 3. YouTube Data API — quota (10,000 units/day free)
  // Upload = 1600 units, search = 100, list = 1 unit
  // Estimated from video count
  const ytVideos = 0; // will be filled from main data
  usage.youtube = {
    service: 'YouTube Data API',
    dailyQuota: 10000,
    costPerUpload: 1600,
    status: 'active (free tier)',
    cost: 0,
    unit: 'FREE',
    note: 'Upload + metadata',
  };

  // 4. Instagram Graph API — free, rate limited
  usage.instagram = {
    service: 'Instagram Graph API',
    rateLimit: '200 calls/hr',
    status: 'active (free)',
    cost: 0,
    unit: 'FREE',
    note: 'Reel publishing',
  };

  // 5. Resend (email)
  usage.resend = {
    service: 'Resend',
    status: 'active',
    cost: 0,
    unit: 'FREE (100/day)',
    note: 'Notifications',
  };

  return usage;
}

// ── Log API call (called by pipeline scripts via POST) ──────
async function logApiCall(body) {
  const store = getStore('cnc-config');
  const service = body.service || 'anthropic';
  const key = 'api-usage-' + service;
  let data;
  try {
    const raw = await store.get(key);
    data = raw ? JSON.parse(raw) : { calls: 0, inputTokens: 0, outputTokens: 0 };
  } catch { data = { calls: 0, inputTokens: 0, outputTokens: 0 }; }

  data.calls += 1;
  data.inputTokens += (body.inputTokens || 0);
  data.outputTokens += (body.outputTokens || 0);
  data.characters = (data.characters || 0) + (body.characters || 0);
  data.lastCall = new Date().toISOString();

  await store.set(key, JSON.stringify(data));
  return data;
}

// ── Balance management (Anthropic credit balance) ──────────
async function getBalance(service) {
  try {
    const store = getStore('cnc-config');
    const raw = await store.get('balance-' + service);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function setBalance(service, amount) {
  const store = getStore('cnc-config');
  const data = { amount: parseFloat(amount), updatedAt: new Date().toISOString() };
  await store.set('balance-' + service, JSON.stringify(data));
  return data;
}

// ── Autopilot state (persisted via Netlify Blobs) ───────────
async function getAutopilotState() {
  try {
    const store = getStore('cnc-config');
    const val = await store.get('autopilot');
    if (val === null || val === undefined) return true; // default ON
    return val === 'true' || val === true;
  } catch { return true; }
}

async function setAutopilotState(enabled) {
  const store = getStore('cnc-config');
  await store.set('autopilot', String(enabled));
  return enabled;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(req.url, 'https://localhost');
  const action = url.searchParams.get('action');

  // ── Autopilot toggle endpoint ──
  if (action === 'autopilot') {
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        const enabled = await setAutopilotState(!!body.enabled);
        return new Response(JSON.stringify({ autopilot: enabled }), { status: 200, headers: CORS_HEADERS });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS_HEADERS });
      }
    }
    // GET — return current state
    const state = await getAutopilotState();
    return new Response(JSON.stringify({ autopilot: state }), { status: 200, headers: CORS_HEADERS });
  }

  // ── Log API usage (from pipeline scripts) ──
  if (action === 'log-usage' && req.method === 'POST') {
    try {
      const body = await req.json();
      const data = await logApiCall(body);
      return new Response(JSON.stringify({ logged: true, data }), { status: 200, headers: CORS_HEADERS });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS_HEADERS });
    }
  }

  // ── Set balance (manual entry from dashboard) ──
  if (action === 'set-balance' && req.method === 'POST') {
    try {
      const body = await req.json();
      const data = await setBalance(body.service || 'anthropic', body.amount || 0);
      return new Response(JSON.stringify({ saved: true, data }), { status: 200, headers: CORS_HEADERS });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS_HEADERS });
    }
  }

  // ── Main insights endpoint ──
  try {
    const [youtube, instagram, autopilot, apiUsage] = await Promise.all([fetchYouTube(), fetchInstagram(), getAutopilotState(), fetchApiUsage()]);
    // Fill YouTube video count into usage
    if (apiUsage.youtube && youtube.channel) {
      apiUsage.youtube.totalUploads = youtube.channel.totalVideos || 0;
      apiUsage.youtube.estimatedQuotaUsed = (youtube.channel.totalVideos || 0) * 1600;
    }
    return new Response(JSON.stringify({ youtube, instagram, calendar: CALENDAR, autopilot, apiUsage, updatedAt: new Date().toISOString() }), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS_HEADERS });
  }
};

export const config = { path: '/api/cnc-insights' };
