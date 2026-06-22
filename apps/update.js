import plugin from '../../../lib/plugins/plugin.js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { getPluginRoot } from '../components/config.js';

const PLUGIN_ROOT = getPluginRoot();
const RESTART_DATA_PATH = path.join(PLUGIN_ROOT, 'data', 'restart.json');

const execCommand = (cmd, options = {}) => {
  return new Promise((resolve) => {
    exec(cmd, options, (error, stdout, stderr) => {
      resolve({
        error,
        stdout: String(stdout).trim(),
        stderr: String(stderr).trim()
      });
    });
  });
};

let updating = false;

export class ZeppUpdate extends plugin {
  constructor() {
    super({
      name: 'Zepp-Life-更新',
      dsc: '插件升级更新与自动重启',
      event: 'message',
      priority: -Infinity,
      rule: [
        {
          reg: /^#?(刷步|zepp|zepplife)更新$/i,
          fnc: 'doUpdate'
        }
      ]
    });

    this.checkRestartStatus();
  }

  async checkRestartStatus() {
    try {
      if (!fs.existsSync(RESTART_DATA_PATH)) return;

      const dataStr = fs.readFileSync(RESTART_DATA_PATH, 'utf-8');
      const restartData = JSON.parse(dataStr);
      fs.unlinkSync(RESTART_DATA_PATH);

      setTimeout(async () => {
        const msg = `✅ ${restartData.title || 'Zepp-Life-Plugin'} 更新并重启成功！\n当前已是最新版本，欢迎继续使用！`;
        if (typeof Bot === 'undefined') return;

        try {
          if (restartData.isGroup) {
            Bot.pickGroup(restartData.id).sendMsg(msg);
          } else {
            Bot.pickUser(restartData.id).sendMsg(msg);
          }
        } catch (err) {
          logger.error(`[Zepp-Life-Plugin] 重启成功通知发送失败: ${err.message}`);
        }
      }, 6000);
    } catch (err) {
      // 忽略文件不存在等常规错误
    }
  }

  async doUpdate(e) {
    if (!e.isMaster) {
      await e.reply('❌ 仅限我的主人可以进行版本升级喵~');
      return false;
    }
    if (updating) {
      await e.reply('⏳ 已经在努力更新中了，请不要着急...');
      return false;
    }
    updating = true;
    const messages = [];

    try {
      logger.mark('[Zepp-Life-Plugin] 开始插件更新');
      await e.reply('⏳ 开始拉取最新代码...');

      const oldCommit = await this.getCommitHash();
      const ret = await execCommand('git pull', { cwd: PLUGIN_ROOT });

      if (ret.error) {
        messages.push(`❌ 更新失败：\n${ret.error.message || ret.stderr}`);
        await this.sendAll(messages, e);
        return false;
      }

      const isUpToDate = /Already up|已经是最新/.test(ret.stdout);
      if (isUpToDate) {
        const time = await this.getLastCommitTime();
        messages.push(`☁️ Zepp-Life-Plugin 已是最新版本\n最后更新：${time}`);
        await this.sendAll(messages, e);
        return false;
      }

      const newCommit = await this.getCommitHash();
      const updateLog = await this.getUpdateLog(oldCommit, newCommit);
      const time = await this.getLastCommitTime();

      messages.push(`✅ 代码拉取完成`);
      messages.push(`🕒 提交时间：${time}`);
      if (updateLog) messages.push(`📝 更新日志：\n${updateLog}`);

      // 检测依赖变更
      if (/package\.json/.test(ret.stdout)) {
        await e.reply('📦 检测到依赖项变更，正在执行 pnpm install，请稍候...');
        const installRet = await execCommand('pnpm install', { cwd: PLUGIN_ROOT, timeout: 120000 });
        if (installRet.error) {
          messages.push(`⚠️ 依赖自动安装失败，建议稍后手动检查：\n${installRet.stderr}`);
        } else {
          messages.push('✅ 依赖库更新完成');
        }
      }

      // 保存重启上下文
      const restartInfo = {
        isGroup: !!e.isGroup,
        id: e.isGroup ? e.group_id : e.user_id,
        title: 'Zepp-Life-Plugin',
        time: new Date().getTime()
      };

      fs.mkdirSync(path.dirname(RESTART_DATA_PATH), { recursive: true });
      fs.writeFileSync(RESTART_DATA_PATH, JSON.stringify(restartInfo), 'utf-8');

      await this.sendAll(messages, e);
      await e.reply('🔁 更新已就绪，开始重启进程以加载新代码...');

      // 3秒后退出，由 pm2 或守护程序自动拉起
      setTimeout(() => {
        logger.mark('[Zepp-Life-Plugin] 正在通过 process.exit(0) 触发重启');
        process.exit(0);
      }, 3000);

    } catch (err) {
      logger.error(`[Zepp-Life-Plugin] 更新异常: ${err}`);
      await e.reply(`❌ 更新出错：${err.message}`);
    } finally {
      updating = false;
    }
    return true;
  }

  async getLastCommitTime() {
    const { stdout } = await execCommand('git log -1 --pretty=%cd --date=format:"%F %T"', { cwd: PLUGIN_ROOT });
    return stdout || '未知';
  }

  async getCommitHash() {
    const { stdout } = await execCommand('git rev-parse --short HEAD', { cwd: PLUGIN_ROOT });
    return stdout || '';
  }

  async getUpdateLog(from, to) {
    if (!from || !to || from === to) return '';
    const { stdout } = await execCommand(`git log ${from}..${to} --pretty=format:"%h: %s"`, { cwd: PLUGIN_ROOT });
    return stdout || '';
  }

  async sendAll(msgs, e) {
    const fullText = msgs.join('\n\n');
    if (e.isGroup && typeof e.group?.makeForwardMsg === 'function') {
      try {
        const botInfo = e.bot || {};
        const forwards = msgs.map(msg => ({
          user_id: botInfo.uin || e.self_id || 10000,
          nickname: botInfo.nickname || '步数助手',
          message: msg
        }));
        const forward = await e.group.makeForwardMsg(forwards);
        await e.reply(forward);
        return;
      } catch (err) {
        logger.error('[Zepp-Life-Plugin] 合并转发失败，降级为文本');
      }
    }
    await e.reply(fullText);
  }
}
