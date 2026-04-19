const STORAGE_KEY = "fesTimeBuilder_board_v9_mobile_timeedit_stageorder";
const APP_NAME = "妄想タイムテーブル";
const DISPLAY_YEAR = "2026";
const FESTIVAL_LABELS = {
  summerSonic: "サマソニ",
  fujiRock: "フジロック"
};

const state = {
  festivals: null,
  festivalKey: "summerSonic",
  yearKey: "",
  dayFilter: "",
  pool: [],
  assignments: {},
  stageOrders: {},
  slotOverrides: {},
  draggingStage: "",
  dragHoverStage: "",
  dragCommitted: false,
  dragStartOrder: null
};

const touchDrag = {
  artist: null,
  stage: null
};

const el = {
  festival: document.getElementById("festival"),
  year: document.getElementById("year"),
  yearLabel: document.getElementById("year")?.closest("label"),
  dayFilter: document.getElementById("dayFilter"),
  quickAddForm: document.getElementById("quickAddForm"),
  quickAddInput: document.getElementById("quickAddInput"),
  message: document.getElementById("message"),
  summary: document.getElementById("summary"),
  boardTitle: document.getElementById("boardTitle"),
  posterLink: document.getElementById("posterLink"),
  poolDropZone: document.getElementById("poolDropZone"),
  pool: document.getElementById("pool"),
  board: document.getElementById("board"),
  resetTimeBtn: document.getElementById("resetTimeBtn"),
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
      if (!Array.isArray(yearData.stages)) {
        yearData.stages = Object.keys(yearData.slotsMap || {});
      }
      yearData.slots = expandSlots(yearData.slotsMap);
    });

    if (!festival.stageMeta || typeof festival.stageMeta !== "object") {
      festival.stageMeta = {};
    }
    if (!festival.stageColors || typeof festival.stageColors !== "object") {
      festival.stageColors = {};
    }
    if (!Array.isArray(festival.stageOrder)) {
      const firstYear = Object.values(festival.years)[0];
      festival.stageOrder = Array.isArray(firstYear?.stages) ? [...firstYear.stages] : [];
    }
  });

  state.festivals = festivals;
}

function getFestival() {
  return state.festivals[state.festivalKey];
}

function getYearData() {
  return getFestival().years[state.yearKey];
}

function getFestivalStageOrder() {
  const festivalOrder = getFestival().stageOrder;
  return Array.isArray(festivalOrder) ? festivalOrder : [];
}

function getStageOrderKey() {
  return `${state.festivalKey}__${state.yearKey}`;
}

function getOrderedStages() {
  const key = getStageOrderKey();
  const base = getYearData().stages;
  const preferred = getFestivalStageOrder().filter((stage) => base.includes(stage));
  const defaultOrder = [...preferred, ...base.filter((stage) => !preferred.includes(stage))];
  const stored = Array.isArray(state.stageOrders[key]) ? state.stageOrders[key] : [];
  const filtered = stored.filter((stage) => base.includes(stage));
  const missing = defaultOrder.filter((stage) => !filtered.includes(stage));
  const ordered = filtered.length > 0 ? [...filtered, ...missing] : defaultOrder;
  state.stageOrders[key] = ordered;
  return ordered;
}

