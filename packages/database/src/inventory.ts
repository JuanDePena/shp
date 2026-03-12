import { readFile } from "node:fs/promises";

import YAML from "yaml";

export interface PlatformInventoryNode {
  hostname: string;
  public_ipv4: string;
  wireguard_address: string;
}

export interface PlatformInventoryAppDatabase {
  engine: "postgresql" | "mariadb";
  name: string;
  user: string;
  pending_migration_to?: "postgresql" | "mariadb";
}

export interface PlatformInventoryApp {
  slug: string;
  client: string;
  zone: string;
  canonical_domain: string;
  aliases: string[];
  backend_port: number;
  runtime_image: string;
  database: PlatformInventoryAppDatabase;
  storage_root: string;
  mode: string;
}

export interface PlatformInventoryDocument {
  nodes: Record<string, PlatformInventoryNode>;
  platform: {
    default_mode?: string;
    postgresql_apps: {
      primary_node: string;
      standby_node: string;
      primary_port: number;
    };
    postgresql_shp: {
      primary_node: string;
      standby_node: string;
      primary_port: number;
      database: string;
      user: string;
    };
    mariadb_apps: {
      primary_node: string;
      replica_node: string;
      primary_port: number;
    };
  };
  apps: PlatformInventoryApp[];
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object at ${path}.`);
  }

  return value as Record<string, unknown>;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected non-empty string at ${path}.`);
  }

  return value;
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Expected number at ${path}.`);
  }

  return value;
}

function expectStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Expected string[] at ${path}.`);
  }

  return value;
}

export async function readPlatformInventory(
  sourcePath: string
): Promise<PlatformInventoryDocument> {
  const parsed = YAML.parse(await readFile(sourcePath, "utf8"));
  const root = expectRecord(parsed, "root");
  const nodesRecord = expectRecord(root.nodes, "nodes");
  const platformRecord = expectRecord(root.platform, "platform");
  const postgresqlAppsRecord = expectRecord(
    platformRecord.postgresql_apps,
    "platform.postgresql_apps"
  );
  const postgresqlShpRecord = expectRecord(
    platformRecord.postgresql_shp,
    "platform.postgresql_shp"
  );
  const mariadbAppsRecord = expectRecord(
    platformRecord.mariadb_apps,
    "platform.mariadb_apps"
  );
  const appsValue = root.apps;

  if (!Array.isArray(appsValue)) {
    throw new Error("Expected apps to be an array.");
  }

  const nodes: Record<string, PlatformInventoryNode> = {};

  for (const [nodeId, candidate] of Object.entries(nodesRecord)) {
    const nodeRecord = expectRecord(candidate, `nodes.${nodeId}`);
    nodes[nodeId] = {
      hostname: expectString(nodeRecord.hostname, `nodes.${nodeId}.hostname`),
      public_ipv4: expectString(nodeRecord.public_ipv4, `nodes.${nodeId}.public_ipv4`),
      wireguard_address: expectString(
        nodeRecord.wireguard_address,
        `nodes.${nodeId}.wireguard_address`
      )
    };
  }

  const apps = appsValue.map((candidate, index) => {
    const appRecord = expectRecord(candidate, `apps[${index}]`);
    const databaseRecord = expectRecord(appRecord.database, `apps[${index}].database`);
    const aliases =
      appRecord.aliases === undefined
        ? []
        : expectStringArray(appRecord.aliases, `apps[${index}].aliases`);

    return {
      slug: expectString(appRecord.slug, `apps[${index}].slug`),
      client: expectString(appRecord.client, `apps[${index}].client`),
      zone: expectString(appRecord.zone, `apps[${index}].zone`),
      canonical_domain: expectString(
        appRecord.canonical_domain,
        `apps[${index}].canonical_domain`
      ),
      aliases,
      backend_port: expectNumber(appRecord.backend_port, `apps[${index}].backend_port`),
      runtime_image: expectString(appRecord.runtime_image, `apps[${index}].runtime_image`),
      database: {
        engine: expectString(databaseRecord.engine, `apps[${index}].database.engine`) as
          | "postgresql"
          | "mariadb",
        name: expectString(databaseRecord.name, `apps[${index}].database.name`),
        user: expectString(databaseRecord.user, `apps[${index}].database.user`),
        pending_migration_to:
          typeof databaseRecord.pending_migration_to === "string"
            ? (databaseRecord.pending_migration_to as "postgresql" | "mariadb")
            : undefined
      },
      storage_root: expectString(appRecord.storage_root, `apps[${index}].storage_root`),
      mode: expectString(appRecord.mode, `apps[${index}].mode`)
    } satisfies PlatformInventoryApp;
  });

  return {
    nodes,
    platform: {
      default_mode:
        typeof platformRecord.default_mode === "string"
          ? platformRecord.default_mode
          : undefined,
      postgresql_apps: {
        primary_node: expectString(
          postgresqlAppsRecord.primary_node,
          "platform.postgresql_apps.primary_node"
        ),
        standby_node: expectString(
          postgresqlAppsRecord.standby_node,
          "platform.postgresql_apps.standby_node"
        ),
        primary_port: expectNumber(
          postgresqlAppsRecord.primary_port,
          "platform.postgresql_apps.primary_port"
        )
      },
      postgresql_shp: {
        primary_node: expectString(
          postgresqlShpRecord.primary_node,
          "platform.postgresql_shp.primary_node"
        ),
        standby_node: expectString(
          postgresqlShpRecord.standby_node,
          "platform.postgresql_shp.standby_node"
        ),
        primary_port: expectNumber(
          postgresqlShpRecord.primary_port,
          "platform.postgresql_shp.primary_port"
        ),
        database: expectString(
          postgresqlShpRecord.database,
          "platform.postgresql_shp.database"
        ),
        user: expectString(postgresqlShpRecord.user, "platform.postgresql_shp.user")
      },
      mariadb_apps: {
        primary_node: expectString(
          mariadbAppsRecord.primary_node,
          "platform.mariadb_apps.primary_node"
        ),
        replica_node: expectString(
          mariadbAppsRecord.replica_node,
          "platform.mariadb_apps.replica_node"
        ),
        primary_port: expectNumber(
          mariadbAppsRecord.primary_port,
          "platform.mariadb_apps.primary_port"
        )
      }
    },
    apps
  };
}
