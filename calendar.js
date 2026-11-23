const STORAGE_KEY = "apx_season_planner_v1";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let state = {
  events: [],       // { id, name, type: 'comp' | 'qualif' | 'deadline', color }
  assignments: {},  // { "YYYY-MM-DD": ["eventId1", "eventId2"] }
  activeEventId: null
};

let isPainting = false;
let paintAction = "add"; // 'add' | 'remove'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.events = Array.isArray(parsed.events) ? parsed.events : [];
      state.assignments = parsed.assignments && typeof parsed.assignments === "object" ? parsed.assignments : {};
      if (state.events.length > 0) {
        state.activeEventId = state.events[0].id;
      }
    }
  } catch (err) {
    console.warn("Storage unavailable, using memory state:", err);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      events: state.events,
      assignments: state.assignments
    }));
  } catch (err) {
    console.warn("Failed to save state:", err);
  }
}

function formatDateKey(year, monthIndex, day) {
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function getTodayKey() {
  const now = new Date();
  return formatDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function getRollingMonths() {
  const now = new Date();
  const list = [];
  for (let offset = -1; offset <= 10; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    list.push({
      year: date.getFullYear(),
      month: date.getMonth(),
      offset
    });
  }
  return list;
}

function renderHeaderMeta(rollingMonths) {
  const first = rollingMonths[0];
  const last = rollingMonths[rollingMonths.length - 1];
  const rangeEl = document.getElementById("range-label");
  const todayEl = document.getElementById("today-label");

  if (rangeEl) {
    rangeEl.textContent = `${MONTHS[first.month].slice(0, 3)} ${first.year} — ${MONTHS[last.month].slice(0, 3)} ${last.year}`;
  }

  if (todayEl) {
    const now = new Date();
    todayEl.textContent = `Today: ${MONTHS[now.getMonth()].slice(0, 3)} ${now.getDate()}, ${now.getFullYear()}`;
  }
}

function toggleDateAssignment(dateKey, forceMode = null) {
  if (!state.activeEventId) return;

  if (!state.assignments[dateKey]) {
    state.assignments[dateKey] = [];
  }

  const list = state.assignments[dateKey];
  const exists = list.includes(state.activeEventId);
  const mode = forceMode || (exists ? "remove" : "add");

  if (mode === "add" && !exists) {
    list.push(state.activeEventId);
  } else if (mode === "remove" && exists) {
    state.assignments[dateKey] = list.filter((id) => id !== state.activeEventId);
    if (state.assignments[dateKey].length === 0) {
      delete state.assignments[dateKey];
    }
  }

  saveState();
  renderCalendar();
  renderLegend();
}

function applyDayVisuals(cell, dateKey) {
  const assignedIds = state.assignments[dateKey] || [];
  if (assignedIds.length === 0) return;

  const assignedEvents = assignedIds
    .map((id) => state.events.find((ev) => ev.id === id))
    .filter(Boolean);

  if (assignedEvents.length === 0) return;

  cell.title = assignedEvents.map((e) => `${e.name} (${e.type})`).join(" | ");

  const compEvent = assignedEvents.find((e) => e.type === "comp");
  const qualifEvent = assignedEvents.find((e) => e.type === "qualif");
  const deadlineEvent = assignedEvents.find((e) => e.type === "deadline");

  if (compEvent) {
    cell.classList.add("has-comp");
    cell.style.backgroundColor = compEvent.color;
  }

  if (qualifEvent) {
    cell.classList.add("has-qualif");
    cell.style.setProperty("--qualif-color", qualifEvent.color);
  }

  if (deadlineEvent) {
    const dot = document.createElement("span");
    dot.className = "day-dot";
    dot.style.backgroundColor = deadlineEvent.color;
    cell.appendChild(dot);
  }
}

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  if (!grid) return;

  grid.innerHTML = "";
  const rollingMonths = getRollingMonths();
  const todayKey = getTodayKey();

  renderHeaderMeta(rollingMonths);

  rollingMonths.forEach(({ year, month, offset }) => {
    const card = document.createElement("article");
    card.className = "month-card";
    if (offset === -1) card.classList.add("is-prev-month");
    if (offset === 0) card.classList.add("is-current-month");

    const header = document.createElement("div");
    header.className = "month-header";
    header.innerHTML = `
      <span class="month-title">${MONTHS[month]}</span>
      <span class="month-year">${year}</span>
    `;
    card.appendChild(header);

    const weekdaysRow = document.createElement("div");
    weekdaysRow.className = "weekdays";
    WEEKDAYS.forEach((dayName) => {
      const span = document.createElement("span");
      span.textContent = dayName;
      weekdaysRow.appendChild(span);
    });
    card.appendChild(weekdaysRow);

    const daysGrid = document.createElement("div");
    daysGrid.className = "days-grid";

    // Monday = 0 ... Sunday = 6
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const startOffset = (firstDayOfMonth + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "day-cell empty";
      daysGrid.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = formatDateKey(year, month, day);
      const cell = document.createElement("div");
      cell.className = "day-cell";
      cell.textContent = day;
      cell.dataset.date = dateKey;

      if (dateKey === todayKey) {
        cell.classList.add("is-today");
      }

      applyDayVisuals(cell, dateKey);

      cell.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (!state.activeEventId) return;
        isPainting = true;
        const current = state.assignments[dateKey] || [];
        paintAction = current.includes(state.activeEventId) ? "remove" : "add";
        toggleDateAssignment(dateKey, paintAction);
      });

      cell.addEventListener("mouseenter", () => {
        if (isPainting && state.activeEventId) {
          toggleDateAssignment(dateKey, paintAction);
        }
      });

      daysGrid.appendChild(cell);
    }

    card.appendChild(daysGrid);
    grid.appendChild(card);
  });
}

