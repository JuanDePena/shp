import { realpathSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import { createPanelRuntimeConfig } from "@simplehost/panel-config";
import {
  type AppReconcileRequest,
  type AuthLoginRequest,
  type AuthLoginResponse,
  type AuthenticatedUserSummary,
  type BackupsOverview,
  type DatabaseReconcileRequest,
  type DesiredStateAppInput,
  type DesiredStateApplyRequest,
  type DesiredStateBackupPolicyInput,
  type DesiredStateDatabaseInput,
  type DesiredStateExportResponse,
  type DesiredStateNodeInput,
  type DesiredStateSpec,
  type DesiredStateTenantInput,
  type DesiredStateZoneInput,
  type DnsRecordPayload,
  type InventoryImportSummary,
  type InventoryStateSnapshot,
  type JobDispatchResponse,
  type JobHistoryEntry,
  type NodeHealthSnapshot,
  type OperationsOverview,
  type ResourceDriftSummary
} from "@simplehost/panel-contracts";
import { escapeHtml, renderPanelShell, type PanelNotice } from "@simplehost/panel-ui";

const config = createPanelRuntimeConfig();
const startedAt = Date.now();
const sessionCookieName = "shp_session";

interface DashboardData {
  currentUser: AuthenticatedUserSummary;
  overview: OperationsOverview;
  inventory: InventoryStateSnapshot;
  desiredState: DesiredStateExportResponse;
  drift: ResourceDriftSummary[];
  nodeHealth: NodeHealthSnapshot[];
  jobHistory: JobHistoryEntry[];
  backups: BackupsOverview;
}

class WebApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "WebApiError";
  }
}

function createApiBaseUrl(): string {
  return `http://${config.api.host}:${config.api.port}`;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function writeHtml(
  response: ServerResponse,
  statusCode: number,
  html: string,
  headers: Record<string, string> = {}
): void {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    ...headers
  });
  response.end(html);
}

function redirect(
  response: ServerResponse,
  location: string,
  cookie?: string
): void {
  response.writeHead(303, {
    location,
    ...(cookie ? { "set-cookie": cookie } : {})
  });
  response.end();
}

async function readTextBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readFormBody(request: IncomingMessage): Promise<URLSearchParams> {
  return new URLSearchParams(await readTextBody(request));
}

