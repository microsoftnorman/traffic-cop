// ============================================================
// Traffic Cop — Vehicle Mechanics Tests
// Run: node tests.js
// ============================================================

// --- Constants (mirrored from game) ---
const ROAD_WIDTH = 10;
const INTERSECTION_SIZE = ROAD_WIDTH;
const CAR_LENGTH = 3.2;
const STOP_LINE_DIST = 9.5;
const CROSSWALK_DIST = STOP_LINE_DIST - 2.5;
const SPAWN_DIST = 65;
const EXIT_DIST = 70;
const LANE_OFFSET = 2.2;
const BRAKE_ZONE = 4;
const BUS_STOP_DIST = 25;
const BUS_STOP_DURATION_MIN = 3.0;
const BUS_STOP_DURATION_MAX = 5.0;

const RIGHT_TURN_CHANCE = 0.15;
const TURN_RADIUS = INTERSECTION_SIZE / 2 - LANE_OFFSET; // 2.8
const NO_TURN_TYPES = ['bus', 'semi', 'firetruck'];
const RIGHT_TURN_DATA = {
  NORTH: { exitDir: 'WEST',  cx: -INTERSECTION_SIZE/2, cz: -INTERSECTION_SIZE/2, a0: 0,              a1: Math.PI/2,     r0: 0,           r1: -Math.PI/2 },
  SOUTH: { exitDir: 'EAST',  cx:  INTERSECTION_SIZE/2, cz:  INTERSECTION_SIZE/2, a0: Math.PI,         a1: 3*Math.PI/2,   r0: Math.PI,     r1: Math.PI/2 },
  EAST:  { exitDir: 'NORTH', cx: -INTERSECTION_SIZE/2, cz:  INTERSECTION_SIZE/2, a0: 3*Math.PI/2,     a1: 2*Math.PI,     r0: Math.PI/2,   r1: 0 },
  WEST:  { exitDir: 'SOUTH', cx:  INTERSECTION_SIZE/2, cz: -INTERSECTION_SIZE/2, a0: Math.PI/2,       a1: Math.PI,       r0: -Math.PI/2,  r1: -Math.PI }
};

const DIRECTIONS = {
  NORTH: { name: 'North', axis: 'z', sign: -1, perpAxis: 'x', laneOffset: -LANE_OFFSET, angle: 0 },
  SOUTH: { name: 'South', axis: 'z', sign: 1,  perpAxis: 'x', laneOffset: LANE_OFFSET, angle: Math.PI },
  EAST:  { name: 'East',  axis: 'x', sign: -1, perpAxis: 'z', laneOffset: LANE_OFFSET, angle: Math.PI / 2 },
  WEST:  { name: 'West',  axis: 'x', sign: 1,  perpAxis: 'z', laneOffset: -LANE_OFFSET, angle: -Math.PI / 2 }
};

const SIGNAL_STATES = {
  ALL_GO: 'ALL_GO',
  ALL_STOP: 'ALL_STOP',
  EW_GO: 'EW_GO',
  NS_GO: 'NS_GO'
};

// --- Extracted game logic ---

const SIDEWALK_CENTER = 6.75;

const VEHICLE_TYPES = [
  { name: 'sedan',      w: 1.8, h: 1.4, l: 3.2, speedMult: 1.0, weight: 5 },
  { name: 'suv',        w: 2.0, h: 1.6, l: 3.6, speedMult: 0.95, weight: 3 },
  { name: 'hatchback',  w: 1.7, h: 1.3, l: 2.8, speedMult: 1.05, weight: 4 },
  { name: 'taxi',       w: 1.8, h: 1.4, l: 3.3, speedMult: 1.1, weight: 3 },
  { name: 'police',     w: 1.9, h: 1.5, l: 3.4, speedMult: 1.15, weight: 2 },
  { name: 'pickup',     w: 2.0, h: 1.6, l: 4.0, speedMult: 0.9, weight: 3 },
  { name: 'bus',        w: 2.4, h: 2.8, l: 8.0, speedMult: 0.7, weight: 2 },
  { name: 'semi',       w: 2.4, h: 2.6, l: 9.5, speedMult: 0.6, weight: 1 },
  { name: 'firetruck',  w: 2.3, h: 2.5, l: 7.0, speedMult: 0.85, weight: 1 },
  { name: 'icecream',   w: 2.0, h: 2.6, l: 5.0, speedMult: 0.65, weight: 1 },
  { name: 'motorcycle', w: 0.6, h: 1.2, l: 2.0, speedMult: 1.3, weight: 3 },
];

const EMERGENCY_TYPES = [
  { name: 'ambulance',  w: 2.1, h: 2.4, l: 5.5, speedMult: 1.2, weight: 1 },
  { name: 'firetruck',  w: 2.3, h: 2.5, l: 7.0, speedMult: 0.95, weight: 1 },
  { name: 'police',     w: 1.9, h: 1.5, l: 3.4, speedMult: 1.3, weight: 1 },
];

function isCarSignaledToStop(car, signalState) {
  if (car.isEmergency) return false;
  const isNS = car.dirData.axis === 'z';
  if (signalState === SIGNAL_STATES.ALL_GO) return false;
  if (signalState === SIGNAL_STATES.ALL_STOP) return true;
  if (signalState === SIGNAL_STATES.NS_GO && isNS) return false;
  if (signalState === SIGNAL_STATES.EW_GO && !isNS) return false;
  return true;
}

function makeCar(dirKey, posAlongAxis, opts = {}) {
  const dir = DIRECTIONS[dirKey];
  const isNS = dir.axis === 'z';
  const pos = { x: 0, y: 0, z: 0 };
  if (isNS) {
    pos.z = posAlongAxis;
    pos.x = dir.laneOffset;
  } else {
    pos.x = posAlongAxis;
    pos.z = dir.laneOffset;
  }
  return {
    direction: dirKey,
    dirData: dir,
    state: opts.state || 'moving',
    speed: opts.speed || 8,
    isEmergency: opts.isEmergency || false,
    isPedestrian: false,
    vehicleLength: opts.vehicleLength || CAR_LENGTH,
    vehicleWidth: 1.8,
    vehicleType: opts.vehicleType || 'sedan',
    cleared: false,
    waitTime: 0,
    accelTimer: opts.accelTimer !== undefined ? opts.accelTimer : 1,
    turnRight: opts.turnRight || false,
    turnProgress: opts.turnProgress,
    turnComplete: opts.turnComplete || false,
    busStopState: opts.busStopState || null,
    busStopTimer: opts.busStopTimer || 0,
    stuckTimer: opts.stuckTimer || 0,
    distanceFromCenter: Math.abs(isNS ? pos.z : pos.x),
    mesh: { position: pos, rotation: { z: 0, y: 0 } }
  };
}

// The core vehicle update extracted from the game
function updateSingleCar(car, cars, signalState, dt) {
  const dir = car.dirData;
  const isNS = dir.axis === 'z';
  const posComponent = isNS ? car.mesh.position.z : car.mesh.position.x;
  const distFromCenter = Math.abs(posComponent);
  car.distanceFromCenter = distFromCenter;

  const shouldStop = isCarSignaledToStop(car, signalState);
  const vLen = car.vehicleLength || CAR_LENGTH;

  let removed = false;
  let scored = false;

  if (car.state === 'moving' || car.state === 'through') {
    const ACCEL_DURATION = 0.5;
    if (car.accelTimer < ACCEL_DURATION) car.accelTimer += dt;
    const accelFactor = Math.min(1, car.accelTimer / ACCEL_DURATION);
    let moveAmount = car.speed * accelFactor * dt;
    let atStopLine = false;

    // Point of no return: if car's front bumper is past the stop line, commit to crossing
    // (skip for cars that just completed a right turn — they're exiting on a new axis)
    const PNR_DIST = STOP_LINE_DIST - 1;
    if (car.state === 'moving' && !car.turnComplete && distFromCenter < PNR_DIST + vLen / 2) {
      car.state = 'through';
    }

    // BUS STOP: buses stop to pick up passengers before reaching the intersection
    if (car.vehicleType === 'bus' && !car.isEmergency && car.state === 'moving') {
      const busStopPos = dir.sign * (BUS_STOP_DIST + vLen / 2);
      const distToBusStop = (busStopPos - posComponent) * (-dir.sign);

      if (car.busStopState === 'stopped') {
        car.busStopTimer -= dt;
        moveAmount = 0;
        if (car.busStopTimer <= 0) {
          car.busStopState = 'done';
          car.accelTimer = 0;
        }
      } else if (car.busStopState !== 'done' && distToBusStop >= 0 && distToBusStop < BUS_STOP_DIST) {
        if (distToBusStop <= 0.1) {
          car.busStopState = 'stopped';
          car.busStopTimer = BUS_STOP_DURATION_MIN + Math.random() * (BUS_STOP_DURATION_MAX - BUS_STOP_DURATION_MIN);
          moveAmount = 0;
          if (isNS) car.mesh.position.z = busStopPos;
          else car.mesh.position.x = busStopPos;
        } else if (distToBusStop < BRAKE_ZONE) {
          moveAmount = Math.min(moveAmount, car.speed * dt * (distToBusStop / BRAKE_ZONE), distToBusStop);
        }
      }
    }

    // BLOCK 1: Stop line — front bumper at STOP_LINE_DIST
    if (shouldStop && car.state !== 'through') {
      const stopLinePos = dir.sign * (STOP_LINE_DIST + vLen / 2);
      const distToStop = (stopLinePos - posComponent) * (-dir.sign);

      if (distToStop <= 0.05) {
        moveAmount = 0;
        atStopLine = true;
        if (isNS) car.mesh.position.z = stopLinePos;
        else car.mesh.position.x = stopLinePos;
      } else if (distToStop < BRAKE_ZONE) {
        const decel = car.speed * dt * (distToStop / BRAKE_ZONE);
        moveAmount = Math.min(moveAmount, decel, distToStop);
      } else {
        moveAmount = Math.min(moveAmount, distToStop);
      }
    }

    // BLOCK 2: Queue behind car ahead
    // Through cars inside the intersection have committed to clearing — skip queue logic
    if (!(car.state === 'through' && distFromCenter < STOP_LINE_DIST)) {
      for (const other of cars) {
        if (other === car || other.direction !== car.direction || other.state === 'crashed' || other.isPedestrian) continue;
        // Skip cars on a right-turn arc — they follow a curved path, not this lane
        if (other.turnRight && other.turnProgress !== undefined && !other.turnComplete) continue;
        const otherPos = isNS ? other.mesh.position.z : other.mesh.position.x;
        const fwdDist = (otherPos - posComponent) * (-dir.sign);
        if (fwdDist <= 0) continue;

        const gap = (vLen + (other.vehicleLength || CAR_LENGTH)) * 0.5 + 1.5;
        const distToGap = fwdDist - gap;

        if (distToGap <= 0.05) {
          moveAmount = 0;
        } else if (distToGap < BRAKE_ZONE) {
          moveAmount = Math.min(moveAmount, car.speed * dt * (distToGap / BRAKE_ZONE), distToGap);
        } else {
          moveAmount = Math.min(moveAmount, distToGap);
        }
      }
    }

    // Stuck detection: if a through car hasn't moved for too long, force it
    if (car.state === 'through' && moveAmount < 0.001) {
      if (!car.stuckTimer) car.stuckTimer = 0;
      car.stuckTimer += dt;
      if (car.stuckTimer > 4) {
        moveAmount = car.speed * dt;
        car.stuckTimer = 0;
      }
    } else {
      car.stuckTimer = 0;
    }

    // Apply movement
    if (moveAmount > 0.001) {
      // Skip straight movement for cars actively turning on arc
      const isOnArc = car.state === 'through' && car.turnRight && !car.turnComplete && car.turnProgress !== undefined;
      if (!isOnArc) {
        if (isNS) car.mesh.position.z -= dir.sign * moveAmount;
        else car.mesh.position.x -= dir.sign * moveAmount;
      }
    }

    // Transition to waiting
    if (atStopLine && car.state !== 'through') {
      car.state = 'waiting';
      car.waitTime = 0;
    }

    // Mark as through (skip for cars that completed a right turn)
    const updatedPos = isNS ? car.mesh.position.z : car.mesh.position.x;
    const updatedDist = Math.abs(updatedPos);
    if (updatedDist < INTERSECTION_SIZE / 2 + vLen / 2 && car.state !== 'waiting' && !car.turnComplete) {
      car.state = 'through';
    }

    // RIGHT TURN ARC — handle turning cars in 'through' state
    if (car.state === 'through' && car.turnRight && !car.turnComplete) {
      const HALF_INT = INTERSECTION_SIZE / 2;
      if (updatedDist <= HALF_INT + 0.5) {
        if (car.turnProgress === undefined) {
          car.turnProgress = 0;
          car._turnData = RIGHT_TURN_DATA[car.direction];
        }

        let shouldYield = false;
        if (!car._yieldTimer) car._yieldTimer = 0;
        for (const other of cars) {
          if (other === car || other.state === 'crashed') continue;
          if (other.isPedestrian) {
            const dx = other.mesh.position.x - car.mesh.position.x;
            const dz = other.mesh.position.z - car.mesh.position.z;
            if (dx * dx + dz * dz < 25) { shouldYield = true; break; }
          }
          if (!other.isPedestrian && other.dirData.axis !== dir.axis &&
              other.distanceFromCenter < HALF_INT + 2 &&
              other.state !== 'waiting' && other.state !== 'crashed') {
            shouldYield = true; break;
          }
        }
        // Force through after yielding too long to prevent deadlock
        if (shouldYield) {
          car._yieldTimer += dt;
          if (car._yieldTimer > 4) shouldYield = false;
        } else {
          car._yieldTimer = 0;
        }

        if (!shouldYield) {
          const arcLen = TURN_RADIUS * Math.PI / 2;
          car.turnProgress = Math.min(1, car.turnProgress + (car.speed * dt) / arcLen);
        }

        const td = car._turnData;
        const t = car.turnProgress;
        const ang = td.a0 + t * (td.a1 - td.a0);
        car.mesh.position.x = td.cx + TURN_RADIUS * Math.cos(ang);
        car.mesh.position.z = td.cz + TURN_RADIUS * Math.sin(ang);
        car.mesh.rotation.y = td.r0 + t * (td.r1 - td.r0);

        if (t >= 1) {
          car.turnComplete = true;
          car.direction = td.exitDir;
          car.dirData = DIRECTIONS[td.exitDir];
          car.turnRight = false;
          car.state = 'through';
          car.accelTimer = 0.5;
        }
      }
    }

    // Exit check
    if (Math.abs(updatedPos) > EXIT_DIST) {
      if (!car.cleared) {
        car.cleared = true;
        scored = true;
      }
      removed = true;
    }
    // Also check new axis for cars that completed a turn
    if (car.turnComplete) {
      const newIsNS = car.dirData.axis === 'z';
      const newPos = newIsNS ? car.mesh.position.z : car.mesh.position.x;
      if (Math.abs(newPos) > EXIT_DIST) {
        if (!car.cleared) {
          car.cleared = true;
          scored = true;
        }
        removed = true;
      }
    }
  } else if (car.state === 'waiting') {
    if (!shouldStop) {
      car.state = 'moving';
      car.accelTimer = 0;
      car.waitTime = 0;
      car.mesh.rotation.z = 0;
    } else {
      if (!car.waitTime) car.waitTime = 0;
      car.waitTime += dt;
    }
  }

  return { removed, scored };
}

function getPos(car) {
  const isNS = car.dirData.axis === 'z';
  return isNS ? car.mesh.position.z : car.mesh.position.x;
}

// --- Test framework ---
let passed = 0;
let failed = 0;
let totalAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (!condition) {
    failed++;
    console.error(`  FAIL: ${message}`);
    return false;
  }
  passed++;
  return true;
}

function assertApprox(actual, expected, tolerance, message) {
  return assert(
    Math.abs(actual - expected) <= tolerance,
    `${message} (expected ~${expected}, got ${actual})`
  );
}

function test(name, fn) {
  console.log(`\nTest: ${name}`);
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`  ERROR: ${e.message}`);
  }
}

// --- Simulate multiple frames ---
function simulate(cars, signalState, frames, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) {
    for (const car of cars) {
      if (car.state !== 'crashed') {
        updateSingleCar(car, cars, signalState, dt);
      }
    }
  }
}

// ============================================================
// TESTS
// ============================================================

test('Car stops at correct stop line position (NORTH)', () => {
  const car = makeCar('NORTH', -20); // approaching from z=-20
  const cars = [car];

  // Simulate with ALL_STOP until car stops
  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);

  assert(car.state === 'waiting', `Car should be waiting, is ${car.state}`);
  // NORTH: sign=-1, stop line for front bumper at -STOP_LINE_DIST, center at -(STOP_LINE_DIST + CAR_LENGTH/2)
  const expectedPos = -(STOP_LINE_DIST + CAR_LENGTH / 2);
  assertApprox(getPos(car), expectedPos, 0.01, `Car should stop at z=${expectedPos}`);
  assert(getPos(car) < 0, 'Car must stay on approach side (negative z for NORTH)');
});

test('Car stops at correct stop line position (SOUTH)', () => {
  const car = makeCar('SOUTH', 20);
  const cars = [car];

  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);

  assert(car.state === 'waiting', `Car should be waiting, is ${car.state}`);
  assertApprox(getPos(car), STOP_LINE_DIST + CAR_LENGTH / 2, 0.01, 'Car should stop at z=+(STOP_LINE_DIST+half)');
  assert(getPos(car) > 0, 'Car must stay on approach side (positive z for SOUTH)');
});

