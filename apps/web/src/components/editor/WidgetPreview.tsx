/** Small schematic previews: no account data or fabricated performance figures. */
export function WidgetPreview({ id }: { id: string }) {
  return <svg className="ed-widget-preview" viewBox="0 0 160 70" aria-hidden="true">
    {id === "stat" ? <><rect x="18" y="12" width="43" height="4" rx="2" opacity=".22" fill="currentColor" /><text x="18" y="49" fontSize="32" fontWeight="700" fill="currentColor">123</text><rect x="18" y="58" width="124" height="4" rx="2" opacity=".15" fill="currentColor" /></> :
    id === "goal-ring" ? <><circle cx="80" cy="35" r="24" fill="none" stroke="currentColor" strokeWidth="5" opacity=".12" /><circle cx="80" cy="35" r="24" fill="none" stroke="var(--accent)" strokeWidth="5" strokeDasharray="105 151" transform="rotate(-90 80 35)" strokeLinecap="round" /></> :
    id === "bar-chart" ? <>{[20,32,26,39,35,45,42,52].map((h,i) => <rect key={i} x={16+i*17} y={62-h} width="11" height={h} rx="3" fill="var(--accent)" opacity={.3+i*.09} />)}</> :
    id === "heatmap" ? <>{Array.from({length:60},(_,i) => <rect key={i} x={15+Math.floor(i/5)*11} y={10+i%5*11} width="8" height="8" rx="2" fill="var(--accent)" opacity={.15+(i*7%5)*.2} />)}</> :
    ["sparkline","step-chart"].includes(id) ? <><path d={id === "step-chart" ? "M15 55H40V42H70V47H100V25H130V15H145" : "M15 55C30 55 30 32 50 38S75 55 95 30S120 35 145 13"} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" /><path d="M15 63H145" stroke="currentColor" opacity=".12" /></> :
    id === "time-left" ? <>{[0,1,2].map(i=><rect key={i} x="18" y={15+i*17} width={124-i*25} height="9" rx="4" fill="var(--accent)" opacity={.8-i*.25} />)}</> :
    id === "countdown" ? <text x="80" y="48" textAnchor="middle" fontSize="34" fontWeight="700" fill="currentColor">23</text> :
    <><rect x="18" y="14" width="84" height="7" rx="3" fill="currentColor" opacity=".65" /><rect x="18" y="32" width="124" height="4" rx="2" fill="currentColor" opacity=".2" /><rect x="18" y="43" width="96" height="4" rx="2" fill="currentColor" opacity=".2" />{id === "link" ? <path d="M120 12H141V33M141 12L120 33" fill="none" stroke="var(--accent)" strokeWidth="3" /> : null}</>}
  </svg>;
}
