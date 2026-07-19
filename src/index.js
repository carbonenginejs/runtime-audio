// Data-only Carbon audio graph classes owned by this package - see
// src/trinity/README.md, AUDIO-MAP.md, and .agents/CLASS-OWNERSHIP.md.
// This entry must stay headless: importing it never requires an AudioContext,
// WebAudio, or DOM. The WebAudio realization (CjsAudio*, ICjsAudioSystem) is a
// later, separate layer.
export * from "./trinity/index.js";

// CarbonEngineJS-original realization layer (WebAudio). Importing these does
// NOT create an AudioContext - construction stays headless until Enable().
export { CjsAudioBackend } from "./CjsAudioBackend.js";
export { CjsAudioSystem } from "./CjsAudioSystem.js";
export { CjsMusicEngine, wwiseIdFromName } from "./CjsMusicEngine.js";
export { audioMetadataFromSoundbanksInfo } from "./audioMetadata.js";
