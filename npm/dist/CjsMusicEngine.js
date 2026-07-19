// CarbonEngineJS original (no Carbon counterpart). Interactive-music engine:
// interprets the authored Wwise music graph (extracted offline by
// scripts/build_music_graph.js) the way AK::MusicEngine would in the real
// client. Carbon's C++ contributes no musical intelligence (InitMusic is dead
// code; see .agents/handoff/2026-07-19-dynamic-music-research.md) - the game
// only posts events and sets switches/states, so this engine's fidelity
// target is the bank data, not Carbon code.
//
// v1 semantics (documented simplifications):
// - Segments chain at their exit cue; pre-entry clip audio plays when the
//   schedule allows (first segment starts at its entry cue "now").
// - Switch changes re-resolve the tree and transition at the rule's boundary:
//   syncType 0 (Immediate) now, otherwise at the current segment's exit cue,
//   with the rule's fade times on source and destination instance gains.
// - Playlist groups: sequence in order, random weighted (avoid-repeat via
//   shuffle history); step groups yield one child per visit. Loop 0 =
//   infinite. Transition segments, stingers, and MIDI tracks are not played.

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/** Wwise FNV-1 (32-bit, lowercase) - the id hash for names. */
function wwiseIdFromName(name) {
  if (typeof name === "number") return name >>> 0;
  let hash = FNV_OFFSET;
  for (const char of String(name).toLowerCase()) {
    hash = Math.imul(hash, FNV_PRIME) ^ char.charCodeAt(0);
    hash = hash >>> 0;
  }
  return hash >>> 0;
}
const DEFAULT_FADE_SECONDS = 1;
const SCHEDULE_HORIZON_SECONDS = 1.5;
function segmentCues(segment) {
  const positions = segment.markers.map(marker => marker.position).sort((a, b) => a - b);
  const entry = positions.length ? positions[0] : 0;
  const exit = positions.length > 1 ? positions[positions.length - 1] : segment.duration;
  return {
    entry,
    exit
  };
}

/** Weighted pick over playlist children honoring an avoid-repeat history. */
function pickWeighted(children, history, avoidRepeatCount, random) {
  const avoided = new Set(history.slice(-Math.max(0, avoidRepeatCount)));
  let pool = children.filter(child => !avoided.has(child.item.playlistItemId));
  if (!pool.length) pool = children;
  let total = 0;
  for (const child of pool) total += child.item.weight || 1;
  let roll = random() * total;
  for (const child of pool) {
    roll -= child.item.weight || 1;
    if (roll <= 0) return child;
  }
  return pool[pool.length - 1];
}

/** Builds the nested playlist tree from the flat pre-order item list. */
function buildPlaylistTree(items) {
  let index = 0;
  const build = () => {
    const item = items[index++];
    const children = [];
    for (let i = 0; i < item.childCount; i++) children.push(build());
    return {
      item,
      children
    };
  };
  return build();
}

/**
 * Iterator over a playlist tree yielding segment ids. Sequence groups play
 * children in order; random groups pick weighted; loop counts honored
 * (0 = infinite). Returns null when the playlist is exhausted.
 */
function createPlaylistIterator(playlistNode, random) {
  const root = buildPlaylistTree(playlistNode.playlist);
  const history = [];
  function* walk(node) {
    const loops = node.item.loop === 0 ? Infinity : Math.max(1, node.item.loop);
    for (let i = 0; i < loops; i++) {
      if (!node.children.length) {
        if (node.item.segmentId) yield node.item.segmentId;
        continue;
      }
      const type = node.item.rsType;
      if (type === 1 || type === 3) {
        const child = pickWeighted(node.children, history, node.item.avoidRepeatCount, random);
        history.push(child.item.playlistItemId);
        yield* walk(child);
      } else {
        for (const child of node.children) {
          yield* walk(child);
        }
      }
    }
  }
  const generator = walk(root);
  return () => {
    const next = generator.next();
    return next.done ? null : next.value;
  };
}

/**
 * Walks a switch container's decision tree with the current group values.
 * Returns null for "nothing plays": an unmatched value with no default path,
 * or a leaf whose audio node id is 0 (authored silence). EVE's trees also
 * reference node ids absent from every shipped bank - the caller treats
 * those exactly like authored silence.
 */