function getEventDateSummary(eventId) {
  const dates = Object.keys(state.assignments)
    .filter((key) => state.assignments[key].includes(eventId))
    .sort();

  if (dates.length === 0) return "No dates selected";

  const formatShort = (iso) => {
    const [y, m, d] = iso.split("-");
    return `${MONTHS[parseInt(m, 10) - 1].slice(0, 3)} ${parseInt(d, 10)}`;
  };

  if (dates.length === 1) return formatShort(dates[0]);
  return `${formatShort(dates[0])} – ${formatShort(dates[dates.length - 1])} (${dates.length}d)`;
}

function renderLegend() {
  const listEl = document.getElementById("legend-list");
  if (!listEl) return;

  listEl.innerHTML = "";

  state.events.forEach((ev) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    if (ev.id === state.activeEventId) {
      item.classList.add("active");
    }

    const swatch = document.createElement("span");
    swatch.className = `swatch ${ev.type}`;
    swatch.style.backgroundColor = ev.color;
    swatch.style.setProperty("--swatch-color", ev.color);

    const textWrap = document.createElement("div");
    textWrap.className = "legend-text";
    textWrap.innerHTML = `
      <span class="legend-name">${ev.name}</span>
      <span class="legend-dates">${getEventDateSummary(ev.id)}</span>
    `;

    const infoWrap = document.createElement("div");
    infoWrap.className = "legend-info";
    infoWrap.appendChild(swatch);
    infoWrap.appendChild(textWrap);

    const delBtn = document.createElement("button");
    delBtn.className = "btn-delete";
    delBtn.type = "button";
    delBtn.title = "Delete event";
    delBtn.innerHTML = "&times;";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteEvent(ev.id);
    });

    item.appendChild(infoWrap);
    item.appendChild(delBtn);

    item.addEventListener("click", () => {
      state.activeEventId = ev.id;
      renderLegend();
    });

    listEl.appendChild(item);
  });
}

function deleteEvent(eventId) {
  state.events = state.events.filter((ev) => ev.id !== eventId);

  Object.keys(state.assignments).forEach((dateKey) => {
    state.assignments[dateKey] = state.assignments[dateKey].filter((id) => id !== eventId);
    if (state.assignments[dateKey].length === 0) {
      delete state.assignments[dateKey];
    }
  });

  if (state.activeEventId === eventId) {
    state.activeEventId = state.events.length > 0 ? state.events[0].id : null;
  }

  saveState();
  renderCalendar();
  renderLegend();
}

function initControls() {
  document.addEventListener("mouseup", () => {
    isPainting = false;
  });

  const form = document.getElementById("event-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("event-name");
      const typeInput = document.getElementById("event-type");
      const colorInput = document.getElementById("event-color");

      const name = nameInput.value.trim();
      if (!name) return;

      const newEvent = {
        id: `ev_${Date.now()}`,
        name,
        type: typeInput.value,
        color: colorInput.value
      };

      state.events.push(newEvent);
      state.activeEventId = newEvent.id;
      nameInput.value = "";

      saveState();
      renderLegend();
    });
  }

  const exportBtn = document.getElementById("btn-export");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `apx-calendar-backup-${getTodayKey()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const importInput = document.getElementById("input-import");
  if (importInput) {
    importInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (Array.isArray(imported.events) && typeof imported.assignments === "object") {
            state.events = imported.events;
            state.assignments = imported.assignments;
            state.activeEventId = state.events.length > 0 ? state.events[0].id : null;
            saveState();
            renderCalendar();
            renderLegend();
          }
        } catch (err) {
          alert("Invalid JSON backup file.");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initControls();
  renderCalendar();
  renderLegend();
});
