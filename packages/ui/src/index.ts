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
        --paper: #eef4fb;
        --paper-strong: #d8e5f4;
        --ink: #0d2038;
        --muted: #4c6481;
        --line: rgba(13, 32, 56, 0.14);
        --accent: #f28c28;
        --accent-soft: rgba(242, 140, 40, 0.16);
        --attention: #b7f34d;
        --attention-soft: rgba(183, 243, 77, 0.2);
        --success: #7ecf29;
        --success-soft: rgba(126, 207, 41, 0.18);
        --danger: #d4442f;
        --danger-soft: rgba(212, 68, 47, 0.14);
        --navy-strong: #102744;
        --navy-soft: #18365b;
        font-family: "IBM Plex Sans", "Iosevka Etoile", sans-serif;
        background: #dce8f5;
        color: var(--ink);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background:
          radial-gradient(circle at top left, rgba(16, 39, 68, 0.18), transparent 24rem),
          radial-gradient(circle at top right, rgba(183, 243, 77, 0.18), transparent 20rem),
          radial-gradient(circle at bottom right, rgba(242, 140, 40, 0.16), transparent 28rem),
          linear-gradient(145deg, #eff5fb 0%, #d9e6f4 100%);
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
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(236, 244, 251, 0.96)),
          linear-gradient(90deg, rgba(16, 39, 68, 0.06), rgba(183, 243, 77, 0.06));
        box-shadow: 0 1.5rem 4rem rgba(16, 39, 68, 0.14);
      }

      .hero-eyebrow {
        margin: 0;
        color: var(--navy-soft);
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
        background: var(--attention-soft);
        border-color: rgba(126, 207, 41, 0.32);
      }

      .notice-error {
        background: var(--danger-soft);
        border-color: rgba(212, 68, 47, 0.28);
      }

      .notice-info {
        background: var(--accent-soft);
        border-color: rgba(242, 140, 40, 0.28);
      }

      .grid {
        display: grid;
        gap: 1rem;
        margin-top: 1rem;
      }

      .login-shell {
        padding-top: 1.25rem;
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
        background: rgba(250, 253, 255, 0.92);
      }

      .login-card {
        width: min(100%, 40rem);
        margin: 0 auto;
        padding: 1.55rem 1.45rem 1.35rem;
        border-radius: 1.45rem;
        box-shadow: 0 1.25rem 2.8rem rgba(16, 39, 68, 0.14);
      }

      .login-card h2 {
        margin-bottom: 0.8rem;
        font-size: 1.65rem;
      }

      .login-card .stack {
        gap: 1rem;
      }

      .login-card input {
        min-height: 3.35rem;
        padding: 0.9rem 1rem;
      }

      .login-card button {
        min-height: 3.4rem;
        font-size: 1.05rem;
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
        border: 1px solid rgba(13, 32, 56, 0.08);
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
        border: 1px solid rgba(16, 39, 68, 0.18);
        background: rgba(255, 255, 255, 0.9);
        color: var(--ink);
      }

      input:focus,
      textarea:focus,
      select:focus {
        outline: 2px solid rgba(183, 243, 77, 0.42);
        border-color: rgba(16, 39, 68, 0.42);
        box-shadow: 0 0 0 0.25rem rgba(183, 243, 77, 0.16);
      }

      textarea {
        min-height: 7rem;
        resize: vertical;
      }

      button {
        border: none;
        border-radius: 999px;
        padding: 0.75rem 1rem;
        background: linear-gradient(135deg, var(--navy-soft), var(--navy-strong));
        color: #f5fbff;
        cursor: pointer;
        box-shadow: 0 0.8rem 1.8rem rgba(16, 39, 68, 0.18);
      }

      button.secondary {
        background: linear-gradient(135deg, #f5a13a, var(--accent));
        color: #1b1309;
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
        background: var(--attention-soft);
        color: #557d16;
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
