import React from "react";

type StaticNumberFlowProps = {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
};

/**
 * FleaTooltip only needs a readable total value here. Keep this deliberately
 * simple: one ordinary text node, no Shadow DOM, animation, transforms or
 * locale-dependent grouping.
 */
export default function StaticNumberFlow({
  value,
  prefix = "",
  suffix = "",
  className,
}: StaticNumberFlowProps): JSX.Element {
  const safeValue = Number.isFinite(value) ? Math.trunc(value) : 0;
  const formattedValue = safeValue
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return (
    <span className={className}>
      {prefix}
      {formattedValue}
      {suffix}
    </span>
  );
}

// PriceList still imports this hook from @number-flow/react, but its return
// value is not used. Keep a tiny compatibility stub until that import is
// removed from PriceList itself.
export function useCanAnimate(): boolean {
  return false;
}
