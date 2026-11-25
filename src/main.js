import manifest from "./appmeta/manifest.json";
import settingsSchema from "./appmeta/settings.json";
import { fetchShow, parseChannel } from "./youtube.js";
import { cacheExpired, hourChange, readCache, saveCache } from "./history.js";
import { filledSeats, renderTheater, SEATS } from "./theater.js";
import { renderDashboard } from "./dashboard.js";

const API = "http://localhost/api/";
const MINUTE = 60_000;
const REFRESH_MS = 5 * MINUTE;
const MANUAL_DELAY_MS = 30_000;
const OPEN_MS = 650;
const SEATS_MS = 800;
const CELEBRATION_MS = 850;
const goalField = settingsSchema.fields.view_goal;

let goal = goalField.default;
let channel = null;
let channelKey = "";
let apiKey = "";
let live = null;
let sample = null;
let index = 0;
let status = "CONNECTING";
let setupHint = "";
let nextRefresh = Infinity;
let lastAttempt = -Infinity;
let refreshing = false;
let animation = null;
let displayedFront = "";
let displayedBack = "";
let drawFailure = "";
let drawing = false;
let stopped = false;

function previewShow() {
  return {
    title: "Sample channel",
    subscribers: 12_300,
    videos: [
      { id: "demo-night", title: "Night Drive", views: Math.round(goal * 0.68), hour: Math.round(goal * 0.12) },
      { id: "demo-orbit", title: "A Minute in Orbit", views: goal, hour: Math.round(goal * 0.32) },
      { id: "demo-lighthouse", title: "The Last Lighthouse", views: Math.round(goal * 0.29), hour: Math.round(goal * 0.04) },
    ],
  };
}

function currentShow() {
  return sample || live?.show;
}

function currentVideo() {
  return currentShow()?.videos[index];
}

function animate(now, from, curtain) {
  const seats = filledSeats(currentVideo()?.views, goal);
  animation = {
    start: now,
    from,
    seats,
    curtain,
    celebrate: from < SEATS && seats === SEATS,
  };
}

function frame(now) {
  const target = filledSeats(currentVideo()?.views, goal);
  if (!animation) return { opening: 36, seats: target, sparks: -1 };

  const elapsed = now - animation.start;
  const openTime = animation.curtain ? OPEN_MS : 0;
  const opening = openTime ? Math.min(36, Math.floor(36 * elapsed / openTime)) : 36;
  const seatTime = Math.max(0, elapsed - openTime);
  const duration = animation.from === animation.seats ? 0 : SEATS_MS;
  const progress = duration ? Math.min(1, seatTime / duration) : 1;
  const seats = Math.round(animation.from + (animation.seats - animation.from) * progress);
  const afterSeats = seatTime - duration;
  const sparks = animation.celebrate && afterSeats >= 0 && afterSeats < CELEBRATION_MS ?
    Math.floor(afterSeats / 150) : -1;
  if (elapsed >= openTime + duration + (animation.celebrate ? CELEBRATION_MS : 0)) animation = null;
  return { opening, seats, sparks };
}

function footer(now) {
  if (sample) return setupHint;
  if (live && status !== "LIVE") {
    const minutes = Math.max(0, Math.floor((now - live.at) / MINUTE));
    return "CACHED " + (minutes < 60 ? minutes + "M" : Math.floor(minutes / 60) + "H") + " AGO";
  }
  if (!live && status === "CHECK KEY") return "CHECK APP SETTINGS";
  return "";
}

async function refresh(now) {
  const previous = live;
  refreshing = true;
  lastAttempt = now;
  nextRefresh = Infinity;
  try {
    const show = await fetchShow(channel, apiKey);
    if (stopped) return;
    const at = Date.now();
    const selected = currentVideo();
    const priorFrame = frame(at);
    live = saveCache(localStorage, channelKey, show, previous, at);
    const previousIndex = index === 0 ? 0 : show.videos.findIndex((video) => video.id === selected?.id);
    index = Math.max(0, previousIndex);
    const video = currentVideo();
    if (video?.id !== selected?.id) {
      animate(at, 0, true);
    } else if (filledSeats(video?.views, goal) !== filledSeats(selected?.views, goal)) {
      animate(at, priorFrame.seats, false);
    }
    status = "LIVE";
    nextRefresh = at + REFRESH_MS;
  } catch (error) {
    if (stopped) return;
    status = error?.label || "OFFLINE";
    const retrySoon = status === "OFFLINE" || status === "YOUTUBE ERROR";
    nextRefresh = Date.now() + (retrySoon ? MINUTE : REFRESH_MS);
  } finally {
    refreshing = false;
  }
}

