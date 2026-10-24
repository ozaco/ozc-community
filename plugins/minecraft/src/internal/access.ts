import {
  DISCORD_TOKEN_KEY,
  DISCORD_TOKEN_VARIABLE,
  EASYAUTH_EXTENDED,
  EASYAUTH_MAIN,
  EASYAUTH_PROJECT,
  SDLINK_CONFIG,
  SDLINK_CONFIG_VERSION,
  SDLINK_PROJECT,
} from '../const'
import type { MinecraftDef } from '../types'

/** A table of what is set: the keys whose value is `undefined` left out. */
const defined = (
  entries: Record<string, MinecraftDef.ConfigValue | undefined>,
): MinecraftDef.ConfigTree =>
  Object.fromEntries(
    Object.entries(entries).filter(
      (entry): entry is [string, MinecraftDef.ConfigValue] => entry[1] !== undefined,
    ),
  )

/** A variable as the image fills it into a file at start. */
const placeholderOf = (variable: string): string => `\${${variable}}`

/**
 * Simple Discord Link's file: the bot's token from its variable, and its access control on — a
 * name not linked to a Discord account gets a code at the door, to give the bot. The bot that is
 * not up lets everyone in (the mod's way): `auth` is what still asks them.
 */
const discordConfig = (discord: MinecraftDef.Discord): MinecraftDef.ConfigTree => ({
  general: { configVersion: SDLINK_CONFIG_VERSION },
  botConfig: { botToken: placeholderOf(DISCORD_TOKEN_VARIABLE) },
  accessControl: defined({
    enabled: true,
    requireDiscordMembership: discord.member ?? true,
    requiredRoles: discord.roles,
    deniedRoles: discord.deniedRoles,
    banPlayerOnDiscordBan: discord.banSync,
  }),
})

/** EasyAuth's files, as far as the table sets them. */
const authConfigs = (auth: MinecraftDef.Auth): Record<string, MinecraftDef.ConfigTree> => ({
  [EASYAUTH_MAIN]: defined({
    sessionTimeout: auth.session,
    maxLoginTries: auth.loginTries,
    kickTimeout: auth.kickAfter,
  }),
  [EASYAUTH_EXTENDED]: defined({
    minPasswordLength: auth.passwordLength,
    ipLimit:
      auth.accountsPerIp === undefined
        ? undefined
        : { enabled: true, maxAccountsPerIp: auth.accountsPerIp },
  }),
})

/** The Modrinth projects `discord` and `auth` install. */
export const accessProjectsOf = (spec: MinecraftDef.ServerSpec): string[] => [
  ...(spec.discord === undefined ? [] : [SDLINK_PROJECT]),
  ...(spec.auth === undefined ? [] : [EASYAUTH_PROJECT]),
]

/** The files `discord` and `auth` write, by path under `/data`. */
export const accessConfigsOf = (
  spec: MinecraftDef.ServerSpec,
): Record<string, MinecraftDef.ConfigTree> => ({
  ...(spec.discord === undefined ? {} : { [SDLINK_CONFIG]: discordConfig(spec.discord) }),
  ...(spec.auth === undefined ? {} : authConfigs(spec.auth)),
})

/** The variables `discord` takes from a Secret: the bot's token. */
export const accessSecretsOf = (
  spec: MinecraftDef.ServerSpec,
): Record<string, MinecraftDef.SecretRef> =>
  spec.discord === undefined
    ? {}
    : {
        [DISCORD_TOKEN_VARIABLE]: {
          secret: spec.discord.secret,
          key: spec.discord.key ?? DISCORD_TOKEN_KEY,
        },
      }
