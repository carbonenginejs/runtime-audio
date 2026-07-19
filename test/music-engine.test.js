import test from "node:test";
import assert from "node:assert/strict";
import { CjsMusicEngine, wwiseIdFromName } from "../npm/dist/index.js";


// Synthetic music graph in the extractor's emitted shape: a switch container
// (group "music_mood") routing mood "calm" -> a playlist looping segment A,
// mood "combat" -> segment B directly. Setter event flips the mood.

const GROUP = wwiseIdFromName("music_mood");
const CALM = wwiseIdFromName("calm");
const COMBAT = wwiseIdFromName("combat");
const SILENT = wwiseIdFromName("silent");
const UNSHIPPED = wwiseIdFromName("unshipped");

const SEGMENT_A = 100, SEGMENT_B = 200, TRACK_A = 101, TRACK_B = 201;
const PLAYLIST = 300, SWITCH = 400;

// Segment A: 10s long, entry cue 1000ms, exit cue 9000ms -> 8s boundary period.
// Its clip covers the full source (10s) starting at timeline 0 (1s pre-entry).
function fixtureGraph()
{
  return {
    schemaVersion: 1,
    nodes: {
      [SEGMENT_A]: {
        type: "music-segment",
        children: [ TRACK_A ],
        meter: { gridPeriod: 1000, gridOffset: 0, tempo: 120, beatsPerBar: 4, beatValue: 4 },
        stingers: [],
        duration: 10000,
        markers: [ { id: 1, position: 1000, name: "" }, { id: 2, position: 9000, name: "" } ]
      },
      [TRACK_A]: {
        type: "music-track",
        trackType: 0,
        subTrackCount: 1,
        switchParams: null,
        sources: [ { pluginId: 0x00040001, streamType: 1, sourceId: 111, inMemoryMediaSize: 0, sourceBits: 0 } ],
        clips: [ { trackId: 0, sourceId: 111, eventId: 0, playAt: 0, beginTrimOffset: 0, endTrimOffset: 0, srcDuration: 10000 } ]
      },
      [SEGMENT_B]: {
        type: "music-segment",
        children: [ TRACK_B ],
        meter: { gridPeriod: 1000, gridOffset: 0, tempo: 120, beatsPerBar: 4, beatValue: 4 },
        stingers: [],
        duration: 4000,
        markers: [ { id: 1, position: 0, name: "" }, { id: 2, position: 4000, name: "" } ]
      },
      [TRACK_B]: {
        type: "music-track",
        trackType: 0,
        subTrackCount: 1,
        switchParams: null,
        sources: [ { pluginId: 0x00040001, streamType: 1, sourceId: 222, inMemoryMediaSize: 0, sourceBits: 0 } ],
        clips: [ { trackId: 0, sourceId: 222, eventId: 0, playAt: 0, beginTrimOffset: 0, endTrimOffset: 0, srcDuration: 4000 } ]
      },
      [PLAYLIST]: {
        type: "music-playlist-container",
        children: [ SEGMENT_A ],
        meter: { gridPeriod: 1000, gridOffset: 0, tempo: 120, beatsPerBar: 4, beatValue: 4 },
        stingers: [],
        rules: [],
        // Root sequence loops forever over one leaf that plays segment A once.
        playlist: [
          { segmentId: 0, playlistItemId: 1, childCount: 1, rsType: 0, loop: 0, loopMin: 0, loopMax: 0, weight: 50000, avoidRepeatCount: 0, usingWeight: false, shuffle: false },
          { segmentId: SEGMENT_A, playlistItemId: 2, childCount: 0, rsType: -1, loop: 1, loopMin: 0, loopMax: 0, weight: 50000, avoidRepeatCount: 0, usingWeight: false, shuffle: false }
        ]
      },
      [SWITCH]: {
        type: "music-switch-container",
        children: [ PLAYLIST, SEGMENT_B ],
        meter: { gridPeriod: 1000, gridOffset: 0, tempo: 120, beatsPerBar: 4, beatValue: 4 },
        stingers: [],
        rules: [ {
          srcIds: [ -1 ], dstIds: [ -1 ],
          src: { transitionTime: 500, fadeCurve: 4, fadeOffset: 0, syncType: 7, cueFilterHash: 0, playPostExit: false },
          dst: { transitionTime: 0, fadeCurve: 4, fadeOffset: 0, cueFilterHash: 0, jumpToId: 0, jumpToType: 0, entryType: 0, playPreEntry: false, matchSourceCueName: false },
          transitionSegment: null
        } ],
        continuePlayback: true,
        argumentGroups: [ { groupId: GROUP, groupType: 0 } ],
        mode: 0,
        treeNodes: [
          { key: 0, audioNodeId: 0, childrenIdx: 1, childrenCount: 5, weight: 50000, probability: 100 },
          { key: 0, audioNodeId: PLAYLIST, childrenIdx: 0, childrenCount: 0, weight: 50000, probability: 100 },
          { key: CALM, audioNodeId: PLAYLIST, childrenIdx: 0, childrenCount: 0, weight: 50000, probability: 100 },
          { key: COMBAT, audioNodeId: SEGMENT_B, childrenIdx: 0, childrenCount: 0, weight: 50000, probability: 100 },
          { key: SILENT, audioNodeId: 0, childrenIdx: 0, childrenCount: 0, weight: 50000, probability: 100 },
          { key: UNSHIPPED, audioNodeId: 999999, childrenIdx: 0, childrenCount: 0, weight: 50000, probability: 100 }
        ]
      }
    },
    eventTargets: { music_test_play: [ SWITCH ] },
    eventStops: { music_test_stop: [ SWITCH ] },
    switchSetters: {
      music_switch_calm: [ { kind: "switch", groupId: GROUP, targetId: CALM } ],
      music_switch_combat: [ { kind: "switch", groupId: GROUP, targetId: COMBAT } ],
      music_switch_silent: [ { kind: "switch", groupId: GROUP, targetId: SILENT } ],
      music_switch_unshipped: [ { kind: "switch", groupId: GROUP, targetId: UNSHIPPED } ]
    }
  };
}

