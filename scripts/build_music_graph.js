// Builds the EVE dynamic-music graph from the cached music banks and FOLDS it
// into the audio library artifact as its `music` section (requester direction
// 2026-07-19: one output file for audio; a future API serves the same shape).
// Dev tooling (banks + library are game-derived working data, cache/.tmp only,
// never committed). Usage: node scripts/build_music_graph.js [--library <path>]
//
// Library gains: music = {
//   schemaVersion, generator, banks,
//   nodes        - segments/tracks/playlists/switches keyed by HIRC id
//   eventTargets - music event name -> played target node ids
//   eventStops   - music event name -> stopped target node ids
//   switchSetters- event name -> [{ kind, groupId, targetId }] (set actions)
// }
// Corpus validation must be 100% before the library is touched. NOTE for the
// tools-core migration: build_audio_library.js should generate this section
// natively (and bump the library schemaVersion); this script is transitional,
// and regenerating the library with tools-core currently drops `music` until
// this script is re-run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const orgRoot = path.resolve(root, "..");
// The bnk format is decorator-free plain JS - import src directly so this
// script never depends on a stale runtime-resource dist build.
const bnkModule = pathToFileURL(path.join(orgRoot, "runtime-resource", "src", "formats", "bnk", "index.js")).href;
const { CjsBnkFormat } = await import(bnkModule);
// Music decoders live on the bnk format's Wwise toolkit (moved there
// 2026-07-19, same precedent as the event graph walk).
const { parseMusicSegment, parseMusicTrack, parseMusicPlaylist, parseMusicSwitch } = CjsBnkFormat.wwise;

const libraryPath = process.argv.includes("--library")
  ? process.argv[process.argv.indexOf("--library") + 1]
  : path.join(orgRoot, ".tmp", "ccp_3435006_audio_v1.json");
const library = JSON.parse(fs.readFileSync(libraryPath, "utf8"));
const cacheRoot = "E:/ccpwgl2-server/public/cache";

const MUSIC_BANKS = [ "music.bnk", "music_essential.bnk" ];
const EVENT_BANK = "common.bnk";

function loadBank(name)
{
  const record = library.banks[name];
  if (!record) throw new Error(`bank ${name} not in library`);
  const bytes = new Uint8Array(fs.readFileSync(path.join(cacheRoot, record.storagePath)));
  return CjsBnkFormat.inspect(bytes, { source: name });
}

// ---- music node payload decode over the corpus --------------------------
const nodes = {};
const stats = {};
const failures = [];

for (const bankName of MUSIC_BANKS)
{
  const info = loadBank(bankName);
  const knownIds = new Set();
  for (const entry of info.hirc) knownIds.add(entry.id);

  for (const entry of info.hirc)
  {
    const type = entry.typeName;
    if (![ "music-segment", "music-track", "music-playlist-container", "music-switch-container" ].includes(type))
    {
      continue;
    }
    const payload = entry.payload instanceof Uint8Array ? entry.payload : entry.bytes ?? null;
    if (!payload)
    {
      failures.push({ bank: bankName, type, id: entry.id, reason: "no payload view" });
      continue;
    }
    let parsed = null;
    if (type === "music-segment") parsed = parseMusicSegment(payload, knownIds);
    else if (type === "music-track") parsed = parseMusicTrack(payload);
    else if (type === "music-playlist-container") parsed = parseMusicPlaylist(payload, knownIds);
    else parsed = parseMusicSwitch(payload, knownIds);

    stats[type] = stats[type] || { ok: 0, fail: 0 };
    if (!parsed)
    {
      stats[type].fail++;
      if (failures.length < 20) failures.push({ bank: bankName, type, id: entry.id, size: entry.size });
      continue;
    }
    stats[type].ok++;
    nodes[entry.id] = { type, bank: bankName, ...parsed };
  }
}

console.log("parse stats:", JSON.stringify(stats));
if (failures.length)
{
  console.log("failures (first 20):");
  for (const f of failures) console.log(" ", JSON.stringify(f));
}

// ---- cross-checks --------------------------------------------------------
let badChild = 0, badSource = 0, checkedChildren = 0, checkedSources = 0;
for (const [id, node] of Object.entries(nodes))
{
  for (const child of node.children ?? [])
  {
    checkedChildren++;
    if (!nodes[child]) badChild++;
  }
  for (const source of node.sources ?? [])
  {
    checkedSources++;
    if (!library.media[source.sourceId] && !library.embeddedMedia?.[source.sourceId]) badSource++;
  }
}
console.log(`cross-check: children ${checkedChildren - badChild}/${checkedChildren} resolve, sources ${checkedSources - badSource}/${checkedSources} resolve`);

// ---- common.bnk actions: play targets + switch setters -------------------
const common = loadBank(EVENT_BANK);
const actionsById = new Map();
const eventsById = new Map();
for (const entry of common.hirc)
{
  if (entry.typeName === "event-action") actionsById.set(entry.id, entry);
  else if (entry.typeName === "event") eventsById.set(entry.id, entry);
}

// Reverse event-id -> name via the library metadata (eventID field).
const eventNameById = new Map();
for (const [name, record] of Object.entries(library.metadata?.Events ?? {}))
{
  if (record.eventID) eventNameById.set(Number(record.eventID), name);
}

