import { createTags } from 'std:shared'

/**
 * Failure tags for the `minecraft` plugin (`ozc:minecraft.*`):
 *   - `config`   — the `[minecraft.*]` config in `ozaco.toml` is invalid, or empty
 *   - `server`   — a named server isn't defined
 *   - `console`  — a console command could not be run, or the server refused it
 *   - `kind`     — a curated resource kind (pod, service, claim) could not be resolved
 *   - `snapshot` — the cluster cannot snapshot, or no snapshot was found to restore from
 */
export const MinecraftErrors = createTags(
  'ozc:minecraft',
  'config',
  'server',
  'console',
  'kind',
  'snapshot',
)

/** The image a server runs unless `[minecraft.<n>].image` names another, and its default tag. */
export const DEFAULT_IMAGE = 'itzg/minecraft-server'
export const DEFAULT_TAG = 'latest'

/** What a server is unless the spec says otherwise: the newest Paper, 2 GB of heap, 10 GB of world. */
export const DEFAULT_TYPE = 'PAPER'
export const DEFAULT_VERSION = 'LATEST'
export const DEFAULT_MEMORY = '2G'
export const DEFAULT_STORAGE = '10Gi'

/** The port players connect to, and the one the console talks to — inside the pod. */
export const GAME_PORT = 25_565
export const RCON_PORT = 25_575

/** Where the image keeps the world, the properties and everything else of a server. */
export const DATA_PATH = '/data'

/**
 * The image's own `minecraft` user and group, the server runs as from the start: never root, so
 * nothing in the pod can take back what it gave up. `/data` is that user's already — the image
 * hands it over at its first start.
 */
export const RUN_AS = 1000

/** The container's name in the pod, and the volume claim's. */
export const CONTAINER = 'minecraft'
export const DATA_VOLUME = 'data'

/** The image's own readiness check, and its console: both read the rcon settings the image wrote. */
export const HEALTH_COMMAND = ['mc-health'] as const
export const CONSOLE_COMMAND = 'rcon-cli'

/** How long one console command may take, end to end: a `stop` has to save the world first. */
export const CONSOLE_TIMEOUT_MS = 60_000

/** How long the readiness probe gives a server to come up before it is unready, in seconds. */
export const READY_DELAY_SECONDS = 30
export const READY_PERIOD_SECONDS = 10
export const READY_FAILURES = 30

/** The `VolumeSnapshot` API a backup is, and its group as a claim names it in `dataSource`. */
export const SNAPSHOT_API = 'snapshot.storage.k8s.io/v1'
export const SNAPSHOT_GROUP = 'snapshot.storage.k8s.io'

/**
 * The VolumeSnapshotClass `backup --s3` (or `backup = "s3"`) selects to push a backup to the external
 * backup target instead of taking an in-cluster snapshot — made by `ozc storage longhorn --snapshots`.
 */
export const S3_BACKUP_CLASS = 'longhorn-backup'

/** The volume a snapshot was taken from, as its label says. */
export const VOLUME_LABEL = 'ozc.dev/volume'

/** The SRV record a Minecraft client looks up for a domain, before it tries the game port. */
export const SRV_SERVICE = '_minecraft._tcp'

/** How long `restore` waits for the old claim to be gone before the new one takes its name. */
export const CLAIM_GONE_RETRIES = 30
export const CLAIM_GONE_INTERVAL_MS = 2000

/**
 * Where the server's files are patched from: a ConfigMap of one patch set, mounted into the pod,
 * named to the image through `PATCH_DEFINITIONS` (`mc-image-helper patch` applies it at start).
 */
export const PATCHES_DIR = '/patches'
export const PATCHES_FILE = 'patches.json'

/**
 * Where the files of `configs` are mounted, one by one: the image copies the directory into
 * `/data/config` at every start (filling in `${CFG_…}`), before the server and its mods read it.
 * The spec's paths start with `config/`; under this directory they do not.
 */
export const CONFIGS_DIR = '/config'
export const CONFIGS_PREFIX = 'config/'

/** The volume of the ConfigMap that carries the patch set and the files of `configs`. */
export const CONFIG_VOLUME = 'config'

/**
 * `discord`: Simple Discord Link (Modrinth `sdlink`), its configuration file, and the version of
 * that file's layout — written into it, the mod reads the file as it is (a file without one is
 * one it migrates, and it cannot read one that has none).
 */
export const SDLINK_PROJECT = 'sdlink'
export const SDLINK_CONFIG = 'config/simple-discord-link/simple-discord-link.toml'
export const SDLINK_CONFIG_VERSION = 37

/** The variable the bot's token rides in, from the Secret into the mod's file, and the key it has there by default. */
export const DISCORD_TOKEN_VARIABLE = 'CFG_DISCORD_TOKEN'
export const DISCORD_TOKEN_KEY = 'token'

/** `auth`: EasyAuth (Modrinth `easyauth`) and the two of its files the table writes. */
export const EASYAUTH_PROJECT = 'easyauth'
export const EASYAUTH_MAIN = 'config/EasyAuth/main.conf'
export const EASYAUTH_EXTENDED = 'config/EasyAuth/extended.conf'

/** The server types each mod is built for, as the image spells them. */
export const SDLINK_TYPES = ['FABRIC', 'QUILT', 'FORGE', 'NEOFORGE'] as const
export const EASYAUTH_TYPES = ['FABRIC', 'QUILT', 'NEOFORGE'] as const

/** The files the spec's named tables stand for, under `/data`. */
export const CONFIG_FILES = {
  paper: 'config/paper-global.yml',
  paperWorld: 'config/paper-world-defaults.yml',
  bukkit: 'bukkit.yml',
  spigot: 'spigot.yml',
} as const

/** The file formats the image can patch, by extension. */
export const PATCHABLE = ['.yml', '.yaml', '.json', '.json5', '.toml', '.properties'] as const

/** Pod-template annotation carrying the config's fingerprint: a changed config rolls the pod. */
export const CONFIG_HASH_ANNOTATION = 'ozc.dev/config-hash'

/** Standard labels stamped on every object a server generates (so `kube` can find its resources). */
export const APP_LABEL = 'app.kubernetes.io/name'
export const COMPONENT_LABEL = 'app.kubernetes.io/component'
export const COMPONENT = 'minecraft-server'
export const MANAGED_LABEL = 'app.kubernetes.io/managed-by'
export const MANAGED_BY = 'ozc'
