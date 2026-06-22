import fs from 'fs';
import path from 'path';
import { getPluginRoot } from './config.js';

const usersFile = path.join(getPluginRoot(), 'data', 'users.json');

const readJson = () => {
  if (!fs.existsSync(usersFile)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(usersFile, 'utf8')) || {};
  } catch (err) {
    logger.error(`[Zepp-Life-Plugin] 读取用户数据库失败:`, err);
    return {};
  }
};

const writeJson = (data) => {
  try {
    fs.mkdirSync(path.dirname(usersFile), { recursive: true });
    fs.writeFileSync(usersFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    logger.error(`[Zepp-Life-Plugin] 写入用户数据库失败:`, err);
  }
};

export class UserStore {
  static getUser(userId) {
    const data = readJson();
    return data[userId] || null;
  }

  static saveUser(userId, userData) {
    const data = readJson();
    data[userId] = {
      ...data[userId],
      ...userData,
      updatedAt: new Date().toISOString()
    };
    writeJson(data);
    return true;
  }

  static deleteUser(userId) {
    const data = readJson();
    if (data[userId]) {
      delete data[userId];
      writeJson(data);
      return true;
    }
    return false;
  }

  static getAllUsers() {
    const data = readJson();
    return Object.entries(data).map(([userId, val]) => ({
      userId,
      ...val
    }));
  }
}
