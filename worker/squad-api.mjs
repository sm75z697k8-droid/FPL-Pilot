/**
 * FPLPilot squad read API.
 * Public, read-only FPL picks only; does NOT access /my-team/, cookies or credentials.
 * The FPL website's public endpoints are undocumented and may change.
 */
const FPL = "https://fantasy.premierleague.com/api/";
const ALLOWED_ORIGIN = "https://sm75z697k8-droid.github.io";
const RESPONSE_HEADERS = {
  "access-control-allow-origin": ALLOWED_ORIGIN,
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Content-Type",
  "vary": "Origin",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
const POSITION_IDS = new Set([1, 2, 3, 4]);

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...RESPONSE_HEADERS, "content-type": "application/json; charset=utf-8" }
  });
}

export function parseTeamId(input) {
  if (typeof input !== "string" || !/^[1-9][0-9]{0,8}$/.test(input)) return null;
  const id = Number(input);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function getPublishedGameweeks(events, now = Date.now()) {
  if (!Array.isArray(events)) throw new Error("Invalid FPL gameweek data");
  return events.filter(event =>
    Number.isInteger(event?.id) && event.id >= 1 && event.id <= 38 &&
    Number.isFinite(Date.parse(event.deadline_time)) &&
    Date.parse(event.deadline_time) <= now
  ).sort((a, b) => Date.parse(b.deadline_time) - Date.parse(a.deadline_time));
}

export function buildPublicSquad(entry, picksPayload, bootstrap, gameweek, teamId) {
  if (!entry || typeof entry.name !== "string" || !Array.isArray(picksPayload?.picks) ||
      picksPayload.picks.length !== 15 ||
      !Array.isArray(bootstrap?.elements) || !Array.isArray(bootstrap?.teams) ||
      !Array.isArray(bootstrap?.element_types)) {
    throw new Error("Incomplete FPL squad data");
  }

  const players = new Map(bootstrap.elements.map(item => [item.id, item]));
  const clubs = new Map(bootstrap.teams.map(item => [item.id, item]));
  const positions = new Map(bootstrap.element_types.map(item => [item.id, item]));
  const seenPlayers = new Set();
  const seenSlots = new Set();

  const squad = picksPayload.picks.map(pick => {
    if (!Number.isInteger(pick.element) || !Number.isInteger(pick.position) ||
        pick.position < 1 || pick.position > 15 ||
        seenPlayers.has(pick.element) || seenSlots.has(pick.position)) {
      throw new Error("Invalid FPL picks");
    }
    seenPlayers.add(pick.element);
    seenSlots.add(pick.position);
    const player = players.get(pick.element);
    if (!player || !POSITION_IDS.has(player.element_type) ||
        !positions.has(player.element_type) || !clubs.has(player.team) ||
        typeof player.web_name !== "string") {
      throw new Error("Unknown FPL player in picks");
    }
    const club = clubs.get(player.team);
    const position = positions.get(player.element_type);
    if (typeof club.short_name !== "string" ||
        typeof position.singular_name_short !== "string") {
      throw new Error("Incomplete FPL player metadata");
    }
    return {
      id: player.id,
      name: player.web_name,
      club: club.short_name,
      role: position.singular_name_short,
      role_id: player.element_type,
      squad_slot: pick.position,
      captain: pick.is_captain === true,
      vice_captain: pick.is_vice_captain === true,
    };
  });

  squad.sort((a, b) => a.squad_slot - b.squad_slot);
  if (squad.filter(item => item.captain).length !== 1 ||
      squad.filter(item => item.vice_captain).length !== 1 ||
      squad.some(item => item.captain && item.vice_captain)) {
    throw new Error("Inconsistent FPL captain information");
  }
  return {
    team: { id: teamId, name: entry.name.trim() || "Unnamed team" },
    gameweek: { id: gameweek.id, deadline_time: gameweek.deadline_time },
    retrieved_at: new Date().toISOString(),
    source: "Fantasy Premier League public API",
    scope: "Published gameweek picks, not the manager's private live/editable squad.",
    squad,
  };
}

async function fetchOfficial(path, ttl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10500);
  try {
    const result = await fetch(FPL + path, {
      method: "GET", signal: controller.signal,
      headers: { accept: "application/json" },
      cf: { cacheTtl: ttl, cacheEverything: true }
    });
    if (result.status === 404) return null;
    if (!result.ok) throw new Error("Official FPL service unavailable");
    const text = await result.text();
    if (text.length > 4_000_000) throw new Error("Unexpected FPL response size");
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request) {
    const origin = request.headers.get("origin");
    if (origin && origin !== ALLOWED_ORIGIN) return reply({ error: "Origin not allowed." }, 403);
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204, headers: RESPONSE_HEADERS
    });
    if (request.method !== "GET") return reply({ error: "Method not allowed." }, 405);

    const url = new URL(request.url);
    if (url.pathname === "/health") return reply({ ok: true, service: "fplpilot-squad" });
    if (url.pathname !== "/squad") return reply({ error: "Not found." }, 404);

    const teamId = parseTeamId(url.searchParams.get("team"));
    if (!teamId || [...url.searchParams.keys()].some(key => key !== "team")) {
      return reply({ error: "Enter a valid numeric FPL Team ID." }, 400);
    }
    try {
      const [entry, eventsPayload, bootstrap] = await Promise.all([
        fetchOfficial(`entry/${teamId}/`, 300),
        fetchOfficial("events/", 600),
        fetchOfficial("bootstrap-static/", 3600),
      ]);
      if (!entry) return reply({ error: "Team ID not found. Check the number in your FPL Points URL." }, 404);
      if (!eventsPayload || !bootstrap) throw new Error("Incomplete FPL response");
      const events = getPublishedGameweeks(eventsPayload);
      if (!events.length) return reply({ error: "No gameweek picks have been published yet." }, 409);

      const started = Number.isInteger(entry.started_event) ? entry.started_event : 1;
      // Look back a few rounds if an entry is missing its latest published picks.
      let publishedPicks = null, selectedGameweek = null;
      for (const event of events.slice(0, 4)) {
        if (event.id < started) break;
        const picks = await fetchOfficial(`entry/${teamId}/event/${event.id}/picks/`, 180);
        if (picks?.picks?.length === 15) {
          publishedPicks = picks;
          selectedGameweek = event;
          break;
        }
      }
      if (!publishedPicks) return reply({
        error: "No public squad is available yet. FPL publishes picks after each deadline."
      }, 404);
      const result = buildPublicSquad(entry, publishedPicks, bootstrap, selectedGameweek, teamId);
      return reply(result);
    } catch (_error) {
      return reply({ error: "Official FPL data is unavailable right now. Please try again later." }, 503);
    }
  }
};
