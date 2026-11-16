// The look plan, in one place: a night glassworks. Six values and one amber accent; the
// lighting makes every shade the game needs. The same names are the CSS custom properties
// in index.html. Two extra tints (glass panes, furnace glow) are derived in world.js.
export const PALETTE = {
  canvas: '#0c1016',
  surface: '#161c24',
  hairline: '#232c38',
  ink: '#e8e4da',
  muted: '#8b96a3',
  accent: '#f59f2c',
};

export function shade(name) {
  return PALETTE[name];
}
