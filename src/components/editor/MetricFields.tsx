// Rendered inside the Editor client boundary.
import type { ConnectorMetric, Metric, WallConfig } from "@/lib/config";
import { connectorSpec, metricSpec } from "@/lib/connectors/catalog";
import type { WallView } from "@/lib/site";
import { metricFromOption, OPTION_GROUPS, optionValue } from "@/components/editor/metric-options";

interface Props {
  metric: Metric;
  onChange: (m: Metric) => void;
  config: WallConfig;
  wall: WallView | null;
}

const num = (v: string) => {
  const n = Number(v.replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function MetricFields({ metric, onChange, config, wall }: Props) {
  return (
    <>
      <div className="metric-head">
        <label className="field">
          <span>Shows</span>
          <select value={optionValue(metric)} onChange={(e) => onChange(metricFromOption(e.target.value, config, wall))}>
            {OPTION_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {metric.kind === "connector" ? <ConnectorFields metric={metric} onChange={onChange} wall={wall} /> : <LocalFields metric={metric} onChange={onChange} />}
    </>
  );
}

function LocalFields({ metric, onChange }: { metric: Exclude<Metric, ConnectorMetric>; onChange: (m: Metric) => void }) {
  switch (metric.kind) {
    case "goal":
      return (
        <div className="row">
          <TextField label="Label" value={metric.label} onChange={(label) => onChange({ ...metric, label })} max={32} />
          <TextField label="Before" value={metric.prefix} onChange={(prefix) => onChange({ ...metric, prefix })} max={4} narrow placeholder="$" />
          <NumberField label="Now" value={metric.current} onChange={(current) => onChange({ ...metric, current })} />
          <NumberField label="Goal" value={metric.target} onChange={(target) => onChange({ ...metric, target })} />
          <TextField label="After" value={metric.suffix} onChange={(suffix) => onChange({ ...metric, suffix })} max={4} narrow placeholder="km" />
        </div>
      );
    case "number":
      return (
        <div className="row">
          <TextField label="Label" value={metric.label} onChange={(label) => onChange({ ...metric, label })} max={32} placeholder="open PRs" />
          <TextField label="Before" value={metric.prefix} onChange={(prefix) => onChange({ ...metric, prefix })} max={4} narrow />
          <NumberField label="Value" value={metric.value} onChange={(value) => onChange({ ...metric, value })} />
          <TextField label="After" value={metric.suffix} onChange={(suffix) => onChange({ ...metric, suffix })} max={4} narrow />
        </div>
      );
    case "countdown":
      return (
        <div className="row">
          <TextField label="Words after the number" value={metric.label} onChange={(label) => onChange({ ...metric, label })} max={32} placeholder="until launch" />
          <label className="field">
            <span>Date</span>
            <input type="date" value={metric.date} onChange={(e) => onChange({ ...metric, date: e.target.value })} />
          </label>
        </div>
      );
    case "year-progress":
      return null;
  }
}

function ConnectorFields({ metric, onChange, wall }: { metric: ConnectorMetric; onChange: (m: Metric) => void; wall: WallView | null }) {
  const connector = connectorSpec(metric.source);
  const spec = metricSpec(metric.source, metric.field);
  if (!connector || !spec) return null;
  const connections = wall?.connections.filter((c) => c.source === metric.source) ?? [];

  return (
    <>
      {spec.params.length > 0 ? (
        <div className="row">
          {spec.params.map((p) => (
            <TextField
              key={p.name}
              label={p.label}
              value={metric.params[p.name] ?? ""}
              placeholder={p.placeholder}
              max={p.maxLength}
              code
              onChange={(v) => onChange({ ...metric, params: { ...metric.params, [p.name]: v.trim().replace(/^@/, "") } })}
            />
          ))}
        </div>
      ) : null}

      {connector.connection ? (
        !wall ? (
          <p className="hint">Save your wallpaper first, then connect {connector.label} below.</p>
        ) : connections.length === 0 ? (
          <p className="hint">Connect {connector.label} in the Connections section below, then pick it here.</p>
        ) : (
          <div className="row">
            <label className="field">
              <span>{connector.label} connection</span>
              <select value={metric.connection} onChange={(e) => onChange({ ...metric, connection: e.target.value })}>
                <option value="">Choose…</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )
      ) : null}

      <div className="row">
        <TextField label="Label" value={metric.label} onChange={(label) => onChange({ ...metric, label })} max={32} />
        <TextField label="Before" value={metric.prefix} onChange={(prefix) => onChange({ ...metric, prefix })} max={4} narrow />
        <TextField label="After" value={metric.suffix} onChange={(suffix) => onChange({ ...metric, suffix })} max={4} narrow />
        <label className="field">
          <span>Goal (optional)</span>
          <input
            inputMode="decimal"
            value={metric.target ?? ""}
            placeholder="adds a bar"
            onChange={(e) => {
              const target = num(e.target.value);
              onChange({ ...metric, target: target > 0 ? target : undefined });
            }}
          />
        </label>
      </div>
      {connector.pro && !wall?.pro ? <p className="hint">The preview shows the live number. Your phone gets it once Pro is on.</p> : null}
    </>
  );
}

function TextField(props: { label: string; value: string; onChange: (v: string) => void; max?: number; placeholder?: string; narrow?: boolean; code?: boolean }) {
  return (
    <label className={`field${props.narrow ? " narrow" : ""}`}>
      <span>{props.label}</span>
      <input
        value={props.value}
        maxLength={props.max}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        {...(props.code ? { autoCapitalize: "off", autoCorrect: "off", spellCheck: false } : {})}
      />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(num(e.target.value))} />
    </label>
  );
}