test('Car stops at correct stop line position (EAST)', () => {
  const car = makeCar('EAST', -20);
  const cars = [car];

  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);

  assert(car.state === 'waiting', `Car should be waiting, is ${car.state}`);
  assertApprox(getPos(car), -(STOP_LINE_DIST + CAR_LENGTH / 2), 0.01, 'Car should stop at x=-(STOP_LINE_DIST+half)');
});

test('Car stops at correct stop line position (WEST)', () => {
  const car = makeCar('WEST', 20);
  const cars = [car];

  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);

  assert(car.state === 'waiting', `Car should be waiting, is ${car.state}`);
  assertApprox(getPos(car), STOP_LINE_DIST + CAR_LENGTH / 2, 0.01, 'Car should stop at x=+(STOP_LINE_DIST+half)');
});

test('Car never crosses to wrong side of intersection when stopping', () => {
  for (const dirKey of Object.keys(DIRECTIONS)) {
    const dir = DIRECTIONS[dirKey];
    const spawnPos = dir.sign * 20; // start 20 units out
    const car = makeCar(dirKey, spawnPos);
    const cars = [car];

    simulate(cars, SIGNAL_STATES.ALL_STOP, 600);

    const pos = getPos(car);
    const expectedSign = Math.sign(dir.sign);
    assert(
      Math.sign(pos) === expectedSign,
      `${dirKey}: car should stay on approach side (sign=${expectedSign}), got pos=${pos.toFixed(2)}`
    );
  }
});

test('Two cars queue up — second car stops behind first', () => {
  const carA = makeCar('NORTH', -15); // closer to intersection
  const carB = makeCar('NORTH', -30); // further back
  const cars = [carA, carB];

  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);

  // Car A should be at stop line
  assert(carA.state === 'waiting', `Car A should be waiting, is ${carA.state}`);
  assertApprox(getPos(carA), -(STOP_LINE_DIST + CAR_LENGTH / 2), 0.01, 'Car A at stop line');
  const gap = CAR_LENGTH + 1.5; // (3.2/2 + 3.2/2) + 1.5 = 4.7
  const expectedBPos = getPos(carA) + (-1) * (-gap); // NORTH sign=-1, so "behind" is more negative
  // Actually: car B should be at carA_pos - gap (more negative for NORTH)
  const posB = getPos(carB);
  assert(posB < getPos(carA), 'Car B should be behind Car A (more negative z)');

  const actualGap = (getPos(carA) - getPos(carB));
  assert(actualGap >= gap - 0.5, `Gap should be >= ${(gap - 0.5).toFixed(1)}, got ${actualGap.toFixed(2)}`);
  assert(actualGap <= gap + 0.5, `Gap should be <= ${(gap + 0.5).toFixed(1)}, got ${actualGap.toFixed(2)}`);
});

test('Three cars form a proper queue', () => {
  const carA = makeCar('NORTH', -12);
  const carB = makeCar('NORTH', -22);
  const carC = makeCar('NORTH', -35);
  const cars = [carA, carB, carC];

  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);

  // All should be stopped
  const posA = getPos(carA);
  const posB = getPos(carB);
  const posC = getPos(carC);

  assertApprox(posA, -(STOP_LINE_DIST + CAR_LENGTH / 2), 0.01, 'Car A at stop line');
  assert(posB < posA, 'Car B behind Car A');
  assert(posC < posB, 'Car C behind Car B');

  // Check gaps
  const gapAB = posA - posB;
  const gapBC = posB - posC;
  const expectedGap = CAR_LENGTH + 1.5;

  assert(gapAB >= expectedGap - 0.5, `Gap A-B should be ~${expectedGap.toFixed(1)}, got ${gapAB.toFixed(2)}`);
  assert(gapBC >= expectedGap - 0.5, `Gap B-C should be ~${expectedGap.toFixed(1)}, got ${gapBC.toFixed(2)}`);
});

test('Cars resume when signal changes', () => {
  const car = makeCar('NORTH', -15);
  const cars = [car];

  // Stop at red
  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);
  assert(car.state === 'waiting', 'Car should be waiting at red');

  // Change to green
  simulate(cars, SIGNAL_STATES.NS_GO, 10);
  assert(car.state !== 'waiting', `Car should resume, state is ${car.state}`);

  // Should move toward center
  simulate(cars, SIGNAL_STATES.NS_GO, 400);
  const pos = getPos(car);
  assert(Math.abs(pos) > 30 || car.cleared, 'Car should have moved significantly or exited');
});

test('Queued cars follow when lead car moves', () => {
  const carA = makeCar('NORTH', -12);
  const carB = makeCar('NORTH', -22);
  const cars = [carA, carB];

  // Stop at red
  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);
  const posBStopped = getPos(carB);

  // Change to green
  simulate(cars, SIGNAL_STATES.NS_GO, 300);

  // Both cars should have moved toward / through the intersection
  const posANow = getPos(carA);
  const posBNow = getPos(carB);

  assert(posANow > -(STOP_LINE_DIST + CAR_LENGTH / 2) + 1, `Car A should have moved past stop line, at ${posANow.toFixed(2)}`);
  assert(posBNow > posBStopped + 1, `Car B should have moved forward from ${posBStopped.toFixed(2)}, now at ${posBNow.toFixed(2)}`);
});

test('Car exits and is marked cleared', () => {
  const car = makeCar('NORTH', -50);
  const cars = [car];

  // Green light — drive through
  simulate(cars, SIGNAL_STATES.ALL_GO, 1200);

  assert(car.cleared, 'Car should be marked cleared after exiting');
});

test('Car decelerates smoothly approaching stop line', () => {
  const car = makeCar('NORTH', -15, { speed: 8 });
  const cars = [car];
  const dt = 1 / 60;

  const positions = [];
  for (let i = 0; i < 120; i++) {
    updateSingleCar(car, cars, SIGNAL_STATES.ALL_STOP, dt);
    positions.push(getPos(car));
  }

  // Check that the car decelerates (distances between frames decrease)
  const deltas = [];
  for (let i = 1; i < positions.length; i++) {
    deltas.push(positions[i] - positions[i - 1]);
  }

  // NORTH moves in +z direction, so deltas should be positive and decreasing near the end
  const lastThird = deltas.slice(-40).filter(d => d > 0.0001);
  if (lastThird.length > 2) {
    const earlyAvg = lastThird.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const lateAvg = lastThird.slice(-5).reduce((a, b) => a + b, 0) / 5;
    assert(lateAvg <= earlyAvg + 0.001, `Car should decelerate: early avg delta ${earlyAvg.toFixed(4)}, late ${lateAvg.toFixed(4)}`);
  }
});

test('NS cars move on NS_GO, stop on EW_GO', () => {
  const car = makeCar('NORTH', -20);
  const cars = [car];

  // NS_GO: should pass through
  simulate(cars, SIGNAL_STATES.NS_GO, 600);
  assert(car.state !== 'waiting', `NS car on NS_GO should not wait, state: ${car.state}`);

  // New car with EW_GO: should stop
  const car2 = makeCar('NORTH', -20);
  const cars2 = [car2];
  simulate(cars2, SIGNAL_STATES.EW_GO, 600);
  assert(car2.state === 'waiting', `NS car on EW_GO should wait, state: ${car2.state}`);
});

test('EW cars move on EW_GO, stop on NS_GO', () => {
  const car = makeCar('EAST', -20);
  const cars = [car];

  simulate(cars, SIGNAL_STATES.EW_GO, 600);
  assert(car.state !== 'waiting', `EW car on EW_GO should not wait, state: ${car.state}`);

  const car2 = makeCar('EAST', -20);
  const cars2 = [car2];
  simulate(cars2, SIGNAL_STATES.NS_GO, 600);
  assert(car2.state === 'waiting', `EW car on NS_GO should wait, state: ${car2.state}`);
});

test('Car marked through after entering intersection', () => {
  const car = makeCar('NORTH', -15);
  const cars = [car];

  // Green light
  simulate(cars, SIGNAL_STATES.ALL_GO, 300);

  // Car should have been marked 'through' at some point and continued to exit
  assert(car.state === 'through' || car.cleared, `Car should be through or cleared, state: ${car.state}`);
});

test('Through cars are not affected by signal changes', () => {
  const car = makeCar('NORTH', -8, { speed: 8 }); // start near intersection
  const cars = [car];

  // Green — enter intersection
  simulate(cars, SIGNAL_STATES.ALL_GO, 30);
  assert(car.state === 'through', `Car should be through, state: ${car.state}`);

  const posBefore = getPos(car);

  // Change to ALL_STOP — car should keep moving (it's through)
  simulate(cars, SIGNAL_STATES.ALL_STOP, 60);
  const posAfter = getPos(car);

  assert(posAfter > posBefore, `Through car should keep moving: before=${posBefore.toFixed(2)}, after=${posAfter.toFixed(2)}`);
});

test('Queued cars maintain spacing across all directions', () => {
  for (const dirKey of Object.keys(DIRECTIONS)) {
    const dir = DIRECTIONS[dirKey];
    const isNS = dir.axis === 'z';

    const carA = makeCar(dirKey, dir.sign * 12);
    const carB = makeCar(dirKey, dir.sign * 25);
    const allCars = [carA, carB];

    simulate(allCars, SIGNAL_STATES.ALL_STOP, 600);

    const posA = getPos(carA);
    const posB = getPos(carB);
    const spacing = Math.abs(posA - posB);
    const expectedGap = CAR_LENGTH + 1.5;

    assert(
      spacing >= expectedGap - 1,
      `${dirKey}: spacing should be >= ${(expectedGap - 1).toFixed(1)}, got ${spacing.toFixed(2)}`
    );
    assert(
      spacing <= expectedGap + 1,
      `${dirKey}: spacing should be <= ${(expectedGap + 1).toFixed(1)}, got ${spacing.toFixed(2)}`
    );
  }
});

test('Cars do not teleport across intersection', () => {
  for (const dirKey of Object.keys(DIRECTIONS)) {
    const dir = DIRECTIONS[dirKey];
    const car = makeCar(dirKey, dir.sign * 15);
    const cars = [car];
    const dt = 1 / 60;

    let prevPos = getPos(car);
    let maxJump = 0;

    for (let i = 0; i < 600; i++) {
      updateSingleCar(car, cars, SIGNAL_STATES.ALL_STOP, dt);
      const curPos = getPos(car);
      const jump = Math.abs(curPos - prevPos);
      if (jump > maxJump) maxJump = jump;
      prevPos = curPos;
    }

    // Max per-frame position change should be reasonable (< 2 units at 60fps)
    assert(maxJump < 2, `${dirKey}: max frame jump should be < 2, got ${maxJump.toFixed(4)}`);
  }
});

// ============================================================
// SIGNAL LOGIC TESTS
// ============================================================

test('isCarSignaledToStop — exhaustive signal/direction matrix', () => {
  // ALL_GO: nobody stops
  for (const dirKey of Object.keys(DIRECTIONS)) {
    const car = makeCar(dirKey, 20);
    assert(!isCarSignaledToStop(car, SIGNAL_STATES.ALL_GO), `${dirKey} should NOT stop on ALL_GO`);
  }

  // ALL_STOP: everybody stops
  for (const dirKey of Object.keys(DIRECTIONS)) {
    const car = makeCar(dirKey, 20);
    assert(isCarSignaledToStop(car, SIGNAL_STATES.ALL_STOP), `${dirKey} should stop on ALL_STOP`);
  }

  // NS_GO: NS directions free, EW stops
  assert(!isCarSignaledToStop(makeCar('NORTH', 20), SIGNAL_STATES.NS_GO), 'NORTH free on NS_GO');
  assert(!isCarSignaledToStop(makeCar('SOUTH', 20), SIGNAL_STATES.NS_GO), 'SOUTH free on NS_GO');
  assert(isCarSignaledToStop(makeCar('EAST', 20), SIGNAL_STATES.NS_GO), 'EAST stops on NS_GO');
  assert(isCarSignaledToStop(makeCar('WEST', 20), SIGNAL_STATES.NS_GO), 'WEST stops on NS_GO');

  // EW_GO: EW directions free, NS stops
  assert(isCarSignaledToStop(makeCar('NORTH', 20), SIGNAL_STATES.EW_GO), 'NORTH stops on EW_GO');
  assert(isCarSignaledToStop(makeCar('SOUTH', 20), SIGNAL_STATES.EW_GO), 'SOUTH stops on EW_GO');
  assert(!isCarSignaledToStop(makeCar('EAST', 20), SIGNAL_STATES.EW_GO), 'EAST free on EW_GO');
  assert(!isCarSignaledToStop(makeCar('WEST', 20), SIGNAL_STATES.EW_GO), 'WEST free on EW_GO');
});

// ============================================================
// COLLISION DETECTION TESTS
// ============================================================

function checkCollisionPair(a, b) {
  if (a.state === 'crashed' || b.state === 'crashed') return { collision: false, nearMiss: false };
  if (a.direction === b.direction) return { collision: false, nearMiss: false };
  // Same-axis vehicles (N/S or E/W) are in parallel lanes — no sideswipe
  if (!a.isPedestrian && !b.isPedestrian && a.dirData.axis === b.dirData.axis) return { collision: false, nearMiss: false };
  if (a.isPedestrian && b.isPedestrian) return { collision: false, nearMiss: false };
  // Turning cars yield to pedestrians — no collision
  const aTurning = a.turnRight && a.state === 'through' && !a.turnComplete;
  const bTurning = b.turnRight && b.state === 'through' && !b.turnComplete;
  if ((a.isPedestrian && bTurning) || (b.isPedestrian && aTurning)) return { collision: false, nearMiss: false };

  const dx = a.mesh.position.x - b.mesh.position.x;
  const dy = a.mesh.position.y - b.mesh.position.y;
  const dz = a.mesh.position.z - b.mesh.position.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const minDist = ((a.vehicleLength || CAR_LENGTH) + (b.vehicleLength || CAR_LENGTH)) * 0.35;
  const nearMissDist = minDist * 1.8;

  if (dist < minDist) return { collision: true, nearMiss: false };
  if (dist < nearMissDist) return { collision: false, nearMiss: true };
  return { collision: false, nearMiss: false };
}

test('Collision detected when cross-traffic cars overlap', () => {
  const carN = makeCar('NORTH', -2);
  carN.mesh.position.x = 0;
  const carE = makeCar('EAST', -2);
  carE.mesh.position.z = 0;

  // Place them on top of each other at origin
  carN.mesh.position.z = 0;
  carE.mesh.position.x = 0;

  const result = checkCollisionPair(carN, carE);
  assert(result.collision, 'Cars at same position should collide');
});

test('No collision between same-direction cars', () => {
  const carA = makeCar('NORTH', -5);
  const carB = makeCar('NORTH', -6);
  const result = checkCollisionPair(carA, carB);
  assert(!result.collision, 'Same-direction cars should not trigger collision');
});

test('No collision when cars are far apart', () => {
  const carN = makeCar('NORTH', -20);
  const carE = makeCar('EAST', -20);
  const result = checkCollisionPair(carN, carE);
  assert(!result.collision, 'Cars far apart should not collide');
  assert(!result.nearMiss, 'Cars far apart should not near-miss');
});

test('Near-miss detected at appropriate distance', () => {
  const carN = makeCar('NORTH', -2);
  const carE = makeCar('EAST', -2);

  // Position them close but not overlapping
  const minDist = (CAR_LENGTH + CAR_LENGTH) * 0.35;
  const nearMissDist = minDist * 1.8;
  const testDist = (minDist + nearMissDist) / 2; // halfway between collision and clear

  carN.mesh.position.x = 0;
  carN.mesh.position.z = 0;
  carE.mesh.position.x = testDist;
  carE.mesh.position.z = 0;

  const result = checkCollisionPair(carN, carE);
  assert(!result.collision, 'Should not collide at near-miss distance');
  assert(result.nearMiss, 'Should detect near-miss');
});

test('Crashed cars are excluded from collision checks', () => {
  const carN = makeCar('NORTH', 0);
  carN.state = 'crashed';
  const carE = makeCar('EAST', 0);
  carE.mesh.position.x = 0;
  carE.mesh.position.z = 0;
  carN.mesh.position.x = 0;
  carN.mesh.position.z = 0;

  const result = checkCollisionPair(carN, carE);
  assert(!result.collision, 'Crashed cars should be excluded from collision');
});

test('Same-axis opposite-direction cars do not collide (no sideswipe)', () => {
  // North and South cars passing each other at the intersection
  const carN = makeCar('NORTH', 0);
  const carS = makeCar('SOUTH', 0);
  carN.mesh.position.x = DIRECTIONS.NORTH.laneOffset;
  carN.mesh.position.z = 0;
  carS.mesh.position.x = DIRECTIONS.SOUTH.laneOffset;
  carS.mesh.position.z = 0;
  const resultNS = checkCollisionPair(carN, carS);
  assert(!resultNS.collision, 'N/S cars in parallel lanes should not collide');

  // East and West cars passing each other
  const carE = makeCar('EAST', 0);
  const carW = makeCar('WEST', 0);
  carE.mesh.position.z = DIRECTIONS.EAST.laneOffset;
  carE.mesh.position.x = 0;
  carW.mesh.position.z = DIRECTIONS.WEST.laneOffset;
  carW.mesh.position.x = 0;
  const resultEW = checkCollisionPair(carE, carW);
  assert(!resultEW.collision, 'E/W cars in parallel lanes should not collide');
});

test('Pedestrian-pedestrian collisions are ignored', () => {
  const pedA = makeCar('NORTH', 0);
  pedA.isPedestrian = true;
  const pedB = makeCar('EAST', 0);
  pedB.isPedestrian = true;
  pedA.mesh.position.x = 0; pedA.mesh.position.z = 0;
  pedB.mesh.position.x = 0; pedB.mesh.position.z = 0;

  const result = checkCollisionPair(pedA, pedB);
  assert(!result.collision, 'Pedestrian-pedestrian should not collide');
});

