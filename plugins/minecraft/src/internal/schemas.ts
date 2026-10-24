import { z } from 'zod'

import { EASYAUTH_TYPES, SDLINK_TYPES } from '../const'
import type { MinecraftDef } from '../types'

/** `env` values are stringified at render. */
const EnvSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

/** What a configuration file holds at a leaf. */
const ScalarSchema = z.union([z.string(), z.number(), z.boolean()])

/** A configuration file's content: tables of scalars, lists of scalars, and tables again. */
const ConfigTreeSchema: z.ZodType<MinecraftDef.ConfigTree> = z.lazy(() =>
  z.record(z.string().min(1), z.union([ScalarSchema, z.array(ScalarSchema), ConfigTreeSchema])),
)

/** A file under `/data` the image can patch: a relative path, no climbing, a format it reads. */
const PatchableFileSchema = z
  .string()
  .regex(
    /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/u,
    'expected a path under /data, e.g. "plugins/Essentials/config.yml"',
  )
  .regex(
    /\.(?:ya?ml|json5?|toml|properties)$/u,
    'expected a .yml, .json, .toml or .properties file',
  )

/** A file under `config/` written whole: a format a mod reads, which the plugin can write. */
const ConfigFileSchema = z
  .string()
  .regex(
    /^(?!.*(?:^|\/)\.\.(?:\/|$))config\/.+$/u,
    'expected a path under config/, e.g. "config/EasyAuth/main.conf"',
  )
  .regex(
    /\.(?:conf|ya?ml|json5?|toml|properties)$/u,
    'expected a .conf, .yml, .json, .toml or .properties file',
  )

/** A variable's name, as a container takes it. */
const EnvNameSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/u, 'expected a variable name, e.g. "CFG_DISCORD_TOKEN"')

/** A value kept in a Secret: which Secret, which of its keys. */
const SecretRefSchema = z.object({ secret: z.string().min(1), key: z.string().min(1) })

/** `discord`: the Secret of the bot's token, and who of Discord gets in. */
const DiscordSchema = z.object({
  secret: z.string().min(1),
  key: z.string().min(1).optional(),
  channel: z
    .string()
    .regex(/^\d+$/u, 'expected a channel ID, e.g. "1234567890123456789" — as a string')
    .optional(),
  roles: z.array(z.string().min(1)).optional(),
  deniedRoles: z.array(z.string().min(1)).optional(),
  member: z.boolean().optional(),
  banSync: z.boolean().optional(),
})

/** `auth`: how hard EasyAuth asks. */
const AuthSchema = z.object({
  session: z.number().int().min(0).optional(),
  passwordLength: z.number().int().positive().optional(),
  loginTries: z.number().int().positive().optional(),
  kickAfter: z.number().int().positive().optional(),
  accountsPerIp: z.number().int().positive().optional(),
})

/** Whether a table that installs a mod is on a server type the mod is built for. */
const builtFor =
  (types: readonly string[]) =>
  (spec: { type?: string | undefined }): boolean =>
    types.includes(spec.type ?? '')

/** A player's name: whatever Mojang takes, as long as it is something. */
const PlayerSchema = z.string().min(1)

/** A domain as DNS spells it: labels of letters, digits and dashes, at least two of them. */
const DomainSchema = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/iu,
    'expected a domain, e.g. "play.example.com"',
  )

/**
 * One `[minecraft.<name>]` table. The heap is written the way Java reads it (`2G`, `1536M`); the
 * volume the way Kubernetes does (`10Gi`); a fixed NodePort only means something when the Service
 * is one.
 */
