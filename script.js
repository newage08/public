const STORAGE_KEY = "fesTimeBuilder_board_v7_mobile_timeedit";

const STAGE_COLORS = {
  summerSonic: {
    Marine: "#2aa8d6",
    Beach: "#b9b097",
    Mountain: "#25a85b",
    Sonic: "#eea31a",
    "Spotify Early Noise": "#9ea3a9",
    Pacific: "#e6a6bf"
  },
  fujiRock: {
    "Green Stage": "#2f9e44",
    "White Stage": "#f1f3f5",
    "Red Marquee": "#e03131",
    "Field of Heaven": "#0ca678",
    "Gypsy Avalon": "#f08c00",
    "Naeba Shokudou": "#7950f2",
    "Pyramid Garden": "#1098ad",
    "Palace Arena": "#e8590c"
  }
};

const POSTER_LINKS = {
  summerSonic: {
    default: "https://www.summersonic.com/2025/en/tt/tokyo-day1/",
    years: {
      "2025": {
        "Saturday 16th August": "https://www.summersonic.com/2025/en/tt/tokyo-day1/",
        "Sunday 17th August": "https://www.summersonic.com/2025/en/tt/tokyo-day2/"
      }
    }
  },
  fujiRock: {
    default: "https://25.fujirockfestival.com/"
  }
};

const state = {
  festivals: null,
  festivalKey: "summerSonic",
  yearKey: "2025",
  dayFilter: "",
  pool: [],
  assignments: {},
  stageOrders: {},
  slotOverrides: {},
  draggingStage: ""
};

const touchDrag = {
  artist: null,
  stage: null
};

const el = {
  festival: document.getElementById("festival"),
  year: document.getElementById("year"),
  dayFilter: document.getElementById("dayFilter"),
  lineupInput: document.getElementById("lineupInput"),
  buildPoolBtn: document.getElementById("buildPoolBtn"),
  sampleBtn: document.getElementById("sampleBtn"),
  resetPlacementBtn: document.getElementById("resetPlacementBtn"),
  message: document.getElementById("message"),
  summary: document.getElementById("summary"),
  boardTitle: document.getElementById("boardTitle"),
  posterLink: document.getElementById("posterLink"),
  poolDropZone: document.getElementById("poolDropZone"),
  pool: document.getElementById("pool"),
  board: document.getElementById("board"),
  exportImageBtn: document.getElementById("exportImageBtn")
};

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function expandSlots(slotsMap) {
  const slots = [];
  Object.entries(slotsMap).forEach(([stage, dayMap]) => {
    Object.entries(dayMap).forEach(([day, ranges]) => {
      ranges.forEach(([start, end], idx) => {
        const localId = `${slugify(day)}__${slugify(stage)}__${idx}`;
        slots.push({ id: localId || `slot_${slots.length}`, day, stage, start, end });
      });
    });
  });
  return slots;
}

async function loadFestivals() {
  const res = await fetch("./festival_slots.json", { cache: "no-store" });
  if (!res.ok) throw new Error("failed to load festival_slots.json");
  const festivals = await res.json();

  Object.values(festivals).forEach((festival) => {
    Object.values(festival.years).forEach((yearData) => {
      yearData.slots = expandSlots(yearData.slotsMap);
    });
  });

  state.festivals = festivals;
}

function getFestival() {
  return state.festivals[state.festivalKey];
}

function getYearData() {
  return getFestival().years[state.yearKey];
}

function getStageOrderKey() {
  return `${state.festivalKey}__${state.yearKey}`;
}

function getOrderedStages() {
  const key = getStageOrderKey();
  const base = getYearData().stages;
  const stored = Array.isArray(state.stageOrders[key]) ? state.stageOrders[key] : [];
  const filtered = stored.filter((stage) => base.includes(stage));
  const missing = base.filter((stage) => !filtered.includes(stage));
  const ordered = [...filtered, ...missing];
  state.stageOrders[key] = ordered;
  return ordered;
}

function getStageColor(stage, index = 0) {
  const festivalColors = STAGE_COLORS[state.festivalKey] || {};
  if (festivalColors[stage]) return festivalColors[stage];

  const fallback = ["#2f3c3b", "#1f6feb", "#2da44e", "#e5534b", "#a371f7", "#d29922", "#0ca678", "#e8590c"];
  return fallback[index % fallback.length];
}

