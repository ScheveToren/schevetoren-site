(() => {
  const KIND_LABEL = {
    regular: "Klassiek (intern)",
    rapid: "Rapid (intern)",
    event: "Bijzonder",
    external: "Externe competitie",
    youth: "Jeugd"
  };

  const DEFAULT_RANGE = { start: "2026-08-01", end: "2027-06-30" };

  function todayIso() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  }

  function formatDateNl(iso) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("nl-NL", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function parseMonth(iso) {
    const [y, m] = iso.split("-").map(Number);
    return { year: y, month: m - 1 };
  }

  function monthStartIso(year, month) {
    return `${year}-${String(month + 1).padStart(2, "0")}-01`;
  }

  function clampViewMonth(year, month, range) {
    const min = parseMonth(range.start);
    const max = parseMonth(range.end);
    let y = year;
    let m = month;
    if (y < min.year || (y === min.year && m < min.month)) {
      y = min.year;
      m = min.month;
    }
    if (y > max.year || (y === max.year && m > max.month)) {
      y = max.year;
      m = max.month;
    }
    return { year: y, month: m };
  }

  async function fetchJson(relativePath) {
    const url = new URL(relativePath, window.location.href).href;
    const response = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(relativePath);
    return response.json();
  }

  function tupleToEvent(tuple) {
    const [date, label, kind] = tuple;
    return { date, label, kind: kind || "regular" };
  }

  function objectToEvent(obj) {
    return {
      date: obj.date,
      label: obj.label,
      kind: obj.kind || "regular"
    };
  }

  async function loadAllEvents() {
    const [season, extra] = await Promise.all([
      fetchJson("./data/season.json"),
      fetchJson("./data/calendar-events.json").catch(() => ({ events: [], range: DEFAULT_RANGE }))
    ]);
    const internal = (season.events || []).map(tupleToEvent);
    const additional = (extra.events || []).map(item =>
      Array.isArray(item) ? tupleToEvent(item) : objectToEvent(item)
    );
    const range = extra.range || DEFAULT_RANGE;
    const merged = [...internal, ...additional];
    merged.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
    return { events: merged, range };
  }

  function eventsByDate(events) {
    const map = new Map();
    for (const ev of events) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date).push(ev);
    }
    return map;
  }

  function renderLegend() {
    return `<div class="calendar-legend" aria-hidden="true">
      <span><i class="dot regular"></i> Klassieke speelavond (1:40+10)</span>
      <span><i class="dot rapid"></i> Interne rapid (R)</span>
      <span><i class="dot event"></i> ALV / evenement</span>
      <span><i class="dot external"></i> HSB / KNSB</span>
      <span><i class="dot youth"></i> Jeugd (Grand Prix)</span>
    </div>`;
  }

  function renderUpcoming(events, limit = 6) {
    const today = todayIso();
    const upcoming = events.filter(e => e.date >= today).slice(0, limit);
    if (!upcoming.length) {
      return `<p class="meta">Geen komende evenementen in de kalender.</p>`;
    }
    return `<ul class="calendar-upcoming">
      ${upcoming.map(e => `
        <li class="calendar-item kind-${e.kind}">
          <time datetime="${e.date}">${formatDateNl(e.date)}</time>
          <span class="calendar-label">${e.label}</span>
          <span class="calendar-kind">${KIND_LABEL[e.kind] || e.kind}</span>
        </li>`).join("")}
    </ul>`;
  }

  function renderMonthList(events, year, month) {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const inMonth = events.filter(e => e.date.startsWith(prefix));
    if (!inMonth.length) {
      return `<p class="meta">Geen evenementen in deze maand.</p>`;
    }
    return `<ul class="calendar-upcoming calendar-month-list">
      ${inMonth.map(e => `
        <li class="calendar-item kind-${e.kind}">
          <time datetime="${e.date}">${formatDateNl(e.date)}</time>
          <span class="calendar-label">${e.label}</span>
          <span class="calendar-kind">${KIND_LABEL[e.kind] || e.kind}</span>
        </li>`).join("")}
    </ul>`;
  }

  function renderMonthGrid(events, year, month, byDate) {
    const today = todayIso();
    const start = new Date(year, month, 1);
    const firstDow = (start.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = start.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

    let cells = "";
    for (let i = 0; i < firstDow; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayEvents = byDate.get(iso) || [];
      const primary = dayEvents[0];
      const kindClass = primary ? `kind-${primary.kind}` : "";
      const cls = ["cal-cell", dayEvents.length ? `has-event ${kindClass}` : "", iso === today ? "today" : ""]
        .filter(Boolean)
        .join(" ");
      const evHtml = dayEvents.length
        ? dayEvents.map(ev => `<span class="cal-ev kind-${ev.kind}" title="${ev.label.replace(/"/g, "&quot;")}">${ev.label}</span>`).join("")
        : "";
      cells += `<div class="${cls}"><span class="cal-day">${day}</span>${evHtml}</div>`;
    }

    return `<div class="calendar-month"><h3 class="calendar-month-title">${monthName}</h3>
      <div class="cal-weekdays"><span>Ma</span><span>Di</span><span>Wo</span><span>Do</span><span>Vr</span><span>Za</span><span>So</span></div>
      <div class="cal-grid">${cells}</div></div>`;
  }

  function renderMonthNav(viewYear, viewMonth, range) {
    const min = parseMonth(range.start);
    const max = parseMonth(range.end);
    const atMin = viewYear === min.year && viewMonth === min.month;
    const atMax = viewYear === max.year && viewMonth === max.month;
    const title = new Date(viewYear, viewMonth, 1).toLocaleDateString("nl-NL", {
      month: "long",
      year: "numeric"
    });
    return `<div class="calendar-nav" role="navigation" aria-label="Kalender maanden">
      <button type="button" class="button secondary cal-nav-btn" data-cal-nav="prev" ${atMin ? "disabled" : ""} aria-label="Vorige maand">←</button>
      <span class="calendar-nav-title">${title}</span>
      <button type="button" class="button secondary cal-nav-btn" data-cal-nav="next" ${atMax ? "disabled" : ""} aria-label="Volgende maand">→</button>
      <button type="button" class="button muted cal-nav-btn" data-cal-nav="today">Vandaag</button>
    </div>`;
  }

  async function mountCalendar(options = {}) {
    const {
      upcomingId = "calendarUpcoming",
      monthId = null,
      monthListId = null,
      legendId = "calendarLegend",
      upcomingLimit = 6,
      showMonth = false,
      enableMonthNav = false,
      navMountId = "calendarMonth"
    } = options;

    let viewYear;
    let viewMonth;
    let events = [];
    let range = DEFAULT_RANGE;
    let byDate = new Map();

    function paintMonth() {
      if (!showMonth || !monthId) return;
      const monthEl = document.getElementById(monthId);
      if (!monthEl) return;
      if (enableMonthNav) {
        monthEl.innerHTML =
          renderMonthNav(viewYear, viewMonth, range) +
          renderMonthGrid(events, viewYear, viewMonth, byDate);
        monthEl.querySelectorAll("[data-cal-nav]").forEach(btn => {
          btn.addEventListener("click", () => {
            const action = btn.getAttribute("data-cal-nav");
            if (action === "prev") {
              viewMonth -= 1;
              if (viewMonth < 0) {
                viewMonth = 11;
                viewYear -= 1;
              }
            } else if (action === "next") {
              viewMonth += 1;
              if (viewMonth > 11) {
                viewMonth = 0;
                viewYear += 1;
              }
            } else if (action === "today") {
              const t = new Date();
              viewYear = t.getFullYear();
              viewMonth = t.getMonth();
            }
            const clamped = clampViewMonth(viewYear, viewMonth, range);
            viewYear = clamped.year;
            viewMonth = clamped.month;
            paintMonth();
          });
        });
      } else {
        monthEl.innerHTML = renderMonthGrid(events, viewYear, viewMonth, byDate);
      }
      if (monthListId) {
        const listEl = document.getElementById(monthListId);
        if (listEl) listEl.innerHTML = renderMonthList(events, viewYear, viewMonth);
      }
    }

    try {
      const loaded = await loadAllEvents();
      events = loaded.events;
      range = loaded.range || DEFAULT_RANGE;
      byDate = eventsByDate(events);

      const now = new Date();
      viewYear = now.getFullYear();
      viewMonth = now.getMonth();
      const clamped = clampViewMonth(viewYear, viewMonth, range);
      viewYear = clamped.year;
      viewMonth = clamped.month;

      const legend = document.getElementById(legendId);
      if (legend) legend.innerHTML = renderLegend();

      const upcoming = document.getElementById(upcomingId);
      if (upcoming) upcoming.innerHTML = renderUpcoming(events, upcomingLimit);

      paintMonth();
      return events;
    } catch {
      const upcoming = document.getElementById(upcomingId);
      if (upcoming) upcoming.innerHTML = `<p class="api-status error">Kalender kon niet worden geladen.</p>`;
      return [];
    }
  }

  window.ScheveTorenCalendar = { mountCalendar, loadAllEvents, formatDateNl };
})();
