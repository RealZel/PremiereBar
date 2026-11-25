import assert from "node:assert/strict";
import test from "node:test";
import { cacheExpired, hourChange, readCache, saveCache } from "../src/history.js";
import { filledSeats, renderTheater } from "../src/theater.js";
import { fetchShow, parseChannel } from "../src/youtube.js";

test("channel settings accept handles, IDs and channel URLs without accepting foreign hosts", () => {
  const id = "UC_x5XG1OV2P6uZZ5FSM9Ttw";
  assert.deepEqual(parseChannel(id), { parameter: "id", value: id });
  assert.deepEqual(parseChannel("https://www.youtube.com/channel/" + id), { parameter: "id", value: id });
  assert.deepEqual(parseChannel(" https://youtube.com/@Caf%C3%A9/videos?feature=shared "), {
    parameter: "forHandle", value: "@Café",
  });
  assert.equal(parseChannel("https://example.com/@H"), null);
  assert.equal(parseChannel("https://youtube.com/watch?v=test"), null);
  assert.equal(parseChannel("https://youtube.com/@%zzz"), null);
});

test("YouTube data uses the uploads order and excludes nonpublic and incomplete videos", async (t) => {
  const responses = [
    { items: [{ id: "channel", snippet: { title: "Channel" },
      contentDetails: { relatedPlaylists: { uploads: "uploads" } },
      statistics: { subscriberCount: "12300" } }] },
    { items: ["new", "private", "old", "unknown", "new"].map((videoId) => ({ contentDetails: { videoId } })) },
    { items: [
      { id: "old", status: { privacyStatus: "public" }, snippet: { title: "Older" }, statistics: { viewCount: "150" } },
      { id: "new", status: { privacyStatus: "public" }, snippet: { title: "Latest" }, statistics: { viewCount: "390" } },
      { id: "private", status: { privacyStatus: "private" }, statistics: { viewCount: "100" } },
      { id: "unknown", status: { privacyStatus: "public" } },
    ] },
  ];
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const request = new URL(url);
    assert.equal(request.origin, "https://www.googleapis.com");
    assert.equal(request.searchParams.has("key"), false);
    assert.equal(options.headers["x-goog-api-key"], "test-key");
    requests.push(request);
    return Response.json(responses.shift());
  });

  const show = await fetchShow(parseChannel("@Example"), "test-key");
  assert.deepEqual(requests.map((url) => url.pathname), ["/youtube/v3/channels", "/youtube/v3/playlistItems", "/youtube/v3/videos"]);
  assert.equal(requests[0].searchParams.get("forHandle"), "@Example");
  assert.equal(requests[1].searchParams.get("playlistId"), "uploads");
  assert.deepEqual(show, { id: "channel", title: "Channel", subscribers: 12300, videos: [
    { id: "new", title: "Latest", views: 390 },
    { id: "old", title: "Older", views: 150 },
  ] });
});

test("API quota and missing channel have distinct statuses", async (t) => {
  const stub = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 403 }));
  await assert.rejects(fetchShow(parseChannel("@Example"), "test-key"), { message: "API LIMIT" });
  stub.mock.mockImplementation(async () => Response.json({ items: [] }));
  await assert.rejects(fetchShow(parseChannel("@Example"), "test-key"), { message: "CHANNEL NOT FOUND" });
});

test("an empty channel keeps its statistics without requesting video details", async (t) => {
  const responses = [
    { items: [{ id: "channel", contentDetails: { relatedPlaylists: { uploads: "uploads" } },
      statistics: { hiddenSubscriberCount: true, subscriberCount: "12300" } }] },
    { items: [] },
  ];
  const stub = t.mock.method(globalThis, "fetch", async () => Response.json(responses.shift()));
  assert.deepEqual(await fetchShow(parseChannel("@Example"), "test-key"), {
    id: "channel", title: "@Example", subscribers: null, videos: [],
  });
  assert.equal(stub.mock.callCount(), 2);
});

test("hourly view change survives restart and clears when the channel changes", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const minute = 60_000;
  const video = (views) => ({ id: "video", views });
  const show = (views) => ({ id: "channel", videos: [video(views)] });
  const start = 100 * minute;
  let saved = saveCache(storage, "@channel", show(100), null, start);
  saved = saveCache(storage, "@channel", show(110), saved, start + 5 * minute);
  assert.equal(hourChange(saved, video(110)), null);
  saved = readCache(storage, "@channel", start + 65 * minute);
  saved = saveCache(storage, "@channel", show(130), saved, start + 65 * minute);
  assert.equal(hourChange(saved, video(130)), 20);
  const stale = saveCache(storage, "@channel", show(140), saved, start + 150 * minute);
  assert.equal(hourChange(stale, video(140)), null);
  assert.equal(cacheExpired(stale, stale.at + 24 * 60 * minute), true);
  assert.equal(readCache(storage, "@other", start + 151 * minute), null);
  assert.equal(values.size, 0);
});

test("seats follow the goal and all animation frames match the 72 × 16 display", () => {
  assert.equal(filledSeats(49, 1000), 0);
  assert.equal(filledSeats(50, 1000), 1);
  assert.equal(filledSeats(680, 1000), 13);
  assert.equal(filledSeats(1000, 1000), 20);
  assert.equal(filledSeats(1200, 1000), 20);
  const empty = renderTheater(null, 0, 1, -1, "v");
  const closed = renderTheater(9999, 12, 0, -1, "a");
  const full = renderTheater(1_450_000, 20, 1, 1, "");
  for (const image of [empty, closed, full]) {
    const [header, sizes, ...tail] = image.split("\n");
    assert.equal(header, "! XPM2");
    const [width, height, colors] = sizes.split(" ").map(Number);
    const rows = tail.slice(colors);
    assert.equal(width, 72);
    assert.equal(height, 16);
    assert.equal(rows.length, height);
    assert.ok(rows.every((row) => row.length === width));
  }
});