function hexToRgb(hex) {
  const raw = String(hex || "").trim().replace("#", "");
  if (![3, 6].includes(raw.length)) return null;
  const full = raw.length === 3
    ? raw.split("").map((c) => c + c).join("")
    : raw;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function toRgba(hex, alpha = 1) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(47,60,59,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function isValidClock(text) {
  return /^([01]?\d|2[0-3]):([0-5]\d)$/.test(String(text || "").trim());
}

function normalizeClockInput(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace("：", ":");
  const match = cleaned.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toMinutes(time) {
  const [h, m] = String(time).split(":").map(Number);
  return h * 60 + m;
}

function formatClock(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${h}:${mm}`;
}

function normalizeMinuteByAnchor(minute, anchor) {
  return minute < anchor ? minute + 1440 : minute;
}

function buildTimelineData(daySlots) {
  if (daySlots.length === 0) {
    return { slots: [], minMinute: 600, maxMinute: 1320 };
  }

  const anchor = Math.min(...daySlots.map((slot) => toMinutes(slot.start)));
  const normalized = daySlots.map((slot) => {
    const startN = normalizeMinuteByAnchor(toMinutes(slot.start), anchor);
    let endN = normalizeMinuteByAnchor(toMinutes(slot.end), anchor);
    if (endN <= startN) endN += 1440;
    return { ...slot, _startN: startN, _endN: endN };
  });

  const minMinute = Math.floor(Math.min(...normalized.map((s) => s._startN)) / 60) * 60;
  const maxMinute = Math.ceil(Math.max(...normalized.map((s) => s._endN)) / 60) * 60;
  return { slots: normalized, minMinute, maxMinute };
}

function slotId(slot) {
  const localId = slot.id || `${slot.day}__${slot.stage}__${slot.start}-${slot.end}`;
  return `${state.festivalKey}__${state.yearKey}__${localId}`;
}

function getEffectiveSlot(slot) {
  const id = slotId(slot);
  const override = state.slotOverrides[id];
  if (override && isValidClock(override.start) && isValidClock(override.end)) {
    return { ...slot, start: override.start, end: override.end, _slotId: id };
  }
  return { ...slot, _slotId: id };
}

function sortSlots(slots, yearData) {
  const dayIndex = new Map(yearData.days.map((day, idx) => [day, idx]));
  const stageIndex = new Map(yearData.stages.map((stage, idx) => [stage, idx]));

  return [...slots].sort((a, b) => {
    const dayDiff = dayIndex.get(a.day) - dayIndex.get(b.day);
    if (dayDiff !== 0) return dayDiff;

    const timeDiff = toMinutes(a.start) - toMinutes(b.start);
    if (timeDiff !== 0) return timeDiff;

    return stageIndex.get(a.stage) - stageIndex.get(b.stage);
  });
}

function parseArtists(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name, idx) => ({ id: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`, name }));
}

function setMessage(text) {
  el.message.textContent = text;
}

function normalizeAssignments() {
  const validSlotIds = new Set(getYearData().slots.map((slot) => slotId(slot)));
  for (const id of Object.keys(state.assignments)) {
    if (!validSlotIds.has(id)) {
      const artist = state.assignments[id];
      if (artist && !state.pool.some((item) => item.id === artist.id)) {
        state.pool.push(artist);
      }
      delete state.assignments[id];
    }
  }
}

function normalizeSlotOverrides() {
  const prefix = `${state.festivalKey}__${state.yearKey}__`;
  const validSlotIds = new Set(getYearData().slots.map((slot) => slotId(slot)));
  for (const key of Object.keys(state.slotOverrides)) {
    if (!key.startsWith(prefix)) continue;
    const override = state.slotOverrides[key];
    const valid = override && isValidClock(override.start) && isValidClock(override.end);
    if (!validSlotIds.has(key) || !valid) {
      delete state.slotOverrides[key];
    }
  }
}

function fillFestivalOptions() {
  el.festival.innerHTML = "";
  Object.entries(state.festivals).forEach(([key, data]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = data.name;
    el.festival.append(option);
  });
  el.festival.value = state.festivalKey;
}

function fillYearOptions() {
  const years = Object.keys(getFestival().years).sort((a, b) => Number(b) - Number(a));
  if (!years.includes(state.yearKey)) {
    state.yearKey = years.includes("2025") ? "2025" : years[0];
  }

  el.year.innerHTML = "";
  years.forEach((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = `${year}版`;
    el.year.append(option);
  });
  el.year.value = state.yearKey;
}

function fillDayOptions() {
  const days = getYearData().days;
  el.dayFilter.innerHTML = "";
  days.forEach((day) => {
    const option = document.createElement("option");
    option.value = day;
    option.textContent = day;
    el.dayFilter.append(option);
  });

  if (!days.includes(state.dayFilter)) {
    state.dayFilter = days[0];
  }
  el.dayFilter.value = state.dayFilter;
}

function getPosterLink() {
  const festivalConfig = POSTER_LINKS[state.festivalKey];
  if (!festivalConfig) return "";

  const yearConfig = festivalConfig.years?.[state.yearKey];
  if (yearConfig) {
    if (yearConfig[state.dayFilter]) return yearConfig[state.dayFilter];
    if (yearConfig.default) return yearConfig.default;
  }

  return festivalConfig.default || "";
}