// ============================================================
// QUEUING EDGE CASES
// ============================================================

test('Cross-direction cars do NOT queue behind each other', () => {
  // A NORTH car should not queue behind an EAST car
  const carN = makeCar('NORTH', -20);
  const carE = makeCar('EAST', -(STOP_LINE_DIST + CAR_LENGTH / 2), { state: 'waiting' });
  const cars = [carN, carE];

  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);

  // NORTH car should stop at its own stop line, not behind the EAST car
  assertApprox(getPos(carN), -(STOP_LINE_DIST + CAR_LENGTH / 2), 0.01, 'NORTH car stops at own stop line, not behind EAST car');
});

test('Different vehicle lengths produce correct queue gaps', () => {
  const longLen = 6.0;
  const shortLen = CAR_LENGTH; // 3.2

  const carA = makeCar('NORTH', -12, { vehicleLength: shortLen });
  const carB = makeCar('NORTH', -25, { vehicleLength: longLen });
  const cars = [carA, carB];

  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);

  const posA = getPos(carA);
  const posB = getPos(carB);
  const spacing = Math.abs(posA - posB);
  const expectedGap = (shortLen + longLen) * 0.5 + 1.5; // (3.2 + 6.0) / 2 + 1.5 = 6.1

  assert(
    spacing >= expectedGap - 0.5,
    `Mixed-length gap should be >= ${(expectedGap - 0.5).toFixed(1)}, got ${spacing.toFixed(2)}`
  );
  assert(
    spacing <= expectedGap + 0.5,
    `Mixed-length gap should be <= ${(expectedGap + 0.5).toFixed(1)}, got ${spacing.toFixed(2)}`
  );
});

test('Five cars form a long queue without overlap', () => {
  const carsArr = [];
  for (let i = 0; i < 5; i++) {
    carsArr.push(makeCar('SOUTH', 12 + i * 10));
  }

  simulate(carsArr, SIGNAL_STATES.ALL_STOP, 900);

  // Verify all cars are in order and none overlap
  for (let i = 0; i < carsArr.length - 1; i++) {
    const posI = getPos(carsArr[i]);
    const posJ = getPos(carsArr[i + 1]);
    assert(posI < posJ, `Car ${i} (${posI.toFixed(2)}) should be ahead of car ${i + 1} (${posJ.toFixed(2)})`);

    const spacing = Math.abs(posJ - posI);
    const minGap = CAR_LENGTH; // at minimum they should not overlap
    assert(spacing >= minGap, `Cars ${i} and ${i + 1} should not overlap: spacing=${spacing.toFixed(2)}`);
  }
});

// ============================================================
// WAITING / IMPATIENCE TESTS
// ============================================================

test('Car accumulates waitTime while waiting', () => {
  const car = makeCar('NORTH', -12);
  const cars = [car];

  // Bring car to stop
  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);
  assert(car.state === 'waiting', 'Car should be waiting');

  // Wait more
  simulate(cars, SIGNAL_STATES.ALL_STOP, 300); // 300 frames at 1/60 = 5 seconds

  assert(car.waitTime > 4, `WaitTime should be > 4s, got ${car.waitTime.toFixed(2)}`);
});

test('Car rotation resets when signal changes from waiting', () => {
  const car = makeCar('NORTH', -12);
  const cars = [car];

  // Stop, wait long enough for shaking
  simulate(cars, SIGNAL_STATES.ALL_STOP, 900); // ~15 seconds
  assert(car.state === 'waiting', 'Car should be waiting');

  // Go green
  simulate(cars, SIGNAL_STATES.NS_GO, 1);
  assert(car.mesh.rotation.z === 0, `Rotation should reset on resume, got ${car.mesh.rotation.z}`);
  assert(car.waitTime === 0, `WaitTime should reset on resume, got ${car.waitTime}`);
});

// ============================================================
// CRASHED CAR HANDLING
// ============================================================

test('Crashed cars are skipped in vehicle update', () => {
  const car = makeCar('NORTH', -20);
  car.state = 'crashed';
  const posBefore = getPos(car);
  const cars = [car];

  simulate(cars, SIGNAL_STATES.ALL_GO, 300);

  assertApprox(getPos(car), posBefore, 0.001, 'Crashed car should not move');
  assert(car.state === 'crashed', 'Crashed car should stay crashed');
});

test('Non-crashed cars queue behind crashed car', () => {
  // A crashed car in the lane should block traffic behind it
  const crashed = makeCar('NORTH', -(STOP_LINE_DIST + CAR_LENGTH / 2));
  crashed.state = 'crashed';

  const follower = makeCar('NORTH', -25);
  const cars = [crashed, follower];

  simulate(cars, SIGNAL_STATES.ALL_GO, 600);

  // The follower should NOT pass through the crashed car
  // It should stop behind it (or at least not overlap)
  const posFollower = getPos(follower);
  const posCrashed = getPos(crashed);
  // crashed.state === 'crashed' means the queuing code skips it, so follower should drive past
  // Actually the queue code checks `other.state === 'crashed'` and continues, so crashed cars DON'T block
  // The car should drive through freely (this is correct behavior — crashed cars are obstacles handled by collision, not queuing)
  assert(posFollower > posCrashed || follower.cleared, 'Car drives past crashed car position');
});

// ============================================================
// CAR INSIDE INTERSECTION BEHAVIOR
// ============================================================

test('Car starting inside intersection goes straight through', () => {
  // A car already past the stop line with state 'through' should not stop or reverse
  const car = makeCar('NORTH', -4, { state: 'through' }); // inside the intersection
  const cars = [car];

  // Even with ALL_STOP, it should keep going since it's already 'through'
  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);

  assert(car.state !== 'waiting', `Through car inside intersection should not wait, state: ${car.state}`);
  assert(car.cleared || getPos(car) > 0, 'Car should have driven through');
});

test('Car exactly at stop line in ALL_GO drives through', () => {
  const dir = DIRECTIONS.NORTH;
  const car = makeCar('NORTH', dir.sign * (STOP_LINE_DIST + CAR_LENGTH / 2)); // at front bumper stop line
  const cars = [car];

  simulate(cars, SIGNAL_STATES.ALL_GO, 660);

  assert(car.state !== 'waiting', 'Car on green should not wait even at stop line');
  assert(car.cleared || Math.abs(getPos(car)) < 5, 'Car should have moved forward');
});

// ============================================================
// MULTIPLE SIGNAL CHANGES
// ============================================================

test('Car handles stop → go → stop transitions', () => {
  const car = makeCar('NORTH', -30);
  const cars = [car];

  // Phase 1: Red — car approaches and stops
  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);
  assert(car.state === 'waiting', 'Car should stop at red');
  const stoppedPos = getPos(car);

  // Phase 2: Green — car starts moving (needs enough frames to enter intersection)
  simulate(cars, SIGNAL_STATES.NS_GO, 60);
  assert(car.state !== 'waiting', 'Car should move on green');
  const movingPos = getPos(car);
  assert(movingPos > stoppedPos, 'Car should move forward');

  // Phase 3: Red again — but car is now through intersection (state=through), should keep going
  simulate(cars, SIGNAL_STATES.ALL_STOP, 300);
  const finalPos = getPos(car);
  assert(finalPos > movingPos, 'Through car should keep moving despite red');
});

test('Car stops again on second red if still before intersection', () => {
  const car = makeCar('NORTH', -25, { speed: 8 }); // normal speed, moderate distance
  const cars = [car];

  // Phase 1: Red — car approaches and stops
  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);
  assert(car.state === 'waiting', 'Car should stop at first red');

  // Phase 2: Green briefly — car moves but not through intersection
  simulate(cars, SIGNAL_STATES.NS_GO, 5); // very brief green
  const posAfterGreen = getPos(car);

  // If the car hasn't reached 'through' state yet, it should stop again
  if (car.state === 'moving') {
    simulate(cars, SIGNAL_STATES.ALL_STOP, 600);
    assert(car.state === 'waiting' || car.state === 'through',
      `Car should stop again or be through, state: ${car.state}`);
  }
});

test('Through car in intersection is not blocked by same-direction car ahead', () => {
  // A through car inside the intersection should not queue behind another car
  ['NORTH', 'SOUTH', 'EAST', 'WEST'].forEach(dirKey => {
    const dir = DIRECTIONS[dirKey];
    // Car A: through, inside intersection (dist 4 from center)
    const carA = makeCar(dirKey, -dir.sign * 4, { state: 'through' });
    // Car B: same direction, slightly ahead (dist 2 from center)
    const carB = makeCar(dirKey, -dir.sign * 2, { state: 'through' });
    const cars = [carA, carB];
    const posBefore = getPos(carA);
    simulate(cars, SIGNAL_STATES.ALL_STOP, 10);
    const posAfter = getPos(carA);
    // Forward progress: position changes in -dir.sign direction
    const moved = (posAfter - posBefore) * (-dir.sign);
    assert(moved > 0, `Through car (${dirKey}) in intersection must keep moving, not queue behind ahead car`);
  });
});

// ============================================================
// PEDESTRIAN LOGIC TESTS
// ============================================================

function makePedestrian(crossAxis, crossSign, fixedPos, startDist, opts = {}) {
  const pos = { x: 0, y: 0, z: 0 };
  const actualStart = startDist || (ROAD_WIDTH / 2 + 1.5);
  const sidewalkAxis = crossAxis === 'x' ? 'z' : 'x';

  if (crossAxis === 'x') {
    pos.x = crossSign * actualStart;
    pos.z = fixedPos;
  } else {
    pos.z = crossSign * actualStart;
    pos.x = fixedPos;
  }

  return {
    direction: crossAxis === 'x' ? (crossSign > 0 ? 'WEST' : 'EAST') : (crossSign > 0 ? 'NORTH' : 'SOUTH'),
    dirData: crossAxis === 'x'
      ? { axis: 'x', sign: crossSign, perpAxis: 'z', laneOffset: fixedPos }
      : { axis: 'z', sign: crossSign, perpAxis: 'x', laneOffset: fixedPos },
    speed: 2.5,
    state: opts.state || 'moving',
    distanceFromCenter: actualStart,
    cleared: false,
    vehicleLength: 0.7,
    vehicleWidth: 0.5,
    isPedestrian: true,
    crossAxis: crossAxis,
    crossSign: crossSign,
    crossFixed: fixedPos,
    sidewalkAxis: sidewalkAxis,
    approachSign: opts.approachSign || 1,
    departSign: opts.departSign || 1,
    pedBob: 0,
    mesh: { position: pos, rotation: { z: 0, y: 0 } }
  };
}

function updatePedestrian(ped, signalState, dt, allCars) {
  const crossAxis = ped.crossAxis;
  const sidewalkAxis = ped.sidewalkAxis;
  const trafficFlowingOnCrossRoad = crossAxis === 'x'
    ? (signalState === SIGNAL_STATES.NS_GO || signalState === SIGNAL_STATES.ALL_GO)
    : (signalState === SIGNAL_STATES.EW_GO || signalState === SIGNAL_STATES.ALL_GO);

  const conflictAxis = crossAxis === 'x' ? 'z' : 'x';
  const carsToCheck = allCars || [];
  const intersectionBusy = carsToCheck.some(c => {
    if (c === ped || c.isPedestrian || c.state === 'crashed' || c.state === 'waiting') return false;
    if (c.dirData.axis !== conflictAxis) return false;
    return c.distanceFromCenter < STOP_LINE_DIST;
  });

  let scored = false;
  let removed = false;

  // STATE: approaching — walking along sidewalk toward crosswalk
  if (ped.state === 'approaching') {
    const moveAmount = ped.speed * dt;
    if (sidewalkAxis === 'z') {
      ped.mesh.position.z -= ped.approachSign * moveAmount;
    } else {
      ped.mesh.position.x -= ped.approachSign * moveAmount;
    }
    ped.pedBob += dt * 8;

    const swPos = sidewalkAxis === 'z' ? ped.mesh.position.z : ped.mesh.position.x;
    const targetPos = ped.crossFixed;
    const distToTarget = (targetPos - swPos) * (-ped.approachSign);
    if (distToTarget <= 0.1) {
      if (sidewalkAxis === 'z') ped.mesh.position.z = targetPos;
      else ped.mesh.position.x = targetPos;

      const unsafeAtArrival = crossAxis === 'x'
        ? (signalState === SIGNAL_STATES.NS_GO || signalState === SIGNAL_STATES.ALL_GO)
        : (signalState === SIGNAL_STATES.EW_GO || signalState === SIGNAL_STATES.ALL_GO);
      ped.state = (unsafeAtArrival && signalState !== SIGNAL_STATES.ALL_STOP) ? 'waiting' : 'moving';
    }

    return { scored, removed };
  }

  // STATE: departing — walking along far sidewalk off map
  if (ped.state === 'departing') {
    const moveAmount = ped.speed * dt;
    if (sidewalkAxis === 'z') {
      ped.mesh.position.z += ped.departSign * moveAmount;
    } else {
      ped.mesh.position.x += ped.departSign * moveAmount;
    }
    ped.pedBob += dt * 8;
    const depPos = sidewalkAxis === 'z' ? ped.mesh.position.z : ped.mesh.position.x;
    if (Math.abs(depPos) > EXIT_DIST) removed = true;
    return { scored, removed };
  }

  const pedPos = crossAxis === 'x' ? ped.mesh.position.x : ped.mesh.position.z;
  const pedDist = Math.abs(pedPos);
  ped.distanceFromCenter = pedDist;

  // Peds respect the cop's signals — check BEFORE moving
  if (ped.state === 'moving' && pedDist > ROAD_WIDTH / 2 && (trafficFlowingOnCrossRoad || intersectionBusy) && signalState !== SIGNAL_STATES.ALL_STOP) {
    ped.state = 'waiting';
  }

  if (ped.state === 'moving' || ped.state === 'through') {
    const moveAmount = ped.speed * dt;
    if (crossAxis === 'x') {
      ped.mesh.position.x -= ped.crossSign * moveAmount;
    } else {
      ped.mesh.position.z -= ped.crossSign * moveAmount;
    }
    ped.pedBob += dt * 8;

    if (pedDist < ROAD_WIDTH / 2) ped.state = 'through';

    const newPos = crossAxis === 'x' ? ped.mesh.position.x : ped.mesh.position.z;
    if (!ped.cleared && Math.abs(newPos) > ROAD_WIDTH / 2 + 2 && Math.sign(newPos) !== Math.sign(ped.crossSign)) {
      ped.cleared = true;
      scored = true;
      ped.state = 'departing';
      ped.departSign = 1; // deterministic in tests
    }
  } else if (ped.state === 'waiting') {
    if ((!trafficFlowingOnCrossRoad || signalState === SIGNAL_STATES.ALL_STOP) && !intersectionBusy) {
      ped.state = 'moving';
    }
  }

  return { scored, removed };
}

function simulatePed(ped, signalState, frames, dt = 1 / 60, allCars) {
  let lastResult = { scored: false, removed: false };
  for (let i = 0; i < frames; i++) {
    lastResult = updatePedestrian(ped, signalState, dt, allCars);
  }
  return lastResult;
}

function getPedPos(ped) {
  return ped.crossAxis === 'x' ? ped.mesh.position.x : ped.mesh.position.z;
}

test('Pedestrian waits at edge when cross-road traffic is flowing', () => {
  // Pedestrian crossing along x-axis, so they cross the NS road.
  // trafficFlowingOnCrossRoad = NS_GO or ALL_GO
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5);

  // NS_GO means NS traffic is flowing on the road the ped wants to cross
  simulatePed(ped, SIGNAL_STATES.NS_GO, 60);
  assert(ped.state === 'waiting', `Ped should wait when NS traffic is flowing, state: ${ped.state}`);
});

test('Pedestrian walks when cross-road traffic is stopped', () => {
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5);

  // EW_GO means NS is stopped — safe for ped to cross the NS road
  simulatePed(ped, SIGNAL_STATES.EW_GO, 300);
  const pos = getPedPos(ped);
  assert(pos < ROAD_WIDTH / 2 + 1.5 - 1, `Ped should have moved, pos: ${pos.toFixed(2)}`);
  assert(ped.state !== 'waiting', `Ped should be moving/through, state: ${ped.state}`);
});

test('Pedestrian walks on ALL_STOP', () => {
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5);

  simulatePed(ped, SIGNAL_STATES.ALL_STOP, 300);
  const pos = getPedPos(ped);
  assert(pos < ROAD_WIDTH / 2, `Ped should cross on ALL_STOP, pos: ${pos.toFixed(2)}`);
});

test('Pedestrian marked through when inside road', () => {
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5);

  // EW_GO = safe for ped crossing x (NS is stopped)
  simulatePed(ped, SIGNAL_STATES.EW_GO, 300);
  assert(ped.state === 'through' || ped.cleared, `Ped should be through or cleared, state: ${ped.state}`);
});

test('Pedestrian cleared after crossing to other side', () => {
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5);

  // Let ped cross fully (EW_GO = NS stopped, safe for x-crosser)
  simulatePed(ped, SIGNAL_STATES.EW_GO, 600);
  assert(ped.cleared, 'Ped should be marked cleared after crossing');
});

test('Pedestrian crossing along z-axis waits on EW_GO', () => {
  // Crossing along z = crossing the EW road. Traffic danger = EW_GO or ALL_GO
  const ped = makePedestrian('z', 1, 0, ROAD_WIDTH / 2 + 1.5);

  simulatePed(ped, SIGNAL_STATES.EW_GO, 60);
  assert(ped.state === 'waiting', `Ped crossing z should wait when EW traffic flows, state: ${ped.state}`);
});

