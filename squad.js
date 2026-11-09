/* FPLPilot — read-only public squad viewer.
   FPL does not publish managers' pending, pre-deadline edits through this API. */
(() => {
  "use strict";
  const API = "https://fplpilot-squad-api.4b9fgkmtpy.workers.dev/squad";
  const TIMEOUT_MS = 15000;

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

  function createPlayer(player) {
    const card = document.createElement("div");
    card.className = "squad-player";

    const shirt = document.createElement("span");
    shirt.className = "player-kit";
    shirt.dataset.position = player.role;
    shirt.setAttribute("aria-hidden", "true");
    shirt.textContent = player.role;

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.name;

    const club = document.createElement("span");
    club.className = "player-club";
    club.textContent = `${player.club} · ${player.role}`;

    card.append(shirt, name, club);
    if (player.captain || player.vice_captain) {
      const captain = document.createElement("span");
      captain.className = "player-armband";
      if (player.vice_captain) captain.dataset.kind = "vice";
      captain.textContent = player.captain ? "CAPTAIN" : "VICE";
      card.append(captain);
    }
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

    let activeController = null;

    function setState(type, description) {
      state.dataset.state = type;
      state.textContent = type === "loading" ? "LOADING" :
        type === "error" ? "UNAVAILABLE" : type === "ready" ? "SQUAD VERIFIED" : "READY TO SEARCH";
      if (description) {
        message.hidden = false;
        message.textContent = description;
      } else {
        message.hidden = true;
      }
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const teamId = parseTeamId(input.value.trim());
      if (!teamId) {
        data.hidden = true;
        setState("error", "Enter a valid FPL Team ID (1–9 digits, no spaces).");
        input.focus();
        return;
      }

      if (activeController) activeController.abort();
      const controller = new AbortController();
      activeController = controller;
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      submit.disabled = true;
      data.hidden = true;
      setState("loading", "Retrieving the latest published squad from Fantasy Premier League…");

      try {
        const response = await fetch(`${API}?team=${teamId}`, {
          method: "GET", headers: { Accept: "application/json" },
          mode: "cors", signal: controller.signal, cache: "no-store"
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(
          typeof body?.error === "string" ? body.error : "Could not retrieve the squad."
        );

        const result = validateSquad(body, teamId);
        // Build the full roster before revealing it; never show a partially rendered lineup.
        renderStarting(result.squad, starting);
        renderBench(result.squad, bench);
        teamName.textContent = result.team.name;
        teamReference.textContent = `FPL Team ID ${teamId}`;
        gameweek.textContent = `GW${result.gameweek.id}`;
        context.textContent = `These are the published Gameweek ${result.gameweek.id} picks (deadline: ${formatLocal(result.gameweek.deadline_time)}). Transfers and changes since this deadline are not included.`;
        fetched.textContent = `Retrieved ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date())} · Source: official FPL public gameweek data.`;
        setState("ready", "");
        data.hidden = false;
      } catch (error) {
        if (controller.signal.aborted && controller !== activeController) return;
        setState("error", error.name === "AbortError"
          ? "The request took too long. Please try again."
          : (error instanceof TypeError ? "Network connection unavailable. Please retry." : error.message));
      } finally {
        clearTimeout(timeout);
        if (controller === activeController) {
          activeController = null;
          submit.disabled = false;
        }
      }
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseTeamId, validateSquad };
  }
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
})();
