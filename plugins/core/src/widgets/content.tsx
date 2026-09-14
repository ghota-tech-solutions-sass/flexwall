import { asType, defineWidget, displayAdvance, field } from "@flexwall/sdk";
import { Col, Fill, Row, Text, fitFont } from "@flexwall/sdk/ui";

/** A title and a few lines of text, typed by the owner or fed by a text metric. */
export const note = defineWidget<{ title: string; body: string }>({
  id: "note",
  name: "Note",
  description: "A title and a short text. What you're building, where you are, what's next.",
  category: "content",
  inputs: [{ key: "text", label: "Text from a connector", accepts: ["text"], optional: true }],
  options: [field.text("title", "Title", { maxLength: 60, optional: true }), field.textarea("body", "Text", { maxLength: 280, optional: true })],
  size: { default: [2, 1], min: [1, 1], max: [4, 2] },

  render({ inputs, options, area, theme, u }) {
    const body = asType(inputs.text?.value, "text")?.value || options.body;
    const size = area.width < 100 ? 11 : 13;
    const lineHeight = size * 1.4;
    const titleHeight = options.title ? (size + 3) * 1.25 + 6 : 0;
    // As many whole lines as the tile holds: a note is cut between lines, never through one.
    const lines = Math.max(1, Math.floor((area.height - titleHeight) / lineHeight));
    return (
      <Col style={{ width: "100%", height: "100%" }}>
        {options.title ? (
          <Text style={{ fontSize: u(size + 3), lineHeight: 1.25, color: theme.ink, fontFamily: theme.display.family, fontWeight: theme.display.weight, marginBottom: u(6) }}>
            {options.title}
          </Text>
        ) : null}
        <div style={{ display: "flex", height: u(lines * lineHeight), fontSize: u(size), lineHeight: 1.4, color: theme.muted, overflow: "hidden", whiteSpace: "pre-wrap" }}>{body || " "}</div>
      </Col>
    );
  },
});

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function LinkBody({ title, url, subtitle, width, theme, u }: { title: string; url: string; subtitle: string; width: number; theme: Parameters<typeof note.render>[0]["theme"]; u: Parameters<typeof note.render>[0]["u"] }) {
  return (
    <Col style={{ width: "100%", height: "100%", justifyContent: "space-between" }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <Text style={{ fontSize: u(11), color: theme.muted }}>{hostOf(url)}</Text>
        <svg width={u(14)} height={u(14)} viewBox="0 0 24 24">
          <path d="M7 17L17 7M9 7h8v8" fill="none" stroke={theme.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Row>
      <Fill style={{ alignItems: "flex-end" }}>
        <Col>
          <Text style={{ fontSize: u(fitFont(title || hostOf(url), width, 16, displayAdvance(theme) * 0.9)), color: theme.ink, fontFamily: theme.display.family, fontWeight: theme.display.weight }}>{title || hostOf(url)}</Text>
          {subtitle ? <Text style={{ fontSize: u(11), color: theme.muted, marginTop: u(3) }}>{subtitle}</Text> : null}
        </Col>
      </Fill>
    </Col>
  );
}

/** A link to a product, a post, a profile. Clickable on the page, a labelled card on images. */
export const link = defineWidget<{ url: string; title: string; subtitle: string }>({
  id: "link",
  name: "Link",
  description: "A card linking to your product, a launch or another profile.",
  category: "content",
  inputs: [],
  options: [
    field.url("url", "Address", { placeholder: "https://…" }),
    field.text("title", "Title", { maxLength: 40, optional: true }),
    field.text("subtitle", "Subtitle", { maxLength: 60, optional: true }),
  ],
  size: { default: [1, 1], min: [1, 1], max: [2, 2] },
  render: ({ options, area, theme, u }) => <LinkBody title={options.title} url={options.url} subtitle={options.subtitle} width={area.width} theme={theme} u={u} />,
  renderPage: ({ options, area, theme, u }) => (
    // Owner-supplied link on a public page: never pass reputation, never give the target window access.
    <a href={options.url} target="_blank" rel="nofollow ugc noopener noreferrer" style={{ display: "flex", width: "100%", height: "100%", color: "inherit", textDecoration: "none" }}>
      <LinkBody title={options.title} url={options.url} subtitle={options.subtitle} width={area.width} theme={theme} u={u} />
    </a>
  ),
});