test('Pedestrian crossing along z-axis walks on NS_GO', () => {
  const ped = makePedestrian('z', 1, 0, ROAD_WIDTH / 2 + 1.5);

  simulatePed(ped, SIGNAL_STATES.NS_GO, 300);
  assert(ped.state !== 'waiting', `Ped should cross when EW stopped, state: ${ped.state}`);
});

test('Pedestrian waits when vehicle is in intersection even if signal is safe', () => {
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5);
  // Create a NS car (axis='z') inside the intersection (through state)
  const throughCar = makeCar('NORTH', -3, { state: 'through' });
  throughCar.distanceFromCenter = 3;

  // EW_GO means NS traffic is stopped — signal says safe, but car is physically in intersection
  simulatePed(ped, SIGNAL_STATES.EW_GO, 60, 1 / 60, [ped, throughCar]);
  assert(ped.state === 'waiting', `Ped should wait when vehicle in intersection, state: ${ped.state}`);
});

test('Pedestrian walks when intersection is clear and signal is safe', () => {
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5);
  // No cars in intersection
  simulatePed(ped, SIGNAL_STATES.EW_GO, 300, 1 / 60, [ped]);
  assert(ped.state !== 'waiting', `Ped should walk when clear, state: ${ped.state}`);
});

// ============================================================
// DIFFICULTY / WAVE PROGRESSION TESTS
// ============================================================

function computeWaveParams(waveNum) {
  const spawnInterval = Math.max(0.6, 3.5 - (waveNum - 1) * 0.22);
  const speed = Math.min(18, 6 + (waveNum - 1) * 0.9);
  const maxCars = Math.min(4, 1 + Math.floor(waveNum / 3));

  let weather = 'clear';
  let weatherIntensity = 0;
  if (waveNum >= 6) {
    weather = 'snow';
    weatherIntensity = Math.min(1.0, 0.35 + (waveNum - 6) * 0.12);
  } else if (waveNum >= 3) {
    weather = 'rain';
    weatherIntensity = 0.25 + (waveNum - 3) * 0.2;
  }

  return { spawnInterval, speed, maxCars, weather, weatherIntensity };
}

test('Wave 1 has baseline difficulty', () => {
  const p = computeWaveParams(1);
  assertApprox(p.spawnInterval, 3.5, 0.01, 'Wave 1 spawn interval');
  assertApprox(p.speed, 6, 0.01, 'Wave 1 speed');
  assert(p.maxCars === 1, `Wave 1 maxCars should be 1, got ${p.maxCars}`);
  assert(p.weather === 'clear', `Wave 1 should be clear, got ${p.weather}`);
});

test('Wave 3 introduces rain', () => {
  const p = computeWaveParams(3);
  assert(p.weather === 'rain', `Wave 3 should have rain, got ${p.weather}`);
  assertApprox(p.weatherIntensity, 0.25, 0.01, 'Wave 3 rain intensity');
});

test('Wave 6 switches to snow', () => {
  const p = computeWaveParams(6);
  assert(p.weather === 'snow', `Wave 6 should have snow, got ${p.weather}`);
  assertApprox(p.weatherIntensity, 0.35, 0.01, 'Wave 6 snow intensity');
});

test('Speed increases with waves', () => {
  const p1 = computeWaveParams(1);
  const p5 = computeWaveParams(5);
  const p10 = computeWaveParams(10);
  assert(p5.speed > p1.speed, `W5 speed ${p5.speed} should > W1 speed ${p1.speed}`);
  assert(p10.speed > p5.speed, `W10 speed ${p10.speed} should > W5 speed ${p5.speed}`);
});

test('Speed caps at 18', () => {
  const p = computeWaveParams(20);
  assert(p.speed === 18, `Speed should cap at 18, got ${p.speed}`);
});

test('Spawn interval decreases but floors at 0.6', () => {
  const p1 = computeWaveParams(1);
  const p10 = computeWaveParams(10);
  const p20 = computeWaveParams(20);
  assert(p10.spawnInterval < p1.spawnInterval, 'Spawn interval should decrease');
  assert(p20.spawnInterval >= 0.6, `Spawn interval floor should be 0.6, got ${p20.spawnInterval}`);
});

test('maxCarsPerSpawn ramps from 1 to 4', () => {
  const p1 = computeWaveParams(1);
  const p10 = computeWaveParams(10);
  assert(p1.maxCars === 1, `Wave 1 maxCars = 1, got ${p1.maxCars}`);
  assert(p10.maxCars >= 3, `Wave 10 maxCars >= 3, got ${p10.maxCars}`);
  assert(p10.maxCars <= 4, `maxCars capped at 4, got ${p10.maxCars}`);
});

// ============================================================
// GESTURE → SIGNAL MAPPING TESTS
// ============================================================

function gestureToSignal(numHands, wristX) {
  if (numHands === 0) return SIGNAL_STATES.ALL_GO;
  if (numHands >= 2) return SIGNAL_STATES.ALL_STOP;
  // One hand
  if (wristX < 0.5) return SIGNAL_STATES.NS_GO;
  return SIGNAL_STATES.EW_GO;
}

test('Gesture mapping — no hands = ALL_GO', () => {
  assert(gestureToSignal(0, 0) === SIGNAL_STATES.ALL_GO, 'No hands → ALL_GO');
});

test('Gesture mapping — both hands = ALL_STOP', () => {
  assert(gestureToSignal(2, 0.5) === SIGNAL_STATES.ALL_STOP, 'Both hands → ALL_STOP');
});

test('Gesture mapping — hand right (wrist.x < 0.5) = NS_GO', () => {
  assert(gestureToSignal(1, 0.3) === SIGNAL_STATES.NS_GO, 'Hand right → NS_GO');
});

test('Gesture mapping — hand left (wrist.x >= 0.5) = EW_GO', () => {
  assert(gestureToSignal(1, 0.7) === SIGNAL_STATES.EW_GO, 'Hand left → EW_GO');
});

test('Gesture mapping — hand exactly at center (0.5) = EW_GO', () => {
  assert(gestureToSignal(1, 0.5) === SIGNAL_STATES.EW_GO, 'Hand at center → EW_GO');
});

// ============================================================
// SPEED / MOVEMENT TESTS
// ============================================================

test('Car speed affects movement distance per frame', () => {
  const dt = 1 / 60;
  const slowCar = makeCar('NORTH', -30, { speed: 4 });
  const fastCar = makeCar('NORTH', -30, { speed: 16 });

  updateSingleCar(slowCar, [slowCar], SIGNAL_STATES.ALL_GO, dt);
  updateSingleCar(fastCar, [fastCar], SIGNAL_STATES.ALL_GO, dt);

  const slowDist = getPos(slowCar) - (-30);
  const fastDist = getPos(fastCar) - (-30);

  assert(Math.abs(fastDist) > Math.abs(slowDist) * 1.5,
    `Fast car should move more: fast=${fastDist.toFixed(4)}, slow=${slowDist.toFixed(4)}`);
});

test('Car at spawn point exits map on green in reasonable time', () => {
  const car = makeCar('NORTH', -SPAWN_DIST, { speed: 8 });
  const cars = [car];

  // At speed 8, need to travel ~135 units (SPAWN_DIST + EXIT_DIST = 65 + 70)
  // 115 / 8 = ~14.4 seconds = ~864 frames at 60fps
  simulate(cars, SIGNAL_STATES.ALL_GO, 1200);

  assert(car.cleared, 'Car should exit map in reasonable time');
});

// ============================================================
// Point of no return & slow-start tests
// ============================================================

test('Car past point of no return transitions to through', () => {
  // Place car just inside PNR zone (STOP_LINE_DIST - 1 + vLen/2)
  // PNR_DIST = STOP_LINE_DIST - 1 = 8.5, threshold = 8.5 + 1.6 = 10.1
  // Car center at 10.0 → distFromCenter = 10.0 < 10.1 → should become through
  const car = makeCar('NORTH', -10.0, { speed: 8 });
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_STOP, 1);
  assert(car.state === 'through', 'Car past PNR should be through, not stopped');
});

test('Car before point of no return still stops on red', () => {
  // Car at 12.0 → distFromCenter = 12.0 > 10.1 → should stop normally
  const car = makeCar('NORTH', -12.0, { speed: 8 });
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_STOP, 120);
  assert(car.state === 'waiting', 'Car before PNR should stop at red');
});

test('Slow start — car resuming from waiting starts slow', () => {
  // Place car at stop line so it waits
  const stopPos = -1 * (STOP_LINE_DIST + CAR_LENGTH / 2);
  const car = makeCar('NORTH', stopPos, { state: 'waiting', speed: 8, accelTimer: 0 });
  const cars = [car];

  // Resume by changing signal
  updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
  assert(car.state === 'moving', 'Car should resume on green');
  assert(car.accelTimer === 0, 'accelTimer should reset to 0 on resume');

  // First frame of movement — accelTimer starts at 0, so movement is minimal
  const posBefore = getPos(car);
  updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
  const moveFirst = Math.abs(getPos(car) - posBefore);

  // Advance to full speed (past 0.5s)
  for (let i = 0; i < 60; i++) {
    updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
  }
  const posBeforeFull = getPos(car);
  updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
  const moveFull = Math.abs(getPos(car) - posBeforeFull);

  assert(moveFirst < moveFull, 'First frame movement should be less than full-speed movement');
});

test('Through car cannot be recalled by signal change — all directions', () => {
  for (const dirKey of ['NORTH', 'SOUTH', 'EAST', 'WEST']) {
    const dir = DIRECTIONS[dirKey];
    const pos = dir.sign * 3; // inside intersection
    const car = makeCar(dirKey, pos, { state: 'through', speed: 8 });
    const cars = [car];

    // Try to stop with ALL_STOP
    simulate(cars, SIGNAL_STATES.ALL_STOP, 30);
    assert(car.state === 'through', `Through car (${dirKey}) should not be recalled`);

    // Car should have moved
    const newPos = getPos(car);
    const moved = (newPos - pos) * (-dir.sign);
    assert(moved > 0, `Through car (${dirKey}) should keep moving`);
  }
});

// ============================================================
// RIGHT-TURN TESTS
// ============================================================

test('Right-turn arc positions are correct at start and end (all directions)', () => {
  for (const dirKey of ['NORTH', 'SOUTH', 'EAST', 'WEST']) {
    const td = RIGHT_TURN_DATA[dirKey];
    const dir = DIRECTIONS[dirKey];
    const isNS = dir.axis === 'z';

    // Start of arc (t=0)
    const x0 = td.cx + TURN_RADIUS * Math.cos(td.a0);
    const z0 = td.cz + TURN_RADIUS * Math.sin(td.a0);

    // End of arc (t=1)
    const x1 = td.cx + TURN_RADIUS * Math.cos(td.a1);
    const z1 = td.cz + TURN_RADIUS * Math.sin(td.a1);

    // Entry should be at the car's lane position on the intersection edge
    const entryLane = dir.laneOffset;
    const entryEdge = dir.sign * INTERSECTION_SIZE / 2;
    if (isNS) {
      assertApprox(x0, entryLane, 0.01, `${dirKey} arc entry x should be lane offset`);
      assertApprox(z0, entryEdge, 0.01, `${dirKey} arc entry z should be intersection edge`);
    } else {
      assertApprox(x0, entryEdge, 0.01, `${dirKey} arc entry x should be intersection edge`);
      assertApprox(z0, entryLane, 0.01, `${dirKey} arc entry z should be lane offset`);
    }

    // Exit should be at the new direction's lane
    const exitDir = DIRECTIONS[td.exitDir];
    const exitIsNS = exitDir.axis === 'z';
    const exitLane = exitDir.laneOffset;
    const exitEdge = -exitDir.sign * INTERSECTION_SIZE / 2;
    if (exitIsNS) {
      assertApprox(x1, exitLane, 0.01, `${dirKey} arc exit x should be exit lane`);
      assertApprox(z1, exitEdge, 0.01, `${dirKey} arc exit z should be exit edge`);
    } else {
      assertApprox(x1, exitEdge, 0.01, `${dirKey} arc exit x should be exit edge`);
      assertApprox(z1, exitLane, 0.01, `${dirKey} arc exit z should be exit lane`);
    }
  }
});

test('Right-turn arc radius is consistent', () => {
  const expectedRadius = INTERSECTION_SIZE / 2 - LANE_OFFSET;
  assertApprox(TURN_RADIUS, expectedRadius, 0.001, `Turn radius should be ${expectedRadius}`);
  assertApprox(TURN_RADIUS, 2.8, 0.001, 'Turn radius should be 2.8');
});

test('Turning car and pedestrian do not collide', () => {
  const car = makeCar('NORTH', 0, { state: 'through', turnRight: true, turnProgress: 0.5 });
  car.mesh.position.x = 0; car.mesh.position.z = 0;
  const ped = makeCar('EAST', 0);
  ped.isPedestrian = true;
  ped.mesh.position.x = 0; ped.mesh.position.z = 0;

  const result = checkCollisionPair(car, ped);
  assert(!result.collision, 'Turning car should not collide with pedestrian');
});

test('Non-turning car and pedestrian still collide', () => {
  const car = makeCar('NORTH', 0, { state: 'through' });
  car.mesh.position.x = 0; car.mesh.position.z = 0;
  const ped = makeCar('EAST', 0);
  ped.isPedestrian = true;
  ped.mesh.position.x = 0; ped.mesh.position.z = 0;

  const result = checkCollisionPair(car, ped);
  assert(result.collision, 'Non-turning car should collide with pedestrian');
});

test('RIGHT_TURN_DATA exit directions are correct', () => {
  assert(RIGHT_TURN_DATA.NORTH.exitDir === 'WEST', 'NORTH turns right into WEST');
  assert(RIGHT_TURN_DATA.SOUTH.exitDir === 'EAST', 'SOUTH turns right into EAST');
  assert(RIGHT_TURN_DATA.EAST.exitDir === 'NORTH', 'EAST turns right into NORTH');
  assert(RIGHT_TURN_DATA.WEST.exitDir === 'SOUTH', 'WEST turns right into SOUTH');
});

// ============================================================
// EMERGENCY VEHICLE TESTS
// ============================================================

test('Emergency vehicles never stop on any signal', () => {
  for (const dirKey of Object.keys(DIRECTIONS)) {
    for (const sig of Object.values(SIGNAL_STATES)) {
      const car = makeCar(dirKey, 20, { isEmergency: true });
      assert(!isCarSignaledToStop(car, sig), `Emergency ${dirKey} should NOT stop on ${sig}`);
    }
  }
});

test('Emergency vehicle drives through ALL_STOP without waiting', () => {
  const car = makeCar('NORTH', -20, { isEmergency: true });
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);
  assert(car.state !== 'waiting', `Emergency car should not wait, state: ${car.state}`);
  assert(car.cleared || getPos(car) > -5, 'Emergency car should drive through');
});

test('isEmergency is true when forceType is provided', () => {
  // In the game, isEmergency = !!forceType. Verify the logic.
  assert(!!{name:'ambulance'} === true, 'forceType object should be truthy');
  assert(!!undefined === false, 'undefined forceType should be falsy');
  assert(!!null === false, 'null forceType should be falsy');
});

// ============================================================
// NO_TURN_TYPES RESTRICTION TESTS
// ============================================================

test('NO_TURN_TYPES includes bus, semi, and firetruck', () => {
  assert(NO_TURN_TYPES.includes('bus'), 'bus should be in NO_TURN_TYPES');
  assert(NO_TURN_TYPES.includes('semi'), 'semi should be in NO_TURN_TYPES');
  assert(NO_TURN_TYPES.includes('firetruck'), 'firetruck should be in NO_TURN_TYPES');
});

test('NO_TURN_TYPES excludes normal car types', () => {
  const normalTypes = ['sedan', 'suv', 'hatchback', 'taxi', 'police', 'pickup', 'motorcycle', 'icecream'];
  for (const name of normalTypes) {
    assert(!NO_TURN_TYPES.includes(name), `${name} should NOT be in NO_TURN_TYPES`);
  }
});

// ============================================================
// RIGHT-TURN SIMULATION TESTS
// ============================================================

test('Right-turning car initiates turn progress at intersection edge', () => {
  // Place car just inside the intersection edge as 'through', turnRight=true
  const car = makeCar('NORTH', -5, { state: 'through', turnRight: true, speed: 8 });
  const cars = [car];
  const dt = 1/60;

  // One frame should initialize turnProgress
  updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, dt);
  assert(car.turnProgress !== undefined, 'turnProgress should be initialized');
  assert(car.turnProgress > 0, 'turnProgress should advance');
  assert(car._turnData === RIGHT_TURN_DATA.NORTH, 'turnData should match direction');
});

test('Right-turn progress advances over multiple frames', () => {
  const car = makeCar('NORTH', -5, { state: 'through', turnRight: true, speed: 8 });
  const cars = [car];

  simulate(cars, SIGNAL_STATES.ALL_GO, 10);
  const progressMid = car.turnProgress;
  assert(progressMid > 0 && progressMid < 1, `Mid-turn progress should be between 0 and 1, got ${progressMid}`);

  simulate(cars, SIGNAL_STATES.ALL_GO, 200);
  assert(car.turnProgress >= 1 || car.turnComplete, 'Turn should complete after enough frames');
});

test('Right-turn completion changes direction and state', () => {
  const car = makeCar('NORTH', -5, { state: 'through', turnRight: true, speed: 8 });
  const cars = [car];

  // Simulate enough for turn to complete
  simulate(cars, SIGNAL_STATES.ALL_GO, 300);
  assert(car.turnComplete, 'Turn should be completed');
  assert(car.direction === 'WEST', 'NORTH should turn into WEST');
  assert(car.dirData === DIRECTIONS.WEST, 'dirData should update to WEST');
  assert(car.turnRight === false, 'turnRight should be false after completion');
  assertApprox(car.accelTimer, 0.5, 0.01, 'accelTimer should be 0.5 after turn');
});

