// Emits demo/audio-library.json - the COMMITTABLE demo copy of the audio
// library with every optional culling-enrichment field stripped.
//
// Kept (SoundbanksInfo / resfileindex / bank-derived): event ids + bank
// membership, wem file ids, bank/media storage paths, embeddedMedia (with
// mediaType), eventMedia edges, and the music graph.
// Stripped (optional audio metadata enrichment): per-event culling metadata
// (maxRadiusAttenuation, isLoop, is2D, isVital, eventsStoppedBy) and
// per-bank essential flags. The demo degrades gracefully without them:
// sounds play, loops become one-shots, culling is less informed.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const orgRoot = path.resolve(root, "..");
const libraryPath = process.argv.includes("--library")
  ? process.argv[process.argv.indexOf("--library") + 1]
  : path.join(orgRoot, ".tmp", "ccp_3435006_audio_v1.json");
const library = JSON.parse(fs.readFileSync(libraryPath, "utf8"));

const events = {};
for (const [ name, record ] of Object.entries(library.metadata?.Events ?? {}))
{
  events[name] = { eventID: record.eventID, soundbanks: record.soundbanks };
}
const soundBanks = {};
for (const name of Object.keys(library.metadata?.SoundBanks ?? {}))
{
  soundBanks[name] = {};
}

const demoLibrary = {
  schema: library.schema,
  schemaVersion: library.schemaVersion,
  sourceTarget: library.sourceTarget,
  sourceGame: library.sourceGame,
  sourceProvider: library.sourceProvider,
  sourceBuild: library.sourceBuild,
  generatedAt: library.generatedAt,
  hasOptionalEnrichment: false,
  metadata: {
    Events: events,
    SoundBanks: soundBanks,
    WemFileIDs: library.metadata?.WemFileIDs ?? {}
  },
  media: library.media,
  banks: library.banks,
  eventMedia: library.eventMedia,
  embeddedMedia: library.embeddedMedia,
  music: library.music
};

const outPath = path.join(root, "demo", "audio-library.json");
fs.writeFileSync(outPath, JSON.stringify(demoLibrary));
console.log("wrote", outPath, `${(fs.statSync(outPath).size / 1048576).toFixed(2)} MB`);

// Safety: the committed file must carry no optional enrichment keys.
const text = fs.readFileSync(outPath, "utf8");
for (const banned of [ "maxRadiusAttenuation", "isLoop", "is2D", "isVital", "eventsStoppedBy", "EssentialSoundBank" ])
{
  if (text.includes(`"${banned}"`)) throw new Error(`Optional enrichment field leaked into demo library: ${banned}`);
}
console.log("verified: no optional enrichment fields present");