const ACTION_PLAY = 0x04;
const SET_SWITCH_TYPES = new Set();
const actionTypeTally = {};

function actionFields(entry)
{
  // Typed decode exposes actionType/targetId; fall back to raw payload.
  const payload = entry.payload instanceof Uint8Array ? entry.payload : null;
  let actionType = entry.actionType;
  let targetId = entry.targetId ?? entry.target;
  if ((actionType === undefined || targetId === undefined) && payload && payload.byteLength >= 7)
  {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    actionType = view.getUint16(0, true);
    targetId = view.getUint32(2, true);
  }
  return { actionType, targetId, payload };
}

const eventTargets = {};
const eventStops = {};
const switchSetters = {};
let musicEventCount = 0;

for (const [eventId, eventEntry] of eventsById)
{
  const name = eventNameById.get(eventId);
  if (!name || !name.startsWith("music_")) continue;
  musicEventCount++;
  const actionIds = eventEntry.actionIds ?? eventEntry.actions ?? null;
  let ids = actionIds;
  if (!ids)
  {
    const payload = eventEntry.payload instanceof Uint8Array ? eventEntry.payload : null;
    if (!payload) continue;
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const count = view.getUint8(0);
    ids = [];
    for (let i = 0; i < count; i++) ids.push(view.getUint32(1 + i * 4, true));
  }
  for (const actionId of ids)
  {
    const action = actionsById.get(actionId);
    if (!action) continue;
    const { actionType, targetId, payload } = actionFields(action);
    if (actionType === undefined) continue;
    const family = (actionType >> 8) & 0xff;
    actionTypeTally[`0x${actionType.toString(16).padStart(4, "0")}`] =
      (actionTypeTally[`0x${actionType.toString(16).padStart(4, "0")}`] || 0) + 1;
    if (family === ACTION_PLAY && nodes[targetId])
    {
      (eventTargets[name] = eventTargets[name] || []).push(targetId);
    }
    else if (family === 0x01 && nodes[targetId])
    {
      // Stop actions targeting music nodes (Wwise executes these; our engine
      // must too - the emitter's stop-relationship pass is bookkeeping only).
      (eventStops[name] = eventStops[name] || []).push(targetId);
    }
    else if ((family === 0x19 || family === 0x12) && payload)
    {
      // AkActionSetSwitch / AkActionSetState payload tail:
      // u32 groupId, u32 targetStateId.
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      const groupId = view.getUint32(payload.byteLength - 8, true);
      const targetStateId = view.getUint32(payload.byteLength - 4, true);
      (switchSetters[name] = switchSetters[name] || []).push({
        kind: family === 0x19 ? "switch" : "state",
        groupId,
        targetId: targetStateId
      });
      SET_SWITCH_TYPES.add(actionType);
    }
  }
}

console.log(`music events: ${musicEventCount}; play targets: ${Object.keys(eventTargets).length}; stop targets: ${Object.keys(eventStops).length}; switch setters: ${Object.keys(switchSetters).length}`);
console.log("music-event action types seen:", JSON.stringify(actionTypeTally));

// ---- emit ----------------------------------------------------------------
const failed = Object.values(stats).reduce((sum, s) => sum + s.fail, 0);
if (failed > 0)
{
  console.error(`NOT EMITTING: ${failed} parse failures`);
  process.exit(1);
}

// Durable catalog typing (kb §5): classify every embedded media entry from
// its magic bytes once at build time, so consumers filter non-wem media
// (MIDI clips, plugin blobs) without fetching bytes at runtime.
const magicBuffer = Buffer.alloc(4);
const bankHandles = new Map();
const mediaTypeTally = {};
for (const record of Object.values(library.embeddedMedia ?? {}))
{
  if (!bankHandles.has(record.bank))
  {
    bankHandles.set(record.bank, fs.openSync(path.join(cacheRoot, library.banks[record.bank].storagePath), "r"));
  }
  fs.readSync(bankHandles.get(record.bank), magicBuffer, 0, 4, record.offset);
  const magic = magicBuffer.toString("latin1");
  record.mediaType = magic === "RIFF" || magic === "RIFX" ? "wem"
    : magic === "MIDI" ? "midi"
    : magic === "PLUG" ? "plugin"
    : "unknown";
  mediaTypeTally[record.mediaType] = (mediaTypeTally[record.mediaType] || 0) + 1;
}
for (const handle of bankHandles.values()) fs.closeSync(handle);
console.log("embeddedMedia mediaType:", JSON.stringify(mediaTypeTally));

library.music = {
  schemaVersion: 1,
  generator: "runtime-audio/scripts/build_music_graph.js",
  banks: MUSIC_BANKS,
  nodes,
  eventTargets,
  eventStops,
  switchSetters
};
fs.writeFileSync(libraryPath, JSON.stringify(library));
console.log("folded music section into", libraryPath,
  `${(fs.statSync(libraryPath).size / 1048576).toFixed(2)} MB total, ${Object.keys(nodes).length} music nodes`);

// Remove the transitional sibling artifact if a previous run left one.
const legacyPath = path.join(orgRoot, ".tmp", `ccp_${library.build ?? "3435006"}_music_v1.json`);
if (fs.existsSync(legacyPath))
{
  fs.unlinkSync(legacyPath);
  console.log("removed legacy sibling artifact", legacyPath);
}
