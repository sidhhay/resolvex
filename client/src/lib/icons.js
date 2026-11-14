/**
 * Explicit icon registry.
 *
 * Several components pick an icon by name from data (status metadata, stat
 * tiles). Resolving that with `import * as icons from 'lucide-react'` would
 * pull the entire icon set into the bundle — tree-shaking cannot follow a
 * dynamic property lookup — so the icons the app actually uses are named here
 * and looked up in this map instead.
 */
import {
  Archive,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Circle,
  CircleCheck,
  Inbox,
  Minus,
  Search,
  TriangleAlert,
  UserCheck,
} from 'lucide-react';

/** @type {Record<string, React.ComponentType<any>>} */
export const ICONS = {
  Archive,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Circle,
  CircleCheck,
  Inbox,
  Minus,
  Search,
  TriangleAlert,
  UserCheck,
};

/**
 * @param {string | undefined} name
 * @returns {React.ComponentType<any>}
 */
export function iconFor(name) {
  return (name && ICONS[name]) || Circle;
}