function FakeContext()
{
  const context = {
    currentTime: 0,
    destination: { name: "destination" },
    gains: [],
    sources: [],
    createGain()
    {
      const node = {
        gain: { value: 1, ramps: [], linearRampToValueAtTime(v, t) { node.gain.ramps.push([ v, t ]); } },
        connectedTo: null,
        disconnected: false,
        connect(target) { node.connectedTo = target; },
        disconnect() { node.disconnected = true; }
      };
      context.gains.push(node);
      return node;
    },
    createBufferSource()
    {
      const source = {
        buffer: null, onended: null, connectedTo: null,
        startedAt: null, startOffset: null, startDuration: null, stoppedAt: null,
        connect(target) { source.connectedTo = target; },
        start(when, offset, duration) { source.startedAt = when; source.startOffset = offset; source.startDuration = duration; },
        stop(when) { source.stoppedAt = when; }
      };
      context.sources.push(source);
      return source;
    }
  };
  return context;
}

function Harness(mutate = null)
{
  const context = FakeContext();
  const loaded = [];
  const finished = [];
  const graph = fixtureGraph();
  mutate?.(graph);
  const engine = new CjsMusicEngine({
    graph,
    context,
    loadMedia: async sourceId => (loaded.push(sourceId), { fake: sourceId }),
    destination: context.destination,
    random: () => 0.5
  });
  return { context, engine, loaded, finished };
}

const tick = () => new Promise(resolve => setImmediate(resolve));


