(() => {
  const KIND_LABEL = {
    regular: "Klassiek (intern)",
    rapid: "Rapid (intern)",
    event: "Bijzonder"
  };

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

  async function loadSeasonData() {
    const url = new URL("./data/season.json", window.location.href).href;
    const response = await fetch(`${url}?_=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("season.json");
    return response.json();
  }

  function normalizeEvents(data) {
    return (data.events || []).map(([date, label, kind]) => ({ date, label, kind: kind || "regular" }));
  }

  function renderLegend() {
    return `<div class="calendar-legend" aria-hidden="true">
      <span><i class="dot regular"></i> Klassieke speelavond (1:40+10)</span>
      <span><i class="dot rapid"></i> Interne rapid (R)</span>
      <span><i class="dot event"></i> ALV / evenement</span>
    </div>`;
  }

  function renderUpcoming(events, limit = 6) {
    const today = todayIso();
    const upcoming = events.filter(e => e.date >= today).slice(0, limit);
    if (!upcoming.length) {
      return `<p class="meta">Geen komende clubavonden in de kalender.</p>`;
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

  function renderMonthGrid(events) {
    const today = todayIso();
    const byDate = new Map(events.map(e => [e.date, e]));
    const start = new Date();
    start.setDate(1);
    const year = start.getFullYear();
    const month = start.getMonth();
    const firstDow = (start.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = start.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

    let cells = "";
    for (let i = 0; i < firstDow; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const ev = byDate.get(iso);
      const cls = ["cal-cell", ev ? `has-event kind-${ev.kind}` : "", iso === today ? "today" : ""].filter(Boolean).join(" ");
      cells += `<div class="${cls}"><span class="cal-day">${day}</span>${ev ? `<span class="cal-ev" title="${ev.label}">${ev.label}</span>` : ""}</div>`;
    }

    return `<div class="calendar-month"><h3 class="calendar-month-title">${monthName}</h3>
      <div class="cal-weekdays"><span>Ma</span><span>Di</span><span>Wo</span><span>Do</span><span>Vr</span><span>Za</span><span>Zo</span></div>
      <div class="cal-grid">${cells}</div></div>`;
  }

  async function mountCalendar(options = {}) {
    const {
      upcomingId = "calendarUpcoming",
      monthId = null,
      legendId = "calendarLegend",
      upcomingLimit = 6,
      showMonth = false
    } = options;

    try {
      const data = await loadSeasonData();
      const events = normalizeEvents(data);
      const legend = document.getElementById(legendId);
      if (legend) legend.innerHTML = renderLegend();

      const upcoming = document.getElementById(upcomingId);
      if (upcoming) upcoming.innerHTML = renderUpcoming(events, upcomingLimit);

      if (showMonth && monthId) {
        const monthEl = document.getElementById(monthId);
        if (monthEl) monthEl.innerHTML = renderMonthGrid(events);
      }
      return events;
    } catch {
      const upcoming = document.getElementById(upcomingId);
      if (upcoming) upcoming.innerHTML = `<p class="api-status error">Kalender kon niet worden geladen.</p>`;
      return [];
    }
  }

  window.ScheveTorenCalendar = { mountCalendar, loadSeasonData, formatDateNl };
})();
