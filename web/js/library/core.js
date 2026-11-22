// The library core as library code gets it: compilers (compile(params,
// core)), implementations (build(participants, core)) and derived modules
// (derive(params, input, core)) take it as an argument and import nothing,
// so they run wherever they are loaded from.
import { applyBox, invert } from '../engine/affine.js';
import * as geometry from './geometry.js';
import * as framing from './framing.js';
import * as walls from './walls.js';
import * as solids from './solids.js';
import { contact } from './geometry.js';
import { faceToFace, nailable } from './framing.js';

export const CORE = Object.freeze({ contact, faceToFace, nailable, applyBox, invert, geometry, framing, walls, solids });