function resolveSwitchTarget(node, getValue) {
  const depth = node.argumentGroups.length;
  let current = node.treeNodes[0];
  for (let level = 0; level < depth; level++) {
    const value = getValue(node.argumentGroups[level].groupId);
    const children = node.treeNodes.slice(current.childrenIdx, current.childrenIdx + current.childrenCount);
    if (!children.length) return null;
    current = children.find(child => child.key === value) ?? children.find(child => child.key === 0) ?? null;
    if (!current) return null;
  }
  return current.audioNodeId || null;
}

/** One playing music instance: a posted event's active graph playback. */
class MusicInstance {
  constructor({
    playingID,
    rootId,
    onFinished
  }) {
    this.playingID = playingID;
    this.rootId = rootId;
    this.onFinished = onFinished;
    this.gain = null;
    this.resolvedTargetId = null;
    this.pendingTargetId = null;
    this.pendingGeneration = 0;
    this.nextSegmentId = null;
    this.iterator = null;
    this.boundary = 0;
    this.scheduledThrough = 0;
    this.active = [];
    this.stopped = false;
    this.exhausted = false;
    // Latest scheduled segment's musical timeline (for sync quantization):
    // { startCtx (ctx time of segment position 0), meter }.
    this.timeline = null;
  }
}

/** Interactive-music engine over the extracted Wwise music graph. */
class CjsMusicEngine {
  #graph = null;
  #context = null;
  #loadMedia = null;
  #destination = null;
  #musicGain = null;
  #random = Math.random;
  #switchValues = new Map();
  #instances = new Map();
  #buffers = new Map();
  #nextScheduleId = 1;
  constructor({
    graph,
    context,
    loadMedia,
    destination,
    random
  } = {}) {
    this.#graph = graph ?? null;
    this.#context = context ?? null;
    this.#loadMedia = loadMedia ?? null;
    this.#destination = destination ?? context?.destination ?? null;
    if (random) this.#random = random;
    if (this.#context && this.#destination) {
      // Music output bus: every instance routes through it so music
      // volume is controllable independently of effects.
      this.#musicGain = this.#context.createGain();
      this.#musicGain.connect(this.#destination);
    }
  }
  get musicGain() {
    return this.#musicGain;
  }

  /** Music-bus volume (0..1); effects are unaffected. */
  SetMusicVolume(value) {
    const gain = this.#musicGain?.gain;
    if (gain && typeof gain === "object" && "value" in gain) {
      gain.value = Math.max(0, Math.min(1, Number(value) || 0));
    }
  }