function updatePosterLink() {
  const link = getPosterLink();
  if (!link) {
    el.posterLink.href = "#";
    el.posterLink.classList.add("isDisabled");
    el.posterLink.textContent = "元ポスター未設定";
    return;
  }

  el.posterLink.href = link;
  el.posterLink.classList.remove("isDisabled");
  el.posterLink.textContent = "元ポスターを開く";
}

function moveArtistToPool(payload) {
  if (!payload?.artist) return false;

  if (payload.sourceSlotId && state.assignments[payload.sourceSlotId]) {
    delete state.assignments[payload.sourceSlotId];
  }

  if (!state.pool.some((artist) => artist.id === payload.artist.id)) {
    state.pool.push(payload.artist);
  }

  return true;
}

function placeArtistToSlot(payload, targetSlotId) {
  if (!payload?.artist || !targetSlotId) return false;
  if (payload.sourceSlotId === targetSlotId) return false;

  if (payload.sourceSlotId && state.assignments[payload.sourceSlotId]) {
    delete state.assignments[payload.sourceSlotId];
  }

  if (state.assignments[targetSlotId] && state.assignments[targetSlotId].id !== payload.artist.id) {
    state.pool.push(state.assignments[targetSlotId]);
  }

  state.assignments[targetSlotId] = payload.artist;
  state.pool = state.pool.filter((artist) => artist.id !== payload.artist.id);

  return true;
}

function clearDropHighlights() {
  document.querySelectorAll(".slot.dropActive, .stageLane.dropActive").forEach((node) => {
    node.classList.remove("dropActive");
  });
  el.poolDropZone.classList.remove("dropActive");
}

function createTouchGhostFrom(node, event) {
  const rect = node.getBoundingClientRect();
  const ghost = node.cloneNode(true);
  ghost.classList.add("touchGhost");
  ghost.style.width = `${Math.max(80, rect.width)}px`;
  ghost.style.left = `${event.clientX - (event.clientX - rect.left)}px`;
  ghost.style.top = `${event.clientY - (event.clientY - rect.top)}px`;
  document.body.append(ghost);

  return {
    ghost,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
}

function moveTouchGhost(active, x, y) {
  if (!active?.ghost) return;
  active.ghost.style.left = `${x - active.offsetX}px`;
  active.ghost.style.top = `${y - active.offsetY}px`;
}

function pickArtistDropTarget(x, y) {
  const node = document.elementFromPoint(x, y);
  if (!node) return null;

  const slotNode = node.closest(".slot[data-slot-id]");
  if (slotNode) {
    return { type: "slot", slotId: slotNode.dataset.slotId, node: slotNode };
  }

  const poolNode = node.closest("#poolDropZone");
  if (poolNode) {
    return { type: "pool", node: el.poolDropZone };
  }

  return null;
}

function pickStageDropTarget(x, y) {
  const node = document.elementFromPoint(x, y);
  if (!node) return null;

  const lane = node.closest(".stageLane[data-stage]");
  if (!lane) return null;

  return { stage: lane.dataset.stage, node: lane };
}

function handleArtistTouchMove(event) {
  const active = touchDrag.artist;
  if (!active || active.pointerId !== event.pointerId) return;

  moveTouchGhost(active, event.clientX, event.clientY);
  clearDropHighlights();

  const target = pickArtistDropTarget(event.clientX, event.clientY);
  if (target?.node) {
    target.node.classList.add("dropActive");
  }
  active.target = target;
  event.preventDefault();
}

function finishArtistTouchDrag(event) {
  const active = touchDrag.artist;
  if (!active || active.pointerId !== event.pointerId) return;

  const target = active.target || pickArtistDropTarget(event.clientX, event.clientY);
  let changed = false;

  if (target?.type === "slot") {
    changed = placeArtistToSlot(active.payload, target.slotId);
    if (changed) setMessage("スロットに配置した");
  } else if (target?.type === "pool") {
    changed = moveArtistToPool(active.payload);
    if (changed) setMessage("アーティストを未配置に戻した");
  }

  active.ghost?.remove();
  clearDropHighlights();
  touchDrag.artist = null;

  if (changed) {
    renderAll();
  }

  event.preventDefault();
}

function cancelArtistTouchDrag(event) {
  const active = touchDrag.artist;
  if (!active || active.pointerId !== event.pointerId) return;
  active.ghost?.remove();
  clearDropHighlights();
  touchDrag.artist = null;
}

function makeTag(artist, sourceSlotId = null) {
  const tag = document.createElement("button");
  tag.type = "button";
  tag.className = "artistTag";
  tag.draggable = true;
  tag.textContent = artist.name;
  if (sourceSlotId) {
    tag.classList.add("inSlot");
  }

  tag.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", JSON.stringify({ artist, sourceSlotId }));
    event.dataTransfer.effectAllowed = "move";
  });

  tag.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;

    const ghostInfo = createTouchGhostFrom(tag, event);
    touchDrag.artist = {
      pointerId: event.pointerId,
      payload: { artist, sourceSlotId },
      target: null,
      ...ghostInfo
    };

    tag.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  tag.addEventListener("pointermove", handleArtistTouchMove);
  tag.addEventListener("pointerup", finishArtistTouchDrag);
  tag.addEventListener("pointercancel", cancelArtistTouchDrag);

  return tag;
}

