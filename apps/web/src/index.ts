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
import {
  escapeHtml,
  renderAdminShell,
  renderDataTable,
  renderPanelShell,
  renderTabs,
  type AdminNavGroup,
  type DataTableRow,
  type PanelNotice,
  type TabItem
} from "@simplehost/panel-ui";

const config = createPanelRuntimeConfig();
const startedAt = Date.now();
const sessionCookieName = "shp_session";
const localeCookieName = "shp_lang";

type WebLocale = "en" | "es";

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

interface WebCopy {
  appName: string;
  eyebrow: string;
  loginTitle: string;
  loginHeading: string;
  loginAccess: string;
  emailLabel: string;
  passwordLabel: string;
  signInLabel: string;
  signOutLabel: string;
  languageLabel: string;
  versionLabel: string;
  sidebarSearchPlaceholder: string;
  navControlPlane: string;
  navOverview: string;
  navContext: string;
  navOperations: string;
  navNodeHealth: string;
  navDrift: string;
  navJobs: string;
  navBackups: string;
  navResources: string;
  navDesiredState: string;
  navCreate: string;
  navTenants: string;
  navNodes: string;
  navZones: string;
  navApps: string;
  navDatabases: string;
  navBackupPolicies: string;
  dashboardHeading: string;
  dashboardSubheading: string;
  overviewDescription: string;
  actionsRunReconciliation: string;
  actionsImportInventory: string;
  actionsDownloadYaml: string;
  actionPlanDescription: string;
  actionImportDescription: string;
  actionExportDescription: string;
  overviewTitle: string;
  managedNodes: string;
  pendingJobs: string;
  failedJobs: string;
  resourcesWithDrift: string;
  backupPolicies: string;
  generatedAt: string;
  usersAndScope: string;
  inventoryImport: string;
  latestReconciliation: string;
  globalRoles: string;
  tenantMemberships: string;
  none: string;
  latestImport: string;
  never: string;
  latestImportCounts: string;
  noReconciliationRun: string;
  reconciliationVersion: string;
  reconciliationSummary: string;
  nodeHealthTitle: string;
  nodeHealthDescription: string;
  resourceDriftTitle: string;
  resourceDriftDescription: string;
  jobHistoryTitle: string;
  jobHistoryDescription: string;
  backupsTitle: string;
  backupsDescription: string;
  desiredStateTitle: string;
  desiredStateDescription: string;
  dataFilterPlaceholder: string;
  rowsPerPage: string;
  showing: string;
  of: string;
  records: string;
  nodeColNode: string;
  nodeColHostname: string;
  nodeColVersion: string;
  nodeColPending: string;
  nodeColLatestStatus: string;
  nodeColLatestSummary: string;
  nodeColLastSeen: string;
  driftColKind: string;
  driftColResource: string;
  driftColNode: string;
  driftColDrift: string;
  driftColLatestStatus: string;
  driftColSummary: string;
  jobColJob: string;
  jobColKind: string;
  jobColNode: string;
  jobColStatus: string;
  jobColReason: string;
  jobColSummary: string;
  jobColCreated: string;
  backupColPolicy: string;
  backupColNode: string;
  backupColStatus: string;
  backupColSummary: string;
  backupColStarted: string;
  noNodes: string;
  noDrift: string;
  noJobs: string;
  noBackups: string;
  tabCreate: string;
  tabTenants: string;
  tabNodes: string;
  tabZones: string;
  tabApps: string;
  tabDatabases: string;
  tabBackupPolicies: string;
}