test("posting the music event schedules the resolved playlist's segment clips on time", async () =>
{
  const { context, engine, loaded, finished } = Harness();
  assert.equal(engine.HandlesEvent("music_test_play"), true);
  assert.equal(engine.HandlesEvent("some_gun_sound"), false);

  engine.PostEvent("music_test_play", 501, () => finished.push(501));
  assert.equal(engine.GetPlayingCount(), 1);
  assert.equal(engine.GetResolvedTarget(501), PLAYLIST, "default switch value routes through key 0 to the playlist");

  await tick();
  assert.deepEqual(loaded, [ 111 ], "segment A's media requested once");
  const first = context.sources[0];
  // Clip starts 1s pre-entry: entry cue aligns at now (0), so the source
  // starts immediately with a 1000ms offset into the clip.
  assert.equal(first.startedAt, 0);
  assert.equal(first.startOffset, 1);
  assert.equal(first.startDuration, 9, "remaining clip audio after the offset");
  assert.equal(first.connectedTo, context.gains[2], "clips play through their segment gain");
  assert.equal(context.gains[2].connectedTo, context.gains[1], "segment gain chains into the instance gain");
  assert.equal(context.gains[1].connectedTo, context.gains[0], "instance gain chains into the music bus");
  assert.equal(context.gains[0].connectedTo, context.destination, "music bus feeds the destination");
  engine.SetMusicVolume(0.25);
  assert.equal(context.gains[0].gain.value, 0.25, "music volume drives the music bus");

  const [ status ] = engine.GetStatus();
  assert.equal(status.playingID, 501);
  assert.equal(status.resolvedTargetId, PLAYLIST);
  assert.equal(status.preparingTargetId, null, "nothing queued");
  assert.equal(status.silent, false);
  assert.deepEqual(status.segments, [ {
    segmentId: SEGMENT_A, scheduleId: 1, targetId: PLAYLIST, startCtx: 0, endCtx: 8,
    volume: 1, fading: false, fadeEndCtx: null, pending: 0
  } ], "scheduled window spans entry to exit cue with mix state and identity");

  assert.equal(engine.PreviewSwitchEvent("music_switch_combat", SWITCH), SEGMENT_B, "combat previews playable");
  assert.equal(engine.PreviewSwitchEvent("music_switch_silent", SWITCH), null, "authored silence previews unavailable");
  assert.equal(engine.PreviewSwitchEvent("music_switch_unshipped", SWITCH), null, "unshipped content previews unavailable");
});


test("the looping playlist chains segment A at its exit-cue boundary, sample-accurately", async () =>
{
  const { context, engine } = Harness();
  engine.PostEvent("music_test_play", 502, () => {});
  await tick();
  // Boundary period = exit - entry = 8s. Advance near the horizon and tick.
  context.currentTime = 7;
  engine.Process();
  await tick();
  assert.equal(context.sources.length >= 2, true, "next iteration scheduled within the lookahead");
  const second = context.sources[1];
  assert.equal(second.startedAt, 7, "past pre-entry start collapses to now");
  assert.equal(second.startOffset, 0);
});


test("a switch setter event transitions to segment B at the exit-cue boundary with the rule's fade", async () =>
{
  const { context, engine, finished } = Harness();
  engine.PostEvent("music_test_play", 503, () => finished.push(503));
  await tick();

  engine.PostEvent("music_switch_combat", 504, () => finished.push(504));
  await tick();
  assert.deepEqual(finished, [ 504 ], "setter event finishes immediately; music keeps playing");
  assert.equal(engine.GetPlayingCount(), 1);

  // Pending target applies at the next boundary (8s): segment A's source is
  // stopped with the 500ms src fade and segment B starts at the boundary.
  context.currentTime = 6.6;
  engine.Process();
  await tick();
  assert.equal(engine.GetResolvedTarget(503), SEGMENT_B, "tree re-resolves to combat");
  const segmentASource = context.sources[0];
  assert.equal(segmentASource.stoppedAt, 8.5, "old segment stops at boundary + 500ms rule fade");
  const segmentBSource = context.sources.find(s => s.startDuration === 4);
  assert.ok(segmentBSource, "segment B clip scheduled");
  assert.equal(segmentBSource.startedAt, 8, "segment B enters at the boundary");
});