function attachPoolDropEvents() {
  el.poolDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    el.poolDropZone.classList.add("dropActive");
    event.dataTransfer.dropEffect = "move";
  });

  el.poolDropZone.addEventListener("dragleave", () => {
    el.poolDropZone.classList.remove("dropActive");
  });

  el.poolDropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    el.poolDropZone.classList.remove("dropActive");
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw || raw.startsWith("__stage__:")) return;

    try {
      const payload = JSON.parse(raw);
      if (!payload.artist) return;

      if (moveArtistToPool(payload)) {
        setMessage("アーティストを未配置に戻した");
        renderAll();
      }
    } catch {
      setMessage("ドラッグデータの読み取りに失敗");
    }
  });
}

function attachSlotDropEvents(slotNode, targetSlotId) {
  slotNode.addEventListener("dragover", (event) => {
    event.preventDefault();
    slotNode.classList.add("dropActive");
    event.dataTransfer.dropEffect = "move";
  });

  slotNode.addEventListener("dragleave", () => {
    slotNode.classList.remove("dropActive");
  });

  slotNode.addEventListener("drop", (event) => {
    event.preventDefault();
    slotNode.classList.remove("dropActive");

    const raw = event.dataTransfer.getData("text/plain");
    if (!raw || raw.startsWith("__stage__:")) return;

    try {
      const payload = JSON.parse(raw);
      if (!payload.artist) return;

      if (placeArtistToSlot(payload, targetSlotId)) {
        setMessage("スロットに配置した");
        renderAll();
      }
    } catch {
      setMessage("ドラッグデータの読み取りに失敗");
    }
  });
}

function reorderStage(sourceStage, targetStage) {
  if (!sourceStage || !targetStage || sourceStage === targetStage) return false;

  const ordered = getOrderedStages();
  const from = ordered.indexOf(sourceStage);
  const to = ordered.indexOf(targetStage);
  if (from === -1 || to === -1) return false;

  ordered.splice(to, 0, ordered.splice(from, 1)[0]);
  state.stageOrders[getStageOrderKey()] = ordered;
  return true;
}

function handleStageTouchMove(event) {
  const active = touchDrag.stage;
  if (!active || active.pointerId !== event.pointerId) return;

  moveTouchGhost(active, event.clientX, event.clientY);
  clearDropHighlights();

  const target = pickStageDropTarget(event.clientX, event.clientY);
  if (target?.node) {
    target.node.classList.add("dropActive");
  }
  active.target = target;
  event.preventDefault();
}

function finishStageTouchDrag(event) {
  const active = touchDrag.stage;
  if (!active || active.pointerId !== event.pointerId) return;

  const target = active.target || pickStageDropTarget(event.clientX, event.clientY);
  const changed = target?.stage ? reorderStage(active.sourceStage, target.stage) : false;

  active.ghost?.remove();
  clearDropHighlights();
  touchDrag.stage = null;

  if (changed) {
    setMessage(`ステージ順を変更: ${active.sourceStage} → ${target.stage}`);
    renderAll();
  }

  event.preventDefault();
}

function cancelStageTouchDrag(event) {
  const active = touchDrag.stage;
  if (!active || active.pointerId !== event.pointerId) return;
  active.ghost?.remove();
  clearDropHighlights();
  touchDrag.stage = null;
}