  /** True when this engine owns the event (play/stop target or switch/state setter). */
  HandlesEvent(eventName) {
    if (!this.#graph) return false;
    return !!(this.#graph.eventTargets?.[eventName] || this.#graph.eventStops?.[eventName] || this.#graph.switchSetters?.[eventName]);
  }

  /**
   * Posts a music event under an externally allocated playing id.
   * Setter events apply their switch/state values and finish immediately;
   * play events start graph playback. Returns true when the id stays live.
   */
  PostEvent(eventName, playingID, onFinished) {
    const setters = this.#graph.switchSetters?.[eventName];
    if (setters) {
      for (const setter of setters) {
        this.#SetValue(setter.groupId, setter.targetId);
      }
    }
    const stops = this.#graph.eventStops?.[eventName];
    if (stops) {
      // Authored stop actions target the same root nodes play started.
      for (const instance of [...this.#instances.values()]) {
        if (stops.includes(instance.rootId)) {
          this.#StopInstance(instance, DEFAULT_FADE_SECONDS);
        }
      }
    }
    const targets = this.#graph.eventTargets?.[eventName];
    if (!targets || !targets.length || !this.#context) {
      // Deferred so the caller can record the playing id before the
      // finished callback clears it (setter events finish immediately).
      queueMicrotask(() => onFinished?.());
      return false;
    }
    const instance = new MusicInstance({
      playingID,
      rootId: targets[0],
      onFinished
    });
    instance.gain = this.#context.createGain();
    instance.gain.connect(this.#musicGain ?? this.#destination);
    this.#instances.set(playingID, instance);
    this.#ResolveInstance(instance, this.#context.currentTime);
    this.Process();
    return true;
  }

  /** Stop ("stop") and break ("break") both fade the instance out. */
  ExecuteAction(action, playingID, fadeOutDuration = 1000) {
    const instance = this.#instances.get(playingID);
    if (!instance) {
      return;
    }
    const ms = Number(fadeOutDuration);
    const seconds = Number.isFinite(ms) ? Math.max(0, ms) / 1000 : DEFAULT_FADE_SECONDS;
    this.#StopInstance(instance, seconds);
  }

  /** Switch/state input by name or id; music treats both as tree arguments. */
  SetSwitch(group, value) {
    this.#SetValue(wwiseIdFromName(group), wwiseIdFromName(value));
  }
  SetState(group, value) {
    this.#SetValue(wwiseIdFromName(group), wwiseIdFromName(value));
  }

  /** Active instance count (introspection/tests). */
  GetPlayingCount() {
    return this.#instances.size;
  }

  /** Currently resolved target node id of an instance (introspection/tests). */
  GetResolvedTarget(playingID) {
    return this.#instances.get(playingID)?.resolvedTargetId ?? null;
  }

  /**
   * Scheduling tick: keeps every instance scheduled through the lookahead
   * horizon. Driven by the backend's RenderAudio (per-frame Process).
   */
  Process() {
    if (!this.#context) return;
    const now = this.#context.currentTime;
    for (const instance of [...this.#instances.values()]) {
      if (instance.stopped) continue;
      if (instance.iterator === null) {
        // Silent state (target resolves to nothing): stay alive and
        // idle until a switch/state change resumes the music.
        continue;
      }
      if (instance.exhausted) {
        // Let the last scheduled audio play out to its boundary.
        if (now >= instance.boundary) this.#FinishInstance(instance);
        continue;
      }
      while (instance.boundary - now < SCHEDULE_HORIZON_SECONDS) {
        if (!this.#ScheduleNextSegment(instance)) break;
      }
      // Prune scheduled segments whose audible window has fully passed
      // (a fade cuts the window short), so nothing accumulates and
      // status consumers only ever see live entries.
      instance.active = instance.active.filter(scheduled => {
        const effectiveEnd = scheduled.fading ? Math.min(scheduled.fadeEndCtx ?? scheduled.endCtx, scheduled.endCtx) : scheduled.endCtx;
        return effectiveEnd === undefined || effectiveEnd + 2 > now;
      });
    }
  }

  /**
   * Introspection for UIs: one entry per playing instance with the playing
   * branch, any switch target still preparing (media loading - the fade
   * deliberately waits for it), the scheduled segment windows, and whether
   * the instance is idling in an authored-silence state.
   */
  GetStatus() {
    const now = this.#context?.currentTime ?? 0;
    return [...this.#instances.values()].map(instance => ({
      playingID: instance.playingID,
      now,
      resolvedTargetId: instance.resolvedTargetId,
      preparingTargetId: instance.pendingTargetId,
      silent: instance.iterator === null,
      boundary: instance.boundary,
      segments: instance.active.map(scheduled => ({
        segmentId: scheduled.segmentId,
        // Stable identity for this scheduling (segment ids repeat in
        // loops) and the resolved target it was scheduled under -
        // UIs map targets back to the state/mood that selected them.
        scheduleId: scheduled.scheduleId,
        targetId: scheduled.targetId,
        startCtx: scheduled.startCtx,
        endCtx: scheduled.endCtx,
        // Mix volume: the segment gain's instantaneous value (real
        // AudioParams report mid-ramp values during crossfades).
        volume: scheduled.gain?.gain?.value ?? 1,
        fading: scheduled.fading,
        fadeEndCtx: scheduled.fadeEndCtx,
        // Clips whose media is still loading.
        pending: scheduled.sources.filter(entry => !entry.source && !entry.cancelled).length
      }))
    }));
  }
  #SetValue(groupId, valueId) {
    this.#switchValues.set(groupId >>> 0, valueId >>> 0);
    for (const instance of this.#instances.values()) {
      if (instance.stopped) continue;
      this.#ReevaluateInstance(instance);
    }
  }
  #GetValue(groupId) {
    return this.#switchValues.get(groupId >>> 0) ?? 0;
  }

  /** Resolves the instance's playable target and primes its iterator. */
  #ResolveInstance(instance, startTime) {
    const target = this.#ResolveTargetId(instance.rootId);
    instance.resolvedTargetId = target;
    const node = this.#graph.nodes[target];
    if (!node) {
      this.#FinishInstance(instance);
      return;
    }
    if (node.type === "music-playlist-container") {
      instance.iterator = createPlaylistIterator(node, this.#random);
    } else {
      let played = false;
      instance.iterator = () => played ? null : (played = true, target);
    }
    instance.boundary = startTime;
    instance.nextSegmentId = null;
  }

  /** Resolves through nested switch containers; null = nothing plays. */
  #ResolveTargetId(rootId, getValue = groupId => this.#GetValue(groupId)) {
    let currentId = rootId;
    for (let hops = 0; hops < 8; hops++) {
      if (currentId === null) return null;
      const node = this.#graph.nodes[currentId];
      if (!node) return null;
      if (node.type !== "music-switch-container") return currentId;
      currentId = resolveSwitchTarget(node, getValue);
    }
    return currentId;
  }

  /**
   * Preview (no side effects): the playable target the given root would
   * resolve to if this setter event were posted on top of the CURRENT
   * switch/state values. Null = that state has nothing to play - UIs use
   * this to hide unavailable music options, which shift with state.
   */
  PreviewSwitchEvent(eventName, rootId) {
    if (!this.#graph) return null;
    const overlay = new Map(this.#switchValues);
    for (const setter of this.#graph.switchSetters?.[eventName] ?? []) {
      overlay.set(setter.groupId >>> 0, setter.targetId >>> 0);
    }
    return this.#ResolveTargetId(rootId, groupId => overlay.get(groupId >>> 0) ?? 0);
  }

  /**
   * Switch/state change: if the tree now lands elsewhere, PREPARE the
   * destination's media first, then transition at the rule's sync point.
   * Fading the outgoing music before the incoming buffers exist would leave
   * a silence gap exactly as long as the fetch/decode - so the musical
   * transition is computed only once the destination can actually sound.
   */
  #ReevaluateInstance(instance) {
    const target = this.#ResolveTargetId(instance.rootId);
    if (target === instance.resolvedTargetId) {
      // Switched back before a pending prepare landed - cancel it.
      instance.pendingTargetId = null;
      instance.pendingGeneration++;
      return;
    }
    if (instance.pendingTargetId !== null && target === instance.pendingTargetId) {
      return;
    }
    const rootNode = this.#graph.nodes[instance.rootId];
    const rule = this.#FindRule(rootNode, instance.resolvedTargetId, target);
    if (target === null) {
      // The state resolves to nothing (authored silence, or content
      // absent from every shipped bank): fade out at the sync point
      // and stay alive - the next state change resumes the music.
      instance.pendingTargetId = null;
      instance.pendingGeneration++;
      const when = Math.max(this.#TransitionTime(instance, rule) ?? instance.boundary, this.#context.currentTime);
      const fadeSeconds = Math.max(0, rule?.src.transitionTime ?? 0) / 1000;
      for (const active of instance.active) {
        this.#FadeOutSources(active, when, fadeSeconds);
      }
      instance.resolvedTargetId = null;
      instance.iterator = null;
      return;
    }
    const generation = ++instance.pendingGeneration;
    instance.pendingTargetId = target;
    this.#PrepareTarget(target).then(() => {
      if (instance.stopped || instance.pendingGeneration !== generation) {
        return;
      }
      instance.pendingTargetId = null;
      const when = this.#TransitionTime(instance, rule) ?? instance.boundary;
      this.#TransitionInstance(instance, rule, target, Math.max(when, this.#context.currentTime));
    });
  }

  /**
   * Preload the media a transition destination needs to become audible:
   * the clips of its first reachable segments (first child of sequence
   * groups, every child of random groups, bounded).
   */
  #PrepareTarget(targetId) {
    const sourceIds = new Set();
    for (const segmentId of this.#FirstSegmentCandidates(targetId)) {
      const segment = this.#graph.nodes[segmentId];
      for (const trackId of segment?.children ?? []) {
        const track = this.#graph.nodes[trackId];
        if (!track || track.type !== "music-track") continue;
        for (const clip of track.clips ?? []) {
          if (sourceIds.size >= 8) break;
          sourceIds.add(clip.sourceId);
        }
      }
    }
    return Promise.all([...sourceIds].map(sourceId => this.#LoadBuffer(sourceId, null))).then(() => {});
  }
  #FirstSegmentCandidates(targetId, limit = 4) {
    const node = this.#graph.nodes[targetId];
    if (!node) return [];
    if (node.type === "music-segment") return [targetId];
    if (node.type !== "music-playlist-container" || !node.playlist?.length) return [];
    const results = [];
    const queue = [buildPlaylistTree(node.playlist)];
    while (queue.length && results.length < limit) {
      const current = queue.shift();
      if (!current.children.length) {
        if (current.item.segmentId) results.push(current.item.segmentId);
        continue;
      }
      if (current.item.rsType === 1 || current.item.rsType === 3) {
        queue.push(...current.children);
      } else {
        queue.push(current.children[0]);
      }
    }
    return results;
  }

  /**
   * Context time for a rule's transition sync point, quantized on the
   * current segment's musical timeline. AkSyncType: 0 Immediate,
   * 1 NextGrid, 2 NextBar, 3 NextBeat; cue-synced types return null and
   * transition at the segment boundary instead.
   */
  #TransitionTime(instance, rule) {
    const now = this.#context.currentTime;
    const syncType = rule?.src.syncType ?? 7;
    if (syncType === 0) return now;
    const timeline = instance.timeline;
    const meter = timeline?.meter;
    if (!meter || syncType > 3) return null;
    let periodMs;
    let offsetMs = 0;
    if (syncType === 1) {
      periodMs = meter.gridPeriod;
      offsetMs = meter.gridOffset;
    } else {
      const beatMs = meter.tempo > 0 ? 60000 / meter.tempo : 0;
      periodMs = syncType === 2 ? beatMs * Math.max(1, meter.beatsPerBar) : beatMs;
    }
    if (!(periodMs > 0)) return null;
    const positionMs = (now - timeline.startCtx) * 1000;
    const steps = Math.max(0, Math.ceil((positionMs - offsetMs) / periodMs));
    let when = timeline.startCtx + (offsetMs + steps * periodMs) / 1000;
    if (when <= now) when += periodMs / 1000;
    return when;
  }
  #FindRule(node, fromId, toId) {
    if (!node?.rules) return null;
    const match = (ids, id) => ids.includes(-1) || ids.includes(id | 0);
    return node.rules.find(rule => match(rule.srcIds, fromId) && match(rule.dstIds, toId)) ?? null;
  }
  #TransitionInstance(instance, rule, target, when) {
    // Faded segments STAY in `active` until their fade completes (the
    // prune in Process removes them) - they are still audible, and
    // status consumers must see both sides of a crossfade.
    const fadeSeconds = Math.max(0, rule?.src.transitionTime ?? 0) / 1000;
    for (const active of instance.active) {
      this.#FadeOutSources(active, when, fadeSeconds);
    }
    instance.resolvedTargetId = target;
    this.#ResolveInstanceTo(instance, target, when);
    this.Process();
  }
  #ResolveInstanceTo(instance, targetId, startTime) {
    const node = this.#graph.nodes[targetId];
    if (!node) {
      // Nothing to play for this target: go silent, stay alive.
      instance.resolvedTargetId = null;
      instance.iterator = null;
      return;
    }
    if (node.type === "music-playlist-container") {
      instance.iterator = createPlaylistIterator(node, this.#random);
    } else {
      let played = false;
      instance.iterator = () => played ? null : (played = true, targetId);
    }
    instance.boundary = startTime;
    instance.nextSegmentId = null;
    instance.exhausted = false;
  }

  /** Schedules one more segment at the instance boundary. False = done/starved. */
  #ScheduleNextSegment(instance) {
    const segmentId = instance.iterator?.();
    if (segmentId === null || segmentId === undefined) {
      // Playlist exhausted: finish once scheduled audio reaches the
      // final boundary (Process polls for it).
      instance.exhausted = true;
      return false;
    }
    const segment = this.#graph.nodes[segmentId];
    if (!segment || segment.type !== "music-segment") {
      return false;
    }
    const {
      entry,
      exit
    } = segmentCues(segment);
    const boundary = instance.boundary;
    instance.timeline = {
      startCtx: boundary - entry / 1000,
      meter: segment.meter
    };
    this.#ScheduleSegmentClips(instance, segment, segmentId, boundary, entry, exit);
    instance.boundary = boundary + Math.max(0.001, (exit - entry) / 1000);
    return true;
  }
  #ScheduleSegmentClips(instance, segment, segmentId, boundary, entryCueMs, exitCueMs) {
    // Each scheduled segment owns a gain so transitions can crossfade it
    // out without touching the incoming segment on the same instance.
    const gain = this.#context.createGain();
    gain.connect(instance.gain);
    const scheduled = {
      sources: [],
      segmentId,
      scheduleId: this.#nextScheduleId++,
      targetId: instance.resolvedTargetId,
      gain,
      startCtx: boundary,
      endCtx: boundary + Math.max(0.001, (exitCueMs - entryCueMs) / 1000),
      fading: false,
      fadeEndCtx: null
    };
    instance.active.push(scheduled);
    for (const trackId of segment.children) {
      const track = this.#graph.nodes[trackId];
      if (!track || track.type !== "music-track" || !track.clips.length) continue;
      const subTrack = this.#SelectSubTrack(track);
      for (const clip of track.clips) {
        if ((clip.trackId ?? 0) !== subTrack) continue;
        this.#ScheduleClip(instance, scheduled, track, clip, boundary, entryCueMs);
      }
    }
  }
  #SelectSubTrack(track) {
    const count = Math.max(1, track.subTrackCount || 1);
    if (track.trackType === 1) {
      return Math.floor(this.#random() * count);
    }
    if (track.trackType === 3 && track.switchParams) {
      const value = this.#GetValue(track.switchParams.groupId);
      const index = track.switchParams.assoc.indexOf(value);
      if (index >= 0) return index;
      const fallback = track.switchParams.assoc.indexOf(track.switchParams.defaultSwitch);
      return fallback >= 0 ? fallback : 0;
    }
    return 0;
  }
  #ScheduleClip(instance, scheduled, track, clip, boundary, entryCueMs) {
    const context = this.#context;
    const audibleStartMs = clip.playAt + clip.beginTrimOffset;
    const audibleEndMs = clip.playAt + clip.srcDuration + clip.endTrimOffset;
    if (audibleEndMs <= audibleStartMs) return;
    let when = boundary + (audibleStartMs - entryCueMs) / 1000;
    let offsetMs = clip.beginTrimOffset;
    const now = context.currentTime;
    if (when < now) {
      offsetMs += (now - when) * 1000;
      when = now;
    }
    const durationMs = audibleEndMs - audibleStartMs - (offsetMs - clip.beginTrimOffset);
    if (durationMs <= 0) return;
    const entry = {
      source: null,
      cancelled: false
    };
    scheduled.sources.push(entry);
    Promise.resolve(this.#LoadBuffer(clip.sourceId, track)).then(buffer => {
      if (!buffer || entry.cancelled || instance.stopped) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(scheduled.gain);
      entry.source = source;
      source.start(when, Math.max(0, offsetMs) / 1000, durationMs / 1000);
    }).catch(() => {});
  }
  #LoadBuffer(sourceId, track) {
    if (this.#buffers.has(sourceId)) return this.#buffers.get(sourceId);
    const pending = Promise.resolve(this.#loadMedia?.(sourceId, track)).catch(() => null);
    this.#buffers.set(sourceId, pending);
    return pending;
  }
  #FadeOutSources(scheduledSegment, when, fadeSeconds) {
    // First fade wins: an already-fading segment keeps its earlier
    // schedule (its sources already have stops queued).
    if (scheduledSegment.fading) return;
    scheduledSegment.fading = true;
    scheduledSegment.fadeEndCtx = when + fadeSeconds;
    if (fadeSeconds > 0 && scheduledSegment.gain?.gain) {
      const param = scheduledSegment.gain.gain;
      param.setValueAtTime?.(param.value ?? 1, when);
      param.linearRampToValueAtTime?.(0, when + fadeSeconds);
    }
    for (const entry of scheduledSegment.sources) {
      entry.cancelled = entry.source === null;
      if (entry.source) {
        try {
          entry.source.stop(when + fadeSeconds);
        } catch {
          // already stopped
        }
      }
    }
  }
  #StopInstance(instance, fadeSeconds) {
    if (instance.stopped) return;
    instance.stopped = true;
    const now = this.#context?.currentTime ?? 0;
    if (fadeSeconds > 0) {
      instance.gain?.gain?.linearRampToValueAtTime?.(0, now + fadeSeconds);
    } else if (instance.gain?.gain && "value" in instance.gain.gain) {
      instance.gain.gain.value = 0;
    }
    for (const active of instance.active) {
      this.#FadeOutSources(active, now, fadeSeconds);
    }
    instance.active = [];
    this.#instances.delete(instance.playingID);
    instance.gain?.disconnect?.();
    instance.onFinished?.();
  }
  #FinishInstance(instance) {
    if (instance.stopped) return;
    instance.stopped = true;
    this.#instances.delete(instance.playingID);
    instance.gain?.disconnect?.();
    instance.onFinished?.();
  }
}

export { CjsMusicEngine, wwiseIdFromName };
//# sourceMappingURL=CjsMusicEngine.js.map
