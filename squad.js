/* FPLPilot — read-only public squad viewer.
   FPL does not publish managers' pending, pre-deadline edits through this API. */
(() => {
  "use strict";
  const API = "https://fplpilot-squad-api.4b9fgkmtpy.workers.dev/squad";
  const TIMEOUT_MS = 15000;
  // Only a public numeric FPL Team ID is stored locally; never squad data or credentials.
  const SAVED_TEAM_KEY = "fplpilot.savedTeamId.v1";

  function browserStorage() {
    try {
      return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      return null; // Safari private mode or restricted storage.
    }
  }

  function readSavedTeamId(storage = browserStorage()) {
    if (!storage) return null;
    try {
      const value = storage.getItem(SAVED_TEAM_KEY);
      if (value === null) return null;
      const id = parseTeamId(value);
      if (id === null) {
        storage.removeItem(SAVED_TEAM_KEY);
        return null;
      }
      return id;
    } catch {
      return null;
    }
  }

  function saveTeamId(teamId, storage = browserStorage()) {
    const id = parseTeamId(String(teamId));
    if (!id || !storage) return false;
    try {
      storage.setItem(SAVED_TEAM_KEY, String(id));
      return true;
    } catch {
      return false;
    }
  }

  function forgetTeamId(storage = browserStorage()) {
    if (!storage) return false;
    try {
      storage.removeItem(SAVED_TEAM_KEY);
      return true;
    } catch {
      return false;
    }
  }

  function parseTeamId(raw) {
    if (typeof raw !== "string" || !/^[1-9][0-9]{0,8}$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  function validateSquad(data, requestedId) {
    if (!data || typeof data !== "object" || data.team?.id !== requestedId ||
        typeof data.team?.name !== "string" || !Number.isInteger(data.gameweek?.id) ||
        data.gameweek.id < 1 || data.gameweek.id > 38 ||
        !Number.isFinite(Date.parse(data.gameweek.deadline_time)) ||
        !Array.isArray(data.squad) || data.squad.length !== 15) {
      throw new Error("Unexpected squad response. Please retry.");
    }
    const slots = new Set();
    const playerIDs = new Set();
    for (const player of data.squad) {
      if (!player || !Number.isInteger(player.id) || player.id <= 0 ||
          !Number.isInteger(player.squad_slot) || player.squad_slot < 1 ||
          player.squad_slot > 15 || slots.has(player.squad_slot) ||
          playerIDs.has(player.id) || ![1, 2, 3, 4].includes(player.role_id) ||
          typeof player.name !== "string" || !player.name.trim() ||
          typeof player.club !== "string" || typeof player.role !== "string") {
        throw new Error("Incomplete player data. Please retry.");
      }
      slots.add(player.squad_slot);
      playerIDs.add(player.id);
    }
    if (data.squad.filter(p => p.captain === true).length !== 1 ||
        data.squad.filter(p => p.vice_captain === true).length !== 1) {
      throw new Error("Invalid captain information. Please retry.");
    }
    return { ...data, squad: [...data.squad].sort((a, b) => a.squad_slot - b.squad_slot) };
  }

  // This URL pattern and 110px variant were observed in the current
  // official FPL statistics page. The images remain on the FPL host.
  // Reachable images do not grant permission to republish copyrighted kits.
  const FPL_SHIRT_BASE = "https://fantasy.premierleague.com/dist/img/shirts/standard/";

  function officialKitUrl(player, goalkeeper = false) {
    if (!Number.isInteger(player?.club_code) ||
        player.club_code < 1 || player.club_code > 9999) return null;
    const suffix = goalkeeper ? "_1" : "";
    return `${FPL_SHIRT_BASE}shirt_${player.club_code}${suffix}-110.png`;
  }

  function createPlayer(player) {
    // Real official-hosted jerseys are displayed when provided by FPL.
    // A neutral position shirt remains when images are unavailable.
    const card = document.createElement("div");
    card.className = "squad-player";

    const visual = document.createElement("span");
    visual.className = "player-visual";
    visual.setAttribute("aria-hidden", "true");

    const shirt = document.createElement("span");
    shirt.className = "player-kit";
    shirt.dataset.position = player.role;
    shirt.textContent = player.role;
    shirt.hidden = false;
    visual.append(shirt);

    const label = document.createElement("span");
    label.className = "player-caption";

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.name;

    const club = document.createElement("span");
    club.className = "player-club";
    club.textContent = `${player.club} · ${player.role}`;

    label.append(name, club);
    if (player.captain || player.vice_captain) {
      const badge = document.createElement("span");
      badge.className = "player-armband";
      badge.dataset.kind = player.captain ? "captain" : "vice";
      badge.textContent = player.captain ? "C" : "VC";
      visual.append(badge);

      const description = document.createElement("span");
      description.className = "player-visually-hidden";
      description.textContent = player.captain ? "Captain" : "Vice captain";
      label.append(description);
    }
    // Keep captain badges visually above the jersey and avoid making an
    // external image a requirement for displaying the player.
    const imageUrl = officialKitUrl(player, player.role_id === 1);
    if (imageUrl) {
      const image = document.createElement("img");
      image.className = "player-kit-image";
      image.alt = "";
      image.width = 110;
      image.height = 110;
      // A display:none <img> combined with lazy loading can remain
      // unfetched in Safari. Keep the image layout-eligible but transparent
      // until its load event fires; the illustrated jersey remains visible.
      image.loading = "eager";
      image.decoding = "async";
      image.hidden = false;
      let triedHomeForGoalkeeper = false;
      image.onload = () => {
        image.dataset.loaded = "true";
        image.hidden = false;
        shirt.hidden = true;
      };
      image.onerror = () => {
        if (player.role_id === 1 && !triedHomeForGoalkeeper) {
          triedHomeForGoalkeeper = true;
          image.src = officialKitUrl(player);
        } else {
          image.hidden = true;
          shirt.hidden = false;
        }
      };
      image.src = imageUrl;
      visual.append(image);
    }

    card.append(visual, label);
    return card;
  }

  function renderStarting(squad, target) {
    const starters = squad.filter(player => player.squad_slot <= 11);
    if (starters.length !== 11) throw new Error("Incomplete starting eleven.");
    const fragment = document.createDocumentFragment();
    for (const position of [4, 3, 2, 1]) {
      const row = document.createElement("div");
      row.className = "squad-position-row";
      const items = starters.filter(player => player.role_id === position);
      for (const player of items) row.append(createPlayer(player));
      if (items.length) fragment.append(row);
    }
    target.replaceChildren(fragment);
  }

  function renderBench(squad, target) {
    const bench = squad.filter(player => player.squad_slot >= 12);
    if (bench.length !== 4) throw new Error("Incomplete bench.");
    const fragment = document.createDocumentFragment();
    for (const player of bench) {
      const item = document.createElement("div");
      item.className = "squad-bench-slot";
      const label = document.createElement("span");
      label.textContent = `BENCH ${player.squad_slot - 11}`;
      item.append(label, createPlayer(player));
      fragment.append(item);
    }
    target.replaceChildren(fragment);
  }

  function formatLocal(iso) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) throw new Error("Missing published deadline.");
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric", month: "short", year: "numeric", hour: "numeric",
      minute: "2-digit", timeZoneName: "short"
    }).format(new Date(ms));
  }

  function init() {
    const get = id => document.getElementById(id);
    const form = get("squad-form");
    if (!form) return;
    const input = get("team-id");
    const submit = get("squad-submit");
    const state = get("squad-state");
    const message = get("squad-message");
    const data = get("squad-data");
    const teamName = get("squad-team-name");
    const teamReference = get("squad-team-reference");
    const gameweek = get("squad-gameweek");
    const starting = get("squad-starting");
    const bench = get("squad-bench");
    const context = get("squad-context");
    const fetched = get("squad-fetched");
    const savedCard = get("saved-team");
    const savedHeading = get("saved-team-heading");
    const savedId = get("saved-team-id");
    const reload = get("saved-team-reload");
    const change = get("saved-team-change");
    const forget = get("saved-team-forget");

    let activeController = null;

    function setState(type, description) {
      state.dataset.state = type;
      state.textContent = type === "loading" ? "LOADING" :
        type === "error" ? "UNAVAILABLE" : type === "ready" ? "SQUAD VERIFIED" : "READY TO SEARCH";
      message.hidden = !description;
      if (description) message.textContent = description;
    }

    function showSavedCard(teamId, verifiedName) {
      input.value = String(teamId);
      savedHeading.textContent = verifiedName || "Your FPL squad";
      savedId.textContent = `FPL Team ID ${teamId}`;
      form.hidden = true;
      savedCard.hidden = false;
    }

    function showEntryForm() {
      savedCard.hidden = true;
      form.hidden = false;
    }

    function cancelCurrentRequest() {
      if (activeController) activeController.abort();
      activeController = null;
      submit.disabled = false;
      reload.disabled = false;
    }

    async function loadTeam(teamId) {
      cancelCurrentRequest();
      const controller = new AbortController();
      activeController = controller;
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      submit.disabled = true;
      reload.disabled = true;
      data.hidden = true;
      setState("loading", "Retrieving the latest published squad from Fantasy Premier League…");

      try {
        const response = await fetch(`${API}?team=${teamId}`, {
          method: "GET", headers: { Accept: "application/json" },
          mode: "cors", signal: controller.signal, cache: "no-store"
        });
        const body = await response.json().catch(() => null);
        // An aborted request might still resolve. Never render it after switching teams.
        if (activeController !== controller || controller.signal.aborted) return;
        if (!response.ok) throw new Error(
          typeof body?.error === "string" ? body.error : "Could not retrieve the squad."
        );

        const result = validateSquad(body, teamId);
        renderStarting(result.squad, starting);
        renderBench(result.squad, bench);
        teamName.textContent = result.team.name;
        teamReference.textContent = `FPL Team ID ${teamId}`;
        gameweek.textContent = `GW${result.gameweek.id}`;
        context.textContent = `These are the published Gameweek ${result.gameweek.id} picks (deadline: ${formatLocal(result.gameweek.deadline_time)}). Transfers and changes since this deadline are not included.`;
        fetched.textContent = `Retrieved ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date())} · Source: official FPL public gameweek data.`;
        data.hidden = false;

        // Remember the ID only after FPL confirms a real, valid squad.
        // Storage may be unavailable; the squad viewer must still work normally.
        if (saveTeamId(teamId)) {
          showSavedCard(teamId, result.team.name);
          setState("ready", "");
        } else {
          showEntryForm();
          setState("ready", "Squad loaded. Browser storage is unavailable, so your Team ID could not be remembered on this device.");
        }
      } catch (error) {
        if (activeController !== controller) return;
        setState("error", error.name === "AbortError"
          ? "The request took too long. Please try again."
          : (error instanceof TypeError ? "Network connection unavailable. Please retry." : error.message));
      } finally {
        clearTimeout(timeout);
        if (activeController === controller) {
          activeController = null;
          submit.disabled = false;
          reload.disabled = false;
        }
      }
    }

    form.addEventListener("submit", event => {
      event.preventDefault();
      // Cancel even when the newly entered ID is invalid.
      cancelCurrentRequest();
      const teamId = parseTeamId(input.value.trim());
      if (!teamId) {
        data.hidden = true;
        setState("error", "Enter a valid FPL Team ID (1–9 digits, no spaces).");
        input.focus();
        return;
      }
      return loadTeam(teamId);
    });

    reload.addEventListener("click", () => {
      const teamId = readSavedTeamId();
      if (!teamId) {
        cancelCurrentRequest();
        showEntryForm();
        data.hidden = true;
        setState("idle", "No saved Team ID is available. Enter one to load your squad.");
        return;
      }
      return loadTeam(teamId);
    });

    change.addEventListener("click", () => {
      cancelCurrentRequest();
      showEntryForm();
      data.hidden = true;
      setState("idle", "Enter another Team ID. Your saved team stays until a new squad loads successfully.");
      input.focus();
      input.select();
    });

    forget.addEventListener("click", () => {
      cancelCurrentRequest();
      if (!forgetTeamId()) {
        setState("error", "Unable to clear the Team ID from this browser. Check your browser's website-data settings.");
        return;
      }
      showEntryForm();
      input.value = "";
      data.hidden = true;
      setState("idle", "Saved Team ID cleared from this browser. Enter another ID whenever you're ready.");
      input.focus();
    });

    // On return visits, show the saved card immediately and retrieve fresh public picks.
    const remembered = readSavedTeamId();
    if (remembered) {
      showSavedCard(remembered);
      return loadTeam(remembered);
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseTeamId, validateSquad, createPlayer, renderStarting, renderBench,
      readSavedTeamId, saveTeamId, forgetTeamId, officialKitUrl, init };
  }
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
})();
