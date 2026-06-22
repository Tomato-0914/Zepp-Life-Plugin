import plugin from '../../../lib/plugins/plugin.js';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import fs from 'fs';
import path from 'path';
import { getPluginRoot } from '../components/config.js';

const PLUGIN_ROOT = getPluginRoot();
const packageJson = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8'));
const version = packageJson.version;

export class ZeppHelp extends plugin {
  constructor() {
    super({
      name: 'Zepp-Life-帮助',
      dsc: 'Zepp-Life 刷步帮助',
      event: 'message',
      priority: 999,
      rule: [
        {
          reg: /^#?(zepp|刷步)帮助$/i,
          fnc: 'help'
        }
      ]
    });
  }

  async help(e) {
    const htmlPath = path.join(PLUGIN_ROOT, 'resources', 'html', 'help.html');

    if (!fs.existsSync(htmlPath)) {
      await e.reply('❌ 帮助模板文件不存在喵~');
      return true;
    }

    try {
      const pluginName = path.basename(PLUGIN_ROOT);
      const plgPath = `${process.cwd().replace(/\\/g, '/')}/plugins/${pluginName}`;

      const img = await puppeteer.screenshot('zepp-life-help', {
        tplFile: htmlPath,
        type: 'jpeg',
        quality: 90,
        version: version,
        plgPath: plgPath,
      });

      if (img) {
        await e.reply(img);
      } else {
        await e.reply('❌ 生成图片帮助失败喵~');
      }
    } catch (err) {
      logger.error('[Zepp-Life-Plugin] 帮助生成错误：', err);
      await e.reply(`❌ 帮助生成失败，原因：${err.message}`);
    }
    return true;
  }
}