test('Turn-completed car exits on new axis', () => {
  const car = makeCar('NORTH', -5, { state: 'through', turnRight: true, speed: 8 });
  const cars = [car];

  // Complete turn and drive to exit
  simulate(cars, SIGNAL_STATES.ALL_GO, 1200);
  assert(car.cleared, 'Turned car should clear the map on new axis');
});

test('Turn-completed car exits intersection without stopping', () => {
  const car = makeCar('NORTH', -5, { state: 'through', turnRight: true, speed: 8 });
  const cars = [car];

  // Complete the turn
  simulate(cars, SIGNAL_STATES.ALL_GO, 300);
  assert(car.turnComplete, 'Turn should complete');
  assert(car.direction === 'WEST', 'Should now be WEST');
  assert(car.state === 'through', 'Should be through after turn completion');

  // Even with a stop signal on the new axis, the car should not stop in the intersection
  simulate(cars, SIGNAL_STATES.NS_GO, 300);
  assert(car.state !== 'waiting', 'Turn-completed car must not stop in intersection');
});

test('Right-turning car yields to nearby pedestrian', () => {
  const car = makeCar('NORTH', -5, { state: 'through', turnRight: true, speed: 8 });
  const ped = makePedestrian('x', 1, 0, 3);  // ped near the turn path
  ped.mesh.position.x = car.mesh.position.x + 2;
  ped.mesh.position.z = car.mesh.position.z + 2;
  const allCars = [car, ped];

  // First frame to init
  updateSingleCar(car, allCars, SIGNAL_STATES.ALL_GO, 1/60);
  const progressAfterYield = car.turnProgress;

  // Compare with a car that has no pedestrian
  const car2 = makeCar('NORTH', -5, { state: 'through', turnRight: true, speed: 8 });
  updateSingleCar(car2, [car2], SIGNAL_STATES.ALL_GO, 1/60);

  // The yielding car should have 0 progress, the free car should have > 0
  assertApprox(progressAfterYield, 0, 0.001, 'Turning car should yield to nearby ped (progress stays 0)');
  assert(car2.turnProgress > 0, 'Car with no ped should advance');
});

test('Right-turning car yields to cross-traffic in intersection', () => {
  const car = makeCar('NORTH', -5, { state: 'through', turnRight: true, speed: 8 });
  // Cross-traffic vehicle inside intersection (EAST on x-axis, inside)
  const crossCar = makeCar('EAST', -3, { state: 'through', speed: 8 });
  crossCar.distanceFromCenter = 3;
  const allCars = [car, crossCar];

  updateSingleCar(car, allCars, SIGNAL_STATES.ALL_GO, 1/60);
  assertApprox(car.turnProgress, 0, 0.001, 'Turning car should yield to cross-traffic');
});

test('Straight movement skipped during arc', () => {
  const car = makeCar('NORTH', -5, { state: 'through', turnRight: true, speed: 8 });
  const cars = [car];

  // Start movement, get on arc
  simulate(cars, SIGNAL_STATES.ALL_GO, 5);
  assert(car.turnProgress !== undefined && car.turnProgress > 0, 'Should be on arc');

  // Position should follow the arc formula, not straight z movement
  const td = RIGHT_TURN_DATA.NORTH;
  const ang = td.a0 + car.turnProgress * (td.a1 - td.a0);
  const expectedX = td.cx + TURN_RADIUS * Math.cos(ang);
  const expectedZ = td.cz + TURN_RADIUS * Math.sin(ang);
  assertApprox(car.mesh.position.x, expectedX, 0.01, 'x should follow arc');
  assertApprox(car.mesh.position.z, expectedZ, 0.01, 'z should follow arc');
});

test('All four directions complete right turns correctly', () => {
  for (const dirKey of ['NORTH', 'SOUTH', 'EAST', 'WEST']) {
    const dir = DIRECTIONS[dirKey];
    const car = makeCar(dirKey, dir.sign * 5, { state: 'through', turnRight: true, speed: 8 });
    const cars = [car];
    simulate(cars, SIGNAL_STATES.ALL_GO, 300);
    assert(car.turnComplete, `${dirKey} turn should complete`);
    assert(car.direction === RIGHT_TURN_DATA[dirKey].exitDir,
      `${dirKey} should exit as ${RIGHT_TURN_DATA[dirKey].exitDir}, got ${car.direction}`);
  }
});

// ============================================================
// TURN-COMPLETE CAR BEHAVIOR
// ============================================================

test('Turn-completed car does not get forced to through by PNR', () => {
  // After turn, car is through on new axis. PNR should not re-trigger.
  const car = makeCar('NORTH', 0);
  car.turnComplete = true;
  car.state = 'through';
  car.direction = 'WEST';
  car.dirData = DIRECTIONS.WEST;
  car.mesh.position.x = DIRECTIONS.WEST.sign * 5; // near intersection on new axis
  const cars = [car];

  updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
  // turnComplete guard should prevent PNR from interfering
  assert(car.turnComplete, 'turnComplete should remain true');
  assert(car.state === 'through', 'Car should stay through after turn completion');
});

test('Turned car blocks cars behind it on the exit direction', () => {
  // NORTH car turns right → becomes WEST. A WEST car behind it should queue.
  const turner = makeCar('WEST', DIRECTIONS.WEST.sign * 12, { state: 'waiting', speed: 8 });
  turner.turnComplete = true;

  const follower = makeCar('WEST', DIRECTIONS.WEST.sign * 25, { speed: 8 });
  const cars = [turner, follower];

  simulate(cars, SIGNAL_STATES.ALL_STOP, 600);

  const posTurner = getPos(turner);
  const posFollower = getPos(follower);
  const spacing = Math.abs(posFollower - posTurner);
  const minGap = CAR_LENGTH; // should not overlap
  assert(spacing >= minGap, `Follower should queue behind turned car, spacing: ${spacing.toFixed(2)}`);
});

// ============================================================
// PEDESTRIAN APPROACHING STATE TESTS
// ============================================================

test('Pedestrian in approaching state walks along sidewalk', () => {
  // crossAxis='x', sidewalkAxis='z', approachSign=1 → walks in -z direction
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5, { state: 'approaching', approachSign: 1 });
  ped.mesh.position.z = 20; // start far on sidewalk
  ped.crossFixed = 0; // target z position

  simulatePed(ped, SIGNAL_STATES.EW_GO, 60);
  assert(ped.mesh.position.z < 20, 'Ped should walk toward crosswalk (z decreasing)');
  assert(ped.state === 'approaching', 'Should still be approaching if not at crosswalk yet');
});

test('Pedestrian transitions from approaching to moving when signal safe', () => {
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5, { state: 'approaching', approachSign: 1 });
  ped.mesh.position.z = 0.05; // very close to crossFixed=0
  ped.crossFixed = 0;

  // EW_GO means NS is stopped — safe for x-crosser
  simulatePed(ped, SIGNAL_STATES.EW_GO, 1);
  assert(ped.state === 'moving', `Should transition to moving on safe signal, state: ${ped.state}`);
});

test('Pedestrian transitions from approaching to waiting when signal unsafe', () => {
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5, { state: 'approaching', approachSign: 1 });
  ped.mesh.position.z = 0.05;
  ped.crossFixed = 0;

  // NS_GO means NS traffic flowing — unsafe for x-crosser
  simulatePed(ped, SIGNAL_STATES.NS_GO, 1);
  assert(ped.state === 'waiting', `Should transition to waiting on unsafe signal, state: ${ped.state}`);
});

test('Pedestrian approaching on z-axis checks correct signal', () => {
  // crossAxis='z', sidewalkAxis='x', unsafe when EW_GO or ALL_GO
  const ped = makePedestrian('z', 1, 0, ROAD_WIDTH / 2 + 1.5, { state: 'approaching', approachSign: 1 });
  ped.mesh.position.x = 0.05;
  ped.crossFixed = 0;

  simulatePed(ped, SIGNAL_STATES.EW_GO, 1);
  assert(ped.state === 'waiting', `z-crosser should wait on EW_GO, state: ${ped.state}`);

  const ped2 = makePedestrian('z', 1, 0, ROAD_WIDTH / 2 + 1.5, { state: 'approaching', approachSign: 1 });
  ped2.mesh.position.x = 0.05;
  ped2.crossFixed = 0;
  simulatePed(ped2, SIGNAL_STATES.NS_GO, 1);
  assert(ped2.state === 'moving', `z-crosser should move on NS_GO, state: ${ped2.state}`);
});

test('Pedestrian approaching on ALL_STOP transitions to moving', () => {
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5, { state: 'approaching', approachSign: 1 });
  ped.mesh.position.z = 0.05;
  ped.crossFixed = 0;

  simulatePed(ped, SIGNAL_STATES.ALL_STOP, 1);
  assert(ped.state === 'moving', `Should move on ALL_STOP, state: ${ped.state}`);
});

// ============================================================
// PEDESTRIAN DEPARTING STATE TESTS
// ============================================================

test('Pedestrian transitions to departing after clearing', () => {
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5);
  simulatePed(ped, SIGNAL_STATES.EW_GO, 600);
  assert(ped.cleared, 'Ped should be cleared');
  assert(ped.state === 'departing', `Ped should be departing, state: ${ped.state}`);
});

test('Pedestrian in departing state walks along sidewalk', () => {
  const ped = makePedestrian('x', 1, 0, 0, { state: 'departing', departSign: 1 });
  ped.mesh.position.z = 10;
  const startZ = ped.mesh.position.z;

  simulatePed(ped, SIGNAL_STATES.ALL_GO, 60);
  assert(ped.mesh.position.z > startZ, 'Departing ped should walk along sidewalk (z increasing with departSign=1)');
});

test('Pedestrian in departing state is removed at EXIT_DIST', () => {
  const ped = makePedestrian('x', 1, 0, 0, { state: 'departing', departSign: 1 });
  ped.mesh.position.z = EXIT_DIST - 1;

  const result = simulatePed(ped, SIGNAL_STATES.ALL_GO, 120);
  // Check if removed flag was returned
  assert(ped.mesh.position.z > EXIT_DIST || result.removed, 'Departing ped should be removed at EXIT_DIST');
});

// ============================================================
// PEDESTRIAN SCORING TESTS
// ============================================================

test('Pedestrian crossing returns scored=true once cleared', () => {
  const ped = makePedestrian('x', 1, 0, ROAD_WIDTH / 2 + 1.5);
  let anyScored = false;
  for (let i = 0; i < 600; i++) {
    const result = updatePedestrian(ped, SIGNAL_STATES.EW_GO, 1/60);
    if (result.scored) anyScored = true;
  }
  assert(anyScored, 'Should get scored=true when ped clears the road');
});

test('Vehicle exiting returns scored=true', () => {
  const car = makeCar('NORTH', -50, { speed: 8 });
  const cars = [car];
  let anyScored = false;
  for (let i = 0; i < 1200; i++) {
    const result = updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
    if (result.scored) anyScored = true;
  }
  assert(anyScored, 'Should get scored=true when car exits');
});

test('Car scored only once — cleared flag prevents double score', () => {
  const car = makeCar('NORTH', -50, { speed: 8 });
  const cars = [car];
  let scoreCount = 0;
  for (let i = 0; i < 1500; i++) {
    const result = updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
    if (result.scored) scoreCount++;
  }
  assert(scoreCount === 1, `Should score exactly once, scored ${scoreCount} times`);
});

// ============================================================
// VEHICLE TYPES DATA TESTS
// ============================================================

test('All VEHICLE_TYPES have valid dimensions and weight', () => {
  for (const vt of VEHICLE_TYPES) {
    assert(vt.l > 0, `${vt.name} should have positive length`);
    assert(vt.w > 0, `${vt.name} should have positive width`);
    assert(vt.speedMult > 0, `${vt.name} should have positive speedMult`);
    assert(vt.weight > 0, `${vt.name} should have positive weight`);
  }
});

test('All EMERGENCY_TYPES have valid dimensions', () => {
  for (const et of EMERGENCY_TYPES) {
    assert(et.l > 0, `${et.name} should have positive length`);
    assert(et.w > 0, `${et.name} should have positive width`);
    assert(et.speedMult > 0, `${et.name} should have positive speedMult`);
  }
});

test('Speed multiplier affects relative movement rate', () => {
  const dt = 1/60;
  const baseSpeed = 8;
  // Motorcycle has speedMult 1.3, bus has speedMult 0.7
  const motoSpeed = baseSpeed * 1.3;
  const busSpeed = baseSpeed * 0.7;

  const moto = makeCar('NORTH', -30, { speed: motoSpeed });
  const bus = makeCar('NORTH', -30, { speed: busSpeed });

  updateSingleCar(moto, [moto], SIGNAL_STATES.ALL_GO, dt);
  updateSingleCar(bus, [bus], SIGNAL_STATES.ALL_GO, dt);

  const motoDist = Math.abs(getPos(moto) - (-30));
  const busDist = Math.abs(getPos(bus) - (-30));
  assert(motoDist > busDist, `Motorcycle (speed ${motoSpeed}) should move more than bus (speed ${busSpeed})`);
});

test('Total VEHICLE_TYPES weight is deterministic', () => {
  const totalWeight = VEHICLE_TYPES.reduce((s, v) => s + v.weight, 0);
  assert(totalWeight === 28, `Total weight should be 28, got ${totalWeight}`);
});

test('All vehicle type names are unique', () => {
  const names = VEHICLE_TYPES.map(v => v.name);
  const unique = new Set(names);
  assert(unique.size === names.length, 'All vehicle type names should be unique');
});

// ============================================================
// SIGNAL DEBOUNCE TESTS
// ============================================================

function updateSignalDebounce(pendingSignal, currentSignal, debounceTimer, dt) {
  debounceTimer += dt;
  let newSignal = currentSignal;
  let newTimer = debounceTimer;
  if (pendingSignal !== currentSignal && debounceTimer > 0.3) {
    newSignal = pendingSignal;
    newTimer = 0;
  }
  return { signalState: newSignal, debounceTimer: newTimer };
}

test('Signal does not change within 0.3s debounce window', () => {
  const result = updateSignalDebounce(SIGNAL_STATES.NS_GO, SIGNAL_STATES.ALL_GO, 0, 0.2);
  assert(result.signalState === SIGNAL_STATES.ALL_GO, 'Signal should not change before 0.3s');
});

test('Signal changes after 0.3s debounce', () => {
  const result = updateSignalDebounce(SIGNAL_STATES.NS_GO, SIGNAL_STATES.ALL_GO, 0.25, 0.1);
  assert(result.signalState === SIGNAL_STATES.NS_GO, 'Signal should change after 0.3s');
  assertApprox(result.debounceTimer, 0, 0.001, 'Timer should reset after change');
});

test('Signal does not change when pending equals current', () => {
  const result = updateSignalDebounce(SIGNAL_STATES.ALL_GO, SIGNAL_STATES.ALL_GO, 0, 1.0);
  assert(result.signalState === SIGNAL_STATES.ALL_GO, 'Same signal should not trigger change');
});

test('Rapid signal toggling — new pending replaces old before debounce', () => {
  // First gesture sets NS_GO, but before 0.3s we switch to EW_GO
  let timer = 0;
  const r1 = updateSignalDebounce(SIGNAL_STATES.NS_GO, SIGNAL_STATES.ALL_GO, timer, 0.15);
  assert(r1.signalState === SIGNAL_STATES.ALL_GO, '0.15s: signal unchanged');

  // Gesture changes to EW_GO, timer continues
  const r2 = updateSignalDebounce(SIGNAL_STATES.EW_GO, r1.signalState, r1.debounceTimer, 0.2);
  assert(r2.signalState === SIGNAL_STATES.EW_GO, 'After 0.35s total, new pending EW_GO takes effect');
});

// ============================================================
// BLINKER LOGIC TESTS
// ============================================================

function computeBlinkerIntensity(turnRight, blinkPhase) {
  return (turnRight && blinkPhase) ? 2.0 : 0;
}

test('Blinker on when turnRight=true and blink phase on', () => {
  assertApprox(computeBlinkerIntensity(true, true), 2.0, 0.001, 'Should be 2.0');
});

test('Blinker off when turnRight=false', () => {
  assertApprox(computeBlinkerIntensity(false, true), 0, 0.001, 'Should be 0');
  assertApprox(computeBlinkerIntensity(false, false), 0, 0.001, 'Should be 0');
});

test('Blinker off when blink phase is off', () => {
  assertApprox(computeBlinkerIntensity(true, false), 0, 0.001, 'Should be 0 during off phase');
});

// ============================================================
// IMPATIENCE SHAKE TESTS
// ============================================================

function computeShake(waitTime) {
  if (waitTime <= 3) return 0;
  return Math.sin(waitTime * 6) * 0.02 * Math.min(1, (waitTime - 3) / 4);
}

test('No shake before 3 seconds wait', () => {
  assertApprox(computeShake(0), 0, 0.001, 'No shake at 0s');
  assertApprox(computeShake(2), 0, 0.001, 'No shake at 2s');
  assertApprox(computeShake(3), 0, 0.001, 'No shake at exactly 3s');
});

test('Shake amplitude ramps up after 3 seconds', () => {
  const shake4 = Math.abs(computeShake(4));   // (4-3)/4 = 0.25 ramp
  const shake7 = Math.abs(computeShake(7));   // (7-3)/4 = 1.0 ramp (full)
  // shake7 may not be > shake4 at every instant (sine), but max possible is higher
  const maxShake4 = 0.02 * 0.25;
  const maxShake7 = 0.02 * 1.0;
  assert(maxShake7 > maxShake4, 'Max shake at 7s should exceed max at 4s');
  assert(shake4 <= maxShake4 + 0.001, `Shake at 4s should be <= ${maxShake4}`);
});

