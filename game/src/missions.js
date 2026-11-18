// The story: Rico, a driver fresh out of the game, takes jobs from Mara Voss,
// a fixer who runs Solmar from a garage in the Docks. Five missions, in order,
// each a chain of stages — go somewhere, pick something up, deliver it, steal
// a car, lose the police. Money and progress are saved between visits.
import { MISSIONS } from './config.js';

// Landmark keys come from city.landmarks. `onFoot` stages need the player out
// of the car; `setWanted` is applied when the stage begins.
const DEFS = [
  {
    id: 1,
    title: 'First Job',
    intro: 'Mara Voss: "Rico. A package is waiting at the Docks. Bring it to my garage. No cops, no problems."',
    reward: 500,
    stages: [
      { type: 'goto', at: 'docks', label: 'Pick up the package', radius: 52, text: 'Go to the Docks and pick up the package.' },
      { type: 'deliver', at: 'garage', label: 'Deliver to the Garage', radius: 52, text: 'Deliver the package to Rico\'s Garage.' },
    ],
  },
  {
    id: 2,
    title: 'Hot Wheels',
    intro: 'Mara Voss: "A red sports car is parked by the Docks. Take it. Bring it to the Chop Shop. Try not to get caught."',
    reward: 800,
    stages: [
      { type: 'steal', at: 'docks', label: 'Steal the red sports car', radius: 60, text: 'Steal the red sports car parked at the Docks. Press E near it.' },
      { type: 'deliver', at: 'chopshop', label: 'Deliver to the Chop Shop', radius: 52, text: 'Bring the car to the Chop Shop.' },
    ],
  },
  {
    id: 3,
    title: 'The Drop',
    intro: 'Mara Voss: "A drop is waiting in Central Park. On foot, Rico — a car draws eyes. The cops will be on you after."',
    reward: 1200,
    stages: [
      { type: 'pickup', at: 'park', label: 'Pick up the drop', radius: 46, onFoot: true, text: 'Pick up the drop in Central Park — on foot.' },
      { type: 'deliver', at: 'marina', label: 'Deliver to the Marina', radius: 52, setWanted: 2, text: 'Deliver to the Marina. The police are on you — lose them or outrun them.' },
    ],
  },
  {
    id: 4,
    title: 'Getaway',
    intro: 'Mara Voss: "Three stars, Rico. The whole PD is looking for you. Get to the Safehouse in North Hills and lay low."',
    reward: 1500,
    stages: [
      { type: 'escape', at: 'safehouse', label: 'Reach the Safehouse', radius: 56, setWanted: 3, text: 'Escape the police — get to the Safehouse in North Hills.' },
    ],
  },
  {
    id: 5,
    title: 'The Big Score',
    intro: 'Mara Voss: "The bank, Rico. Solmar National. Grab the cash, make two drops, then vanish. This is the one that sets us up."',
    reward: 3000,
    stages: [
      { type: 'goto', at: 'bank', label: 'Hit the bank', radius: 52, text: 'Go to Solmar National Bank and grab the cash.' },
      { type: 'deliver', at: 'marina', label: 'First drop: Marina', radius: 52, text: 'First drop: the Marina.' },
      { type: 'deliver', at: 'beach', label: 'Second drop: Palm Beach', radius: 52, text: 'Second drop: Palm Beach.' },
      { type: 'escape', at: 'safehouse', label: 'Reach the Safehouse', radius: 56, setWanted: 4, text: 'Four stars. Get to the Safehouse and disappear.' },
    ],
  },
];

export function createMissionState() {
  return {
    index: 0, // which mission (0-based); >= DEFS.length means the story is done
    stage: 0,
    stageStarted: false,
    completed: DEFS.map(() => false),
    failed: false,
  };
}

export function currentMissionDef(state) {
  const m = state.mission;
  if (m.index >= DEFS.length) return null;
  return DEFS[m.index];
}

/** The mission's current target (for the marker and the HUD), or null. */
export function currentTarget(state) {
  const def = currentMissionDef(state);
  if (!def) return null;
  const stage = def.stages[state.mission.stage];
  if (!stage) return null;
  if (stage.type === 'steal') {
    const car = state.cars.find((c) => c.missionCar);
    if (!car) return null;
    return { x: car.x, y: car.y, label: stage.label, radius: stage.radius };
  }
  const landmark = state.city.landmarks[stage.at];
  if (!landmark) return null;
  return { x: landmark.x, y: landmark.y, label: stage.label, radius: stage.radius };
}

/** The objective line the HUD shows. */
export function currentObjective(state) {
  const def = currentMissionDef(state);
  if (!def) return 'All missions complete — Solmar is yours. Free roam.';
  const stage = def.stages[state.mission.stage];
  if (!stage) return def.title;
  return `${def.title}: ${stage.text}`;
}

function applyStageStart(state, stage) {
  if (stage.setWanted) {
    state.player.wanted = Math.max(state.player.wanted, stage.setWanted);
    state.player.wantedTimer = 0;
  }
}

/** Advance the story: check the current stage, move on, pay out, or finish. */
export function updateMissions(state, dt) {
  const m = state.mission;
  const def = currentMissionDef(state);
  if (!def) return;
  const stage = def.stages[m.stage];
  if (!stage) return;
  if (!m.stageStarted) {
    m.stageStarted = true;
    applyStageStart(state, stage);
    state.message = stage.text;
    state.messageTimer = 3;
  }
  const player = state.player;
  let done = false;
  if (stage.type === 'steal') {
    const car = state.cars.find((c) => c.missionCar);
    done = !!car && player.car === car;
  } else {
    const landmark = state.city.landmarks[stage.at];
    if (landmark) {
      const d = Math.hypot(player.x - landmark.x, player.y - landmark.y);
      const onFootOk = !stage.onFoot || player.onFoot;
      done = d < stage.radius && onFootOk;
    }
  }
  if (!done) return;
  state.audio.pickup();
  m.stage += 1;
  m.stageStarted = false;
  if (m.stage >= def.stages.length) {
    // Mission complete: pay out and move to the next one.
    player.money += def.reward;
    m.completed[m.index] = true;
    m.index += 1;
    m.stage = 0;
    state.audio.missionDone();
    if (m.index >= DEFS.length) {
      state.message = `The Big Score is done. $${def.reward} earned. Solmar is yours.`;
    } else {
      const next = DEFS[m.index];
      state.message = `Mission complete! $${def.reward} earned. Next: ${next.title}.`;
    }
    state.messageTimer = 4;
    saveProgress(state);
  } else {
    state.message = `${stage.label} — done.`;
    state.messageTimer = 2;
  }
}

/** Restart the current mission from its first stage (after being busted). */
export function restartMission(state) {
  const m = state.mission;
  m.stage = 0;
  m.stageStarted = false;
  m.failed = false;
  state.player.wanted = 0;
  state.player.wantedTimer = 0;
}

export function saveProgress(state) {
  try {
    const data = {
      money: state.player.money,
      missionIndex: state.mission.index,
      completed: state.mission.completed,
    };
    window.localStorage.setItem('solmar.save.v1', JSON.stringify(data));
  } catch {
    // Storage can be off: progress then lasts this visit only.
  }
}

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem('solmar.save.v1');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export { DEFS, MISSIONS };
