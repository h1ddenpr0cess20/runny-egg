/**
 * One morning's worth of colour. Eggscape was a green wireframe and the city
 * after it was a wet night; this one is a field at about nine in the morning,
 * which is the only weather an egg race is ever held in.
 *
 * The rule the palette is built on: the track and the field it crosses are
 * muted, and the only saturated things in the whole world are the eggs, the
 * bunting and the bars. Anything you have to see coming at sixteen metres a
 * second is allowed a colour; nothing else is.
 */
export const THEME = {
  /** Sky, from the top of it down to the haze the far end dissolves into. */
  zenith: 0x5fa8d8,
  sky: 0x9fcbe8,
  horizon: 0xdfe9ec,
  haze: 0xcfdfe2,
  sun: 0xfff4d2,

  /** Ground. Turf either side, and whatever they have laid between the chalk. */
  turf: 0x6f9445,
  turfDark: 0x4e7333,
  dirt: 0x9c7c52,
  cinder: 0xa8613f,
  chalk: 0xf4f2e7,

  /** Trackside. Posts, rails, the trees behind them and what is nailed on. */
  wood: 0xa87f4e,
  post: 0x8a6a42,
  bark: 0x6d5439,
  leaf: 0x54803a,
  leafPale: 0x7ba352,

  /** Things on the track. */
  bar: 0xf0ede3,
  barStripe: 0xd8483f,
  stone: 0x9a968d,
  root: 0x7a5c3c,

  /** Things worth going near. */
  crumb: 0xf2c65c,
  crust: 0xd8a03f,
  feather: 0xffd24a,
  featherPale: 0xfff0b8,
  straw: 0xd8b85a,
  strawPale: 0xeed49a,
  puff: 0xeaf4ff,
  patch: 0x7fd6a0,
  yolk: 0xf6b32b,
  white: 0xfdf6e6,

  /** The crowd, which has wings. */
  bird: 0x3c3a38,
  birdPale: 0xcfc6b4,
  beak: 0xe0a33c,

  /** What the bunting is dyed. */
  bunting: [0xe4573f, 0xf2c14e, 0x59a1c4, 0xdd7fa8, 0x7fbf6a],

  shadow: 0x2a3320,
};

export const CSS = {
  ink: '#33301f',
  chalk: '#f7f4e8',
  turf: '#4e7333',
  yolk: '#f6b32b',
  crack: '#c0492f',
  sky: '#9fcbe8',
};