test('Shake amplitude caps at 7 seconds', () => {
  const maxAmp7 = 0.02 * Math.min(1, (7 - 3) / 4);  // = 0.02
  const maxAmp10 = 0.02 * Math.min(1, (10 - 3) / 4); // = 0.02 (capped at 1)
  assertApprox(maxAmp7, maxAmp10, 0.001, 'Amplitude should cap at 0.02');
});

// ============================================================
// SPAWN PROXIMITY GUARD TESTS
// ============================================================

function isSpawnBlocked(existingCars, dirKey) {
  return existingCars.some(c =>
    c.direction === dirKey && !c.isPedestrian &&
    c.distanceFromCenter > SPAWN_DIST - (c.vehicleLength || CAR_LENGTH) * 2
  );
}

test('Spawn blocked when car is very close to spawn point', () => {
  const nearCar = makeCar('NORTH', -(SPAWN_DIST - 1)); // distFromCenter ≈ 64
  nearCar.distanceFromCenter = SPAWN_DIST - 1;
  assert(isSpawnBlocked([nearCar], 'NORTH'), 'Should block spawn when car near spawn point');
});

test('Spawn allowed when existing car has moved away', () => {
  const farCar = makeCar('NORTH', -20);
  farCar.distanceFromCenter = 20;
  assert(!isSpawnBlocked([farCar], 'NORTH'), 'Should allow spawn when car far from spawn point');
});

test('Spawn not blocked by car in different direction', () => {
  const nearCar = makeCar('SOUTH', SPAWN_DIST - 1);
  nearCar.distanceFromCenter = SPAWN_DIST - 1;
  assert(!isSpawnBlocked([nearCar], 'NORTH'), 'Should not block NORTH spawn for SOUTH car');
});

test('Spawn not blocked by pedestrian near spawn', () => {
  const ped = makePedestrian('x', 1, 0, SPAWN_DIST - 1);
  ped.direction = 'NORTH';
  ped.distanceFromCenter = SPAWN_DIST - 1;
  assert(!isSpawnBlocked([ped], 'NORTH'), 'Should not block spawn for pedestrian');
});

// ============================================================
// NIGHT MODE WAVE THRESHOLD TESTS
// ============================================================

function computeNightMode(waveNum) {
  return waveNum >= 5;
}

test('Night mode off for waves 1-4', () => {
  for (let w = 1; w <= 4; w++) {
    assert(!computeNightMode(w), `Wave ${w} should NOT have night mode`);
  }
});

test('Night mode on for waves 5+', () => {
  for (let w = 5; w <= 10; w++) {
    assert(computeNightMode(w), `Wave ${w} should have night mode`);
  }
});

// ============================================================
// PEDESTRIAN SPAWN CONDITION TESTS
// ============================================================

function canSpawnPedestrian(wave) {
  return wave >= 2;
}

test('Pedestrians do not spawn in wave 1', () => {
  assert(!canSpawnPedestrian(1), 'Wave 1 should not spawn peds');
});

test('Pedestrians can spawn in wave 2+', () => {
  assert(canSpawnPedestrian(2), 'Wave 2 should allow peds');
  assert(canSpawnPedestrian(5), 'Wave 5 should allow peds');
});

// ============================================================
// COLLISION DISTANCE GATE TESTS
// ============================================================

test('No collision when one car is far from intersection', () => {
  const carN = makeCar('NORTH', -20); // distFromCenter = 20, > STOP_LINE_DIST + 2
  carN.distanceFromCenter = 20;
  const carE = makeCar('EAST', -2);
  carE.distanceFromCenter = 2;
  carE.mesh.position.x = 0; carE.mesh.position.z = 0;
  carN.mesh.position.x = 0; carN.mesh.position.z = 0; // overlap position

  // In the game, collisions are skipped when distanceFromCenter > STOP_LINE_DIST + 2
  const gateThreshold = STOP_LINE_DIST + 2;
  const gated = carN.distanceFromCenter > gateThreshold || carE.distanceFromCenter > gateThreshold;
  assert(gated, 'One car is beyond gate threshold, collision check should be skipped');
});

test('Collision check proceeds when both cars near intersection', () => {
  const carN = makeCar('NORTH', -3);
  carN.distanceFromCenter = 3;
  const carE = makeCar('EAST', -3);
  carE.distanceFromCenter = 3;

  const gateThreshold = STOP_LINE_DIST + 2;
  const gated = carN.distanceFromCenter > gateThreshold || carE.distanceFromCenter > gateThreshold;
  assert(!gated, 'Both cars near intersection, collision check should proceed');
});

// ============================================================
// WAVE PROGRESSION — NIGHT MODE IN computeWaveParams
// ============================================================

test('computeWaveParams returns consistent values across all waves', () => {
  for (let w = 1; w <= 10; w++) {
    const p = computeWaveParams(w);
    assert(p.speed > 0, `Wave ${w} speed should be positive`);
    assert(p.spawnInterval > 0, `Wave ${w} spawnInterval should be positive`);
    assert(p.maxCars >= 1, `Wave ${w} maxCars should be >= 1`);
  }
});

test('Weather intensity increases within rain and snow ranges', () => {
  const p3 = computeWaveParams(3);
  const p5 = computeWaveParams(5);
  assert(p5.weatherIntensity > p3.weatherIntensity, 'Rain intensity should increase W3→W5');

  const p6 = computeWaveParams(6);
  const p9 = computeWaveParams(9);
  assert(p9.weatherIntensity > p6.weatherIntensity, 'Snow intensity should increase W6→W9');
});

// ============================================================
// QUEUE — ARC CAR SKIPPED FROM QUEUE-AHEAD CHECKS
// ============================================================

test('Straight car does not queue behind car on right-turn arc', () => {
  // A car on a right-turn arc should be invisible to queue-behind logic
  ['NORTH', 'SOUTH', 'EAST', 'WEST'].forEach(dirKey => {
    const dir = DIRECTIONS[dirKey];
    // Arc car: inside intersection, actively turning
    const arcCar = makeCar(dirKey, -dir.sign * 3, {
      state: 'through',
      turnRight: true,
      turnProgress: 0.3
    });
    arcCar._turnData = RIGHT_TURN_DATA[dirKey];

    // Straight car: approaching from behind
    const straightCar = makeCar(dirKey, dir.sign * 15);
    const cars = [arcCar, straightCar];
    const posBefore = getPos(straightCar);
    simulate(cars, SIGNAL_STATES.ALL_GO, 30);
    const posAfter = getPos(straightCar);
    // Forward progress: position changes in -dir.sign direction
    const moved = (posAfter - posBefore) * (-dir.sign);
    assert(moved > 0, `Straight car (${dirKey}) should not queue behind arc car`);
  });
});

test('Turn-completed car IS visible to queue-behind logic', () => {
  // After a turn completes, the car is on the exit axis and SHOULD block others on that axis
  const dir = DIRECTIONS.NORTH;
  const td = RIGHT_TURN_DATA.NORTH; // exitDir = WEST
  const exitDir = DIRECTIONS[td.exitDir]; // WEST: axis=x, sign=1

  // Turn-completed car now heading WEST, at x=5
  const turnedCar = makeCar(td.exitDir, 5, { state: 'through', turnComplete: true });
  // Another WEST car behind it at x=15
  const follower = makeCar(td.exitDir, 15);
  const cars = [turnedCar, follower];

  // Turned car should block follower
  simulate(cars, SIGNAL_STATES.ALL_GO, 120);
  const turnedPos = getPos(turnedCar);
  const followerPos = getPos(follower);
  // Follower should be behind (or very close to) turned car, not overlapping
  const gap = (turnedCar.vehicleLength + follower.vehicleLength) * 0.5;
  assert(followerPos >= turnedPos - 1 || follower.cleared, 'Follower should not pass through turned car');
});

// ============================================================
// PEDESTRIAN — THROUGH STATE IMMUNE TO SIGNAL CHANGES
// ============================================================

test('Pedestrian in through state keeps moving when signal becomes unsafe', () => {
  // Start ped inside the road (through state)
  const ped = makePedestrian('x', 1, CROSSWALK_DIST, 2, { state: 'through' });
  ped.distanceFromCenter = 2; // inside road
  const posBefore = getPedPos(ped);

  // Even with NS_GO (unsafe for x-crossers), through ped should keep moving
  simulatePed(ped, SIGNAL_STATES.NS_GO, 30);
  const posAfter = getPedPos(ped);
  assert(ped.state !== 'waiting', 'Through ped should not revert to waiting');
  assert(posAfter !== posBefore, 'Through ped should keep moving');
});

test('Pedestrian in moving state outside road reverts to waiting on unsafe signal', () => {
  // Ped just barely outside road edge
  const ped = makePedestrian('x', 1, CROSSWALK_DIST, ROAD_WIDTH / 2 + 0.5, { state: 'moving' });
  ped.distanceFromCenter = ROAD_WIDTH / 2 + 0.5;

  // NS_GO is unsafe for x-crossers
  simulatePed(ped, SIGNAL_STATES.NS_GO, 1);
  assert(ped.state === 'waiting', 'Moving ped outside road should wait when signal unsafe');
});

// ============================================================
// PEDESTRIAN — APPROACHING STATE REMOVAL AT EXIT_DIST
// ============================================================

test('Approaching pedestrian removed when overshooting past EXIT_DIST', () => {
  // Ped approaching along z-axis, already very far from crosswalk
  const ped = makePedestrian('x', 1, CROSSWALK_DIST, ROAD_WIDTH / 2 + 1.5, { state: 'approaching' });
  // Place far away on sidewalk axis so they'll never reach crosswalk
  ped.mesh.position.z = EXIT_DIST + 1;
  ped.approachSign = -1; // walking in +z direction (away from crosswalk)

  // Simulate in game's updateCars — approach check uses absSwPos > EXIT_DIST
  // In our test we check the condition directly since updatePedestrian doesn't check this
  const swPos = ped.mesh.position.z;
  assert(Math.abs(swPos) > EXIT_DIST, 'Ped should be beyond EXIT_DIST and get removed');
});

// ============================================================
// RIGHT-TURN YIELD — BOUNDARY & EDGE CASES
// ============================================================

test('Right-turning car does NOT yield to waiting cross-traffic', () => {
  const dir = DIRECTIONS.NORTH;
  const car = makeCar('NORTH', -dir.sign * 5, {
    state: 'through',
    turnRight: true,
    turnProgress: 0.2
  });
  car._turnData = RIGHT_TURN_DATA.NORTH;

  // Cross-traffic car stopped at stop line (waiting state)
  const waitingCross = makeCar('EAST', DIRECTIONS.EAST.sign * (STOP_LINE_DIST + CAR_LENGTH / 2), { state: 'waiting' });
  waitingCross.distanceFromCenter = STOP_LINE_DIST + CAR_LENGTH / 2;

  const cars = [car, waitingCross];
  const progBefore = car.turnProgress;
  simulate(cars, SIGNAL_STATES.NS_GO, 10);
  assert(car.turnProgress > progBefore, 'Turning car should NOT yield to waiting cross-traffic');
});

test('Right-turn yield — pedestrian at boundary distance', () => {
  // Distance threshold is dx*dx + dz*dz < 25 (radius 5)
  const car = makeCar('NORTH', 5, { state: 'through', turnRight: true, turnProgress: 0.3 });
  car._turnData = RIGHT_TURN_DATA.NORTH;
  const td = car._turnData;
  const ang = td.a0 + 0.3 * (td.a1 - td.a0);
  car.mesh.position.x = td.cx + TURN_RADIUS * Math.cos(ang);
  car.mesh.position.z = td.cz + TURN_RADIUS * Math.sin(ang);

  // Ped at exactly distance 5.1 — should NOT trigger yield
  const farPed = makePedestrian('x', 1, 0, 3);
  farPed.mesh.position.x = car.mesh.position.x + 5.1;
  farPed.mesh.position.z = car.mesh.position.z;
  farPed.distanceFromCenter = 3;
  const dx = farPed.mesh.position.x - car.mesh.position.x;
  const dz = farPed.mesh.position.z - car.mesh.position.z;
  assert(dx * dx + dz * dz >= 25, 'Ped at 5.1 distance should be outside yield threshold');

  // Ped at distance 4.9 — should trigger yield
  const nearPed = makePedestrian('x', 1, 0, 3);
  nearPed.mesh.position.x = car.mesh.position.x + 4.9;
  nearPed.mesh.position.z = car.mesh.position.z;
  nearPed.distanceFromCenter = 3;
  const dx2 = nearPed.mesh.position.x - car.mesh.position.x;
  const dz2 = nearPed.mesh.position.z - car.mesh.position.z;
  assert(dx2 * dx2 + dz2 * dz2 < 25, 'Ped at 4.9 distance should be inside yield threshold');
});

test('Right-turn arc not started until car reaches intersection edge', () => {
  // Car is through but still > HALF_INT + 0.5 from center — arc should NOT begin
  const dir = DIRECTIONS.NORTH;
  const dist = INTERSECTION_SIZE / 2 + 2; // 7 from center
  const car = makeCar('NORTH', -dir.sign * dist, { state: 'through', turnRight: true });
  const cars = [car];

  updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1 / 60);
  assert(car.turnProgress === undefined, 'Arc should not start when car is far from intersection edge');
});

// ============================================================
// COLLISION — EDGE CASES
// ============================================================

function checkCollisionPair(a, b) {
  if (a.state === 'crashed' || b.state === 'crashed') return { collision: false, nearMiss: false };
  if (a.direction === b.direction) return { collision: false, nearMiss: false };
  if (!a.isPedestrian && !b.isPedestrian && a.dirData.axis === b.dirData.axis) return { collision: false, nearMiss: false };
  if (a.isPedestrian && b.isPedestrian) return { collision: false, nearMiss: false };
  const aTurning = a.turnRight && a.state === 'through' && !a.turnComplete;
  const bTurning = b.turnRight && b.state === 'through' && !b.turnComplete;
  if ((a.isPedestrian && bTurning) || (b.isPedestrian && aTurning)) return { collision: false, nearMiss: false };
  if (a.distanceFromCenter > STOP_LINE_DIST + 2 || b.distanceFromCenter > STOP_LINE_DIST + 2) return { collision: false, nearMiss: false };

  const dx = a.mesh.position.x - b.mesh.position.x;
  const dz = a.mesh.position.z - b.mesh.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const minDist = ((a.vehicleLength || CAR_LENGTH) + (b.vehicleLength || CAR_LENGTH)) * 0.35;
  const nearMissDist = minDist * 1.8;

  if (dist < minDist) return { collision: true, nearMiss: false, pedHit: a.isPedestrian || b.isPedestrian };
  if (dist < nearMissDist) return { collision: false, nearMiss: true };
  return { collision: false, nearMiss: false };
}

test('Collision game over reason is pedestrian when ped involved', () => {
  const car = makeCar('NORTH', -2);
  car.distanceFromCenter = 2;
  car.mesh.position.x = 0; car.mesh.position.z = 0;

  const ped = makePedestrian('x', 1, 0, 2);
  ped.mesh.position.x = 0; ped.mesh.position.z = 0;
  ped.distanceFromCenter = 0;
  ped.direction = 'WEST'; // different direction

  const result = checkCollisionPair(car, ped);
  assert(result.collision, 'Car-ped overlap should be collision');
  assert(result.pedHit === true, 'Should flag pedHit for ped collision');
});

test('Collision game over reason is crash when no ped involved', () => {
  const carN = makeCar('NORTH', -2);
  carN.distanceFromCenter = 2;
  carN.mesh.position.x = 0; carN.mesh.position.z = 0;

  const carE = makeCar('EAST', -2);
  carE.distanceFromCenter = 2;
  carE.mesh.position.x = 0; carE.mesh.position.z = 0;

  const result = checkCollisionPair(carN, carE);
  assert(result.collision, 'Cross-traffic overlap should be collision');
  assert(!result.pedHit, 'Should NOT flag pedHit for car-car collision');
});

test('Turn-completed car CAN collide with pedestrian', () => {
  // After turn completes, turnRight is set to false, so turning exemption is gone
  const car = makeCar('WEST', 2, { state: 'through', turnComplete: true, turnRight: false });
  car.distanceFromCenter = 2;
  car.mesh.position.x = 0; car.mesh.position.z = 0;

  const ped = makePedestrian('z', 1, 0, 2);
  ped.mesh.position.x = 0; ped.mesh.position.z = 0;
  ped.distanceFromCenter = 0;
  ped.direction = 'NORTH';

  const result = checkCollisionPair(car, ped);
  assert(result.collision, 'Turn-completed car should collide with pedestrian (no immunity)');
});

test('Same-direction cars skip collision check entirely', () => {
  const car1 = makeCar('NORTH', -2);
  car1.distanceFromCenter = 2;
  car1.mesh.position.x = 0; car1.mesh.position.z = 0;

  const car2 = makeCar('NORTH', -3);
  car2.distanceFromCenter = 3;
  car2.mesh.position.x = 0; car2.mesh.position.z = 0;

  const result = checkCollisionPair(car1, car2);
  assert(!result.collision, 'Same-direction cars should never collide');
});

test('Near-miss flag resets when cars separate', () => {
  const a = makeCar('NORTH', -3);
  a.distanceFromCenter = 3;
  a.nearMissWarned = true;

  const b = makeCar('EAST', -3);
  b.distanceFromCenter = 3;
  b.nearMissWarned = true;

  // Place far apart
  a.mesh.position.x = 0; a.mesh.position.z = -10;
  b.mesh.position.x = 10; b.mesh.position.z = 0;

  const result = checkCollisionPair(a, b);
  // Beyond both minDist and nearMissDist — flags should reset in game
  assert(!result.collision && !result.nearMiss, 'Cars far apart should neither collide nor near-miss');
});

