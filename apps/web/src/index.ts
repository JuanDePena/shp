import { realpathSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";

import { createPanelRuntimeConfig } from "@simplehost/panel-config";
import {
  type AppReconcileRequest,
  type AuditEventSummary,
  type AuthLoginRequest,
  type AuthLoginResponse,
  type AuthenticatedUserSummary,
  type BackupsOverview,
  type BackupRunSummary,
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
type DashboardView =
  | "overview"
  | "node-health"
  | "resource-drift"
  | "job-history"
  | "backups"
  | "desired-state";

const desiredStateTabIds = [
  "desired-state-create",
  "desired-state-tenants",
  "desired-state-nodes",
  "desired-state-zones",
  "desired-state-apps",
  "desired-state-databases",
  "desired-state-backups"
] as const;

type DesiredStateTabId = (typeof desiredStateTabIds)[number];

interface DashboardData {
  currentUser: AuthenticatedUserSummary;
  overview: OperationsOverview;
  inventory: InventoryStateSnapshot;
  desiredState: DesiredStateExportResponse;
  drift: ResourceDriftSummary[];
  nodeHealth: NodeHealthSnapshot[];
  jobHistory: JobHistoryEntry[];
  auditEvents: AuditEventSummary[];
  backups: BackupsOverview;
}

interface SelectOption {
  value: string;
  label: string;
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
  actionDispatchDnsSync: string;
  actionFullReconcile: string;
  actionDispatchProxyRender: string;
  actionDispatchDatabaseReconcile: string;
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
  auditTrailTitle: string;
  auditTrailDescription: string;
  payloadTitle: string;
  previewTitle: string;
  impactPreviewTitle: string;
  queuedWorkTitle: string;
  queuedWorkDescription: string;
  dangerZoneTitle: string;
  linkedOperationsTitle: string;
  operationalSignalsTitle: string;
  failureFocusTitle: string;
  failureFocusDescription: string;
  auditSignalsTitle: string;
  auditSignalsDescription: string;
  auditActorsTitle: string;
  auditActorsDescription: string;
  desiredAppliedTitle: string;
  desiredAppliedDescription: string;
  plannedChangesTitle: string;
  plannedChangesDescription: string;
  effectiveStateTitle: string;
  effectiveStateDescription: string;
  comparisonFieldLabel: string;
  comparisonDesiredLabel: string;
  comparisonAppliedLabel: string;
  comparisonStatusLabel: string;
  comparisonMatchLabel: string;
  comparisonChangedLabel: string;
  comparisonUnknownLabel: string;
  jobStatusesTitle: string;
  jobStatusesDescription: string;
  jobResourceHotspotsTitle: string;
  jobResourceHotspotsDescription: string;
  auditEntitiesTitle: string;
  auditEntitiesDescription: string;
  backupCoverageTitle: string;
  backupCoverageDescription: string;
  backupCoverageByTenantTitle: string;
  backupCoverageByTenantDescription: string;
  backupPolicySignalsTitle: string;
  backupPolicySignalsDescription: string;
  backupTargetPostureTitle: string;
  backupTargetPostureDescription: string;
  backupRunSignalsTitle: string;
  backupRunSignalsDescription: string;
  jobNodesTitle: string;
  jobNodesDescription: string;
  jobKindsTitle: string;
  jobKindsDescription: string;
  driftNodesTitle: string;
  driftNodesDescription: string;
  driftKindsTitle: string;
  driftKindsDescription: string;
  relatedJobsTitle: string;
  relatedDriftTitle: string;
  relatedResourcesTitle: string;
  relatedResourcesDescription: string;
  latestCompleted: string;
  latestFailureLabel: string;
  latestSuccessLabel: string;
  desiredHash: string;
  latestHash: string;
  dispatchRecommended: string;
  linkedResource: string;
  affectedResourcesLabel: string;
  targetedNodesLabel: string;
  openDesiredState: string;
  storageLocationLabel: string;
  resourceSelectorsLabel: string;
  healthyNodes: string;
  staleNodes: string;
  nodesWithPendingJobs: string;
  nodesWithFailures: string;
  driftPending: string;
  driftOutOfSync: string;
  driftMissingSecrets: string;
  recentQueuedJobs: string;
  recentAppliedJobs: string;
  recentFailedJobs: string;
  succeededBackups: string;
  failedBackups: string;
  runningBackups: string;
  policyCoverage: string;
  transitionalBootstrapNote: string;
  dailyOperationsSourceNote: string;
  openJobHistory: string;
  openDriftView: string;
  openBackupsView: string;
  openNodeHealth: string;
  nodeDiagnosticsTitle: string;
  nodeDiagnosticsDescription: string;
  driftDiagnosticsTitle: string;
  driftDiagnosticsDescription: string;
  bootstrapInventoryTitle: string;
  bootstrapInventoryDescription: string;
  globalRoles: string;
  tenantMemberships: string;
  yesLabel: string;
  noLabel: string;
  none: string;
  latestImport: string;
  never: string;
  noRelatedRecords: string;
  latestImportCounts: string;
  noReconciliationRun: string;
  reconciliationVersion: string;
  reconciliationSummary: string;
  backupRunTitle: string;
  backupRunDescription: string;
  backupPolicyContextTitle: string;
  backupPolicyContextDescription: string;
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
  desiredStateInventoryTitle: string;
  desiredStateInventoryDescription: string;
  desiredStateEditorsTitle: string;
  desiredStateEditorsDescription: string;
  selectedResourceTitle: string;
  selectedResourceDescription: string;
  selectedStateLabel: string;
  detailActionsTitle: string;
  recordPreviewTitle: string;
  appRuntimeTitle: string;
  databaseAccessTitle: string;
  dataFilterPlaceholder: string;
  rowsPerPage: string;
  showing: string;
  of: string;
  records: string;
  tenantColSlug: string;
  tenantColDisplayName: string;
  nodeColNode: string;
  nodeColHostname: string;
  nodeSpecColPublicIpv4: string;
  nodeSpecColWireguard: string;
  nodeColVersion: string;
  nodeColPending: string;
  nodeColLatestStatus: string;
  nodeColLatestSummary: string;
  nodeColLastSeen: string;
  zoneColZone: string;
  zoneColTenant: string;
  zoneColPrimaryNode: string;
  zoneColRecordCount: string;
  appColSlug: string;
  appColTenant: string;
  appColDomain: string;
  appColMode: string;
  appColNodes: string;
  recordColName: string;
  recordColType: string;
  recordColValue: string;
  recordColTtl: string;
  aliasesLabel: string;
  backendPortLabel: string;
  runtimeImageLabel: string;
  storageRootLabel: string;
  databaseColApp: string;
  databaseColEngine: string;
  databaseColDatabase: string;
  databaseColUser: string;
  databaseColNodes: string;
  databaseColMigration: string;
  backupPolicyColSlug: string;
  backupPolicyColTenant: string;
  backupPolicyColTargetNode: string;
  backupPolicyColSchedule: string;
  backupPolicyColRetention: string;
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
  noTenants: string;
  noNodes: string;
  noZones: string;
  noApps: string;
  noDatabases: string;
  noBackupPolicies: string;
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
    actionsImportInventory: "Bootstrap YAML import",
    actionsDownloadYaml: "Download desired-state YAML",
    actionDispatchDnsSync: "Dispatch dns.sync",
    actionFullReconcile: "Full reconcile",
    actionDispatchProxyRender: "Dispatch proxy.render",
    actionDispatchDatabaseReconcile: "Dispatch database reconcile",
    actionPlanDescription: "Compare desired state against the last successful apply and dispatch missing work.",
  actionImportDescription: "Use the transitional YAML import path to seed or recover PostgreSQL desired state.",
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
    auditTrailTitle: "Recent audit",
    auditTrailDescription: "Recent control-plane mutations and runtime events.",
    payloadTitle: "Payload and result",
    previewTitle: "Dispatch preview",
    impactPreviewTitle: "Impact preview",
    queuedWorkTitle: "Queued work preview",
    queuedWorkDescription: "Expected jobs and target nodes for the selected action.",
    dangerZoneTitle: "Danger zone",
    linkedOperationsTitle: "Linked operations",
    operationalSignalsTitle: "Operational signals",
    failureFocusTitle: "Failure focus",
    failureFocusDescription: "Most recent failed operations in the current workspace.",
    auditSignalsTitle: "Audit signals",
    auditSignalsDescription: "Most active event types in the current slice.",
    auditActorsTitle: "Audit actors",
    auditActorsDescription: "Recent actors and touched entities in the current slice.",
    desiredAppliedTitle: "Desired vs last applied",
    desiredAppliedDescription:
      "Compare the current desired definition with the latest successful job payload.",
    plannedChangesTitle: "Planned changes",
    plannedChangesDescription:
      "Preview what the selected action is expected to touch before dispatching or deleting.",
    effectiveStateTitle: "Effective state",
    effectiveStateDescription:
      "Current operational posture, most recent outcomes and related control-plane scope.",
    comparisonFieldLabel: "Field",
    comparisonDesiredLabel: "Desired",
    comparisonAppliedLabel: "Last applied",
    comparisonStatusLabel: "Status",
    comparisonMatchLabel: "match",
    comparisonChangedLabel: "changed",
    comparisonUnknownLabel: "unknown",
    jobStatusesTitle: "Job status mix",
    jobStatusesDescription: "Current distribution of queued, applied and failed work.",
    jobResourceHotspotsTitle: "Resource hotspots",
    jobResourceHotspotsDescription: "Resources accumulating the most recent job activity.",
    auditEntitiesTitle: "Audit entities",
    auditEntitiesDescription: "Entities touched most often in the current audit slice.",
    backupCoverageTitle: "Coverage summary",
    backupCoverageDescription: "Policy reach, last known outcomes and tenant scope for backups.",
    backupCoverageByTenantTitle: "Coverage by tenant",
    backupCoverageByTenantDescription:
      "Tenants currently protected by policy scope and their covered resource counts.",
    backupPolicySignalsTitle: "Policy signals",
    backupPolicySignalsDescription: "Policies with the busiest recent run history.",
    backupTargetPostureTitle: "Backup target posture",
    backupTargetPostureDescription:
      "Current target-node health, selected policy spread and latest known outcomes.",
    backupRunSignalsTitle: "Backup run signals",
    backupRunSignalsDescription: "Recent backup mix by node and outcome.",
    jobNodesTitle: "Job activity by node",
    jobNodesDescription: "Recent dispatch concentration and latest status by node.",
    jobKindsTitle: "Job kind mix",
    jobKindsDescription: "Recent workload mix and most active job kinds.",
    driftNodesTitle: "Drift by node",
    driftNodesDescription: "Nodes accumulating the most unresolved drift.",
    driftKindsTitle: "Drift by kind",
    driftKindsDescription: "Which resource families are currently drifting the most.",
    relatedJobsTitle: "Related jobs",
    relatedDriftTitle: "Related drift",
    relatedResourcesTitle: "Related resources",
    relatedResourcesDescription: "Jump to the records, nodes and policies linked to the selected workspace item.",
    latestCompleted: "Completed",
    latestFailureLabel: "Latest failure",
    latestSuccessLabel: "Latest success",
    desiredHash: "Desired hash",
    latestHash: "Applied hash",
    dispatchRecommended: "Dispatch recommended",
    linkedResource: "Linked resource",
    affectedResourcesLabel: "Affected resources",
    targetedNodesLabel: "Targeted nodes",
    openDesiredState: "Open desired-state record",
    storageLocationLabel: "Storage location",
    resourceSelectorsLabel: "Resource selectors",
    healthyNodes: "Healthy nodes",
    staleNodes: "Stale nodes",
    nodesWithPendingJobs: "Nodes with pending jobs",
    nodesWithFailures: "Nodes with failures",
    driftPending: "Pending drift",
    driftOutOfSync: "Out-of-sync drift",
    driftMissingSecrets: "Missing secrets",
    recentQueuedJobs: "Queued jobs",
    recentAppliedJobs: "Applied jobs",
    recentFailedJobs: "Failed jobs",
    succeededBackups: "Succeeded backups",
    failedBackups: "Failed backups",
    runningBackups: "Running backups",
    policyCoverage: "Policy coverage",
    transitionalBootstrapNote: "Transitional only. Keep operational edits in PostgreSQL desired state.",
    dailyOperationsSourceNote:
      "Use these product forms for day-to-day changes. YAML remains a bootstrap and disaster-recovery path only.",
    openJobHistory: "Open job history",
    openDriftView: "Open drift view",
    openBackupsView: "Open backups view",
    openNodeHealth: "Open node health",
    nodeDiagnosticsTitle: "Node diagnostics",
    nodeDiagnosticsDescription: "Inspect drift, recent jobs and routing scope for the selected node.",
    driftDiagnosticsTitle: "Drift diagnostics",
    driftDiagnosticsDescription:
      "Inspect the selected drift record, linked desired state and dispatch guidance.",
    bootstrapInventoryTitle: "Bootstrap inventory",
    bootstrapInventoryDescription: "Use YAML import only as a transitional bootstrap or disaster-recovery source. PostgreSQL desired state remains authoritative.",
    globalRoles: "Global roles",
    tenantMemberships: "Tenant memberships",
    yesLabel: "yes",
    noLabel: "no",
    none: "none",
    latestImport: "Latest import",
    never: "never",
    noRelatedRecords: "No related records.",
    latestImportCounts: "Nodes {nodes}, zones {zones}, apps {apps}, databases {databases}",
    noReconciliationRun: "No reconciliation run recorded yet.",
    reconciliationVersion: "Version {version}",
    reconciliationSummary: "Generated {generated}, skipped {skipped}, missing secrets {missing}",
    backupRunTitle: "Latest backup run",
    backupRunDescription:
      "Inspect the last known run and policy context for the selected backup policy.",
    backupPolicyContextTitle: "Policy context",
    backupPolicyContextDescription:
      "Desired-state policy metadata and linked operational scope.",
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
    desiredStateInventoryTitle: "Current inventory",
    desiredStateInventoryDescription: "Read the current desired-state catalog before editing individual records.",
    desiredStateEditorsTitle: "Configuration editors",
    desiredStateEditorsDescription: "Apply changes through the product forms below. Each save writes back to PostgreSQL desired state.",
    selectedResourceTitle: "Selected resource",
    selectedResourceDescription: "Use the inventory table to change focus and run actions against a single resource.",
    selectedStateLabel: "Selected",
    detailActionsTitle: "Context actions",
    recordPreviewTitle: "Record preview",
    appRuntimeTitle: "Runtime and routing",
    databaseAccessTitle: "Topology and access",
    dataFilterPlaceholder: "Filter records",
    rowsPerPage: "Rows per page",
    showing: "Showing",
    of: "of",
    records: "records",
    tenantColSlug: "Slug",
    tenantColDisplayName: "Display name",
    nodeColNode: "Node",
    nodeColHostname: "Hostname",
    nodeSpecColPublicIpv4: "Public IPv4",
    nodeSpecColWireguard: "WireGuard",
    nodeColVersion: "Version",
    nodeColPending: "Pending",
    nodeColLatestStatus: "Latest status",
    nodeColLatestSummary: "Latest summary",
    nodeColLastSeen: "Last seen",
    zoneColZone: "Zone",
    zoneColTenant: "Tenant",
    zoneColPrimaryNode: "Primary node",
    zoneColRecordCount: "Records",
    appColSlug: "App",
    appColTenant: "Tenant",
    appColDomain: "Domain",
    appColMode: "Mode",
    appColNodes: "Nodes",
    recordColName: "Name",
    recordColType: "Type",
    recordColValue: "Value",
    recordColTtl: "TTL",
    aliasesLabel: "Aliases",
    backendPortLabel: "Backend port",
    runtimeImageLabel: "Runtime image",
    storageRootLabel: "Storage root",
    databaseColApp: "App",
    databaseColEngine: "Engine",
    databaseColDatabase: "Database",
    databaseColUser: "User",
    databaseColNodes: "Nodes",
    databaseColMigration: "Migration",
    backupPolicyColSlug: "Policy",
    backupPolicyColTenant: "Tenant",
    backupPolicyColTargetNode: "Target node",
    backupPolicyColSchedule: "Schedule",
    backupPolicyColRetention: "Retention",
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
    noTenants: "No tenants.",
    noNodes: "No nodes.",
    noZones: "No zones.",
    noApps: "No apps.",
    noDatabases: "No databases.",
    noBackupPolicies: "No backup policies.",
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
    actionsImportInventory: "Importar YAML bootstrap",
    actionsDownloadYaml: "Descargar YAML del estado deseado",
    actionDispatchDnsSync: "Despachar dns.sync",
    actionFullReconcile: "Reconciliación completa",
    actionDispatchProxyRender: "Despachar proxy.render",
    actionDispatchDatabaseReconcile: "Despachar reconcile de base de datos",
    actionPlanDescription: "Compara el estado deseado contra la última aplicación exitosa y despacha el trabajo faltante.",
    actionImportDescription: "Usa la ruta YAML transicional para sembrar o recuperar el estado deseado en PostgreSQL.",
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
    auditTrailTitle: "Auditoría reciente",
    auditTrailDescription: "Mutaciones recientes del control plane y eventos de runtime.",
    payloadTitle: "Payload y resultado",
    previewTitle: "Vista previa del despacho",
    impactPreviewTitle: "Vista previa de impacto",
    queuedWorkTitle: "Vista previa del trabajo en cola",
    queuedWorkDescription: "Jobs esperados y nodos objetivo para la acción seleccionada.",
    dangerZoneTitle: "Zona sensible",
    linkedOperationsTitle: "Operaciones vinculadas",
    operationalSignalsTitle: "Señales operativas",
    failureFocusTitle: "Foco de fallos",
    failureFocusDescription: "Operaciones fallidas más recientes dentro del workspace actual.",
    auditSignalsTitle: "Señales de auditoría",
    auditSignalsDescription: "Tipos de evento más activos dentro del corte actual.",
    auditActorsTitle: "Actores de auditoría",
    auditActorsDescription: "Actores recientes y entidades tocadas dentro del corte actual.",
    desiredAppliedTitle: "Deseado vs último aplicado",
    desiredAppliedDescription:
      "Compara la definición deseada actual con el payload del último job exitoso.",
    plannedChangesTitle: "Cambios previstos",
    plannedChangesDescription:
      "Vista previa de lo que la acción seleccionada debería tocar antes de despachar o borrar.",
    effectiveStateTitle: "Estado efectivo",
    effectiveStateDescription:
      "Postura operativa actual, últimos resultados y alcance relacionado del control plane.",
    comparisonFieldLabel: "Campo",
    comparisonDesiredLabel: "Deseado",
    comparisonAppliedLabel: "Último aplicado",
    comparisonStatusLabel: "Estado",
    comparisonMatchLabel: "coincide",
    comparisonChangedLabel: "cambió",
    comparisonUnknownLabel: "sin dato",
    jobStatusesTitle: "Mezcla de estados de jobs",
    jobStatusesDescription: "Distribución actual de trabajo en cola, aplicado y fallido.",
    jobResourceHotspotsTitle: "Recursos más activos",
    jobResourceHotspotsDescription: "Recursos que acumulan más actividad reciente de jobs.",
    auditEntitiesTitle: "Entidades de auditoría",
    auditEntitiesDescription: "Entidades tocadas con más frecuencia dentro del corte actual.",
    backupCoverageTitle: "Resumen de cobertura",
    backupCoverageDescription: "Alcance de políticas, últimos resultados conocidos y alcance por tenant para backups.",
    backupCoverageByTenantTitle: "Cobertura por tenant",
    backupCoverageByTenantDescription:
      "Tenants protegidos actualmente por las políticas y sus recursos cubiertos.",
    backupPolicySignalsTitle: "Señales por política",
    backupPolicySignalsDescription: "Políticas con más actividad reciente de ejecuciones.",
    backupTargetPostureTitle: "Postura del destino de backup",
    backupTargetPostureDescription:
      "Salud actual del nodo destino, alcance de la política seleccionada y últimos resultados conocidos.",
    backupRunSignalsTitle: "Señales de ejecuciones de backup",
    backupRunSignalsDescription: "Mezcla reciente de backups por nodo y resultado.",
    jobNodesTitle: "Actividad de jobs por nodo",
    jobNodesDescription: "Concentración reciente de despachos y último estado por nodo.",
    jobKindsTitle: "Mezcla de tipos de job",
    jobKindsDescription: "Carga reciente y tipos de job más activos.",
    driftNodesTitle: "Drift por nodo",
    driftNodesDescription: "Nodos que acumulan más drift sin resolver.",
    driftKindsTitle: "Drift por tipo",
    driftKindsDescription: "Familias de recursos con mayor drift actual.",
    relatedJobsTitle: "Jobs relacionados",
    relatedDriftTitle: "Drift relacionado",
    relatedResourcesTitle: "Recursos relacionados",
    relatedResourcesDescription: "Salta a los registros, nodos y políticas vinculadas al elemento seleccionado.",
    latestCompleted: "Completado",
    latestFailureLabel: "Último fallo",
    latestSuccessLabel: "Último éxito",
    desiredHash: "Hash deseado",
    latestHash: "Hash aplicado",
    dispatchRecommended: "Despacho recomendado",
    linkedResource: "Recurso vinculado",
    affectedResourcesLabel: "Recursos afectados",
    targetedNodesLabel: "Nodos objetivo",
    openDesiredState: "Abrir recurso en estado deseado",
    storageLocationLabel: "Ubicación de almacenamiento",
    resourceSelectorsLabel: "Selectores de recursos",
    healthyNodes: "Nodos saludables",
    staleNodes: "Nodos sin señal reciente",
    nodesWithPendingJobs: "Nodos con jobs pendientes",
    nodesWithFailures: "Nodos con fallos",
    driftPending: "Drift pendiente",
    driftOutOfSync: "Drift fuera de sincronía",
    driftMissingSecrets: "Secretos faltantes",
    recentQueuedJobs: "Jobs en cola",
    recentAppliedJobs: "Jobs aplicados",
    recentFailedJobs: "Jobs fallidos",
    succeededBackups: "Backups exitosos",
    failedBackups: "Backups fallidos",
    runningBackups: "Backups ejecutándose",
    policyCoverage: "Cobertura de políticas",
    transitionalBootstrapNote: "Solo transicional. Mantén las ediciones operativas en PostgreSQL como estado deseado.",
    dailyOperationsSourceNote:
      "Usa estos formularios del producto para los cambios del día a día. El YAML queda solo para bootstrap y disaster recovery.",
    openJobHistory: "Abrir historial de jobs",
    openDriftView: "Abrir vista de drift",
    openBackupsView: "Abrir vista de backups",
    openNodeHealth: "Abrir salud del nodo",
    nodeDiagnosticsTitle: "Diagnóstico del nodo",
    nodeDiagnosticsDescription: "Inspecciona drift, jobs recientes y alcance operativo del nodo seleccionado.",
    driftDiagnosticsTitle: "Diagnóstico de drift",
    driftDiagnosticsDescription:
      "Inspecciona el registro de drift seleccionado, su estado deseado vinculado y la guía de despacho.",
    bootstrapInventoryTitle: "Inventario bootstrap",
    bootstrapInventoryDescription: "Usa la importación YAML solo como mecanismo transicional de bootstrap o disaster recovery. PostgreSQL sigue siendo la fuente autoritativa.",
    globalRoles: "Roles globales",
    tenantMemberships: "Membresías por tenant",
    yesLabel: "sí",
    noLabel: "no",
    none: "ninguna",
    latestImport: "Última importación",
    never: "nunca",
    noRelatedRecords: "No hay registros relacionados.",
    latestImportCounts: "Nodos {nodes}, zonas {zones}, apps {apps}, bases de datos {databases}",
    noReconciliationRun: "Todavía no hay una reconciliación registrada.",
    reconciliationVersion: "Versión {version}",
    reconciliationSummary: "Generados {generated}, omitidos {skipped}, secretos faltantes {missing}",
    backupRunTitle: "Última ejecución de backup",
    backupRunDescription:
      "Inspecciona la última ejecución conocida y el contexto de la política seleccionada.",
    backupPolicyContextTitle: "Contexto de la política",
    backupPolicyContextDescription:
      "Metadatos de la política en estado deseado y alcance operativo vinculado.",
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
    desiredStateInventoryTitle: "Inventario actual",
    desiredStateInventoryDescription: "Revisa el catálogo actual del estado deseado antes de editar registros individuales.",
    desiredStateEditorsTitle: "Editores de configuración",
    desiredStateEditorsDescription: "Aplica cambios mediante los formularios del producto. Cada guardado vuelve a escribir PostgreSQL como estado deseado.",
    selectedResourceTitle: "Recurso seleccionado",
    selectedResourceDescription: "Usa la tabla de inventario para cambiar el foco y ejecutar acciones sobre un recurso puntual.",
    selectedStateLabel: "Seleccionado",
    detailActionsTitle: "Acciones contextuales",
    recordPreviewTitle: "Vista de registros",
    appRuntimeTitle: "Runtime y enrutamiento",
    databaseAccessTitle: "Topología y acceso",
    dataFilterPlaceholder: "Filtrar registros",
    rowsPerPage: "Filas por página",
    showing: "Mostrando",
    of: "de",
    records: "registros",
    tenantColSlug: "Slug",
    tenantColDisplayName: "Nombre visible",
    nodeColNode: "Nodo",
    nodeColHostname: "Hostname",
    nodeSpecColPublicIpv4: "IPv4 pública",
    nodeSpecColWireguard: "WireGuard",
    nodeColVersion: "Versión",
    nodeColPending: "Pendientes",
    nodeColLatestStatus: "Último estado",
    nodeColLatestSummary: "Último resumen",
    nodeColLastSeen: "Última señal",
    zoneColZone: "Zona",
    zoneColTenant: "Tenant",
    zoneColPrimaryNode: "Nodo primario",
    zoneColRecordCount: "Registros",
    appColSlug: "App",
    appColTenant: "Tenant",
    appColDomain: "Dominio",
    appColMode: "Modo",
    appColNodes: "Nodos",
    recordColName: "Nombre",
    recordColType: "Tipo",
    recordColValue: "Valor",
    recordColTtl: "TTL",
    aliasesLabel: "Aliases",
    backendPortLabel: "Puerto backend",
    runtimeImageLabel: "Imagen runtime",
    storageRootLabel: "Raíz de storage",
    databaseColApp: "App",
    databaseColEngine: "Motor",
    databaseColDatabase: "Base",
    databaseColUser: "Usuario",
    databaseColNodes: "Nodos",
    databaseColMigration: "Migración",
    backupPolicyColSlug: "Política",
    backupPolicyColTenant: "Tenant",
    backupPolicyColTargetNode: "Nodo destino",
    backupPolicyColSchedule: "Horario",
    backupPolicyColRetention: "Retención",
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
    noTenants: "No hay tenants.",
    noNodes: "No hay nodos.",
    noZones: "No hay zonas.",
    noApps: "No hay apps.",
    noDatabases: "No hay bases de datos.",
    noBackupPolicies: "No hay políticas de backup.",
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

function normalizeDashboardView(value: string | null | undefined): DashboardView {
  switch (value) {
    case "node-health":
    case "resource-drift":
    case "job-history":
    case "backups":
    case "desired-state":
      return value;
    default:
      return "overview";
  }
}

function normalizeDesiredStateTab(value: string | null | undefined): DesiredStateTabId {
  return desiredStateTabIds.find((candidate) => candidate === value) ?? "desired-state-create";
}

function normalizeDashboardFocus(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function buildDashboardViewUrl(
  view: DashboardView,
  tab?: DesiredStateTabId,
  focus?: string
): string {
  const search = new URLSearchParams();

  if (view !== "overview") {
    search.set("view", view);
  }

  if (view === "desired-state") {
    search.set("tab", tab ?? "desired-state-create");
  }

  if (view !== "overview" && focus) {
    search.set("focus", focus);
  }

  const query = search.toString();
  return query.length > 0 ? `/?${query}` : "/";
}

function getDashboardHeading(copy: WebCopy, view: DashboardView): string {
  switch (view) {
    case "node-health":
      return copy.nodeHealthTitle;
    case "resource-drift":
      return copy.resourceDriftTitle;
    case "job-history":
      return copy.jobHistoryTitle;
    case "backups":
      return copy.backupsTitle;
    case "desired-state":
      return copy.desiredStateTitle;
    case "overview":
    default:
      return copy.dashboardHeading;
  }
}

function getDashboardSubheading(copy: WebCopy, view: DashboardView): string {
  switch (view) {
    case "node-health":
      return copy.nodeHealthDescription;
    case "resource-drift":
      return copy.resourceDriftDescription;
    case "job-history":
      return copy.jobHistoryDescription;
    case "backups":
      return copy.backupsDescription;
    case "desired-state":
      return copy.desiredStateDescription;
    case "overview":
    default:
      return copy.dashboardSubheading;
  }
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

function renderSelectOptions(
  options: SelectOption[],
  selectedValue: string | undefined,
  optionsConfig: {
    allowBlank?: boolean;
    blankLabel?: string;
  } = {}
): string {
  const rendered: string[] = [];
  const seen = new Set<string>();

  if (optionsConfig.allowBlank) {
    const blankValue = selectedValue ?? "";
    rendered.push(
      `<option value=""${blankValue.length === 0 ? " selected" : ""}>${escapeHtml(
        optionsConfig.blankLabel ?? "-"
      )}</option>`
    );
  }

  for (const option of options) {
    if (seen.has(option.value)) {
      continue;
    }

    seen.add(option.value);
    rendered.push(
      `<option value="${escapeHtml(option.value)}"${
        option.value === selectedValue ? " selected" : ""
      }>${escapeHtml(option.label)}</option>`
    );
  }

  if (selectedValue && !seen.has(selectedValue)) {
    rendered.push(
      `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}</option>`
    );
  }

  return rendered.join("");
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const slugPattern = /^[a-z0-9](?:[a-z0-9-_]{0,61}[a-z0-9])?$/;
const hostnamePattern =
  /^(?=.{1,253}$)(?!-)(?:[a-zA-Z0-9-]{1,63}\.)*[a-zA-Z0-9-]{1,63}$/;
const domainPattern =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function assertRequired(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function assertSlug(value: string, label: string): string {
  const normalized = assertRequired(value, label).toLowerCase();

  if (!slugPattern.test(normalized)) {
    throw new Error(
      `${label} must use lowercase letters, numbers, hyphen or underscore.`
    );
  }

  return normalized;
}

function assertHostname(value: string, label: string): string {
  const normalized = assertRequired(value, label).toLowerCase();

  if (!hostnamePattern.test(normalized)) {
    throw new Error(`${label} is not a valid hostname.`);
  }

  return normalized;
}

function assertDomain(value: string, label: string): string {
  const normalized = assertRequired(value, label).toLowerCase();

  if (!domainPattern.test(normalized)) {
    throw new Error(`${label} is not a valid domain name.`);
  }

  return normalized;
}

function assertIpv4(value: string, label: string): string {
  const normalized = assertRequired(value, label);

  if (isIP(normalized) !== 4) {
    throw new Error(`${label} must be a valid IPv4 address.`);
  }

  return normalized;
}

function assertWireguardAddress(value: string, label: string): string {
  const normalized = assertRequired(value, label);
  const [address, prefix] = normalized.split("/", 2);

  if (isIP(address) !== 4) {
    throw new Error(`${label} must use a valid IPv4 address.`);
  }

  if (prefix) {
    const parsedPrefix = Number.parseInt(prefix, 10);
    if (!Number.isInteger(parsedPrefix) || parsedPrefix < 0 || parsedPrefix > 32) {
      throw new Error(`${label} must use a valid CIDR prefix.`);
    }
  }

  return normalized;
}

function assertPositiveInt(
  value: number | undefined,
  label: string,
  options: { min?: number; max?: number } = {}
): number {
  if (value === undefined || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }

  if (options.min !== undefined && value < options.min) {
    throw new Error(`${label} must be at least ${options.min}.`);
  }

  if (options.max !== undefined && value > options.max) {
    throw new Error(`${label} must be at most ${options.max}.`);
  }

  return value;
}

function assertCronish(value: string, label: string): string {
  const normalized = assertRequired(value, label);

  if (normalized.split(/\s+/).length < 5) {
    throw new Error(`${label} must look like a cron expression.`);
  }

  return normalized;
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

function renderCodeBlock(value: unknown): string {
  return `<pre class="code-block">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function payloadContainsValue(payload: unknown, needle: string): boolean {
  if (typeof payload === "string") {
    return payload === needle || payload.includes(needle);
  }

  if (typeof payload === "number" || typeof payload === "boolean" || payload === null) {
    return String(payload) === needle;
  }

  if (Array.isArray(payload)) {
    return payload.some((entry) => payloadContainsValue(entry, needle));
  }

  if (payload && typeof payload === "object") {
    return Object.values(payload).some((entry) => payloadContainsValue(entry, needle));
  }

  return false;
}

function renderFeedList(
  items: Array<{
    title: string;
    meta?: string;
    summary?: string;
    summaryHtml?: string;
    tone?: "default" | "danger" | "success";
  }>,
  emptyMessage = "No related records."
): string {
  if (items.length === 0) {
    return `<p class="empty">${escapeHtml(emptyMessage)}</p>`;
  }

  return `<div class="feed-list">
    ${items
      .map(
        (item) => `<article class="feed-item${
          item.tone === "danger"
            ? " feed-item-danger"
            : item.tone === "success"
              ? " feed-item-success"
              : ""
        }">
          <strong>${item.title}</strong>
          ${item.meta ? `<span class="feed-meta">${item.meta}</span>` : ""}
          ${item.summaryHtml ? item.summaryHtml : item.summary ? `<p>${item.summary}</p>` : ""}
        </article>`
      )
      .join("")}
  </div>`;
}

function renderJobFeedPanel(
  copy: WebCopy,
  locale: WebLocale,
  jobs: JobHistoryEntry[],
  title = copy.relatedJobsTitle
): string {
  return `<article class="panel detail-shell">
    <div class="section-head">
      <div>
        <h3>${escapeHtml(title)}</h3>
      </div>
    </div>
    ${renderFeedList(
      jobs.map((job) => ({
        title: `<a class="detail-link" href="${escapeHtml(
          buildDashboardViewUrl("job-history", undefined, job.jobId)
        )}">${escapeHtml(job.kind)}</a>`,
        meta: escapeHtml(
          [job.jobId, job.status ?? "queued", formatDate(job.createdAt, locale)].join(" · ")
        ),
        summary: escapeHtml(job.summary ?? job.dispatchReason ?? "-"),
        tone:
          job.status === "failed"
            ? "danger"
            : job.status === "applied"
              ? "success"
              : "default"
      })),
      copy.noRelatedRecords
    )}
  </article>`;
}

function renderAuditPanel(
  copy: WebCopy,
  locale: WebLocale,
  events: AuditEventSummary[]
): string {
  return `<article class="panel detail-shell">
    <div class="section-head">
      <div>
        <h3>${escapeHtml(copy.auditTrailTitle)}</h3>
        <p class="muted section-description">${escapeHtml(copy.auditTrailDescription)}</p>
      </div>
    </div>
    ${renderFeedList(
      events.map((event) => ({
        title: escapeHtml(event.eventType),
        meta: escapeHtml(
          [
            event.entityType && event.entityId
              ? `${event.entityType}:${event.entityId}`
              : event.entityType ?? event.entityId ?? "",
            formatDate(event.occurredAt, locale)
          ]
            .filter(Boolean)
            .join(" · ")
        ),
        summaryHtml:
          Object.keys(event.payload).length > 0 ? renderCodeBlock(event.payload) : undefined
      })),
      copy.noRelatedRecords
    )}
  </article>`;
}

function findRelatedJobs(
  jobs: JobHistoryEntry[],
  options: {
    resourceKeys?: string[];
    resourcePrefixes?: string[];
    nodeId?: string;
    needles?: string[];
  },
  limit = 6
): JobHistoryEntry[] {
  const resourceKeys = new Set((options.resourceKeys ?? []).filter(Boolean));
  const resourcePrefixes = (options.resourcePrefixes ?? []).filter(Boolean);
  const needles = (options.needles ?? []).filter(Boolean);

  return jobs
    .filter((job) => {
      if (options.nodeId && job.nodeId === options.nodeId) {
        return true;
      }

      if (job.resourceKey && resourceKeys.has(job.resourceKey)) {
        return true;
      }

      if (
        job.resourceKey &&
        resourcePrefixes.some((prefix) => job.resourceKey?.startsWith(prefix))
      ) {
        return true;
      }

      if (
        needles.some(
          (needle) =>
            payloadContainsValue(job.payload, needle) || payloadContainsValue(job.details, needle)
        )
      ) {
        return true;
      }

      return false;
    })
    .slice(0, limit);
}

function findRelatedAuditEvents(
  events: AuditEventSummary[],
  needles: string[],
  limit = 8
): AuditEventSummary[] {
  const normalizedNeedles = needles.filter(Boolean);

  return events
    .filter(
      (event) =>
        normalizedNeedles.some(
          (needle) =>
            event.entityId === needle ||
            event.actorId === needle ||
            payloadContainsValue(event.payload, needle)
        )
    )
    .slice(0, limit);
}

function parseDriftResourceReference(entry: ResourceDriftSummary): {
  editorHref?: string;
  action?: {
    path: string;
    fields: Record<string, string>;
    label: string;
    confirmMessage: string;
  };
} {
  if (entry.resourceKind === "dns" && entry.resourceKey.startsWith("zone:")) {
    const zoneName = entry.resourceKey.slice("zone:".length);
    return {
      editorHref: buildDashboardViewUrl("desired-state", "desired-state-zones", zoneName),
      action: {
        path: "/actions/zone-sync",
        fields: { zoneName },
        label: "dns.sync",
        confirmMessage: `Dispatch dns.sync for zone ${zoneName}?`
      }
    };
  }

  if (entry.resourceKind === "site" && entry.resourceKey.startsWith("app:")) {
    const [, appSlug] = entry.resourceKey.split(":", 3);
    return {
      editorHref: buildDashboardViewUrl("desired-state", "desired-state-apps", appSlug),
      action: {
        path: "/actions/app-render-proxy",
        fields: { slug: appSlug },
        label: "proxy.render",
        confirmMessage: `Dispatch proxy.render for app ${appSlug}?`
      }
    };
  }

  if (entry.resourceKind === "database" && entry.resourceKey.startsWith("database:")) {
    const appSlug = entry.resourceKey.slice("database:".length);
    return {
      editorHref: buildDashboardViewUrl("desired-state", "desired-state-databases", appSlug),
      action: {
        path: "/actions/database-reconcile",
        fields: { appSlug },
        label: "database reconcile",
        confirmMessage: `Dispatch database reconcile for ${appSlug}?`
      }
    };
  }

  return {};
}

function renderDetailGrid(
  entries: Array<{ label: string; value: string }>
): string {
  return `<dl class="detail-grid">
    ${entries
      .map(
        (entry) => `<div class="detail-item">
          <dt>${escapeHtml(entry.label)}</dt>
          <dd>${entry.value}</dd>
        </div>`
      )
      .join("")}
  </dl>`;
}

function renderSignalStrip(
  entries: Array<{ label: string; value: string; tone?: "default" | "success" | "danger" | "muted" }>
): string {
  return `<div class="stats stats-compact">
    ${entries
      .map(
        (entry) => `<article class="stat stat-compact">
          <strong>${entry.tone ? renderPill(entry.value, entry.tone) : escapeHtml(entry.value)}</strong>
          <span>${escapeHtml(entry.label)}</span>
        </article>`
      )
      .join("")}
  </div>`;
}

function renderActionFacts(
  rows: Array<{ label: string; value: string }>,
  options: { className?: string } = {}
): string {
  const className = options.className ? ` ${escapeHtml(options.className)}` : "";

  return `<dl class="action-card-facts${className}">
      ${rows
        .map(
          (row) => `<div class="action-card-facts-row">
            <dt>${escapeHtml(row.label)}</dt>
            <dd>${row.value}</dd>
          </div>`
        )
        .join("")}
    </dl>`;
}

type ComparisonState = "match" | "changed" | "unknown";

interface ComparisonRow {
  field: string;
  desiredValue: string;
  appliedValue: string;
  state: ComparisonState;
}

function renderComparisonStatePill(copy: WebCopy, state: ComparisonState): string {
  switch (state) {
    case "match":
      return renderPill(copy.comparisonMatchLabel, "success");
    case "changed":
      return renderPill(copy.comparisonChangedLabel, "danger");
    case "unknown":
    default:
      return renderPill(copy.comparisonUnknownLabel, "muted");
  }
}

function createComparisonRow(
  label: string,
  desiredValue: string,
  appliedValue?: string | null
): ComparisonRow {
  const normalizedDesired = desiredValue.trim();
  const normalizedApplied = appliedValue?.trim() ?? "";

  return {
    field: label,
    desiredValue: normalizedDesired,
    appliedValue: normalizedApplied || "",
    state: normalizedApplied
      ? normalizedDesired === normalizedApplied
        ? "match"
        : "changed"
      : "unknown"
  };
}

function renderComparisonTable(
  copy: WebCopy,
  title: string,
  description: string,
  rows: ComparisonRow[]
): string {
  return `<article class="panel panel-nested detail-shell">
    <div class="section-head">
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p class="muted section-description">${escapeHtml(description)}</p>
      </div>
    </div>
    ${
      rows.length === 0
        ? `<p class="empty">${escapeHtml(copy.noRelatedRecords)}</p>`
        : `<div class="table-wrap comparison-table-wrap">
            <table class="comparison-table">
              <thead>
                <tr>
                  <th>${escapeHtml(copy.comparisonFieldLabel)}</th>
                  <th>${escapeHtml(copy.comparisonDesiredLabel)}</th>
                  <th>${escapeHtml(copy.comparisonAppliedLabel)}</th>
                  <th>${escapeHtml(copy.comparisonStatusLabel)}</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `<tr>
                      <td>${escapeHtml(row.field)}</td>
                      <td>${escapeHtml(row.desiredValue || copy.none)}</td>
                      <td>${escapeHtml(row.appliedValue || copy.none)}</td>
                      <td class="comparison-state-cell">${renderComparisonStatePill(
                        copy,
                        row.state
                      )}</td>
                    </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>`
    }
  </article>`;
}

function summarizeComparisonRows(copy: WebCopy, rows: ComparisonRow[]): string {
  if (rows.length === 0) {
    return copy.none;
  }

  const changed = rows.filter((row) => row.state === "changed").length;
  const matched = rows.filter((row) => row.state === "match").length;
  const unknown = rows.filter((row) => row.state === "unknown").length;
  const parts = [
    changed > 0 ? `${changed} ${copy.comparisonChangedLabel}` : "",
    matched > 0 ? `${matched} ${copy.comparisonMatchLabel}` : "",
    unknown > 0 ? `${unknown} ${copy.comparisonUnknownLabel}` : ""
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : copy.none;
}

function readStringPayloadValue(payload: Record<string, unknown> | undefined, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBooleanPayloadValue(
  payload: Record<string, unknown> | undefined,
  key: string
): boolean | null {
  const value = payload?.[key];
  return typeof value === "boolean" ? value : null;
}

function readStringArrayPayloadValue(
  payload: Record<string, unknown> | undefined,
  key: string
): string[] {
  const value = payload?.[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function readObjectArrayPayloadValue(
  payload: Record<string, unknown> | undefined,
  key: string
): Array<Record<string, unknown>> {
  const value = payload?.[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry)
  );
}

function formatDnsRecordPreview(record: DnsRecordPayload | Record<string, unknown> | undefined): string {
  if (!record) {
    return "";
  }

  const name = "name" in record && typeof record.name === "string" ? record.name : "";
  const type = "type" in record && typeof record.type === "string" ? record.type : "";
  const value = "value" in record && typeof record.value === "string" ? record.value : "";

  return [name, type, value].filter(Boolean).join(" ");
}

function summarizeGroupStatuses(
  jobs: Array<JobHistoryEntry | BackupRunSummary>
): string {
  const applied = jobs.filter((job) => ("status" in job ? job.status : undefined) === "applied").length;
  const succeeded = jobs.filter((job) => ("status" in job ? job.status : undefined) === "succeeded").length;
  const failed = jobs.filter((job) => ("status" in job ? job.status : undefined) === "failed").length;
  const queued = jobs.filter((job) => !("status" in job) || job.status === undefined).length;
  const running = jobs.filter((job) => ("status" in job ? job.status : undefined) === "running").length;
  const parts = [
    applied > 0 ? `${applied} applied` : "",
    succeeded > 0 ? `${succeeded} succeeded` : "",
    failed > 0 ? `${failed} failed` : "",
    running > 0 ? `${running} running` : "",
    queued > 0 ? `${queued} queued` : ""
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "no outcomes";
}

function renderProfileFacts(
  entries: Array<{ label: string; value: string }>
): string {
  return `<dl class="profile-facts">
    ${entries
      .map(
        (entry) => `<dt>${escapeHtml(entry.label)}</dt>
        <dd>${entry.value}</dd>`
      )
      .join("")}
  </dl>`;
}

function renderActionForm(
  action: string,
  hiddenFields: Record<string, string>,
  label: string,
  options: { confirmMessage?: string } = {}
): string {
  return `<form method="post" action="${escapeHtml(action)}" class="inline-form">
    ${Object.entries(hiddenFields)
      .map(
        ([name, value]) =>
          `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`
      )
      .join("")}
    <button class="secondary" type="submit"${
      options.confirmMessage
        ? ` data-confirm="${escapeHtml(options.confirmMessage)}"`
        : ""
    }>${escapeHtml(label)}</button>
  </form>`;
}

function renderFocusLink(
  label: string,
  href: string,
  active: boolean,
  activeLabel: string
): string {
  return `<a href="${escapeHtml(href)}" class="mono detail-link">${escapeHtml(label)}</a>${
    active ? ` ${renderPill(activeLabel, "success")}` : ""
  }`;
}

function renderRelatedPanel(
  title: string,
  description: string | undefined,
  items: Array<{
    title: string;
    meta?: string;
    summary?: string;
    summaryHtml?: string;
    tone?: "default" | "danger" | "success";
  }>,
  emptyMessage: string
): string {
  return `<article class="panel detail-shell panel-nested">
    <div class="section-head">
      <div>
        <h3>${escapeHtml(title)}</h3>
        ${
          description
            ? `<p class="muted section-description">${escapeHtml(description)}</p>`
            : ""
        }
      </div>
    </div>
    ${renderFeedList(items, emptyMessage)}
  </article>`;
}

function findLatestJobWithStatus(
  jobs: JobHistoryEntry[],
  status: JobHistoryEntry["status"]
): JobHistoryEntry | undefined {
  return jobs.find((job) => job.status === status);
}

function groupItemsBy<T>(
  items: T[],
  getKey: (item: T) => string
): Array<{ key: string; items: T[] }> {
  const groups = new Map<string, T[]>();

  items.forEach((item) => {
    const key = getKey(item).trim();

    if (!key) {
      return;
    }

    const existing = groups.get(key);

    if (existing) {
      existing.push(item);
      return;
    }

    groups.set(key, [item]);
  });

  return Array.from(groups.entries())
    .map(([key, groupedItems]) => ({
      key,
      items: groupedItems
    }))
    .sort((left, right) => right.items.length - left.items.length || left.key.localeCompare(right.key));
}

function resolveResourceKeyTarget(resourceKey: string): {
  desiredStateHref?: string;
  driftHref?: string;
} {
  if (resourceKey.startsWith("zone:")) {
    const zoneName = resourceKey.slice("zone:".length);

    return {
      desiredStateHref: buildDashboardViewUrl("desired-state", "desired-state-zones", zoneName),
      driftHref: buildDashboardViewUrl("resource-drift", undefined, resourceKey)
    };
  }

  if (resourceKey.startsWith("app:")) {
    const slug = resourceKey.split(":")[1];

    if (!slug) {
      return {};
    }

    return {
      desiredStateHref: buildDashboardViewUrl("desired-state", "desired-state-apps", slug),
      driftHref: buildDashboardViewUrl("resource-drift", undefined, resourceKey)
    };
  }

  if (resourceKey.startsWith("database:")) {
    const appSlug = resourceKey.slice("database:".length);

    return {
      desiredStateHref: buildDashboardViewUrl("desired-state", "desired-state-databases", appSlug),
      driftHref: buildDashboardViewUrl("resource-drift", undefined, resourceKey)
    };
  }

  return {};
}

function renderUserIconSvg(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"></path>
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0"></path>
  </svg>`;
}

function renderSignOutIconSvg(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 17l5-5-5-5"></path>
    <path d="M15 12H3"></path>
    <path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"></path>
  </svg>`;
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

function renderDesiredStateSection(
  data: DashboardData,
  copy: WebCopy,
  locale: WebLocale,
  defaultTabId: DesiredStateTabId,
  focus?: string
): string {
  const tenantOptions = data.desiredState.spec.tenants.map((tenant) => ({
    value: tenant.slug,
    label: `${tenant.slug} · ${tenant.displayName}`
  }));
  const nodeOptions = data.desiredState.spec.nodes.map((node) => ({
    value: node.nodeId,
    label: `${node.nodeId} · ${node.hostname}`
  }));
  const zoneOptions = data.desiredState.spec.zones.map((zone) => ({
    value: zone.zoneName,
    label: zone.zoneName
  }));
  const appOptions = data.desiredState.spec.apps.map((app) => ({
    value: app.slug,
    label: `${app.slug} · ${app.canonicalDomain}`
  }));
  const selectedZone =
    defaultTabId === "desired-state-zones"
      ? data.desiredState.spec.zones.find((zone) => zone.zoneName === focus) ??
        data.desiredState.spec.zones[0]
      : undefined;
  const selectedApp =
    defaultTabId === "desired-state-apps"
      ? data.desiredState.spec.apps.find((app) => app.slug === focus) ??
        data.desiredState.spec.apps[0]
      : undefined;
  const selectedDatabase =
    defaultTabId === "desired-state-databases"
      ? data.desiredState.spec.databases.find(
          (database) =>
            database.appSlug === focus ||
            `${database.engine}:${database.databaseName}` === focus
        ) ?? data.desiredState.spec.databases[0]
      : undefined;
  const selectedTenant =
    defaultTabId === "desired-state-tenants"
      ? data.desiredState.spec.tenants.find((tenant) => tenant.slug === focus) ??
        data.desiredState.spec.tenants[0]
      : undefined;
  const selectedNode =
    defaultTabId === "desired-state-nodes"
      ? data.desiredState.spec.nodes.find((node) => node.nodeId === focus) ??
        data.desiredState.spec.nodes[0]
      : undefined;
  const selectedBackupPolicy =
    defaultTabId === "desired-state-backups"
      ? data.desiredState.spec.backupPolicies.find((policy) => policy.policySlug === focus) ??
        data.desiredState.spec.backupPolicies[0]
      : undefined;
  const selectedDatabaseApp = selectedDatabase
    ? data.desiredState.spec.apps.find((app) => app.slug === selectedDatabase.appSlug)
    : undefined;
  const selectedAppZone = selectedApp
    ? data.desiredState.spec.zones.find((zone) => zone.zoneName === selectedApp.zoneName)
    : undefined;
  const selectedTenantApps = selectedTenant
    ? data.desiredState.spec.apps.filter((app) => app.tenantSlug === selectedTenant.slug)
    : [];
  const selectedTenantZones = selectedTenant
    ? data.desiredState.spec.zones.filter((zone) => zone.tenantSlug === selectedTenant.slug)
    : [];
  const selectedTenantBackupPolicies = selectedTenant
    ? data.desiredState.spec.backupPolicies.filter((policy) => policy.tenantSlug === selectedTenant.slug)
    : [];
  const selectedNodePrimaryApps = selectedNode
    ? data.desiredState.spec.apps.filter((app) => app.primaryNodeId === selectedNode.nodeId)
    : [];
  const selectedNodePrimaryZones = selectedNode
    ? data.desiredState.spec.zones.filter((zone) => zone.primaryNodeId === selectedNode.nodeId)
    : [];
  const selectedNodeBackupPolicies = selectedNode
    ? data.desiredState.spec.backupPolicies.filter((policy) => policy.targetNodeId === selectedNode.nodeId)
    : [];
  const selectedZoneApps = selectedZone
    ? data.desiredState.spec.apps.filter((app) => app.zoneName === selectedZone.zoneName)
    : [];
  const selectedZoneBackupPolicies = selectedZone
    ? data.desiredState.spec.backupPolicies.filter(
        (policy) => policy.tenantSlug === selectedZone.tenantSlug
      )
    : [];
  const selectedAppDatabases = selectedApp
    ? data.desiredState.spec.databases.filter((database) => database.appSlug === selectedApp.slug)
    : [];
  const selectedAppBackupPolicies = selectedApp
    ? data.desiredState.spec.backupPolicies.filter(
        (policy) => policy.tenantSlug === selectedApp.tenantSlug
      )
    : [];
  const selectedBackupRuns = selectedBackupPolicy
    ? data.backups.latestRuns.filter((run) => run.policySlug === selectedBackupPolicy.policySlug)
    : [];
  const selectedBackupTenantApps = selectedBackupPolicy
    ? data.desiredState.spec.apps.filter((app) => app.tenantSlug === selectedBackupPolicy.tenantSlug)
    : [];
  const selectedBackupTenantZones = selectedBackupPolicy
    ? data.desiredState.spec.zones.filter((zone) => zone.tenantSlug === selectedBackupPolicy.tenantSlug)
    : [];
  const selectedBackupTenantDatabases = selectedBackupPolicy
    ? data.desiredState.spec.databases.filter((database) => {
        const app = data.desiredState.spec.apps.find((entry) => entry.slug === database.appSlug);
        return app?.tenantSlug === selectedBackupPolicy.tenantSlug;
      })
    : [];
  const selectedDatabaseBackupPolicies = selectedDatabaseApp
    ? data.desiredState.spec.backupPolicies.filter(
        (policy) => policy.tenantSlug === selectedDatabaseApp.tenantSlug
      )
    : [];
  const renderEditorPanel = (
    id: string,
    rowsHtml: string,
    emptyMessage: string
  ): string => `<article id="${escapeHtml(id)}" class="panel">
      <div class="section-head">
        <div>
          <h3>${escapeHtml(copy.desiredStateEditorsTitle)}</h3>
          <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
        </div>
      </div>
      ${rowsHtml || `<p class="empty">${escapeHtml(emptyMessage)}</p>`}
    </article>`;
  const tenantTableRows: DataTableRow[] = data.desiredState.spec.tenants.map((tenant) => ({
    cells: [
      renderFocusLink(
        tenant.slug,
        buildDashboardViewUrl("desired-state", "desired-state-tenants", tenant.slug),
        selectedTenant?.slug === tenant.slug,
        copy.selectedStateLabel
      ),
      escapeHtml(tenant.displayName)
    ],
    searchText: `${tenant.slug} ${tenant.displayName}`.toLowerCase()
  }));
  const nodeTableRows: DataTableRow[] = data.desiredState.spec.nodes.map((node) => ({
    cells: [
      renderFocusLink(
        node.nodeId,
        buildDashboardViewUrl("desired-state", "desired-state-nodes", node.nodeId),
        selectedNode?.nodeId === node.nodeId,
        copy.selectedStateLabel
      ),
      escapeHtml(node.hostname),
      `<span class="mono">${escapeHtml(node.publicIpv4)}</span>`,
      `<span class="mono">${escapeHtml(node.wireguardAddress)}</span>`
    ],
    searchText: [
      node.nodeId,
      node.hostname,
      node.publicIpv4,
      node.wireguardAddress
    ].join(" ").toLowerCase()
  }));
  const zoneTableRows: DataTableRow[] = data.desiredState.spec.zones.map((zone) => ({
    cells: [
      renderFocusLink(
        zone.zoneName,
        buildDashboardViewUrl("desired-state", "desired-state-zones", zone.zoneName),
        selectedZone?.zoneName === zone.zoneName,
        copy.selectedStateLabel
      ),
      escapeHtml(zone.tenantSlug),
      `<span class="mono">${escapeHtml(zone.primaryNodeId)}</span>`,
      renderPill(String(zone.records.length), zone.records.length > 0 ? "success" : "muted")
    ],
    searchText: [
      zone.zoneName,
      zone.tenantSlug,
      zone.primaryNodeId,
      ...zone.records.map((record) => `${record.name} ${record.type} ${record.value}`)
    ].join(" ").toLowerCase()
  }));
  const appTableRows: DataTableRow[] = data.desiredState.spec.apps.map((app) => ({
    cells: [
      renderFocusLink(
        app.slug,
        buildDashboardViewUrl("desired-state", "desired-state-apps", app.slug),
        selectedApp?.slug === app.slug,
        copy.selectedStateLabel
      ),
      escapeHtml(app.tenantSlug),
      escapeHtml(app.canonicalDomain),
      renderPill(app.mode, app.mode === "active-active" ? "success" : "muted"),
      `<span class="mono">${escapeHtml(
        app.standbyNodeId ? `${app.primaryNodeId} -> ${app.standbyNodeId}` : app.primaryNodeId
      )}</span>`
    ],
    searchText: [
      app.slug,
      app.tenantSlug,
      app.zoneName,
      app.canonicalDomain,
      app.aliases.join(" "),
      app.mode,
      app.primaryNodeId,
      app.standbyNodeId ?? ""
    ].join(" ").toLowerCase()
  }));
  const databaseTableRows: DataTableRow[] = data.desiredState.spec.databases.map((database) => ({
    cells: [
      renderFocusLink(
        database.appSlug,
        buildDashboardViewUrl("desired-state", "desired-state-databases", database.appSlug),
        selectedDatabase?.appSlug === database.appSlug,
        copy.selectedStateLabel
      ),
      escapeHtml(database.engine),
      `<span class="mono">${escapeHtml(database.databaseName)}</span>`,
      `<span class="mono">${escapeHtml(database.databaseUser)}</span>`,
      `<span class="mono">${escapeHtml(
        database.standbyNodeId
          ? `${database.primaryNodeId} -> ${database.standbyNodeId}`
          : database.primaryNodeId
      )}</span>`,
      database.pendingMigrationTo
        ? renderPill(database.pendingMigrationTo, "danger")
        : renderPill(copy.none, "muted")
    ],
    searchText: [
      database.appSlug,
      database.engine,
      database.databaseName,
      database.databaseUser,
      database.primaryNodeId,
      database.standbyNodeId ?? "",
      database.pendingMigrationTo ?? ""
    ].join(" ").toLowerCase()
  }));
  const backupTableRows: DataTableRow[] = data.desiredState.spec.backupPolicies.map((policy) => ({
    cells: [
      renderFocusLink(
        policy.policySlug,
        buildDashboardViewUrl("desired-state", "desired-state-backups", policy.policySlug),
        selectedBackupPolicy?.policySlug === policy.policySlug,
        copy.selectedStateLabel
      ),
      escapeHtml(policy.tenantSlug),
      `<span class="mono">${escapeHtml(policy.targetNodeId)}</span>`,
      `<span class="mono">${escapeHtml(policy.schedule)}</span>`,
      renderPill(String(policy.retentionDays), policy.retentionDays > 0 ? "success" : "muted")
    ],
    searchText: [
      policy.policySlug,
      policy.tenantSlug,
      policy.targetNodeId,
      policy.schedule,
      String(policy.retentionDays),
      policy.resourceSelectors.join(" ")
    ].join(" ").toLowerCase()
  }));
  const tenantAppCount = (tenantSlug: string): number =>
    data.desiredState.spec.apps.filter((app) => app.tenantSlug === tenantSlug).length;
  const tenantZoneCount = (tenantSlug: string): number =>
    data.desiredState.spec.zones.filter((zone) => zone.tenantSlug === tenantSlug).length;
  const tenantBackupCount = (tenantSlug: string): number =>
    data.desiredState.spec.backupPolicies.filter((policy) => policy.tenantSlug === tenantSlug).length;
  const nodePrimaryAppCount = (nodeId: string): number =>
    data.desiredState.spec.apps.filter((app) => app.primaryNodeId === nodeId).length;
  const nodeBackupCount = (nodeId: string): number =>
    data.desiredState.spec.backupPolicies.filter((policy) => policy.targetNodeId === nodeId).length;
  const nodePrimaryZoneCount = (nodeId: string): number =>
    data.desiredState.spec.zones.filter((zone) => zone.primaryNodeId === nodeId).length;
  const selectedTenantJobs = selectedTenant
    ? findRelatedJobs(
        data.jobHistory,
        {
          needles: [selectedTenant.slug]
        },
        5
      )
    : [];
  const selectedTenantAuditEvents = selectedTenant
    ? findRelatedAuditEvents(data.auditEvents, [selectedTenant.slug], 6)
    : [];
  const selectedNodeDesiredJobs = selectedNode
    ? findRelatedJobs(
        data.jobHistory,
        {
          nodeId: selectedNode.nodeId,
          needles: [selectedNode.nodeId, selectedNode.hostname]
        },
        6
      )
    : [];
  const selectedNodeDesiredAuditEvents = selectedNode
    ? findRelatedAuditEvents(data.auditEvents, [selectedNode.nodeId, selectedNode.hostname], 6)
    : [];
  const selectedNodeDesiredDrift = selectedNode
    ? data.drift.filter((entry) => entry.nodeId === selectedNode.nodeId)
    : [];
  const selectedZoneJobs = selectedZone
    ? findRelatedJobs(
        data.jobHistory,
        {
          resourceKeys: [`zone:${selectedZone.zoneName}`],
          needles: [selectedZone.zoneName, selectedZone.primaryNodeId]
        },
        6
      )
    : [];
  const selectedZoneAuditEvents = selectedZone
    ? findRelatedAuditEvents(
        data.auditEvents,
        [selectedZone.zoneName, selectedZone.tenantSlug, selectedZone.primaryNodeId],
        6
      )
    : [];
  const selectedAppJobs = selectedApp
    ? findRelatedJobs(
        data.jobHistory,
        {
          resourcePrefixes: [`app:${selectedApp.slug}:`],
          resourceKeys: [`zone:${selectedApp.zoneName}`],
          needles: [
            selectedApp.slug,
            selectedApp.zoneName,
            selectedApp.canonicalDomain,
            selectedApp.primaryNodeId,
            selectedApp.standbyNodeId ?? ""
          ]
        },
        6
      )
    : [];
  const selectedAppAuditEvents = selectedApp
    ? findRelatedAuditEvents(
        data.auditEvents,
        [
          selectedApp.slug,
          selectedApp.zoneName,
          selectedApp.canonicalDomain,
          selectedApp.primaryNodeId,
          selectedApp.standbyNodeId ?? ""
        ],
        6
      )
    : [];
  const selectedDatabaseJobs = selectedDatabase
    ? findRelatedJobs(
        data.jobHistory,
        {
          resourceKeys: [`database:${selectedDatabase.appSlug}`],
          needles: [
            selectedDatabase.appSlug,
            selectedDatabase.databaseName,
            selectedDatabase.databaseUser,
            selectedDatabase.primaryNodeId,
            selectedDatabase.standbyNodeId ?? ""
          ]
        },
        6
      )
    : [];
  const selectedDatabaseAuditEvents = selectedDatabase
    ? findRelatedAuditEvents(
        data.auditEvents,
        [
          selectedDatabase.appSlug,
          selectedDatabase.databaseName,
          selectedDatabase.databaseUser,
          selectedDatabase.primaryNodeId,
          selectedDatabase.standbyNodeId ?? ""
        ],
        6
      )
    : [];
  const selectedBackupRun = selectedBackupPolicy
    ? data.backups.latestRuns.find((run) => run.policySlug === selectedBackupPolicy.policySlug)
    : undefined;
  const selectedBackupAuditEvents = selectedBackupPolicy
    ? findRelatedAuditEvents(
        data.auditEvents,
        [
          selectedBackupPolicy.policySlug,
          selectedBackupPolicy.targetNodeId,
          selectedBackupPolicy.storageLocation,
          selectedBackupRun?.runId ?? ""
        ],
        6
      )
    : [];
  const renderResourceActivityStack = (
    jobs: JobHistoryEntry[],
    audits: AuditEventSummary[]
  ): string => `<div class="stack">
      ${renderJobFeedPanel(copy, locale, jobs)}
      ${renderAuditPanel(copy, locale, audits)}
    </div>`;
  const selectedTenantLatestFailure = findLatestJobWithStatus(selectedTenantJobs, "failed");
  const selectedNodeLatestFailure = findLatestJobWithStatus(selectedNodeDesiredJobs, "failed");
  const selectedZoneLatestFailure = findLatestJobWithStatus(selectedZoneJobs, "failed");
  const selectedAppLatestFailure = findLatestJobWithStatus(selectedAppJobs, "failed");
  const selectedDatabaseLatestFailure = findLatestJobWithStatus(selectedDatabaseJobs, "failed");
  const selectedBackupLatestFailureRun = selectedBackupRuns.find((run) => run.status === "failed");
  const selectedTenantLatestSuccess = findLatestJobWithStatus(selectedTenantJobs, "applied");
  const selectedNodeLatestSuccess = findLatestJobWithStatus(selectedNodeDesiredJobs, "applied");
  const selectedZoneLatestSuccess = findLatestJobWithStatus(selectedZoneJobs, "applied");
  const selectedAppLatestSuccess = findLatestJobWithStatus(selectedAppJobs, "applied");
  const selectedDatabaseLatestSuccess = findLatestJobWithStatus(selectedDatabaseJobs, "applied");
  const selectedBackupLatestSuccessRun = selectedBackupRuns.find((run) => run.status === "succeeded");
  const selectedNodeHealthSnapshot = selectedNode
    ? data.nodeHealth.find((entry) => entry.nodeId === selectedNode.nodeId)
    : undefined;
  const selectedBackupTargetHealth = selectedBackupPolicy
    ? data.nodeHealth.find((entry) => entry.nodeId === selectedBackupPolicy.targetNodeId)
    : undefined;
  const selectedZonePrimaryNodeHealth = selectedZone
    ? data.nodeHealth.find((entry) => entry.nodeId === selectedZone.primaryNodeId)
    : undefined;
  const selectedAppPrimaryNodeHealth = selectedApp
    ? data.nodeHealth.find((entry) => entry.nodeId === selectedApp.primaryNodeId)
    : undefined;
  const selectedDatabasePrimaryNodeHealth = selectedDatabase
    ? data.nodeHealth.find((entry) => entry.nodeId === selectedDatabase.primaryNodeId)
    : undefined;
  const selectedZoneDrift = selectedZone
    ? data.drift.find((entry) => entry.resourceKey === `zone:${selectedZone.zoneName}`)
    : undefined;
  const selectedAppProxyDrifts = selectedApp
    ? data.drift.filter((entry) => entry.resourceKey.startsWith(`app:${selectedApp.slug}:proxy:`))
    : [];
  const selectedDatabaseDrift = selectedDatabase
    ? data.drift.find((entry) => entry.resourceKey === `database:${selectedDatabase.appSlug}`)
    : undefined;
  const selectedZoneLatestAppliedDnsJob = selectedZoneJobs.find(
    (job) => job.kind === "dns.sync" && job.status === "applied"
  );
  const selectedAppLatestAppliedProxyJob = selectedAppJobs.find(
    (job) =>
      job.kind === "proxy.render" &&
      job.status === "applied" &&
      job.nodeId === selectedApp?.primaryNodeId
  );
  const selectedDatabaseLatestAppliedReconcileJob = selectedDatabaseJobs.find(
    (job) =>
      (job.kind === "postgres.reconcile" || job.kind === "mariadb.reconcile") &&
      job.status === "applied"
  );
  const selectedAppPlanItems = selectedApp
    ? [
        {
          title: "dns.sync",
          meta: escapeHtml(
            [selectedApp.zoneName, selectedAppZone?.primaryNodeId ?? selectedApp.primaryNodeId].join(
              " · "
            )
          ),
          summary: escapeHtml(
            `Queues 1 dns.sync job for zone ${selectedApp.zoneName} on ${
              selectedAppZone?.primaryNodeId ?? selectedApp.primaryNodeId
            }.`
          ),
          tone: "default" as const
        },
        {
          title: "proxy.render",
          meta: escapeHtml(
            selectedApp.standbyNodeId
              ? `${selectedApp.primaryNodeId} + ${selectedApp.standbyNodeId}`
              : selectedApp.primaryNodeId
          ),
          summary: escapeHtml(
            `Queues ${
              selectedApp.standbyNodeId ? 2 : 1
            } proxy.render job(s) for ${selectedApp.canonicalDomain}.`
          ),
          tone: "default" as const
        }
      ]
    : [];
  const selectedDatabasePlanItems = selectedDatabase
    ? [
        {
          title:
            selectedDatabase.engine === "postgresql"
              ? "postgres.reconcile"
              : "mariadb.reconcile",
          meta: `<span class="mono">${escapeHtml(selectedDatabase.primaryNodeId)}</span>`,
          summary: escapeHtml(
            `Queues 1 reconcile job for ${selectedDatabase.databaseName} using ${selectedDatabase.engine}.`
          ),
          tone: "default" as const
        }
      ]
    : [];
  const selectedZonePlanItems = selectedZone
    ? [
        {
          title: "dns.sync",
          meta: `<span class="mono">${escapeHtml(selectedZone.primaryNodeId)}</span>`,
          summary: escapeHtml(
            `Queues 1 dns.sync job for ${selectedZone.records.length} desired DNS record(s).`
          ),
          tone: "default" as const
        }
      ]
    : [];
  const zoneComparisonRows =
    selectedZone && selectedZoneLatestAppliedDnsJob
      ? [
          createComparisonRow(
            copy.zoneColZone,
            selectedZone.zoneName,
            readStringPayloadValue(selectedZoneLatestAppliedDnsJob.payload, "zoneName")
          ),
          createComparisonRow(
            copy.targetedNodesLabel,
            selectedZone.primaryNodeId,
            selectedZoneLatestAppliedDnsJob.nodeId
          ),
          createComparisonRow(
            copy.zoneColRecordCount,
            String(selectedZone.records.length),
            String(readObjectArrayPayloadValue(selectedZoneLatestAppliedDnsJob.payload, "records").length)
          ),
          createComparisonRow(
            copy.recordPreviewTitle,
            formatDnsRecordPreview(selectedZone.records[0]) || copy.none,
            formatDnsRecordPreview(
              readObjectArrayPayloadValue(selectedZoneLatestAppliedDnsJob.payload, "records")[0]
            ) || copy.none
          )
        ]
      : [];
  const appComparisonRows =
    selectedApp && selectedAppLatestAppliedProxyJob
      ? [
          createComparisonRow(
            copy.appColDomain,
            selectedApp.canonicalDomain,
            readStringPayloadValue(selectedAppLatestAppliedProxyJob.payload, "serverName")
          ),
          createComparisonRow(
            copy.aliasesLabel,
            String(selectedApp.aliases.length),
            String(
              readStringArrayPayloadValue(selectedAppLatestAppliedProxyJob.payload, "serverAliases")
                .length
            )
          ),
          createComparisonRow(
            copy.storageRootLabel,
            `${selectedApp.storageRoot}/current/public`,
            readStringPayloadValue(selectedAppLatestAppliedProxyJob.payload, "documentRoot")
          ),
          createComparisonRow(
            copy.targetedNodesLabel,
            selectedApp.primaryNodeId,
            selectedAppLatestAppliedProxyJob.nodeId
          ),
          createComparisonRow(
            copy.appColMode,
            "tls:on",
            readBooleanPayloadValue(selectedAppLatestAppliedProxyJob.payload, "tls") === null
              ? null
              : readBooleanPayloadValue(selectedAppLatestAppliedProxyJob.payload, "tls")
                ? "tls:on"
                : "tls:off"
          )
        ]
      : [];
  const databaseComparisonRows =
    selectedDatabase && selectedDatabaseLatestAppliedReconcileJob
      ? [
          createComparisonRow(
            copy.databaseColEngine,
            selectedDatabase.engine,
            selectedDatabaseLatestAppliedReconcileJob.kind === "postgres.reconcile"
              ? "postgresql"
              : "mariadb"
          ),
          createComparisonRow(
            copy.databaseColDatabase,
            selectedDatabase.databaseName,
            readStringPayloadValue(selectedDatabaseLatestAppliedReconcileJob.payload, "databaseName")
          ),
          createComparisonRow(
            copy.databaseColUser,
            selectedDatabase.databaseUser,
            readStringPayloadValue(selectedDatabaseLatestAppliedReconcileJob.payload, "roleName") ??
              readStringPayloadValue(selectedDatabaseLatestAppliedReconcileJob.payload, "userName")
          ),
          createComparisonRow(
            copy.targetedNodesLabel,
            selectedDatabase.primaryNodeId,
            selectedDatabaseLatestAppliedReconcileJob.nodeId
          )
        ]
      : [];
  const selectedTenantActionPreviewItems = selectedTenant
    ? [
        {
          title: "metadata.update",
          meta: escapeHtml(`${selectedTenant.slug} · ${selectedTenant.displayName}`),
          summary: escapeHtml(
            `${tenantAppCount(selectedTenant.slug)} app(s), ${tenantZoneCount(selectedTenant.slug)} zone(s) and ${tenantBackupCount(selectedTenant.slug)} backup polic(ies) remain attached to this tenant scope.`
          ),
          tone: "default" as const
        },
        {
          title: "tenant.delete",
          meta: escapeHtml("cascade"),
          summary: escapeHtml(
            `${tenantAppCount(selectedTenant.slug)} app(s), ${tenantZoneCount(selectedTenant.slug)} zone(s) and ${tenantBackupCount(selectedTenant.slug)} backup polic(ies) would be removed from desired state.`
          ),
          tone:
            tenantAppCount(selectedTenant.slug) +
              tenantZoneCount(selectedTenant.slug) +
              tenantBackupCount(selectedTenant.slug) >
            0
              ? ("danger" as const)
              : ("default" as const)
        }
      ]
    : [];
  const selectedNodeActionPreviewItems = selectedNode
    ? [
        {
          title: "node.update",
          meta: escapeHtml(`${selectedNode.hostname} · ${selectedNode.publicIpv4}`),
          summary: escapeHtml(
            `${nodePrimaryAppCount(selectedNode.nodeId)} app(s), ${nodePrimaryZoneCount(selectedNode.nodeId)} zone(s) and ${nodeBackupCount(selectedNode.nodeId)} backup polic(ies) currently target this node.`
          ),
          tone: "default" as const
        },
        {
          title: "node.delete",
          meta: escapeHtml("topology risk"),
          summary: escapeHtml(
            `${selectedNodeDesiredJobs.length} related job(s) and ${selectedNodeDesiredAuditEvents.length} audit event(s) reference this node.`
          ),
          tone:
            nodePrimaryAppCount(selectedNode.nodeId) +
              nodePrimaryZoneCount(selectedNode.nodeId) +
              nodeBackupCount(selectedNode.nodeId) >
            0
              ? ("danger" as const)
              : ("default" as const)
        }
      ]
    : [];
  const selectedZoneActionPreviewItems = selectedZone
    ? [
        {
          title: "dns.sync",
          meta: escapeHtml(`${selectedZone.primaryNodeId} · ${selectedZone.records.length} record(s)`),
          summary: escapeHtml(
            selectedZoneLatestAppliedDnsJob
              ? summarizeComparisonRows(copy, zoneComparisonRows)
              : "No successful dns.sync payload recorded yet for this zone."
          ),
          tone:
            selectedZoneDrift?.dispatchRecommended || zoneComparisonRows.some((row) => row.state === "changed")
              ? ("danger" as const)
              : ("default" as const)
        },
        {
          title: "zone.delete",
          meta: escapeHtml(`${selectedZoneApps.length} app(s)`),
          summary: escapeHtml(
            `${selectedZoneBackupPolicies.length} backup polic(ies) and ${selectedZonePlanItems.length} queued work item(s) currently relate to this zone.`
          ),
          tone:
            selectedZoneApps.length + selectedZoneBackupPolicies.length > 0
              ? ("danger" as const)
              : ("default" as const)
        }
      ]
    : [];
  const selectedAppActionPreviewItems = selectedApp
    ? [
        {
          title: "proxy.render",
          meta: escapeHtml(
            selectedApp.standbyNodeId
              ? `${selectedApp.primaryNodeId} -> ${selectedApp.standbyNodeId}`
              : selectedApp.primaryNodeId
          ),
          summary: escapeHtml(
            selectedAppLatestAppliedProxyJob
              ? summarizeComparisonRows(copy, appComparisonRows)
              : "No successful proxy.render payload recorded yet for this app."
          ),
          tone:
            selectedAppProxyDrifts.some((entry) => entry.dispatchRecommended) ||
            appComparisonRows.some((row) => row.state === "changed")
              ? ("danger" as const)
              : ("default" as const)
        },
        {
          title: "app.reconcile",
          meta: escapeHtml(
            `${selectedAppDatabases.length} database(s) · ${selectedApp.aliases.length} alias(es)`
          ),
          summary: escapeHtml(
            `${selectedAppPlanItems.length} queued work item(s) and ${selectedAppBackupPolicies.length} backup polic(ies) are currently linked to this app.`
          ),
          tone:
            selectedAppDatabases.length + selectedAppBackupPolicies.length > 0
              ? ("default" as const)
              : ("default" as const)
        },
        {
          title: "app.delete",
          meta: escapeHtml(selectedApp.canonicalDomain),
          summary: escapeHtml(
            `${selectedAppDatabases.length} database definition(s) would need follow-up review and ${selectedApp.aliases.length} alias(es) would disappear from proxy planning.`
          ),
          tone:
            selectedAppDatabases.length + selectedApp.aliases.length > 0
              ? ("danger" as const)
              : ("default" as const)
        }
      ]
    : [];
  const selectedDatabaseActionPreviewItems = selectedDatabase
    ? [
        {
          title: `${selectedDatabase.engine}.reconcile`,
          meta: escapeHtml(selectedDatabase.primaryNodeId),
          summary: escapeHtml(
            selectedDatabaseLatestAppliedReconcileJob
              ? summarizeComparisonRows(copy, databaseComparisonRows)
              : "No successful database reconcile payload recorded yet for this resource."
          ),
          tone:
            selectedDatabaseDrift?.dispatchRecommended ||
            databaseComparisonRows.some((row) => row.state === "changed")
              ? ("danger" as const)
              : ("default" as const)
        },
        {
          title: "database.delete",
          meta: escapeHtml(selectedDatabase.databaseName),
          summary: escapeHtml(
            `${selectedDatabaseBackupPolicies.length} backup polic(ies) and ${selectedDatabasePlanItems.length} queued work item(s) currently reference this database resource.`
          ),
          tone:
            selectedDatabaseBackupPolicies.length + selectedDatabasePlanItems.length > 0
              ? ("danger" as const)
              : ("default" as const)
        }
      ]
    : [];
  const selectedBackupActionPreviewItems = selectedBackupPolicy
    ? [
        {
          title: "policy.update",
          meta: escapeHtml(`${selectedBackupPolicy.targetNodeId} · ${selectedBackupPolicy.schedule}`),
          summary: escapeHtml(
            `${selectedBackupTenantApps.length} app(s), ${selectedBackupTenantZones.length} zone(s) and ${selectedBackupTenantDatabases.length} database(s) fall under this policy scope.`
          ),
          tone: "default" as const
        },
        {
          title: "policy.delete",
          meta: escapeHtml(`${selectedBackupRuns.length} recorded run(s)`),
          summary: escapeHtml(
            `${selectedBackupTenantApps.length} app(s), ${selectedBackupTenantZones.length} zone(s) and ${selectedBackupTenantDatabases.length} database(s) would lose tracked coverage from this policy.`
          ),
          tone:
            selectedBackupTenantApps.length +
              selectedBackupTenantZones.length +
              selectedBackupTenantDatabases.length >
            0
              ? ("danger" as const)
              : ("default" as const)
        }
      ]
    : [];
  const desiredStateLatestImportSummary = data.inventory.latestImport
    ? `${formatDate(data.inventory.latestImport.importedAt, locale)} · ${data.inventory.latestImport.sourcePath}`
    : copy.never;

  const tenantDetailPanel = selectedTenant
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.selectedResourceTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
        </div>
        <div>
          <h3>${escapeHtml(selectedTenant.displayName)}</h3>
          <p class="muted">${escapeHtml(selectedTenant.slug)}</p>
        </div>
        ${renderDetailGrid([
          { label: copy.tenantColSlug, value: `<span class="mono">${escapeHtml(selectedTenant.slug)}</span>` },
          { label: copy.tenantColDisplayName, value: escapeHtml(selectedTenant.displayName) },
          { label: copy.navApps, value: renderPill(String(tenantAppCount(selectedTenant.slug)), tenantAppCount(selectedTenant.slug) > 0 ? "success" : "muted") },
          { label: copy.navZones, value: renderPill(String(tenantZoneCount(selectedTenant.slug)), tenantZoneCount(selectedTenant.slug) > 0 ? "success" : "muted") },
          { label: copy.navBackupPolicies, value: renderPill(String(tenantBackupCount(selectedTenant.slug)), tenantBackupCount(selectedTenant.slug) > 0 ? "success" : "muted") },
          {
            label: copy.latestSuccessLabel,
            value: selectedTenantLatestSuccess
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedTenantLatestSuccess.jobId)
                )}">${escapeHtml(selectedTenantLatestSuccess.jobId)}</a>`
              : renderPill(copy.none, "muted")
          },
          {
            label: copy.latestFailureLabel,
            value: selectedTenantLatestFailure
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedTenantLatestFailure.jobId)
                )}">${escapeHtml(selectedTenantLatestFailure.jobId)}</a>`
              : renderPill(copy.none, "muted")
          }
        ])}
        ${renderRelatedPanel(
          copy.effectiveStateTitle,
          copy.effectiveStateDescription,
          [
            {
              title: escapeHtml(copy.relatedJobsTitle),
              meta: escapeHtml(`${selectedTenantJobs.length} job(s)`),
              summary: escapeHtml(
                selectedTenantJobs[0]?.summary ?? selectedTenantJobs[0]?.dispatchReason ?? copy.none
              ),
              tone: selectedTenantJobs.some((job) => job.status === "failed")
                ? ("danger" as const)
                : selectedTenantJobs.some((job) => job.status === "applied")
                  ? ("success" as const)
                  : ("default" as const)
            },
            {
              title: escapeHtml(copy.auditTrailTitle),
              meta: escapeHtml(`${selectedTenantAuditEvents.length} event(s)`),
              summary: escapeHtml(selectedTenantAuditEvents[0]?.eventType ?? copy.none),
              tone: "default" as const
            }
          ],
          copy.noRelatedRecords
        )}
        ${renderRelatedPanel(
          copy.plannedChangesTitle,
          copy.plannedChangesDescription,
          selectedTenantActionPreviewItems,
          copy.noRelatedRecords
        )}
        ${renderRelatedPanel(
          copy.relatedResourcesTitle,
          copy.relatedResourcesDescription,
          [
            ...selectedTenantApps.slice(0, 4).map((app) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-apps", app.slug)
              )}">${escapeHtml(app.slug)}</a>`,
              meta: escapeHtml(app.canonicalDomain),
              summary: escapeHtml(app.primaryNodeId),
              tone: "default" as const
            })),
            ...selectedTenantZones.slice(0, 3).map((zone) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-zones", zone.zoneName)
              )}">${escapeHtml(zone.zoneName)}</a>`,
              meta: escapeHtml(zone.primaryNodeId),
              summary: escapeHtml(zone.tenantSlug),
              tone: "default" as const
            })),
            ...selectedTenantBackupPolicies.slice(0, 3).map((policy) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-backups", policy.policySlug)
              )}">${escapeHtml(policy.policySlug)}</a>`,
              meta: escapeHtml(policy.targetNodeId),
              summary: escapeHtml(policy.schedule),
              tone: "default" as const
            }))
          ],
          copy.noRelatedRecords
        )}
        <div class="toolbar">
          ${
            selectedTenantJobs[0]
              ? `<a class="button-link secondary" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedTenantJobs[0].jobId)
                )}">${escapeHtml(copy.openJobHistory)}</a>`
              : ""
          }
          <a class="button-link secondary" href="${escapeHtml(
            buildDashboardViewUrl("desired-state", "desired-state-backups")
          )}">${escapeHtml(copy.openBackupsView)}</a>
        </div>
        ${renderResourceActivityStack(selectedTenantJobs, selectedTenantAuditEvents)}
      </article>`
    : "";

  const tenantEditorPanel = selectedTenant
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.desiredStateEditorsTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
          </div>
        </div>
        <div class="grid grid-two">
          <form method="post" action="/resources/tenants/upsert" class="panel panel-nested detail-shell">
            <input type="hidden" name="originalSlug" value="${escapeHtml(selectedTenant.slug)}" />
            <div>
              <h3>${escapeHtml(copy.detailActionsTitle)}</h3>
              <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
            </div>
            <div class="form-grid">
              <label>Slug
                <input name="slug" value="${escapeHtml(selectedTenant.slug)}" required spellcheck="false" />
              </label>
              <label>Display name
                <input name="displayName" value="${escapeHtml(selectedTenant.displayName)}" required />
              </label>
            </div>
            <div class="toolbar">
              <button type="submit">Save tenant</button>
            </div>
          </form>
          <article class="panel panel-nested detail-shell">
            <div>
              <h3>${escapeHtml(copy.impactPreviewTitle)}</h3>
              <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
            </div>
          ${renderDetailGrid([
            { label: copy.navApps, value: escapeHtml(String(tenantAppCount(selectedTenant.slug))) },
            { label: copy.navZones, value: escapeHtml(String(tenantZoneCount(selectedTenant.slug))) },
            { label: copy.navBackupPolicies, value: escapeHtml(String(tenantBackupCount(selectedTenant.slug))) },
            {
              label: copy.relatedJobsTitle,
              value: escapeHtml(String(selectedTenantJobs.length))
            },
            {
              label: copy.auditTrailTitle,
              value: escapeHtml(String(selectedTenantAuditEvents.length))
            }
          ])}
          ${renderRelatedPanel(
            copy.plannedChangesTitle,
            copy.plannedChangesDescription,
            selectedTenantActionPreviewItems,
            copy.noRelatedRecords
          )}
          <div class="toolbar">
            <a class="button-link secondary" href="${escapeHtml(
              buildDashboardViewUrl("desired-state", "desired-state-apps")
            )}">${escapeHtml(copy.navApps)}</a>
              <a class="button-link secondary" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-zones")
              )}">${escapeHtml(copy.navZones)}</a>
            </div>
          </article>
        </div>
        <article class="panel panel-nested detail-shell danger-shell">
          <div>
            <h3>${escapeHtml(copy.dangerZoneTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
          ${renderDetailGrid([
            { label: copy.navApps, value: escapeHtml(String(tenantAppCount(selectedTenant.slug))) },
            { label: copy.navZones, value: escapeHtml(String(tenantZoneCount(selectedTenant.slug))) },
            { label: copy.navBackupPolicies, value: escapeHtml(String(tenantBackupCount(selectedTenant.slug))) }
          ])}
          <form method="post" action="/resources/tenants/delete" class="toolbar">
            <input type="hidden" name="slug" value="${escapeHtml(selectedTenant.slug)}" />
            <button class="danger" type="submit" data-confirm="${escapeHtml(
              `Delete tenant ${selectedTenant.slug}? Related apps, zones and backup policies will be removed from desired state.`
            )}">Delete tenant</button>
          </form>
        </article>
      </article>`
    : "";

  const nodeDetailPanel = selectedNode
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.selectedResourceTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
        </div>
        <div>
          <h3>${escapeHtml(selectedNode.hostname)}</h3>
          <p class="muted">${escapeHtml(selectedNode.nodeId)}</p>
        </div>
        ${renderDetailGrid([
          { label: copy.nodeColNode, value: `<span class="mono">${escapeHtml(selectedNode.nodeId)}</span>` },
          { label: copy.nodeColHostname, value: escapeHtml(selectedNode.hostname) },
          { label: copy.nodeSpecColPublicIpv4, value: `<span class="mono">${escapeHtml(selectedNode.publicIpv4)}</span>` },
          { label: copy.nodeSpecColWireguard, value: `<span class="mono">${escapeHtml(selectedNode.wireguardAddress)}</span>` },
          { label: copy.navApps, value: renderPill(String(nodePrimaryAppCount(selectedNode.nodeId)), nodePrimaryAppCount(selectedNode.nodeId) > 0 ? "success" : "muted") },
          { label: copy.navZones, value: renderPill(String(nodePrimaryZoneCount(selectedNode.nodeId)), nodePrimaryZoneCount(selectedNode.nodeId) > 0 ? "success" : "muted") },
          { label: copy.navBackupPolicies, value: renderPill(String(nodeBackupCount(selectedNode.nodeId)), nodeBackupCount(selectedNode.nodeId) > 0 ? "success" : "muted") },
          {
            label: copy.latestSuccessLabel,
            value: selectedNodeLatestSuccess
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedNodeLatestSuccess.jobId)
                )}">${escapeHtml(selectedNodeLatestSuccess.jobId)}</a>`
              : renderPill(copy.none, "muted")
          },
          {
            label: copy.latestFailureLabel,
            value: selectedNodeLatestFailure
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedNodeLatestFailure.jobId)
                )}">${escapeHtml(selectedNodeLatestFailure.jobId)}</a>`
              : renderPill(copy.none, "muted")
          }
        ])}
        ${renderRelatedPanel(
          copy.effectiveStateTitle,
          copy.effectiveStateDescription,
          [
            {
              title: escapeHtml(copy.nodeHealthTitle),
              meta: escapeHtml(selectedNodeHealthSnapshot?.currentVersion ?? copy.none),
              summary: escapeHtml(
                selectedNodeHealthSnapshot?.latestJobSummary ?? formatDate(selectedNodeHealthSnapshot?.lastSeenAt, locale)
              ),
              tone: selectedNodeHealthSnapshot?.latestJobStatus === "failed"
                ? ("danger" as const)
                : selectedNodeHealthSnapshot?.latestJobStatus === "applied"
                  ? ("success" as const)
                  : ("default" as const)
            },
            {
              title: escapeHtml(copy.relatedDriftTitle),
              meta: escapeHtml(`${selectedNodeDesiredDrift.length} drift item(s)`),
              summary: escapeHtml(
                selectedNodeDesiredDrift[0]?.latestSummary ?? copy.none
              ),
              tone: selectedNodeDesiredDrift.some((entry) => entry.driftStatus !== "in_sync")
                ? ("danger" as const)
                : ("default" as const)
            }
          ],
          copy.noRelatedRecords
        )}
        ${renderRelatedPanel(
          copy.plannedChangesTitle,
          copy.plannedChangesDescription,
          selectedNodeActionPreviewItems,
          copy.noRelatedRecords
        )}
        ${renderRelatedPanel(
          copy.relatedResourcesTitle,
          copy.relatedResourcesDescription,
          [
            ...selectedNodePrimaryApps.slice(0, 4).map((app) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-apps", app.slug)
              )}">${escapeHtml(app.slug)}</a>`,
              meta: escapeHtml(app.canonicalDomain),
              summary: escapeHtml(app.mode),
              tone: "default" as const
            })),
            ...selectedNodePrimaryZones.slice(0, 4).map((zone) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-zones", zone.zoneName)
              )}">${escapeHtml(zone.zoneName)}</a>`,
              meta: escapeHtml(zone.tenantSlug),
              summary: escapeHtml(zone.primaryNodeId),
              tone: "default" as const
            })),
            ...selectedNodeBackupPolicies.slice(0, 3).map((policy) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-backups", policy.policySlug)
              )}">${escapeHtml(policy.policySlug)}</a>`,
              meta: escapeHtml(policy.schedule),
              summary: escapeHtml(policy.storageLocation),
              tone: "default" as const
            }))
          ],
          copy.noRelatedRecords
        )}
        <div class="toolbar">
          <a class="button-link secondary" href="${escapeHtml(
            buildDashboardViewUrl("node-health", undefined, selectedNode.nodeId)
          )}">${escapeHtml(copy.nodeHealthTitle)}</a>
          ${
            selectedNodeDesiredJobs[0]
              ? `<a class="button-link secondary" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedNodeDesiredJobs[0].jobId)
                )}">${escapeHtml(copy.openJobHistory)}</a>`
              : ""
          }
        </div>
        ${renderResourceActivityStack(selectedNodeDesiredJobs, selectedNodeDesiredAuditEvents)}
      </article>`
    : "";

  const nodeEditorPanel = selectedNode
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.desiredStateEditorsTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
          </div>
        </div>
        <div class="grid grid-two">
          <form method="post" action="/resources/nodes/upsert" class="panel panel-nested detail-shell">
            <input type="hidden" name="originalNodeId" value="${escapeHtml(selectedNode.nodeId)}" />
            <div>
              <h3>${escapeHtml(copy.detailActionsTitle)}</h3>
              <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
            </div>
            <div class="form-grid">
              <label>Node ID
                <input name="nodeId" value="${escapeHtml(selectedNode.nodeId)}" required spellcheck="false" />
              </label>
              <label>Hostname
                <input name="hostname" value="${escapeHtml(selectedNode.hostname)}" required spellcheck="false" />
              </label>
              <label>Public IPv4
                <input name="publicIpv4" value="${escapeHtml(selectedNode.publicIpv4)}" required spellcheck="false" />
              </label>
              <label>WireGuard address
                <input name="wireguardAddress" value="${escapeHtml(selectedNode.wireguardAddress)}" required spellcheck="false" />
              </label>
            </div>
            <div class="toolbar">
              <button type="submit">Save node</button>
            </div>
          </form>
          <article class="panel panel-nested detail-shell">
            <div>
              <h3>${escapeHtml(copy.impactPreviewTitle)}</h3>
              <p class="muted section-description">${escapeHtml(copy.nodeDiagnosticsDescription)}</p>
            </div>
            ${renderDetailGrid([
              { label: copy.navApps, value: escapeHtml(String(nodePrimaryAppCount(selectedNode.nodeId))) },
              { label: copy.navZones, value: escapeHtml(String(nodePrimaryZoneCount(selectedNode.nodeId))) },
              { label: copy.navBackupPolicies, value: escapeHtml(String(nodeBackupCount(selectedNode.nodeId))) },
              {
                label: copy.nodeColVersion,
                value: selectedNodeHealthSnapshot?.currentVersion
                  ? renderPill(selectedNodeHealthSnapshot.currentVersion, "muted")
                  : renderPill(copy.none, "muted")
              },
              {
                label: copy.nodeColLatestStatus,
                value: selectedNodeHealthSnapshot?.latestJobStatus
                  ? renderPill(
                      selectedNodeHealthSnapshot.latestJobStatus,
                      selectedNodeHealthSnapshot.latestJobStatus === "applied"
                        ? "success"
                        : selectedNodeHealthSnapshot.latestJobStatus === "failed"
                          ? "danger"
                          : "muted"
                    )
                  : renderPill(copy.none, "muted")
              },
              { label: copy.nodeHealthTitle, value: `<a class="detail-link" href="${escapeHtml(buildDashboardViewUrl("node-health", undefined, selectedNode.nodeId))}">${escapeHtml(copy.openNodeHealth)}</a>` }
            ])}
            ${renderRelatedPanel(
              copy.plannedChangesTitle,
              copy.plannedChangesDescription,
              selectedNodeActionPreviewItems,
              copy.noRelatedRecords
            )}
          </article>
        </div>
        <article class="panel panel-nested detail-shell danger-shell">
          <div>
            <h3>${escapeHtml(copy.dangerZoneTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
          ${renderDetailGrid([
            { label: copy.navApps, value: escapeHtml(String(nodePrimaryAppCount(selectedNode.nodeId))) },
            { label: copy.navZones, value: escapeHtml(String(nodePrimaryZoneCount(selectedNode.nodeId))) },
            { label: copy.navBackupPolicies, value: escapeHtml(String(nodeBackupCount(selectedNode.nodeId))) }
          ])}
          <form method="post" action="/resources/nodes/delete" class="toolbar">
            <input type="hidden" name="nodeId" value="${escapeHtml(selectedNode.nodeId)}" />
            <button class="danger" type="submit" data-confirm="${escapeHtml(
              `Delete node ${selectedNode.nodeId}? Review apps, zones and backup policies that still target this node before continuing.`
            )}">Delete node</button>
          </form>
        </article>
      </article>`
    : "";

  const backupDetailPanel = selectedBackupPolicy
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.selectedResourceTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
        </div>
        <div>
          <h3>${escapeHtml(selectedBackupPolicy.policySlug)}</h3>
          <p class="muted">${escapeHtml(selectedBackupPolicy.storageLocation)}</p>
        </div>
        ${renderDetailGrid([
          { label: copy.backupPolicyColTenant, value: escapeHtml(selectedBackupPolicy.tenantSlug) },
          { label: copy.backupPolicyColTargetNode, value: `<span class="mono">${escapeHtml(selectedBackupPolicy.targetNodeId)}</span>` },
          { label: copy.backupPolicyColSchedule, value: `<span class="mono">${escapeHtml(selectedBackupPolicy.schedule)}</span>` },
          { label: copy.backupPolicyColRetention, value: renderPill(String(selectedBackupPolicy.retentionDays), selectedBackupPolicy.retentionDays > 0 ? "success" : "muted") },
          { label: copy.storageRootLabel, value: `<span class="mono">${escapeHtml(selectedBackupPolicy.storageLocation)}</span>` },
          { label: copy.recordPreviewTitle, value: escapeHtml(selectedBackupPolicy.resourceSelectors.join(", ") || copy.none) },
          {
            label: copy.latestSuccessLabel,
            value: selectedBackupLatestSuccessRun
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("backups", undefined, selectedBackupLatestSuccessRun.runId)
                )}">${escapeHtml(selectedBackupLatestSuccessRun.runId)}</a>`
              : renderPill(copy.none, "muted")
          },
          {
            label: copy.latestFailureLabel,
            value: selectedBackupLatestFailureRun
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("backups", undefined, selectedBackupLatestFailureRun.runId)
                )}">${escapeHtml(selectedBackupLatestFailureRun.runId)}</a>`
              : renderPill(copy.none, "muted")
          }
        ])}
        ${
          selectedBackupRun
            ? renderDetailGrid([
                {
                  label: copy.backupColStatus,
                  value: renderPill(
                    selectedBackupRun.status,
                    selectedBackupRun.status === "succeeded"
                      ? "success"
                      : selectedBackupRun.status === "failed"
                        ? "danger"
                        : "muted"
                  )
                },
                {
                  label: copy.backupColNode,
                  value: `<span class="mono">${escapeHtml(selectedBackupRun.nodeId)}</span>`
                },
                {
                  label: copy.backupColStarted,
                  value: escapeHtml(formatDate(selectedBackupRun.startedAt, locale))
                },
                {
                  label: copy.backupColSummary,
                  value: escapeHtml(selectedBackupRun.summary)
                }
              ])
            : `<p class="empty">${escapeHtml(copy.noBackups)}</p>`
        }
        ${renderRelatedPanel(
          copy.effectiveStateTitle,
          copy.effectiveStateDescription,
          [
            {
              title: escapeHtml(copy.nodeHealthTitle),
              meta: escapeHtml(selectedBackupTargetHealth?.currentVersion ?? copy.none),
              summary: escapeHtml(
                selectedBackupTargetHealth?.latestJobSummary ?? copy.none
              ),
              tone: selectedBackupTargetHealth?.latestJobStatus === "failed"
                ? ("danger" as const)
                : selectedBackupTargetHealth?.latestJobStatus === "applied"
                  ? ("success" as const)
                  : ("default" as const)
            },
            {
              title: escapeHtml(copy.relatedJobsTitle),
              meta: escapeHtml(`${selectedBackupRuns.length} run(s)`),
              summary: escapeHtml(selectedBackupRun?.summary ?? copy.none),
              tone: selectedBackupRuns.some((run) => run.status === "failed")
                ? ("danger" as const)
                : selectedBackupRuns.some((run) => run.status === "succeeded")
                  ? ("success" as const)
                  : ("default" as const)
            }
          ],
          copy.noRelatedRecords
        )}
        ${renderRelatedPanel(
          copy.plannedChangesTitle,
          copy.plannedChangesDescription,
          selectedBackupActionPreviewItems,
          copy.noRelatedRecords
        )}
        ${renderRelatedPanel(
          copy.relatedResourcesTitle,
          copy.relatedResourcesDescription,
          [
            ...selectedBackupTenantApps.slice(0, 4).map((app) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-apps", app.slug)
              )}">${escapeHtml(app.slug)}</a>`,
              meta: escapeHtml(app.canonicalDomain),
              summary: escapeHtml(app.primaryNodeId),
              tone: "default" as const
            })),
            ...selectedBackupTenantZones.slice(0, 3).map((zone) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-zones", zone.zoneName)
              )}">${escapeHtml(zone.zoneName)}</a>`,
              meta: escapeHtml(zone.primaryNodeId),
              summary: escapeHtml(zone.tenantSlug),
              tone: "default" as const
            }))
          ],
          copy.noRelatedRecords
        )}
        <div class="toolbar">
          <a class="button-link secondary" href="${escapeHtml(
            buildDashboardViewUrl("backups", undefined, selectedBackupPolicy.policySlug)
          )}">${escapeHtml(copy.backupsTitle)}</a>
          <a class="button-link secondary" href="${escapeHtml(
            buildDashboardViewUrl("node-health", undefined, selectedBackupPolicy.targetNodeId)
          )}">${escapeHtml(copy.openNodeHealth)}</a>
        </div>
        ${renderAuditPanel(copy, locale, selectedBackupAuditEvents)}
      </article>`
    : "";

  const backupEditorPanel = selectedBackupPolicy
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.desiredStateEditorsTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
          </div>
        </div>
        <form method="post" action="/resources/backups/upsert" class="stack">
          <input type="hidden" name="originalPolicySlug" value="${escapeHtml(selectedBackupPolicy.policySlug)}" />
          <div class="grid grid-two">
            <article class="panel panel-nested detail-shell">
              <div>
                <h3>${escapeHtml(copy.detailActionsTitle)}</h3>
              </div>
              <div class="form-grid">
                <label>Policy slug
                  <input name="policySlug" value="${escapeHtml(selectedBackupPolicy.policySlug)}" required spellcheck="false" />
                </label>
                <label>Tenant slug
                  <select name="tenantSlug" required>
                    ${renderSelectOptions(tenantOptions, selectedBackupPolicy.tenantSlug)}
                  </select>
                </label>
                <label>Target node
                  <select name="targetNodeId" required>
                    ${renderSelectOptions(nodeOptions, selectedBackupPolicy.targetNodeId)}
                  </select>
                </label>
                <label>Schedule
                  <input name="schedule" value="${escapeHtml(selectedBackupPolicy.schedule)}" required />
                </label>
                <label>Retention days
                  <input type="number" name="retentionDays" min="1" value="${escapeHtml(String(selectedBackupPolicy.retentionDays))}" required />
                </label>
              </div>
            </article>
            <article class="panel panel-nested detail-shell">
              <div>
                <h3>${escapeHtml(copy.impactPreviewTitle)}</h3>
                <p class="muted section-description">${escapeHtml(copy.backupsDescription)}</p>
              </div>
              <div class="form-grid">
                <label>Storage location
                  <input name="storageLocation" value="${escapeHtml(selectedBackupPolicy.storageLocation)}" required />
                </label>
                <label>Resource selectors
                  <input name="resourceSelectors" value="${escapeHtml(selectedBackupPolicy.resourceSelectors.join(", "))}" />
                </label>
              </div>
              ${renderDetailGrid([
                {
                  label: copy.policyCoverage,
                  value: escapeHtml(String(data.backups.policies.length))
                },
                {
                  label: copy.affectedResourcesLabel,
                  value: escapeHtml(
                    `${selectedBackupPolicy.resourceSelectors.length || 0} selector(s) · ${selectedBackupTenantApps.length} app(s) · ${selectedBackupTenantZones.length} zone(s)`
                  )
                },
                {
                  label: copy.backupColStatus,
                  value: selectedBackupRun
                    ? renderPill(
                        selectedBackupRun.status,
                        selectedBackupRun.status === "succeeded"
                          ? "success"
                          : selectedBackupRun.status === "failed"
                            ? "danger"
                          : "muted"
                      )
                    : renderPill(copy.none, "muted")
                },
                {
                  label: copy.latestFailureLabel,
                  value: selectedBackupLatestFailureRun
                    ? renderPill(selectedBackupLatestFailureRun.status, "danger")
                    : renderPill(copy.none, "muted")
                },
                {
                  label: copy.latestSuccessLabel,
                  value: selectedBackupLatestSuccessRun
                    ? renderPill(selectedBackupLatestSuccessRun.status, "success")
                    : renderPill(copy.none, "muted")
                },
                {
                  label: copy.nodeHealthTitle,
                  value: selectedBackupTargetHealth?.latestJobStatus
                    ? renderPill(
                        selectedBackupTargetHealth.latestJobStatus,
                        selectedBackupTargetHealth.latestJobStatus === "applied"
                          ? "success"
                          : selectedBackupTargetHealth.latestJobStatus === "failed"
                            ? "danger"
                            : "muted"
                      )
                    : renderPill(copy.none, "muted")
                }
              ])}
              ${renderRelatedPanel(
                copy.queuedWorkTitle,
                copy.backupCoverageDescription,
                [
                  {
                    title: `<span class="mono">${escapeHtml(selectedBackupPolicy.targetNodeId)}</span>`,
                    meta: escapeHtml([selectedBackupPolicy.schedule, `${selectedBackupPolicy.retentionDays}d retention`].join(" · ")),
                    summary: escapeHtml(
                      `${selectedBackupPolicy.resourceSelectors.length || 0} selector(s), ${selectedBackupTenantApps.length} app(s), ${selectedBackupTenantZones.length} zone(s), ${selectedBackupTenantDatabases.length} database(s)`
                    ),
                    tone: "default"
                  }
                ],
                copy.noRelatedRecords
              )}
              ${renderRelatedPanel(
                copy.plannedChangesTitle,
                copy.plannedChangesDescription,
                selectedBackupActionPreviewItems,
                copy.noRelatedRecords
              )}
            </article>
          </div>
          <div class="toolbar">
            <button type="submit">Save backup policy</button>
            <a class="button-link secondary" href="${escapeHtml(
              buildDashboardViewUrl("backups", undefined, selectedBackupPolicy.policySlug)
            )}">${escapeHtml(copy.openBackupsView)}</a>
          </div>
        </form>
        <article class="panel panel-nested detail-shell danger-shell">
          <div>
            <h3>${escapeHtml(copy.dangerZoneTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.backupPolicyContextDescription)}</p>
          </div>
          ${renderActionFacts([
            {
              label: copy.affectedResourcesLabel,
              value: escapeHtml(
                `${selectedBackupTenantApps.length} app(s) · ${selectedBackupTenantZones.length} zone(s) · ${selectedBackupTenantDatabases.length} database(s)`
              )
            },
            {
              label: copy.relatedJobsTitle,
              value: escapeHtml(String(selectedBackupRuns.length))
            }
          ])}
          <form method="post" action="/resources/backups/delete" class="toolbar">
            <input type="hidden" name="policySlug" value="${escapeHtml(selectedBackupPolicy.policySlug)}" />
            <button class="danger" type="submit" data-confirm="${escapeHtml(
              `Delete backup policy ${selectedBackupPolicy.policySlug}? ${selectedBackupRuns.length} recorded run(s) and coverage for ${selectedBackupTenantApps.length} app(s), ${selectedBackupTenantZones.length} zone(s) and ${selectedBackupTenantDatabases.length} database(s) will no longer be tracked by this policy.`
            )}">Delete backup policy</button>
          </form>
        </article>
      </article>`
    : "";
  const zoneDetailPanel = selectedZone
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.selectedResourceTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
        </div>
        <div>
          <h3>${escapeHtml(selectedZone.zoneName)}</h3>
          <p class="muted">${escapeHtml(selectedZone.tenantSlug)}</p>
        </div>
        ${renderDetailGrid([
          { label: copy.zoneColTenant, value: escapeHtml(selectedZone.tenantSlug) },
          {
            label: copy.zoneColPrimaryNode,
            value: `<span class="mono">${escapeHtml(selectedZone.primaryNodeId)}</span>`
          },
          {
            label: copy.nodeHealthTitle,
            value: selectedZonePrimaryNodeHealth?.latestJobStatus
              ? renderPill(
                  selectedZonePrimaryNodeHealth.latestJobStatus,
                  selectedZonePrimaryNodeHealth.latestJobStatus === "applied"
                    ? "success"
                    : selectedZonePrimaryNodeHealth.latestJobStatus === "failed"
                      ? "danger"
                      : "muted"
                )
              : renderPill(copy.none, "muted")
          },
          {
            label: copy.zoneColRecordCount,
            value: renderPill(
              String(selectedZone.records.length),
              selectedZone.records.length > 0 ? "success" : "muted"
            )
          },
          {
            label: copy.latestSuccessLabel,
            value: selectedZoneLatestSuccess
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedZoneLatestSuccess.jobId)
                )}">${escapeHtml(selectedZoneLatestSuccess.jobId)}</a>`
              : renderPill(copy.none, "muted")
          }
        ])}
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.recordPreviewTitle)}</h3>
          </div>
          <div class="toolbar">
            ${renderActionForm(
              "/actions/zone-sync",
              { zoneName: selectedZone.zoneName },
              copy.actionDispatchDnsSync,
              {
                confirmMessage: `Dispatch dns.sync for zone ${selectedZone.zoneName}? This will queue 1 job for ${selectedZone.records.length} desired record(s) on ${selectedZone.primaryNodeId}.`
              }
            )}
          </div>
        </div>
        <article class="panel panel-nested detail-shell">
          <div>
            <h3>${escapeHtml(copy.previewTitle)}</h3>
          </div>
          ${renderDetailGrid([
            { label: copy.zoneColPrimaryNode, value: `<span class="mono">${escapeHtml(selectedZone.primaryNodeId)}</span>` },
            { label: copy.zoneColRecordCount, value: escapeHtml(String(selectedZone.records.length)) },
            {
              label: copy.affectedResourcesLabel,
              value: escapeHtml(String(selectedZoneApps.length))
            },
            {
              label: copy.dispatchRecommended,
              value: selectedZoneDrift
                ? renderPill(
                    selectedZoneDrift.dispatchRecommended ? copy.yesLabel : copy.noLabel,
                    selectedZoneDrift.dispatchRecommended ? "danger" : "success"
                  )
                : renderPill(copy.none, "muted")
            },
            {
              label: copy.latestFailureLabel,
              value: selectedZoneLatestFailure
                ? `<a class="detail-link mono" href="${escapeHtml(
                    buildDashboardViewUrl("job-history", undefined, selectedZoneLatestFailure.jobId)
                  )}">${escapeHtml(selectedZoneLatestFailure.jobId)}</a>`
                : renderPill(copy.none, "muted")
            },
            {
              label: copy.linkedResource,
              value: `<a class="detail-link mono" href="${escapeHtml(
                buildDashboardViewUrl("resource-drift", undefined, `zone:${selectedZone.zoneName}`)
              )}">${escapeHtml(`zone:${selectedZone.zoneName}`)}</a>`
            }
          ])}
        </article>
        ${renderComparisonTable(
          copy,
          copy.desiredAppliedTitle,
          copy.desiredAppliedDescription,
          zoneComparisonRows
        )}
        ${renderRelatedPanel(
          copy.plannedChangesTitle,
          copy.plannedChangesDescription,
          selectedZoneActionPreviewItems,
          copy.noRelatedRecords
        )}
        ${renderRelatedPanel(
          copy.queuedWorkTitle,
          copy.queuedWorkDescription,
          selectedZonePlanItems,
          copy.noRelatedRecords
        )}
        ${
          selectedZone.records.length > 0
            ? `<div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>${escapeHtml(copy.recordColName)}</th>
                      <th>${escapeHtml(copy.recordColType)}</th>
                      <th>${escapeHtml(copy.recordColValue)}</th>
                      <th>${escapeHtml(copy.recordColTtl)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${selectedZone.records
                      .map(
                        (record) => `<tr>
                          <td class="mono">${escapeHtml(record.name)}</td>
                          <td>${escapeHtml(record.type)}</td>
                          <td class="mono">${escapeHtml(record.value)}</td>
                          <td>${escapeHtml(String(record.ttl))}</td>
                        </tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>`
            : `<p class="empty">${escapeHtml(copy.noZones)}</p>`
        }
        ${renderRelatedPanel(
          copy.relatedResourcesTitle,
          copy.relatedResourcesDescription,
          [
            ...selectedZoneApps.map((app) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-apps", app.slug)
              )}">${escapeHtml(app.slug)}</a>`,
              meta: escapeHtml(app.canonicalDomain),
              summary: escapeHtml(app.primaryNodeId),
              tone: "default" as const
            })),
            ...selectedZoneBackupPolicies.slice(0, 3).map((policy) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-backups", policy.policySlug)
              )}">${escapeHtml(policy.policySlug)}</a>`,
              meta: escapeHtml(policy.targetNodeId),
              summary: escapeHtml(policy.schedule),
              tone: "default" as const
            }))
          ],
          copy.noRelatedRecords
        )}
        <div class="toolbar">
          <a class="button-link secondary" href="${escapeHtml(
            buildDashboardViewUrl("resource-drift", undefined, `zone:${selectedZone.zoneName}`)
          )}">${escapeHtml(copy.openDriftView)}</a>
          ${
            selectedZoneJobs[0]
              ? `<a class="button-link secondary" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedZoneJobs[0].jobId)
                )}">${escapeHtml(copy.openJobHistory)}</a>`
              : ""
          }
        </div>
        ${renderResourceActivityStack(selectedZoneJobs, selectedZoneAuditEvents)}
      </article>`
    : "";

  const zoneEditorPanel = selectedZone
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.desiredStateEditorsTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
          </div>
        </div>
        <form method="post" action="/resources/zones/upsert" class="stack">
          <input type="hidden" name="originalZoneName" value="${escapeHtml(selectedZone.zoneName)}" />
          <div class="grid grid-two">
            <article class="panel panel-nested detail-shell">
              <div>
                <h3>${escapeHtml(copy.detailActionsTitle)}</h3>
                <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
              </div>
              <div class="form-grid">
                <label>Zone name
                  <input name="zoneName" value="${escapeHtml(selectedZone.zoneName)}" required spellcheck="false" />
                </label>
                <label>Tenant slug
                  <select name="tenantSlug" required>
                    ${renderSelectOptions(tenantOptions, selectedZone.tenantSlug)}
                  </select>
                </label>
                <label>Primary node
                  <select name="primaryNodeId" required>
                    ${renderSelectOptions(nodeOptions, selectedZone.primaryNodeId)}
                  </select>
                </label>
              </div>
              <label>Records
                <textarea name="records" spellcheck="false" class="mono">${escapeHtml(
                  formatZoneRecords(selectedZone.records)
                )}</textarea>
              </label>
              <div class="toolbar">
                <button type="submit">Save zone</button>
                <button class="secondary" type="submit" formaction="/actions/zone-sync" data-confirm="${escapeHtml(
                  `Dispatch dns.sync for zone ${selectedZone.zoneName}? This will queue 1 job for ${selectedZone.records.length} desired record(s) on ${selectedZone.primaryNodeId}.`
                )}">Dispatch dns.sync</button>
              </div>
            </article>
            <article class="panel panel-nested detail-shell">
              <div>
                <h3>${escapeHtml(copy.previewTitle)}</h3>
                <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
              </div>
              ${renderActionFacts([
                {
                  label: copy.targetedNodesLabel,
                  value: `<span class="mono">${escapeHtml(selectedZone.primaryNodeId)}</span>`
                },
                {
                  label: copy.affectedResourcesLabel,
                  value: escapeHtml(
                    `${selectedZone.records.length} records · ${selectedZoneApps.length} app(s)`
                  )
                },
                {
                  label: copy.latestFailureLabel,
                  value: selectedZoneLatestFailure
                    ? `<a class="detail-link mono" href="${escapeHtml(
                        buildDashboardViewUrl("job-history", undefined, selectedZoneLatestFailure.jobId)
                      )}">${escapeHtml(selectedZoneLatestFailure.jobId)}</a>`
                    : escapeHtml(copy.none)
                },
                {
                  label: copy.linkedResource,
                  value: `<a class="detail-link mono" href="${escapeHtml(
                    buildDashboardViewUrl("resource-drift", undefined, `zone:${selectedZone.zoneName}`)
                  )}">${escapeHtml(`zone:${selectedZone.zoneName}`)}</a>`
                },
                {
                  label: copy.dispatchRecommended,
                  value: selectedZoneDrift
                    ? renderPill(
                        selectedZoneDrift.dispatchRecommended ? copy.yesLabel : copy.noLabel,
                        selectedZoneDrift.dispatchRecommended ? "danger" : "success"
                      )
                    : renderPill(copy.none, "muted")
                }
              ])}
              ${renderRelatedPanel(
                copy.queuedWorkTitle,
                copy.queuedWorkDescription,
                selectedZonePlanItems,
                copy.noRelatedRecords
              )}
              ${renderRelatedPanel(
                copy.plannedChangesTitle,
                copy.plannedChangesDescription,
                selectedZoneActionPreviewItems,
                copy.noRelatedRecords
              )}
              ${renderRelatedPanel(
                copy.relatedResourcesTitle,
                copy.relatedResourcesDescription,
                selectedZoneApps.map((app) => ({
                  title: `<a class="detail-link" href="${escapeHtml(
                    buildDashboardViewUrl("desired-state", "desired-state-apps", app.slug)
                  )}">${escapeHtml(app.slug)}</a>`,
                  meta: escapeHtml(app.canonicalDomain),
                  summary: escapeHtml(app.primaryNodeId),
                  tone: "default" as const
                })),
                copy.noRelatedRecords
              )}
            </article>
          </div>
        </form>
        <article class="panel panel-nested detail-shell danger-shell">
          <div>
            <h3>${escapeHtml(copy.dangerZoneTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
          ${renderActionFacts([
            {
              label: copy.affectedResourcesLabel,
              value: escapeHtml(
                `${selectedZone.records.length} records · ${selectedZoneApps.length} app(s)`
              )
            },
            {
              label: copy.targetedNodesLabel,
              value: `<span class="mono">${escapeHtml(selectedZone.primaryNodeId)}</span>`
            },
            {
              label: copy.relatedResourcesTitle,
              value: escapeHtml(`${selectedZoneApps.length} app(s)`)
            }
          ])}
          <form method="post" action="/resources/zones/delete" class="toolbar">
            <input type="hidden" name="zoneName" value="${escapeHtml(selectedZone.zoneName)}" />
            <button class="danger" type="submit" data-confirm="${escapeHtml(
              `Delete zone ${selectedZone.zoneName}? ${selectedZone.records.length} desired record(s) will be removed and ${selectedZoneApps.length} linked app(s) may lose DNS context.`
            )}">Delete zone</button>
          </form>
        </article>
      </article>`
    : "";

  const appDetailPanel = selectedApp
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.selectedResourceTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
        </div>
        <div>
          <h3>${escapeHtml(selectedApp.slug)}</h3>
          <p class="muted">${escapeHtml(selectedApp.canonicalDomain)}</p>
        </div>
        ${renderDetailGrid([
          { label: copy.appColTenant, value: escapeHtml(selectedApp.tenantSlug) },
          {
            label: copy.appColMode,
            value: renderPill(
              selectedApp.mode,
              selectedApp.mode === "active-active" ? "success" : "muted"
            )
          },
          {
            label: copy.backendPortLabel,
            value: `<span class="mono">${escapeHtml(String(selectedApp.backendPort))}</span>`
          },
          {
            label: copy.appColNodes,
            value: `<span class="mono">${escapeHtml(
              selectedApp.standbyNodeId
                ? `${selectedApp.primaryNodeId} -> ${selectedApp.standbyNodeId}`
                : selectedApp.primaryNodeId
            )}</span>`
          },
          {
            label: copy.nodeHealthTitle,
            value: selectedAppPrimaryNodeHealth?.latestJobStatus
              ? renderPill(
                  selectedAppPrimaryNodeHealth.latestJobStatus,
                  selectedAppPrimaryNodeHealth.latestJobStatus === "applied"
                    ? "success"
                    : selectedAppPrimaryNodeHealth.latestJobStatus === "failed"
                      ? "danger"
                      : "muted"
                )
              : renderPill(copy.none, "muted")
          },
          {
            label: copy.latestSuccessLabel,
            value: selectedAppLatestSuccess
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedAppLatestSuccess.jobId)
                )}">${escapeHtml(selectedAppLatestSuccess.jobId)}</a>`
              : renderPill(copy.none, "muted")
          }
        ])}
        <div class="grid grid-two">
          <article class="panel">
            <h3>${escapeHtml(copy.appRuntimeTitle)}</h3>
            ${renderDetailGrid([
              {
                label: copy.runtimeImageLabel,
                value: `<span class="mono">${escapeHtml(selectedApp.runtimeImage)}</span>`
              },
              {
                label: copy.storageRootLabel,
                value: `<span class="mono">${escapeHtml(selectedApp.storageRoot)}</span>`
              },
              {
                label: copy.aliasesLabel,
                value: escapeHtml(
                  selectedApp.aliases.length > 0 ? selectedApp.aliases.join(", ") : copy.none
                )
              },
              { label: copy.appColDomain, value: escapeHtml(selectedApp.canonicalDomain) }
            ])}
          </article>
          <article class="panel">
            <h3>${escapeHtml(copy.detailActionsTitle)}</h3>
            ${renderDetailGrid([
              { label: copy.zoneColZone, value: escapeHtml(selectedApp.zoneName) },
              {
                label: copy.zoneColPrimaryNode,
                value: `<span class="mono">${escapeHtml(selectedApp.primaryNodeId)}</span>`
              },
              {
                label: copy.dispatchRecommended,
                value:
                  selectedAppProxyDrifts.length > 0
                    ? renderPill(
                        selectedAppProxyDrifts.some((entry) => entry.dispatchRecommended)
                          ? copy.yesLabel
                          : copy.noLabel,
                        selectedAppProxyDrifts.some((entry) => entry.dispatchRecommended)
                          ? "danger"
                          : "success"
                      )
                    : renderPill(copy.none, "muted")
              },
              {
                label: copy.linkedResource,
                value: `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("resource-drift", undefined, `app:${selectedApp.slug}:proxy:${selectedApp.primaryNodeId}`)
                )}">${escapeHtml(`app:${selectedApp.slug}:proxy:${selectedApp.primaryNodeId}`)}</a>`
              }
            ])}
            <div class="toolbar">
              ${renderActionForm(
                "/actions/app-reconcile",
                { slug: selectedApp.slug },
                copy.actionFullReconcile,
                {
                  confirmMessage: `Run full reconcile for app ${selectedApp.slug}? This will queue ${
                    selectedApp.standbyNodeId ? 3 : 2
                  } job(s): ${selectedApp.standbyNodeId ? "2 proxy.render + 1 dns.sync" : "1 proxy.render + 1 dns.sync"}.`
                }
              )}
              ${renderActionForm(
                "/actions/app-render-proxy",
                { slug: selectedApp.slug },
                copy.actionDispatchProxyRender,
                {
                  confirmMessage: `Dispatch proxy.render for app ${selectedApp.slug}? This will queue ${
                    selectedApp.standbyNodeId ? 2 : 1
                  } proxy.render job(s).`
                }
              )}
            </div>
            <div class="toolbar">
              <a class="button-link secondary" href="${escapeHtml(
                buildDashboardViewUrl("resource-drift", undefined, `app:${selectedApp.slug}:proxy:${selectedApp.primaryNodeId}`)
              )}">${escapeHtml(copy.openDriftView)}</a>
              ${
                selectedAppJobs[0]
                  ? `<a class="button-link secondary" href="${escapeHtml(
                      buildDashboardViewUrl("job-history", undefined, selectedAppJobs[0].jobId)
                    )}">${escapeHtml(copy.openJobHistory)}</a>`
                  : ""
              }
            </div>
          </article>
        </div>
        ${renderComparisonTable(
          copy,
          copy.desiredAppliedTitle,
          copy.desiredAppliedDescription,
          appComparisonRows
        )}
        ${renderRelatedPanel(
          copy.plannedChangesTitle,
          copy.plannedChangesDescription,
          selectedAppActionPreviewItems,
          copy.noRelatedRecords
        )}
        ${renderRelatedPanel(
          copy.queuedWorkTitle,
          copy.queuedWorkDescription,
          selectedAppPlanItems,
          copy.noRelatedRecords
        )}
        ${renderRelatedPanel(
          copy.relatedResourcesTitle,
          copy.relatedResourcesDescription,
          [
            ...selectedAppDatabases.map((database) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-databases", database.appSlug)
              )}">${escapeHtml(database.databaseName)}</a>`,
              meta: escapeHtml(database.engine),
              summary: escapeHtml(database.databaseUser),
              tone: "default" as const
            })),
            ...selectedAppBackupPolicies.slice(0, 3).map((policy) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-backups", policy.policySlug)
              )}">${escapeHtml(policy.policySlug)}</a>`,
              meta: escapeHtml(policy.targetNodeId),
              summary: escapeHtml(policy.schedule),
              tone: "default" as const
            }))
          ],
          copy.noRelatedRecords
        )}
        ${renderResourceActivityStack(selectedAppJobs, selectedAppAuditEvents)}
      </article>`
    : "";

  const appEditorPanel = selectedApp
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.desiredStateEditorsTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
          </div>
        </div>
        <form method="post" action="/resources/apps/upsert" class="stack">
          <input type="hidden" name="originalSlug" value="${escapeHtml(selectedApp.slug)}" />
          <div class="grid grid-two">
            <article class="panel panel-nested detail-shell">
              <div>
                <h3>${escapeHtml(copy.detailActionsTitle)}</h3>
                <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
              </div>
              <div class="form-grid">
                <label>Slug
                  <input name="slug" value="${escapeHtml(selectedApp.slug)}" required spellcheck="false" />
                </label>
                <label>Tenant slug
                  <select name="tenantSlug" required>
                    ${renderSelectOptions(tenantOptions, selectedApp.tenantSlug)}
                  </select>
                </label>
                <label>Zone name
                  <select name="zoneName" required>
                    ${renderSelectOptions(zoneOptions, selectedApp.zoneName)}
                  </select>
                </label>
                <label>Primary node
                  <select name="primaryNodeId" required>
                    ${renderSelectOptions(nodeOptions, selectedApp.primaryNodeId)}
                  </select>
                </label>
                <label>Standby node
                  <select name="standbyNodeId">
                    ${renderSelectOptions(nodeOptions, selectedApp.standbyNodeId, {
                      allowBlank: true,
                      blankLabel: "none"
                    })}
                  </select>
                </label>
                <label>Canonical domain
                  <input name="canonicalDomain" value="${escapeHtml(selectedApp.canonicalDomain)}" required spellcheck="false" />
                </label>
                <label>Aliases
                  <input name="aliases" value="${escapeHtml(selectedApp.aliases.join(", "))}" />
                </label>
                <label>Backend port
                  <input name="backendPort" type="number" min="1" max="65535" value="${escapeHtml(String(selectedApp.backendPort))}" required />
                </label>
                <label>Runtime image
                  <input name="runtimeImage" value="${escapeHtml(selectedApp.runtimeImage)}" required />
                </label>
                <label>Storage root
                  <input name="storageRoot" value="${escapeHtml(selectedApp.storageRoot)}" required />
                </label>
                <label>Mode
                  <select name="mode">
                    <option value="active-passive"${selectedApp.mode === "active-passive" ? " selected" : ""}>active-passive</option>
                    <option value="active-active"${selectedApp.mode === "active-active" ? " selected" : ""}>active-active</option>
                  </select>
                </label>
              </div>
              <div class="toolbar">
                <button type="submit">Save app</button>
                <button class="secondary" type="submit" formaction="/actions/app-reconcile" data-confirm="${escapeHtml(
                  `Run full reconcile for app ${selectedApp.slug}? This will queue ${
                    selectedApp.standbyNodeId ? 3 : 2
                  } job(s) across ${selectedApp.standbyNodeId ? "primary and standby nodes" : "the primary node"} plus DNS.`
                )}">Full reconcile</button>
                <button class="secondary" type="submit" formaction="/actions/app-render-proxy" data-confirm="${escapeHtml(
                  `Dispatch proxy.render for app ${selectedApp.slug}? This will queue ${
                    selectedApp.standbyNodeId ? 2 : 1
                  } proxy.render job(s) for ${selectedApp.canonicalDomain}.`
                )}">Dispatch proxy.render</button>
              </div>
            </article>
            <article class="panel panel-nested detail-shell">
              <div>
                <h3>${escapeHtml(copy.previewTitle)}</h3>
                <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
              </div>
              ${renderActionFacts([
                {
                  label: copy.targetedNodesLabel,
                  value: `<span class="mono">${escapeHtml(
                    selectedApp.standbyNodeId
                      ? `${selectedApp.primaryNodeId} -> ${selectedApp.standbyNodeId}`
                      : selectedApp.primaryNodeId
                  )}</span>`
                },
                {
                  label: copy.affectedResourcesLabel,
                  value: escapeHtml(
                    `${selectedApp.zoneName} · ${selectedAppDatabases.length} database(s) · ${selectedApp.aliases.length} alias(es)`
                  )
                },
                {
                  label: copy.latestFailureLabel,
                  value: selectedAppLatestFailure
                    ? `<a class="detail-link mono" href="${escapeHtml(
                        buildDashboardViewUrl("job-history", undefined, selectedAppLatestFailure.jobId)
                      )}">${escapeHtml(selectedAppLatestFailure.jobId)}</a>`
                    : escapeHtml(copy.none)
                },
                {
                  label: copy.linkedResource,
                  value: `<a class="detail-link mono" href="${escapeHtml(
                    buildDashboardViewUrl("resource-drift", undefined, `app:${selectedApp.slug}:proxy:${selectedApp.primaryNodeId}`)
                  )}">${escapeHtml(`app:${selectedApp.slug}:proxy:${selectedApp.primaryNodeId}`)}</a>`
                },
                {
                  label: copy.dispatchRecommended,
                  value:
                    selectedAppProxyDrifts.length > 0
                      ? renderPill(
                          selectedAppProxyDrifts.some((entry) => entry.dispatchRecommended)
                            ? copy.yesLabel
                            : copy.noLabel,
                          selectedAppProxyDrifts.some((entry) => entry.dispatchRecommended)
                            ? "danger"
                            : "success"
                        )
                      : renderPill(copy.none, "muted")
                }
              ])}
              ${renderRelatedPanel(
                copy.queuedWorkTitle,
                copy.queuedWorkDescription,
                selectedAppPlanItems,
                copy.noRelatedRecords
              )}
              ${renderRelatedPanel(
                copy.plannedChangesTitle,
                copy.plannedChangesDescription,
                selectedAppActionPreviewItems,
                copy.noRelatedRecords
              )}
              ${renderRelatedPanel(
                copy.relatedResourcesTitle,
                copy.relatedResourcesDescription,
                selectedAppDatabases.map((database) => ({
                  title: `<a class="detail-link" href="${escapeHtml(
                    buildDashboardViewUrl("desired-state", "desired-state-databases", database.appSlug)
                  )}">${escapeHtml(database.databaseName)}</a>`,
                  meta: escapeHtml(database.engine),
                  summary: escapeHtml(database.databaseUser),
                  tone: "default" as const
                })),
                copy.noRelatedRecords
              )}
            </article>
          </div>
        </form>
        <article class="panel panel-nested detail-shell danger-shell">
          <div>
            <h3>${escapeHtml(copy.dangerZoneTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
          ${renderActionFacts([
            {
              label: copy.affectedResourcesLabel,
              value: escapeHtml(
                `${selectedApp.zoneName} · ${selectedAppDatabases.length} database(s) · ${selectedApp.aliases.length} alias(es)`
              )
            },
            {
              label: copy.targetedNodesLabel,
              value: `<span class="mono">${escapeHtml(
                selectedApp.standbyNodeId
                  ? `${selectedApp.primaryNodeId} -> ${selectedApp.standbyNodeId}`
                  : selectedApp.primaryNodeId
              )}</span>`
            },
            {
              label: copy.relatedResourcesTitle,
              value: escapeHtml(`${selectedAppDatabases.length} database(s)`)
            }
          ])}
          <form method="post" action="/resources/apps/delete" class="toolbar">
            <input type="hidden" name="slug" value="${escapeHtml(selectedApp.slug)}" />
            <button class="danger" type="submit" data-confirm="${escapeHtml(
              `Delete app ${selectedApp.slug} from desired state? ${selectedAppDatabases.length} linked database definition(s) and ${selectedApp.aliases.length} alias(es) should be reviewed first.`
            )}">Delete app</button>
          </form>
        </article>
      </article>`
    : "";

  const databaseDetailPanel = selectedDatabase
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.selectedResourceTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
        </div>
        <div>
          <h3>${escapeHtml(selectedDatabase.databaseName)}</h3>
          <p class="muted">${escapeHtml(selectedDatabase.appSlug)}</p>
        </div>
        ${renderDetailGrid([
          { label: copy.databaseColApp, value: escapeHtml(selectedDatabase.appSlug) },
          { label: copy.databaseColEngine, value: escapeHtml(selectedDatabase.engine) },
          {
            label: copy.databaseColUser,
            value: `<span class="mono">${escapeHtml(selectedDatabase.databaseUser)}</span>`
          },
          {
            label: copy.nodeHealthTitle,
            value: selectedDatabasePrimaryNodeHealth?.latestJobStatus
              ? renderPill(
                  selectedDatabasePrimaryNodeHealth.latestJobStatus,
                  selectedDatabasePrimaryNodeHealth.latestJobStatus === "applied"
                    ? "success"
                    : selectedDatabasePrimaryNodeHealth.latestJobStatus === "failed"
                      ? "danger"
                      : "muted"
                )
              : renderPill(copy.none, "muted")
          },
          {
            label: copy.databaseColMigration,
            value: selectedDatabase.pendingMigrationTo
              ? renderPill(selectedDatabase.pendingMigrationTo, "danger")
              : renderPill(copy.none, "muted")
          },
          {
            label: copy.latestSuccessLabel,
            value: selectedDatabaseLatestSuccess
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedDatabaseLatestSuccess.jobId)
                )}">${escapeHtml(selectedDatabaseLatestSuccess.jobId)}</a>`
              : renderPill(copy.none, "muted")
          }
        ])}
        <div class="grid grid-two">
          <article class="panel">
            <h3>${escapeHtml(copy.databaseAccessTitle)}</h3>
            ${renderDetailGrid([
              {
                label: copy.databaseColNodes,
                value: `<span class="mono">${escapeHtml(
                  selectedDatabase.standbyNodeId
                    ? `${selectedDatabase.primaryNodeId} -> ${selectedDatabase.standbyNodeId}`
                    : selectedDatabase.primaryNodeId
                )}</span>`
              },
              {
                label: copy.appColDomain,
                value: escapeHtml(selectedDatabaseApp?.canonicalDomain ?? copy.none)
              },
              {
                label: copy.databaseColDatabase,
                value: `<span class="mono">${escapeHtml(selectedDatabase.databaseName)}</span>`
              },
              {
                label: copy.databaseColUser,
                value: `<span class="mono">${escapeHtml(selectedDatabase.databaseUser)}</span>`
              }
            ])}
          </article>
          <article class="panel">
            <h3>${escapeHtml(copy.detailActionsTitle)}</h3>
            ${renderDetailGrid([
              { label: copy.databaseColEngine, value: escapeHtml(selectedDatabase.engine) },
              {
                label: copy.databaseColDatabase,
                value: `<span class="mono">${escapeHtml(selectedDatabase.databaseName)}</span>`
              },
              {
                label: copy.dispatchRecommended,
                value: selectedDatabaseDrift
                  ? renderPill(
                      selectedDatabaseDrift.dispatchRecommended ? copy.yesLabel : copy.noLabel,
                      selectedDatabaseDrift.dispatchRecommended ? "danger" : "success"
                    )
                  : renderPill(copy.none, "muted")
              },
              {
                label: copy.linkedResource,
                value: `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("resource-drift", undefined, `database:${selectedDatabase.appSlug}`)
                )}">${escapeHtml(`database:${selectedDatabase.appSlug}`)}</a>`
              }
            ])}
            <div class="toolbar">
              ${renderActionForm(
                "/actions/database-reconcile",
                { appSlug: selectedDatabase.appSlug },
                copy.actionDispatchDatabaseReconcile,
                {
                  confirmMessage: `Dispatch database reconcile for ${selectedDatabase.appSlug}? This will queue 1 ${selectedDatabase.engine} reconcile job on ${selectedDatabase.primaryNodeId}.`
                }
              )}
            </div>
            <div class="toolbar">
              <a class="button-link secondary" href="${escapeHtml(
                buildDashboardViewUrl("resource-drift", undefined, `database:${selectedDatabase.appSlug}`)
              )}">${escapeHtml(copy.openDriftView)}</a>
              ${
                selectedDatabaseJobs[0]
                  ? `<a class="button-link secondary" href="${escapeHtml(
                      buildDashboardViewUrl("job-history", undefined, selectedDatabaseJobs[0].jobId)
                    )}">${escapeHtml(copy.openJobHistory)}</a>`
                  : ""
              }
            </div>
          </article>
        </div>
        ${renderComparisonTable(
          copy,
          copy.desiredAppliedTitle,
          copy.desiredAppliedDescription,
          databaseComparisonRows
        )}
        ${renderRelatedPanel(
          copy.plannedChangesTitle,
          copy.plannedChangesDescription,
          selectedDatabaseActionPreviewItems,
          copy.noRelatedRecords
        )}
        ${renderRelatedPanel(
          copy.queuedWorkTitle,
          copy.queuedWorkDescription,
          selectedDatabasePlanItems,
          copy.noRelatedRecords
        )}
        ${renderRelatedPanel(
          copy.relatedResourcesTitle,
          copy.relatedResourcesDescription,
          [
            {
              title: selectedDatabaseApp
                ? `<a class="detail-link" href="${escapeHtml(
                    buildDashboardViewUrl("desired-state", "desired-state-apps", selectedDatabaseApp.slug)
                  )}">${escapeHtml(selectedDatabaseApp.slug)}</a>`
                : escapeHtml(selectedDatabase.appSlug),
              meta: escapeHtml(selectedDatabaseApp?.canonicalDomain ?? copy.none),
              summary: escapeHtml(selectedDatabaseApp?.zoneName ?? copy.none),
              tone: "default" as const
            },
            {
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("node-health", undefined, selectedDatabase.primaryNodeId)
              )}">${escapeHtml(selectedDatabase.primaryNodeId)}</a>`,
              meta: escapeHtml(selectedDatabase.engine),
              summary: escapeHtml(selectedDatabase.databaseUser),
              tone: "default" as const
            },
            ...selectedDatabaseBackupPolicies.slice(0, 3).map((policy) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-backups", policy.policySlug)
              )}">${escapeHtml(policy.policySlug)}</a>`,
              meta: escapeHtml(policy.targetNodeId),
              summary: escapeHtml(policy.schedule),
              tone: "default" as const
            }))
          ],
          copy.noRelatedRecords
        )}
        ${renderResourceActivityStack(selectedDatabaseJobs, selectedDatabaseAuditEvents)}
      </article>`
    : "";

  const databaseEditorPanel = selectedDatabase
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.desiredStateEditorsTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
          </div>
        </div>
        <form method="post" action="/resources/databases/upsert" class="stack">
          <input type="hidden" name="originalAppSlug" value="${escapeHtml(selectedDatabase.appSlug)}" />
          <div class="grid grid-two">
            <article class="panel panel-nested detail-shell">
              <div>
                <h3>${escapeHtml(copy.detailActionsTitle)}</h3>
                <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
              </div>
              <div class="form-grid">
                <label>App slug
                  <select name="appSlug" required>
                    ${renderSelectOptions(appOptions, selectedDatabase.appSlug)}
                  </select>
                </label>
                <label>Engine
                  <select name="engine">
                    <option value="postgresql"${selectedDatabase.engine === "postgresql" ? " selected" : ""}>postgresql</option>
                    <option value="mariadb"${selectedDatabase.engine === "mariadb" ? " selected" : ""}>mariadb</option>
                  </select>
                </label>
                <label>Database name
                  <input name="databaseName" value="${escapeHtml(selectedDatabase.databaseName)}" required spellcheck="false" />
                </label>
                <label>Database user
                  <input name="databaseUser" value="${escapeHtml(selectedDatabase.databaseUser)}" required spellcheck="false" />
                </label>
                <label>Primary node
                  <select name="primaryNodeId" required>
                    ${renderSelectOptions(nodeOptions, selectedDatabase.primaryNodeId)}
                  </select>
                </label>
                <label>Standby node
                  <select name="standbyNodeId">
                    ${renderSelectOptions(nodeOptions, selectedDatabase.standbyNodeId, {
                      allowBlank: true,
                      blankLabel: "none"
                    })}
                  </select>
                </label>
                <label>Pending migration target
                  <input name="pendingMigrationTo" value="${escapeHtml(selectedDatabase.pendingMigrationTo ?? "")}" />
                </label>
                <label>Desired password
                  <input type="password" name="desiredPassword" placeholder="leave blank to keep stored secret" />
                </label>
              </div>
              <div class="toolbar">
                <button type="submit">Save database</button>
                <button class="secondary" type="submit" formaction="/actions/database-reconcile" data-confirm="${escapeHtml(
                  `Dispatch database reconcile for ${selectedDatabase.appSlug}? This will queue 1 ${selectedDatabase.engine} reconcile job on ${selectedDatabase.primaryNodeId}.`
                )}">Dispatch database reconcile</button>
              </div>
            </article>
            <article class="panel panel-nested detail-shell">
              <div>
                <h3>${escapeHtml(copy.previewTitle)}</h3>
                <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
              </div>
              ${renderActionFacts([
                {
                  label: copy.targetedNodesLabel,
                  value: `<span class="mono">${escapeHtml(
                    selectedDatabase.standbyNodeId
                      ? `${selectedDatabase.primaryNodeId} -> ${selectedDatabase.standbyNodeId}`
                      : selectedDatabase.primaryNodeId
                  )}</span>`
                },
                {
                  label: copy.affectedResourcesLabel,
                  value: escapeHtml(
                    `${selectedDatabase.engine} · ${selectedDatabase.databaseName} · ${selectedDatabaseApp?.canonicalDomain ?? selectedDatabase.appSlug}`
                  )
                },
                {
                  label: copy.latestFailureLabel,
                  value: selectedDatabaseLatestFailure
                    ? `<a class="detail-link mono" href="${escapeHtml(
                        buildDashboardViewUrl("job-history", undefined, selectedDatabaseLatestFailure.jobId)
                      )}">${escapeHtml(selectedDatabaseLatestFailure.jobId)}</a>`
                    : escapeHtml(copy.none)
                },
                {
                  label: copy.linkedResource,
                  value: `<a class="detail-link mono" href="${escapeHtml(
                    buildDashboardViewUrl("resource-drift", undefined, `database:${selectedDatabase.appSlug}`)
                  )}">${escapeHtml(`database:${selectedDatabase.appSlug}`)}</a>`
                },
                {
                  label: copy.dispatchRecommended,
                  value: selectedDatabaseDrift
                    ? renderPill(
                        selectedDatabaseDrift.dispatchRecommended ? copy.yesLabel : copy.noLabel,
                        selectedDatabaseDrift.dispatchRecommended ? "danger" : "success"
                      )
                    : renderPill(copy.none, "muted")
                }
              ])}
              ${renderRelatedPanel(
                copy.queuedWorkTitle,
                copy.queuedWorkDescription,
                selectedDatabasePlanItems,
                copy.noRelatedRecords
              )}
              ${renderRelatedPanel(
                copy.plannedChangesTitle,
                copy.plannedChangesDescription,
                selectedDatabaseActionPreviewItems,
                copy.noRelatedRecords
              )}
              ${renderRelatedPanel(
                copy.relatedResourcesTitle,
                copy.relatedResourcesDescription,
                [
                  {
                    title: selectedDatabaseApp
                      ? `<a class="detail-link" href="${escapeHtml(
                          buildDashboardViewUrl("desired-state", "desired-state-apps", selectedDatabaseApp.slug)
                        )}">${escapeHtml(selectedDatabaseApp.slug)}</a>`
                      : escapeHtml(selectedDatabase.appSlug),
                    meta: escapeHtml(selectedDatabaseApp?.canonicalDomain ?? copy.none),
                    summary: escapeHtml(selectedDatabaseApp?.zoneName ?? copy.none),
                    tone: "default" as const
                  }
                ],
                copy.noRelatedRecords
              )}
            </article>
          </div>
        </form>
        <article class="panel panel-nested detail-shell danger-shell">
          <div>
            <h3>${escapeHtml(copy.dangerZoneTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
          ${renderActionFacts([
            {
              label: copy.affectedResourcesLabel,
              value: escapeHtml(
                `${selectedDatabase.engine} · ${selectedDatabase.databaseName} · ${selectedDatabaseApp?.canonicalDomain ?? selectedDatabase.appSlug}`
              )
            },
            {
              label: copy.targetedNodesLabel,
              value: `<span class="mono">${escapeHtml(
                selectedDatabase.standbyNodeId
                  ? `${selectedDatabase.primaryNodeId} -> ${selectedDatabase.standbyNodeId}`
                  : selectedDatabase.primaryNodeId
              )}</span>`
            },
            {
              label: copy.databaseColApp,
              value: escapeHtml(selectedDatabase.appSlug)
            }
          ])}
          <form method="post" action="/resources/databases/delete" class="toolbar">
            <input type="hidden" name="appSlug" value="${escapeHtml(selectedDatabase.appSlug)}" />
            <button class="danger" type="submit" data-confirm="${escapeHtml(
              `Delete database ${selectedDatabase.databaseName} from desired state? Future ${selectedDatabase.engine} reconciliation for ${selectedDatabase.appSlug} will stop on ${selectedDatabase.primaryNodeId}.`
            )}">Delete database</button>
          </form>
        </article>
      </article>`
    : "";

  const createTabs: TabItem[] = [
    {
      id: "create-tenant-form",
      label: copy.tabTenants,
      panelHtml: `<article class="panel detail-shell">
        <h3>Create tenant</h3>
        <form method="post" action="/resources/tenants/upsert" class="stack">
          <div class="form-grid">
            <label>Slug
              <input name="slug" required spellcheck="false" />
            </label>
            <label>Display name
              <input name="displayName" required />
            </label>
          </div>
          <button type="submit">Create tenant</button>
        </form>
      </article>`
    },
    {
      id: "create-node-form",
      label: copy.tabNodes,
      panelHtml: `<article class="panel detail-shell">
        <h3>Create node</h3>
        <form method="post" action="/resources/nodes/upsert" class="stack">
          <div class="form-grid">
            <label>Node ID
              <input name="nodeId" required spellcheck="false" />
            </label>
            <label>Hostname
              <input name="hostname" required spellcheck="false" />
            </label>
            <label>Public IPv4
              <input name="publicIpv4" required spellcheck="false" />
            </label>
            <label>WireGuard address
              <input name="wireguardAddress" required spellcheck="false" />
            </label>
          </div>
          <button type="submit">Create node</button>
        </form>
      </article>`
    },
    {
      id: "create-zone-form",
      label: copy.tabZones,
      panelHtml: `<article class="panel detail-shell">
        <h3>Create zone</h3>
        <form method="post" action="/resources/zones/upsert" class="stack">
          <div class="form-grid">
            <label>Zone name
              <input name="zoneName" required spellcheck="false" />
            </label>
            <label>Tenant slug
              <select name="tenantSlug" required>
                ${renderSelectOptions(tenantOptions, undefined)}
              </select>
            </label>
            <label>Primary node
              <select name="primaryNodeId" required>
                ${renderSelectOptions(nodeOptions, undefined)}
              </select>
            </label>
          </div>
          <label>Records
            <textarea name="records" spellcheck="false" class="mono" placeholder="@ A 203.0.113.10 300"></textarea>
          </label>
          <button type="submit">Create zone</button>
        </form>
      </article>`
    },
    {
      id: "create-app-form",
      label: copy.tabApps,
      panelHtml: `<article class="panel detail-shell">
        <h3>Create app</h3>
        <form method="post" action="/resources/apps/upsert" class="stack">
          <div class="form-grid">
            <label>Slug
              <input name="slug" required spellcheck="false" />
            </label>
            <label>Tenant slug
              <select name="tenantSlug" required>
                ${renderSelectOptions(tenantOptions, undefined)}
              </select>
            </label>
            <label>Zone name
              <select name="zoneName" required>
                ${renderSelectOptions(zoneOptions, undefined)}
              </select>
            </label>
            <label>Primary node
              <select name="primaryNodeId" required>
                ${renderSelectOptions(nodeOptions, undefined)}
              </select>
            </label>
            <label>Standby node
              <select name="standbyNodeId">
                ${renderSelectOptions(nodeOptions, undefined, {
                  allowBlank: true,
                  blankLabel: "none"
                })}
              </select>
            </label>
            <label>Canonical domain
              <input name="canonicalDomain" required spellcheck="false" />
            </label>
            <label>Aliases
              <input name="aliases" />
            </label>
            <label>Backend port
              <input type="number" name="backendPort" min="1" max="65535" required />
            </label>
            <label>Runtime image
              <input name="runtimeImage" required />
            </label>
            <label>Storage root
              <input name="storageRoot" required />
            </label>
            <label>Mode
              <select name="mode">
                <option value="active-passive" selected>active-passive</option>
                <option value="active-active">active-active</option>
              </select>
            </label>
          </div>
          <button type="submit">Create app</button>
        </form>
      </article>`
    },
    {
      id: "create-database-form",
      label: copy.tabDatabases,
      panelHtml: `<article class="panel detail-shell">
        <h3>Create database</h3>
        <form method="post" action="/resources/databases/upsert" class="stack">
          <div class="form-grid">
            <label>App slug
              <select name="appSlug" required>
                ${renderSelectOptions(appOptions, undefined)}
              </select>
            </label>
            <label>Engine
              <select name="engine">
                <option value="postgresql">postgresql</option>
                <option value="mariadb">mariadb</option>
              </select>
            </label>
            <label>Database name
              <input name="databaseName" required spellcheck="false" />
            </label>
            <label>Database user
              <input name="databaseUser" required spellcheck="false" />
            </label>
            <label>Primary node
              <select name="primaryNodeId" required>
                ${renderSelectOptions(nodeOptions, undefined)}
              </select>
            </label>
            <label>Standby node
              <select name="standbyNodeId">
                ${renderSelectOptions(nodeOptions, undefined, {
                  allowBlank: true,
                  blankLabel: "none"
                })}
              </select>
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
      </article>`
    },
    {
      id: "create-backup-form",
      label: copy.tabBackupPolicies,
      panelHtml: `<article class="panel detail-shell">
        <h3>Create backup policy</h3>
        <form method="post" action="/resources/backups/upsert" class="stack">
          <div class="form-grid">
            <label>Policy slug
              <input name="policySlug" required />
            </label>
            <label>Tenant slug
              <select name="tenantSlug" required>
                ${renderSelectOptions(tenantOptions, undefined)}
              </select>
            </label>
            <label>Target node
              <select name="targetNodeId" required>
                ${renderSelectOptions(nodeOptions, undefined)}
              </select>
            </label>
            <label>Schedule
              <input name="schedule" placeholder="0 */6 * * *" required />
            </label>
            <label>Retention days
              <input type="number" name="retentionDays" min="1" required />
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
      </article>`
    }
  ];

  const createPanelHtml = `<div class="stack">
      <article class="panel panel-muted detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.navCreate)}</h3>
            <p class="muted section-description">${escapeHtml(copy.desiredStateEditorsDescription)}</p>
          </div>
        </div>
        ${renderDetailGrid([
          {
            label: copy.records,
            value: escapeHtml(
              interpolateCopy(copy.latestImportCounts, {
                nodes: data.desiredState.spec.nodes.length,
                zones: data.desiredState.spec.zones.length,
                apps: data.desiredState.spec.apps.length,
                databases: data.desiredState.spec.databases.length
              })
            )
          },
          {
            label: copy.backupPolicies,
            value: escapeHtml(String(data.desiredState.spec.backupPolicies.length))
          }
        ])}
      </article>
      <p class="section-note muted">${escapeHtml(copy.dailyOperationsSourceNote)}</p>
      ${renderTabs({
        id: "desired-state-create-tabs",
        tabs: createTabs,
        defaultTabId: "create-tenant-form"
      })}
      <details class="panel panel-muted detail-shell">
        <summary>${escapeHtml(copy.bootstrapInventoryTitle)}</summary>
        <p class="muted section-description">${escapeHtml(copy.bootstrapInventoryDescription)}</p>
        <p class="muted">${escapeHtml(copy.transitionalBootstrapNote)}</p>
        ${renderActionFacts([
          { label: copy.latestImport, value: escapeHtml(desiredStateLatestImportSummary) },
          {
            label: copy.records,
            value: escapeHtml(
              interpolateCopy(copy.latestImportCounts, {
                nodes: data.inventory.nodes.length,
                zones: data.inventory.zones.length,
                apps: data.inventory.apps.length,
                databases: data.inventory.databases.length
              })
            )
          }
        ])}
        <form method="post" action="/actions/inventory-import" class="stack">
          <input
            type="text"
            name="path"
            value="${escapeHtml(data.inventory.latestImport?.sourcePath ?? config.inventory.importPath)}"
          />
          <button
            class="secondary"
            type="submit"
            data-confirm="${escapeHtml(
              "Import the bootstrap YAML into PostgreSQL desired state? Existing desired-state rows may be refreshed from the transitional source."
            )}"
          >${escapeHtml(copy.actionsImportInventory)}</button>
        </form>
      </details>
    </div>`;

  const tabs: TabItem[] = [
    {
      id: "desired-state-create",
      label: copy.tabCreate,
      badge: "+",
      href: buildDashboardViewUrl("desired-state", "desired-state-create"),
      panelHtml: createPanelHtml
    },
    {
      id: "desired-state-tenants",
      label: copy.tabTenants,
      badge: String(data.desiredState.spec.tenants.length),
      href: buildDashboardViewUrl("desired-state", "desired-state-tenants"),
      panelHtml: `<div class="stack">
        ${renderDataTable({
          id: "desired-state-tenants-table",
          heading: copy.desiredStateInventoryTitle,
          description: copy.desiredStateInventoryDescription,
          columns: [
            { label: copy.tenantColSlug, className: "mono" },
            { label: copy.tenantColDisplayName }
          ],
          rows: tenantTableRows,
          emptyMessage: copy.noTenants,
          filterPlaceholder: copy.dataFilterPlaceholder,
          rowsPerPageLabel: copy.rowsPerPage,
          showingLabel: copy.showing,
          ofLabel: copy.of,
          recordsLabel: copy.records,
          defaultPageSize: 10
        })}
        <div class="grid grid-two">
          ${tenantDetailPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noTenants)}</p></article>`}
          ${tenantEditorPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noTenants)}</p></article>`}
        </div>
      </div>`
    },
    {
      id: "desired-state-nodes",
      label: copy.tabNodes,
      badge: String(data.desiredState.spec.nodes.length),
      href: buildDashboardViewUrl("desired-state", "desired-state-nodes"),
      panelHtml: `<div class="stack">
        ${renderDataTable({
          id: "desired-state-nodes-table",
          heading: copy.desiredStateInventoryTitle,
          description: copy.desiredStateInventoryDescription,
          columns: [
            { label: copy.nodeColNode, className: "mono" },
            { label: copy.nodeColHostname },
            { label: copy.nodeSpecColPublicIpv4, className: "mono" },
            { label: copy.nodeSpecColWireguard, className: "mono" }
          ],
          rows: nodeTableRows,
          emptyMessage: copy.noNodes,
          filterPlaceholder: copy.dataFilterPlaceholder,
          rowsPerPageLabel: copy.rowsPerPage,
          showingLabel: copy.showing,
          ofLabel: copy.of,
          recordsLabel: copy.records,
          defaultPageSize: 10
        })}
        <div class="grid grid-two">
          ${nodeDetailPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noNodes)}</p></article>`}
          ${nodeEditorPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noNodes)}</p></article>`}
        </div>
      </div>`
    },
    {
      id: "desired-state-zones",
      label: copy.tabZones,
      badge: String(data.desiredState.spec.zones.length),
      href: buildDashboardViewUrl("desired-state", "desired-state-zones"),
      panelHtml: `<div class="stack">
        ${renderDataTable({
          id: "desired-state-zones-table",
          heading: copy.desiredStateInventoryTitle,
          description: copy.desiredStateInventoryDescription,
          columns: [
            { label: copy.zoneColZone, className: "mono" },
            { label: copy.zoneColTenant },
            { label: copy.zoneColPrimaryNode, className: "mono" },
            { label: copy.zoneColRecordCount }
          ],
          rows: zoneTableRows,
          emptyMessage: copy.noZones,
          filterPlaceholder: copy.dataFilterPlaceholder,
          rowsPerPageLabel: copy.rowsPerPage,
          showingLabel: copy.showing,
          ofLabel: copy.of,
          recordsLabel: copy.records,
          defaultPageSize: 10
        })}
        <div class="grid grid-two">
          ${zoneDetailPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noZones)}</p></article>`}
          ${zoneEditorPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noZones)}</p></article>`}
        </div>
      </div>`
    },
    {
      id: "desired-state-apps",
      label: copy.tabApps,
      badge: String(data.desiredState.spec.apps.length),
      href: buildDashboardViewUrl("desired-state", "desired-state-apps"),
      panelHtml: `<div class="stack">
        ${renderDataTable({
          id: "desired-state-apps-table",
          heading: copy.desiredStateInventoryTitle,
          description: copy.desiredStateInventoryDescription,
          columns: [
            { label: copy.appColSlug, className: "mono" },
            { label: copy.appColTenant },
            { label: copy.appColDomain },
            { label: copy.appColMode },
            { label: copy.appColNodes, className: "mono" }
          ],
          rows: appTableRows,
          emptyMessage: copy.noApps,
          filterPlaceholder: copy.dataFilterPlaceholder,
          rowsPerPageLabel: copy.rowsPerPage,
          showingLabel: copy.showing,
          ofLabel: copy.of,
          recordsLabel: copy.records,
          defaultPageSize: 10
        })}
        <div class="grid grid-two">
          ${appDetailPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noApps)}</p></article>`}
          ${appEditorPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noApps)}</p></article>`}
        </div>
      </div>`
    },
    {
      id: "desired-state-databases",
      label: copy.tabDatabases,
      badge: String(data.desiredState.spec.databases.length),
      href: buildDashboardViewUrl("desired-state", "desired-state-databases"),
      panelHtml: `<div class="stack">
        ${renderDataTable({
          id: "desired-state-databases-table",
          heading: copy.desiredStateInventoryTitle,
          description: copy.desiredStateInventoryDescription,
          columns: [
            { label: copy.databaseColApp, className: "mono" },
            { label: copy.databaseColEngine },
            { label: copy.databaseColDatabase, className: "mono" },
            { label: copy.databaseColUser, className: "mono" },
            { label: copy.databaseColNodes, className: "mono" },
            { label: copy.databaseColMigration }
          ],
          rows: databaseTableRows,
          emptyMessage: copy.noDatabases,
          filterPlaceholder: copy.dataFilterPlaceholder,
          rowsPerPageLabel: copy.rowsPerPage,
          showingLabel: copy.showing,
          ofLabel: copy.of,
          recordsLabel: copy.records,
          defaultPageSize: 10
        })}
        <div class="grid grid-two">
          ${databaseDetailPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noDatabases)}</p></article>`}
          ${databaseEditorPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noDatabases)}</p></article>`}
        </div>
      </div>`
    },
    {
      id: "desired-state-backups",
      label: copy.tabBackupPolicies,
      badge: String(data.desiredState.spec.backupPolicies.length),
      href: buildDashboardViewUrl("desired-state", "desired-state-backups"),
      panelHtml: `<div class="stack">
        ${renderDataTable({
          id: "desired-state-backups-table",
          heading: copy.desiredStateInventoryTitle,
          description: copy.desiredStateInventoryDescription,
          columns: [
            { label: copy.backupPolicyColSlug, className: "mono" },
            { label: copy.backupPolicyColTenant },
            { label: copy.backupPolicyColTargetNode, className: "mono" },
            { label: copy.backupPolicyColSchedule, className: "mono" },
            { label: copy.backupPolicyColRetention }
          ],
          rows: backupTableRows,
          emptyMessage: copy.noBackupPolicies,
          filterPlaceholder: copy.dataFilterPlaceholder,
          rowsPerPageLabel: copy.rowsPerPage,
          showingLabel: copy.showing,
          ofLabel: copy.of,
          recordsLabel: copy.records,
          defaultPageSize: 10
        })}
        <div class="grid grid-two">
          ${backupDetailPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noBackupPolicies)}</p></article>`}
          ${backupEditorPanel || `<article class="panel"><p class="empty">${escapeHtml(copy.noBackupPolicies)}</p></article>`}
        </div>
      </div>`
    }
  ];

  return `<section id="section-desired-state" class="panel section-panel">
    ${renderTabs({
      id: "desired-state-tabs",
      tabs,
      defaultTabId
    })}
  </section>`;
}

