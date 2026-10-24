// oxlint-disable import/exports-last -- render helpers interleave with their private object builders
import type { K8sDef } from 'sdk:k8s'

import { createHash } from 'node:crypto'

import {
  APP_LABEL,
  COMPONENT,
  COMPONENT_LABEL,
  CONFIG_HASH_ANNOTATION,
  CONFIG_VOLUME,
  CONFIGS_DIR,
  CONTAINER,
  DATA_PATH,
  DATA_VOLUME,
  DEFAULT_IMAGE,
  DEFAULT_MEMORY,
  DEFAULT_STORAGE,
  DEFAULT_TAG,
  DEFAULT_TYPE,
  DEFAULT_VERSION,
  GAME_PORT,
  HEALTH_COMMAND,
  MANAGED_BY,
  MANAGED_LABEL,
  PATCHES_DIR,
  PATCHES_FILE,
  RCON_PORT,
  READY_DELAY_SECONDS,
  READY_FAILURES,
  READY_PERIOD_SECONDS,
  RUN_AS,
  SNAPSHOT_API,
  SNAPSHOT_GROUP,
  VOLUME_LABEL,
} from '../const'
import type { MinecraftDef } from '../types'

import { accessProjectsOf, accessSecretsOf } from './access'
import { configFilesOf, overruled, patchSetOf, patchSetText, propertiesOf } from './config'

type Obj = Record<string, unknown>

/** What the Service is, by how the spec exposes the server. */
const SERVICE_TYPES: Record<MinecraftDef.Expose, string> = {
  none: 'ClusterIP',
  nodeport: 'NodePort',
  loadbalancer: 'LoadBalancer',
}

/** Standard labels stamped on every object (they drive the Service's selector and `kube`'s lookups). */
const labelsOf = (name: string): Record<string, string> => ({
  [APP_LABEL]: name,
  [COMPONENT_LABEL]: COMPONENT,
  [MANAGED_LABEL]: MANAGED_BY,
})

const metaFor = (
  name: string,
  namespace: string | undefined,
  labels: Record<string, string>,
): K8sDef.KubeMeta => ({
  name,
  ...(namespace === undefined ? {} : { namespace }),
  labels,
})

/** A value the image reads as a flag. */
const flag = (value: boolean): string => (value ? 'TRUE' : 'FALSE')

/** A list the image reads as one comma-separated value; nothing for an empty one. */
const listed = (values: readonly string[] | undefined): string | undefined =>
  values === undefined || values.length === 0 ? undefined : values.join(',')

/** The Modrinth projects: the spec's, and what `discord` and `auth` install unless it names them. */
const projectsOf = (spec: MinecraftDef.ServerSpec): string[] | undefined => {
  const named = new Set(spec.modrinth?.map(project => project.split(':')[0]))
  const projects = [
    ...(spec.modrinth ?? []),
    ...accessProjectsOf(spec).filter(project => !named.has(project)),
  ]

  return projects.length === 0 ? undefined : projects
}

/** Whether the server takes players without asking Mojang: the property, else the field. */
const offlineOf = (spec: MinecraftDef.ServerSpec): boolean =>
  String(spec.properties?.['online-mode'] ?? spec.onlineMode) === 'false'

/**
 * Players as the image's user lists take them. Offline, a name is marked `:offline`: the image
 * would otherwise write the Mojang account's UUID, which an offline server never sees — the
 * whitelisted player is turned away and the operator is none.
 */
const playersOf = (
  spec: MinecraftDef.ServerSpec,
  names: readonly string[] | undefined,
): string | undefined => listed(offlineOf(spec) ? names?.map(name => `${name}:offline`) : names)

/**
 * The heap as a Kubernetes quantity: Java's `G` and `M` are binary units, Kubernetes' plain ones
 * are decimal — `2G` of heap is `2Gi` of memory.
 */
const quantityOf = (heap: string): string => `${heap}i`

/** The effective image ref. */
export const imageOf = (spec: MinecraftDef.ServerSpec): string =>
  `${spec.image ?? DEFAULT_IMAGE}:${spec.tag ?? DEFAULT_TAG}`

/** The pod a server runs in: the StatefulSet's one replica. */
export const podOf = (name: string): string => `${name}-0`

/** The claim that holds a server's world: what the StatefulSet made from its template. */
export const claimOf = (name: string): string => `${DATA_VOLUME}-${name}-0`

/** The ConfigMap that carries a server's patch set. */
export const configMapOf = (name: string): string => `${name}-config`

/** The patch set as the pod's file holds it; `undefined` for a spec that configures no file. */
export const patchesOf = (spec: MinecraftDef.ServerSpec): string | undefined => {
  const set = patchSetOf(spec)

  return set === undefined ? undefined : patchSetText(set)
}