async function tick() {
  if (stopped) return;
  const now = Date.now();
  if (cacheExpired(live, now)) {
    live = null;
    index = 0;
    animation = null;
    readCache(localStorage, channelKey, now);
  }
  if (!refreshing && now >= nextRefresh) void refresh(now);
  if (drawing) return;

  const show = currentShow();
  const video = currentVideo();
  const { opening, seats, sparks } = frame(now);
  const marker = sample ? "a" : status === "LIVE" ? "" : "v";
  const frontKey = [video?.views, opening, seats, sparks, marker].join("|");
  const hour = sample ? video?.hour : video ? hourChange(live, video) : null;
  const hint = footer(now);
  const backKey = JSON.stringify([video, show?.title, show?.subscribers, show?.videos.length, status, hour, index, hint]);
  if (frontKey === displayedFront && backKey === displayedBack) return;

  const elements = [];
  if (frontKey !== displayedFront) {
    elements.push({
      id: "cinema", type: "xpmbitmap", display: "front", x: 0, y: 0, align: "top_left",
      data: renderTheater(video?.views, seats, opening / 36, sparks, marker),
    });
  }
  if (backKey !== displayedBack) {
    elements.push(...renderDashboard({ show, video, status, demo: Boolean(sample), hour, goal, index, footer: hint }));
  }

  drawing = true;
  try {
    const response = await fetch(API + "display/draw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ application_name: manifest.id, priority: 50, elements }),
    });
    if (!response.ok) throw new Error("display HTTP " + response.status + ": " + await response.text());
    displayedFront = frontKey;
    displayedBack = backKey;
    drawFailure = "";
  } catch (error) {
    if (String(error) !== drawFailure) console.error(error);
    drawFailure = String(error);
  } finally {
    drawing = false;
  }
}

const timer = setInterval(tick, 90);
const unbind = listen("input", (event) => {
  const now = Date.now();
  const length = currentShow()?.videos.length || 0;
  if (event.key === "encoder" && event.delta && length > 1) {
    const next = ((index + event.delta) % length + length) % length;
    if (next !== index) {
      index = next;
      animate(now, 0, true);
    }
  } else if (event.key === "start" && event.action === "short") {
    animate(now, 0, true);
  } else if (event.key === "ok" && event.action === "short") {
    if (sample) {
      const current = currentVideo();
      const from = frame(now).seats;
      if (current.views >= goal) {
        sample.videos[index] = { ...current, views: 0, hour: 0 };
      } else {
        const views = Math.min(goal, current.views + Math.ceil(goal * 0.12));
        sample.videos[index] = { ...current, views, hour: current.hour + views - current.views };
      }
      animate(now, from, false);
    } else if (channel && apiKey && !refreshing && status !== "API LIMIT") {
      nextRefresh = Math.min(nextRefresh, Math.max(now, lastAttempt + MANUAL_DELAY_MS));
    }
  } else if (event.key === "back" && event.action === "short") {
    stopped = true;
    clearInterval(timer);
    setTimeout(unbind, 0);
  }
});

async function boot() {
  let values = {};
  let settingsLoaded = false;
  try {
    const response = await fetch(API + "apps/settings?app_id=" + manifest.id);
    if (!response.ok) throw new Error("settings HTTP " + response.status);
    const settings = await response.json();
    values = settings.values || {};
    settingsLoaded = true;
  } catch (error) {
    console.warn("Could not read app settings: " + error);
  }
  if (stopped) return;

  if (Number.isInteger(values.view_goal)) {
    goal = Math.max(goalField.min, Math.min(goalField.max, values.view_goal));
  }
  const channelInput = typeof values.channel === "string" ? values.channel.trim() : "";
  channel = parseChannel(channelInput);
  apiKey = typeof values.api_key === "string" ? values.api_key.trim() : "";
  const now = Date.now();
  if (!channel || !apiKey) {
    if (settingsLoaded) readCache(localStorage, "", now);
    if (channelInput && !channel) setupHint = "CHECK CHANNEL SETUP";
    else if (channelInput || apiKey) setupHint = "SET CHANNEL AND KEY";
    sample = previewShow();
    status = "DEMO";
    animate(now, 0, true);
    return;
  }
  channelKey = channel.parameter + ":" + channel.value;
  live = readCache(localStorage, channelKey, now);
  if (live) animate(now, 0, true);
  nextRefresh = now;
}

void boot();
void tick();
