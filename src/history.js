const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const SAMPLE_WINDOW = HOUR + 15 * MINUTE;
const MAX_CACHE_AGE = 24 * HOUR;
const CACHE_KEY = "premiere-bar-v1";

export function readCache(storage, channel, now) {
  try {
    const saved = JSON.parse(storage.getItem(CACHE_KEY));
    if (!saved) return null;
    const age = now - saved.at;
    if (saved.channel === channel && saved.show && Number.isFinite(age) && age >= 0 && age < MAX_CACHE_AGE) {
      return saved;
    }
    storage.removeItem(CACHE_KEY);
  } catch {
    // A bad or unavailable cache never blocks live data.
  }
  return null;
}

export function saveCache(storage, channel, show, previous, at) {
  const history = {};
  for (const video of show.videos) {
    const samples = previous?.show.id === show.id ? previous.history?.[video.id] || [] : [];
    history[video.id] = samples.filter(([time]) => time >= at - SAMPLE_WINDOW && time < at);
    history[video.id].push([at, video.views]);
  }
  const saved = { channel, at, show, history };
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(saved));
  } catch {
    // Keep collecting in memory if flash storage is unavailable.
  }
  return saved;
}

export function hourChange(saved, video) {
  const samples = saved?.history?.[video.id];
  if (!samples) return null;
  const target = saved.at - HOUR;
  for (let index = samples.length - 1; index >= 0; index--) {
    const [time, views] = samples[index];
    if (time <= target) return time >= saved.at - SAMPLE_WINDOW ? video.views - views : null;
  }
  return null;
}

export function cacheExpired(saved, now) {
  return saved && now - saved.at >= MAX_CACHE_AGE;
}