/** The ConfigMap's key a file of `configs` is kept under: by its place, a path is no key. */
const configKeyOf = (index: number): string => `config-${index}`

/**
 * What the ConfigMap of a server carries: the patch set, and the files of `configs`; `undefined`
 * for a spec with neither.
 */
export const configDataOf = (spec: MinecraftDef.ServerSpec): Record<string, string> | undefined => {
  const patches = patchesOf(spec)
  const data: Record<string, string> = patches === undefined ? {} : { [PATCHES_FILE]: patches }

  for (const [index, file] of configFilesOf(spec).entries()) {
    data[configKeyOf(index)] = file.text
  }

  return Object.keys(data).length === 0 ? undefined : data
}

/**
 * Where the ConfigMap's entries are in the pod: each file mounted by itself (`subPath`), so the
 * image copies plain files out of `/config` — a whole ConfigMap is a tree of links it would copy
 * as they are.
 */
const configMountsOf = (spec: MinecraftDef.ServerSpec): Obj[] => [
  ...(patchesOf(spec) === undefined
    ? []
    : [
        {
          name: CONFIG_VOLUME,
          mountPath: `${PATCHES_DIR}/${PATCHES_FILE}`,
          subPath: PATCHES_FILE,
          readOnly: true,
        },
      ]),
  ...configFilesOf(spec).map((file, index) => ({
    name: CONFIG_VOLUME,
    mountPath: `${CONFIGS_DIR}/${file.path}`,
    subPath: configKeyOf(index),
    readOnly: true,
  })),
]

/** A text's fingerprint, for the annotation that rolls the pod when its config changed. */
const fingerprintOf = (text: string): string => createHash('sha256').update(text).digest('hex')

/** The variables taken from Secrets: what `discord` needs, and `secretEnv` over it. */
const secretsOf = (spec: MinecraftDef.ServerSpec): Record<string, MinecraftDef.SecretRef> => ({
  ...accessSecretsOf(spec),
  ...spec.secretEnv,
})

/** The variables a Secret holds, as the container takes them. */
const secretVariablesOf = (spec: MinecraftDef.ServerSpec): Obj[] =>
  Object.entries(secretsOf(spec)).map(([name, ref]) => ({
    name,
    valueFrom: { secretKeyRef: { name: ref.secret, key: ref.key } },
  }))

/**
 * The environment the image reads, from the spec's fields — and the spec's `env` over them, as
 * written: what both set, `env` decides. A variable `secretEnv` names is the Secret's alone.
 */
export const environmentOf = (spec: MinecraftDef.ServerSpec): Record<string, string> => {
  const patches = patchesOf(spec)
  const named: Record<string, string | undefined> = {
    EULA: 'TRUE',
    TYPE: spec.type ?? DEFAULT_TYPE,
    VERSION: spec.version ?? DEFAULT_VERSION,
    MEMORY: spec.memory ?? DEFAULT_MEMORY,
    MOTD: overruled(spec, 'motd') ? undefined : spec.motd,
    DIFFICULTY: overruled(spec, 'difficulty') ? undefined : spec.difficulty,
    MAX_PLAYERS:
      spec.maxPlayers === undefined || overruled(spec, 'maxPlayers')
        ? undefined
        : String(spec.maxPlayers),
    ONLINE_MODE:
      spec.onlineMode === undefined || overruled(spec, 'onlineMode')
        ? undefined
        : flag(spec.onlineMode),
    OPS: playersOf(spec, spec.ops),
    // the lists are the whole lists: a name taken out of the spec loses its place at the next start
    EXISTING_OPS_FILE: listed(spec.ops) === undefined ? undefined : 'SYNCHRONIZE',
    WHITELIST: playersOf(spec, spec.whitelist),
    ENABLE_WHITELIST: listed(spec.whitelist) === undefined ? undefined : 'TRUE',
    EXISTING_WHITELIST_FILE: listed(spec.whitelist) === undefined ? undefined : 'SYNCHRONIZE',
    TZ: spec.timezone,
    MODRINTH_PROJECTS: listed(projectsOf(spec)),
    // what `discord` and `auth` install comes with what it needs (sdlink: craterlib)
    MODRINTH_DOWNLOAD_DEPENDENCIES:
      spec.modrinthDependencies ?? (accessProjectsOf(spec).length === 0 ? undefined : 'required'),
    MODS: listed(spec.mods),
    PLUGINS: listed(spec.plugins),
    SPIGET_RESOURCES: listed(spec.spiget?.map(String)),
    MODPACK: spec.modpack,
    REMOVE_OLD_MODS: spec.removeOldMods === undefined ? undefined : flag(spec.removeOldMods),
    CUSTOM_SERVER_PROPERTIES: propertiesOf(spec),
    PATCH_DEFINITIONS: patches === undefined ? undefined : `${PATCHES_DIR}/${PATCHES_FILE}`,
    // a mod that rewrote its file at the last start made it newer than the spec's: copied anyway
    SYNC_SKIP_NEWER_IN_DESTINATION: configFilesOf(spec).length === 0 ? undefined : 'FALSE',
    JVM_OPTS: listed(spec.jvmOpts)?.replaceAll(',', ' '),
    USE_AIKAR_FLAGS: spec.aikarFlags === undefined ? undefined : flag(spec.aikarFlags),
  }
  const env: Record<string, string> = {}

  for (const [key, value] of Object.entries(named)) {
    if (value !== undefined) {
      env[key] = value
    }
  }

  for (const [key, value] of Object.entries(spec.env ?? {})) {
    env[key] = String(value)
  }

  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !Object.hasOwn(secretsOf(spec), key)),
  )
}

