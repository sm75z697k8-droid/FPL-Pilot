/* FPLPilot — public, read-only gameweek metadata.
   The snapshot is produced by GitHub Actions using FPL's public endpoint.
   No user credentials, third-party proxy, or fabricated fallback dates. */
(() => {
  "use strict";

  const RAW_URL = "https://raw.githubusercontent.com/sm75z697k8-droid/FPL-Pilot/main/data/gameweek.json";
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const DELAYED_AGE_MS = 4 * 60 * 60 * 1000;
  const FETCH_TIMEOUT_MS = 12000;

  function validateSnapshot(data, now = Date.now()) {
    if (!data || data.schema_version !== 1 || !Array.isArray(data.events) ||
        data.events.length < 30 || data.events.length > 50) {
      throw new Error("Unexpected gameweek data");
    }
    const updatedMs = Date.parse(data.fetched_at);
    if (!Number.isFinite(updatedMs) || updatedMs > now + 5 * 60 * 1000 ||
        now - updatedMs > MAX_AGE_MS) {
      throw new Error("Gameweek data is unavailable or too old");
    }
    if (data.events.some(event =>
      !Number.isInteger(event.id) || event.id < 1 || event.id > 50 ||
      typeof event.deadline_time !== "string" ||
      !Number.isFinite(Date.parse(event.deadline_time)))) {
      throw new Error("Invalid gameweek deadlines");
    }
    return { events: data.events, updatedMs, delayed: now - updatedMs > DELAYED_AGE_MS };
  }

  function chooseUpcoming(events, now = Date.now()) {
    return events
      .filter(event => Date.parse(event.deadline_time) > now)
      .sort((a, b) => Date.parse(a.deadline_time) - Date.parse(b.deadline_time))[0] || null;
  }

  function formatCountdown(deadlineMs, now = Date.now()) {
    if (!Number.isFinite(deadlineMs) || deadlineMs <= now) return "Deadline passed";
    let total = Math.ceil((deadlineMs - now) / 1000);
    const days = Math.floor(total / 86400);
    total %= 86400;
    const hours = Math.floor(total / 3600);
    total %= 3600;
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    const two = value => String(value).padStart(2, "0");
    return `${days}d  ${two(hours)}h  ${two(minutes)}m  ${two(seconds)}s`;
  }

  function formatDeadline(iso) {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short"
    }).format(new Date(iso));
  }

  async function requestJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  // GitHub Pages does not rebuild when GITHUB_TOKEN pushes a snapshot.
  // Therefore the cross-origin raw GitHub file is primary, and same-origin is fallback.
  async function loadSnapshot(now = Date.now()) {
    const bust = `?refresh=${Math.floor(now / (10 * 60 * 1000))}`;
    const localUrl = new URL("data/gameweek.json", document.baseURI).href;
    let lastError;
    for (const url of [RAW_URL, localUrl]) {
      try {
        return validateSnapshot(await requestJson(url + bust), Date.now());
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Gameweek data could not be loaded");
  }

  function initGameweek() {
    const panel = document.getElementById("gameweek-panel");
    if (!panel) return;
    const get = id => document.getElementById(id);
    const els = {
      status: get("gw-status"), current: get("gw-current"),
      next: get("gw-next"), deadline: get("gw-deadline"),
      clock: get("gw-clock"), note: get("gw-note"),
      updated: get("gw-updated"), retry: get("gw-retry")
    };
    if (Object.values(els).some(element => !element)) return;

    let data = null;
    let loading = false;

    function setStatus(state, label, message) {
      panel.dataset.state = state;
      if (els.status.textContent !== label) els.status.textContent = label;
      if (els.note.textContent !== message) els.note.textContent = message;
    }

    function clearValues() {
      els.current.textContent = "—";
      els.next.textContent = "—";
      els.deadline.textContent = "—";
      els.deadline.removeAttribute("datetime");
      els.clock.textContent = "—";
      els.updated.textContent = "No verified snapshot available";
    }

    function render() {
      if (!data) return;
      const now = Date.now();
      const age = now - data.updatedMs;
      if (age < -5 * 60 * 1000 || age > MAX_AGE_MS) {
        data = null;
        clearValues();
        setStatus("error", "DATA UNAVAILABLE", "The official snapshot is out of date. Check the FPL website for the deadline.");
        return;
      }

      const current = data.events.find(event => event.is_current === true);
      const upcoming = chooseUpcoming(data.events, now);
      els.current.textContent = current ? `GW${current.id}` : "—";
      els.next.textContent = upcoming ? `GW${upcoming.id}` : "None scheduled";
      els.updated.textContent = `Last checked ${formatDeadline(new Date(data.updatedMs).toISOString())}`;

      if (upcoming) {
        els.deadline.textContent = formatDeadline(upcoming.deadline_time);
        els.deadline.setAttribute("datetime", upcoming.deadline_time);
        els.clock.textContent = formatCountdown(Date.parse(upcoming.deadline_time), now);
      } else {
        els.deadline.textContent = "No upcoming deadline";
        els.deadline.removeAttribute("datetime");
        els.clock.textContent = "Season complete";
      }
      if (age > DELAYED_AGE_MS) {
        setStatus("delayed", "UPDATE DELAYED", "The last verified snapshot is older than four hours. Confirm the deadline on the FPL website.");
      } else if (!upcoming) {
        setStatus("ready", "OFFICIAL DATA", "No further transfer deadlines are currently scheduled.");
      } else {
        setStatus("ready", "OFFICIAL DATA", "Deadline countdown uses your device time and an official FPL deadline snapshot.");
      }
    }

    async function refresh() {
      if (loading) return;
      loading = true;
      els.retry.disabled = true;
      panel.setAttribute("aria-busy", "true");
      if (!data) setStatus("loading", "CHECKING DATA", "Loading official FPL gameweek details…");
      try {
        data = await loadSnapshot();
        render();
      } catch (error) {
        if (!data || Date.now() - data.updatedMs > MAX_AGE_MS) {
          data = null;
          clearValues();
          setStatus("error", "DATA UNAVAILABLE", "Could not load verified gameweek data. Retry, or check the FPL website directly.");
        } else {
          render();
          setStatus("delayed", "UPDATE DELAYED", "Latest refresh failed. Showing the last verified snapshot; confirm deadlines on the official site.");
        }
      } finally {
        loading = false;
        els.retry.disabled = false;
        panel.removeAttribute("aria-busy");
      }
    }

    els.retry.addEventListener("click", refresh);
    refresh();
    setInterval(render, 1000);
    setInterval(refresh, 10 * 60 * 1000);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { validateSnapshot, chooseUpcoming, formatCountdown };
  }
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initGameweek);
  }
})();
