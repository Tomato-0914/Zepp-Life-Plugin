import fs from 'fs';
import path from 'path';
import { getPluginRoot } from './config.js';
import YAML from 'yaml';

const dataDir = path.join(getPluginRoot(), 'data');

export class UserStore {
  static getFilePath(qq) {
    return path.join(dataDir, `${qq}.yaml`);
  }

  static getUser(qq) {
    const filePath = this.getFilePath(qq);
    if (!fs.existsSync(filePath)) return null;
    try {
      return YAML.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      logger.error(`[Zepp-Life-Plugin] 读取用户 ${qq} 配置失败:`, err);
      return null;
    }
  }

  static saveUser(qq, data) {
    const filePath = this.getFilePath(qq);
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const existing = this.getUser(qq) || {};
      const merged = {
        qq: String(qq),
        username: data.username || existing.username || '',
        password: data.password || existing.password || '',
        autoStep: data.autoStep !== undefined ? data.autoStep : (existing.autoStep !== undefined ? existing.autoStep : false),
        time: data.time || existing.time || '06:00',
        step: data.step !== undefined ? data.step : (existing.step !== undefined ? existing.step : 0),
        pushGroups: data.pushGroups !== undefined ? data.pushGroups : (existing.pushGroups || []),
        pushFriends: data.pushFriends !== undefined ? data.pushFriends : (existing.pushFriends || []),
        lastStep: data.lastStep !== undefined ? data.lastStep : (existing.lastStep || 0),
        lastTime: data.lastTime || existing.lastTime || ''
      };
      fs.writeFileSync(filePath, YAML.stringify(merged), 'utf8');
      return true;
    } catch (err) {
      logger.error(`[Zepp-Life-Plugin] 保存用户 ${qq} 配置失败:`, err);
      return false;
    }
  }

  static deleteUser(qq) {
    const filePath = this.getFilePath(qq);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        return true;
      } catch (err) {
        logger.error(`[Zepp-Life-Plugin] 删除用户 ${qq} 配置失败:`, err);
        return false;
      }
    }
    return false;
  }

  static getAllUsers() {
    if (!fs.existsSync(dataDir)) return [];
    try {
      const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.yaml'));
      return files.map(file => {
        const filePath = path.join(dataDir, file);
        try {
          return YAML.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
          logger.error(`[Zepp-Life-Plugin] 读取用户文件 ${file} 失败:`, err);
          return null;
        }
      }).filter(u => u !== null);
    } catch (err) {
      logger.error('[Zepp-Life-Plugin] 获取所有用户失败:', err);
      return [];
    }
  }
}