/** The claim's spec as the StatefulSet's template makes it: one writer, the size, the class. */
const claimSpecOf = (spec: MinecraftDef.ServerSpec): Obj => ({
  accessModes: ['ReadWriteOnce'],
  resources: { requests: { storage: spec.storage ?? DEFAULT_STORAGE } },
  ...(spec.storageClass === undefined ? {} : { storageClassName: spec.storageClass }),
})

/**
 * The snapshot `backup` takes of a server's world: named after the claim and the moment, labelled
 * as the server's, of the class the line or the spec chose (none: the cluster's default).
 */
export const snapshotOf = (
  name: string,
  spec: MinecraftDef.ServerSpec,
  { stamp, snapshotClass }: { readonly stamp: string; readonly snapshotClass: string | undefined },
): K8sDef.KubeObject => ({
  apiVersion: SNAPSHOT_API,
  kind: 'VolumeSnapshot',
  metadata: metaFor(`${claimOf(name)}-${stamp}`, spec.namespace, {
    ...labelsOf(name),
    [VOLUME_LABEL]: DATA_VOLUME,
  }),
  spec: {
    ...(snapshotClass === undefined ? {} : { volumeSnapshotClassName: snapshotClass }),
    source: { persistentVolumeClaimName: claimOf(name) },
  },
})

/**
 * The claim as `restore` remakes it: the template's own spec under the name the StatefulSet looks
 * for, with the snapshot as its source — the next `up` finds the world there.
 */
export const restoredClaimOf = (
  name: string,
  spec: MinecraftDef.ServerSpec,
  snapshot: string,
): K8sDef.KubeObject => ({
  apiVersion: 'v1',
  kind: 'PersistentVolumeClaim',
  metadata: metaFor(claimOf(name), spec.namespace, labelsOf(name)),
  spec: {
    ...claimSpecOf(spec),
    dataSource: { name: snapshot, kind: 'VolumeSnapshot', apiGroup: SNAPSHOT_GROUP },
  },
})

/** The pod's resources: the heap as its memory request, the rest as the spec says. */
const resourcesOf = (spec: MinecraftDef.ServerSpec): Obj => {
  const requests: Record<string, string> = {
    memory: quantityOf(spec.memory ?? DEFAULT_MEMORY),
    ...(spec.cpu === undefined ? {} : { cpu: spec.cpu }),
  }
  const limits: Record<string, string> = {
    ...(spec.cpuLimit === undefined ? {} : { cpu: spec.cpuLimit }),
    ...(spec.memoryLimit === undefined ? {} : { memory: spec.memoryLimit }),
  }

  return { requests, ...(Object.keys(limits).length === 0 ? {} : { limits }) }
}

/** The namespace a server lives in, when the spec names one: applied first, never deleted by `down`. */
const namespaceObject = (namespace: string): K8sDef.KubeObject => ({
  apiVersion: 'v1',
  kind: 'Namespace',
  metadata: { name: namespace, labels: { [MANAGED_LABEL]: MANAGED_BY } },
})

/** The ConfigMap of a server's patch set and `configs`, when it configures a file. */
const configMap = (name: string, spec: MinecraftDef.ServerSpec): K8sDef.KubeObject[] => {
  const data = configDataOf(spec)

  return data === undefined
    ? []
    : [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: metaFor(configMapOf(name), spec.namespace, labelsOf(name)),
          data,
        },
      ]
}

/**
 * The Service players connect through. Reached from outside, its traffic stays on the node that
 * runs the server (`Local`): the server sees each player's own address — with the cluster's
 * policy every player would be the node's, and a ban by address or a login remembered by address
 * would hold for all of them.
 */