const copyByLocale: Record<WebLocale, WebCopy> = {
  en: {
    appName: "SimpleHostPanel",
    eyebrow: "SimpleHostPanel admin",
    loginTitle: "SimpleHostPanel Login",
    loginHeading: "SHP Login",
    loginAccess: "Operator access",
    emailLabel: "Email",
    passwordLabel: "Password",
    signInLabel: "Sign in",
    signOutLabel: "Sign out",
    languageLabel: "Language",
    versionLabel: "Version",
    sidebarSearchPlaceholder: "Search navigation",
    navControlPlane: "Control plane",
    navOverview: "Overview",
    navContext: "Context",
    navOperations: "Operations",
    navNodeHealth: "Node health",
    navDrift: "Resource drift",
    navJobs: "Job history",
    navBackups: "Backups",
    navResources: "Desired state",
    navDesiredState: "Desired state",
    navCreate: "Create",
    navTenants: "Tenants",
    navNodes: "Nodes",
    navZones: "Zones",
    navApps: "Apps",
    navDatabases: "Databases",
    navBackupPolicies: "Backup policies",
    dashboardHeading: "Control plane",
    dashboardSubheading: "Operate nodes, jobs, backups, and desired state from a single control surface.",
    overviewDescription: "Live platform counts plus the main control-plane actions.",
    actionsRunReconciliation: "Run reconciliation",
    actionsImportInventory: "Import YAML inventory",
    actionsDownloadYaml: "Download desired-state YAML",
    actionPlanDescription: "Compare desired state against the last successful apply and dispatch missing work.",
    actionImportDescription: "Refresh PostgreSQL desired state from the bootstrap YAML inventory path.",
    actionExportDescription: "Export the current desired state for audit, review, or disaster recovery.",
    overviewTitle: "Operations overview",
    managedNodes: "Managed nodes",
    pendingJobs: "Pending jobs",
    failedJobs: "Failed jobs",
    resourcesWithDrift: "Resources with drift",
    backupPolicies: "Backup policies",
    generatedAt: "Generated",
    usersAndScope: "Users and scope",
    inventoryImport: "Inventory import",
    latestReconciliation: "Latest reconciliation",
    globalRoles: "Global roles",
    tenantMemberships: "Tenant memberships",
    none: "none",
    latestImport: "Latest import",
    never: "never",
    latestImportCounts: "Nodes {nodes}, zones {zones}, apps {apps}, databases {databases}",
    noReconciliationRun: "No reconciliation run recorded yet.",
    reconciliationVersion: "Version {version}",
    reconciliationSummary: "Generated {generated}, skipped {skipped}, missing secrets {missing}",
    nodeHealthTitle: "Node health",
    nodeHealthDescription: "Health, version, pending jobs and latest result by node.",
    resourceDriftTitle: "Resource drift",
    resourceDriftDescription: "Current reconciliation view across DNS, proxy and databases.",
    jobHistoryTitle: "Job history",
    jobHistoryDescription: "Recent control-plane dispatches and node execution status.",
    backupsTitle: "Backups",
    backupsDescription: "Latest runs and current backup policy coverage.",
    desiredStateTitle: "Desired state",
    desiredStateDescription: "PostgreSQL is the source of truth. Use tabs to create and manage platform resources.",
    dataFilterPlaceholder: "Filter records",
    rowsPerPage: "Rows per page",
    showing: "Showing",
    of: "of",
    records: "records",
    nodeColNode: "Node",
    nodeColHostname: "Hostname",
    nodeColVersion: "Version",
    nodeColPending: "Pending",
    nodeColLatestStatus: "Latest status",
    nodeColLatestSummary: "Latest summary",
    nodeColLastSeen: "Last seen",
    driftColKind: "Kind",
    driftColResource: "Resource",
    driftColNode: "Node",
    driftColDrift: "Drift",
    driftColLatestStatus: "Latest status",
    driftColSummary: "Summary",
    jobColJob: "Job",
    jobColKind: "Kind",
    jobColNode: "Node",
    jobColStatus: "Status",
    jobColReason: "Reason",
    jobColSummary: "Summary",
    jobColCreated: "Created",
    backupColPolicy: "Policy",
    backupColNode: "Node",
    backupColStatus: "Status",
    backupColSummary: "Summary",
    backupColStarted: "Started",
    noNodes: "No nodes.",
    noDrift: "No drift records.",
    noJobs: "No jobs.",
    noBackups: "No backup runs.",
    tabCreate: "Create",
    tabTenants: "Tenants",
    tabNodes: "Nodes",
    tabZones: "DNS zones",
    tabApps: "Apps",
    tabDatabases: "Databases",
    tabBackupPolicies: "Backup policies"
  },
  es: {
    appName: "SimpleHostPanel",
    eyebrow: "Administración SHP",
    loginTitle: "Acceso a SimpleHostPanel",
    loginHeading: "SHP Login",
    loginAccess: "Acceso de operador",
    emailLabel: "Correo",
    passwordLabel: "Contraseña",
    signInLabel: "Entrar",
    signOutLabel: "Salir",
    languageLabel: "Idioma",
    versionLabel: "Versión",
    sidebarSearchPlaceholder: "Buscar opción",
    navControlPlane: "Plano de control",
    navOverview: "Resumen",
    navContext: "Contexto",
    navOperations: "Operaciones",
    navNodeHealth: "Salud de nodos",
    navDrift: "Drift de recursos",
    navJobs: "Historial de jobs",
    navBackups: "Backups",
    navResources: "Estado deseado",
    navDesiredState: "Estado deseado",
    navCreate: "Crear",
    navTenants: "Tenants",
    navNodes: "Nodos",
    navZones: "Zonas",
    navApps: "Apps",
    navDatabases: "Bases de datos",
    navBackupPolicies: "Políticas de backup",
    dashboardHeading: "Plano de control",
    dashboardSubheading: "Opera nodos, jobs, backups y estado deseado desde una sola consola.",
    overviewDescription: "Conteos vivos de la plataforma y las acciones principales del control plane.",
    actionsRunReconciliation: "Ejecutar reconciliación",
    actionsImportInventory: "Importar inventario YAML",
    actionsDownloadYaml: "Descargar YAML del estado deseado",
    actionPlanDescription: "Compara el estado deseado contra la última aplicación exitosa y despacha el trabajo faltante.",
    actionImportDescription: "Refresca el estado deseado en PostgreSQL desde la ruta actual del inventario YAML.",
    actionExportDescription: "Exporta el estado deseado actual para auditoría, revisión o recuperación.",
    overviewTitle: "Resumen operativo",
    managedNodes: "Nodos gestionados",
    pendingJobs: "Jobs pendientes",
    failedJobs: "Jobs fallidos",
    resourcesWithDrift: "Recursos con drift",
    backupPolicies: "Políticas de backup",
    generatedAt: "Generado",
    usersAndScope: "Usuarios y alcance",
    inventoryImport: "Importación de inventario",
    latestReconciliation: "Última reconciliación",
    globalRoles: "Roles globales",
    tenantMemberships: "Membresías por tenant",
    none: "ninguna",
    latestImport: "Última importación",
    never: "nunca",
    latestImportCounts: "Nodos {nodes}, zonas {zones}, apps {apps}, bases de datos {databases}",
    noReconciliationRun: "Todavía no hay una reconciliación registrada.",
    reconciliationVersion: "Versión {version}",
    reconciliationSummary: "Generados {generated}, omitidos {skipped}, secretos faltantes {missing}",
    nodeHealthTitle: "Salud de nodos",
    nodeHealthDescription: "Estado, versión, jobs pendientes y último resultado por nodo.",
    resourceDriftTitle: "Drift de recursos",
    resourceDriftDescription: "Vista actual de reconciliación sobre DNS, proxy y bases de datos.",
    jobHistoryTitle: "Historial de jobs",
    jobHistoryDescription: "Despachos recientes del control plane y estado de ejecución en nodos.",
    backupsTitle: "Backups",
    backupsDescription: "Últimas ejecuciones y cobertura actual de políticas.",
    desiredStateTitle: "Estado deseado",
    desiredStateDescription: "PostgreSQL es la fuente de verdad. Usa tabs para crear y gestionar recursos de plataforma.",
    dataFilterPlaceholder: "Filtrar registros",
    rowsPerPage: "Filas por página",
    showing: "Mostrando",
    of: "de",
    records: "registros",
    nodeColNode: "Nodo",
    nodeColHostname: "Hostname",
    nodeColVersion: "Versión",
    nodeColPending: "Pendientes",
    nodeColLatestStatus: "Último estado",
    nodeColLatestSummary: "Último resumen",
    nodeColLastSeen: "Última señal",
    driftColKind: "Tipo",
    driftColResource: "Recurso",
    driftColNode: "Nodo",
    driftColDrift: "Drift",
    driftColLatestStatus: "Último estado",
    driftColSummary: "Resumen",
    jobColJob: "Job",
    jobColKind: "Tipo",
    jobColNode: "Nodo",
    jobColStatus: "Estado",
    jobColReason: "Motivo",
    jobColSummary: "Resumen",
    jobColCreated: "Creado",
    backupColPolicy: "Política",
    backupColNode: "Nodo",
    backupColStatus: "Estado",
    backupColSummary: "Resumen",
    backupColStarted: "Inicio",
    noNodes: "No hay nodos.",
    noDrift: "No hay registros de drift.",
    noJobs: "No hay jobs.",
    noBackups: "No hay ejecuciones de backup.",
    tabCreate: "Crear",
    tabTenants: "Tenants",
    tabNodes: "Nodos",
    tabZones: "Zonas DNS",
    tabApps: "Apps",
    tabDatabases: "Bases de datos",
    tabBackupPolicies: "Políticas de backup"
  }
};

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
  cookie?: string | string[]
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

