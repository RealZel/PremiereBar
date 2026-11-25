const API = "https://www.googleapis.com/youtube/v3/";
const VIDEO_LIMIT = 5;
const PLAYLIST_LIMIT = 10;

export function parseChannel(input) {
  if (typeof input !== "string") return null;
  let value = input.trim();
  const url = /^(?:https?:\/\/)?(?:(?:www|m)\.)?youtube\.com\/(?:(channel)\/)?([^/?#]+)(?:\/(?:featured|videos|shorts|streams|playlists|community|posts|about))?\/?(?:[?#].*)?$/i.exec(value);
  if (url) {
    try {
      value = decodeURIComponent(url[2]);
    } catch {
      return null;
    }
  }
  if (/^UC[A-Za-z0-9_-]{22}$/.test(value) && (!url || url[1])) {
    return { parameter: "id", value };
  }
  if ((!url || !url[1]) && /^@[^\s/?#&%=@]+$/.test(value)) {
    return { parameter: "forHandle", value };
  }
  return null;
}

function counter(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
}

class YouTubeError extends Error {
  constructor(label) {
    super(label);
    this.label = label;
  }
}

function errorLabel(status, body) {
  const reason = body?.error?.errors?.[0]?.reason;
  if (status === 429 || reason === "quotaExceeded" || reason === "dailyLimitExceeded" ||
      reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") return "API LIMIT";
  if (status === 400 || status === 401 || status === 403) return "CHECK KEY";
  return "YOUTUBE ERROR";
}

async function list(resource, parameters, key) {
  const query = Object.keys(parameters).map((name) => name + "=" + encodeURIComponent(parameters[name])).join("&");
  const response = await fetch(API + resource + "?" + query, { headers: { "x-goog-api-key": key } });
  let body;
  try {
    body = await response.json();
  } catch {
    if (response.ok) throw new YouTubeError("YOUTUBE ERROR");
  }
  if (!response.ok) throw new YouTubeError(errorLabel(response.status, body));
  if (!Array.isArray(body?.items)) throw new YouTubeError("YOUTUBE ERROR");
  return body.items;
}

export async function fetchShow(channel, key) {
  const channels = await list("channels", {
    part: "snippet,contentDetails,statistics",
    [channel.parameter]: channel.value,
    fields: "items(id,snippet(title),contentDetails(relatedPlaylists(uploads)),statistics(subscriberCount,hiddenSubscriberCount))",
  }, key);
  const source = channels[0];
  if (!source) throw new YouTubeError("CHANNEL NOT FOUND");

  const uploads = source.contentDetails?.relatedPlaylists?.uploads;
  if (!source.id || !uploads) throw new YouTubeError("YOUTUBE ERROR");
  const latest = await list("playlistItems", {
    part: "contentDetails",
    playlistId: uploads,
    maxResults: PLAYLIST_LIMIT,
    fields: "items(contentDetails(videoId))",
  }, key);
  const ids = latest.map((item) => item.contentDetails?.videoId).filter(Boolean);
  const details = ids.length ? await list("videos", {
    part: "snippet,statistics,status",
    id: ids.join(","),
    fields: "items(id,snippet(title),statistics(viewCount),status(privacyStatus))",
  }, key) : [];

  const videos = [];
  for (const id of ids) {
    const item = details.find((entry) => entry.id === id);
    if (item?.status?.privacyStatus !== "public" || videos.some((video) => video.id === id)) continue;
    const views = counter(item.statistics?.viewCount);
    if (views === null) continue;
    videos.push({ id, title: item.snippet?.title || "Untitled video", views });
    if (videos.length === VIDEO_LIMIT) break;
  }
  const statistics = source.statistics;
  return {
    id: source.id,
    title: source.snippet?.title || channel.value,
    subscribers: statistics?.hiddenSubscriberCount === true ? null : counter(statistics?.subscriberCount),
    videos,
  };
}