export const ServerSpecSchema: z.ZodType<MinecraftDef.ServerSpec> = z
  .object({
    image: z.string().min(1).optional(),
    tag: z.string().min(1).optional(),
    type: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/u, 'expected a server type as the image spells it, e.g. "PAPER"')
      .optional(),
    version: z.string().min(1).optional(),
    memory: z
      .string()
      .regex(/^\d+[MG]$/u, 'expected a Java heap size, e.g. "2G" or "1536M"')
      .optional(),
    cpu: z.string().min(1).optional(),
    cpuLimit: z.string().min(1).optional(),
    memoryLimit: z.string().min(1).optional(),
    namespace: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65_535).optional(),
    expose: z.enum(['none', 'nodeport', 'loadbalancer']).optional(),
    nodePort: z.number().int().min(30_000).max(32_767).optional(),
    storage: z
      .string()
      .regex(/^\d+(?:[EPTGMK]i|[EPTGMk])?$/u, 'expected a volume size, e.g. "10Gi"')
      .optional(),
    storageClass: z.string().min(1).optional(),
    motd: z.string().optional(),
    difficulty: z.enum(['peaceful', 'easy', 'normal', 'hard']).optional(),
    maxPlayers: z.number().int().positive().optional(),
    onlineMode: z.boolean().optional(),
    ops: z.array(PlayerSchema).optional(),
    whitelist: z.array(PlayerSchema).optional(),
    timezone: z.string().min(1).optional(),
    domain: DomainSchema.optional(),
    modrinth: z.array(z.string().min(1)).optional(),
    modrinthDependencies: z.enum(['none', 'required', 'optional']).optional(),
    mods: z.array(z.string().min(1)).optional(),
    plugins: z.array(z.string().min(1)).optional(),
    spiget: z.array(z.number().int().positive()).optional(),
    modpack: z.string().min(1).optional(),
    removeOldMods: z.boolean().optional(),
    backup: z.enum(['snapshot', 's3']).optional(),
    properties: z.record(z.string().min(1), ScalarSchema).optional(),
    paper: ConfigTreeSchema.optional(),
    paperWorld: ConfigTreeSchema.optional(),
    bukkit: ConfigTreeSchema.optional(),
    spigot: ConfigTreeSchema.optional(),
    files: z.record(PatchableFileSchema, ConfigTreeSchema).optional(),
    configs: z.record(ConfigFileSchema, ConfigTreeSchema).optional(),
    discord: DiscordSchema.optional(),
    auth: AuthSchema.optional(),
    jvmOpts: z.array(z.string().min(1)).optional(),
    aikarFlags: z.boolean().optional(),
    env: EnvSchema.optional(),
    secretEnv: z.record(EnvNameSchema, SecretRefSchema).optional(),
  })
  .refine(spec => spec.nodePort === undefined || spec.expose === 'nodeport', {
    message: '`nodePort` needs `expose = "nodeport"`',
    path: ['nodePort'],
  })
  .refine(
    spec => Object.keys(spec.env ?? {}).every(key => !Object.hasOwn(spec.secretEnv ?? {}, key)),
    { message: 'a variable is in `env` or in `secretEnv`, not in both', path: ['secretEnv'] },
  )
  .refine(spec => spec.discord === undefined || builtFor(SDLINK_TYPES)(spec), {
    message: `\`discord\` is a mod: it needs \`type\` = ${SDLINK_TYPES.join(', ')}`,
    path: ['discord'],
  })
  .refine(spec => spec.auth === undefined || builtFor(EASYAUTH_TYPES)(spec), {
    message: `\`auth\` is a mod: it needs \`type\` = ${EASYAUTH_TYPES.join(', ')}`,
    path: ['auth'],
  })

/** The whole `[minecraft.*]` namespace: a server per key. */
export const ServersSchema = z.record(z.string(), ServerSpecSchema)

/** Shared input for the commands that take servers: the variadic names (`-p`/`-s`/`-C` are inherited). */
export const serversInput = z.object({
  names: z
    .array(z.string())
    .default([])
    .describe('servers to target — none means every [minecraft.*]'),
})

/** `down` adds `--volumes`: the world goes too. */
export const downInput = serversInput.extend({
  volumes: z.boolean().default(false).describe("delete the world's volume as well"),
})

/**
 * `backup` adds `--s3` (push to the external backup target through the `longhorn-backup` class) and
 * `--class <name>` (another VolumeSnapshotClass). Neither → the spec's `backup`, else the cluster's
 * default class (an in-cluster snapshot).
 */
export const backupInput = serversInput.extend({
  s3: z.boolean().default(false).describe('push to the external backup target'),
  class: z.string().min(1).optional().describe('the VolumeSnapshotClass to use'),
})

/** `restore` / `prune` add `--from <snapshot>` to target one backup (else the latest / all). */
export const snapshotInput = serversInput.extend({
  from: z.string().min(1).optional().describe('one backup, by name'),
})

/** `logs`: one server, followed or not, the last lines or all of them. */
export const logsInput = z.object({
  name: z.string().min(1).describe('the server'),
  follow: z.boolean().default(false).describe('stream live until Ctrl-C'),
  tail: z.coerce.number().int().positive().optional().describe('only the last n lines'),
})
export const logsShort = { follow: 'f' }

/** `console`: one server, and the command as it would be typed at its console. */
export const consoleInput = z.object({
  name: z.string().min(1).describe('the server'),
  words: z.array(z.string()).min(1).describe('the console command, word by word'),
})
