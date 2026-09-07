import React from "react";

type StaticNumberFlowProps = {
  value: number;
  locales?: string | string[];
  format?: Intl.NumberFormatOptions;
  prefix?: string;
  suffix?: string;
  className?: string;
};

/**
 * Compatibility replacement for @number-flow/react in FleaTooltip.
 *
 * The animated NumberFlow custom element renders multiple digit layers inside
 * a shadow root and positions them with CSS transforms. In the Electron build
 * used by FleaTooltip those layers can remain visually stacked in the Total
 * card. The total value does not need animation, so render the exact same
 * formatted number as ordinary text instead of using the animated custom
 * element.
 */
export default function StaticNumberFlow({
  value,
  locales,
  format,
  prefix = "",
  suffix = "",
  className,
}: StaticNumberFlowProps): JSX.Element {
  const formattedValue = new Intl.NumberFormat(locales, format).format(value);

  return (
    <span className={className}>
      {prefix}
      {formattedValue}
      {suffix}
    </span>
  );
}

// PriceList calls this hook but does not use its return value. Export a
// compatible implementation so the existing source does not need to change.
export function useCanAnimate(): boolean {
  return false;
}
