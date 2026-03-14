export interface PanelNotice {
  kind: "success" | "error" | "info";
  message: string;
}

export interface PanelShellProps {
  lang?: string;
  title: string;
  heading: string;
  eyebrow?: string;
  body: string;
  actions?: string;
  notice?: PanelNotice;
}

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  keywords?: string[];
  badge?: string;
  active?: boolean;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

export interface AdminShellProps {
  lang?: string;
  title: string;
  appName: string;
  heading: string;
  eyebrow?: string;
  subheading?: string;
  body: string;
  headerActionsHtml?: string;
  versionLabel: string;
  versionValue: string;
  sidebarSearchPlaceholder: string;
  sidebarGroups: AdminNavGroup[];
  notice?: PanelNotice;
}

export interface TabItem {
  id: string;
  label: string;
  badge?: string;
  href?: string;
  panelHtml: string;
}

export interface TabsProps {
  id: string;
  tabs: TabItem[];
  defaultTabId?: string;
}

export interface DataTableColumn {
  label: string;
  className?: string;
}

export interface DataTableRow {
  cells: string[];
  searchText: string;
}

export interface DataTableProps {
  id: string;
  heading: string;
  description?: string;
  columns: DataTableColumn[];
  rows: DataTableRow[];
  emptyMessage: string;
  filterPlaceholder: string;
  rowsPerPageLabel: string;
  showingLabel: string;
  ofLabel: string;
  recordsLabel: string;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderNotice(notice?: PanelNotice): string {
  if (!notice) {
    return "";
  }

  return `<aside class="notice notice-${escapeHtml(notice.kind)}">${escapeHtml(
    notice.message
  )}</aside>`;
}

function renderBaseStyleBlock(): string {
  return `
      :root {
        color-scheme: light;
        --paper: #eef4fb;
        --paper-strong: #d8e5f4;
        --paper-muted: #c9d9eb;
        --surface: rgba(250, 253, 255, 0.94);
        --surface-strong: rgba(255, 255, 255, 0.96);
        --ink: #0d2038;
        --muted: #4c6481;
        --line: rgba(13, 32, 56, 0.14);
        --line-strong: rgba(13, 32, 56, 0.22);
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
        --navy-deep: #0a1730;
        --navy-panel: rgba(10, 23, 48, 0.92);
        font-family: "IBM Plex Sans", "Iosevka Etoile", sans-serif;
        background: #dce8f5;
        color: var(--ink);
      }

      * {
        box-sizing: border-box;
      }

      html {
        min-height: 100%;
        font-size: 90%;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(16, 39, 68, 0.18), transparent 24rem),
          radial-gradient(circle at top right, rgba(183, 243, 77, 0.18), transparent 20rem),
          radial-gradient(circle at bottom right, rgba(242, 140, 40, 0.16), transparent 28rem),
          linear-gradient(145deg, #eff5fb 0%, #d9e6f4 100%);
      }

      a {
        color: var(--accent);
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      code,
      pre,
      textarea,
      input,
      select,
      button {
        font: inherit;
      }

      button,
      .button-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 999px;
        padding: 0.75rem 1rem;
        background: linear-gradient(135deg, var(--navy-soft), var(--navy-strong));
        color: #f5fbff;
        cursor: pointer;
        box-shadow: 0 0.8rem 1.8rem rgba(16, 39, 68, 0.18);
      }

      .button-link:hover {
        text-decoration: none;
      }

      button.secondary,
      .button-link.secondary {
        background: linear-gradient(135deg, #f5a13a, var(--accent));
        color: #1b1309;
      }

      button.danger,
      .button-link.danger {
        background: var(--danger);
      }

      input,
      textarea,
      select {
        width: 100%;
        padding: 0.8rem 0.9rem;
        border-radius: 0.8rem;
        border: 1px solid rgba(16, 39, 68, 0.18);
        background: rgba(255, 255, 255, 0.92);
        color: var(--ink);
      }

      input:focus,
      textarea:focus,
      select:focus {
        outline: 2px solid rgba(183, 243, 77, 0.42);
        border-color: rgba(16, 39, 68, 0.42);
        box-shadow: 0 0 0 0.25rem rgba(183, 243, 77, 0.16);
      }

      label {
        display: grid;
        gap: 0.3rem;
        color: var(--muted);
        font-size: 0.88rem;
      }

      textarea {
        min-height: 7rem;
        resize: vertical;
      }

      [hidden] {
        display: none !important;
      }

      .notice {
        padding: 0.85rem 1rem;
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
      }

      .grid-two {
        grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
      }

      .grid-three {
        grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
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

      .panel {
        padding: 1.15rem;
        border: 1px solid var(--line);
        border-radius: 1.2rem;
        background: var(--surface);
        box-shadow: 0 1.1rem 2.6rem rgba(16, 39, 68, 0.08);
      }

      .panel h2,
      .panel h3 {
        margin-top: 0;
      }

      .panel h2 {
        font-size: 1.2rem;
      }

      .detail-shell {
        display: grid;
        gap: 1rem;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
        gap: 0.85rem;
        margin: 0;
      }

      .detail-item {
        padding: 0.9rem 1rem;
        border: 1px solid rgba(13, 32, 56, 0.08);
        border-radius: 1rem;
        background: rgba(255, 255, 255, 0.72);
      }

      .detail-item dt {
        color: var(--muted);
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .detail-item dd {
        margin: 0.35rem 0 0;
        color: var(--ink);
        font-weight: 600;
      }

      .detail-link {
        color: var(--navy-strong);
        font-weight: 600;
      }

      .detail-link:hover {
        color: var(--navy-soft);
      }

      .stats {
        display: grid;
        gap: 0.9rem;
        grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      }

      .stat {
        padding: 1rem;
        border-radius: 1rem;
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(238, 244, 251, 0.96)),
          linear-gradient(145deg, rgba(16, 39, 68, 0.05), rgba(183, 243, 77, 0.05));
        border: 1px solid rgba(13, 32, 56, 0.08);
      }

      .stat strong {
        display: block;
        font-size: 1.8rem;
        line-height: 1;
      }

      .stat span {
        color: var(--muted);
        font-size: 0.9rem;
      }

      .table-wrap {
        overflow-x: auto;
        border: 1px solid rgba(13, 32, 56, 0.08);
        border-radius: 1rem;
        background: rgba(255, 255, 255, 0.72);
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 0.75rem 0.55rem;
        border-bottom: 1px solid rgba(13, 32, 56, 0.09);
        vertical-align: top;
        text-align: left;
      }

      th {
        position: sticky;
        top: 0;
        z-index: 1;
        color: var(--navy-soft);
        font-size: 0.77rem;
        text-transform: uppercase;
        letter-spacing: 0.11em;
        background: rgba(216, 229, 244, 0.95);
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
        background: rgba(13, 32, 56, 0.08);
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
        border-top: 1px solid rgba(13, 32, 56, 0.08);
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

      @media (max-width: 900px) {
        .grid-two,
        .grid-three {
          grid-template-columns: 1fr;
        }
      }
  `;
}

export function renderPanelShell(props: PanelShellProps): string {
  const noticeHtml = renderNotice(props.notice);
  const actionsHtml = props.actions ? `<div class="hero-actions">${props.actions}</div>` : "";

  return `<!doctype html>
<html lang="${escapeHtml(props.lang ?? "en")}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(props.title)}</title>
    <style>
${renderBaseStyleBlock()}
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

      .login-shell {
        padding-top: 1.25rem;
        margin-top: 1rem;
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

export function renderTabs(props: TabsProps): string {
  const firstTabId = props.defaultTabId ?? props.tabs[0]?.id ?? "";

  const buttonsHtml = props.tabs
    .map(
      (tab, index) => `<button
        type="button"
        class="tab-button${tab.id === firstTabId || (!firstTabId && index === 0) ? " active" : ""}"
        data-tab-button
        data-tab-target="${escapeHtml(tab.id)}"
        ${tab.href ? `data-tab-href="${escapeHtml(tab.href)}"` : ""}
        aria-selected="${tab.id === firstTabId || (!firstTabId && index === 0) ? "true" : "false"}"
      ><span>${escapeHtml(tab.label)}</span>${
        tab.badge
          ? `<span class="tab-badge${tab.badge === "0" ? " tab-badge-zero" : ""}">${escapeHtml(tab.badge)}</span>`
          : ""
      }</button>`
    )
    .join("");

  const panelsHtml = props.tabs
    .map(
      (tab, index) => `<section
        id="${escapeHtml(tab.id)}"
        class="tab-panel"
        data-tab-panel
        ${tab.id === firstTabId || (!firstTabId && index === 0) ? "" : "hidden"}
      >${tab.panelHtml}</section>`
    )
    .join("");

  return `<section id="${escapeHtml(props.id)}" class="tabs" data-tabs data-default-tab="${escapeHtml(
    firstTabId
  )}">
    <div class="tab-list" role="tablist">${buttonsHtml}</div>
    <div class="tab-panels">${panelsHtml}</div>
  </section>`;
}

export function renderDataTable(props: DataTableProps): string {
  const pageSizeOptions = props.pageSizeOptions ?? [10, 25, 50, 100];
  const defaultPageSize = props.defaultPageSize ?? pageSizeOptions[0] ?? 25;
  const headerHtml = props.columns
    .map(
      (column) =>
        `<th${column.className ? ` class="${escapeHtml(column.className)}"` : ""}>${escapeHtml(
          column.label
        )}</th>`
    )
    .join("");

  const rowsHtml = props.rows
    .map((row) => {
      const cellsHtml = row.cells
        .map((cell, index) => {
          const className = props.columns[index]?.className;
          return `<td${className ? ` class="${escapeHtml(className)}"` : ""}>${cell}</td>`;
        })
        .join("");

      return `<tr data-table-row data-search="${escapeHtml(row.searchText.toLowerCase())}">${cellsHtml}</tr>`;
    })
    .join("");

  const emptyRowHtml = `<tr data-table-empty${props.rows.length === 0 ? "" : " hidden"}>
    <td colspan="${String(props.columns.length)}" class="data-table-empty-cell">
      <div class="data-table-empty">
        <strong>${escapeHtml(props.emptyMessage)}</strong>
      </div>
    </td>
  </tr>`;

  return `<section id="${escapeHtml(props.id)}" class="panel section-panel">
    <div class="section-head">
      <div>
        <div class="section-title-row">
          <h2>${escapeHtml(props.heading)}</h2>
          <span class="section-badge">${String(props.rows.length)}</span>
        </div>
        ${
          props.description
            ? `<p class="muted section-description">${escapeHtml(props.description)}</p>`
            : ""
        }
      </div>
    </div>
    <div
      class="data-table"
      data-data-table
      data-showing-label="${escapeHtml(props.showingLabel)}"
      data-of-label="${escapeHtml(props.ofLabel)}"
      data-records-label="${escapeHtml(props.recordsLabel)}"
      data-empty-message="${escapeHtml(props.emptyMessage)}"
    >
      <div class="data-table-toolbar">
        <label class="data-table-filter">
          <span class="sr-only">${escapeHtml(props.filterPlaceholder)}</span>
          <input type="search" placeholder="${escapeHtml(props.filterPlaceholder)}" data-table-filter />
        </label>
        <div class="data-table-controls">
          <label class="data-table-size">
            <span>${escapeHtml(props.rowsPerPageLabel)}</span>
            <select data-table-page-size>
              ${pageSizeOptions
                .map(
                  (option) =>
                    `<option value="${String(option)}"${option === defaultPageSize ? " selected" : ""}>${String(
                      option
                    )}</option>`
                )
                .join("")}
            </select>
          </label>
          <p class="data-table-count muted" data-table-count></p>
          <div class="data-table-pagination">
            <button type="button" class="secondary" data-table-first>&laquo;</button>
            <button type="button" class="secondary" data-table-prev>&lsaquo;</button>
            <button type="button" class="secondary" data-table-next>&rsaquo;</button>
            <button type="button" class="secondary" data-table-last>&raquo;</button>
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${headerHtml}</tr>
          </thead>
          <tbody>
            ${rowsHtml}
            ${emptyRowHtml}
          </tbody>
        </table>
      </div>
    </div>
  </section>`;
}

export function renderAdminShell(props: AdminShellProps): string {
  const noticeHtml = renderNotice(props.notice);
  const sidebarGroupsHtml = props.sidebarGroups
    .map((group) => {
      const itemsHtml = group.items
        .map(
          (item) => `<a
            href="${escapeHtml(item.href)}"
            class="sidebar-link${item.active ? " active" : ""}"
            data-nav-item
            data-search="${escapeHtml(
              `${item.label} ${(item.keywords ?? []).join(" ")}`.toLowerCase()
            )}"
          >
            <span>${escapeHtml(item.label)}</span>
            ${
              item.badge
                ? `<span class="sidebar-badge${item.badge === "0" ? " sidebar-badge-zero" : ""}">${escapeHtml(item.badge)}</span>`
                : ""
            }
          </a>`
        )
        .join("");

      return `<section class="sidebar-group" data-nav-group>
        <p class="sidebar-group-label">${escapeHtml(group.label)}</p>
        <div class="sidebar-links">${itemsHtml}</div>
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="${escapeHtml(props.lang ?? "en")}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(props.title)}</title>
    <style>
