// Shared JSDoc types for the library code (no runtime content).

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {{min: number[], max: number[]}} Box */
/** @typedef {[number, number, number, number]} Rect  u0, v0, u1, v1 in a sheet's plane */

/**
 * A part of a compiled module or a connection.
 * @typedef {object} Part
 * @property {string} id
 * @property {string} role
 * @property {string} material
 * @property {string} catalog
 * @property {Box} box
 * @property {string} [stage]
 * @property {string} [layer]  the build-up layer the part is cut from
 * @property {string} [sheet]  the whole sheet a piece belongs to
 * @property {string} [host]   a connection part's host role
 * @property {import('./solids.js').Frame} [frame]  a sloped part: box is in this frame (solids.js)
 * @property {import('./solids.js').Cut[]} [cuts]
 * @property {import('./solids.js').Notch[]} [notches]
 */

/**
 * A fastening schedule entry (system.yaml fastening, or a layer's).
 * @typedef {object} FasteningEntry
 * @property {string} fastener
 * @property {string} from
 * @property {string} [along]
 * @property {number} [spacing]
 * @property {number} [edge_spacing]
 * @property {number} [end_distance]
 * @property {number} [count]
 * @property {string} [method]
 */

/**
 * A build-up layer, resolved (sheet replaced by its catalog entry).
 * @typedef {object} Layer
 * @property {string} role
 * @property {string} stage
 * @property {object} [sheet]
 * @property {FasteningEntry} [fastening]
 */

/**
 * What a joint check knows about one side's part.
 * @typedef {object} PartInfo
 * @property {string} label
 * @property {Box} box
 * @property {import('./solids.js').Frame} [frame]  a sloped part (solids.js)
 * @property {import('./solids.js').Cut[]} [cuts]
 * @property {import('./solids.js').Notch[]} [notches]
 * @property {string} stage
 * @property {string} entity  what the part belongs to (a connection part's host)
 * @property {Layer | null} layer
 */

/**
 * A joint before fastening, and after.
 * @typedef {{type: string, parts: Object<string, *>}} JointIn
 * @typedef {{id: string, type: string, parts: Object<string, *>, stage: string,
 *            fasteners: {item: string, count: number}}} Joint
 */

export {};
