import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import lodash from 'lodash';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_ROOT = path.resolve(__dirname, '../');

class ZeppConfig {
  constructor() {
    this.configPath = path.join(PLUGIN_ROOT, 'config', 'config', 'config.yaml');
    this.defaultPath = path.join(PLUGIN_ROOT, 'config', 'default_config', 'config.yaml');
    this.config = {};
    this.callbacks = [];
    this.init();
    this.watchConfig();
  }

  init() {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    this.mergeCfg();
    this.read();
  }

  mergeCfg() {
    try {
      if (!fs.existsSync(this.defaultPath)) {
        logger.error(`[Zepp-Life-Plugin] 缺失默认模板文件: ${this.defaultPath}`);
        return;
      }
      if (!fs.existsSync(this.configPath)) {
        fs.copyFileSync(this.defaultPath, this.configPath);
        logger.info(`[Zepp-Life-Plugin] 首次启动，已克隆默认配置文件。`);
        return;
      }

      const userDoc = YAML.parseDocument(fs.readFileSync(this.configPath, 'utf8'));
      const defDoc = YAML.parseDocument(fs.readFileSync(this.defaultPath, 'utf8'));
      let isUpdate = false;

      const merge = (userItems, defItems) => {
        const existingKeys = new Map();
        for (const item of userItems) {
          if (item && item.key && item.key.value !== undefined) {
            existingKeys.set(item.key.value, item.value);
          }
        }
        for (const item of defItems) {
          if (!item || !item.key || item.key.value === undefined) continue;
          if (!existingKeys.has(item.key.value)) {
            userItems.push(item);
            isUpdate = true;
          } else if (YAML.isMap(item.value)) {
            const userVal = existingKeys.get(item.key.value);
            if (userVal && userVal.items) {
              merge(userVal.items, item.value.items);
            }
          }
        }
      };

      if (userDoc.contents && userDoc.contents.items && defDoc.contents && defDoc.contents.items) {
        merge(userDoc.contents.items, defDoc.contents.items);
      }

      if (isUpdate) {
        fs.writeFileSync(this.configPath, userDoc.toString(), 'utf8');
        logger.info(`[Zepp-Life-Plugin] 已将新版的默认配置合并至本地配置文件。`);
      }
    } catch (err) {
      logger.error(`[Zepp-Life-Plugin] 合并默认配置失败:`, err);
    }
  }

  read() {
    try {
      if (fs.existsSync(this.configPath)) {
        const file = fs.readFileSync(this.configPath, 'utf8');
        const userConfig = YAML.parse(file) || {};
        const defaultFile = fs.readFileSync(this.defaultPath, 'utf8');
        const defaultConfig = YAML.parse(defaultFile) || {};
        this.config = lodash.merge({}, defaultConfig, userConfig);
      }
    } catch (err) {
      logger.error(`[Zepp-Life-Plugin] 读取配置文件失败:`, err);
    }
    return this.config;
  }

  get(key) {
    this.read();
    const realKey = key.startsWith('config.') ? key.replace('config.', '') : key;
    return lodash.get(this.config, realKey);
  }

  set(key, value) {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.init();
      }
      const fileContent = fs.readFileSync(this.configPath, 'utf8');
      const doc = YAML.parseDocument(fileContent);
      const keys = key.split('.').map(k => /^\d+$/.test(k) ? Number(k) : k);
      doc.setIn(keys, value);
      fs.writeFileSync(this.configPath, doc.toString(), 'utf8');
      this.read();
      return true;
    } catch (err) {
      logger.error(`[Zepp-Life-Plugin] 保存配置文件失败:`, err);
      return false;
    }
  }

  watchConfig() {
    if (fs.existsSync(this.configPath)) {
      let timer = null;
      try {
        fs.watch(this.configPath, (eventType) => {
          if (eventType === 'change') {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              try {
                this.read();
                logger.mark(`[Zepp-Life-Plugin][配置文件已更新] 热重载 config.yaml`);
                for (const cb of this.callbacks) {
                  try {
                    cb(this.config);
                  } catch (err) {
                    logger.error(`[Zepp-Life-Plugin][热更新监听回调异常]:`, err);
                  }
                }
              } catch (e) {
                logger.error(`[Zepp-Life-Plugin][解析配置文件失败]:`, e);
              }
            }, 100);
          }
        });
      } catch (err) {
        logger.error(`[Zepp-Life-Plugin] 监听配置文件失败:`, err);
      }
    }
  }

  watch(callback) {
    if (typeof callback === 'function') {
      this.callbacks.push(callback);
      try {
        callback(this.config);
      } catch (err) {
        logger.error(`[Zepp-Life-Plugin][初始化回调异常]:`, err);
      }
    }
  }
}

const configInstance = new ZeppConfig();
export default configInstance;
export const getPluginRoot = () => PLUGIN_ROOT;