function attachStageReorderEvents(stageCol, stageName, targetStage) {
  stageCol.dataset.stage = targetStage;
  stageName.draggable = true;
  stageName.title = "ドラッグでステージ順を入替";

  stageName.addEventListener("dragstart", (event) => {
    state.draggingStage = targetStage;
    event.dataTransfer.setData("application/x-fes-stage", targetStage);
    event.dataTransfer.setData("text/plain", `__stage__:${targetStage}`);
    event.dataTransfer.effectAllowed = "move";
    stageCol.classList.add("draggingStage");
  });

  stageName.addEventListener("dragend", () => {
    state.draggingStage = "";
    stageCol.classList.remove("draggingStage");
    clearDropHighlights();
  });

  const onStageDragOver = (event) => {
    const marker = event.dataTransfer.getData("text/plain");
    if (!state.draggingStage && !marker.startsWith("__stage__:")) return;
    event.preventDefault();
    stageCol.classList.add("dropActive");
    event.dataTransfer.dropEffect = "move";
  };

  stageCol.addEventListener("dragover", onStageDragOver);
  stageName.addEventListener("dragover", onStageDragOver);

  stageCol.addEventListener("dragleave", () => {
    stageCol.classList.remove("dropActive");
  });
  stageName.addEventListener("dragleave", () => {
    stageCol.classList.remove("dropActive");
  });

  const onStageDrop = (event) => {
    const raw = event.dataTransfer.getData("text/plain");
    const sourceStage = state.draggingStage
      || event.dataTransfer.getData("application/x-fes-stage")
      || (raw.startsWith("__stage__:") ? raw.replace("__stage__:", "") : "");
    if (!sourceStage) return;

    event.preventDefault();
    stageCol.classList.remove("dropActive");
    if (reorderStage(sourceStage, targetStage)) {
      renderAll();
      setMessage(`ステージ順を変更: ${sourceStage} → ${targetStage}`);
    }
  };

  stageCol.addEventListener("drop", onStageDrop);
  stageName.addEventListener("drop", onStageDrop);

  stageName.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;

    const ghostInfo = createTouchGhostFrom(stageName, event);
    touchDrag.stage = {
      pointerId: event.pointerId,
      sourceStage: targetStage,
      target: null,
      ...ghostInfo
    };

    stageName.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  stageName.addEventListener("pointermove", handleStageTouchMove);
  stageName.addEventListener("pointerup", finishStageTouchDrag);
  stageName.addEventListener("pointercancel", cancelStageTouchDrag);
}

function setSlotOverride(slotKey, start, end) {
  state.slotOverrides[slotKey] = { start, end };
}

function promptSlotTime(slot) {
  const startInput = window.prompt("開始時間を入力 (HH:MM)", slot.start);
  if (startInput == null) return;

  const endInput = window.prompt("終了時間を入力 (HH:MM)", slot.end);
  if (endInput == null) return;

  const start = normalizeClockInput(startInput);
  const end = normalizeClockInput(endInput);
  if (!start || !end) {
    setMessage("時間形式は HH:MM で入力して");
    return;
  }

  if (toMinutes(end) <= toMinutes(start)) {
    setMessage("終了時間は開始時間より後にして");
    return;
  }

  setSlotOverride(slot._slotId, start, end);
  setMessage(`時間変更: ${start} - ${end}`);
  renderAll();
}

function attachSlotTimeDragEvents(slotNode, slot, timeline, pxPerMinute, timeButton) {
  let drag = null;

  const endDrag = (event, apply = true) => {
    if (!drag || drag.pointerId !== event.pointerId) return;

    slotNode.classList.remove("draggingTime");
    slotNode.releasePointerCapture?.(event.pointerId);

    if (apply && drag.changed) {
      const start = formatClock(drag.liveStart);
      const end = formatClock(drag.liveEnd);
      setSlotOverride(slot._slotId, start, end);
      setMessage(`時間変更: ${start} - ${end}`);
      renderAll();
    } else {
      timeButton.textContent = `${slot.start} - ${slot.end}`;
      slotNode.style.top = `${(slot._startN - timeline.minMinute) * pxPerMinute}px`;
    }

    drag = null;
    event.preventDefault();
  };

  slotNode.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest(".artistTag")) return;
    if (event.target.closest(".slotTimeButton")) return;

    const startMinute = toMinutes(slot.start);
    const endMinute = toMinutes(slot.end);
    const duration = Math.max(5, endMinute - startMinute);
    const minStart = timeline.minMinute;
    const maxStart = Math.max(minStart, timeline.maxMinute - duration);

    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      baseStart: startMinute,
      duration,
      minStart,
      maxStart,
      liveStart: startMinute,
      liveEnd: startMinute + duration,
      changed: false
    };

    slotNode.classList.add("draggingTime");
    slotNode.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  slotNode.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;

    const stepPx = pxPerMinute * 5;
    const deltaSteps = Math.round((event.clientY - drag.startY) / stepPx);
    const rawStart = drag.baseStart + deltaSteps * 5;
    const nextStart = Math.min(drag.maxStart, Math.max(drag.minStart, rawStart));
    const nextEnd = nextStart + drag.duration;

    drag.liveStart = nextStart;
    drag.liveEnd = nextEnd;
    drag.changed = drag.changed || nextStart !== drag.baseStart;

    slotNode.style.top = `${(nextStart - timeline.minMinute) * pxPerMinute}px`;
    timeButton.textContent = `${formatClock(nextStart)} - ${formatClock(nextEnd)}`;

    event.preventDefault();
  });

  slotNode.addEventListener("pointerup", (event) => endDrag(event, true));
  slotNode.addEventListener("pointercancel", (event) => endDrag(event, false));
}

