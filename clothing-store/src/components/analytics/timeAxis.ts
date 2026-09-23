/**
 * Shared X-axis settings for time series.
 *
 * Bucketing keeps the point count sane, but labels still overprint once a chart
 * carries more than a couple of dozen of them. These helpers give every time
 * series the same tick thinning and rotation rules, so a long range degrades
 * identically everywhere instead of each chart inventing its own behaviour.
 */

/**
 * Show at most `maxTicks` labels by skipping the rest.
 *
 * Recharts takes `interval` as "how many ticks to skip between labels", so this
 * is a count-to-stride conversion. Returning 0 means label everything.
 */
export function tickInterval(pointCount: number, maxTicks = 14): number {
  if (pointCount <= maxTicks) return 0;
  return Math.ceil(pointCount / maxTicks) - 1;
}

/**
 * Rotate labels once they get dense.
 *
 * Angled text costs vertical space, so it is only worth it when horizontal
 * space has actually run out.
 */
export function axisAngle(pointCount: number): { angle: number; height: number } {
  if (pointCount <= 12) return { angle: 0, height: 30 };
  return { angle: -35, height: 56 };
}

/** Bar width that shrinks as the series grows, with a readable floor. */
export function barSize(pointCount: number, max = 28): number {
  if (pointCount <= 0) return max;
  return Math.max(4, Math.min(max, Math.floor(420 / pointCount)));
}

/** Props to spread onto a recharts `XAxis` for a time series. */
export function timeAxisProps(pointCount: number, maxTicks = 14) {
  const { angle, height } = axisAngle(pointCount);

  return {
    interval: tickInterval(pointCount, maxTicks),
    angle,
    height,
    textAnchor: angle === 0 ? ("middle" as const) : ("end" as const),
    tick: { fontSize: 11 },
    stroke: "#6b7280",
    minTickGap: 4,
  };
}