function normalizeLocale(value: string | null | undefined): WebLocale {
  return value === "en" ? "en" : "es";
}

function readLocale(request: IncomingMessage): WebLocale {
  const cookieLocale = parseCookies(request).get(localeCookieName);

  if (cookieLocale === "en" || cookieLocale === "es") {
    return cookieLocale;
  }

  const acceptLanguage = request.headers["accept-language"];

  if (typeof acceptLanguage === "string" && !acceptLanguage.toLowerCase().includes("es")) {
    return "en";
  }

  return "es";
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

function serializeLocaleCookie(locale: WebLocale): string {
  return `${localeCookieName}=${encodeURIComponent(locale)}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
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

function formatDate(value: string | undefined, locale: WebLocale): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale === "es" ? "es-DO" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(new Date(value));
}

function formatList(values: string[], emptyValue = "-"): string {
  return values.length > 0 ? values.join(", ") : emptyValue;
}

function getInitials(value: string): string {
  const initials = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "SH";
}

function interpolateCopy(
  template: string,
  values: Record<string, string | number>
): string {
  let next = template;

  for (const [key, value] of Object.entries(values)) {
    next = next.replaceAll(`{${key}}`, String(value));
  }

  return next;
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

function renderStats(
  overview: OperationsOverview,
  copy: WebCopy,
  locale: WebLocale
): string {
  return `<div class="stats">
    <article class="stat"><strong>${overview.nodeCount}</strong><span>${escapeHtml(copy.managedNodes)}</span></article>
    <article class="stat"><strong>${overview.pendingJobCount}</strong><span>${escapeHtml(copy.pendingJobs)}</span></article>
    <article class="stat"><strong>${overview.failedJobCount}</strong><span>${escapeHtml(copy.failedJobs)}</span></article>
    <article class="stat"><strong>${overview.driftedResourceCount}</strong><span>${escapeHtml(copy.resourcesWithDrift)}</span></article>
    <article class="stat"><strong>${overview.backupPolicyCount}</strong><span>${escapeHtml(copy.backupPolicies)}</span></article>
  </div>
  <p class="muted">${escapeHtml(copy.generatedAt)} ${escapeHtml(
    formatDate(overview.generatedAt, locale)
  )}</p>`;
}

function renderLoginPage(locale: WebLocale, notice?: PanelNotice): string {
  const copy = copyByLocale[locale];

  return renderPanelShell({
    lang: locale,
    title: copy.loginTitle,
    heading: copy.loginHeading,
    eyebrow: copy.eyebrow,
    notice,
    body: `<section class="grid login-shell">
      <article class="panel login-card">
        <h2>${escapeHtml(copy.loginAccess)}</h2>
        <form method="post" action="/auth/login" class="stack">
          <label>${escapeHtml(copy.emailLabel)}
            <input type="email" name="email" autocomplete="username" required />
          </label>
          <label>${escapeHtml(copy.passwordLabel)}
            <input type="password" name="password" autocomplete="current-password" required />
          </label>
          <button type="submit">${escapeHtml(copy.signInLabel)}</button>
        </form>
      </article>
    </section>`
  });
}

function renderDesiredStateSection(data: DashboardData, copy: WebCopy): string {
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

  const createPanelHtml = `<div class="grid grid-two">
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
    </div>`;

  const tabs: TabItem[] = [
    {
      id: "desired-state-create",
      label: copy.tabCreate,
      badge: "+",
      panelHtml: createPanelHtml
    },
    {
      id: "desired-state-tenants",
      label: copy.tabTenants,
      badge: String(data.desiredState.spec.tenants.length),
      panelHtml: `<article class="panel"><h3>Tenants</h3>${tenantRows || '<p class="empty">No tenants.</p>'}</article>`
    },
    {
      id: "desired-state-nodes",
      label: copy.tabNodes,
      badge: String(data.desiredState.spec.nodes.length),
      panelHtml: `<article class="panel"><h3>Nodes</h3>${nodeRows || '<p class="empty">No nodes.</p>'}</article>`
    },
    {
      id: "desired-state-zones",
      label: copy.tabZones,
      badge: String(data.desiredState.spec.zones.length),
      panelHtml: `<article class="panel"><h3>Zones</h3>${zoneRows || '<p class="empty">No zones.</p>'}</article>`
    },
    {
      id: "desired-state-apps",
      label: copy.tabApps,
      badge: String(data.desiredState.spec.apps.length),
      panelHtml: `<article class="panel"><h3>Apps</h3>${appRows || '<p class="empty">No apps.</p>'}</article>`
    },
    {
      id: "desired-state-databases",
      label: copy.tabDatabases,
      badge: String(data.desiredState.spec.databases.length),
      panelHtml: `<article class="panel"><h3>Databases</h3>${databaseRows || '<p class="empty">No databases.</p>'}</article>`
    },
    {
      id: "desired-state-backups",
      label: copy.tabBackupPolicies,
      badge: String(data.desiredState.spec.backupPolicies.length),
      panelHtml: `<article class="panel"><h3>Backup policies</h3>${backupRows || '<p class="empty">No backup policies.</p>'}</article>`
    }
  ];

  return `<section id="section-desired-state" class="panel section-panel">
    <div class="section-head">
      <div>
        <h2>${escapeHtml(copy.desiredStateTitle)}</h2>
        <p class="muted section-description">${escapeHtml(copy.desiredStateDescription)}</p>
      </div>
    </div>
    ${renderTabs({
      id: "desired-state-tabs",
      tabs,
      defaultTabId: "desired-state-create"
    })}
  </section>`;
}

function renderDashboard(
  data: DashboardData,
  locale: WebLocale,
  currentPath: string,
  notice?: PanelNotice
): string {
  const copy = copyByLocale[locale];
  const actionBar = `<div class="action-grid">
    <article class="action-card action-card-strong">
      <span class="action-eyebrow">Planner</span>
      <h3>${escapeHtml(copy.actionsRunReconciliation)}</h3>
      <p class="muted">${escapeHtml(copy.actionPlanDescription)}</p>
      <form method="post" action="/actions/reconcile-run">
        <button type="submit">${escapeHtml(copy.actionsRunReconciliation)}</button>
      </form>
    </article>
    <article class="action-card">
      <span class="action-eyebrow">Inventory</span>
      <h3>${escapeHtml(copy.actionsImportInventory)}</h3>
      <p class="muted">${escapeHtml(copy.actionImportDescription)}</p>
      <form method="post" action="/actions/inventory-import" class="stack">
        <input type="text" name="path" value="${escapeHtml(
          data.inventory.latestImport?.sourcePath ?? config.inventory.importPath
        )}" />
        <button class="secondary" type="submit">${escapeHtml(copy.actionsImportInventory)}</button>
      </form>
    </article>
    <article class="action-card action-card-accent">
      <span class="action-eyebrow">Export</span>
      <h3>${escapeHtml(copy.actionsDownloadYaml)}</h3>
      <p class="muted">${escapeHtml(copy.actionExportDescription)}</p>
      <a class="button-link secondary" href="/inventory/export">${escapeHtml(
        copy.actionsDownloadYaml
      )}</a>
    </article>
  </div>`;

  const nodeHealthRows: DataTableRow[] = data.nodeHealth.map((node) => ({
    cells: [
      `<span class="mono">${escapeHtml(node.nodeId)}</span>`,
      escapeHtml(node.hostname),
      node.currentVersion ? renderPill(node.currentVersion, "muted") : "-",
      renderPill(String(node.pendingJobCount), node.pendingJobCount > 0 ? "danger" : "success"),
      node.latestJobStatus
        ? renderPill(
            node.latestJobStatus,
            node.latestJobStatus === "failed"
              ? "danger"
              : node.latestJobStatus === "applied"
                ? "success"
                : "muted"
          )
        : "-",
      escapeHtml(node.latestJobSummary ?? "-"),
      escapeHtml(formatDate(node.lastSeenAt, locale))
    ],
    searchText: [
      node.nodeId,
      node.hostname,
      node.currentVersion ?? "",
      node.latestJobStatus ?? "",
      node.latestJobSummary ?? ""
    ].join(" ")
  }));

  const driftRows: DataTableRow[] = data.drift.map((entry) => ({
    cells: [
      escapeHtml(entry.resourceKind),
      `<span class="mono">${escapeHtml(entry.resourceKey)}</span>`,
      `<span class="mono">${escapeHtml(entry.nodeId)}</span>`,
      renderPill(
        entry.driftStatus,
        entry.driftStatus === "in_sync"
          ? "success"
          : entry.driftStatus === "pending"
            ? "muted"
            : "danger"
      ),
      entry.latestJobStatus
        ? renderPill(
            entry.latestJobStatus,
            entry.latestJobStatus === "applied" ? "success" : "danger"
          )
        : "-",
      escapeHtml(entry.latestSummary ?? "-")
    ],
    searchText: [
      entry.resourceKind,
      entry.resourceKey,
      entry.nodeId,
      entry.driftStatus,
      entry.latestSummary ?? ""
    ].join(" ")
  }));

  const jobRows: DataTableRow[] = data.jobHistory.map((job) => ({
    cells: [
      `<span class="mono">${escapeHtml(job.jobId)}</span>`,
      escapeHtml(job.kind),
      `<span class="mono">${escapeHtml(job.nodeId)}</span>`,
      job.status
        ? renderPill(
            job.status,
            job.status === "applied"
              ? "success"
              : job.status === "failed"
                ? "danger"
                : "muted"
          )
        : renderPill("queued", "muted"),
      escapeHtml(job.dispatchReason ?? "-"),
      escapeHtml(job.summary ?? "-"),
      escapeHtml(formatDate(job.createdAt, locale))
    ],
    searchText: [
      job.jobId,
      job.kind,
      job.nodeId,
      job.status ?? "queued",
      job.dispatchReason ?? "",
      job.summary ?? ""
    ].join(" ")
  }));

  const backupRows: DataTableRow[] = data.backups.latestRuns.map((run) => ({
    cells: [
      `<span class="mono">${escapeHtml(run.policySlug)}</span>`,
      `<span class="mono">${escapeHtml(run.nodeId)}</span>`,
      renderPill(
        run.status,
        run.status === "succeeded"
          ? "success"
          : run.status === "failed"
            ? "danger"
            : "muted"
      ),
      escapeHtml(run.summary),
      escapeHtml(formatDate(run.startedAt, locale))
    ],
    searchText: [run.policySlug, run.nodeId, run.status, run.summary].join(" ")
  }));

  const tenantMemberships =
    data.currentUser.tenantMemberships.length > 0
      ? data.currentUser.tenantMemberships
          .map((membership) => `${membership.tenantSlug}:${membership.role}`)
          .join(", ")
      : copy.none;

  const latestImportSummary = data.inventory.latestImport
    ? `${formatDate(data.inventory.latestImport.importedAt, locale)} · ${data.inventory.latestImport.sourcePath}`
    : copy.never;

  const latestReconciliationSummary = data.overview.latestReconciliation
    ? `<p class="muted">${escapeHtml(
        interpolateCopy(copy.reconciliationVersion, {
          version: data.overview.latestReconciliation.desiredStateVersion
        })
      )}</p>
       <p class="muted">${escapeHtml(
         interpolateCopy(copy.reconciliationSummary, {
           generated: data.overview.latestReconciliation.generatedJobCount,
           skipped: data.overview.latestReconciliation.skippedJobCount,
           missing: data.overview.latestReconciliation.missingCredentialCount
         })
       )}</p>`
    : `<p class="muted">${escapeHtml(copy.noReconciliationRun)}</p>`;

  const contextSection = `<section id="section-context" class="panel section-panel">
    <div class="section-head">
      <div>
        <h2>${escapeHtml(copy.navContext)}</h2>
      </div>
    </div>
    <div class="grid grid-three">
      <article class="panel">
        <h3>${escapeHtml(copy.usersAndScope)}</h3>
        <p><strong>${escapeHtml(data.currentUser.displayName)}</strong> &lt;${escapeHtml(
          data.currentUser.email
        )}&gt;</p>
        <p class="muted">${escapeHtml(copy.globalRoles)}: ${escapeHtml(
          formatList(data.currentUser.globalRoles, copy.none)
        )}</p>
        <p class="muted">${escapeHtml(copy.tenantMemberships)}: ${escapeHtml(tenantMemberships)}</p>
      </article>
      <article class="panel">
        <h3>${escapeHtml(copy.inventoryImport)}</h3>
        <p class="muted">${escapeHtml(copy.latestImport)}: ${escapeHtml(latestImportSummary)}</p>
        <p class="muted">${escapeHtml(
          interpolateCopy(copy.latestImportCounts, {
            nodes: data.inventory.nodes.length,
            zones: data.inventory.zones.length,
            apps: data.inventory.apps.length,
            databases: data.inventory.databases.length
          })
        )}</p>
      </article>
      <article class="panel">
        <h3>${escapeHtml(copy.latestReconciliation)}</h3>
        ${latestReconciliationSummary}
      </article>
    </div>
  </section>`;

  const topbarHtml = `<div class="profile-card">
    <span class="profile-avatar">${escapeHtml(getInitials(data.currentUser.displayName))}</span>
    <div class="profile-copy">
      <span class="profile-kicker">${escapeHtml(copy.eyebrow)}</span>
      <strong class="profile-name">${escapeHtml(data.currentUser.displayName)}</strong>
      <span class="profile-meta">${escapeHtml(data.currentUser.email)}</span>
    </div>
  </div>
  <div class="topbar-actions">
    <form method="post" action="/preferences/locale" class="inline-form">
      <input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}" />
      <label>
        <span>${escapeHtml(copy.languageLabel)}</span>
        <select
          name="locale"
          onchange="const returnTo=this.form.querySelector('[name=returnTo]'); if (returnTo instanceof HTMLInputElement) { returnTo.value = window.location.pathname + window.location.search + window.location.hash; } this.form.submit();"
        >
          <option value="es"${locale === "es" ? " selected" : ""}>ES</option>
          <option value="en"${locale === "en" ? " selected" : ""}>EN</option>
        </select>
      </label>
    </form>
    <form method="post" action="/auth/logout" class="inline-form">
      <button class="danger" type="submit">${escapeHtml(copy.signOutLabel)}</button>
    </form>
  </div>`;

  const sidebarGroups: AdminNavGroup[] = [
    {
      id: "control-plane",
      label: copy.navControlPlane,
      items: [
        {
          id: "overview",
          label: copy.navOverview,
          href: "#section-overview",
          keywords: [copy.overviewTitle, copy.managedNodes, copy.pendingJobs]
        },
        {
          id: "context",
          label: copy.navContext,
          href: "#section-context",
          keywords: [copy.usersAndScope, copy.inventoryImport, copy.latestReconciliation]
        }
      ]
    },
    {
      id: "operations",
      label: copy.navOperations,
      items: [
        {
          id: "node-health",
          label: copy.navNodeHealth,
          href: "#section-node-health",
          badge: String(data.nodeHealth.length)
        },
        {
          id: "resource-drift",
          label: copy.navDrift,
          href: "#section-resource-drift",
          badge: String(data.overview.driftedResourceCount)
        },
        {
          id: "job-history",
          label: copy.navJobs,
          href: "#section-job-history",
          badge: String(data.jobHistory.length)
        },
        {
          id: "backups",
          label: copy.navBackups,
          href: "#section-backups",
          badge: String(data.backups.latestRuns.length)
        }
      ]
    },
    {
      id: "desired-state",
      label: copy.navResources,
      items: [
        { id: "create", label: copy.navCreate, href: "#desired-state-create" },
        {
          id: "tenants",
          label: copy.navTenants,
          href: "#desired-state-tenants",
          badge: String(data.desiredState.spec.tenants.length)
        },
        {
          id: "nodes",
          label: copy.navNodes,
          href: "#desired-state-nodes",
          badge: String(data.desiredState.spec.nodes.length)
        },
        {
          id: "zones",
          label: copy.navZones,
          href: "#desired-state-zones",
          badge: String(data.desiredState.spec.zones.length)
        },
        {
          id: "apps",
          label: copy.navApps,
          href: "#desired-state-apps",
          badge: String(data.desiredState.spec.apps.length)
        },
        {
          id: "databases",
          label: copy.navDatabases,
          href: "#desired-state-databases",
          badge: String(data.desiredState.spec.databases.length)
        },
        {
          id: "backup-policies",
          label: copy.navBackupPolicies,
          href: "#desired-state-backups",
          badge: String(data.desiredState.spec.backupPolicies.length)
        }
      ]
    }
  ];

  return renderAdminShell({
    lang: locale,
    title: copy.appName,
    appName: copy.appName,
    heading: copy.dashboardHeading,
    eyebrow: copy.eyebrow,
    subheading: copy.dashboardSubheading,
    notice,
    topbarHtml,
    versionLabel: copy.versionLabel,
    versionValue: config.version,
    sidebarSearchPlaceholder: copy.sidebarSearchPlaceholder,
    sidebarGroups,
    body: [
      `<section id="section-overview" class="panel section-panel">
        <div class="section-head">
          <div>
            <h2>${escapeHtml(copy.overviewTitle)}</h2>
            <p class="muted section-description">${escapeHtml(copy.overviewDescription)}</p>
          </div>
        </div>
        ${renderStats(data.overview, copy, locale)}
        ${actionBar}
      </section>`,
      contextSection,
      renderDataTable({
        id: "section-node-health",
        heading: copy.nodeHealthTitle,
        description: copy.nodeHealthDescription,
        columns: [
          { label: copy.nodeColNode, className: "mono" },
          { label: copy.nodeColHostname },
          { label: copy.nodeColVersion },
          { label: copy.nodeColPending },
          { label: copy.nodeColLatestStatus },
          { label: copy.nodeColLatestSummary },
          { label: copy.nodeColLastSeen }
        ],
        rows: nodeHealthRows,
        emptyMessage: copy.noNodes,
        filterPlaceholder: copy.dataFilterPlaceholder,
        rowsPerPageLabel: copy.rowsPerPage,
        showingLabel: copy.showing,
        ofLabel: copy.of,
        recordsLabel: copy.records,
        defaultPageSize: 10
      }),
      renderDataTable({
        id: "section-resource-drift",
        heading: copy.resourceDriftTitle,
        description: copy.resourceDriftDescription,
        columns: [
          { label: copy.driftColKind },
          { label: copy.driftColResource, className: "mono" },
          { label: copy.driftColNode, className: "mono" },
          { label: copy.driftColDrift },
          { label: copy.driftColLatestStatus },
          { label: copy.driftColSummary }
        ],
        rows: driftRows,
        emptyMessage: copy.noDrift,
        filterPlaceholder: copy.dataFilterPlaceholder,
        rowsPerPageLabel: copy.rowsPerPage,
        showingLabel: copy.showing,
        ofLabel: copy.of,
        recordsLabel: copy.records,
        defaultPageSize: 10
      }),
      renderDataTable({
        id: "section-job-history",
        heading: copy.jobHistoryTitle,
        description: copy.jobHistoryDescription,
        columns: [
          { label: copy.jobColJob, className: "mono" },
          { label: copy.jobColKind },
          { label: copy.jobColNode, className: "mono" },
          { label: copy.jobColStatus },
          { label: copy.jobColReason },
          { label: copy.jobColSummary },
          { label: copy.jobColCreated }
        ],
        rows: jobRows,
        emptyMessage: copy.noJobs,
        filterPlaceholder: copy.dataFilterPlaceholder,
        rowsPerPageLabel: copy.rowsPerPage,
        showingLabel: copy.showing,
        ofLabel: copy.of,
        recordsLabel: copy.records,
        defaultPageSize: 10
      }),
      renderDataTable({
        id: "section-backups",
        heading: copy.backupsTitle,
        description: copy.backupsDescription,
        columns: [
          { label: copy.backupColPolicy, className: "mono" },
          { label: copy.backupColNode, className: "mono" },
          { label: copy.backupColStatus },
          { label: copy.backupColSummary },
          { label: copy.backupColStarted }
        ],
        rows: backupRows,
        emptyMessage: copy.noBackups,
        filterPlaceholder: copy.dataFilterPlaceholder,
        rowsPerPageLabel: copy.rowsPerPage,
        showingLabel: copy.showing,
        ofLabel: copy.of,
        recordsLabel: copy.records,
        defaultPageSize: 10
      }),
      renderDesiredStateSection(data, copy)
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
  const locale = readLocale(request);

  if (!token) {
    writeHtml(response, 200, renderLoginPage(locale, getNoticeFromUrl(url)));
    return;
  }

  try {
    const data = await loadDashboardData(token);
    writeHtml(
      response,
      200,
      renderDashboard(data, locale, sanitizeReturnTo(`${url.pathname}${url.search}`), getNoticeFromUrl(url))
    );
  } catch (error) {
    if (error instanceof WebApiError && error.statusCode === 401) {
      redirect(response, "/login", clearSessionCookie());
      return;
    }

    writeHtml(
      response,
      500,
      renderLoginPage(locale, {
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
  const locale = readLocale(request);

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

  if (request.method === "POST" && url.pathname === "/preferences/locale") {
    const form = await readFormBody(request);
    redirect(
      response,
      sanitizeReturnTo(form.get("returnTo")),
      serializeLocaleCookie(normalizeLocale(form.get("locale")))
    );
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
        "/",
        serializeSessionCookie(login.sessionToken, login.expiresAt)
      );
    } catch (error) {
      writeHtml(
        response,
        error instanceof WebApiError ? error.statusCode : 500,
        renderLoginPage(locale, {
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
      const locale = readLocale(request);

      if (error instanceof WebApiError && error.statusCode === 401) {
        redirect(response, "/login?notice=Session%20required&kind=error", clearSessionCookie());
        return;
      }

      writeHtml(
        response,
        error instanceof WebApiError ? error.statusCode : 500,
        renderLoginPage(locale, {
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