function renderPool() {
  el.pool.innerHTML = "";
  if (state.pool.length === 0) {
    const blank = document.createElement("div");
    blank.className = "slotPlaceholder";
    blank.textContent = "未配置アーティストなし";
    el.pool.append(blank);
    return;
  }

  state.pool.forEach((artist) => {
    el.pool.append(makeTag(artist));
  });
}

function getDaySlotsWithOverrides(day) {
  return sortSlots(
    getYearData().slots
      .filter((slot) => slot.day === day)
      .map((slot) => getEffectiveSlot(slot)),
    getYearData()
  );
}

function renderBoard() {
  el.board.innerHTML = "";
  const daySlots = getDaySlotsWithOverrides(state.dayFilter);
  const timeline = buildTimelineData(daySlots);
  const spanMinutes = Math.max(60, timeline.maxMinute - timeline.minMinute);
  const pxPerMinute = window.innerWidth <= 640 ? 1.15 : 1.35;
  const bodyHeight = Math.ceil(spanMinutes * pxPerMinute);

  const dayLabel = document.createElement("p");
  dayLabel.className = "dayBanner";
  dayLabel.textContent = `${getFestival().name} ${state.yearKey} ${state.dayFilter}`;
  el.board.append(dayLabel);

  const timelineShell = document.createElement("div");
  timelineShell.className = "timelineShell";

  const timeAxis = document.createElement("div");
  timeAxis.className = "timeAxis";
  timeAxis.style.height = `${bodyHeight}px`;
  for (let m = timeline.minMinute; m <= timeline.maxMinute; m += 60) {
    const tick = document.createElement("div");
    tick.className = "timeTick";
    tick.style.top = `${(m - timeline.minMinute) * pxPerMinute}px`;
    tick.textContent = formatClock(m);
    timeAxis.append(tick);
  }

  const laneGrid = document.createElement("div");
  laneGrid.className = "stageTimelineGrid";
  const orderedStages = getOrderedStages();
  const laneMinWidth = window.innerWidth <= 640 ? 170 : window.innerWidth <= 960 ? 185 : 220;
  laneGrid.style.gridTemplateColumns = `repeat(${orderedStages.length}, minmax(${laneMinWidth}px, 1fr))`;

  orderedStages.forEach((stage, stageIndex) => {
    const stageColor = getStageColor(stage, stageIndex);
    const stageCol = document.createElement("section");
    stageCol.className = "stageLane";

    const stageName = document.createElement("h3");
    stageName.className = "stageLaneName";
    stageName.textContent = stage;
    stageName.style.background = stageColor;
    if (stageColor.toLowerCase() === "#f1f3f5") {
      stageName.style.color = "#1f2328";
    }
    attachStageReorderEvents(stageCol, stageName, stage);

    const laneBody = document.createElement("div");
    laneBody.className = "stageLaneBody";
    laneBody.style.height = `${bodyHeight}px`;

    const stageSlots = timeline.slots
      .filter((slot) => slot.stage === stage)
      .sort((a, b) => a._startN - b._startN);

    stageSlots.forEach((slot) => {
      const id = slot._slotId || slotId(slot);
      const slotNode = document.createElement("div");
      slotNode.className = "slot";
      slotNode.dataset.slotId = id;
      slotNode.style.top = `${(slot._startN - timeline.minMinute) * pxPerMinute}px`;
      slotNode.style.height = `${Math.max(38, (slot._endN - slot._startN) * pxPerMinute)}px`;
      slotNode.style.borderColor = toRgba(stageColor, 0.65);
      slotNode.style.background = `linear-gradient(180deg, ${toRgba(stageColor, 0.3)}, ${toRgba(stageColor, 0.18)})`;

      const time = document.createElement("button");
      time.type = "button";
      time.className = "slotTime slotTimeButton";
      time.textContent = `${slot.start} - ${slot.end}`;
      time.title = "タップで時刻入力 / 枠を上下ドラッグで時刻移動";
      time.addEventListener("click", (event) => {
        event.stopPropagation();
        promptSlotTime(slot);
      });

      const body = document.createElement("div");
      body.className = "slotBody";

      if (state.assignments[id]) {
        const tag = makeTag(state.assignments[id], id);
        body.append(tag);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "slotPlaceholder";
        placeholder.textContent = "DROP";
        body.append(placeholder);
      }

      slotNode.append(time, body);
      attachSlotDropEvents(slotNode, id);
      attachSlotTimeDragEvents(slotNode, slot, timeline, pxPerMinute, time);
      laneBody.append(slotNode);
    });

    stageCol.append(stageName, laneBody);
    laneGrid.append(stageCol);
  });

  timelineShell.append(timeAxis, laneGrid);
  el.board.append(timelineShell);
}