${renderBaseStyleBlock()}
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      .admin-shell {
        display: grid;
        grid-template-columns: minmax(16rem, 18.5rem) minmax(0, 1fr);
        gap: 1rem;
        min-height: 100vh;
        padding: 1rem;
      }

      .admin-sidebar {
        position: sticky;
        top: 1rem;
        align-self: start;
        min-height: calc(100vh - 2rem);
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.1rem 1rem 1rem;
        border: 1px solid rgba(183, 243, 77, 0.16);
        border-radius: 1.5rem;
        background:
          linear-gradient(180deg, rgba(10, 23, 48, 0.96), rgba(16, 39, 68, 0.94)),
          radial-gradient(circle at top left, rgba(183, 243, 77, 0.1), transparent 14rem);
        color: #eff7ff;
        box-shadow: 0 1.6rem 3.8rem rgba(7, 17, 34, 0.28);
      }

      .sidebar-brand {
        display: grid;
        gap: 0.4rem;
      }

      .sidebar-eyebrow {
        margin: 0;
        color: rgba(239, 247, 255, 0.72);
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 0.72rem;
      }

      .sidebar-brand strong {
        font-size: 1.55rem;
        line-height: 1;
      }

      .sidebar-search input {
        border-color: rgba(239, 247, 255, 0.08);
        background: rgba(255, 255, 255, 0.08);
        color: #f4fbff;
      }

      .sidebar-search input::placeholder {
        color: rgba(239, 247, 255, 0.52);
      }

      .sidebar-nav {
        display: grid;
        gap: 1rem;
        flex: 1;
        min-height: 0;
      }

      .sidebar-group {
        display: grid;
        gap: 0.45rem;
      }

      .sidebar-group-label {
        margin: 0;
        color: rgba(183, 243, 77, 0.82);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 0.7rem;
      }

      .sidebar-links {
        display: grid;
        gap: 0.35rem;
      }

      .sidebar-link {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 0.9rem;
        border-radius: 0.95rem;
        color: #eff7ff;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid transparent;
      }

      .sidebar-link:hover,
      .sidebar-link:focus-visible {
        text-decoration: none;
        border-color: rgba(183, 243, 77, 0.18);
        background: rgba(183, 243, 77, 0.08);
      }

      .sidebar-link.active {
        border-color: rgba(183, 243, 77, 0.24);
        background:
          linear-gradient(135deg, rgba(183, 243, 77, 0.2), rgba(242, 140, 40, 0.18)),
          rgba(255, 255, 255, 0.08);
        color: #ffffff;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04);
      }

      .sidebar-link.active .sidebar-badge {
        background: rgba(10, 23, 48, 0.36);
        color: #ffffff;
      }

      .sidebar-badge {
        padding: 0.15rem 0.45rem;
        border-radius: 999px;
        background: rgba(242, 140, 40, 0.22);
        color: #ffd9ae;
        font-size: 0.74rem;
      }

      .sidebar-badge-zero {
        background: rgba(239, 247, 255, 0.08);
        color: rgba(239, 247, 255, 0.62);
      }

      .sidebar-footer {
        padding-top: 0.85rem;
        border-top: 1px solid rgba(239, 247, 255, 0.08);
        color: rgba(239, 247, 255, 0.74);
        font-size: 0.82rem;
      }

      .sidebar-footer strong {
        display: block;
        color: #ffffff;
      }

      .admin-main {
        min-width: 0;
        display: grid;
        gap: 1rem;
        align-content: start;
      }

      .page-header-actions {
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        gap: 0.4rem;
        margin-left: auto;
        color: var(--ink);
      }

      .page-header-actions form,
      .page-header-actions label {
        margin: 0;
      }

      .locale-switch {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        padding: 0.2rem;
        border: 1px solid rgba(13, 32, 56, 0.12);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.82);
        box-shadow: 0 0.5rem 1.4rem rgba(16, 39, 68, 0.08);
      }

      .locale-switch form {
        margin: 0;
      }

      .locale-button {
        min-width: 2.95rem;
        min-height: 2.15rem;
        padding: 0.45rem 0.75rem;
        border-radius: 999px;
        background: transparent;
        color: var(--navy-strong);
        box-shadow: none;
      }

      .locale-button:hover,
      .locale-button:focus-visible {
        background: rgba(16, 39, 68, 0.08);
      }

      .locale-button.active {
        background: linear-gradient(135deg, var(--navy-soft), var(--navy-strong));
        color: #f5fbff;
        box-shadow: 0 0.6rem 1.4rem rgba(16, 39, 68, 0.16);
      }

      .topbar-disclosure {
        position: relative;
      }

      .icon-button {
        width: 2.2rem;
        min-width: 2.2rem;
        height: 2.2rem;
        padding: 0;
        border-radius: 999px;
      }

      .icon-button svg {
        width: 1rem;
        height: 1rem;
        display: block;
      }

      .icon-button.secondary {
        background: rgba(16, 39, 68, 0.08);
        color: var(--navy-strong);
        border: 1px solid rgba(13, 32, 56, 0.12);
        box-shadow: none;
      }

      .icon-button.secondary:hover,
      .icon-button.secondary:focus-visible {
        background: rgba(16, 39, 68, 0.14);
      }

      .topbar-panel {
        position: absolute;
        top: calc(100% + 0.55rem);
        right: 0;
        z-index: 20;
        width: min(28rem, calc(100vw - 2.4rem));
        padding: 0.9rem;
        border: 1px solid rgba(13, 32, 56, 0.12);
        border-radius: 1.2rem;
        background: rgba(255, 255, 255, 0.97);
        box-shadow: 0 1.3rem 3rem rgba(16, 39, 68, 0.16);
      }

      .profile-sheet {
        display: grid;
        gap: 0.9rem;
      }

      .profile-sheet-head {
        display: flex;
        align-items: center;
        gap: 0.85rem;
      }

      .profile-sheet-copy {
        display: grid;
        gap: 0.15rem;
      }

      .profile-sheet-footer {
        padding-top: 0.2rem;
        border-top: 1px solid rgba(13, 32, 56, 0.08);
      }

      .profile-sheet-footer form {
        margin: 0;
      }

      .profile-sheet-signout {
        width: 100%;
        justify-content: center;
        gap: 0.5rem;
        min-height: 2.7rem;
      }

      .profile-sheet-signout svg {
        width: 1rem;
        height: 1rem;
      }

      .profile-card {
        display: flex;
        align-items: center;
        gap: 0.95rem;
      }

      .profile-avatar {
        width: 3rem;
        height: 3rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--navy-strong), var(--navy-soft));
        color: #f6fbff;
        font-weight: 700;
        letter-spacing: 0.08em;
        box-shadow: 0 0.8rem 1.8rem rgba(16, 39, 68, 0.18);
      }

      .profile-copy {
        display: grid;
        gap: 0.08rem;
      }

      .profile-kicker {
        color: var(--muted);
        font-size: 0.74rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }

      .profile-name {
        font-size: 1.04rem;
      }

      .profile-meta {
        color: var(--muted);
      }

      .profile-facts {
        display: grid;
        grid-template-columns: 13rem minmax(0, 1fr);
        gap: 0.5rem 0.9rem;
        margin: 0;
        align-items: start;
      }

      .profile-facts dt {
        margin: 0;
        color: var(--muted);
        font-size: 0.74rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }

      .profile-facts dd {
        margin: 0;
        color: var(--ink);
        font-weight: 600;
        word-break: break-word;
      }

      .page-header {
        display: grid;
        gap: 0.45rem;
        padding: 1rem 1.1rem 0;
      }

      .page-header-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
      }

      .page-header-copy {
        display: grid;
        gap: 0.45rem;
        min-width: 0;
      }

      .page-header p {
        margin: 0;
      }

      .page-eyebrow {
        color: var(--navy-soft);
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 0.74rem;
      }

      .page-header h1 {
        margin: 0;
        font-size: clamp(2rem, 4vw, 3.2rem);
      }

      .section-panel {
        scroll-margin-top: 2rem;
      }

      .section-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .section-description {
        margin: 0.2rem 0 0;
      }

      .section-title-row {
        display: inline-flex;
        align-items: center;
        gap: 0.65rem;
      }

      .section-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2rem;
        height: 2rem;
        padding: 0 0.6rem;
        border-radius: 999px;
        background: rgba(16, 39, 68, 0.08);
        color: var(--navy-strong);
        font-size: 0.84rem;
        font-weight: 700;
      }

      .action-grid {
        display: grid;
        gap: 1rem;
        margin-top: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      }

      .action-card {
        display: grid;
        gap: 0.75rem;
        padding: 1rem;
        border-radius: 1.1rem;
        border: 1px solid rgba(13, 32, 56, 0.1);
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(238, 244, 251, 0.92)),
          linear-gradient(145deg, rgba(16, 39, 68, 0.05), rgba(183, 243, 77, 0.05));
      }

      .action-card h3,
      .action-card p {
        margin: 0;
      }

      .action-card form {
        display: grid;
        gap: 0.75rem;
      }

      .action-card-context {
        display: grid;
        gap: 0.55rem;
        padding: 0.8rem 0.9rem;
        border-radius: 0.95rem;
        border: 1px solid rgba(13, 32, 56, 0.1);
        background: rgba(255, 255, 255, 0.72);
      }

      .action-card-context-title {
        color: var(--muted);
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.16em;
      }

      .action-card-context p {
        margin: 0;
      }

      .action-card-facts {
        margin: 0;
        display: grid;
        gap: 0.45rem;
      }

      .action-card-facts-row {
        display: grid;
        grid-template-columns: minmax(0, 8.25rem) minmax(0, 1fr);
        gap: 0.8rem;
        align-items: baseline;
      }

      .action-card-facts dt {
        margin: 0;
        color: var(--muted);
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }

      .action-card-facts dd {
        margin: 0;
        color: var(--ink);
        font-weight: 600;
      }

      .action-card-strong {
        background:
          linear-gradient(145deg, rgba(16, 39, 68, 0.98), rgba(24, 54, 91, 0.94)),
          radial-gradient(circle at top left, rgba(183, 243, 77, 0.14), transparent 12rem);
        color: #f6fbff;
      }

      .action-card-strong .muted {
        color: rgba(246, 251, 255, 0.74);
      }

      .action-card-strong .action-card-context {
        background: rgba(7, 16, 33, 0.24);
        border-color: rgba(255, 255, 255, 0.12);
      }

      .action-card-strong .action-card-context-title,
      .action-card-strong .action-card-facts dt {
        color: rgba(246, 251, 255, 0.62);
      }

      .action-card-strong .action-card-facts dd {
        color: #f6fbff;
      }

      .action-card-strong .action-card-context .muted {
        color: rgba(246, 251, 255, 0.74);
      }

      .action-card-accent {
        background:
          linear-gradient(145deg, rgba(242, 140, 40, 0.16), rgba(255, 255, 255, 0.96)),
          linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(250, 241, 229, 0.92));
      }

      .action-eyebrow {
        color: var(--muted);
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.16em;
      }

      .tabs {
        display: grid;
        gap: 1rem;
      }

      .tab-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
      }

      .tab-button {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        background: rgba(16, 39, 68, 0.08);
        color: var(--navy-soft);
        box-shadow: none;
        border: 1px solid transparent;
      }

      .tab-button.active {
        background: linear-gradient(135deg, rgba(16, 39, 68, 0.98), rgba(24, 54, 91, 0.96));
        color: #f6fbff;
        border-color: rgba(183, 243, 77, 0.18);
      }

      .tab-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.7rem;
        height: 1.7rem;
        padding: 0 0.45rem;
        border-radius: 999px;
        background: rgba(242, 140, 40, 0.22);
        color: var(--accent);
        font-size: 0.76rem;
        font-weight: 700;
      }

      .tab-button.active .tab-badge {
        background: rgba(255, 255, 255, 0.14);
        color: #ffffff;
      }

      .tab-badge-zero {
        background: rgba(13, 32, 56, 0.08);
        color: var(--muted);
      }

      .tab-button.active .tab-badge-zero {
        background: rgba(255, 255, 255, 0.12);
        color: rgba(255, 255, 255, 0.8);
      }

      .tab-panel {
        display: grid;
        gap: 1rem;
      }

      .data-table {
        display: grid;
        gap: 0.9rem;
      }

      .data-table-toolbar {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 0.9rem;
      }

      .data-table-filter {
        width: min(100%, 22rem);
      }

      .data-table-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem;
      }

      .data-table-size {
        display: flex;
        align-items: center;
        gap: 0.55rem;
      }

      .data-table-size select {
        width: auto;
        min-width: 5.5rem;
      }

      .data-table-count {
        min-width: 12rem;
        margin: 0;
        text-align: right;
      }

      .data-table-pagination {
        display: inline-flex;
        gap: 0.45rem;
      }

      .data-table-pagination button {
        min-width: 2.8rem;
        padding-inline: 0.8rem;
      }

      tbody tr:nth-child(odd) td {
        background: rgba(255, 255, 255, 0.55);
      }

      tbody tr:hover td {
        background: rgba(183, 243, 77, 0.12);
      }

      .data-table-empty-cell {
        padding: 1.4rem 1rem;
        border-bottom: none;
      }

      .data-table-empty {
        display: grid;
        place-items: center;
        min-height: 7rem;
        border: 1px dashed rgba(13, 32, 56, 0.14);
        border-radius: 0.95rem;
        color: var(--muted);
        background: rgba(255, 255, 255, 0.76);
      }

      .page-header-actions button,
      .page-header-actions .button-link,
      .data-table-pagination button,
      .tab-button {
        min-height: 2.7rem;
      }

      @media (max-width: 1100px) {
        .admin-shell {
          grid-template-columns: 1fr;
        }

        .admin-sidebar {
          position: static;
          min-height: auto;
        }
      }

      @media (max-width: 720px) {
        .admin-shell {
          padding: 0.75rem;
        }

        .panel {
          padding: 1rem;
        }

        .page-header-row,
        .data-table-toolbar,
        .section-head {
          align-items: stretch;
        }

        .data-table-controls,
        .page-header-actions {
          justify-content: flex-end;
          flex-wrap: wrap;
        }

        .data-table-count {
          min-width: 0;
          text-align: left;
        }
      }
    </style>
  </head>
  <body>
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <div class="sidebar-brand">
          <strong>${escapeHtml(props.appName)}</strong>
        </div>
        <label class="sidebar-search">
          <span class="sr-only">${escapeHtml(props.sidebarSearchPlaceholder)}</span>
          <input type="search" placeholder="${escapeHtml(props.sidebarSearchPlaceholder)}" data-sidebar-search />
        </label>
        <nav class="sidebar-nav">
          ${sidebarGroupsHtml}
        </nav>
        <footer class="sidebar-footer">
          <span>${escapeHtml(props.versionLabel)}</span>
          <strong>${escapeHtml(props.versionValue)}</strong>
        </footer>
      </aside>
      <div class="admin-main">
        <section class="page-header">
          <div class="page-header-row">
            <div class="page-header-copy">
              <h1>${escapeHtml(props.heading)}</h1>
              ${
                props.subheading
                  ? `<p class="muted">${escapeHtml(props.subheading)}</p>`
                  : ""
              }
            </div>
            ${
              props.headerActionsHtml
                ? `<div class="page-header-actions">${props.headerActionsHtml}</div>`
                : ""
            }
          </div>
        </section>
        ${noticeHtml}
        ${props.body}
      </div>
    </div>
    <script>
      (() => {
        const sidebarSearch = document.querySelector("[data-sidebar-search]");
        const navItems = Array.from(document.querySelectorAll("[data-nav-item]"));
        const navGroups = Array.from(document.querySelectorAll("[data-nav-group]"));
        let navScrollTicking = false;

        const setActiveNav = (targetId) => {
          navItems.forEach((item) => {
            const href = item.getAttribute("href") ?? "";
            if (!href.startsWith("#")) {
              return;
            }
            item.classList.toggle("active", href === "#" + targetId);
          });
        };

        const syncActiveNav = () => {
          const currentHash = window.location.hash.slice(1);
          if (currentHash) {
            setActiveNav(currentHash);
            return;
          }

          const candidates = Array.from(
            document.querySelectorAll(".section-panel, [data-tab-panel]")
          ).filter((node) => !(node instanceof HTMLElement && node.hidden));

          let activeId = "";
          let bestDistance = Number.POSITIVE_INFINITY;

          candidates.forEach((node) => {
            if (!(node instanceof HTMLElement) || !node.id) {
              return;
            }

            const rect = node.getBoundingClientRect();
            if (rect.bottom <= 120) {
              return;
            }

            const distance = Math.abs(rect.top - 160);
            if (rect.top <= 220 && distance < bestDistance) {
              activeId = node.id;
              bestDistance = distance;
            }
          });

          if (!activeId) {
            const firstVisible = candidates.find(
              (node) => node instanceof HTMLElement && node.id
            );
            if (firstVisible instanceof HTMLElement) {
              activeId = firstVisible.id;
            }
          }

          if (activeId) {
            setActiveNav(activeId);
          }
        };

        if (sidebarSearch instanceof HTMLInputElement) {
          const updateSidebar = () => {
            const query = sidebarSearch.value.trim().toLowerCase();

            navItems.forEach((item) => {
              const searchValue = item.getAttribute("data-search") ?? "";
              item.style.display = !query || searchValue.includes(query) ? "" : "none";
            });

            navGroups.forEach((group) => {
              const hasVisibleItem = Array.from(group.querySelectorAll("[data-nav-item]")).some(
                (item) => item instanceof HTMLElement && item.style.display !== "none"
              );
              group.style.display = hasVisibleItem ? "" : "none";
            });
          };

          sidebarSearch.addEventListener("input", updateSidebar);
          updateSidebar();
        }

        document.querySelectorAll("[data-topbar-disclosure]").forEach((root) => {
          const toggle = root.querySelector("[data-topbar-toggle]");
          const panel = root.querySelector("[data-topbar-panel]");

          if (!(toggle instanceof HTMLButtonElement) || !(panel instanceof HTMLElement)) {
            return;
          }

          const closePanel = () => {
            panel.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
          };

          const openPanel = () => {
            panel.hidden = false;
            toggle.setAttribute("aria-expanded", "true");
          };

          toggle.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (panel.hidden) {
              openPanel();
            } else {
              closePanel();
            }
          });

          root.addEventListener("click", (event) => {
            event.stopPropagation();
          });

          document.addEventListener("click", (event) => {
            if (!(event.target instanceof Node) || !root.contains(event.target)) {
              closePanel();
            }
          });

          document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              closePanel();
            }
          });
        });

        const tabRoots = Array.from(document.querySelectorAll("[data-tabs]"));

        const activateTab = (root, targetId, updateHash) => {
          const buttons = Array.from(root.querySelectorAll("[data-tab-button]"));
          const panels = Array.from(root.querySelectorAll("[data-tab-panel]"));
          const panelMatch = panels.find((panel) => panel.id === targetId);

          if (!panelMatch) {
            return;
          }

          buttons.forEach((button) => {
            const active = button.getAttribute("data-tab-target") === targetId;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", active ? "true" : "false");
          });

          panels.forEach((panel) => {
            panel.hidden = panel.id !== targetId;
          });

          if (updateHash) {
            history.replaceState(null, "", "#" + targetId);
          }

          syncActiveNav();
        };

        tabRoots.forEach((root) => {
          const defaultTab = root.getAttribute("data-default-tab");
          const buttons = Array.from(root.querySelectorAll("[data-tab-button]"));

          buttons.forEach((button) => {
            button.addEventListener("click", () => {
              const href = button.getAttribute("data-tab-href");
              if (href) {
                window.location.assign(href);
                return;
              }

              const targetId = button.getAttribute("data-tab-target");
              if (targetId) {
                activateTab(root, targetId, true);
              }
            });
          });

          const currentHash = window.location.hash.slice(1);
          if (currentHash && root.querySelector("#" + CSS.escape(currentHash))) {
            activateTab(root, currentHash, false);
          } else if (defaultTab) {
            activateTab(root, defaultTab, false);
          }
        });

        window.addEventListener("hashchange", () => {
          const currentHash = window.location.hash.slice(1);
          if (!currentHash) {
            syncActiveNav();
            return;
          }

          tabRoots.forEach((root) => {
            if (root.querySelector("#" + CSS.escape(currentHash))) {
              activateTab(root, currentHash, false);
            }
          });

          syncActiveNav();
        });

        navItems.forEach((item) => {
          item.addEventListener("click", () => {
            const href = item.getAttribute("href");
            if (href && href.startsWith("#")) {
              setActiveNav(href.slice(1));
            }
          });
        });

        document.addEventListener(
          "scroll",
          () => {
            if (navScrollTicking) {
              return;
            }

            navScrollTicking = true;
            window.requestAnimationFrame(() => {
              syncActiveNav();
              navScrollTicking = false;
            });
          },
          { passive: true }
        );

        syncActiveNav();

        document.querySelectorAll("[data-data-table]").forEach((root) => {
          const filterInput = root.querySelector("[data-table-filter]");
          const pageSizeSelect = root.querySelector("[data-table-page-size]");
          const countNode = root.querySelector("[data-table-count]");
          const firstButton = root.querySelector("[data-table-first]");
          const prevButton = root.querySelector("[data-table-prev]");
          const nextButton = root.querySelector("[data-table-next]");
          const lastButton = root.querySelector("[data-table-last]");
          const body = root.querySelector("tbody");
          const rows = Array.from(root.querySelectorAll("[data-table-row]"));
          const emptyRow = root.querySelector("[data-table-empty]");
          let currentPage = 1;

          if (!(filterInput instanceof HTMLInputElement) || !(pageSizeSelect instanceof HTMLSelectElement) || !(countNode instanceof HTMLElement) || !(body instanceof HTMLTableSectionElement)) {
            return;
          }

          const updateTable = () => {
            const query = filterInput.value.trim().toLowerCase();
            const pageSize = Math.max(1, Number.parseInt(pageSizeSelect.value, 10) || 10);
            const filteredRows = rows.filter((row) => {
              const searchValue = row.getAttribute("data-search") ?? row.textContent ?? "";
              return !query || searchValue.includes(query);
            });
            const total = filteredRows.length;
            const pageCount = Math.max(1, Math.ceil(total / pageSize));
            currentPage = Math.min(currentPage, pageCount);
            const startIndex = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
            const endIndex = Math.min(currentPage * pageSize, total);

            rows.forEach((row) => {
              row.hidden = true;
            });

            filteredRows.slice(startIndex > 0 ? startIndex - 1 : 0, endIndex).forEach((row) => {
              row.hidden = false;
            });

            if (emptyRow instanceof HTMLElement) {
              emptyRow.hidden = total !== 0;
            }

            const showingLabel = root.getAttribute("data-showing-label") ?? "Showing";
            const ofLabel = root.getAttribute("data-of-label") ?? "of";
            const recordsLabel = root.getAttribute("data-records-label") ?? "records";
            countNode.textContent =
              total === 0
                ? "0 " + recordsLabel
                : showingLabel + " " + startIndex + "-" + endIndex + " " + ofLabel + " " + total + " " + recordsLabel;

            [firstButton, prevButton].forEach((button) => {
              if (button instanceof HTMLButtonElement) {
                button.disabled = currentPage <= 1 || total === 0;
              }
            });

            [nextButton, lastButton].forEach((button) => {
              if (button instanceof HTMLButtonElement) {
                button.disabled = currentPage >= pageCount || total === 0;
              }
            });
          };

          filterInput.addEventListener("input", () => {
            currentPage = 1;
            updateTable();
          });

          pageSizeSelect.addEventListener("change", () => {
            currentPage = 1;
            updateTable();
          });

          if (firstButton instanceof HTMLButtonElement) {
            firstButton.addEventListener("click", () => {
              currentPage = 1;
              updateTable();
            });
          }

          if (prevButton instanceof HTMLButtonElement) {
            prevButton.addEventListener("click", () => {
              currentPage = Math.max(1, currentPage - 1);
              updateTable();
            });
          }

          if (nextButton instanceof HTMLButtonElement) {
            nextButton.addEventListener("click", () => {
              currentPage += 1;
              updateTable();
            });
          }

          if (lastButton instanceof HTMLButtonElement) {
            lastButton.addEventListener("click", () => {
              const pageSize = Math.max(1, Number.parseInt(pageSizeSelect.value, 10) || 10);
              const visibleRows = rows.filter((row) => {
                const searchValue = row.getAttribute("data-search") ?? row.textContent ?? "";
                return !(filterInput.value.trim()) || searchValue.includes(filterInput.value.trim().toLowerCase());
              });
              currentPage = Math.max(1, Math.ceil(visibleRows.length / pageSize));
              updateTable();
            });
          }

          updateTable();
        });
      })();
    </script>
  </body>
</html>`;
}
