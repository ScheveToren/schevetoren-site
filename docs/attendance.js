* { box-sizing: border-box; }

:root {
  --bg: #f4f7fb;
  --panel: #ffffff;
  --border: #dfe7f1;
  --text: #1d2a39;
  --muted: #5d6b7b;
  --primary: #0f6cbd;
  --primary-dark: #0b568d;
  --success: #1f8f5f;
  --success-soft: #eafaf3;
  --warning: #f4c95d;
  --warning-soft: #fff8e6;
  --danger: #c94f4f;
  --danger-soft: #fdeaea;
  --shadow: 0 14px 30px rgba(15, 30, 60, 0.08);
}

html, body {
  margin: 0;
  padding: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
}

body {
  min-height: 100vh;
}

.page-shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.topbar h1 {
  margin: 0.2rem 0 0;
  font-size: clamp(1.8rem, 2vw, 2.6rem);
}

.eyebrow {
  margin: 0;
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.75rem;
  font-weight: 700;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  border-radius: 18px;
  padding: 1.1rem 1.2rem;
  margin-bottom: 1rem;
}

.intro-panel {
  background: linear-gradient(135deg, #edf5ff 0%, #ffffff 100%);
}

.status-badge {
  display: inline-block;
  background: var(--warning-soft);
  color: #8a6500;
  border: 1px solid #f0d788;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tool-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: end;
}

.tool-row {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 220px;
}

.tool-row.stacked {
  flex: 1 1 240px;
}

.tool-row.actions {
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
}

.field-label {
  font-weight: 600;
  color: var(--muted);
}

select, input, textarea {
  width: 100%;
  border: 1px solid var(--border);
  background: #fdfdff;
  border-radius: 10px;
  padding: 0.7rem 0.8rem;
  font: inherit;
  color: var(--text);
}

select:focus, input:focus, textarea:focus {
  outline: 2px solid rgba(15, 108, 189, 0.18);
  border-color: var(--primary);
}

.button {
  appearance: none;
  border: none;
  border-radius: 10px;
  padding: 0.75rem 1rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.button:hover {
  transform: translateY(-1px);
}

.button.primary {
  background: var(--primary);
  color: #fff;
}

.button.primary:hover {
  background: var(--primary-dark);
}

.button.success {
  background: var(--success);
  color: #fff;
}

.button.success:hover {
  background: #16724a;
}

.button.secondary {
  background: #eef4ff;
  color: var(--primary-dark);
}

.button.muted {
  background: #f0f3f8;
  color: var(--text);
}

.attendance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.day-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%);
  padding: 0.9rem;
}

.day-card h3 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}

.day-card .date-label {
  display: block;
  color: var(--muted);
  font-size: 0.8rem;
  margin-bottom: 0.8rem;
}

.inline-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}

.inline-controls select {
  flex: 1;
}

.note-box {
  margin-top: 0.5rem;
  min-height: 60px;
  resize: vertical;
}

.day-card[data-kind="rapid"] {
  border-color: #f0d788;
  background: var(--warning-soft);
}

.day-card[data-kind="event"] {
  border-color: #c8d9ef;
}

.meta-note {
  color: var(--muted);
  font-size: 0.75rem;
  margin-top: 0.4rem;
}

@media (max-width: 720px) {
  .topbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .tool-row.actions {
    width: 100%;
  }

  .button {
    width: 100%;
  }
}