function parseCookies(request: IncomingMessage): Map<string, string> {
  const cookies = new Map<string, string>();
  const header = request.headers.cookie;

  if (!header) {
    return cookies;
  }

  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (!rawName) {
      continue;
    }

    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

function readSessionToken(request: IncomingMessage): string | null {
  return parseCookies(request).get(sessionCookieName) ?? null;
}

function serializeSessionCookie(token: string, expiresAt: string): string {
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
  );

  return `${sessionCookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie(): string {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function apiRequest<T>(
  pathname: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
    responseType?: "json" | "text";
  } = {}
): Promise<T> {
  const response = await fetch(new URL(pathname, createApiBaseUrl()), {
    method: options.method ?? "GET",
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body !== undefined
        ? { "content-type": "application/json; charset=utf-8" }
        : {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const responseText = await response.text();

  if (!response.ok) {
    let message = responseText || response.statusText;

    try {
      const parsed = JSON.parse(responseText) as Record<string, unknown>;
      message =
        typeof parsed.message === "string"
          ? parsed.message
          : typeof parsed.error === "string"
            ? parsed.error
            : message;
    } catch {
      // Keep plain text.
    }

    throw new WebApiError(response.status, message);
  }

  if ((options.responseType ?? "json") === "text") {
    return responseText as T;
  }

  return (responseText ? JSON.parse(responseText) : null) as T;
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "-";
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseZoneRecords(value: string): DnsRecordPayload[] {
  const records: DnsRecordPayload[] = [];
  const lines = value
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  for (const line of lines) {
    const parts = line.split(/\s+/);

    if (parts.length < 4) {
      throw new Error(
        `Invalid zone record line "${line}". Expected: <name> <type> <value> <ttl>.`
      );
    }

    const ttl = Number.parseInt(parts.at(-1) ?? "", 10);

    if (!Number.isInteger(ttl) || ttl <= 0) {
      throw new Error(`Invalid TTL in zone record line "${line}".`);
    }

    const name = parts[0]!;
    const type = parts[1]!;
    const valuePart = parts.slice(2, -1).join(" ");

    if (
      type !== "A" &&
      type !== "AAAA" &&
      type !== "CNAME" &&
      type !== "TXT"
    ) {
      throw new Error(`Unsupported record type ${type} in line "${line}".`);
    }

    records.push({
      name,
      type,
      value: valuePart,
      ttl
    });
  }

  return records;
}

function formatZoneRecords(records: DnsRecordPayload[]): string {
  return records.map((record) => `${record.name} ${record.type} ${record.value} ${record.ttl}`).join("\n");
}

function upsertByKey<T>(
  items: T[],
  next: T,
  keyOf: (item: T) => string,
  originalKey?: string
): T[] {
  const nextKey = keyOf(next);

  return [
    ...items.filter((item) => {
      const key = keyOf(item);
      return key !== nextKey && key !== originalKey;
    }),
    next
  ].sort((left, right) => keyOf(left).localeCompare(keyOf(right)));
}

function removeByKey<T>(
  items: T[],
  key: string,
  keyOf: (item: T) => string
): T[] {
  return items.filter((item) => keyOf(item) !== key);
}

function parseOptionalNumber(value: string, fallback?: number): number | undefined {
  if (value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`Expected an integer but received "${value}".`);
  }

  return parsed;
}

function renderPill(
  value: string,
  tone: "default" | "success" | "danger" | "muted" = "default"
): string {
  const className =
    tone === "success"
      ? "pill pill-success"
      : tone === "danger"
        ? "pill pill-danger"
        : tone === "muted"
          ? "pill pill-muted"
          : "pill";
  return `<span class="${className}">${escapeHtml(value)}</span>`;
}

function renderStats(overview: OperationsOverview): string {
  return `<section class="panel">
    <h2>Operations Overview</h2>
    <div class="stats">
      <article class="stat"><strong>${overview.nodeCount}</strong><span>Managed nodes</span></article>
      <article class="stat"><strong>${overview.pendingJobCount}</strong><span>Pending jobs</span></article>
      <article class="stat"><strong>${overview.failedJobCount}</strong><span>Failed jobs</span></article>
      <article class="stat"><strong>${overview.driftedResourceCount}</strong><span>Resources with drift</span></article>
      <article class="stat"><strong>${overview.backupPolicyCount}</strong><span>Backup policies</span></article>
    </div>
    <p class="muted">Generated ${escapeHtml(formatDate(overview.generatedAt))}</p>
  </section>`;
}

function renderLoginPage(notice?: PanelNotice): string {
  return renderPanelShell({
    title: "SimpleHostPanel Login",
    heading: "SHP Login",
    eyebrow: "SimpleHostPanel web",
    notice,
    body: `<section class="grid">
      <article class="panel" style="max-width: 32rem; margin: 0 auto;">
        <h2>Operator access</h2>
        <p class="muted">Authenticate against the local SHP API on ${escapeHtml(
          `${config.api.host}:${String(config.api.port)}`
        )}.</p>
        <form method="post" action="/auth/login" class="stack">
          <label>Email
            <input type="email" name="email" autocomplete="username" required />
          </label>
          <label>Password
            <input type="password" name="password" autocomplete="current-password" required />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </article>
    </section>`
  });
}

function renderDesiredStateSection(data: DashboardData): string {
  const tenantRows = data.desiredState.spec.tenants
    .map(
      (tenant) => `<details>
        <summary>${escapeHtml(tenant.slug)}</summary>
        <form method="post" action="/resources/tenants/upsert" class="stack">
          <input type="hidden" name="originalSlug" value="${escapeHtml(tenant.slug)}" />
          <div class="form-grid">
            <label>Slug
              <input name="slug" value="${escapeHtml(tenant.slug)}" required />
            </label>
            <label>Display name
              <input name="displayName" value="${escapeHtml(tenant.displayName)}" required />
            </label>
          </div>
          <div class="toolbar">
            <button type="submit">Save tenant</button>
            <button class="danger" type="submit" formaction="/resources/tenants/delete">Delete tenant</button>
          </div>
        </form>
      </details>`
    )
    .join("");

  const nodeRows = data.desiredState.spec.nodes
    .map(
      (node) => `<details>
        <summary>${escapeHtml(node.nodeId)} <span class="muted">(${escapeHtml(node.hostname)})</span></summary>
        <form method="post" action="/resources/nodes/upsert" class="stack">
          <input type="hidden" name="originalNodeId" value="${escapeHtml(node.nodeId)}" />
          <div class="form-grid">
            <label>Node ID
              <input name="nodeId" value="${escapeHtml(node.nodeId)}" required />
            </label>
            <label>Hostname
              <input name="hostname" value="${escapeHtml(node.hostname)}" required />
            </label>
            <label>Public IPv4
              <input name="publicIpv4" value="${escapeHtml(node.publicIpv4)}" required />
            </label>
            <label>WireGuard address
              <input name="wireguardAddress" value="${escapeHtml(node.wireguardAddress)}" required />
            </label>
          </div>
          <div class="toolbar">
            <button type="submit">Save node</button>
            <button class="danger" type="submit" formaction="/resources/nodes/delete">Delete node</button>
          </div>
        </form>
      </details>`
    )
    .join("");

  const zoneRows = data.desiredState.spec.zones
    .map(
      (zone) => `<details>
        <summary>${escapeHtml(zone.zoneName)}</summary>
        <form method="post" action="/resources/zones/upsert" class="stack">
          <input type="hidden" name="originalZoneName" value="${escapeHtml(zone.zoneName)}" />
          <div class="form-grid">
            <label>Zone name
              <input name="zoneName" value="${escapeHtml(zone.zoneName)}" required />
            </label>
            <label>Tenant slug
              <input name="tenantSlug" value="${escapeHtml(zone.tenantSlug)}" required />
            </label>
            <label>Primary node
              <input name="primaryNodeId" value="${escapeHtml(zone.primaryNodeId)}" required />
            </label>
          </div>
          <label>Records
            <textarea name="records" spellcheck="false" class="mono">${escapeHtml(
              formatZoneRecords(zone.records)
            )}</textarea>
          </label>
          <div class="toolbar">
            <button type="submit">Save zone</button>
            <button class="secondary" type="submit" formaction="/actions/zone-sync">Dispatch dns.sync</button>
            <button class="danger" type="submit" formaction="/resources/zones/delete">Delete zone</button>
          </div>
        </form>
      </details>`
    )
    .join("");

  const appRows = data.desiredState.spec.apps
    .map(
      (app) => `<details>
        <summary>${escapeHtml(app.slug)} <span class="muted">(${escapeHtml(app.canonicalDomain)})</span></summary>
        <form method="post" action="/resources/apps/upsert" class="stack">
          <input type="hidden" name="originalSlug" value="${escapeHtml(app.slug)}" />
          <div class="form-grid">
            <label>Slug
              <input name="slug" value="${escapeHtml(app.slug)}" required />
            </label>
            <label>Tenant slug
              <input name="tenantSlug" value="${escapeHtml(app.tenantSlug)}" required />
            </label>
            <label>Zone name
              <input name="zoneName" value="${escapeHtml(app.zoneName)}" required />
            </label>
            <label>Primary node
              <input name="primaryNodeId" value="${escapeHtml(app.primaryNodeId)}" required />
            </label>
            <label>Standby node
              <input name="standbyNodeId" value="${escapeHtml(app.standbyNodeId ?? "")}" />
            </label>
            <label>Canonical domain
              <input name="canonicalDomain" value="${escapeHtml(app.canonicalDomain)}" required />
            </label>
            <label>Aliases
              <input name="aliases" value="${escapeHtml(app.aliases.join(", "))}" />
            </label>
            <label>Backend port
              <input name="backendPort" type="number" value="${escapeHtml(String(app.backendPort))}" required />
            </label>
            <label>Runtime image
              <input name="runtimeImage" value="${escapeHtml(app.runtimeImage)}" required />
            </label>
            <label>Storage root
              <input name="storageRoot" value="${escapeHtml(app.storageRoot)}" required />
            </label>
            <label>Mode
              <input name="mode" value="${escapeHtml(app.mode)}" required />
            </label>
          </div>
          <div class="toolbar">
            <button type="submit">Save app</button>
            <button class="secondary" type="submit" formaction="/actions/app-reconcile">Full reconcile</button>
            <button class="secondary" type="submit" formaction="/actions/app-render-proxy">Dispatch proxy.render</button>
            <button class="danger" type="submit" formaction="/resources/apps/delete">Delete app</button>
          </div>
        </form>
      </details>`
    )
    .join("");

  const databaseRows = data.desiredState.spec.databases
    .map(
      (database) => `<details>
        <summary>${escapeHtml(database.appSlug)} <span class="muted">(${escapeHtml(
          `${database.engine}:${database.databaseName}`
        )})</span></summary>
        <form method="post" action="/resources/databases/upsert" class="stack">
          <input type="hidden" name="originalAppSlug" value="${escapeHtml(database.appSlug)}" />
          <div class="form-grid">
            <label>App slug
              <input name="appSlug" value="${escapeHtml(database.appSlug)}" required />
            </label>
            <label>Engine
              <select name="engine">
                <option value="postgresql"${database.engine === "postgresql" ? " selected" : ""}>postgresql</option>
                <option value="mariadb"${database.engine === "mariadb" ? " selected" : ""}>mariadb</option>
              </select>
            </label>
            <label>Database name
              <input name="databaseName" value="${escapeHtml(database.databaseName)}" required />
            </label>
            <label>Database user
              <input name="databaseUser" value="${escapeHtml(database.databaseUser)}" required />
            </label>
            <label>Primary node
              <input name="primaryNodeId" value="${escapeHtml(database.primaryNodeId)}" required />
            </label>
            <label>Standby node
              <input name="standbyNodeId" value="${escapeHtml(database.standbyNodeId ?? "")}" />
            </label>
            <label>Pending migration target
              <input name="pendingMigrationTo" value="${escapeHtml(database.pendingMigrationTo ?? "")}" />
            </label>
            <label>Desired password
              <input type="password" name="desiredPassword" placeholder="leave blank to keep stored secret" />
            </label>
          </div>
          <div class="toolbar">
            <button type="submit">Save database</button>
            <button class="secondary" type="submit" formaction="/actions/database-reconcile">Dispatch database reconcile</button>
            <button class="danger" type="submit" formaction="/resources/databases/delete">Delete database</button>
          </div>
        </form>
      </details>`
    )
    .join("");

  const backupRows = data.desiredState.spec.backupPolicies
    .map(
      (policy) => `<details>
        <summary>${escapeHtml(policy.policySlug)}</summary>
        <form method="post" action="/resources/backups/upsert" class="stack">
          <input type="hidden" name="originalPolicySlug" value="${escapeHtml(policy.policySlug)}" />
          <div class="form-grid">
            <label>Policy slug
              <input name="policySlug" value="${escapeHtml(policy.policySlug)}" required />
            </label>
            <label>Tenant slug
              <input name="tenantSlug" value="${escapeHtml(policy.tenantSlug)}" required />
            </label>
            <label>Target node
              <input name="targetNodeId" value="${escapeHtml(policy.targetNodeId)}" required />
            </label>
            <label>Schedule
              <input name="schedule" value="${escapeHtml(policy.schedule)}" required />
            </label>
            <label>Retention days
              <input type="number" name="retentionDays" value="${escapeHtml(String(policy.retentionDays))}" required />
            </label>
            <label>Storage location
              <input name="storageLocation" value="${escapeHtml(policy.storageLocation)}" required />
            </label>
            <label>Resource selectors
              <input name="resourceSelectors" value="${escapeHtml(policy.resourceSelectors.join(", "))}" />
            </label>
          </div>
          <div class="toolbar">
            <button type="submit">Save backup policy</button>
            <button class="danger" type="submit" formaction="/resources/backups/delete">Delete backup policy</button>
          </div>
        </form>
      </details>`
    )
    .join("");

  return `<section class="panel">
    <h2>Desired State</h2>
    <p class="muted">Source of truth is PostgreSQL. The forms below mutate the current spec and apply it back through the SHP API.</p>
    <div class="grid grid-two">
      <article class="panel">
        <h3>Create tenant</h3>
        <form method="post" action="/resources/tenants/upsert" class="stack">
          <div class="form-grid">
            <label>Slug
              <input name="slug" required />
            </label>
            <label>Display name
              <input name="displayName" required />
            </label>
          </div>
          <button type="submit">Create tenant</button>
        </form>
      </article>
      <article class="panel">
        <h3>Create node</h3>
        <form method="post" action="/resources/nodes/upsert" class="stack">
          <div class="form-grid">
            <label>Node ID
              <input name="nodeId" required />
            </label>
            <label>Hostname
              <input name="hostname" required />
            </label>
            <label>Public IPv4
              <input name="publicIpv4" required />
            </label>
            <label>WireGuard address
              <input name="wireguardAddress" required />
            </label>
          </div>
          <button type="submit">Create node</button>
        </form>
      </article>
      <article class="panel">
        <h3>Create zone</h3>
        <form method="post" action="/resources/zones/upsert" class="stack">
          <div class="form-grid">
            <label>Zone name
              <input name="zoneName" required />
            </label>
            <label>Tenant slug
              <input name="tenantSlug" required />
            </label>
            <label>Primary node
              <input name="primaryNodeId" required />
            </label>
          </div>
          <label>Records
            <textarea name="records" spellcheck="false" class="mono" placeholder="@ A 203.0.113.10 300"></textarea>
          </label>
          <button type="submit">Create zone</button>
        </form>
      </article>
      <article class="panel">
        <h3>Create app</h3>
        <form method="post" action="/resources/apps/upsert" class="stack">
          <div class="form-grid">
            <label>Slug
              <input name="slug" required />
            </label>
            <label>Tenant slug
              <input name="tenantSlug" required />
            </label>
            <label>Zone name
              <input name="zoneName" required />
            </label>
            <label>Primary node
              <input name="primaryNodeId" required />
            </label>
            <label>Standby node
              <input name="standbyNodeId" />
            </label>
            <label>Canonical domain
              <input name="canonicalDomain" required />
            </label>
            <label>Aliases
              <input name="aliases" />
            </label>
            <label>Backend port
              <input type="number" name="backendPort" required />
            </label>
            <label>Runtime image
              <input name="runtimeImage" required />
            </label>
            <label>Storage root
              <input name="storageRoot" required />
            </label>
            <label>Mode
              <input name="mode" value="active-passive" required />
            </label>
          </div>
          <button type="submit">Create app</button>
        </form>
      </article>
      <article class="panel">
        <h3>Create database</h3>
        <form method="post" action="/resources/databases/upsert" class="stack">
          <div class="form-grid">
            <label>App slug
              <input name="appSlug" required />
            </label>
            <label>Engine
              <select name="engine">
                <option value="postgresql">postgresql</option>
                <option value="mariadb">mariadb</option>
              </select>
            </label>
            <label>Database name
              <input name="databaseName" required />
            </label>
            <label>Database user
              <input name="databaseUser" required />
            </label>
            <label>Primary node
              <input name="primaryNodeId" required />
            </label>
            <label>Standby node
              <input name="standbyNodeId" />
            </label>
            <label>Pending migration target
              <input name="pendingMigrationTo" />
            </label>
            <label>Desired password
              <input type="password" name="desiredPassword" />
            </label>
          </div>
          <button type="submit">Create database</button>
        </form>
      </article>
      <article class="panel">
        <h3>Create backup policy</h3>
        <form method="post" action="/resources/backups/upsert" class="stack">
          <div class="form-grid">
            <label>Policy slug
              <input name="policySlug" required />
            </label>
            <label>Tenant slug
              <input name="tenantSlug" required />
            </label>
            <label>Target node
              <input name="targetNodeId" required />
            </label>
            <label>Schedule
              <input name="schedule" placeholder="0 */6 * * *" required />
            </label>
            <label>Retention days
              <input type="number" name="retentionDays" required />
            </label>
            <label>Storage location
              <input name="storageLocation" required />
            </label>
            <label>Resource selectors
              <input name="resourceSelectors" />
            </label>
          </div>
          <button type="submit">Create backup policy</button>
        </form>
      </article>
    </div>
    <div class="grid">
      <article class="panel"><h3>Tenants</h3>${tenantRows || '<p class="empty">No tenants.</p>'}</article>
      <article class="panel"><h3>Nodes</h3>${nodeRows || '<p class="empty">No nodes.</p>'}</article>
      <article class="panel"><h3>Zones</h3>${zoneRows || '<p class="empty">No zones.</p>'}</article>
      <article class="panel"><h3>Apps</h3>${appRows || '<p class="empty">No apps.</p>'}</article>
      <article class="panel"><h3>Databases</h3>${databaseRows || '<p class="empty">No databases.</p>'}</article>
      <article class="panel"><h3>Backup policies</h3>${backupRows || '<p class="empty">No backup policies.</p>'}</article>
    </div>
  </section>`;
}

function renderDashboard(data: DashboardData, notice?: PanelNotice): string {
  const actionBar = `<div class="toolbar">
    <form method="post" action="/actions/reconcile-run" class="inline-form">
      <button type="submit">Run reconciliation</button>
    </form>
    <form method="post" action="/actions/inventory-import" class="inline-form">
      <input type="text" name="path" value="${escapeHtml(
        data.inventory.latestImport?.sourcePath ?? config.inventory.importPath
      )}" style="min-width: 22rem;" />
      <button class="secondary" type="submit">Import YAML inventory</button>
    </form>
    <a href="/inventory/export">Download desired-state YAML</a>
    <form method="post" action="/auth/logout" class="inline-form">
      <button class="danger" type="submit">Sign out</button>
    </form>
  </div>`;

  const nodeHealthRows = data.nodeHealth
    .map(
      (node) => `<tr>
        <td class="mono">${escapeHtml(node.nodeId)}</td>
        <td>${escapeHtml(node.hostname)}</td>
        <td>${node.currentVersion ? renderPill(node.currentVersion, "muted") : "-"}</td>
        <td>${renderPill(String(node.pendingJobCount), node.pendingJobCount > 0 ? "danger" : "success")}</td>
        <td>${node.latestJobStatus ? renderPill(node.latestJobStatus, node.latestJobStatus === "failed" ? "danger" : node.latestJobStatus === "applied" ? "success" : "muted") : "-"}</td>
        <td>${escapeHtml(node.latestJobSummary ?? "-")}</td>
        <td>${escapeHtml(formatDate(node.lastSeenAt))}</td>
      </tr>`
    )
    .join("");

  const driftRows = data.drift
    .map(
      (entry) => `<tr>
        <td>${escapeHtml(entry.resourceKind)}</td>
        <td class="mono">${escapeHtml(entry.resourceKey)}</td>
        <td class="mono">${escapeHtml(entry.nodeId)}</td>
        <td>${renderPill(
          entry.driftStatus,
          entry.driftStatus === "in_sync"
            ? "success"
            : entry.driftStatus === "pending"
              ? "muted"
              : "danger"
        )}</td>
        <td>${entry.latestJobStatus ? renderPill(entry.latestJobStatus, entry.latestJobStatus === "applied" ? "success" : "danger") : "-"}</td>
        <td>${escapeHtml(entry.latestSummary ?? "-")}</td>
      </tr>`
    )
    .join("");

  const jobRows = data.jobHistory
    .map(
      (job) => `<tr>
        <td class="mono">${escapeHtml(job.jobId)}</td>
        <td>${escapeHtml(job.kind)}</td>
        <td class="mono">${escapeHtml(job.nodeId)}</td>
        <td>${job.status ? renderPill(job.status, job.status === "applied" ? "success" : job.status === "failed" ? "danger" : "muted") : renderPill("queued", "muted")}</td>
        <td>${escapeHtml(job.dispatchReason ?? "-")}</td>
        <td>${escapeHtml(job.summary ?? "-")}</td>
        <td>${escapeHtml(formatDate(job.createdAt))}</td>
      </tr>`
    )
    .join("");

  const backupRows = data.backups.latestRuns
    .map(
      (run) => `<tr>
        <td class="mono">${escapeHtml(run.policySlug)}</td>
        <td class="mono">${escapeHtml(run.nodeId)}</td>
        <td>${renderPill(run.status, run.status === "succeeded" ? "success" : run.status === "failed" ? "danger" : "muted")}</td>
        <td>${escapeHtml(run.summary)}</td>
        <td>${escapeHtml(formatDate(run.startedAt))}</td>
      </tr>`
    )
    .join("");

  const inventoryPanels = `<section class="grid grid-three">
    <article class="panel">
      <h2>Users and scope</h2>
      <p><strong>${escapeHtml(data.currentUser.displayName)}</strong> &lt;${escapeHtml(
        data.currentUser.email
      )}&gt;</p>
      <p class="muted">Global roles: ${escapeHtml(formatList(data.currentUser.globalRoles))}</p>
      <p class="muted">Tenant memberships: ${escapeHtml(
        data.currentUser.tenantMemberships.length > 0
          ? data.currentUser.tenantMemberships
              .map((membership) => `${membership.tenantSlug}:${membership.role}`)
              .join(", ")
          : "none"
      )}</p>
    </article>
    <article class="panel">
      <h2>Inventory import</h2>
      <p class="muted">Latest import: ${escapeHtml(
        data.inventory.latestImport
          ? `${formatDate(data.inventory.latestImport.importedAt)} from ${data.inventory.latestImport.sourcePath}`
          : "never"
      )}</p>
      <p class="muted">Nodes ${data.inventory.nodes.length}, zones ${data.inventory.zones.length}, apps ${data.inventory.apps.length}, databases ${data.inventory.databases.length}</p>
    </article>
    <article class="panel">
      <h2>Latest reconciliation</h2>
      ${
        data.overview.latestReconciliation
          ? `<p class="muted">Version ${escapeHtml(
              data.overview.latestReconciliation.desiredStateVersion
            )}</p>
             <p class="muted">Generated ${data.overview.latestReconciliation.generatedJobCount}, skipped ${data.overview.latestReconciliation.skippedJobCount}, missing secrets ${data.overview.latestReconciliation.missingCredentialCount}</p>`
          : '<p class="muted">No reconciliation run recorded yet.</p>'
      }
    </article>
  </section>`;

  const operationsPanels = `<section class="grid grid-two">
    <article class="panel">
      <h2>Node Health</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Node</th><th>Hostname</th><th>Version</th><th>Pending</th><th>Latest status</th><th>Latest summary</th><th>Last seen</th></tr>
          </thead>
          <tbody>${nodeHealthRows || '<tr><td colspan="7" class="muted">No nodes.</td></tr>'}</tbody>
        </table>
      </div>
    </article>
    <article class="panel">
      <h2>Resource Drift</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Kind</th><th>Resource</th><th>Node</th><th>Drift</th><th>Latest status</th><th>Summary</th></tr>
          </thead>
          <tbody>${driftRows || '<tr><td colspan="6" class="muted">No drift records.</td></tr>'}</tbody>
        </table>
      </div>
    </article>
    <article class="panel">
      <h2>Job History</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Job</th><th>Kind</th><th>Node</th><th>Status</th><th>Reason</th><th>Summary</th><th>Created</th></tr>
          </thead>
          <tbody>${jobRows || '<tr><td colspan="7" class="muted">No jobs.</td></tr>'}</tbody>
        </table>
      </div>
    </article>
    <article class="panel">
      <h2>Backups</h2>
      <p class="muted">Configured policies: ${data.backups.policies.length}</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Policy</th><th>Node</th><th>Status</th><th>Summary</th><th>Started</th></tr>
          </thead>
          <tbody>${backupRows || '<tr><td colspan="5" class="muted">No backup runs.</td></tr>'}</tbody>
        </table>
      </div>
    </article>
  </section>`;

  return renderPanelShell({
    title: "SimpleHostPanel",
    heading: "SimpleHostPanel",
    eyebrow: `web runtime ${config.version}`,
    notice,
    actions: actionBar,
    body: [
      `<section class="grid">${renderStats(data.overview)}</section>`,
      inventoryPanels,
      operationsPanels,
      renderDesiredStateSection(data)
    ].join("")
  });
}

async function loadDashboardData(token: string): Promise<DashboardData> {
  const [
    currentUser,
    overview,
    inventory,
    desiredState,
    drift,
    nodeHealth,
    jobHistory,
    backups
  ] = await Promise.all([
    apiRequest<AuthenticatedUserSummary>("/v1/auth/me", { token }),
    apiRequest<OperationsOverview>("/v1/operations/overview", { token }),
    apiRequest<InventoryStateSnapshot>("/v1/inventory/summary", { token }),
    apiRequest<DesiredStateExportResponse>("/v1/resources/spec", { token }),
    apiRequest<ResourceDriftSummary[]>("/v1/resources/drift", { token }),
    apiRequest<NodeHealthSnapshot[]>("/v1/nodes/health", { token }),
    apiRequest<JobHistoryEntry[]>("/v1/jobs/history?limit=30", { token }),
    apiRequest<BackupsOverview>("/v1/backups/summary", { token })
  ]);

  return {
    currentUser,
    overview,
    inventory,
    desiredState,
    drift,
    nodeHealth,
    jobHistory,
    backups
  };
}

function getNoticeFromUrl(url: URL): PanelNotice | undefined {
  const message = url.searchParams.get("notice");
  const kind = url.searchParams.get("kind");

  if (!message) {
    return undefined;
  }

  return {
    kind:
      kind === "success" || kind === "error" || kind === "info"
        ? kind
        : "info",
    message
  };
}

function noticeLocation(message: string, kind: PanelNotice["kind"] = "success"): string {
  const url = new URL("http://localhost/");
  url.searchParams.set("notice", message);
  url.searchParams.set("kind", kind);
  return `${url.pathname}${url.search}`;
}

async function loadDesiredStateSpec(token: string): Promise<DesiredStateSpec> {
  const exported = await apiRequest<DesiredStateExportResponse>("/v1/resources/spec", {
    token
  });
  return exported.spec;
}

async function applyDesiredStateSpec(
  token: string,
  spec: DesiredStateSpec,
  reason: string
): Promise<void> {
  await apiRequest<unknown>("/v1/resources/spec", {
    method: "PUT",
    token,
    body: {
      spec,
      reason
    } satisfies DesiredStateApplyRequest
  });
}

async function mutateDesiredState(
  token: string,
  reason: string,
  action: (spec: DesiredStateSpec) => DesiredStateSpec
): Promise<void> {
  const spec = await loadDesiredStateSpec(token);
  await applyDesiredStateSpec(token, action(spec), reason);
}

function parseTenantForm(form: URLSearchParams): DesiredStateTenantInput {
  return {
    slug: form.get("slug")?.trim() ?? "",
    displayName: form.get("displayName")?.trim() ?? ""
  };
}

function parseNodeForm(form: URLSearchParams): DesiredStateNodeInput {
  return {
    nodeId: form.get("nodeId")?.trim() ?? "",
    hostname: form.get("hostname")?.trim() ?? "",
    publicIpv4: form.get("publicIpv4")?.trim() ?? "",
    wireguardAddress: form.get("wireguardAddress")?.trim() ?? ""
  };
}

function parseZoneForm(form: URLSearchParams): DesiredStateZoneInput {
  return {
    zoneName: form.get("zoneName")?.trim() ?? "",
    tenantSlug: form.get("tenantSlug")?.trim() ?? "",
    primaryNodeId: form.get("primaryNodeId")?.trim() ?? "",
    records: parseZoneRecords(form.get("records")?.trim() ?? "")
  };
}

function parseAppForm(form: URLSearchParams): DesiredStateAppInput {
  return {
    slug: form.get("slug")?.trim() ?? "",
    tenantSlug: form.get("tenantSlug")?.trim() ?? "",
    zoneName: form.get("zoneName")?.trim() ?? "",
    primaryNodeId: form.get("primaryNodeId")?.trim() ?? "",
    standbyNodeId: form.get("standbyNodeId")?.trim() || undefined,
    canonicalDomain: form.get("canonicalDomain")?.trim() ?? "",
    aliases: parseCommaSeparated(form.get("aliases") ?? ""),
    backendPort: parseOptionalNumber(form.get("backendPort")?.trim() ?? "") ?? 0,
    runtimeImage: form.get("runtimeImage")?.trim() ?? "",
    storageRoot: form.get("storageRoot")?.trim() ?? "",
    mode: form.get("mode")?.trim() ?? "active-passive"
  };
}

function parseDatabaseForm(form: URLSearchParams): DesiredStateDatabaseInput {
  const engine = form.get("engine")?.trim();
  const pendingMigrationValue = form.get("pendingMigrationTo")?.trim() || undefined;

  if (engine !== "postgresql" && engine !== "mariadb") {
    throw new Error(`Unsupported database engine ${engine ?? ""}.`);
  }

  if (
    pendingMigrationValue &&
    pendingMigrationValue !== "postgresql" &&
    pendingMigrationValue !== "mariadb"
  ) {
    throw new Error(`Unsupported pending migration target ${pendingMigrationValue}.`);
  }

  const pendingMigrationTo =
    pendingMigrationValue as DesiredStateDatabaseInput["pendingMigrationTo"];

  return {
    appSlug: form.get("appSlug")?.trim() ?? "",
    engine,
    databaseName: form.get("databaseName")?.trim() ?? "",
    databaseUser: form.get("databaseUser")?.trim() ?? "",
    primaryNodeId: form.get("primaryNodeId")?.trim() ?? "",
    standbyNodeId: form.get("standbyNodeId")?.trim() || undefined,
    pendingMigrationTo,
    desiredPassword: form.get("desiredPassword")?.trim() || undefined
  };
}

function parseBackupPolicyForm(form: URLSearchParams): DesiredStateBackupPolicyInput {
  return {
    policySlug: form.get("policySlug")?.trim() ?? "",
    tenantSlug: form.get("tenantSlug")?.trim() ?? "",
    targetNodeId: form.get("targetNodeId")?.trim() ?? "",
    schedule: form.get("schedule")?.trim() ?? "",
    retentionDays: parseOptionalNumber(form.get("retentionDays")?.trim() ?? "") ?? 0,
    storageLocation: form.get("storageLocation")?.trim() ?? "",
    resourceSelectors: parseCommaSeparated(form.get("resourceSelectors") ?? "")
  };
}

async function requireSessionToken(request: IncomingMessage): Promise<string> {
  const token = readSessionToken(request);

  if (!token) {
    throw new WebApiError(401, "Missing session.");
  }

  return token;
}

async function handleDashboard(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const token = readSessionToken(request);
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (!token) {
    writeHtml(response, 200, renderLoginPage(getNoticeFromUrl(url)));
    return;
  }

  try {
    const data = await loadDashboardData(token);
    writeHtml(response, 200, renderDashboard(data, getNoticeFromUrl(url)));
  } catch (error) {
    if (error instanceof WebApiError && error.statusCode === 401) {
      redirect(response, "/login", clearSessionCookie());
      return;
    }

    writeHtml(
      response,
      500,
      renderLoginPage({
        kind: "error",
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }
}

async function requestHandler(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/healthz") {
    writeJson(response, 200, {
      service: "web",
      status: "ok",
      version: config.version,
      environment: config.env,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      upstreamApi: `${config.api.host}:${config.api.port}`
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/login")) {
    await handleDashboard(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/auth/login") {
    const form = await readFormBody(request);

    try {
      const login = await apiRequest<AuthLoginResponse>("/v1/auth/login", {
        method: "POST",
        body: {
          email: form.get("email")?.trim() ?? "",
          password: form.get("password")?.trim() ?? ""
        } satisfies AuthLoginRequest
      });

      redirect(
        response,
        noticeLocation(`Signed in as ${login.user.email}.`, "success"),
        serializeSessionCookie(login.sessionToken, login.expiresAt)
      );
    } catch (error) {
      writeHtml(
        response,
        error instanceof WebApiError ? error.statusCode : 500,
        renderLoginPage({
          kind: "error",
          message: error instanceof Error ? error.message : String(error)
        })
      );
    }

    return;
  }

  if (request.method === "POST" && url.pathname === "/auth/logout") {
    const token = readSessionToken(request);

    if (token) {
      try {
        await apiRequest("/v1/auth/logout", {
          method: "POST",
          token
        });
      } catch {
        // Ignore logout errors and clear the local cookie anyway.
      }
    }

    redirect(response, "/login?notice=Session%20closed&kind=info", clearSessionCookie());
    return;
  }

  if (request.method === "GET" && url.pathname === "/inventory/export") {
    const token = await requireSessionToken(request);
    const yaml = await apiRequest<string>("/v1/inventory/export", {
      token,
      responseType: "text"
    });
    response.writeHead(200, {
      "content-type": "text/yaml; charset=utf-8",
      "content-disposition": 'attachment; filename="simplehost-desired-state.yaml"'
    });
    response.end(yaml);
    return;
  }

  if (request.method === "POST" && url.pathname === "/actions/inventory-import") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const pathValue = form.get("path")?.trim() || config.inventory.importPath;
    const result = await apiRequest<InventoryImportSummary>("/v1/inventory/import", {
      method: "POST",
      token,
      body: {
        path: pathValue
      }
    });
    redirect(
      response,
      noticeLocation(
        `Imported inventory from ${result.sourcePath}. ${result.appCount} apps and ${result.databaseCount} databases refreshed.`,
        "success"
      )
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/actions/reconcile-run") {
    const token = await requireSessionToken(request);
    const result = await apiRequest<{ generatedJobCount: number; skippedJobCount: number }>(
      "/v1/reconcile/run",
      {
        method: "POST",
        token
      }
    );
    redirect(
      response,
      noticeLocation(
        `Reconciliation generated ${result.generatedJobCount} job(s) and skipped ${result.skippedJobCount}.`,
        "success"
      )
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/actions/zone-sync") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const zoneName = form.get("zoneName")?.trim() ?? "";
    const result = await apiRequest<JobDispatchResponse>(
      `/v1/zones/${encodeURIComponent(zoneName)}/sync`,
      {
        method: "POST",
        token
      }
    );
    redirect(
      response,
      noticeLocation(`Queued ${result.jobs.length} dns.sync job(s) for ${zoneName}.`, "success")
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/actions/app-reconcile") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const slug = form.get("slug")?.trim() ?? "";
    const requestBody: AppReconcileRequest = {
      includeDns: true,
      includeProxy: true,
      includeStandbyProxy: true
    };
    const result = await apiRequest<JobDispatchResponse>(
      `/v1/apps/${encodeURIComponent(slug)}/reconcile`,
      {
        method: "POST",
        token,
        body: requestBody
      }
    );
    redirect(
      response,
      noticeLocation(`Queued ${result.jobs.length} job(s) for app ${slug}.`, "success")
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/actions/app-render-proxy") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const slug = form.get("slug")?.trim() ?? "";
    const result = await apiRequest<JobDispatchResponse>(
      `/v1/apps/${encodeURIComponent(slug)}/render-proxy`,
      {
        method: "POST",
        token
      }
    );
    redirect(
      response,
      noticeLocation(`Queued ${result.jobs.length} proxy.render job(s) for ${slug}.`, "success")
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/actions/database-reconcile") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const appSlug = form.get("appSlug")?.trim() ?? "";
    const password = form.get("desiredPassword")?.trim();
    const requestBody: DatabaseReconcileRequest = {};

    if (password) {
      requestBody.password = password;
    }

    const result = await apiRequest<JobDispatchResponse>(
      `/v1/databases/${encodeURIComponent(appSlug)}/reconcile`,
      {
        method: "POST",
        token,
        body: requestBody
      }
    );
    redirect(
      response,
      noticeLocation(
        `Queued ${result.jobs.length} database reconcile job(s) for ${appSlug}.`,
        "success"
      )
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/tenants/upsert") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const next = parseTenantForm(form);
    await mutateDesiredState(token, `web.tenant.upsert:${next.slug}`, (spec) => ({
      ...spec,
      tenants: upsertByKey(spec.tenants, next, (item) => item.slug, form.get("originalSlug") ?? undefined)
    }));
    redirect(response, noticeLocation(`Saved tenant ${next.slug}.`, "success"));
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/tenants/delete") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const slug = form.get("originalSlug")?.trim() ?? form.get("slug")?.trim() ?? "";
    await mutateDesiredState(token, `web.tenant.delete:${slug}`, (spec) => ({
      ...spec,
      tenants: removeByKey(spec.tenants, slug, (item) => item.slug)
    }));
    redirect(response, noticeLocation(`Deleted tenant ${slug}.`, "success"));
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/nodes/upsert") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const next = parseNodeForm(form);
    await mutateDesiredState(token, `web.node.upsert:${next.nodeId}`, (spec) => ({
      ...spec,
      nodes: upsertByKey(
        spec.nodes,
        next,
        (item) => item.nodeId,
        form.get("originalNodeId") ?? undefined
      )
    }));
    redirect(response, noticeLocation(`Saved node ${next.nodeId}.`, "success"));
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/nodes/delete") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const nodeId = form.get("originalNodeId")?.trim() ?? form.get("nodeId")?.trim() ?? "";
    await mutateDesiredState(token, `web.node.delete:${nodeId}`, (spec) => ({
      ...spec,
      nodes: removeByKey(spec.nodes, nodeId, (item) => item.nodeId)
    }));
    redirect(response, noticeLocation(`Deleted node ${nodeId}.`, "success"));
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/zones/upsert") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const next = parseZoneForm(form);
    await mutateDesiredState(token, `web.zone.upsert:${next.zoneName}`, (spec) => ({
      ...spec,
      zones: upsertByKey(
        spec.zones,
        next,
        (item) => item.zoneName,
        form.get("originalZoneName") ?? undefined
      )
    }));
    redirect(response, noticeLocation(`Saved zone ${next.zoneName}.`, "success"));
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/zones/delete") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const zoneName =
      form.get("originalZoneName")?.trim() ?? form.get("zoneName")?.trim() ?? "";
    await mutateDesiredState(token, `web.zone.delete:${zoneName}`, (spec) => ({
      ...spec,
      zones: removeByKey(spec.zones, zoneName, (item) => item.zoneName)
    }));
    redirect(response, noticeLocation(`Deleted zone ${zoneName}.`, "success"));
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/apps/upsert") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const next = parseAppForm(form);
    await mutateDesiredState(token, `web.app.upsert:${next.slug}`, (spec) => ({
      ...spec,
      apps: upsertByKey(spec.apps, next, (item) => item.slug, form.get("originalSlug") ?? undefined)
    }));
    redirect(response, noticeLocation(`Saved app ${next.slug}.`, "success"));
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/apps/delete") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const slug = form.get("originalSlug")?.trim() ?? form.get("slug")?.trim() ?? "";
    await mutateDesiredState(token, `web.app.delete:${slug}`, (spec) => ({
      ...spec,
      apps: removeByKey(spec.apps, slug, (item) => item.slug)
    }));
    redirect(response, noticeLocation(`Deleted app ${slug}.`, "success"));
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/databases/upsert") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const next = parseDatabaseForm(form);
    await mutateDesiredState(token, `web.database.upsert:${next.appSlug}`, (spec) => ({
      ...spec,
      databases: upsertByKey(
        spec.databases,
        next,
        (item) => item.appSlug,
        form.get("originalAppSlug") ?? undefined
      )
    }));
    redirect(response, noticeLocation(`Saved database ${next.appSlug}.`, "success"));
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/databases/delete") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const appSlug =
      form.get("originalAppSlug")?.trim() ?? form.get("appSlug")?.trim() ?? "";
    await mutateDesiredState(token, `web.database.delete:${appSlug}`, (spec) => ({
      ...spec,
      databases: removeByKey(spec.databases, appSlug, (item) => item.appSlug)
    }));
    redirect(response, noticeLocation(`Deleted database ${appSlug}.`, "success"));
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/backups/upsert") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const next = parseBackupPolicyForm(form);
    await mutateDesiredState(token, `web.backup-policy.upsert:${next.policySlug}`, (spec) => ({
      ...spec,
      backupPolicies: upsertByKey(
        spec.backupPolicies,
        next,
        (item) => item.policySlug,
        form.get("originalPolicySlug") ?? undefined
      )
    }));
    redirect(response, noticeLocation(`Saved backup policy ${next.policySlug}.`, "success"));
    return;
  }

  if (request.method === "POST" && url.pathname === "/resources/backups/delete") {
    const token = await requireSessionToken(request);
    const form = await readFormBody(request);
    const policySlug =
      form.get("originalPolicySlug")?.trim() ?? form.get("policySlug")?.trim() ?? "";
    await mutateDesiredState(token, `web.backup-policy.delete:${policySlug}`, (spec) => ({
      ...spec,
      backupPolicies: removeByKey(spec.backupPolicies, policySlug, (item) => item.policySlug)
    }));
    redirect(response, noticeLocation(`Deleted backup policy ${policySlug}.`, "success"));
    return;
  }

  writeJson(response, 404, {
    error: "Not Found",
    method: request.method ?? "GET",
    path: url.pathname
  });
}

export function startPanelWeb(): ReturnType<typeof createServer> {
  const server = createServer((request, response) => {
    void requestHandler(request, response).catch((error: unknown) => {
      if (error instanceof WebApiError && error.statusCode === 401) {
        redirect(response, "/login?notice=Session%20required&kind=error", clearSessionCookie());
        return;
      }

      writeHtml(
        response,
        error instanceof WebApiError ? error.statusCode : 500,
        renderLoginPage({
          kind: "error",
          message: error instanceof Error ? error.message : String(error)
        })
      );
    });
  });

  server.listen(config.web.port, config.web.host, () => {
    console.log(`SHP Web listening on http://${config.web.host}:${config.web.port}`);
  });

  return server;
}

function isMainModule(): boolean {
  if (process.argv[1] === undefined) {
    return false;
  }

  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return fileURLToPath(import.meta.url) === process.argv[1];
  }
}

if (isMainModule()) {
  const server = startPanelWeb();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.close(() => {
        process.exit(0);
      });
    });
  }
}
