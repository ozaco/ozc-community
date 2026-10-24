/**
 * Who gets in: `discord` (Simple Discord Link) and `auth` (EasyAuth) — the mods they install, the
 * files they write, the token they take from a Secret, and the types they are refused on.
 */
import { describe, expect, it } from 'bun:test'

import { configFilesOf } from '../src/internal/config'
import { environmentOf, render } from '../src/internal/manifests'
import { ServerSpecSchema } from '../src/internal/schemas'
import type { MinecraftDef } from '../src/types'

type Obj = Record<string, unknown>

/** A field of an object, by a dotted path. */
const at = (object: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value as Obj | undefined)?.[key], object)

/** The files written whole, by path, parsed back as their mods read them. */
const filesOf = (spec: MinecraftDef.ServerSpec): Record<string, unknown> =>
  Object.fromEntries(
    configFilesOf(spec).map(file => [
      file.path,
      file.path.endsWith('.toml') ? Bun.TOML.parse(file.text) : JSON.parse(file.text),
    ]),
  )

const GUARDED: MinecraftDef.ServerSpec = {
  type: 'FABRIC',
  onlineMode: false,
  modrinth: ['fabric-api', 'lithium'],
  discord: { secret: 'minecraft-discord', roles: ['player'], banSync: true },
  auth: { session: 3600, passwordLength: 8, loginTries: 3, accountsPerIp: 2 },
}

describe('discord and auth', () => {
  it('install their mods beside the spec’s, with what those need', () => {
    expect(environmentOf(GUARDED)).toMatchObject({
      MODRINTH_PROJECTS: 'fabric-api,lithium,sdlink,easyauth',
      MODRINTH_DOWNLOAD_DEPENDENCIES: 'required',
    })
    // a pinned one is the spec's; a dependency setting of the spec's own stands
    expect(
      environmentOf({ ...GUARDED, modrinth: ['sdlink:3.4.5'], modrinthDependencies: 'none' }),
    ).toMatchObject({
      MODRINTH_PROJECTS: 'sdlink:3.4.5,easyauth',
      MODRINTH_DOWNLOAD_DEPENDENCIES: 'none',
    })
  })

  it("write Simple Discord Link's file: the token from its variable, access control on", () => {
    expect(filesOf(GUARDED)['simple-discord-link/simple-discord-link.toml']).toEqual({
      general: { configVersion: 37 },
      botConfig: { botToken: `\${CFG_DISCORD_TOKEN}` },
      accessControl: {
        enabled: true,
        requireDiscordMembership: true,
        requiredRoles: ['player'],
        banPlayerOnDiscordBan: true,
      },
    })
  })

  it("write EasyAuth's files, as far as the table sets them", () => {
    const files = filesOf(GUARDED)

    expect(files['EasyAuth/main.conf']).toEqual({ sessionTimeout: 3600, maxLoginTries: 3 })
    expect(files['EasyAuth/extended.conf']).toEqual({
      minPasswordLength: 8,
      ipLimit: { enabled: true, maxAccountsPerIp: 2 },
    })
    expect(filesOf({ type: 'FABRIC', auth: {} })).toEqual({
      'EasyAuth/main.conf': {},
      'EasyAuth/extended.conf': {},
    })
  })

  it('let configs of the same path lay keys over theirs, table into table', () => {
    const files = filesOf({
      ...GUARDED,
      configs: {
        'config/simple-discord-link/simple-discord-link.toml': {
          accessControl: { requireDiscordMembership: false },
          chat: { relayFullCommands: false },
        },
        'config/EasyAuth/main.conf': { hidePlayerCoords: true },
      },
    })

    expect(at(files['simple-discord-link/simple-discord-link.toml'], 'accessControl')).toEqual({
      enabled: true,
      requireDiscordMembership: false,
      requiredRoles: ['player'],
      banPlayerOnDiscordBan: true,
    })
    expect(at(files['simple-discord-link/simple-discord-link.toml'], 'chat')).toEqual({
      relayFullCommands: false,
    })
    expect(files['EasyAuth/main.conf']).toEqual({
      sessionTimeout: 3600,
      maxLoginTries: 3,
      hidePlayerCoords: true,
    })
  })

  it("take the bot's token from the Secret, never from the config", () => {
    const env = at(render('survival', GUARDED).at(-1), 'spec.template.spec.containers.0.env')

    expect(env).toContainEqual({
      name: 'CFG_DISCORD_TOKEN',
      valueFrom: { secretKeyRef: { name: 'minecraft-discord', key: 'token' } },
    })
    expect(JSON.stringify(render('survival', GUARDED))).not.toContain('"value":"${CFG')
  })

  it('are refused on a server type their mods are not built for', () => {
    const issues = (spec: Record<string, unknown>): string[] => {
      const parsed = ServerSpecSchema.safeParse(spec)

      return parsed.success ? [] : parsed.error.issues.map(issue => issue.path.join('.'))
    }

    expect(issues(GUARDED as Record<string, unknown>)).toEqual([])
    expect(issues({ discord: { secret: 'x' } })).toEqual(['discord'])
    expect(issues({ type: 'PAPER', auth: {} })).toEqual(['auth'])
    expect(issues({ type: 'FORGE', discord: { secret: 'x' }, auth: {} })).toEqual(['auth'])
    expect(issues({ type: 'NEOFORGE', discord: { secret: 'x' }, auth: {} })).toEqual([])
    expect(issues({ type: 'FABRIC', discord: {} })).toEqual(['discord.secret'])
  })
})