function getStageColor(stage, index = 0) {
  const festivalColors = getFestival().stageColors || {};
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

function getSlotVisualColors(stageColor, hasArtist) {
  if (hasArtist) {
    return {
      border: toRgba(stageColor, 0.72),
      background: toRgba(stageColor, 0.88),
      time: "#1f2328",
      text: "#15181c"
    };
  }

  return {
    border: toRgba(stageColor, 0.5),
    background: toRgba(stageColor, 0.2),
    time: "#4b5563",
    text: "#1f2328"
  };
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

function getTimelineAnchorMinute(daySlots) {
  const byDay = getFestival().timelineStartByDay;
  const dayConfigured = byDay?.[state.dayFilter];
  if (isValidClock(dayConfigured)) {
    return toMinutes(dayConfigured);
  }

  const configured = getFestival().timelineStart;
  if (isValidClock(configured)) {
    return toMinutes(configured);
  }

  return Math.min(...daySlots.map((slot) => toMinutes(slot.start)));
}

function buildTimelineData(daySlots, anchorMinute = null) {
  if (daySlots.length === 0) {
    return { slots: [], minMinute: 600, maxMinute: 1320 };
  }

  const anchor = Number.isFinite(anchorMinute) ? anchorMinute : Math.min(...daySlots.map((slot) => toMinutes(slot.start)));
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

function createArtist(name) {
  return { id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, name: String(name || "").trim() };
}

function normalizeArtistKey(name) {
  return String(name || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[’'`"“”\-_.!?:&／/|・,()[\]{}]/g, "");
}

function get2026DayPresetArtists() {
  const festival = getFestival();
  const yearData = getYearData();
  const baseArtists = Array.isArray(festival.presetArtists2026) ? festival.presetArtists2026 : null;
  if (!baseArtists || baseArtists.length === 0) return null;

  const days = Array.isArray(yearData.days) ? yearData.days : [];
  if (days.length === 0) return baseArtists;

  const announcedByDay = yearData.presetArtistsByDay;
  if (!announcedByDay || typeof announcedByDay !== "object") {
    return baseArtists;
  }

  const dayKeySets = Object.fromEntries(
    days.map((day) => [
      day,
      new Set(
        Array.isArray(announcedByDay[day])
          ? announcedByDay[day].map((name) => normalizeArtistKey(name)).filter(Boolean)
          : []
      )
    ])
  );

  const buckets = Object.fromEntries(days.map((day) => [day, []]));
  let rrIndex = 0;
  baseArtists.forEach((artist) => {
    const key = normalizeArtistKey(artist);
    const matchedDays = days.filter((day) => dayKeySets[day]?.has(key));
    if (matchedDays.length === 1) {
      buckets[matchedDays[0]].push(artist);
      return;
    }

    const day = days[rrIndex % days.length];
    buckets[day].push(artist);
    rrIndex += 1;
  });

  return Array.isArray(buckets[state.dayFilter]) ? buckets[state.dayFilter] : baseArtists;
}

function getDayPresetArtists() {
  const festival = getFestival();
  const yearData = getYearData();
  const day2026 = get2026DayPresetArtists();
  if (Array.isArray(day2026) && day2026.length > 0) return day2026;

  const dayMap = yearData.presetArtistsByDay || festival.presetArtistsByDay;
  const dayArtists = dayMap?.[state.dayFilter];
  if (Array.isArray(dayArtists) && dayArtists.length > 0) return dayArtists;

  return Array.isArray(festival.presetArtists2026)
    ? festival.presetArtists2026
    : Array.isArray(festival.sampleArtists)
      ? festival.sampleArtists
      : Array.isArray(yearData.presetArtists)
        ? yearData.presetArtists
        : [];
}

function getAssignedNamesForCurrentDay() {
  const daySlotIds = new Set(
    getYearData().slots
      .filter((slot) => slot.day === state.dayFilter)
      .map((slot) => slotId(slot))
  );

  const names = new Set();
  Object.entries(state.assignments).forEach(([key, artist]) => {
    if (!daySlotIds.has(key)) return;
    if (!artist?.name) return;
    names.add(artist.name);
  });
  return names;
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
  Object.entries(state.festivals).forEach(([key, data], idx) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = FESTIVAL_LABELS[key] || data.uiLabel || `フェス ${idx + 1}`;
    el.festival.append(option);
  });
  el.festival.value = state.festivalKey;
}

function fillYearOptions() {
  const years = Object.keys(getFestival().years).sort((a, b) => Number(b) - Number(a));
  if (!years.includes(state.yearKey)) {
    state.yearKey = years[0];
  }

  el.year.innerHTML = "";
  years.forEach((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = `${DISPLAY_YEAR}妄想版`;
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
  const festivalConfig = getFestival().posterLinks;
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
    el.posterLink.textContent = "去年のタイムテーブル未設定";
    return;
  }

  el.posterLink.href = link;
  el.posterLink.classList.remove("isDisabled");
  el.posterLink.textContent = "去年のタイムテーブルを開く";
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

function applyStageOrderToBoard() {
  const laneGrid = el.board.querySelector(".stageTimelineGrid");
  if (!laneGrid) return;

  const laneNodes = Array.from(laneGrid.querySelectorAll(".stageLane[data-stage]"));
  const stageNodeMap = new Map(laneNodes.map((node) => [node.dataset.stage, node]));
  getOrderedStages().forEach((stage) => {
    const node = stageNodeMap.get(stage);
    if (node) laneGrid.append(node);
  });
}

function previewStageReorder(sourceStage, targetStage) {
  const changed = reorderStage(sourceStage, targetStage);
  if (!changed) return false;
  applyStageOrderToBoard();
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

  if (
    target?.stage
    && target.stage !== active.sourceStage
    && target.stage !== active.lastPreviewStage
  ) {
    const changed = previewStageReorder(active.sourceStage, target.stage);
    if (changed) {
      active.changed = true;
      active.lastPreviewStage = target.stage;
    }
  }

  active.target = target;
  event.preventDefault();
}

function finishStageTouchDrag(event) {
  const active = touchDrag.stage;
  if (!active || active.pointerId !== event.pointerId) return;

  const target = active.target || pickStageDropTarget(event.clientX, event.clientY);
  let changed = active.changed;
  if (!changed && target?.stage) {
    changed = previewStageReorder(active.sourceStage, target.stage);
    if (changed) {
      active.lastPreviewStage = target.stage;
    }
  }

  active.ghost?.remove();
  clearDropHighlights();
  touchDrag.stage = null;

  if (changed) {
    saveStateSilently();
    renderSummary();
    setMessage(`ステージ順を変更: ${active.sourceStage} → ${active.lastPreviewStage || target.stage}`);
  }

  event.preventDefault();
}

function cancelStageTouchDrag(event) {
  const active = touchDrag.stage;
  if (!active || active.pointerId !== event.pointerId) return;
  if (active.changed && Array.isArray(active.originOrder)) {
    state.stageOrders[getStageOrderKey()] = [...active.originOrder];
    applyStageOrderToBoard();
    renderSummary();
  }
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
    state.dragHoverStage = "";
    state.dragCommitted = false;
    state.dragStartOrder = [...getOrderedStages()];
    event.dataTransfer.setData("application/x-fes-stage", targetStage);
    event.dataTransfer.setData("text/plain", `__stage__:${targetStage}`);
    event.dataTransfer.effectAllowed = "move";
    stageCol.classList.add("draggingStage");
  });

  stageName.addEventListener("dragend", () => {
    if (!state.dragCommitted && Array.isArray(state.dragStartOrder) && state.dragHoverStage) {
      state.stageOrders[getStageOrderKey()] = [...state.dragStartOrder];
      applyStageOrderToBoard();
      renderSummary();
    }
    state.draggingStage = "";
    state.dragHoverStage = "";
    state.dragCommitted = false;
    state.dragStartOrder = null;
    stageCol.classList.remove("draggingStage");
    clearDropHighlights();
  });

  const onStageDragOver = (event) => {
    const marker = event.dataTransfer.getData("text/plain");
    if (!state.draggingStage && !marker.startsWith("__stage__:")) return;
    event.preventDefault();
    stageCol.classList.add("dropActive");
    event.dataTransfer.dropEffect = "move";

    if (
      state.draggingStage
      && targetStage !== state.draggingStage
      && targetStage !== state.dragHoverStage
    ) {
      const changed = previewStageReorder(state.draggingStage, targetStage);
      if (changed) {
        state.dragHoverStage = targetStage;
      }
    }
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
    let changed = false;
    let destination = targetStage;
    if (state.dragHoverStage) {
      changed = true;
      destination = state.dragHoverStage;
    } else if (sourceStage !== targetStage) {
      changed = previewStageReorder(sourceStage, targetStage);
    }
    if (changed) {
      state.dragCommitted = true;
      saveStateSilently();
      renderSummary();
      setMessage(`ステージ順を変更: ${sourceStage} → ${destination}`);
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
      originOrder: [...getOrderedStages()],
      changed: false,
      lastPreviewStage: "",
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
      timeButton.textContent = slot.start;
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
    timeButton.textContent = formatClock(nextStart);

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
  const timeline = buildTimelineData(daySlots, getTimelineAnchorMinute(daySlots));
  const spanMinutes = Math.max(60, timeline.maxMinute - timeline.minMinute);
  const pxPerMinute = window.innerWidth <= 640 ? 1.1 : 1.25;
  const bodyHeight = Math.ceil(spanMinutes * pxPerMinute);
  const ticks = [];
  for (let m = timeline.minMinute; m <= timeline.maxMinute; m += 60) {
    ticks.push(m);
  }

  const dayLabel = document.createElement("p");
  dayLabel.className = "dayBanner";
  dayLabel.textContent = `${DISPLAY_YEAR}妄想 ${state.dayFilter}`;
  el.board.append(dayLabel);

  const timelineShell = document.createElement("div");
  timelineShell.className = "timelineShell";

  const makeAxis = (right = false) => {
    const timeAxis = document.createElement("div");
    timeAxis.className = "timeAxis";
    if (right) timeAxis.classList.add("isRight");
    timeAxis.style.height = `${bodyHeight}px`;
    ticks.forEach((m) => {
      const tick = document.createElement("div");
      tick.className = "timeTick";
      tick.style.top = `${(m - timeline.minMinute) * pxPerMinute}px`;
      tick.textContent = formatClock(m);
      timeAxis.append(tick);
    });
    return timeAxis;
  };

  const leftAxis = makeAxis(false);
  const rightAxis = makeAxis(true);

  const laneGrid = document.createElement("div");
  laneGrid.className = "stageTimelineGrid";
  const orderedStages = getOrderedStages();
  const laneMinWidth = window.innerWidth <= 640 ? 170 : window.innerWidth <= 960 ? 185 : 220;
  laneGrid.style.gridTemplateColumns = `repeat(${orderedStages.length}, minmax(${laneMinWidth}px, 1fr))`;

  orderedStages.forEach((stage, stageIndex) => {
    const stageColor = getStageColor(stage, stageIndex);
    const meta = getStageMeta(stage);
    const stageCol = document.createElement("section");
    stageCol.className = "stageLane";

    const stageHead = document.createElement("header");
    stageHead.className = "stageLaneHead";

    const stageDot = document.createElement("span");
    stageDot.className = "stageLaneDot";
    stageDot.style.borderColor = stageColor;

    const stageNameWrap = document.createElement("div");
    stageNameWrap.className = "stageLaneNameWrap";
    const stageName = document.createElement("h3");
    stageName.className = "stageLaneName";
    stageName.textContent = meta.title;
    stageNameWrap.append(stageName);

    const stageAccent = document.createElement("div");
    stageAccent.className = "stageLaneAccent";
    stageAccent.style.background = stageColor;

    stageHead.append(stageDot, stageNameWrap, stageAccent);
    attachStageReorderEvents(stageCol, stageHead, stage);

    const laneBody = document.createElement("div");
    laneBody.className = "stageLaneBody";
    laneBody.style.height = `${bodyHeight}px`;
    ticks.forEach((m) => {
      const guide = document.createElement("div");
      guide.className = "hourGuide";
      guide.style.top = `${(m - timeline.minMinute) * pxPerMinute}px`;
      laneBody.append(guide);
    });

    const stageSlots = timeline.slots
      .filter((slot) => slot.stage === stage)
      .sort((a, b) => a._startN - b._startN);

    stageSlots.forEach((slot) => {
      const id = slot._slotId || slotId(slot);
      const assigned = state.assignments[id];
      const hasArtist = Boolean(assigned);
      const colors = getSlotVisualColors(stageColor, hasArtist);
      const slotNode = document.createElement("div");
      slotNode.className = "slot";
      slotNode.dataset.slotId = id;
      slotNode.style.top = `${(slot._startN - timeline.minMinute) * pxPerMinute}px`;
      slotNode.style.height = `${Math.max(42, (slot._endN - slot._startN) * pxPerMinute)}px`;
      slotNode.style.borderColor = colors.border;
      slotNode.style.background = colors.background;

      const time = document.createElement("button");
      time.type = "button";
      time.className = "slotTime slotTimeButton";
      time.textContent = slot.start;
      time.title = "タップで時刻入力 / 枠を上下ドラッグで時刻移動";
      time.style.color = colors.time;
      time.addEventListener("click", (event) => {
        event.stopPropagation();
        promptSlotTime(slot);
      });

      const body = document.createElement("div");
      body.className = "slotBody";
      if (!assigned) body.classList.add("isEmpty");

      if (assigned) {
        const tag = makeTag(assigned, id);
        body.append(tag);
      }

      slotNode.append(time, body);
      attachSlotDropEvents(slotNode, id);
      attachSlotTimeDragEvents(slotNode, slot, timeline, pxPerMinute, time);
      laneBody.append(slotNode);
    });

    stageCol.append(stageHead, laneBody);
    laneGrid.append(stageCol);
  });

  timelineShell.append(leftAxis, laneGrid, rightAxis);
  el.board.append(timelineShell);
}

function renderSummary() {
  const total = getYearData().slots.length;
  const placed = Object.keys(state.assignments).length;
  el.summary.textContent = `配置 ${placed}/${total} ・ 未配置 ${state.pool.length}`;
  el.boardTitle.textContent = `${APP_NAME} ${DISPLAY_YEAR}`;
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
  const name = String(el.quickAddInput.value || "").trim();
  if (!name) {
    setMessage("アーティスト名を入力して");
    return;
  }

  state.pool.push(createArtist(name));
  el.quickAddInput.value = "";
  setMessage("アーティストを追加");
  renderAll();
}

function loadPresetCandidates(options = {}) {
  const { rebuildPool = true, notice = true, resetAssignments = false } = options;
  const presets = getDayPresetArtists();

  if (rebuildPool) {
    const assignedNames = getAssignedNamesForCurrentDay();
    const poolNames = presets.filter((name) => !assignedNames.has(name));
    state.pool = poolNames.map((name) => createArtist(name));
    if (resetAssignments) {
      state.assignments = {};
    }
    renderAll();
  }

  if (notice) {
    setMessage(`候補を読み込み: ${state.pool.length}件`);
  }
}

function resetPlacement() {
  Object.values(state.assignments).forEach((artist) => state.pool.push(artist));
  state.assignments = {};
  setMessage("配置をリセット");
  renderAll();
}

function resetSlotTimes() {
  const prefix = `${state.festivalKey}__${state.yearKey}__`;
  let changed = 0;
  for (const key of Object.keys(state.slotOverrides)) {
    if (!key.startsWith(prefix)) continue;
    delete state.slotOverrides[key];
    changed += 1;
  }

  setMessage(changed > 0 ? `時間を初期値に戻した: ${changed}枠` : "時間変更はなし");
  renderAll();
}

function switchFestival(key) {
  state.festivalKey = key;
  const years = Object.keys(getFestival().years).sort((a, b) => Number(b) - Number(a));
  state.yearKey = years[0];
  fillYearOptions();
  fillDayOptions();
  loadPresetCandidates({ rebuildPool: true, notice: true, resetAssignments: true });
}

function switchYear(key) {
  state.yearKey = key;
  fillDayOptions();
  loadPresetCandidates({ rebuildPool: true, notice: true, resetAssignments: true });
}

function saveStateSilently() {
  const payload = {
    festivalKey: state.festivalKey,
    yearKey: state.yearKey,
    dayFilter: state.dayFilter,
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
    if (state.pool.length === 0 && typeof parsed.lineupInput === "string" && parsed.lineupInput.trim()) {
      state.pool = parseArtists(parsed.lineupInput);
    }

    return true;
  } catch {
    return false;
  }
}

function getStageMeta(stage) {
  const data = getFestival().stageMeta?.[stage];
  if (data) return data;
  return { title: stage.toUpperCase(), venue: "" };
}

function drawWrappedCenterText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || line.length === 0) {
      line = next;
      return;
    }
    lines.push(line);
    line = word;
  });
  if (line) lines.push(line);

  const usedLines = lines.slice(0, maxLines);
  usedLines.forEach((item, idx) => {
    ctx.fillText(item, x, y + idx * lineHeight, maxWidth);
  });

  return usedLines.length;
}

function exportBoardImage() {
  const yearData = getYearData();
  const daySlots = sortSlots(
    yearData.slots
      .filter((slot) => slot.day === state.dayFilter)
      .map((slot) => getEffectiveSlot(slot)),
    yearData
  );
  const timeline = buildTimelineData(daySlots, getTimelineAnchorMinute(daySlots));
  const stages = getOrderedStages();

  const scale = 2;
  const colWidth = 182;
  const leftPad = 18;
  const rightPad = 18;
  const axisW = 52;
  const headTopH = 68;
  const headBottomH = 10;
  const topPad = 16;
  const bottomPad = 20;
  const pxPerMinute = 1.05;
  const bodyHeight = Math.ceil((timeline.maxMinute - timeline.minMinute) * pxPerMinute);

  const gridX = leftPad + axisW;
  const gridW = stages.length * colWidth;
  const bodyTop = topPad + headTopH + headBottomH;
  const width = leftPad + axisW + gridW + axisW + rightPad;
  const height = bodyTop + bodyHeight + bottomPad;

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#cfd3d9";
  ctx.lineWidth = 1;

  ctx.fillStyle = "#16181a";
  ctx.font = "bold 18px 'Hiragino Sans', 'Yu Gothic', sans-serif";
  ctx.fillText(`${APP_NAME} ${DISPLAY_YEAR}`, leftPad, 16);
  ctx.font = "12px 'Hiragino Sans', 'Yu Gothic', sans-serif";
  ctx.fillStyle = "#444";
  ctx.fillText(state.dayFilter, leftPad, 34);

  ctx.fillStyle = "#f4f6f8";
  ctx.fillRect(gridX, topPad, gridW, headTopH);
  ctx.fillStyle = "#00b8d9";
  ctx.fillRect(gridX, topPad + headTopH + 2, gridW, 4);
  ctx.fillStyle = "#e8ecef";
  ctx.fillRect(gridX, topPad + headTopH, gridW, headBottomH);
  ctx.strokeRect(gridX, topPad, gridW, bodyTop - topPad);

  stages.forEach((stage, i) => {
    const stageColor = getStageColor(stage, i);
    const meta = getStageMeta(stage);
    const x = gridX + i * colWidth;
    const centerX = x + colWidth / 2;
    const iconY = topPad + 22;

    if (i > 0) {
      ctx.strokeStyle = "#d5dbe1";
      ctx.beginPath();
      ctx.moveTo(x, topPad);
      ctx.lineTo(x, bodyTop + bodyHeight);
      ctx.stroke();
    }

    ctx.strokeStyle = stageColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, iconY, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.fillStyle = "#202327";
    ctx.font = "bold 11px 'Hiragino Sans', 'Yu Gothic', sans-serif";
    ctx.textAlign = "center";
    drawWrappedCenterText(ctx, meta.title, centerX, topPad + 42, colWidth - 12, 12, 2);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, bodyTop, colWidth, bodyHeight);
    ctx.strokeStyle = "#d9dde3";
    ctx.strokeRect(x, bodyTop, colWidth, bodyHeight);

    const stageSlots = timeline.slots
      .filter((slot) => slot.stage === stage)
      .sort((a, b) => a._startN - b._startN);

    stageSlots.forEach((slot) => {
      const sy = bodyTop + (slot._startN - timeline.minMinute) * pxPerMinute;
      const sh = Math.max(28, (slot._endN - slot._startN) * pxPerMinute);
      const id = slot._slotId || slotId(slot);
      const artist = state.assignments[id]?.name || "";
      const colors = getSlotVisualColors(stageColor, Boolean(artist));

      ctx.fillStyle = colors.background;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.fillRect(x + 2, sy, colWidth - 4, sh);
      ctx.strokeRect(x + 2, sy, colWidth - 4, sh);

      ctx.fillStyle = colors.time;
      ctx.font = "9px 'Hiragino Sans', 'Yu Gothic', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(slot.start, x + 7, sy + 11);

      if (artist) {
        ctx.fillStyle = colors.text;
        ctx.font = "bold 12px 'Hiragino Sans', 'Yu Gothic', sans-serif";
        const maxW = colWidth - 14;
        const maxLines = sh >= 62 ? 3 : sh >= 44 ? 2 : 1;
        const lineHeight = 12;
        const baseY = sy + 24;
        const words = artist.split(/\s+/).filter(Boolean);
        let line = "";
        const lines = [];
        words.forEach((word) => {
          const next = line ? `${line} ${word}` : word;
          if (ctx.measureText(next).width <= maxW || line.length === 0) {
            line = next;
            return;
          }
          lines.push(line);
          line = word;
        });
        if (line) lines.push(line);
        lines.slice(0, maxLines).forEach((l, idx) => {
          ctx.fillText(l, x + 7, baseY + idx * lineHeight, maxW);
        });
      }
    });
  });

  ctx.strokeStyle = "#d5dbe1";
  ctx.beginPath();
  ctx.moveTo(gridX + gridW, topPad);
  ctx.lineTo(gridX + gridW, bodyTop + bodyHeight);
  ctx.stroke();

  const leftAxisX = leftPad;
  const rightAxisX = gridX + gridW + 6;
  ctx.fillStyle = "#697380";
  ctx.font = "10px 'Hiragino Sans', 'Yu Gothic', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let m = timeline.minMinute; m <= timeline.maxMinute; m += 60) {
    const y = bodyTop + (m - timeline.minMinute) * pxPerMinute;
    ctx.fillText(formatClock(m), leftAxisX, y);
    ctx.fillText(formatClock(m), rightAxisX, y);
  }
  ctx.textBaseline = "alphabetic";

  canvas.toBlob((blob) => {
    if (!blob) {
      setMessage("画像出力に失敗");
      return;
    }

    const fileName = `fes_board_${DISPLAY_YEAR}_${state.dayFilter.replace(/\s+/g, "_")}.png`;
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
    loadPresetCandidates({ rebuildPool: true, notice: true, resetAssignments: false });
  });

  el.quickAddForm.addEventListener("submit", (event) => {
    event.preventDefault();
    buildPoolFromInput();
  });
  el.resetTimeBtn.addEventListener("click", resetSlotTimes);
  el.exportImageBtn.addEventListener("click", exportBoardImage);

  attachPoolDropEvents();
}

async function init() {
  try {
    document.title = APP_NAME;
    await loadFestivals();
    fillFestivalOptions();
    fillYearOptions();
    const restored = restoreStateIfExists();
    if (!restored) {
      state.dayFilter = getYearData().days[0];
    }
    fillDayOptions();
    loadPresetCandidates({ rebuildPool: true, notice: false, resetAssignments: false });
    if (el.yearLabel) {
      el.yearLabel.style.display = "none";
    }
    attachEvents();
    renderAll();
    setMessage(restored ? "復元完了" : "準備完了");
  } catch (e) {
    setMessage("タイムテーブル読み込みに失敗");
    console.error(e);
  }
}

init();
