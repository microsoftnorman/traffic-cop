// ============================================================
// js/constants.js — All game constants
// ============================================================
export const ROAD_WIDTH = 10;
export const ROAD_LENGTH = 70;
export const INTERSECTION_SIZE = ROAD_WIDTH;
export const CAR_LENGTH = 3.2;
export const CAR_WIDTH = 1.8;
export const CAR_HEIGHT = 1.4;
export const STOP_LINE_DIST = 9.5;
export const CROSSWALK_DIST = STOP_LINE_DIST - 2.5;
export const SPAWN_DIST = 65;
export const EXIT_DIST = 70;
export const LANE_OFFSET = 2.2;

export const RIGHT_TURN_CHANCE = 0.15;
export const TURN_RADIUS = INTERSECTION_SIZE / 2 - LANE_OFFSET;
export const NO_TURN_TYPES = ['bus', 'semi', 'firetruck'];
export const BUS_STOP_DIST = 25;
export const BUS_STOP_DURATION_MIN = 3.0;
export const BUS_STOP_DURATION_MAX = 5.0;

export const DIRECTIONS = {
  NORTH: { name: 'North', axis: 'z', sign: -1, perpAxis: 'x', laneOffset: -LANE_OFFSET, angle: 0 },
  SOUTH: { name: 'South', axis: 'z', sign: 1,  perpAxis: 'x', laneOffset: LANE_OFFSET, angle: Math.PI },
  EAST:  { name: 'East',  axis: 'x', sign: -1, perpAxis: 'z', laneOffset: LANE_OFFSET, angle: Math.PI / 2 },
  WEST:  { name: 'West',  axis: 'x', sign: 1,  perpAxis: 'z', laneOffset: -LANE_OFFSET, angle: -Math.PI / 2 }
};

export const RIGHT_TURN_DATA = {
  NORTH: { exitDir: 'WEST',  cx: -INTERSECTION_SIZE/2, cz: -INTERSECTION_SIZE/2, a0: 0,              a1: Math.PI/2,     r0: 0,           r1: -Math.PI/2 },
  SOUTH: { exitDir: 'EAST',  cx:  INTERSECTION_SIZE/2, cz:  INTERSECTION_SIZE/2, a0: Math.PI,         a1: 3*Math.PI/2,   r0: Math.PI,     r1: Math.PI/2 },
  EAST:  { exitDir: 'NORTH', cx: -INTERSECTION_SIZE/2, cz:  INTERSECTION_SIZE/2, a0: 3*Math.PI/2,     a1: 2*Math.PI,     r0: Math.PI/2,   r1: 0 },
  WEST:  { exitDir: 'SOUTH', cx:  INTERSECTION_SIZE/2, cz: -INTERSECTION_SIZE/2, a0: Math.PI/2,       a1: Math.PI,       r0: -Math.PI/2,  r1: -Math.PI }
};

export const SIGNAL_STATES = {
  ALL_GO: 'ALL_GO',
  ALL_STOP: 'ALL_STOP',
  EW_GO: 'EW_GO',
  NS_GO: 'NS_GO'
};

export const CAR_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6,
  0x1abc9c, 0xe67e22, 0xecf0f1, 0x34495e, 0xf1c40f,
  0xd35400, 0x8e44ad, 0x16a085, 0x2980b9, 0xc0392b
];

export const HOLD_DURATION = 1.0;
export const FACING_NAMES = ['North', 'East', 'South', 'West'];
export const FACING_ANGLES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

export const SIDEWALK_CENTER = ROAD_WIDTH / 2 + 1.75;
