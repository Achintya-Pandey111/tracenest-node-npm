'use strict';

const { formatDuration, formatTime } = require('./time');

// ANSI Color escapes
const ESC = '\x1b[';
const colors = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  italic: `${ESC}3m`,
  underline: `${ESC}4m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  gray: `${ESC}90m`,
  bgRed: `${ESC}41m`,
  bgGreen: `${ESC}42m`,
  bgYellow: `${ESC}43m`,
  bgBlue: `${ESC}44m`
};

/**
 * Colorizer function factory that respects color enable/disable flag.
 * @param {boolean} enabled
 */
function createStyler(enabled = true) {
  const style = (colorCode, text) => (enabled ? `${colorCode}${text}${colors.reset}` : String(text));

  return {
    bold: (t) => style(colors.bold, t),
    dim: (t) => style(colors.dim, t),
    red: (t) => style(colors.red, t),
    green: (t) => style(colors.green, t),
    yellow: (t) => style(colors.yellow, t),
    blue: (t) => style(colors.blue, t),
    magenta: (t) => style(colors.magenta, t),
    cyan: (t) => style(colors.cyan, t),
    gray: (t) => style(colors.gray, t),
    white: (t) => style(colors.white, t)
  };
}

/**
 * Checks whether colors should be enabled based on options and environment.
 * @param {object} [options]
 * @returns {boolean}
 */
function shouldEnableColor(options = {}) {
  if (options.color === false || options.noColor) return false;
  if (process.env.NO_COLOR && process.env.NO_COLOR !== '0') return false;
  if (options.color === true) return true;
  return Boolean(process.stdout && process.stdout.isTTY);
}

module.exports = {
  colors,
  createStyler,
  shouldEnableColor,
  formatDuration,
  formatTime
};
