/** Data access for departments. */
import { query } from '../config/db.js';

/**
 * @typedef {Object} DepartmentRecord
 * @property {number} id
 * @property {string} name
 * @property {string} slug
 * @property {string | null} email
 * @property {number | null} hod_id
 * @property {string | null} hod_name
 * @property {string | null} hod_email
 */

const SELECT_DEPARTMENTS = `
  SELECT d.id, d.name, d.slug, d.email, d.hod_id,
         h.name AS hod_name, h.email AS hod_email
    FROM departments d
    LEFT JOIN users h ON h.id = d.hod_id
`;

/** @returns {Promise<DepartmentRecord[]>} */
export async function list() {
  const { rows } = await query(`${SELECT_DEPARTMENTS} ORDER BY d.name ASC`);
  return rows;
}

/**
 * @param {number} id
 * @returns {Promise<DepartmentRecord | null>}
 */
export async function findById(id) {
  const { rows } = await query(`${SELECT_DEPARTMENTS} WHERE d.id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * The classifier speaks in slugs; this is where a predicted category becomes a
 * routed department.
 * @param {string} slug
 * @returns {Promise<DepartmentRecord | null>}
 */
export async function findBySlug(slug) {
  const { rows } = await query(`${SELECT_DEPARTMENTS} WHERE d.slug = $1`, [slug]);
  return rows[0] ?? null;
}