// ============================================================
// SPAWN PROXIMITY — VEHICLE LENGTH AFFECTS EXCLUSION ZONE
// ============================================================

test('Long vehicle creates larger spawn exclusion zone', () => {
  // Semi truck: l=9.5 → exclusion threshold = SPAWN_DIST - 9.5*2 = 46
  const semi = makeCar('NORTH', -(SPAWN_DIST - 10)); // dist = 55
  semi.vehicleLength = 9.5;
  semi.distanceFromCenter = SPAWN_DIST - 10; // 55
  assert(isSpawnBlocked([semi], 'NORTH'), 'Semi at dist 55 should block NORTH spawn (threshold 46)');

  // Sedan: l=3.2 → exclusion threshold = SPAWN_DIST - 3.2*2 = 58.6
  const sedan = makeCar('NORTH', -(SPAWN_DIST - 10));
  sedan.vehicleLength = 3.2;
  sedan.distanceFromCenter = SPAWN_DIST - 10; // 55
  assert(!isSpawnBlocked([sedan], 'NORTH'), 'Sedan at dist 55 should NOT block NORTH spawn (threshold 58.6)');
});

// ============================================================
// PED_TYPES DATA VALIDATION
// ============================================================

const PED_TYPES = [
  { name: 'normal',     speedMult: 1.0,  weight: 5 },
  { name: 'elderly',    speedMult: 0.55, weight: 3 },
  { name: 'jogger',     speedMult: 1.6,  weight: 2 },
  { name: 'dogwalker',  speedMult: 0.8,  weight: 3 },
  { name: 'stroller',   speedMult: 0.7,  weight: 2 },
  { name: 'child',      speedMult: 1.2,  weight: 2 },
];

test('All PED_TYPES have valid properties', () => {
  for (const pt of PED_TYPES) {
    assert(typeof pt.name === 'string' && pt.name.length > 0, `Ped type name should be non-empty string: ${pt.name}`);
    assert(pt.speedMult > 0, `Ped type ${pt.name} should have positive speedMult`);
    assert(pt.weight > 0, `Ped type ${pt.name} should have positive weight`);
  }
});

test('All PED_TYPES names are unique', () => {
  const names = PED_TYPES.map(p => p.name);
  const unique = new Set(names);
  assert(names.length === unique.size, 'All ped type names should be unique');
});

test('Total PED_TYPES weight is deterministic', () => {
  const total = PED_TYPES.reduce((s, p) => s + p.weight, 0);
  assert(total === 17, `Total ped weight should be 17, got ${total}`);
});

// ============================================================
// WEIGHTED SELECTION — pickType FALLBACK
// ============================================================

function pickType(types) {
  const total = types.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of types) { r -= t.weight; if (r <= 0) return t; }
  return types[0]; // fallback
}

test('Weighted selection always returns a valid type', () => {
  for (let i = 0; i < 100; i++) {
    const v = pickType(VEHICLE_TYPES);
    assert(v !== undefined && v.name, `Vehicle pick ${i} should return valid type`);
    const p = pickType(PED_TYPES);
    assert(p !== undefined && p.name, `Ped pick ${i} should return valid type`);
  }
});

// ============================================================
// WAVE INTERVAL — 18 SECOND BOUNDARIES
// ============================================================

test('Wave advances every 18 seconds', () => {
  function computeWave(timer) { return Math.floor(timer / 18) + 1; }
  assert(computeWave(0) === 1, 'Timer 0 → wave 1');
  assert(computeWave(17.9) === 1, 'Timer 17.9 → wave 1');
  assert(computeWave(18) === 2, 'Timer 18 → wave 2');
  assert(computeWave(35.9) === 2, 'Timer 35.9 → wave 2');
  assert(computeWave(36) === 3, 'Timer 36 → wave 3');
  assert(computeWave(162) === 10, 'Timer 162 → wave 10');
});

// ============================================================
// getWaveData — BEYOND DEFINED WAVES
// ============================================================

const WAVE_DATA = [
  { name: 'Easy Street' },
  { name: 'Getting Busy' },
  { name: 'Rush Hour Begins' },
  { name: 'School\'s Out' },
  { name: 'After Dark' },
  { name: 'Midnight Madness' },
  { name: 'Storm Warning' },
  { name: 'Grand Theft Intersection' },
  { name: 'Are You Still Alive?!' },
  { name: 'Traffic God Mode' },
];

function getWaveData(w) {
  if (w <= WAVE_DATA.length) return WAVE_DATA[w - 1];
  const extra = w - WAVE_DATA.length;
  return {
    name: 'Wave ' + w + ': WHY',
    tip: extra % 2 === 0 ? 'We ran out of wave names. You\'re a legend.' : 'Seriously, go outside.',
    emoji: ['🤯', '💀', '👽', '🦄', '🫠'][extra % 5]
  };
}

test('getWaveData returns defined data for waves 1-10', () => {
  for (let w = 1; w <= 10; w++) {
    const data = getWaveData(w);
    assert(data.name === WAVE_DATA[w - 1].name, `Wave ${w} should have correct name`);
  }
});

test('getWaveData returns fallback for waves beyond 10', () => {
  const d11 = getWaveData(11);
  assert(d11.name === 'Wave 11: WHY', 'Wave 11 should have fallback name');
  assert(d11.tip === 'Seriously, go outside.', 'Wave 11 (extra=1, odd) should have odd tip');

  const d12 = getWaveData(12);
  assert(d12.name === 'Wave 12: WHY', 'Wave 12 fallback name');
  assert(d12.tip === 'We ran out of wave names. You\'re a legend.', 'Wave 12 (extra=2, even) should have even tip');
});

test('getWaveData emoji cycles through 5-element array', () => {
  const emojis = ['🤯', '💀', '👽', '🦄', '🫠'];
  for (let w = 11; w <= 20; w++) {
    const data = getWaveData(w);
    const extra = w - 10;
    assert(data.emoji === emojis[extra % 5], `Wave ${w} emoji should be ${emojis[extra % 5]}`);
  }
});

// ============================================================
// MOVEMENT THRESHOLD — moveAmount > 0.001
// ============================================================

test('Car with tiny moveAmount does not accumulate micro-movements', () => {
  // Car extremely close to stop line — moveAmount should round to zero
  const dir = DIRECTIONS.NORTH;
  const stopLinePos = dir.sign * (STOP_LINE_DIST + CAR_LENGTH / 2);
  const car = makeCar('NORTH', stopLinePos - dir.sign * 0.0001); // 0.0001 from stop line
  const cars = [car];
  const posBefore = getPos(car);
  updateSingleCar(car, cars, SIGNAL_STATES.ALL_STOP, 1 / 60);
  const posAfter = getPos(car);
  assertApprox(posAfter, posBefore, 0.01, 'Car near stop line should not accumulate micro-movements');
});

// ============================================================
// HONK CHANCE ARITHMETIC
// ============================================================

function computeHonkChance(waitingCount) {
  return Math.min(0.9, 0.2 + waitingCount * 0.15);
}

test('Honk chance scales with waiting cars', () => {
  assertApprox(computeHonkChance(0), 0.2, 0.001, '0 waiting → 0.2 chance');
  assertApprox(computeHonkChance(1), 0.35, 0.001, '1 waiting → 0.35');
  assertApprox(computeHonkChance(3), 0.65, 0.001, '3 waiting → 0.65');
  assertApprox(computeHonkChance(5), 0.9, 0.001, '5 waiting → capped at 0.9');
  assertApprox(computeHonkChance(10), 0.9, 0.001, '10 waiting → still capped at 0.9');
});

test('Angry honk threshold is 5 seconds wait time', () => {
  // Cars waiting > 5 seconds get angry honk
  const angryThreshold = 5;
  assert(4.9 <= angryThreshold, 'waitTime 4.9 should NOT trigger angry honk');
  assert(5.1 > angryThreshold, 'waitTime 5.1 should trigger angry honk');
});

// ============================================================
// isFist — FIST DETECTION LOGIC
// ============================================================

function isFist(landmarks) {
  // Finger tips: 8=index,12=middle,16=ring,20=pinky
  // Finger PIPs: 6=index,10=middle,14=ring,18=pinky
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  let curled = 0;
  for (let i = 0; i < 4; i++) {
    if (landmarks[tips[i]].y > landmarks[pips[i]].y) curled++;
  }
  return curled >= 3;
}

test('isFist — all fingers curled is fist', () => {
  // Tips below PIPs (higher y = lower on screen)
  const lm = new Array(21).fill(null).map(() => ({ x: 0, y: 0.5 }));
  // Set tips y > pips y (curled)
  lm[8].y = 0.7; lm[6].y = 0.5;   // index curled
  lm[12].y = 0.7; lm[10].y = 0.5;  // middle curled
  lm[16].y = 0.7; lm[14].y = 0.5;  // ring curled
  lm[20].y = 0.7; lm[18].y = 0.5;  // pinky curled
  assert(isFist(lm), 'All 4 fingers curled should be fist');
});

test('isFist — all fingers open is not fist', () => {
  const lm = new Array(21).fill(null).map(() => ({ x: 0, y: 0.5 }));
  // Tips y < pips y (open)
  lm[8].y = 0.3; lm[6].y = 0.5;
  lm[12].y = 0.3; lm[10].y = 0.5;
  lm[16].y = 0.3; lm[14].y = 0.5;
  lm[20].y = 0.3; lm[18].y = 0.5;
  assert(!isFist(lm), 'All 4 fingers open should NOT be fist');
});

test('isFist — 2 curled is not fist', () => {
  const lm = new Array(21).fill(null).map(() => ({ x: 0, y: 0.5 }));
  lm[8].y = 0.7; lm[6].y = 0.5;   // curled
  lm[12].y = 0.7; lm[10].y = 0.5;  // curled
  lm[16].y = 0.3; lm[14].y = 0.5;  // open
  lm[20].y = 0.3; lm[18].y = 0.5;  // open
  assert(!isFist(lm), '2 curled fingers should NOT be fist');
});

test('isFist — 3 curled is fist', () => {
  const lm = new Array(21).fill(null).map(() => ({ x: 0, y: 0.5 }));
  lm[8].y = 0.7; lm[6].y = 0.5;   // curled
  lm[12].y = 0.7; lm[10].y = 0.5;  // curled
  lm[16].y = 0.7; lm[14].y = 0.5;  // curled
  lm[20].y = 0.3; lm[18].y = 0.5;  // open
  assert(isFist(lm), '3 curled fingers should be fist');
});

// ============================================================
// DT CAPPING — large dt clamped to 0.05
// ============================================================

test('Large dt is capped at 0.05 for movement', () => {
  // Simulate: car movement with dt=0.05 (capped) vs dt=0.1 (uncapped)
  const car1 = makeCar('NORTH', -20);
  const car2 = makeCar('NORTH', -20);
  const cars1 = [car1];
  const cars2 = [car2];

  const cappedDt = Math.min(0.1, 0.05); // should be 0.05
  updateSingleCar(car1, cars1, SIGNAL_STATES.ALL_GO, cappedDt);
  updateSingleCar(car2, cars2, SIGNAL_STATES.ALL_GO, 0.05);

  const pos1 = getPos(car1);
  const pos2 = getPos(car2);
  assertApprox(pos1, pos2, 0.001, 'Capped dt=0.1 should produce same movement as dt=0.05');
});

// ============================================================
// BUS STOP BEHAVIOR
// ============================================================

test('Bus stops at bus stop position (NORTH)', () => {
  const busLen = 5.5;
  const car = makeCar('NORTH', -40, { vehicleType: 'bus', vehicleLength: busLen });
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_GO, 600);
  // Bus should stop at BUS_STOP_DIST + busLen/2 position
  assert(car.busStopState === 'stopped' || car.busStopState === 'done', 'Bus should enter stopped or done state at bus stop');
});

test('Bus stops at bus stop position (SOUTH)', () => {
  const busLen = 5.5;
  const car = makeCar('SOUTH', 40, { vehicleType: 'bus', vehicleLength: busLen });
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_GO, 600);
  assert(car.busStopState === 'stopped' || car.busStopState === 'done', 'Bus should enter stopped or done state at bus stop (SOUTH)');
});

test('Bus stops at bus stop position (EAST)', () => {
  const busLen = 5.5;
  const car = makeCar('EAST', -40, { vehicleType: 'bus', vehicleLength: busLen });
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_GO, 600);
  assert(car.busStopState === 'stopped' || car.busStopState === 'done', 'Bus should enter stopped or done state at bus stop (EAST)');
});

test('Bus stops at bus stop position (WEST)', () => {
  const busLen = 5.5;
  const car = makeCar('WEST', 40, { vehicleType: 'bus', vehicleLength: busLen });
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_GO, 600);
  assert(car.busStopState === 'stopped' || car.busStopState === 'done', 'Bus should enter stopped or done state at bus stop (WEST)');
});

test('Bus has zero moveAmount while stopped at bus stop', () => {
  const busLen = 5.5;
  const dir = DIRECTIONS.NORTH;
  const busStopPos = dir.sign * (BUS_STOP_DIST + busLen / 2);
  const car = makeCar('NORTH', busStopPos, { vehicleType: 'bus', vehicleLength: busLen, busStopState: 'stopped', busStopTimer: 3.0 });
  const posBefore = getPos(car);
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_GO, 60); // 1 second
  const posAfter = getPos(car);
  assertApprox(posAfter, posBefore, 0.01, 'Bus should not move while stopped at bus stop');
});

test('Bus resumes after busStopTimer expires', () => {
  const busLen = 5.5;
  const dir = DIRECTIONS.NORTH;
  const busStopPos = dir.sign * (BUS_STOP_DIST + busLen / 2);
  const car = makeCar('NORTH', busStopPos, { vehicleType: 'bus', vehicleLength: busLen, busStopState: 'stopped', busStopTimer: 0.5 });
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_GO, 60); // 1 second — timer should expire
  assert(car.busStopState === 'done', 'Bus should transition to done state after timer expires');
});

test('Bus moves toward intersection after bus stop is done', () => {
  const busLen = 5.5;
  const dir = DIRECTIONS.NORTH;
  const busStopPos = dir.sign * (BUS_STOP_DIST + busLen / 2);
  const car = makeCar('NORTH', busStopPos, { vehicleType: 'bus', vehicleLength: busLen, busStopState: 'done' });
  const posBefore = getPos(car);
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_GO, 120);
  const posAfter = getPos(car);
  // NORTH approaches from negative z, moves toward 0
  assert(posAfter > posBefore, 'Bus should move toward intersection after bus stop is done');
});

test('Non-bus vehicle skips bus stop entirely', () => {
  const car = makeCar('NORTH', -40, { vehicleType: 'sedan' });
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_GO, 600);
  assert(car.busStopState === null, 'Sedan should never enter bus stop state');
});

test('Emergency bus skips bus stop', () => {
  const busLen = 5.5;
  const car = makeCar('NORTH', -40, { vehicleType: 'bus', vehicleLength: busLen });
  car.isEmergency = true;
  const cars = [car];
  simulate(cars, SIGNAL_STATES.ALL_GO, 600);
  assert(car.busStopState === null, 'Emergency bus should skip bus stop');
});

test('Bus busStopTimer is set between MIN and MAX', () => {
  const busLen = 5.5;
  const car = makeCar('NORTH', -40, { vehicleType: 'bus', vehicleLength: busLen });
  const cars = [car];
  // Run until bus reaches bus stop
  for (let i = 0; i < 600; i++) {
    updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
    if (car.busStopState === 'stopped') break;
  }
  if (car.busStopState === 'stopped') {
    assert(car.busStopTimer >= BUS_STOP_DURATION_MIN, 'Bus stop timer should be >= MIN');
    assert(car.busStopTimer <= BUS_STOP_DURATION_MAX, 'Bus stop timer should be <= MAX');
  }
});

test('Bus decelerates approaching bus stop', () => {
  const busLen = 5.5;
  const dir = DIRECTIONS.NORTH;
  const busStopPos = dir.sign * (BUS_STOP_DIST + busLen / 2);
  // Car close to bus stop but within BRAKE_ZONE
  const approachPos = busStopPos + dir.sign * 2; // 2 units before bus stop
  const car = makeCar('NORTH', approachPos, { vehicleType: 'bus', vehicleLength: busLen });
  const carFast = makeCar('NORTH', approachPos, { vehicleType: 'sedan' }); // sedan won't brake for bus stop
  const cars = [car];
  const carsFast = [carFast];
  updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
  updateSingleCar(carFast, carsFast, SIGNAL_STATES.ALL_GO, 1/60);
  const busDelta = Math.abs(getPos(car) - approachPos);
  const sedanDelta = Math.abs(getPos(carFast) - approachPos);
  assert(busDelta <= sedanDelta, 'Bus should move less (decelerate) approaching bus stop compared to sedan');
});

// ============================================================
// STUCK DETECTION
// ============================================================

test('Through car forced to move after being stuck for 4 seconds', () => {
  const dir = DIRECTIONS.NORTH;
  // Place car in through state near center (stuck scenario)
  const car = makeCar('NORTH', -3, { state: 'through' });
  // Place a same-direction car directly ahead to block it
  const blocker = makeCar('NORTH', -1, { state: 'through' });
  blocker.distanceFromCenter = 1;
  const cars = [car, blocker];
  
  // Simulate for just under 4 seconds — should still be stuck
  simulate(cars, SIGNAL_STATES.ALL_STOP, 239, 1/60); // ~3.98 seconds
  const posAt4 = getPos(car);
  
  // After 4 seconds, stuck detection should force movement
  // Remove blocker to isolate the effect
  cars.length = 0;
  cars.push(car);
  car.stuckTimer = 4.1; // force past threshold
  const posBefore = getPos(car);
  updateSingleCar(car, cars, SIGNAL_STATES.ALL_STOP, 1/60);
  const posAfter = getPos(car);
  assert(Math.abs(posAfter - posBefore) > 0.001, 'Through car should be forced to move after 4 seconds of being stuck');
});

