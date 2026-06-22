import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const PLUGIN_PATH = path.dirname(__filename);
const PLUGIN_NAME = path.basename(PLUGIN_PATH);
const APPS_PATH = path.join(PLUGIN_PATH, 'apps');

logger.info(`-----------------------------------`);
logger.info(`[${PLUGIN_NAME}] 正在初始化 Zepp Life 步数修改助手...`);

// 递归获取目录下所有的 .js 文件
function getJsFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getJsFiles(filePath));
    } else if (file.endsWith('.js')) {
      results.push(filePath);
    }
  });
  return results;
}

let apps = {};
const jsFiles = getJsFiles(APPS_PATH);

for (let file of jsFiles) {
  try {
    const relativePath = './' + path.relative(PLUGIN_PATH, file).replace(/\\/g, '/');
    const module = await import(relativePath);
    
    for (let key of Object.keys(module)) {
      if (typeof module[key] === 'function' && module[key].prototype) {
        let name = key;
        if (apps[name]) {
          let counter = 1;
          while (apps[`${name}_${counter}`]) {
            counter++;
          }
          name = `${name}_${counter}`;
        }
        apps[name] = module[key];
      }
    }
  } catch (err) {
    logger.error(`[${PLUGIN_NAME}] 载入组件 [${file}] 发生错误:`, err);
  }
}

logger.info(`[${PLUGIN_NAME}] 成功加载 [${Object.keys(apps).length}] 个核心功能模块。`);
logger.info(`-----------------------------------`);

export { apps };
