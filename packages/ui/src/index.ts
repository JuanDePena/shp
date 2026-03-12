export interface PanelNotice {
  kind: "success" | "error" | "info";
  message: string;
}

export interface PanelShellProps {
  title: string;
  heading: string;
  eyebrow?: string;
  body: string;
  actions?: string;
  notice?: PanelNotice;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPanelShell(props: PanelShellProps): string {
  const noticeHtml = props.notice
    ? `<aside class="notice notice-${escapeHtml(props.notice.kind)}">${escapeHtml(
        props.notice.message
      )}</aside>`
    : "";
  const actionsHtml = props.actions ? `<div class="hero-actions">${props.actions}</div>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(props.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --paper: #f8f2e8;
        --paper-strong: #efe2cf;
        --ink: #1f1a14;
        --muted: #6d5d4b;
        --line: rgba(31, 26, 20, 0.12);
        --accent: #996438;
        --accent-soft: rgba(153, 100, 56, 0.12);
        --success: #0d6b48;
        --success-soft: rgba(13, 107, 72, 0.12);
        --danger: #9d2e2e;
        --danger-soft: rgba(157, 46, 46, 0.12);
        font-family: "IBM Plex Sans", "Iosevka Etoile", sans-serif;
        background: #eadfcb;
        color: var(--ink);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background:
          radial-gradient(circle at top left, rgba(153, 100, 56, 0.22), transparent 24rem),
          radial-gradient(circle at bottom right, rgba(89, 59, 34, 0.16), transparent 28rem),
          linear-gradient(145deg, #f4ecdf 0%, #e8dbc3 100%);
      }

      a {
        color: var(--accent);
      }

      code,
      pre,
      textarea,
      input,
      select,
      button {
        font: inherit;
      }

      .page {
        width: min(94rem, calc(100vw - 2rem));
        margin: 1rem auto 2rem;
      }

      .hero {
        display: grid;
        gap: 1rem;
        padding: 1.5rem;
        border: 1px solid var(--line);
        border-radius: 1.5rem;
        background: rgba(255, 251, 245, 0.9);
        box-shadow: 0 1.5rem 4rem rgba(73, 45, 19, 0.12);
      }

      .hero-eyebrow {
        margin: 0;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.74rem;
      }

      h1 {
        margin: 0;
        font-size: clamp(2.2rem, 4vw, 4rem);
        line-height: 0.95;
      }

      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .notice {
        padding: 0.8rem 1rem;
        border-radius: 1rem;
        border: 1px solid var(--line);
      }

      .notice-success {
        background: var(--success-soft);
        border-color: rgba(13, 107, 72, 0.24);
      }

      .notice-error {
        background: var(--danger-soft);
        border-color: rgba(157, 46, 46, 0.24);
      }

      .notice-info {
        background: var(--accent-soft);
        border-color: rgba(153, 100, 56, 0.24);
      }

      .grid {
        display: grid;
        gap: 1rem;
        margin-top: 1rem;
      }

      .grid-two {
        grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
      }

      .grid-three {
        grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      }

      .panel {
        padding: 1.1rem;
        border: 1px solid var(--line);
        border-radius: 1.2rem;
        background: rgba(255, 252, 247, 0.92);
      }

      .panel h2,
      .panel h3 {
        margin-top: 0;
      }

      .panel h2 {
        font-size: 1.2rem;
      }

      .stats {
        display: grid;
        gap: 0.8rem;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      }

      .stat {
        padding: 0.9rem 1rem;
        border-radius: 1rem;
        background: var(--paper);
        border: 1px solid rgba(31, 26, 20, 0.08);
      }

      .stat strong {
        display: block;
        font-size: 1.7rem;
        line-height: 1;
      }

      .stat span {
        color: var(--muted);
        font-size: 0.88rem;
      }

      .stack {
        display: grid;
        gap: 0.8rem;
      }

      .toolbar,
      .inline-form,
      .form-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      }

      label {
        display: grid;
        gap: 0.3rem;
        color: var(--muted);
        font-size: 0.88rem;
      }

      input,
      textarea,
      select {
        width: 100%;
        padding: 0.7rem 0.8rem;
        border-radius: 0.8rem;
        border: 1px solid rgba(31, 26, 20, 0.16);
        background: rgba(255, 255, 255, 0.85);
        color: var(--ink);
      }

      textarea {
        min-height: 7rem;
        resize: vertical;
      }

      button {
        border: none;
        border-radius: 999px;
        padding: 0.75rem 1rem;
        background: var(--accent);
        color: #fff8ef;
        cursor: pointer;
      }

      button.secondary {
        background: #403225;
      }

      button.danger {
        background: var(--danger);
      }

      .table-wrap {
        overflow-x: auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 0.7rem 0.55rem;
        border-bottom: 1px solid rgba(31, 26, 20, 0.09);
        vertical-align: top;
        text-align: left;
      }

      th {
        color: var(--muted);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        font-size: 0.82rem;
        background: var(--accent-soft);
        color: var(--accent);
      }

      .pill-success {
        background: var(--success-soft);
        color: var(--success);
      }

      .pill-danger {
        background: var(--danger-soft);
        color: var(--danger);
      }

      .pill-muted {
        background: rgba(31, 26, 20, 0.08);
        color: var(--muted);
      }

      .muted {
        color: var(--muted);
      }

      .empty {
        margin: 0;
        color: var(--muted);
      }

      details {
        border-top: 1px solid rgba(31, 26, 20, 0.08);
        padding-top: 0.75rem;
      }

      details + details {
        margin-top: 0.9rem;
      }

      summary {
        cursor: pointer;
        font-weight: 600;
      }

      .mono {
        font-family: "Iosevka Etoile", "IBM Plex Mono", monospace;
      }

      @media (max-width: 720px) {
        .page {
          width: min(100vw - 1rem, 94rem);
        }

        .hero,
        .panel {
          padding: 1rem;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="hero">
        <div>
          <p class="hero-eyebrow">${escapeHtml(props.eyebrow ?? "SimpleHost control plane")}</p>
          <h1>${escapeHtml(props.heading)}</h1>
        </div>
        ${noticeHtml}
        ${actionsHtml}
      </header>
      ${props.body}
    </main>
  </body>
</html>`;
}