function renderSummary() {
  const total = getYearData().slots.length;
  const placed = Object.keys(state.assignments).length;
  el.summary.textContent = `配置 ${placed}/${total} ・ 未配置 ${state.pool.length}`;
  el.boardTitle.textContent = `TIMETABLE BOARD ${state.yearKey}`;
  updatePosterLink();
}

function renderAll() {
  normalizeAssignments();
  normalizeSlotOverrides();
  renderSummary();
  renderPool();
  renderBoard();
  saveStateSilently();
}

function buildPoolFromInput() {
  const artists = parseArtists(el.lineupInput.value);
  if (artists.length === 0) {
    setMessage("アーティスト名を1件以上入力して");
    return;
  }

  state.pool = artists;
  state.assignments = {};
  setMessage(`アーティストを${artists.length}件追加`);
  renderAll();
}

function loadPresetCandidates(options = {}) {
  const { rebuildPool = true, notice = true } = options;
  const festival = getFestival();
  const yearData = getYearData();
  const presets = Array.isArray(festival.presetArtists2026)
    ? festival.presetArtists2026
    : Array.isArray(festival.sampleArtists)
      ? festival.sampleArtists
      : Array.isArray(yearData.presetArtists)
        ? yearData.presetArtists
        : [];

  el.lineupInput.value = presets.join("\n");

  if (rebuildPool) {
    state.pool = parseArtists(el.lineupInput.value);
    state.assignments = {};
    renderAll();
  }

  if (notice) {
    setMessage(`候補を読み込み: ${presets.length}件`);
  }
}

function resetPlacement() {
  Object.values(state.assignments).forEach((artist) => state.pool.push(artist));
  state.assignments = {};
  setMessage("配置をリセット");
  renderAll();
}

function switchFestival(key) {
  state.festivalKey = key;
  const years = Object.keys(getFestival().years).sort((a, b) => Number(b) - Number(a));
  state.yearKey = years.includes("2025") ? "2025" : years[0];
  fillYearOptions();
  fillDayOptions();
  loadPresetCandidates({ rebuildPool: true, notice: true });
}

function switchYear(key) {
  state.yearKey = key;
  fillDayOptions();
  renderAll();
  setMessage(`${state.yearKey}年のタイムスロットに切替`);
}

function saveStateSilently() {
  const payload = {
    festivalKey: state.festivalKey,
    yearKey: state.yearKey,
    dayFilter: state.dayFilter,
    lineupInput: el.lineupInput.value,
    pool: state.pool,
    assignments: state.assignments,
    stageOrders: state.stageOrders,
    slotOverrides: state.slotOverrides
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function restoreStateIfExists() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return false;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!state.festivals[parsed.festivalKey] || !state.festivals[parsed.festivalKey].years[parsed.yearKey]) {
      throw new Error("invalid");
    }

    state.festivalKey = parsed.festivalKey;
    state.yearKey = parsed.yearKey;
    fillFestivalOptions();
    fillYearOptions();

    state.dayFilter = parsed.dayFilter || getYearData().days[0];
    fillDayOptions();

    state.pool = Array.isArray(parsed.pool) ? parsed.pool : [];
    state.assignments = parsed.assignments && typeof parsed.assignments === "object" ? parsed.assignments : {};
    state.stageOrders = parsed.stageOrders && typeof parsed.stageOrders === "object" ? parsed.stageOrders : {};
    state.slotOverrides = parsed.slotOverrides && typeof parsed.slotOverrides === "object" ? parsed.slotOverrides : {};
    el.lineupInput.value = typeof parsed.lineupInput === "string" ? parsed.lineupInput : "";

    return true;
  } catch {
    return false;
  }
}

