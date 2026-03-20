interface Props {
  svgWidth: number;
  svgHeight: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export default function MoveLine({ svgWidth, svgHeight, x1, y1, x2, y2 }: Props) {
  return (
    <svg
      className="absolute inset-0 pointer-events-none z-20"
      width={svgWidth}
      height={svgHeight}
    >
      <defs>
        <filter id="mlGlow" x="0" y="0" width={svgWidth} height={svgHeight} filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
        <filter id="mlSoft" x="0" y="0" width={svgWidth} height={svgHeight} filterUnits="userSpaceOnUse">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
        </filter>
      </defs>
      <style>{`@keyframes mlDash { to { stroke-dashoffset: -14; } }`}</style>
      {/* Wide hazy glow — animated dashes, heavily blurred */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="white" strokeWidth={6} strokeLinecap="round" opacity={0.25}
        strokeDasharray="8 6" filter="url(#mlGlow)"
        style={{ animation: 'mlDash 0.4s linear infinite' }} />
      {/* Soft dashes — lightly blurred */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="rgba(255,255,255,0.55)" strokeWidth={2} strokeLinecap="round"
        strokeDasharray="8 6" filter="url(#mlSoft)"
        style={{ animation: 'mlDash 0.4s linear infinite' }} />
    </svg>
  );
}
