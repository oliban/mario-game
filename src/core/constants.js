export const SCREEN_W = 256;
export const SCREEN_H = 240;

export const TILE = 16;
export const TILES_X = SCREEN_W / TILE;
export const TILES_Y = SCREEN_H / TILE;

export const FPS = 60.0988;
export const DT = 1 / FPS;
export const MAX_FRAME_SKIP = 5;

export const HUD_H = 32;

export const LAYER = {
  SKY: 0,
  PARALLAX_FAR: 1,
  PARALLAX_NEAR: 2,
  BG_TILES: 3,
  BEHIND: 4,
  TILES: 5,
  ENTITIES: 6,
  PLAYER: 7,
  PARTICLES: 8,
  OVERLAY: 9,
  HUD: 10,
};

export const THEME = {
  OVERWORLD: 'overworld',
  UNDERGROUND: 'underground',
  CASTLE: 'castle',
  WATER: 'water',
  ATHLETIC: 'athletic',
};
