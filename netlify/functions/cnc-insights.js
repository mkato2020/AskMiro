/**
 * Crown n Cradle — Dashboard API (Netlify Function)
 * Returns live YouTube + Instagram insights
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// YouTube OAuth credentials
const YT_CLIENT_ID = process.env.CNC_YT_CLIENT_ID;
const YT_CLIENT_SECRET = process.env.CNC_YT_CLIENT_SECRET;
let ytRefreshToken = process.env.CNC_YT_REFRESH_TOKEN;

// Instagram token
let igAccessToken = process.env.CNC_IG_ACCESS_TOKEN;
const igUserId = process.env.CNC_IG_USER_ID;

async function getYouTubeAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: YT_CLIENT_ID,
      client_secret: YT_CLIENT_SECRET,
      refresh_token: ytRefreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function fetchYouTube() {
  if (!YT_CLIENT_ID || !ytRefreshToken) return { error: 'YouTube not configured' };

  const accessToken = await getYouTubeAccessToken();
  if (!accessToken) return { error: 'Failed to refresh YouTube token' };

  // Get channel stats
  let channel = {};
  try {
    const chRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&mine=true',
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    const chData = await chRes.json();
    if (chData.items && chData.items[0]) {
      const ch = chData.items[0];
      channel = {
        name: ch.snippet.title,
        subscribers: parseInt(ch.statistics.subscriberCount || 0),
        totalViews: parseInt(ch.statistics.viewCount || 0),
        totalVideos: parseInt(ch.statistics.videoCount || 0),
        thumbnail: ch.snippet.thumbnails?.medium?.url,
      };
    }
  } catch (e) {}

  // Get recent videos (search for shorts)
  let videos = [];
  try {
    const searchRes = await fetch(
      'https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=25&order=date',
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    const searchData = await searchRes.json();
    const videoIds = (searchData.items || []).map(i => i.id.videoId).filter(Boolean);

    if (videoIds.length > 0) {
      const statsRes = await fetch(
        'https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=' + videoIds.join(','),
        { headers: { Authorization: 'Bearer ' + accessToken } }
      );
      const statsData = await statsRes.json();
      videos = (statsData.items || []).map(item => ({
        videoId: item.id,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
        views: parseInt(item.statistics.viewCount || 0),
        likes: parseInt(item.statistics.likeCount || 0),
        comments: parseInt(item.statistics.commentCount || 0),
        url: 'https://youtube.com/shorts/' + item.id,
      })).sort((a, b) => b.views - a.views);
    }
  } catch (e) {}

  const totals = {
    totalViews: videos.reduce((s, v) => s + v.views, 0),
    totalLikes: videos.reduce((s, v) => s + v.likes, 0),
    totalComments: videos.reduce((s, v) => s + v.comments, 0),
    avgViews: videos.length ? Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length) : 0,
  };

  return { channel, videos, totals };
}

async function fetchInstagram() {
  if (!igAccessToken || !igUserId) return { error: 'Instagram not configured' };

  let profile = {};
  try {
    const pRes = await fetch(
      'https://graph.instagram.com/v21.0/' + igUserId + '?fields=username,media_count,account_type&access_token=' + igAccessToken
    );
    profile = await pRes.json();
  } catch (e) {}

  let media = [];
  try {
    const mRes = await fetch(
      'https://graph.instagram.com/v21.0/' + igUserId + '/media?fields=id,caption,media_type,timestamp,permalink,thumbnail_url,like_count,comments_count&limit=25&access_token=' + igAccessToken
    );
    const mData = await mRes.json();
    media = (mData.data || []).map(item => ({
      id: item.id,
      caption: (item.caption || '').split('\n')[0].slice(0, 80),
      type: item.media_type,
      postedAt: item.timestamp,
      url: item.permalink,
      likes: item.like_count || 0,
      comments: item.comments_count || 0,
    }));
  } catch (e) {}

  // Get insights for each media
  const mediaWithInsights = [];
  for (const m of media) {
    let views = 0, reach = 0, shares = 0, saves = 0;
    try {
      const iRes = await fetch(
        'https://graph.instagram.com/v21.0/' + m.id + '/insights?metric=plays,reach,shares,saved&access_token=' + igAccessToken
      );
      const iData = await iRes.json();
      if (iData.data) {
        for (const metric of iData.data) {
          if (metric.name === 'plays') views = metric.values?.[0]?.value || 0;
          if (metric.name === 'reach') reach = metric.values?.[0]?.value || 0;
          if (metric.name === 'shares') shares = metric.values?.[0]?.value || 0;
          if (metric.name === 'saved') saves = metric.values?.[0]?.value || 0;
        }
      }
    } catch (e) {}
    mediaWithInsights.push({ ...m, views, reach, shares, saves });
  }

  const totals = {
    totalPosts: profile.media_count || media.length,
    totalViews: mediaWithInsights.reduce((s, m) => s + m.views, 0),
    totalLikes: mediaWithInsights.reduce((s, m) => s + m.likes, 0),
    totalComments: mediaWithInsights.reduce((s, m) => s + m.comments, 0),
    totalShares: mediaWithInsights.reduce((s, m) => s + m.shares, 0),
    totalSaves: mediaWithInsights.reduce((s, m) => s + m.saves, 0),
  };

  return { profile, media: mediaWithInsights, totals };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    const [youtube, instagram] = await Promise.all([fetchYouTube(), fetchInstagram()]);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ youtube, instagram, updatedAt: new Date().toISOString() }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
