/**
 * 配置文件管理器
 * 负责在 ~/.baizenotes/config/ 目录下读写 JSON 配置文件
 */
import { ipcMain, app } from 'electron'
import * as fs from 'fs-extra'
import * as path from 'path'

// 配置文件目录
const CONFIG_DIR = path.join(app.getPath('userData'), 'config')

// 确保配置目录存在
async function ensureConfigDir() {
  await fs.ensureDir(CONFIG_DIR)
}

// 读取配置文件
async function readConfig(configName: string): Promise<Record<string, unknown> | null> {
  try {
    await ensureConfigDir()
    const configPath = path.join(CONFIG_DIR, `${configName}.json`)
    
    if (await fs.pathExists(configPath)) {
      const data = await fs.readJson(configPath)
      return data
    }
    
    return null
  } catch (error) {
    console.error(`[ConfigManager] Error reading config ${configName}:`, error)
    return null
  }
}

// 写入配置文件
async function writeConfig(configName: string, data: Record<string, unknown>): Promise<boolean> {
  try {
    await ensureConfigDir()
    const configPath = path.join(CONFIG_DIR, `${configName}.json`)
    await fs.writeJson(configPath, data, { spaces: 2 })
    return true
  } catch (error) {
    console.error(`[ConfigManager] Error writing config ${configName}:`, error)
    return false
  }
}

// 删除配置文件
async function deleteConfig(configName: string): Promise<boolean> {
  try {
    const configPath = path.join(CONFIG_DIR, `${configName}.json`)
    if (await fs.pathExists(configPath)) {
      await fs.remove(configPath)
    }
    return true
  } catch (error) {
    console.error(`[ConfigManager] Error deleting config ${configName}:`, error)
    return false
  }
}

// 获取所有配置列表
async function listConfigs(): Promise<string[]> {
  try {
    await ensureConfigDir()
    const files = await fs.readdir(CONFIG_DIR)
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  } catch (error) {
    console.error('[ConfigManager] Error listing configs:', error)
    return []
  }
}

// 注册 IPC 处理器
export function registerConfigIpcHandlers() {
  // 读取配置
  ipcMain.handle('config:read', async (_, configName: string) => {
    return await readConfig(configName)
  })

  // 写入配置
  ipcMain.handle('config:write', async (_, configName: string, data: Record<string, unknown>) => {
    return await writeConfig(configName, data)
  })

  // 删除配置
  ipcMain.handle('config:delete', async (_, configName: string) => {
    return await deleteConfig(configName)
  })

  // 列出所有配置
  ipcMain.handle('config:list', async () => {
    return await listConfigs()
  })

  // 确保配置目录
  ipcMain.handle('config:ensure-dir', async () => {
    await ensureConfigDir()
    return true
  })

}

// 导出配置管理器实例
export const configManager = {
  readConfig,
  writeConfig,
  deleteConfig,
  listConfigs,
  CONFIG_DIR
}