function renderDashboard(
  data: DashboardData,
  locale: WebLocale,
  currentPath: string,
  view: DashboardView,
  desiredStateTab: DesiredStateTabId,
  focus: string | undefined,
  notice?: PanelNotice
): string {
  const copy = copyByLocale[locale];
  const selectedNodeHealth =
    view === "node-health"
      ? data.nodeHealth.find((node) => node.nodeId === focus) ?? data.nodeHealth[0]
      : undefined;
  const nodeHealthRows: DataTableRow[] = data.nodeHealth.map((node) => ({
    cells: [
      renderFocusLink(
        node.nodeId,
        buildDashboardViewUrl("node-health", undefined, node.nodeId),
        selectedNodeHealth?.nodeId === node.nodeId,
        copy.selectedStateLabel
      ),
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
      node.latestJobSummary ?? "",
      String(node.driftedResourceCount ?? 0)
    ].join(" ")
  }));

  const selectedDrift =
    view === "resource-drift"
      ? data.drift.find((entry) => entry.resourceKey === focus) ?? data.drift[0]
      : undefined;
  const driftRows: DataTableRow[] = data.drift.map((entry) => ({
    cells: [
      escapeHtml(entry.resourceKind),
      renderFocusLink(
        entry.resourceKey,
        buildDashboardViewUrl("resource-drift", undefined, entry.resourceKey),
        selectedDrift?.resourceKey === entry.resourceKey,
        copy.selectedStateLabel
      ),
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

  const selectedJob =
    view === "job-history"
      ? data.jobHistory.find((job) => job.jobId === focus) ?? data.jobHistory[0]
      : undefined;
  const jobRows: DataTableRow[] = data.jobHistory.map((job) => ({
    cells: [
      renderFocusLink(
        job.jobId,
        buildDashboardViewUrl("job-history", undefined, job.jobId),
        selectedJob?.jobId === job.jobId,
        copy.selectedStateLabel
      ),
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
      job.summary ?? "",
      job.resourceKey ?? ""
    ].join(" ")
  }));

  const selectedBackupViewRun =
    view === "backups"
      ? data.backups.latestRuns.find(
          (run) => run.policySlug === focus || run.runId === focus
        ) ?? data.backups.latestRuns[0]
      : undefined;
  const backupRows: DataTableRow[] = data.backups.latestRuns.map((run) => ({
    cells: [
      renderFocusLink(
        run.policySlug,
        buildDashboardViewUrl("backups", undefined, run.policySlug),
        selectedBackupViewRun?.policySlug === run.policySlug,
        copy.selectedStateLabel
      ),
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

  const now = Date.now();
  const staleThresholdMs = 15 * 60 * 1000;
  const staleNodeCount = data.nodeHealth.filter((node) => {
    const lastSeenAt = node.lastSeenAt ? Date.parse(node.lastSeenAt) : Number.NaN;
    return Number.isFinite(lastSeenAt) && now - lastSeenAt > staleThresholdMs;
  }).length;
  const pendingNodeCount = data.nodeHealth.filter((node) => node.pendingJobCount > 0).length;
  const failingNodeCount = data.nodeHealth.filter((node) => node.latestJobStatus === "failed").length;
  const healthyNodeCount = data.nodeHealth.filter((node) => {
    const lastSeenAt = node.lastSeenAt ? Date.parse(node.lastSeenAt) : Number.NaN;
    const stale = Number.isFinite(lastSeenAt) && now - lastSeenAt > staleThresholdMs;
    return !stale && node.pendingJobCount === 0 && node.latestJobStatus !== "failed";
  }).length;
  const driftPendingCount = data.drift.filter((entry) => entry.driftStatus === "pending").length;
  const driftOutOfSyncCount = data.drift.filter((entry) => entry.driftStatus === "out_of_sync").length;
  const driftMissingSecretCount = data.drift.filter(
    (entry) => entry.driftStatus === "missing_secret"
  ).length;
  const queuedJobCount = data.jobHistory.filter((job) => !job.status).length;
  const appliedJobCount = data.jobHistory.filter((job) => job.status === "applied").length;
  const failedJobCount = data.jobHistory.filter((job) => job.status === "failed").length;
  const backupSucceededCount = data.backups.latestRuns.filter((run) => run.status === "succeeded").length;
  const backupFailedCount = data.backups.latestRuns.filter((run) => run.status === "failed").length;
  const backupRunningCount = data.backups.latestRuns.filter((run) => run.status === "running").length;
  const backupCoverageCount = data.backups.policies.length;
  const dnsSyncJobCount = data.jobHistory.filter((job) => job.kind === "dns.sync").length;
  const proxyRenderJobCount = data.jobHistory.filter((job) => job.kind === "proxy.render").length;
  const databaseReconcileJobCount = data.jobHistory.filter(
    (job) => job.kind === "postgres.reconcile" || job.kind === "mariadb.reconcile"
  ).length;
  const backupTriggerJobCount = data.jobHistory.filter((job) => job.kind === "backup.trigger").length;

  const selectedNodeDrift = selectedNodeHealth
    ? data.drift.filter((entry) => entry.nodeId === selectedNodeHealth.nodeId)
    : [];
  const selectedNodeJobs = selectedNodeHealth
    ? data.jobHistory.filter((job) => job.nodeId === selectedNodeHealth.nodeId).slice(0, 6)
    : [];
  const selectedNodeAuditEvents = selectedNodeHealth
    ? data.auditEvents
        .filter(
          (event) =>
            event.entityId === selectedNodeHealth.nodeId ||
            event.actorId === selectedNodeHealth.nodeId ||
            payloadContainsValue(event.payload, selectedNodeHealth.nodeId)
        )
        .slice(0, 8)
    : [];
  const selectedJobAuditEvents = selectedJob
    ? data.auditEvents
        .filter(
          (event) =>
            event.entityId === selectedJob.jobId ||
            payloadContainsValue(event.payload, selectedJob.jobId) ||
            (selectedJob.resourceKey
              ? payloadContainsValue(event.payload, selectedJob.resourceKey)
              : false)
        )
        .slice(0, 8)
    : [];
  const selectedJobRelatedJobs = selectedJob
    ? findRelatedJobs(
        data.jobHistory,
        {
          resourceKeys: [selectedJob.resourceKey ?? "", selectedJob.jobId],
          nodeId: selectedJob.nodeId,
          needles: [selectedJob.resourceKey ?? "", selectedJob.nodeId]
        },
        8
      ).filter((job) => job.jobId !== selectedJob.jobId)
    : [];
  const selectedJobResourceTarget = selectedJob?.resourceKey
    ? resolveResourceKeyTarget(selectedJob.resourceKey)
    : {};
  const selectedDriftReference = selectedDrift
    ? parseDriftResourceReference(selectedDrift)
    : {};
  const selectedDriftJobs = selectedDrift
    ? findRelatedJobs(
        data.jobHistory,
        {
          resourceKeys: [selectedDrift.resourceKey, selectedDrift.latestJobId ?? ""],
          needles: [selectedDrift.resourceKey, selectedDrift.nodeId]
        },
        6
      )
    : [];
  const selectedDriftAuditEvents = selectedDrift
    ? findRelatedAuditEvents(
        data.auditEvents,
        [selectedDrift.resourceKey, selectedDrift.nodeId, selectedDrift.latestJobId ?? ""],
        8
      )
    : [];
  const selectedBackupPolicySummary = selectedBackupViewRun
    ? data.backups.policies.find((policy) => policy.policySlug === selectedBackupViewRun.policySlug)
    : view === "backups"
      ? data.backups.policies.find((policy) => policy.policySlug === focus) ?? data.backups.policies[0]
      : undefined;
  const selectedBackupAuditEvents = selectedBackupViewRun || selectedBackupPolicySummary
    ? findRelatedAuditEvents(
        data.auditEvents,
        [
          selectedBackupViewRun?.runId ?? "",
          selectedBackupViewRun?.policySlug ?? selectedBackupPolicySummary?.policySlug ?? "",
          selectedBackupViewRun?.nodeId ?? selectedBackupPolicySummary?.targetNodeId ?? "",
          selectedBackupPolicySummary?.storageLocation ?? ""
        ],
        8
      )
    : [];
  const selectedBackupPolicyRuns = selectedBackupPolicySummary
    ? data.backups.latestRuns.filter((run) => run.policySlug === selectedBackupPolicySummary.policySlug)
    : [];
  const selectedBackupPolicyLatestFailedRun = selectedBackupPolicyRuns.find(
    (run) => run.status === "failed"
  );
  const selectedBackupPolicyTenantApps = selectedBackupPolicySummary
    ? data.desiredState.spec.apps.filter((app) => app.tenantSlug === selectedBackupPolicySummary.tenantSlug)
    : [];
  const selectedBackupPolicyTenantZones = selectedBackupPolicySummary
    ? data.desiredState.spec.zones.filter(
        (zone) => zone.tenantSlug === selectedBackupPolicySummary.tenantSlug
      )
    : [];
  const selectedBackupPolicyTenantDatabases = selectedBackupPolicySummary
    ? data.desiredState.spec.databases.filter((database) => {
        const app = data.desiredState.spec.apps.find((entry) => entry.slug === database.appSlug);
        return app?.tenantSlug === selectedBackupPolicySummary.tenantSlug;
      })
    : [];
  const selectedBackupPolicyLatestSuccessRun = selectedBackupPolicyRuns.find(
    (run) => run.status === "succeeded"
  );
  const selectedBackupPolicyTargetHealth = selectedBackupPolicySummary
    ? data.nodeHealth.find((entry) => entry.nodeId === selectedBackupPolicySummary.targetNodeId)
    : undefined;
  const failedJobFocus = data.jobHistory.filter((job) => job.status === "failed").slice(0, 6);
  const jobNodeGroups = groupItemsBy(data.jobHistory, (job) => job.nodeId).slice(0, 6);
  const jobKindGroups = groupItemsBy(data.jobHistory, (job) => job.kind).slice(0, 6);
  const jobStatusGroups = groupItemsBy(data.jobHistory, (job) => job.status ?? "queued").slice(0, 4);
  const jobResourceGroups = groupItemsBy(
    data.jobHistory.filter((job) => Boolean(job.resourceKey)),
    (job) => job.resourceKey ?? "unscoped"
  ).slice(0, 6);
  const auditEventGroups = groupItemsBy(data.auditEvents, (event) => event.eventType).slice(0, 6);
  const auditActorGroups = groupItemsBy(
    data.auditEvents,
    (event) => `${event.actorType}:${event.actorId ?? "unknown"}`
  ).slice(0, 6);
  const auditEntityGroups = groupItemsBy(
    data.auditEvents.filter((event) => Boolean(event.entityType || event.entityId)),
    (event) => event.entityType && event.entityId ? `${event.entityType}:${event.entityId}` : event.entityType ?? event.entityId ?? "unknown"
  ).slice(0, 6);
  const driftNodeGroups = groupItemsBy(data.drift, (entry) => entry.nodeId).slice(0, 6);
  const driftKindGroups = groupItemsBy(data.drift, (entry) => entry.resourceKind).slice(0, 6);
  const backupLatestSuccessRun = data.backups.latestRuns.find((run) => run.status === "succeeded");
  const backupLatestFailedRun = data.backups.latestRuns.find((run) => run.status === "failed");
  const backupCoveredTenantCount = new Set(
    data.backups.policies.map((policy) => policy.tenantSlug)
  ).size;
  const backupTargetNodeCount = new Set(
    data.backups.policies.map((policy) => policy.targetNodeId)
  ).size;
  const backupNodeGroups = groupItemsBy(data.backups.latestRuns, (run) => run.nodeId).slice(0, 6);
  const backupStatusGroups = groupItemsBy(data.backups.latestRuns, (run) => run.status).slice(0, 4);
  const backupTenantGroups = groupItemsBy(data.backups.policies, (policy) => policy.tenantSlug).slice(0, 6);
  const backupPolicyGroups = groupItemsBy(data.backups.latestRuns, (run) => run.policySlug).slice(0, 6);
  const backupPolicyPreviewItems = data.backups.policies.slice(0, 6).map((policy) => ({
    title: `<a class="detail-link" href="${escapeHtml(
      buildDashboardViewUrl("backups", undefined, policy.policySlug)
    )}">${escapeHtml(policy.policySlug)}</a>`,
    meta: escapeHtml([policy.tenantSlug, policy.targetNodeId].join(" · ")),
    summary: escapeHtml(`${policy.schedule} · ${policy.retentionDays}d retention`),
    tone: "default" as const
  }));
  const backupFailureItems = data.backups.latestRuns
    .filter((run) => run.status === "failed")
    .slice(0, 6)
    .map((run) => ({
      title: `<a class="detail-link" href="${escapeHtml(
        buildDashboardViewUrl("backups", undefined, run.runId)
      )}">${escapeHtml(run.runId)}</a>`,
      meta: escapeHtml([run.policySlug, run.nodeId].join(" · ")),
      summary: escapeHtml(run.summary),
      tone: "danger" as const
    }));

  const actionBar = `<div class="action-grid">
      <article class="action-card action-card-strong">
        <span class="action-eyebrow">Planner</span>
        <h3>${escapeHtml(copy.actionsRunReconciliation)}</h3>
        <p class="muted">${escapeHtml(copy.actionPlanDescription)}</p>
        <div class="action-card-context">
          <span class="action-card-context-title">${escapeHtml(copy.latestReconciliation)}</span>
          ${latestReconciliationSummary}
        </div>
        <form method="post" action="/actions/reconcile-run">
          <button
            type="submit"
            data-confirm="${escapeHtml(
              "Run a new reconciliation cycle? Missing work across DNS, proxy and databases may be queued."
            )}"
          >${escapeHtml(copy.actionsRunReconciliation)}</button>
        </form>
      </article>
      <article class="action-card action-card-muted">
        <span class="action-eyebrow">${escapeHtml(copy.bootstrapInventoryTitle)}</span>
        <h3>${escapeHtml(copy.actionsDownloadYaml)}</h3>
        <p class="muted">${escapeHtml(copy.actionExportDescription)}</p>
        <div class="action-card-context">
          <span class="action-card-context-title">${escapeHtml(copy.usersAndScope)}</span>
          ${renderActionFacts(
            [
              {
                label: copy.emailLabel,
                value: `<strong>${escapeHtml(data.currentUser.displayName)}</strong> &lt;${escapeHtml(
                  data.currentUser.email
                )}&gt;`
              },
              {
                label: copy.globalRoles,
                value: escapeHtml(formatList(data.currentUser.globalRoles, copy.none))
              },
              {
                label: copy.tenantMemberships,
                value: escapeHtml(tenantMemberships)
              }
            ],
            { className: "action-card-facts-wide-labels" }
          )}
        </div>
        <p class="action-card-note">${escapeHtml(copy.dailyOperationsSourceNote)}</p>
        <a class="button-link secondary" href="/inventory/export">${escapeHtml(
          copy.actionsDownloadYaml
        )}</a>
      </article>
    </div>`;

  const topbarUserPanelHtml = `<div class="profile-sheet">
    <div class="profile-sheet-head">
      <span class="profile-avatar">${escapeHtml(getInitials(data.currentUser.displayName))}</span>
      <div class="profile-sheet-copy">
        <strong class="profile-name">${escapeHtml(data.currentUser.displayName)}</strong>
        <span class="profile-meta">${escapeHtml(data.currentUser.email)}</span>
      </div>
    </div>
    ${renderProfileFacts([
      {
        label: copy.globalRoles,
        value: escapeHtml(formatList(data.currentUser.globalRoles, copy.none))
      },
      {
        label: copy.tenantMemberships,
        value: escapeHtml(tenantMemberships)
      }
    ])}
    <div class="profile-sheet-footer">
      <form method="post" action="/auth/logout">
        <button
          class="danger profile-sheet-signout"
          type="submit"
          aria-label="${escapeHtml(copy.signOutLabel)}"
          title="${escapeHtml(copy.signOutLabel)}"
        >
          ${renderSignOutIconSvg()}
          <span>${escapeHtml(copy.signOutLabel)}</span>
        </button>
      </form>
    </div>
  </div>`;

  const topbarActionsHtml = `<div class="locale-switch" role="group" aria-label="${escapeHtml(copy.languageLabel)}">
    <form method="post" action="/preferences/locale" class="inline-form">
      <input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}" />
      <input type="hidden" name="locale" value="es" />
      <button
        type="submit"
        class="locale-button${locale === "es" ? " active" : ""}"
        aria-pressed="${locale === "es" ? "true" : "false"}"
      >ES</button>
    </form>
    <form method="post" action="/preferences/locale" class="inline-form">
      <input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}" />
      <input type="hidden" name="locale" value="en" />
      <button
        type="submit"
        class="locale-button${locale === "en" ? " active" : ""}"
        aria-pressed="${locale === "en" ? "true" : "false"}"
      >EN</button>
    </form>
  </div>
  <div class="topbar-disclosure" data-topbar-disclosure>
    <button
      type="button"
      class="secondary icon-button"
      data-topbar-toggle
      aria-label="${escapeHtml(data.currentUser.displayName)}"
      aria-expanded="false"
      title="${escapeHtml(data.currentUser.displayName)}"
    >
      ${renderUserIconSvg()}
      <span class="sr-only">${escapeHtml(data.currentUser.displayName)}</span>
    </button>
    <aside class="topbar-panel" data-topbar-panel hidden>
      ${topbarUserPanelHtml}
    </aside>
  </div>`;

  const sidebarGroups: AdminNavGroup[] = [
    {
      id: "control-plane",
      label: copy.navControlPlane,
      items: [
        {
          id: "overview",
          label: copy.navOverview,
          href: buildDashboardViewUrl("overview"),
          keywords: [
            copy.overviewTitle,
            copy.managedNodes,
            copy.pendingJobs,
            copy.usersAndScope,
            copy.inventoryImport,
            copy.latestReconciliation
          ],
          active: view === "overview"
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
          href: buildDashboardViewUrl("node-health"),
          badge: String(data.nodeHealth.length),
          active: view === "node-health"
        },
        {
          id: "resource-drift",
          label: copy.navDrift,
          href: buildDashboardViewUrl("resource-drift"),
          badge: String(data.overview.driftedResourceCount),
          active: view === "resource-drift"
        },
        {
          id: "job-history",
          label: copy.navJobs,
          href: buildDashboardViewUrl("job-history"),
          badge: String(data.jobHistory.length),
          active: view === "job-history"
        },
        {
          id: "backups",
          label: copy.navBackups,
          href: buildDashboardViewUrl("backups"),
          badge: String(data.backups.latestRuns.length),
          active: view === "backups"
        }
      ]
    },
    {
      id: "desired-state",
      label: copy.navResources,
      items: [
        {
          id: "create",
          label: copy.navCreate,
          href: buildDashboardViewUrl("desired-state", "desired-state-create"),
          active: view === "desired-state" && desiredStateTab === "desired-state-create"
        },
        {
          id: "tenants",
          label: copy.navTenants,
          href: buildDashboardViewUrl("desired-state", "desired-state-tenants"),
          badge: String(data.desiredState.spec.tenants.length),
          active: view === "desired-state" && desiredStateTab === "desired-state-tenants"
        },
        {
          id: "nodes",
          label: copy.navNodes,
          href: buildDashboardViewUrl("desired-state", "desired-state-nodes"),
          badge: String(data.desiredState.spec.nodes.length),
          active: view === "desired-state" && desiredStateTab === "desired-state-nodes"
        },
        {
          id: "zones",
          label: copy.navZones,
          href: buildDashboardViewUrl("desired-state", "desired-state-zones"),
          badge: String(data.desiredState.spec.zones.length),
          active: view === "desired-state" && desiredStateTab === "desired-state-zones"
        },
        {
          id: "apps",
          label: copy.navApps,
          href: buildDashboardViewUrl("desired-state", "desired-state-apps"),
          badge: String(data.desiredState.spec.apps.length),
          active: view === "desired-state" && desiredStateTab === "desired-state-apps"
        },
        {
          id: "databases",
          label: copy.navDatabases,
          href: buildDashboardViewUrl("desired-state", "desired-state-databases"),
          badge: String(data.desiredState.spec.databases.length),
          active: view === "desired-state" && desiredStateTab === "desired-state-databases"
        },
        {
          id: "backup-policies",
          label: copy.navBackupPolicies,
          href: buildDashboardViewUrl("desired-state", "desired-state-backups"),
          badge: String(data.desiredState.spec.backupPolicies.length),
          active: view === "desired-state" && desiredStateTab === "desired-state-backups"
        }
      ]
    }
  ];

  const overviewSection = `<section id="section-overview" class="panel section-panel">
    <div class="section-head">
      <div>
        <h2>${escapeHtml(copy.overviewTitle)}</h2>
        <p class="muted section-description">${escapeHtml(copy.overviewDescription)}</p>
      </div>
    </div>
    ${renderStats(data.overview, copy, locale)}
    <div class="stack">
      <div>
        <h3>${escapeHtml(copy.operationalSignalsTitle)}</h3>
      </div>
      ${renderSignalStrip([
        { label: copy.healthyNodes, value: String(healthyNodeCount), tone: healthyNodeCount > 0 ? "success" : "muted" },
        { label: copy.staleNodes, value: String(staleNodeCount), tone: staleNodeCount > 0 ? "danger" : "success" },
        { label: copy.driftMissingSecrets, value: String(driftMissingSecretCount), tone: driftMissingSecretCount > 0 ? "danger" : "success" },
        { label: copy.failedBackups, value: String(backupFailedCount), tone: backupFailedCount > 0 ? "danger" : "success" }
      ])}
    </div>
    ${actionBar}
  </section>`;

  const nodeDiagnosticsPanel = selectedNodeHealth
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.nodeDiagnosticsTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.nodeDiagnosticsDescription)}</p>
          </div>
          <a class="button-link secondary" href="${escapeHtml(
            buildDashboardViewUrl("desired-state", "desired-state-nodes", selectedNodeHealth.nodeId)
          )}">${escapeHtml(copy.navNodes)}</a>
        </div>
        ${renderDetailGrid([
          { label: copy.nodeColNode, value: `<span class="mono">${escapeHtml(selectedNodeHealth.nodeId)}</span>` },
          { label: copy.nodeColHostname, value: escapeHtml(selectedNodeHealth.hostname) },
          {
            label: copy.nodeColVersion,
            value: selectedNodeHealth.currentVersion
              ? renderPill(selectedNodeHealth.currentVersion, "muted")
              : "-"
          },
          {
            label: copy.nodeColPending,
            value: renderPill(
              String(selectedNodeHealth.pendingJobCount),
              selectedNodeHealth.pendingJobCount > 0 ? "danger" : "success"
            )
          },
          {
            label: copy.resourcesWithDrift,
            value: renderPill(
              String(selectedNodeDrift.length),
              selectedNodeDrift.length > 0 ? "danger" : "success"
            )
          },
          {
            label: copy.zoneColRecordCount,
            value: escapeHtml(String(selectedNodeHealth.primaryZoneCount ?? 0))
          },
          {
            label: copy.navApps,
            value: escapeHtml(String(selectedNodeHealth.primaryAppCount ?? 0))
          },
          {
            label: copy.backupPolicies,
            value: escapeHtml(String(selectedNodeHealth.backupPolicyCount ?? 0))
          },
          {
            label: copy.nodeColLastSeen,
            value: escapeHtml(formatDate(selectedNodeHealth.lastSeenAt, locale))
          }
        ])}
      </article>`
    : `<article class="panel"><p class="empty">${escapeHtml(copy.noNodes)}</p></article>`;

  const relatedNodeJobsPanel = `<article class="panel detail-shell">
    <div class="section-head">
      <div>
        <h3>${escapeHtml(copy.relatedJobsTitle)}</h3>
      </div>
    </div>
    ${renderFeedList(
      selectedNodeJobs.map((job) => ({
        title: escapeHtml(job.kind),
        meta: escapeHtml(
          [
            job.jobId,
            job.status ?? "queued",
            formatDate(job.createdAt, locale)
          ].join(" · ")
        ),
        summary: escapeHtml(job.summary ?? job.dispatchReason ?? "-"),
        tone:
          job.status === "failed"
            ? "danger"
            : job.status === "applied"
              ? "success"
              : "default"
      })),
      copy.noRelatedRecords
    )}
  </article>`;

  const relatedNodeDriftPanel = `<article class="panel detail-shell">
    <div class="section-head">
      <div>
        <h3>${escapeHtml(copy.relatedDriftTitle)}</h3>
      </div>
    </div>
    ${renderFeedList(
      selectedNodeDrift.map((entry) => ({
        title: escapeHtml(`${entry.resourceKind} · ${entry.resourceKey}`),
        meta: escapeHtml(entry.driftStatus),
        summary: escapeHtml(entry.latestSummary ?? "-"),
        tone: entry.driftStatus === "in_sync" ? "success" : "danger"
      })),
      copy.noRelatedRecords
    )}
  </article>`;

  const selectedJobPanel = selectedJob
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.payloadTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.jobHistoryDescription)}</p>
          </div>
          <a class="button-link secondary" href="${escapeHtml(
            buildDashboardViewUrl("node-health", undefined, selectedJob.nodeId)
          )}">${escapeHtml(copy.nodeColNode)}</a>
        </div>
        ${renderDetailGrid([
          { label: copy.jobColJob, value: `<span class="mono">${escapeHtml(selectedJob.jobId)}</span>` },
          { label: copy.jobColKind, value: escapeHtml(selectedJob.kind) },
          {
            label: copy.jobColNode,
            value: `<a class="detail-link mono" href="${escapeHtml(
              buildDashboardViewUrl("node-health", undefined, selectedJob.nodeId)
            )}">${escapeHtml(selectedJob.nodeId)}</a>`
          },
          {
            label: copy.jobColStatus,
            value: selectedJob.status
              ? renderPill(
                  selectedJob.status,
                  selectedJob.status === "applied"
                    ? "success"
                    : selectedJob.status === "failed"
                      ? "danger"
                      : "muted"
                )
              : renderPill("queued", "muted")
          },
          { label: copy.jobColReason, value: escapeHtml(selectedJob.dispatchReason ?? "-") },
          { label: copy.jobColCreated, value: escapeHtml(formatDate(selectedJob.createdAt, locale)) },
          {
            label: copy.linkedResource,
            value: selectedJob.resourceKey
              ? `<span class="mono">${escapeHtml(selectedJob.resourceKey)}</span>`
              : escapeHtml(copy.none)
          },
          {
            label: copy.latestCompleted,
            value: escapeHtml(
              selectedJob.completedAt ? formatDate(selectedJob.completedAt, locale) : copy.none
            )
          }
        ])}
        <div class="grid grid-two">
          <article class="panel detail-shell panel-nested">
            <h4>${escapeHtml(copy.payloadTitle)}</h4>
            ${renderCodeBlock(selectedJob.payload)}
          </article>
          <article class="panel detail-shell panel-nested">
            <h4>${escapeHtml(copy.linkedOperationsTitle)}</h4>
            ${renderActionFacts([
              {
                label: copy.openDesiredState,
                value: selectedJobResourceTarget.desiredStateHref
                  ? `<a class="detail-link" href="${escapeHtml(
                      selectedJobResourceTarget.desiredStateHref
                    )}">${escapeHtml(copy.openDesiredState)}</a>`
                  : escapeHtml(copy.none)
              },
              {
                label: copy.openDriftView,
                value: selectedJobResourceTarget.driftHref
                  ? `<a class="detail-link" href="${escapeHtml(
                      selectedJobResourceTarget.driftHref
                    )}">${escapeHtml(copy.openDriftView)}</a>`
                  : escapeHtml(copy.none)
              },
              {
                label: copy.jobColSummary,
                value: escapeHtml(selectedJob.summary ?? "-")
              },
              {
                label: copy.openNodeHealth,
                value: `<a class="detail-link" href="${escapeHtml(
                  buildDashboardViewUrl("node-health", undefined, selectedJob.nodeId)
                )}">${escapeHtml(copy.openNodeHealth)}</a>`
              }
            ])}
            ${selectedJob.details ? renderCodeBlock(selectedJob.details) : `<p class="muted">${escapeHtml(copy.none)}</p>`}
          </article>
        </div>
      </article>`
    : `<article class="panel"><p class="empty">${escapeHtml(copy.noJobs)}</p></article>`;

  const selectedDriftPanel = selectedDrift
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.driftDiagnosticsTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.driftDiagnosticsDescription)}</p>
          </div>
        </div>
        ${renderDetailGrid([
          { label: copy.driftColKind, value: escapeHtml(selectedDrift.resourceKind) },
          {
            label: copy.driftColResource,
            value: `<span class="mono">${escapeHtml(selectedDrift.resourceKey)}</span>`
          },
          {
            label: copy.driftColNode,
            value: `<span class="mono">${escapeHtml(selectedDrift.nodeId)}</span>`
          },
          {
            label: copy.driftColDrift,
            value: renderPill(
              selectedDrift.driftStatus,
              selectedDrift.driftStatus === "in_sync"
                ? "success"
                : selectedDrift.driftStatus === "pending"
                  ? "muted"
                  : "danger"
            )
          },
          {
            label: copy.driftColLatestStatus,
            value: selectedDrift.latestJobStatus
              ? renderPill(
                  selectedDrift.latestJobStatus,
                  selectedDrift.latestJobStatus === "applied"
                    ? "success"
                    : selectedDrift.latestJobStatus === "failed"
                      ? "danger"
                      : "muted"
                )
              : "-"
          },
          { label: copy.jobColSummary, value: escapeHtml(selectedDrift.latestSummary ?? "-") },
          {
            label: copy.jobColJob,
            value: selectedDrift.latestJobId
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedDrift.latestJobId)
                )}">${escapeHtml(selectedDrift.latestJobId)}</a>`
              : "-"
          },
          {
            label: copy.dispatchRecommended,
            value: renderPill(
              selectedDrift.dispatchRecommended ? copy.yesLabel : copy.noLabel,
              selectedDrift.dispatchRecommended ? "danger" : "success"
            )
          },
          {
            label: copy.desiredHash,
            value: selectedDrift.desiredPayloadHash
              ? `<span class="mono">${escapeHtml(selectedDrift.desiredPayloadHash)}</span>`
              : "-"
          },
          {
            label: copy.latestHash,
            value: selectedDrift.latestPayloadHash
              ? `<span class="mono">${escapeHtml(selectedDrift.latestPayloadHash)}</span>`
              : "-"
          }
        ])}
      </article>`
    : `<article class="panel"><p class="empty">${escapeHtml(copy.noDrift)}</p></article>`;

  const selectedDriftActionPanel = selectedDrift
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.detailActionsTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.selectedResourceDescription)}</p>
          </div>
        </div>
        ${renderActionFacts([
          {
            label: copy.linkedResource,
            value: selectedDriftReference.editorHref
              ? `<a class="detail-link" href="${escapeHtml(selectedDriftReference.editorHref)}">${escapeHtml(
                  copy.openDesiredState
                )}</a>`
              : escapeHtml(copy.none)
          },
          {
            label: copy.nodeColNode,
            value: `<a class="detail-link mono" href="${escapeHtml(
              buildDashboardViewUrl("node-health", undefined, selectedDrift.nodeId)
            )}">${escapeHtml(selectedDrift.nodeId)}</a>`
          },
          {
            label: copy.jobColJob,
            value: selectedDrift.latestJobId
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("job-history", undefined, selectedDrift.latestJobId)
                )}">${escapeHtml(selectedDrift.latestJobId)}</a>`
              : escapeHtml(copy.none)
          }
        ])}
        <div class="toolbar">
          ${
            selectedDriftReference.editorHref
              ? `<a class="button-link secondary" href="${escapeHtml(
                  selectedDriftReference.editorHref
                )}">${escapeHtml(copy.openDesiredState)}</a>`
              : ""
          }
          ${
            selectedDriftReference.action
              ? renderActionForm(
                  selectedDriftReference.action.path,
                  selectedDriftReference.action.fields,
                  selectedDriftReference.action.label,
                  {
                    confirmMessage: selectedDriftReference.action.confirmMessage
                  }
                )
              : ""
          }
          <a class="button-link secondary" href="${escapeHtml(
            buildDashboardViewUrl("node-health", undefined, selectedDrift.nodeId)
          )}">${escapeHtml(copy.navNodeHealth)}</a>
        </div>
      </article>`
    : `<article class="panel"><p class="empty">${escapeHtml(copy.noDrift)}</p></article>`;

  const selectedBackupRunPanel = selectedBackupViewRun
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.backupRunTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.backupRunDescription)}</p>
          </div>
        </div>
        ${renderDetailGrid([
          { label: copy.backupColPolicy, value: `<span class="mono">${escapeHtml(selectedBackupViewRun.policySlug)}</span>` },
          { label: copy.backupColNode, value: `<span class="mono">${escapeHtml(selectedBackupViewRun.nodeId)}</span>` },
          {
            label: copy.backupColStatus,
            value: renderPill(
              selectedBackupViewRun.status,
              selectedBackupViewRun.status === "succeeded"
                ? "success"
                : selectedBackupViewRun.status === "failed"
                  ? "danger"
                  : "muted"
            )
          },
          { label: copy.backupColSummary, value: escapeHtml(selectedBackupViewRun.summary) },
          { label: copy.backupColStarted, value: escapeHtml(formatDate(selectedBackupViewRun.startedAt, locale)) },
          {
            label: copy.latestCompleted,
            value: escapeHtml(
              selectedBackupViewRun.completedAt
                ? formatDate(selectedBackupViewRun.completedAt, locale)
                : copy.none
            )
          },
          {
            label: copy.openNodeHealth,
            value: `<a class="detail-link" href="${escapeHtml(
              buildDashboardViewUrl("node-health", undefined, selectedBackupViewRun.nodeId)
            )}">${escapeHtml(copy.openNodeHealth)}</a>`
          }
        ])}
        <div class="toolbar">
          <a class="button-link secondary" href="${escapeHtml(
            buildDashboardViewUrl("desired-state", "desired-state-backups", selectedBackupViewRun.policySlug)
          )}">${escapeHtml(copy.openDesiredState)}</a>
        </div>
      </article>`
    : `<article class="panel"><p class="empty">${escapeHtml(copy.noBackups)}</p></article>`;

  const selectedBackupPolicyPanel = selectedBackupPolicySummary
    ? `<article class="panel detail-shell">
        <div class="section-head">
          <div>
            <h3>${escapeHtml(copy.backupPolicyContextTitle)}</h3>
            <p class="muted section-description">${escapeHtml(copy.backupPolicyContextDescription)}</p>
          </div>
          <a class="button-link secondary" href="${escapeHtml(
            buildDashboardViewUrl("desired-state", "desired-state-backups", selectedBackupPolicySummary.policySlug)
          )}">${escapeHtml(copy.openDesiredState)}</a>
        </div>
        ${renderDetailGrid([
          { label: copy.backupPolicyColSlug, value: `<span class="mono">${escapeHtml(selectedBackupPolicySummary.policySlug)}</span>` },
          { label: copy.backupPolicyColTenant, value: escapeHtml(selectedBackupPolicySummary.tenantSlug) },
          {
            label: copy.backupPolicyColTargetNode,
            value: `<a class="detail-link mono" href="${escapeHtml(
              buildDashboardViewUrl("node-health", undefined, selectedBackupPolicySummary.targetNodeId)
            )}">${escapeHtml(selectedBackupPolicySummary.targetNodeId)}</a>`
          },
          { label: copy.backupPolicyColSchedule, value: `<span class="mono">${escapeHtml(selectedBackupPolicySummary.schedule)}</span>` },
          {
            label: copy.backupPolicyColRetention,
            value: escapeHtml(String(selectedBackupPolicySummary.retentionDays))
          },
          { label: copy.storageLocationLabel, value: `<span class="mono">${escapeHtml(selectedBackupPolicySummary.storageLocation)}</span>` },
          {
            label: copy.resourceSelectorsLabel,
            value: escapeHtml(
              selectedBackupPolicySummary.resourceSelectors.length > 0
                ? selectedBackupPolicySummary.resourceSelectors.join(", ")
                : copy.none
            )
          },
          {
            label: copy.latestSuccessLabel,
            value: selectedBackupPolicyLatestSuccessRun
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("backups", undefined, selectedBackupPolicyLatestSuccessRun.runId)
                )}">${escapeHtml(selectedBackupPolicyLatestSuccessRun.runId)}</a>`
              : renderPill(copy.none, "muted")
          },
          {
            label: copy.latestFailureLabel,
            value: selectedBackupPolicyLatestFailedRun
              ? `<a class="detail-link mono" href="${escapeHtml(
                  buildDashboardViewUrl("backups", undefined, selectedBackupPolicyLatestFailedRun.runId)
                )}">${escapeHtml(selectedBackupPolicyLatestFailedRun.runId)}</a>`
              : renderPill(copy.none, "muted")
          },
          {
            label: copy.nodeHealthTitle,
            value: selectedBackupPolicyTargetHealth?.latestJobStatus
              ? renderPill(
                  selectedBackupPolicyTargetHealth.latestJobStatus,
                  selectedBackupPolicyTargetHealth.latestJobStatus === "applied"
                    ? "success"
                    : selectedBackupPolicyTargetHealth.latestJobStatus === "failed"
                      ? "danger"
                      : "muted"
                )
              : renderPill(copy.none, "muted")
          }
        ])}
        ${renderRelatedPanel(
          copy.relatedResourcesTitle,
          copy.relatedResourcesDescription,
          [
            ...selectedBackupPolicyTenantApps.slice(0, 4).map((app) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-apps", app.slug)
              )}">${escapeHtml(app.slug)}</a>`,
              meta: escapeHtml(app.canonicalDomain),
              summary: escapeHtml(app.primaryNodeId),
              tone: "default" as const
            })),
            ...selectedBackupPolicyTenantZones.slice(0, 3).map((zone) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-zones", zone.zoneName)
              )}">${escapeHtml(zone.zoneName)}</a>`,
              meta: escapeHtml(zone.primaryNodeId),
              summary: escapeHtml(zone.tenantSlug),
              tone: "default" as const
            })),
            ...selectedBackupPolicyTenantDatabases.slice(0, 3).map((database) => ({
              title: `<a class="detail-link" href="${escapeHtml(
                buildDashboardViewUrl("desired-state", "desired-state-databases", database.appSlug)
              )}">${escapeHtml(database.databaseName)}</a>`,
              meta: escapeHtml(database.engine),
              summary: escapeHtml(database.appSlug),
              tone: "default" as const
            }))
          ],
          copy.noRelatedRecords
        )}
      </article>`
    : `<article class="panel"><p class="empty">${escapeHtml(copy.noBackupPolicies)}</p></article>`;

  const selectedBackupRunsPanel = selectedBackupPolicySummary
    ? renderRelatedPanel(
        copy.backupsTitle,
        copy.backupsDescription,
        selectedBackupPolicyRuns.map((run) => ({
          title: `<a class="detail-link" href="${escapeHtml(
            buildDashboardViewUrl("backups", undefined, run.runId)
          )}">${escapeHtml(run.runId)}</a>`,
          meta: escapeHtml([run.status, formatDate(run.startedAt, locale)].join(" · ")),
          summary: escapeHtml(run.summary),
          tone:
            run.status === "failed"
              ? "danger"
              : run.status === "succeeded"
                ? "success"
                : "default"
        })),
        copy.noBackups
      )
    : `<article class="panel"><p class="empty">${escapeHtml(copy.noBackups)}</p></article>`;

  const failureFocusPanel = renderRelatedPanel(
    copy.failureFocusTitle,
    copy.failureFocusDescription,
    failedJobFocus.map((job) => ({
      title: `<a class="detail-link" href="${escapeHtml(
        buildDashboardViewUrl("job-history", undefined, job.jobId)
      )}">${escapeHtml(job.kind)}</a>`,
      meta: escapeHtml([job.jobId, job.nodeId, formatDate(job.createdAt, locale)].join(" · ")),
      summary: escapeHtml(job.summary ?? job.dispatchReason ?? "-"),
      tone: "danger" as const
    })),
    copy.noJobs
  );

  const auditSignalsPanel = renderRelatedPanel(
    copy.auditSignalsTitle,
    copy.auditSignalsDescription,
    auditEventGroups.map((group) => ({
      title: escapeHtml(group.key),
      meta: escapeHtml(`${group.items.length} event(s)`),
      summary: escapeHtml(
        group.items
          .slice(0, 2)
          .map((event) => event.entityType ?? event.entityId ?? copy.none)
          .join(" · ")
      ),
      tone: "default" as const
    })),
    copy.noRelatedRecords
  );

  const auditActorsPanel = renderRelatedPanel(
    copy.auditActorsTitle,
    copy.auditActorsDescription,
    auditActorGroups.map((group) => ({
      title: escapeHtml(group.key),
      meta: escapeHtml(`${group.items.length} event(s)`),
      summary: escapeHtml(
        group.items
          .slice(0, 2)
          .map((event) => event.entityType ?? event.entityId ?? copy.none)
          .join(" · ")
      ),
      tone: "default" as const
    })),
    copy.noRelatedRecords
  );

  const auditEntitiesPanel = renderRelatedPanel(
    copy.auditEntitiesTitle,
    copy.auditEntitiesDescription,
    auditEntityGroups.map((group) => ({
      title: escapeHtml(group.key),
      meta: escapeHtml(`${group.items.length} event(s)`),
      summary: escapeHtml(
        group.items
          .slice(0, 2)
          .map((event) => event.eventType)
          .join(" · ")
      ),
      tone: "default" as const
    })),
    copy.noRelatedRecords
  );

  const jobNodesPanel = renderRelatedPanel(
    copy.jobNodesTitle,
    copy.jobNodesDescription,
    jobNodeGroups.map((group) => ({
      title: `<a class="detail-link mono" href="${escapeHtml(
        buildDashboardViewUrl("node-health", undefined, group.key)
      )}">${escapeHtml(group.key)}</a>`,
      meta: escapeHtml(`${group.items.length} job(s)`),
      summary: escapeHtml(summarizeGroupStatuses(group.items)),
      tone: group.items.some((job) => job.status === "failed")
        ? ("danger" as const)
        : group.items.some((job) => job.status === "applied")
          ? ("success" as const)
          : ("default" as const)
    })),
    copy.noJobs
  );

  const jobKindsPanel = renderRelatedPanel(
    copy.jobKindsTitle,
    copy.jobKindsDescription,
    jobKindGroups.map((group) => ({
      title: escapeHtml(group.key),
      meta: escapeHtml(`${group.items.length} job(s)`),
      summary: escapeHtml(summarizeGroupStatuses(group.items)),
      tone: group.items.some((job) => job.status === "failed")
        ? ("danger" as const)
        : group.items.some((job) => job.status === "applied")
          ? ("success" as const)
          : ("default" as const)
    })),
    copy.noJobs
  );

  const jobStatusesPanel = renderRelatedPanel(
    copy.jobStatusesTitle,
    copy.jobStatusesDescription,
    jobStatusGroups.map((group) => ({
      title: escapeHtml(group.key),
      meta: escapeHtml(`${group.items.length} job(s)`),
      summary: escapeHtml(
        group.items
          .slice(0, 2)
          .map((job) => `${job.kind} · ${job.nodeId}`)
          .join(" · ")
      ),
      tone:
        group.key === "failed"
          ? ("danger" as const)
          : group.key === "applied"
            ? ("success" as const)
            : ("default" as const)
    })),
    copy.noJobs
  );

  const jobResourceHotspotsPanel = renderRelatedPanel(
    copy.jobResourceHotspotsTitle,
    copy.jobResourceHotspotsDescription,
    jobResourceGroups.map((group) => ({
      title: `<a class="detail-link mono" href="${escapeHtml(
        buildDashboardViewUrl("resource-drift", undefined, group.key)
      )}">${escapeHtml(group.key)}</a>`,
      meta: escapeHtml(`${group.items.length} job(s)`),
      summary: escapeHtml(summarizeGroupStatuses(group.items)),
      tone: group.items.some((job) => job.status === "failed")
        ? ("danger" as const)
        : group.items.some((job) => job.status === "applied")
          ? ("success" as const)
          : ("default" as const)
    })),
    copy.noJobs
  );

  const driftNodesPanel = renderRelatedPanel(
    copy.driftNodesTitle,
    copy.driftNodesDescription,
    driftNodeGroups.map((group) => ({
      title: `<a class="detail-link mono" href="${escapeHtml(
        buildDashboardViewUrl("node-health", undefined, group.key)
      )}">${escapeHtml(group.key)}</a>`,
      meta: escapeHtml(`${group.items.length} drift item(s)`),
      summary: escapeHtml(
        groupItemsBy(group.items, (entry) => entry.driftStatus)
          .map((entry) => `${entry.key}:${entry.items.length}`)
          .join(" · ")
      ),
      tone: group.items.some((entry) => entry.driftStatus === "out_of_sync" || entry.driftStatus === "missing_secret")
        ? ("danger" as const)
        : group.items.some((entry) => entry.driftStatus === "pending")
          ? ("default" as const)
          : ("success" as const)
    })),
    copy.noDrift
  );

  const driftKindsPanel = renderRelatedPanel(
    copy.driftKindsTitle,
    copy.driftKindsDescription,
    driftKindGroups.map((group) => ({
      title: escapeHtml(group.key),
      meta: escapeHtml(`${group.items.length} drift item(s)`),
      summary: escapeHtml(
        groupItemsBy(group.items, (entry) => entry.driftStatus)
          .map((entry) => `${entry.key}:${entry.items.length}`)
          .join(" · ")
      ),
      tone: group.items.some((entry) => entry.driftStatus === "out_of_sync" || entry.driftStatus === "missing_secret")
        ? ("danger" as const)
        : group.items.some((entry) => entry.driftStatus === "pending")
          ? ("default" as const)
          : ("success" as const)
    })),
    copy.noDrift
  );

  const backupCoveragePanel = `<article class="panel detail-shell">
    <div class="section-head">
      <div>
        <h3>${escapeHtml(copy.backupCoverageTitle)}</h3>
        <p class="muted section-description">${escapeHtml(copy.backupCoverageDescription)}</p>
      </div>
    </div>
    ${renderDetailGrid([
      {
        label: copy.policyCoverage,
        value: renderPill(String(backupCoverageCount), backupCoverageCount > 0 ? "success" : "muted")
      },
      {
        label: copy.navTenants,
        value: renderPill(String(backupCoveredTenantCount), backupCoveredTenantCount > 0 ? "success" : "muted")
      },
      {
        label: copy.targetedNodesLabel,
        value: renderPill(String(backupTargetNodeCount), backupTargetNodeCount > 0 ? "success" : "muted")
      },
      {
        label: copy.latestSuccessLabel,
        value: backupLatestSuccessRun
          ? `<a class="detail-link mono" href="${escapeHtml(
              buildDashboardViewUrl("backups", undefined, backupLatestSuccessRun.runId)
            )}">${escapeHtml(backupLatestSuccessRun.runId)}</a>`
          : renderPill(copy.none, "muted")
      },
      {
        label: copy.latestFailureLabel,
        value: backupLatestFailedRun
          ? `<a class="detail-link mono" href="${escapeHtml(
              buildDashboardViewUrl("backups", undefined, backupLatestFailedRun.runId)
            )}">${escapeHtml(backupLatestFailedRun.runId)}</a>`
          : renderPill(copy.none, "muted")
      },
      {
        label: copy.nodeHealthTitle,
        value: selectedBackupPolicyTargetHealth?.latestJobStatus
          ? renderPill(
              selectedBackupPolicyTargetHealth.latestJobStatus,
              selectedBackupPolicyTargetHealth.latestJobStatus === "applied"
                ? "success"
                : selectedBackupPolicyTargetHealth.latestJobStatus === "failed"
                  ? "danger"
                  : "muted"
            )
          : renderPill(copy.none, "muted")
      }
    ])}
    ${renderRelatedPanel(
      copy.navBackupPolicies,
      copy.backupCoverageDescription,
      backupPolicyPreviewItems,
      copy.noBackupPolicies
    )}
  </article>`;

  const backupTargetPosturePanel = `<article class="panel detail-shell">
    <div class="section-head">
      <div>
        <h3>${escapeHtml(copy.backupTargetPostureTitle)}</h3>
        <p class="muted section-description">${escapeHtml(copy.backupTargetPostureDescription)}</p>
      </div>
    </div>
    ${renderDetailGrid([
      {
        label: copy.backupPolicyColTargetNode,
        value: selectedBackupPolicySummary
          ? `<a class="detail-link mono" href="${escapeHtml(
              buildDashboardViewUrl("node-health", undefined, selectedBackupPolicySummary.targetNodeId)
            )}">${escapeHtml(selectedBackupPolicySummary.targetNodeId)}</a>`
          : renderPill(copy.none, "muted")
      },
      {
        label: copy.nodeHealthTitle,
        value: selectedBackupPolicyTargetHealth?.latestJobStatus
          ? renderPill(
              selectedBackupPolicyTargetHealth.latestJobStatus,
              selectedBackupPolicyTargetHealth.latestJobStatus === "applied"
                ? "success"
                : selectedBackupPolicyTargetHealth.latestJobStatus === "failed"
                  ? "danger"
                  : "muted"
            )
          : renderPill(copy.none, "muted")
      },
      {
        label: copy.nodeColPending,
        value: selectedBackupPolicyTargetHealth
          ? renderPill(
              String(selectedBackupPolicyTargetHealth.pendingJobCount),
              selectedBackupPolicyTargetHealth.pendingJobCount > 0 ? "danger" : "success"
            )
          : renderPill(copy.none, "muted")
      },
      {
        label: copy.nodeColVersion,
        value: selectedBackupPolicyTargetHealth?.currentVersion
          ? renderPill(selectedBackupPolicyTargetHealth.currentVersion, "muted")
          : renderPill(copy.none, "muted")
      },
      {
        label: copy.navBackupPolicies,
        value: renderPill(
          String(
            selectedBackupPolicySummary
              ? data.backups.policies.filter(
                  (policy) => policy.targetNodeId === selectedBackupPolicySummary.targetNodeId
                ).length
              : 0
          ),
          selectedBackupPolicySummary ? "success" : "muted"
        )
      },
      {
        label: copy.relatedJobsTitle,
        value: renderPill(
          String(selectedBackupPolicySummary ? selectedBackupPolicyRuns.length : 0),
          selectedBackupPolicySummary && selectedBackupPolicyRuns.length > 0 ? "success" : "muted"
        )
      }
    ])}
    ${renderRelatedPanel(
      copy.backupRunSignalsTitle,
      copy.backupRunSignalsDescription,
      backupNodeGroups.map((group) => ({
        title: `<a class="detail-link mono" href="${escapeHtml(
          buildDashboardViewUrl("node-health", undefined, group.key)
        )}">${escapeHtml(group.key)}</a>`,
        meta: escapeHtml(`${group.items.length} run(s)`),
        summary: escapeHtml(summarizeGroupStatuses(group.items)),
        tone: group.items.some((run) => run.status === "failed")
          ? ("danger" as const)
          : group.items.some((run) => run.status === "succeeded")
            ? ("success" as const)
            : ("default" as const)
      })),
      copy.noBackups
    )}
  </article>`;

  const backupRunSignalsPanel = renderRelatedPanel(
    copy.backupRunSignalsTitle,
    copy.backupRunSignalsDescription,
    backupStatusGroups.map((group) => ({
      title: escapeHtml(group.key),
      meta: escapeHtml(`${group.items.length} run(s)`),
      summary: escapeHtml(
        group.items
          .slice(0, 2)
          .map((run) => `${run.policySlug} · ${run.nodeId}`)
          .join(" · ")
      ),
      tone:
        group.key === "failed"
          ? ("danger" as const)
          : group.key === "succeeded"
            ? ("success" as const)
            : ("default" as const)
    })),
    copy.noBackups
  );

  const backupCoverageByTenantPanel = renderRelatedPanel(
    copy.backupCoverageByTenantTitle,
    copy.backupCoverageByTenantDescription,
    backupTenantGroups.map((group) => {
      const tenantApps = data.desiredState.spec.apps.filter((app) => app.tenantSlug === group.key).length;
      const tenantZones = data.desiredState.spec.zones.filter((zone) => zone.tenantSlug === group.key).length;
      const tenantDatabases = data.desiredState.spec.databases.filter((database) => {
        const app = data.desiredState.spec.apps.find((entry) => entry.slug === database.appSlug);
        return app?.tenantSlug === group.key;
      }).length;

      return {
        title: `<a class="detail-link" href="${escapeHtml(
          buildDashboardViewUrl("desired-state", "desired-state-tenants", group.key)
        )}">${escapeHtml(group.key)}</a>`,
        meta: escapeHtml(`${group.items.length} polic(ies)`),
        summary: escapeHtml(
          `${tenantApps} app(s) · ${tenantZones} zone(s) · ${tenantDatabases} database(s)`
        ),
        tone: "default" as const
      };
    }),
    copy.noBackupPolicies
  );

  const backupPolicySignalsPanel = renderRelatedPanel(
    copy.backupPolicySignalsTitle,
    copy.backupPolicySignalsDescription,
    backupPolicyGroups.map((group) => ({
      title: `<a class="detail-link mono" href="${escapeHtml(
        buildDashboardViewUrl("backups", undefined, group.key)
      )}">${escapeHtml(group.key)}</a>`,
      meta: escapeHtml(`${group.items.length} run(s)`),
      summary: escapeHtml(summarizeGroupStatuses(group.items)),
      tone: group.items.some((run) => run.status === "failed")
        ? ("danger" as const)
        : group.items.some((run) => run.status === "succeeded")
          ? ("success" as const)
          : ("default" as const)
    })),
    copy.noBackups
  );

  const nodeHealthSection = `<section id="section-node-health" class="panel section-panel">
    ${renderSignalStrip([
      { label: copy.healthyNodes, value: String(healthyNodeCount), tone: healthyNodeCount > 0 ? "success" : "muted" },
      { label: copy.staleNodes, value: String(staleNodeCount), tone: staleNodeCount > 0 ? "danger" : "success" },
      { label: copy.nodesWithPendingJobs, value: String(pendingNodeCount), tone: pendingNodeCount > 0 ? "danger" : "success" },
      { label: copy.nodesWithFailures, value: String(failingNodeCount), tone: failingNodeCount > 0 ? "danger" : "success" }
    ])}
    ${renderDataTable({
      id: "section-node-health-table",
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
    })}
    <div class="grid grid-two">
      ${nodeDiagnosticsPanel}
      <div class="stack">
        ${relatedNodeJobsPanel}
        ${relatedNodeDriftPanel}
        ${renderAuditPanel(
          copy,
          locale,
          selectedNodeAuditEvents.length > 0 ? selectedNodeAuditEvents : data.auditEvents.slice(0, 6)
        )}
      </div>
    </div>
  </section>`;

  const resourceDriftSection = `<section id="section-resource-drift" class="panel section-panel">
    ${renderSignalStrip([
      { label: copy.resourcesWithDrift, value: String(data.overview.driftedResourceCount), tone: data.overview.driftedResourceCount > 0 ? "danger" : "success" },
      { label: copy.driftPending, value: String(driftPendingCount), tone: driftPendingCount > 0 ? "muted" : "success" },
      { label: copy.driftOutOfSync, value: String(driftOutOfSyncCount), tone: driftOutOfSyncCount > 0 ? "danger" : "success" },
      { label: copy.driftMissingSecrets, value: String(driftMissingSecretCount), tone: driftMissingSecretCount > 0 ? "danger" : "success" }
    ])}
    ${renderDataTable({
      id: "section-resource-drift-table",
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
    })}
    <div class="grid grid-two">
      ${selectedDriftPanel}
      <div class="stack">
        ${driftNodesPanel}
        ${driftKindsPanel}
        ${selectedDriftActionPanel}
        ${renderJobFeedPanel(copy, locale, selectedDriftJobs)}
        ${renderAuditPanel(copy, locale, selectedDriftAuditEvents)}
      </div>
    </div>
  </section>`;

  const jobHistorySection = `<section id="section-job-history" class="panel section-panel">
    ${renderSignalStrip([
      { label: copy.recentQueuedJobs, value: String(queuedJobCount), tone: queuedJobCount > 0 ? "muted" : "success" },
      { label: copy.recentAppliedJobs, value: String(appliedJobCount), tone: appliedJobCount > 0 ? "success" : "muted" },
      { label: copy.recentFailedJobs, value: String(failedJobCount), tone: failedJobCount > 0 ? "danger" : "success" },
      { label: "dns.sync", value: String(dnsSyncJobCount), tone: dnsSyncJobCount > 0 ? "muted" : "success" },
      { label: "proxy.render", value: String(proxyRenderJobCount), tone: proxyRenderJobCount > 0 ? "muted" : "success" },
      { label: "db reconcile", value: String(databaseReconcileJobCount), tone: databaseReconcileJobCount > 0 ? "muted" : "success" },
      { label: "backup.trigger", value: String(backupTriggerJobCount), tone: backupTriggerJobCount > 0 ? "muted" : "success" }
    ])}
    ${renderDataTable({
      id: "section-job-history-table",
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
    })}
    <div class="grid grid-two">
      ${selectedJobPanel}
      <div class="stack">
        ${failureFocusPanel}
        ${jobStatusesPanel}
        ${jobNodesPanel}
        ${jobKindsPanel}
        ${jobResourceHotspotsPanel}
        ${auditSignalsPanel}
        ${auditActorsPanel}
        ${auditEntitiesPanel}
        ${renderJobFeedPanel(
          copy,
          locale,
          selectedJobRelatedJobs,
          copy.linkedOperationsTitle
        )}
        ${renderAuditPanel(
          copy,
          locale,
          selectedJobAuditEvents.length > 0 ? selectedJobAuditEvents : data.auditEvents.slice(0, 8)
        )}
      </div>
    </div>
  </section>`;

  const backupsSection = `<section id="section-backups" class="panel section-panel">
    ${renderSignalStrip([
      { label: copy.succeededBackups, value: String(backupSucceededCount), tone: backupSucceededCount > 0 ? "success" : "muted" },
      { label: copy.runningBackups, value: String(backupRunningCount), tone: backupRunningCount > 0 ? "muted" : "success" },
      { label: copy.failedBackups, value: String(backupFailedCount), tone: backupFailedCount > 0 ? "danger" : "success" },
      { label: copy.policyCoverage, value: String(backupCoverageCount), tone: backupCoverageCount > 0 ? "success" : "muted" }
    ])}
    ${renderDataTable({
      id: "section-backups-table",
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
    })}
    <div class="grid grid-two">
      ${selectedBackupRunPanel}
      <div class="stack">
        ${backupCoveragePanel}
        ${backupCoverageByTenantPanel}
        ${backupTargetPosturePanel}
        ${backupPolicySignalsPanel}
        ${backupRunSignalsPanel}
        ${selectedBackupPolicyPanel}
        ${selectedBackupRunsPanel}
        ${renderRelatedPanel(
          copy.failureFocusTitle,
          copy.failureFocusDescription,
          backupFailureItems,
          copy.noBackups
        )}
        ${renderAuditPanel(copy, locale, selectedBackupAuditEvents)}
      </div>
    </div>
  </section>`;

  const desiredStateSection = renderDesiredStateSection(
    data,
    copy,
    locale,
    desiredStateTab,
    focus
  );

  const body = (() => {
    switch (view) {
      case "node-health":
        return nodeHealthSection;
      case "resource-drift":
        return resourceDriftSection;
      case "job-history":
        return jobHistorySection;
      case "backups":
        return backupsSection;
      case "desired-state":
        return desiredStateSection;
      case "overview":
      default:
        return overviewSection;
    }
  })();

  return renderAdminShell({
    lang: locale,
    title: `${copy.appName} · ${getDashboardHeading(copy, view)}`,
    appName: copy.appName,
    heading: getDashboardHeading(copy, view),
    eyebrow: copy.eyebrow,
    subheading: getDashboardSubheading(copy, view),
    notice,
    headerActionsHtml: topbarActionsHtml,
    versionLabel: copy.versionLabel,
    versionValue: config.version,
    sidebarSearchPlaceholder: copy.sidebarSearchPlaceholder,
    sidebarGroups,
    body
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
    auditEvents,
    backups
  ] = await Promise.all([
    apiRequest<AuthenticatedUserSummary>("/v1/auth/me", { token }),
    apiRequest<OperationsOverview>("/v1/operations/overview", { token }),
    apiRequest<InventoryStateSnapshot>("/v1/inventory/summary", { token }),
    apiRequest<DesiredStateExportResponse>("/v1/resources/spec", { token }),
    apiRequest<ResourceDriftSummary[]>("/v1/resources/drift", { token }),
    apiRequest<NodeHealthSnapshot[]>("/v1/nodes/health", { token }),
    apiRequest<JobHistoryEntry[]>("/v1/jobs/history?limit=30", { token }),
    apiRequest<AuditEventSummary[]>("/v1/audit/events?limit=30", { token }),
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
    auditEvents,
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
    slug: assertSlug(form.get("slug")?.trim() ?? "", "Tenant slug"),
    displayName: assertRequired(form.get("displayName")?.trim() ?? "", "Display name")
  };
}

function parseNodeForm(form: URLSearchParams): DesiredStateNodeInput {
  return {
    nodeId: assertSlug(form.get("nodeId")?.trim() ?? "", "Node ID"),
    hostname: assertHostname(form.get("hostname")?.trim() ?? "", "Hostname"),
    publicIpv4: assertIpv4(form.get("publicIpv4")?.trim() ?? "", "Public IPv4"),
    wireguardAddress: assertWireguardAddress(
      form.get("wireguardAddress")?.trim() ?? "",
      "WireGuard address"
    )
  };
}

function parseZoneForm(form: URLSearchParams): DesiredStateZoneInput {
  return {
    zoneName: assertDomain(form.get("zoneName")?.trim() ?? "", "Zone name"),
    tenantSlug: assertSlug(form.get("tenantSlug")?.trim() ?? "", "Tenant slug"),
    primaryNodeId: assertSlug(form.get("primaryNodeId")?.trim() ?? "", "Primary node"),
    records: parseZoneRecords(form.get("records")?.trim() ?? "")
  };
}

function parseAppForm(form: URLSearchParams): DesiredStateAppInput {
  const slug = assertSlug(form.get("slug")?.trim() ?? "", "App slug");
  const tenantSlug = assertSlug(form.get("tenantSlug")?.trim() ?? "", "Tenant slug");
  const zoneName = assertDomain(form.get("zoneName")?.trim() ?? "", "Zone name");
  const primaryNodeId = assertSlug(form.get("primaryNodeId")?.trim() ?? "", "Primary node");
  const standbyNodeId = form.get("standbyNodeId")?.trim()
    ? assertSlug(form.get("standbyNodeId")?.trim() ?? "", "Standby node")
    : undefined;
  const canonicalDomain = assertDomain(
    form.get("canonicalDomain")?.trim() ?? "",
    "Canonical domain"
  );
  const aliases = parseCommaSeparated(form.get("aliases") ?? "").map((alias) =>
    assertDomain(alias, "Alias")
  );
  const backendPort = assertPositiveInt(
    parseOptionalNumber(form.get("backendPort")?.trim() ?? ""),
    "Backend port",
    { min: 1, max: 65535 }
  );
  if (standbyNodeId && standbyNodeId === primaryNodeId) {
    throw new Error("Standby node must differ from primary node.");
  }
  return {
    slug,
    tenantSlug,
    zoneName,
    primaryNodeId,
    standbyNodeId,
    canonicalDomain,
    aliases,
    backendPort,
    runtimeImage: assertRequired(form.get("runtimeImage")?.trim() ?? "", "Runtime image"),
    storageRoot: assertRequired(form.get("storageRoot")?.trim() ?? "", "Storage root"),
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
  const primaryNodeId = assertSlug(form.get("primaryNodeId")?.trim() ?? "", "Primary node");
  const standbyNodeId = form.get("standbyNodeId")?.trim()
    ? assertSlug(form.get("standbyNodeId")?.trim() ?? "", "Standby node")
    : undefined;

  if (standbyNodeId && standbyNodeId === primaryNodeId) {
    throw new Error("Standby node must differ from primary node.");
  }

  if (pendingMigrationTo && pendingMigrationTo === engine) {
    throw new Error("Pending migration target must differ from the current engine.");
  }

  return {
    appSlug: assertSlug(form.get("appSlug")?.trim() ?? "", "App slug"),
    engine,
    databaseName: assertRequired(form.get("databaseName")?.trim() ?? "", "Database name"),
    databaseUser: assertRequired(form.get("databaseUser")?.trim() ?? "", "Database user"),
    primaryNodeId,
    standbyNodeId,
    pendingMigrationTo,
    desiredPassword: form.get("desiredPassword")?.trim() || undefined
  };
}

function parseBackupPolicyForm(form: URLSearchParams): DesiredStateBackupPolicyInput {
  const retentionDays = assertPositiveInt(
    parseOptionalNumber(form.get("retentionDays")?.trim() ?? ""),
    "Retention days",
    { min: 1 }
  );
  return {
    policySlug: assertSlug(form.get("policySlug")?.trim() ?? "", "Policy slug"),
    tenantSlug: assertSlug(form.get("tenantSlug")?.trim() ?? "", "Tenant slug"),
    targetNodeId: assertSlug(form.get("targetNodeId")?.trim() ?? "", "Target node"),
    schedule: assertCronish(form.get("schedule")?.trim() ?? "", "Schedule"),
    retentionDays,
    storageLocation: assertRequired(
      form.get("storageLocation")?.trim() ?? "",
      "Storage location"
    ),
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
  const view = normalizeDashboardView(url.searchParams.get("view"));
  const desiredStateTab = normalizeDesiredStateTab(url.searchParams.get("tab"));
  const focus = normalizeDashboardFocus(url.searchParams.get("focus"));

  if (!token) {
    writeHtml(response, 200, renderLoginPage(locale, getNoticeFromUrl(url)));
    return;
  }

  try {
    const data = await loadDashboardData(token);
    writeHtml(
      response,
      200,
      renderDashboard(
        data,
        locale,
        sanitizeReturnTo(`${url.pathname}${url.search}`),
        view,
        desiredStateTab,
        focus,
        getNoticeFromUrl(url)
      )
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