test("a NextBar rule transitions at the next bar boundary with a crossfade", async () =>
{
  // 120 BPM 4/4 -> bar = 2000ms. Segment A entry cue at 1000ms aligned to
  // ctx 0 puts segment-timeline zero at ctx -1s.
  const { context, engine } = Harness(graph =>
  {
    graph.nodes[SWITCH].rules[0].src.syncType = 2;
    graph.nodes[SWITCH].rules[0].src.transitionTime = 500;
  });
  engine.PostEvent("music_test_play", 508, () => {});
  await tick();

  context.currentTime = 2.3;
  engine.PostEvent("music_switch_combat", 509, () => {});
  await tick();

  assert.equal(engine.GetResolvedTarget(508), SEGMENT_B);
  // Position 3300ms into the segment timeline -> next bar at 4000ms -> ctx 3.0.
  assert.equal(context.sources[0].stoppedAt, 3.5, "old segment stops when its 500ms crossfade lands");
  const segmentAGain = context.gains[2];
  assert.deepEqual(segmentAGain.gain.ramps, [ [ 0, 3.5 ] ], "old segment gain fades to the sync point + fade");
  const segmentBSource = context.sources.find(s => s.startDuration === 4);
  assert.ok(segmentBSource, "segment B scheduled");
  assert.equal(segmentBSource.startedAt, 3, "segment B enters at the bar boundary");
});


test("states that resolve to nothing fade to silence and the music resumes on the next state", async () =>
{
  // EVE's trees contain authored-silence leaves (audio node 0) AND leaves
  // referencing ids absent from every shipped bank; both must silence the
  // instance without killing it.
  for (const chip of [ "music_switch_silent", "music_switch_unshipped" ])
  {
    const { context, engine, finished } = Harness();
    engine.PostEvent("music_test_play", 600, () => finished.push(600));
    await tick();
    context.currentTime = 2;
    engine.PostEvent(chip, 601, () => {});
    await tick();
    assert.equal(engine.GetPlayingCount(), 1, `${chip}: instance survives silence`);
    assert.equal(engine.GetResolvedTarget(600), null, `${chip}: resolved to nothing`);
    assert.ok(context.sources[0].stoppedAt !== null, `${chip}: outgoing audio faded out`);
    assert.deepEqual(finished, [], `${chip}: the play event did not finish`);

    // Advance well past the old boundary: silent instances never exhaust.
    context.currentTime = 30;
    engine.Process();
    assert.equal(engine.GetPlayingCount(), 1, `${chip}: still alive while silent`);

    engine.PostEvent("music_switch_combat", 602, () => {});
    await tick();
    engine.Process();
    assert.equal(engine.GetResolvedTarget(600), SEGMENT_B, `${chip}: resumed on the next state`);
    const resumed = context.sources.find(s => s.startDuration === 4);
    assert.ok(resumed, `${chip}: segment B scheduled after silence`);
    assert.ok(resumed.startedAt >= 30, `${chip}: resume scheduled from now, not the stale timeline`);
  }
});


test("an authored stop event stops the matching instance with the default fade", async () =>
{
  const { context, engine, finished } = Harness();
  engine.PostEvent("music_test_play", 506, () => finished.push(506));
  await tick();
  context.currentTime = 3;
  engine.PostEvent("music_test_stop", 507, () => finished.push(507));
  await tick();
  assert.deepEqual(finished.sort(), [ 506, 507 ], "music finished and the stop event completed");
  assert.equal(engine.GetPlayingCount(), 0);
  assert.deepEqual(context.gains[1].gain.ramps, [ [ 0, 4 ] ], "default 1s fade");
});


test("stop fades the instance gain and finishes exactly once", async () =>
{
  const { context, engine, finished } = Harness();
  engine.PostEvent("music_test_play", 505, () => finished.push(505));
  await tick();
  context.currentTime = 2;
  engine.ExecuteAction("stop", 505, 1000);
  assert.deepEqual(context.gains[1].gain.ramps, [ [ 0, 3 ] ], "1s fade on the instance gain");
  assert.equal(context.sources[0].stoppedAt, 3, "source stops when the fade lands");
  assert.deepEqual(finished, [ 505 ]);
  assert.equal(engine.GetPlayingCount(), 0);
  engine.ExecuteAction("stop", 505, 0);
  assert.deepEqual(finished, [ 505 ], "second stop is a no-op");
});
