/**
 * app-paths.ts 单元测试
 * 覆盖：用户数据目录的创建与幂等、各类路径的开发/打包分支、
 * initUserDataDirectory 子目录创建、getAppPathsInfo 汇总
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as path from 'path'
import * as fs from 'fs-extra'

const electronState = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        paths: {
            home: `${base}/baize-vitest-app-paths/home`,
            exe: 'C:/Program Files/BaiZeNotes/BaiZeNotes.exe'
        } as Record<string, string>,
        packaged: false,
        appPath: `${base}/baize-vitest-app-paths/app`
    }
})

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn((name: string) => electronState.paths[name]),
        getAppPath: vi.fn(() => electronState.appPath),
        get isPackaged() {
            return electronState.packaged
        }
    },
    BrowserWindow: class {}
}))

import {
    getUserDataPath,
    getAppResourcesPath,
    getConfigPath,
    getIconPath,
    getThemesPath,
    getKatexPath,
    getMermaidPath,
    getPlantumlPath,
    initUserDataDirectory,
    getAppPathsInfo
} from '../../src/main/utils/app-paths'

const HOME = electronState.paths.home
const USER_DATA = path.join(HOME, '.baizenotes')

describe('app-paths', () => {
    beforeEach(() => {
        fs.rmSync(HOME, { recursive: true, force: true })
        electronState.packaged = false
        delete (process as { resourcesPath?: string }).resourcesPath
    })

    afterEach(() => {
        electronState.packaged = false
        delete (process as { resourcesPath?: string }).resourcesPath
    })

    describe('getUserDataPath', () => {
        it('should create and return the .baizenotes directory under home', () => {
            const result = getUserDataPath()
            expect(result).toBe(USER_DATA)
            expect(fs.existsSync(USER_DATA)).toBe(true)
        })

        it('should be idempotent when the directory already exists', () => {
            const first = getUserDataPath()
            const second = getUserDataPath()
            expect(first).toBe(second)
            expect(fs.statSync(USER_DATA).isDirectory()).toBe(true)
        })

        it('should derive the config path from the user data path', () => {
            expect(getConfigPath()).toBe(path.join(USER_DATA, 'config'))
        })
    })

    describe('resource paths in dev mode', () => {
        it('should use the app path resources directory when unpackaged', () => {
            expect(getAppResourcesPath()).toBe(path.join(electronState.appPath, 'resources'))
        })

        it('should derive icon/themes/katex/mermaid/plantuml paths from app resources', () => {
            const resources = path.join(electronState.appPath, 'resources')
            expect(getIconPath()).toBe(path.join(resources, 'icon'))
            expect(getThemesPath()).toBe(path.join(resources, 'themes'))
            expect(getKatexPath()).toBe(path.join(resources, 'katex'))
            expect(getMermaidPath()).toBe(path.join(resources, 'mermaid'))
            expect(getPlantumlPath()).toBe(path.join(resources, 'plantuml'))
        })
    })

    describe('resource paths when packaged', () => {
        it('should use process.resourcesPath when packaged', () => {
            electronState.packaged = true
            Object.defineProperty(process, 'resourcesPath', {
                value: 'C:/installed/BaiZeNotes/resources',
                configurable: true
            })
            expect(getAppResourcesPath()).toBe('C:/installed/BaiZeNotes/resources')
        })

        it('should derive icon/themes/katex/mermaid/plantuml from process.resourcesPath', () => {
            electronState.packaged = true
            Object.defineProperty(process, 'resourcesPath', {
                value: 'C:/installed/BaiZeNotes/resources',
                configurable: true
            })
            const resources = path.join('C:/installed/BaiZeNotes/resources')
            expect(getIconPath()).toBe(path.join(resources, 'icon'))
            expect(getThemesPath()).toBe(path.join(resources, 'themes'))
            expect(getKatexPath()).toBe(path.join(resources, 'katex'))
            expect(getMermaidPath()).toBe(path.join(resources, 'mermaid'))
            expect(getPlantumlPath()).toBe(path.join(resources, 'plantuml'))
        })
    })

    describe('initUserDataDirectory', () => {
        it('should create the config/cache/logs subdirectories', () => {
            initUserDataDirectory()
            for (const dir of ['config', 'cache', 'logs']) {
                const dirPath = path.join(USER_DATA, dir)
                expect(fs.existsSync(dirPath), dir).toBe(true)
                expect(fs.statSync(dirPath).isDirectory(), dir).toBe(true)
            }
        })

        it('should be idempotent on repeated calls', () => {
            initUserDataDirectory()
            initUserDataDirectory()
            expect(fs.existsSync(path.join(USER_DATA, 'config'))).toBe(true)
            expect(fs.existsSync(path.join(USER_DATA, 'cache'))).toBe(true)
            expect(fs.existsSync(path.join(USER_DATA, 'logs'))).toBe(true)
        })
    })

    describe('getAppPathsInfo', () => {
        it('should aggregate all path info', () => {
            const info = getAppPathsInfo()
            expect(info.userData).toBe(USER_DATA)
            expect(info.appResources).toBe(path.join(electronState.appPath, 'resources'))
            expect(info.config).toBe(path.join(USER_DATA, 'config'))
            expect(info.icon).toBe(path.join(electronState.appPath, 'resources', 'icon'))
            expect(info.themes).toBe(path.join(electronState.appPath, 'resources', 'themes'))
            expect(info.katex).toBe(path.join(electronState.appPath, 'resources', 'katex'))
            expect(info.mermaid).toBe(path.join(electronState.appPath, 'resources', 'mermaid'))
            expect(info.plantuml).toBe(path.join(electronState.appPath, 'resources', 'plantuml'))
            expect(info.exe).toBe(electronState.paths.exe)
            expect(info.home).toBe(HOME)
        })
    })
})