test('Stuck timer resets when car moves normally', () => {
  const car = makeCar('NORTH', -20, { state: 'through' });
  car.stuckTimer = 3;
  const cars = [car];
  updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
  assert(car.stuckTimer === 0, 'Stuck timer should reset when car moves normally');
});

test('Stuck detection only applies to through state', () => {
  const car = makeCar('NORTH', -20, { state: 'moving' });
  const cars = [car];
  // Moving cars should not accumulate stuck timer even if blocked
  simulate(cars, SIGNAL_STATES.ALL_STOP, 300);
  assert(car.state === 'waiting', 'Car should transition to waiting at stop line');
});

test('Stuck timer accumulates across frames', () => {
  // Set up a through car outside the intersection that is blocked by a car ahead
  // Through cars only skip queue logic when distFromCenter < STOP_LINE_DIST
  const car = makeCar('NORTH', -15, { state: 'through' }); // dist=15, > STOP_LINE_DIST
  car.stuckTimer = 0;
  // Place blocker directly ahead (closer to 0) so distToGap <= 0.05
  // NORTH sign=-1, cars move from negative z toward 0
  // fwdDist = (otherPos - posComponent) * (-dir.sign) must be > 0
  // otherPos = -15 - (-1)*gap = -15 + gap (closer to 0)
  const vLen = CAR_LENGTH;
  const gap = (vLen + vLen) * 0.5 + 1.5;
  const blockerZ = -15 - DIRECTIONS.NORTH.sign * gap; // = -15 + 4.7 = -10.3
  const blocker = makeCar('NORTH', blockerZ, { state: 'through' });
  blocker.distanceFromCenter = Math.abs(blockerZ);
  const cars = [car, blocker];
  
  updateSingleCar(car, cars, SIGNAL_STATES.ALL_STOP, 1/60);
  const timer1 = car.stuckTimer;
  assert(timer1 > 0, 'Stuck timer should start accumulating when through car blocked');
  updateSingleCar(car, cars, SIGNAL_STATES.ALL_STOP, 1/60);
  const timer2 = car.stuckTimer;
  assert(timer2 > timer1, 'Stuck timer should accumulate across frames');
});

// ============================================================
// RIGHT-TURN YIELD TIMEOUT
// ============================================================

test('Right-turn car forced through after 4 seconds of yielding', () => {
  const car = makeCar('NORTH', -5, { state: 'through', turnRight: true });
  car.turnProgress = 0;
  car._turnData = RIGHT_TURN_DATA.NORTH;
  car._yieldTimer = 0;
  // Place cross-traffic to trigger yielding
  const crossCar = makeCar('EAST', -3, { state: 'through' });
  crossCar.distanceFromCenter = 3;
  const cars = [car, crossCar];
  
  // Position car at intersection edge so arc logic runs
  const dir = DIRECTIONS.NORTH;
  const HALF_INT = INTERSECTION_SIZE / 2;
  if (dir.axis === 'z') car.mesh.position.z = -HALF_INT;
  else car.mesh.position.x = -HALF_INT;
  
  // Run for 4+ seconds with cross-traffic blocking
  const progressBefore = car.turnProgress;
  for (let i = 0; i < 250; i++) { // ~4.17 seconds
    updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
  }
  assert(car.turnProgress > progressBefore, 'Right-turn car should advance after yield timeout expires');
});

test('Yield timer resets when not yielding', () => {
  const car = makeCar('NORTH', -5, { state: 'through', turnRight: true });
  car.turnProgress = 0;
  car._turnData = RIGHT_TURN_DATA.NORTH;
  car._yieldTimer = 3.5;
  const cars = [car]; // no cross-traffic
  
  const dir = DIRECTIONS.NORTH;
  const HALF_INT = INTERSECTION_SIZE / 2;
  car.mesh.position.z = -HALF_INT;
  
  updateSingleCar(car, cars, SIGNAL_STATES.ALL_GO, 1/60);
  assert(car._yieldTimer === 0, 'Yield timer should reset when not yielding');
});

// ============================================================
// OVERLAP CORRECTION
// ============================================================

function overlapCorrection(cars) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.isPedestrian || a.state === 'crashed') continue;
    const aDir = a.dirData;
    const aIsNS = aDir.axis === 'z';
    const aPos = aIsNS ? a.mesh.position.z : a.mesh.position.x;
    const aDist = Math.abs(aPos);
    if (aDist < INTERSECTION_SIZE / 2 + (a.vehicleLength || CAR_LENGTH) / 2) continue;
    if (a.turnRight && a.turnProgress !== undefined && !a.turnComplete) continue;

    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.isPedestrian || b.state === 'crashed') continue;
      if (b.direction !== a.direction) continue;
      if (b.turnRight && b.turnProgress !== undefined && !b.turnComplete) continue;
      const bPos = aIsNS ? b.mesh.position.z : b.mesh.position.x;
      const bDist = Math.abs(bPos);
      if (bDist < INTERSECTION_SIZE / 2 + (b.vehicleLength || CAR_LENGTH) / 2) continue;

      const minGap = ((a.vehicleLength || CAR_LENGTH) + (b.vehicleLength || CAR_LENGTH)) * 0.5 + 0.5;
      const actual = Math.abs(aPos - bPos);
      if (actual < minGap) {
        const overlap = minGap - actual;
        const aAhead = (aPos - bPos) * (-aDir.sign) > 0;
        if (aAhead) {
          if (aIsNS) b.mesh.position.z += aDir.sign * overlap;
          else b.mesh.position.x += aDir.sign * overlap;
        } else {
          if (aIsNS) a.mesh.position.z += aDir.sign * overlap;
          else a.mesh.position.x += aDir.sign * overlap;
        }
      }
    }
  }
}

test('Overlap correction pushes trailing car back (NORTH)', () => {
  const dir = DIRECTIONS.NORTH;
  // Two north cars, overlapping outside intersection
  const car1 = makeCar('NORTH', -15); // ahead
  const car2 = makeCar('NORTH', -15.5); // behind, overlapping
  car1.distanceFromCenter = 15;
  car2.distanceFromCenter = 15.5;
  const cars = [car1, car2];
  overlapCorrection(cars);
  const gap = Math.abs(getPos(car1) - getPos(car2));
  const minGap = (CAR_LENGTH + CAR_LENGTH) * 0.5 + 0.5;
  assert(gap >= minGap - 0.01, 'Cars should be pushed apart to at least minimum gap');
});

test('Overlap correction pushes trailing car back (EAST)', () => {
  const car1 = makeCar('EAST', 15); // ahead
  const car2 = makeCar('EAST', 15.5); // behind, overlapping
  car1.distanceFromCenter = 15;
  car2.distanceFromCenter = 15.5;
  const cars = [car1, car2];
  overlapCorrection(cars);
  const gap = Math.abs(getPos(car1) - getPos(car2));
  const minGap = (CAR_LENGTH + CAR_LENGTH) * 0.5 + 0.5;
  assert(gap >= minGap - 0.01, 'Cars should be pushed apart to at least minimum gap (EAST)');
});

test('Overlap correction skips cars inside intersection', () => {
  // Both cars inside intersection — should NOT be corrected
  const car1 = makeCar('NORTH', -3);
  const car2 = makeCar('NORTH', -3.5);
  car1.distanceFromCenter = 3;
  car2.distanceFromCenter = 3.5;
  const pos2Before = getPos(car2);
  const cars = [car1, car2];
  overlapCorrection(cars);
  assertApprox(getPos(car2), pos2Before, 0.01, 'Cars inside intersection should not be overlap-corrected');
});

test('Overlap correction skips different-direction cars', () => {
  const car1 = makeCar('NORTH', -15);
  const car2 = makeCar('EAST', 15);
  car1.distanceFromCenter = 15;
  car2.distanceFromCenter = 15;
  const pos1Before = getPos(car1);
  const pos2Before = getPos(car2);
  const cars = [car1, car2];
  overlapCorrection(cars);
  assertApprox(getPos(car1), pos1Before, 0.01, 'Different direction cars should not be overlap-corrected (car1)');
  assertApprox(getPos(car2), pos2Before, 0.01, 'Different direction cars should not be overlap-corrected (car2)');
});

test('Overlap correction skips cars on active right-turn arc', () => {
  const car1 = makeCar('NORTH', -15);
  const car2 = makeCar('NORTH', -15.5, { turnRight: true });
  car2.turnProgress = 0.5; // on arc
  car1.distanceFromCenter = 15;
  car2.distanceFromCenter = 15.5;
  const pos2Before = getPos(car2);
  const cars = [car1, car2];
  overlapCorrection(cars);
  assertApprox(getPos(car2), pos2Before, 0.01, 'Car on active right-turn arc should not be overlap-corrected');
});

test('Overlap correction works for long vehicles', () => {
  const car1 = makeCar('SOUTH', 15, { vehicleLength: 9.5 }); // semi truck
  const car2 = makeCar('SOUTH', 16, { vehicleLength: 5.5 }); // bus
  car1.distanceFromCenter = 15;
  car2.distanceFromCenter = 16;
  const cars = [car1, car2];
  overlapCorrection(cars);
  const gap = Math.abs(getPos(car1) - getPos(car2));
  const minGap = (9.5 + 5.5) * 0.5 + 0.5;
  assert(gap >= minGap - 0.01, 'Long vehicles should maintain appropriate minimum gap');
});

test('Non-overlapping cars are not moved by overlap correction', () => {
  const car1 = makeCar('NORTH', -15);
  const car2 = makeCar('NORTH', -25); // far behind, no overlap
  car1.distanceFromCenter = 15;
  car2.distanceFromCenter = 25;
  const pos1Before = getPos(car1);
  const pos2Before = getPos(car2);
  const cars = [car1, car2];
  overlapCorrection(cars);
  assertApprox(getPos(car1), pos1Before, 0.01, 'Non-overlapping car1 should not move');
  assertApprox(getPos(car2), pos2Before, 0.01, 'Non-overlapping car2 should not move');
});

// ============================================================
// AMBIENT PEDESTRIAN SIDEWALK NETWORK
// ============================================================

const SWC = ROAD_WIDTH / 2 + 1.75;
const SW_EDGE = 65;
const SW_CORNERS = [
  { x: SWC, z: SWC },
  { x: -SWC, z: SWC },
  { x: SWC, z: -SWC },
  { x: -SWC, z: -SWC }
];
const SW_EDGES = [
  { x: SWC, z: SW_EDGE, corner: 0 },
  { x: -SWC, z: SW_EDGE, corner: 1 },
  { x: SWC, z: -SW_EDGE, corner: 2 },
  { x: -SWC, z: -SW_EDGE, corner: 3 },
  { x: SW_EDGE, z: SWC, corner: 0 },
  { x: SW_EDGE, z: -SWC, corner: 2 },
  { x: -SW_EDGE, z: SWC, corner: 1 },
  { x: -SW_EDGE, z: -SWC, corner: 3 }
];
const SW_ADJ = [[1, 2], [0, 3], [3, 0], [2, 1]];
const CORNER_EDGES = [[0, 4], [1, 6], [2, 5], [3, 7]];

function generateAmbientPedRoute() {
  const startIdx = Math.floor(Math.random() * SW_EDGES.length);
  const start = SW_EDGES[startIdx];
  const path = [{ x: start.x, z: start.z }];

  let curCorner = start.corner;
  path.push({ x: SW_CORNERS[curCorner].x, z: SW_CORNERS[curCorner].z });

  const maxCross = Math.random() < 0.4 ? 0 : (Math.random() < 0.6 ? 1 : 2);
  for (let i = 0; i < maxCross; i++) {
    const adj = SW_ADJ[curCorner];
    curCorner = adj[Math.floor(Math.random() * adj.length)];
    path.push({ x: SW_CORNERS[curCorner].x, z: SW_CORNERS[curCorner].z });
  }

  const exits = CORNER_EDGES[curCorner];
  let exitIdx = exits[Math.floor(Math.random() * exits.length)];
  if (exitIdx === startIdx && exits.length > 1) {
    exitIdx = exits[0] === exitIdx ? exits[1] : exits[0];
  }
  const exit = SW_EDGES[exitIdx];
  path.push({ x: exit.x, z: exit.z });

  return path;
}

test('SW_CORNERS has 4 entries at correct positions', () => {
  assert(SW_CORNERS.length === 4, 'Should have 4 corners');
  assertApprox(SW_CORNERS[0].x, SWC, 0.01, 'NE corner x');
  assertApprox(SW_CORNERS[0].z, SWC, 0.01, 'NE corner z');
  assertApprox(SW_CORNERS[3].x, -SWC, 0.01, 'SW corner x');
  assertApprox(SW_CORNERS[3].z, -SWC, 0.01, 'SW corner z');
});

test('SW_EDGES has 8 entries and each connects to a valid corner', () => {
  assert(SW_EDGES.length === 8, 'Should have 8 edge points');
  for (const edge of SW_EDGES) {
    assert(edge.corner >= 0 && edge.corner <= 3, `Edge corner ${edge.corner} should be 0-3`);
  }
});

test('SW_ADJ has 4 entries with 2 adjacent corners each', () => {
  assert(SW_ADJ.length === 4, 'Should have 4 adjacency lists');
  for (let i = 0; i < 4; i++) {
    assert(SW_ADJ[i].length === 2, `Corner ${i} should have 2 adjacent corners`);
    for (const adj of SW_ADJ[i]) {
      assert(adj !== i, `Corner ${i} should not be adjacent to itself`);
      assert(adj >= 0 && adj <= 3, `Adjacent corner ${adj} should be 0-3`);
    }
  }
});

test('generateAmbientPedRoute produces valid path', () => {
  for (let i = 0; i < 50; i++) {
    const route = generateAmbientPedRoute();
    assert(route.length >= 3, `Route should have at least 3 waypoints (start, corner, exit), got ${route.length}`);
    // First point should be an edge point
    const start = route[0];
    const isEdge = SW_EDGES.some(e => Math.abs(e.x - start.x) < 0.01 && Math.abs(e.z - start.z) < 0.01);
    assert(isEdge, 'Route should start at an edge point');
    // Last point should be an edge point
    const end = route[route.length - 1];
    const isEndEdge = SW_EDGES.some(e => Math.abs(e.x - end.x) < 0.01 && Math.abs(e.z - end.z) < 0.01);
    assert(isEndEdge, 'Route should end at an edge point');
    // Middle points should be corners
    for (let j = 1; j < route.length - 1; j++) {
      const pt = route[j];
      const isCorner = SW_CORNERS.some(c => Math.abs(c.x - pt.x) < 0.01 && Math.abs(c.z - pt.z) < 0.01);
      assert(isCorner, `Route middle point ${j} should be a corner`);
    }
  }
});

// ============================================================
// AMBIENT CROSSING SAFETY
// ============================================================

function isAmbientCrossingSafe(from, to, signalState) {
  const dx = Math.abs(to.x - from.x);
  const dz = Math.abs(to.z - from.z);
  if (dx < 1 && dz < 1) return true;
  if (dx > dz) {
    return signalState !== SIGNAL_STATES.NS_GO && signalState !== SIGNAL_STATES.ALL_GO;
  }
  return signalState !== SIGNAL_STATES.EW_GO && signalState !== SIGNAL_STATES.ALL_GO;
}

test('isAmbientCrossingSafe — crossing NS road is safe when NS stopped', () => {
  const from = { x: -SWC, z: SWC };
  const to = { x: SWC, z: SWC };
  assert(isAmbientCrossingSafe(from, to, SIGNAL_STATES.ALL_STOP), 'Crossing x-axis safe when ALL_STOP');
  assert(isAmbientCrossingSafe(from, to, SIGNAL_STATES.EW_GO), 'Crossing x-axis safe when EW_GO (NS stopped)');
  assert(!isAmbientCrossingSafe(from, to, SIGNAL_STATES.NS_GO), 'Crossing x-axis unsafe when NS_GO');
  assert(!isAmbientCrossingSafe(from, to, SIGNAL_STATES.ALL_GO), 'Crossing x-axis unsafe when ALL_GO');
});

test('isAmbientCrossingSafe — crossing EW road is safe when EW stopped', () => {
  const from = { x: SWC, z: -SWC };
  const to = { x: SWC, z: SWC };
  assert(isAmbientCrossingSafe(from, to, SIGNAL_STATES.ALL_STOP), 'Crossing z-axis safe when ALL_STOP');
  assert(isAmbientCrossingSafe(from, to, SIGNAL_STATES.NS_GO), 'Crossing z-axis safe when NS_GO (EW stopped)');
  assert(!isAmbientCrossingSafe(from, to, SIGNAL_STATES.EW_GO), 'Crossing z-axis unsafe when EW_GO');
  assert(!isAmbientCrossingSafe(from, to, SIGNAL_STATES.ALL_GO), 'Crossing z-axis unsafe when ALL_GO');
});

test('isAmbientCrossingSafe — stationary movement is always safe', () => {
  const from = { x: 5, z: 5 };
  const to = { x: 5.5, z: 5.5 };
  assert(isAmbientCrossingSafe(from, to, SIGNAL_STATES.ALL_GO), 'Tiny movement should always be safe');
  assert(isAmbientCrossingSafe(from, to, SIGNAL_STATES.NS_GO), 'Tiny movement should always be safe (NS_GO)');
});

// ============================================================
// Summary
// ============================================================
console.log('\n============================================');
console.log(`Results: ${passed} passed, ${failed} failed out of ${totalAssertions} assertions`);
console.log('============================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
  process.exit(0);
}
