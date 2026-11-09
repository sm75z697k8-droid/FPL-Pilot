const test = require("node:test");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
let api;
test.before(async () => { api = await import(pathToFileURL(path.resolve(__dirname, "../worker/squad-api.mjs")).href); });

const clubs = [{ id: 1, short_name: "ARS" }, { id: 2, short_name: "LIV" }];
const elements = Array.from({ length: 15 }, (_, i) => ({
 id: i + 101, web_name: "Player " + (i+1), team: i%2 ? 1:2,
 element_type: i===0 || i===11 ? 1: i<6 ? 2 : i<11 ? 3 : 4
}));
const boot = { elements, teams: clubs, element_types: [
 {id:1, singular_name_short:"GKP"}, {id:2, singular_name_short:"DEF"},
 {id:3, singular_name_short:"MID"}, {id:4, singular_name_short:"FWD"}
]};
const picks = { picks: elements.map((e,i)=>({
 element:e.id, position:i+1, is_captain:i===5, is_vice_captain:i===7
})) };
const event = {id:10, deadline_time:"2026-11-06T18:30:00Z"};

test("rejects malformed, nonnumeric or unsafe team IDs",()=>{
 for(const v of ["", "0", "0001", "-2", "1/../", " 1", "1e2", "1000000000", null])
  assert.equal(api.parseTeamId(v),null);
 assert.equal(api.parseTeamId("1234567"),1234567);
});
test("selects only deadline-passed rounds newest first",()=>{
 const now=Date.parse("2026-11-10T00:00:00Z");
 const events=[{id:9,deadline_time:"2026-11-01T11:00:00Z"},{id:10,deadline_time:"2026-11-06T18:30:00Z"},
 {id:11,deadline_time:"2026-11-21T11:00:00Z"}];
 assert.deepEqual(api.getPublishedGameweeks(events,now).map(e=>e.id),[10,9]);
});
test("joins all 15 picks to real player metadata",()=>{
 const result=api.buildPublicSquad({name:"My FPL Squad"},picks,boot,event,321);
 assert.equal(result.squad.length,15);
 assert.equal(result.team.id,321);
 assert.equal(result.squad[0].role,"GKP");
 assert.equal(result.squad[5].captain,true);
 assert.equal(result.squad[7].vice_captain,true);
 assert.equal(result.squad[14].squad_slot,15);
 assert.match(result.scope,/published/i);
});
test("rejects invented players and duplicate picks",()=>{
 const missing={picks:picks.picks.map((x,i)=>i===2?{...x,element:90000}:x)};
 assert.throws(()=>api.buildPublicSquad({name:"Team"},missing,boot,event,321),/Unknown FPL player/);
 const duplicate={picks:picks.picks.map((x,i)=>i===2?{...x,position:2}:x)};
 assert.throws(()=>api.buildPublicSquad({name:"Team"},duplicate,boot,event,321),/Invalid FPL picks/);
});
test("rejects missing captains rather than guessing",()=>{
 const wrong={picks:picks.picks.map(x=>({...x,is_captain:false}))};
 assert.throws(()=>api.buildPublicSquad({name:"Team"},wrong,boot,event,321),/captain/);
});