function exportBoardImage() {
  const yearData = getYearData();
  const daySlots = sortSlots(
    yearData.slots
      .filter((slot) => slot.day === state.dayFilter)
      .map((slot) => getEffectiveSlot(slot)),
    yearData
  );
  const timeline = buildTimelineData(daySlots);
  const stages = getOrderedStages();

  const colWidth = 290;
  const stageGap = 14;
  const leftPad = 26;
  const axisW = 78;
  const topPad = 96;
  const headerH = 36;
  const bottomPad = 28;
  const pxPerMinute = 1.2;
  const bodyHeight = Math.ceil((timeline.maxMinute - timeline.minMinute) * pxPerMinute);

  const width = leftPad * 2 + axisW + stages.length * colWidth + (stages.length - 1) * stageGap;
  const height = topPad + headerH + bodyHeight + bottomPad;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f8f4e9";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#202020";
  ctx.font = "bold 28px 'Hiragino Sans', 'Yu Gothic', sans-serif";
  ctx.fillText(`${getFestival().name} ${state.yearKey}`, leftPad, 36);
  ctx.font = "18px 'Hiragino Sans', 'Yu Gothic', sans-serif";
  ctx.fillText(state.dayFilter, leftPad, 62);

  const gridX = leftPad + axisW;
  const gridY = topPad + headerH;

  ctx.strokeStyle = "#d6c6ad";
  ctx.fillStyle = "#6a604f";
  ctx.font = "13px 'Hiragino Sans', 'Yu Gothic', sans-serif";
  for (let m = timeline.minMinute; m <= timeline.maxMinute; m += 60) {
    const y = gridY + (m - timeline.minMinute) * pxPerMinute;
    ctx.beginPath();
    ctx.moveTo(leftPad + 2, y);
    ctx.lineTo(width - leftPad, y);
    ctx.stroke();
    ctx.fillText(formatClock(m), leftPad + 4, y - 3);
  }

  stages.forEach((stage, i) => {
    const stageColor = getStageColor(stage, i);
    const x = gridX + i * (colWidth + stageGap);
    const y = topPad;

    ctx.fillStyle = stageColor;
    ctx.fillRect(x, y, colWidth, headerH);
    ctx.fillStyle = stageColor.toLowerCase() === "#f1f3f5" ? "#1f2328" : "#ffffff";
    ctx.font = "bold 17px 'Hiragino Sans', 'Yu Gothic', sans-serif";
    ctx.fillText(stage, x + 10, y + 24, colWidth - 16);

    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(x, gridY, colWidth, bodyHeight);
    ctx.strokeStyle = "#cfbca0";
    ctx.strokeRect(x, gridY, colWidth, bodyHeight);

    const stageSlots = timeline.slots
      .filter((slot) => slot.stage === stage)
      .sort((a, b) => a._startN - b._startN);

    stageSlots.forEach((slot) => {
      const sy = gridY + (slot._startN - timeline.minMinute) * pxPerMinute;
      const sh = Math.max(28, (slot._endN - slot._startN) * pxPerMinute);
      const id = slot._slotId || slotId(slot);
      const artist = state.assignments[id]?.name || "";

      ctx.fillStyle = toRgba(stageColor, 0.24);
      ctx.strokeStyle = toRgba(stageColor, 0.68);
      ctx.lineWidth = 1;
      ctx.fillRect(x + 4, sy, colWidth - 8, sh);
      ctx.strokeRect(x + 4, sy, colWidth - 8, sh);

      ctx.fillStyle = "#665d50";
      ctx.font = "13px 'Hiragino Sans', 'Yu Gothic', sans-serif";
      ctx.fillText(`${slot.start}-${slot.end}`, x + 10, sy + 15);

      ctx.fillStyle = artist ? "#1f1f1f" : "#9d9487";
      ctx.font = "bold 14px 'Hiragino Sans', 'Yu Gothic', sans-serif";
      ctx.fillText(artist || "(空欄)", x + 10, sy + 33, colWidth - 20);
    });
  });

  canvas.toBlob((blob) => {
    if (!blob) {
      setMessage("画像出力に失敗");
      return;
    }

    const fileName = `fes_board_${state.festivalKey}_${state.yearKey}_${state.dayFilter.replace(/\s+/g, "_")}.png`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("画像を出力した（PNG）");
  }, "image/png");
}

function attachEvents() {
  el.festival.addEventListener("change", () => switchFestival(el.festival.value));
  el.year.addEventListener("change", () => switchYear(el.year.value));
  el.dayFilter.addEventListener("change", () => {
    state.dayFilter = el.dayFilter.value;
    renderAll();
  });

  el.buildPoolBtn.addEventListener("click", buildPoolFromInput);
  el.sampleBtn.addEventListener("click", () => loadPresetCandidates({ rebuildPool: true, notice: true }));
  el.resetPlacementBtn.addEventListener("click", resetPlacement);
  el.exportImageBtn.addEventListener("click", exportBoardImage);

  attachPoolDropEvents();
}

async function init() {
  try {
    await loadFestivals();
    fillFestivalOptions();
    fillYearOptions();
    const restored = restoreStateIfExists();
    if (!restored) {
      state.dayFilter = getYearData().days[0];
    }
    fillDayOptions();
    if (!restored) {
      loadPresetCandidates({ rebuildPool: true, notice: false });
    }
    attachEvents();
    renderAll();
    setMessage(restored ? "自動保存データを復元した" : "実タイムテーブル枠と出演者プリセットを読み込み完了");
  } catch (e) {
    setMessage("タイムテーブル読み込みに失敗");
    console.error(e);
  }
}

init();