const service = (name: string, spec: MinecraftDef.ServerSpec): K8sDef.KubeObject => ({
  apiVersion: 'v1',
  kind: 'Service',
  metadata: metaFor(name, spec.namespace, labelsOf(name)),
  spec: {
    type: SERVICE_TYPES[spec.expose ?? 'loadbalancer'],
    ...(spec.expose === 'none' ? {} : { externalTrafficPolicy: 'Local' }),
    selector: labelsOf(name),
    ports: [
      {
        name: 'minecraft',
        protocol: 'TCP',
        port: spec.port ?? GAME_PORT,
        targetPort: GAME_PORT,
        ...(spec.nodePort === undefined ? {} : { nodePort: spec.nodePort }),
      },
    ],
  },
})

/**
 * What may reach the server's pod: the game port, from anywhere — nothing else. The console's port
 * is the pod's own (`console` runs inside it), no other pod of the cluster gets to it. Named in a
 * namespace as the other objects are: one the spec does not name is the `default` they go to.
 */
const networkPolicy = (name: string, spec: MinecraftDef.ServerSpec): K8sDef.KubeObject => ({
  apiVersion: 'networking.k8s.io/v1',
  kind: 'NetworkPolicy',
  metadata: metaFor(name, spec.namespace ?? 'default', labelsOf(name)),
  spec: {
    podSelector: { matchLabels: labelsOf(name) },
    policyTypes: ['Ingress'],
    ingress: [{ ports: [{ protocol: 'TCP', port: GAME_PORT }] }],
  },
})

/** The pod as little as it can be: no root, no privileges to gain, no token of the cluster's. */
const podSecurity: Obj = {
  automountServiceAccountToken: false,
  enableServiceLinks: false,
  securityContext: {
    runAsNonRoot: true,
    runAsUser: RUN_AS,
    runAsGroup: RUN_AS,
    fsGroup: RUN_AS,
    seccompProfile: { type: 'RuntimeDefault' },
  },
}

const containerSecurity: Obj = {
  allowPrivilegeEscalation: false,
  capabilities: { drop: ['ALL'] },
}

/**
 * The server: one replica with the world on a claim of its own. Only a readiness probe — the
 * image's own `mc-health` — no liveness: a world that takes long to load would be killed in a loop.
 */
const statefulSet = (name: string, spec: MinecraftDef.ServerSpec): K8sDef.KubeObject => {
  const labels = labelsOf(name)
  const data = configDataOf(spec)
  const secrets = secretVariablesOf(spec)

  return {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: metaFor(name, spec.namespace, labels),
    spec: {
      serviceName: name,
      replicas: 1,
      selector: { matchLabels: labels },
      template: {
        metadata: {
          labels,
          // a changed patch set or file is a changed pod: the annotation rolls it
          ...(data === undefined
            ? {}
            : { annotations: { [CONFIG_HASH_ANNOTATION]: fingerprintOf(JSON.stringify(data)) } }),
        },
        spec: {
          ...podSecurity,
          containers: [
            {
              name: CONTAINER,
              image: imageOf(spec),
              securityContext: containerSecurity,
              env: [
                ...Object.entries(environmentOf(spec)).map(([key, value]) => ({
                  name: key,
                  value,
                })),
                ...secrets,
              ],
              ports: [
                { name: 'minecraft', containerPort: GAME_PORT, protocol: 'TCP' },
                { name: 'rcon', containerPort: RCON_PORT, protocol: 'TCP' },
              ],
              resources: resourcesOf(spec),
              readinessProbe: {
                exec: { command: [...HEALTH_COMMAND] },
                initialDelaySeconds: READY_DELAY_SECONDS,
                periodSeconds: READY_PERIOD_SECONDS,
                failureThreshold: READY_FAILURES,
              },
              volumeMounts: [{ name: DATA_VOLUME, mountPath: DATA_PATH }, ...configMountsOf(spec)],
            },
          ],
          ...(data === undefined
            ? {}
            : { volumes: [{ name: CONFIG_VOLUME, configMap: { name: configMapOf(name) } }] }),
        },
      },
      volumeClaimTemplates: [{ metadata: { name: DATA_VOLUME }, spec: claimSpecOf(spec) }],
    },
  }
}

/**
 * The objects a server renders to, in the order they are applied: the Namespace it names (one that
 * is there already is left as it is), the ConfigMap of its patch set when it configures a file,
 * the Service, what may reach the pod, then the server.
 */
export const render = (name: string, spec: MinecraftDef.ServerSpec): K8sDef.KubeObject[] => [
  ...(spec.namespace === undefined ? [] : [namespaceObject(spec.namespace)]),
  ...configMap(name, spec),
  service(name, spec),
  networkPolicy(name, spec),
  statefulSet(name, spec),
]
