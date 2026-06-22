import plugin from '../../../lib/plugins/plugin.js';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import fs from 'fs';
import path from 'path';
import { UserStore } from '../components/userStore.js';
import { getPluginRoot } from '../components/config.js';

const PLUGIN_ROOT = getPluginRoot();
const packageJson = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8'));
const version = packageJson.version;

function validateStepParam(param) {
  const p = param.trim();
  if (p === '0') {
    return { valid: true, value: 0 };
  }

  // 检查是否为范围如 15000-25000
  const rangeMatch = p.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1]);
    const max = parseInt(rangeMatch[2]);
    if (min < 0 || min > 98800 || max < 0 || max > 98800) {
      return { valid: false, error: '输入错误，自动步数上下限均不能超过 98,800 步喵~' };
    }
    if (min > max) {
      return { valid: false, error: '范围无效，最小值不能大于最大值喵~' };
    }
    return { valid: true, value: `${min}-${max}` };
  }

  // 检查是否为单个正整数
  const singleMatch = p.match(/^(\d+)$/);
  if (singleMatch) {
    const val = parseInt(singleMatch[1]);
    if (val < 0 || val > 98800) {
      return { valid: false, error: '输入错误，步数数值需在 0 到 98,800 之间喵~' };
    }
    return { valid: true, value: val };
  }

  return { valid: false, error: '格式错误。请输入单个数字(如 20000)或步数范围(如 15000-25000)，输入 0 代表清除固定步数。' };
}

export class ZeppSetting extends plugin {
  constructor() {
    super({
      name: 'Zepp-Life-刷步设置',
      dsc: '小米运动/Zepp Life 刷步参数与推送目标设置',
      event: 'message',
      priority: 999,
      rule: [
        {
          reg: /^#?(刷步|zepp)设置$/i,
          fnc: 'settingsHelp'
        },
        {
          reg: /^#?刷步设置自动刷步\s*(开启|关闭|)?$/i,
          fnc: 'toggleAutoStep'
        },
        {
          reg: /^#?刷步设置自动刷步时间\s*(\d{1,2})[：:](\d{1,2})$/i,
          fnc: 'changeAutoTime'
        },
        {
          reg: /^#?刷步设置自动刷步(数|步数)\s*(.*)?$/i,
          fnc: 'setAutoStepCount'
        },
        {
          reg: /^#?刷步设置推送群\s*(.*)?$/i,
          fnc: 'setAutoPushGroups'
        },
        {
          reg: /^#?刷步设置自动推送好友\s*(.*)?$/i,
          fnc: 'setAutoPushFriends'
        }
      ]
    });
  }

  // 1. 设置引导帮助图片卡片
  async settingsHelp(e) {
    const htmlPath = path.join(PLUGIN_ROOT, 'resources', 'html', 'setting.html');

    if (!fs.existsSync(htmlPath)) {
      await e.reply('❌ 设置面板模板文件不存在喵~');
      return true;
    }

    try {
      const pluginName = path.basename(PLUGIN_ROOT);
      const plgPath = `${process.cwd().replace(/\\/g, '/')}/plugins/${pluginName}`;

      const img = await puppeteer.screenshot('zepp-life-setting', {
        tplFile: htmlPath,
        type: 'jpeg',
        quality: 90,
        version: version,
        plgPath: plgPath,
      });

      if (img) {
        await e.reply(img);
      } else {
        await e.reply('❌ 生成图片设置面板失败喵~');
      }
    } catch (err) {
      logger.error('[Zepp-Life-Plugin] 设置面板生成错误：', err);
      await e.reply(`❌ 设置面板生成失败，原因：${err.message}`);
    }
    return true;
  }

  // 2. 开启/关闭自动刷步
  async toggleAutoStep(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 您当前未绑定 Zepp Life 账号。');
      return true;
    }

    const reg = /^#?刷步设置自动刷步\s*(开启|关闭|)?$/i;
    const match = e.msg.match(reg);
    let auto = true;

    if (match && match[1]) {
      const mode = match[1].trim();
      if (mode === '关闭') {
        auto = false;
      }
    } else {
      auto = user.autoStep === false;
    }

    UserStore.saveUser(e.user_id, { autoStep: auto });
    await e.reply(`✅ 每日自动刷步已设定为：【${auto ? '开启' : '关闭'}】。`);
    return true;
  }

  // 3. 修改自动刷步时间
  async changeAutoTime(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 您当前未绑定 Zepp Life 账号。');
      return true;
    }

    const reg = /^#?刷步设置自动刷步时间\s*(\d{1,2})[：:](\d{1,2})$/i;
    const match = e.msg.match(reg);
    if (!match) return false;

    let hour = parseInt(match[1]);
    let minute = parseInt(match[2]);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      await e.reply('❌ 时间格式错误，小时范围为 0-23，分钟范围为 0-59。');
      return true;
    }

    const pad = (num) => String(num).padStart(2, '0');
    const timeStr = `${pad(hour)}:${pad(minute)}`;

    UserStore.saveUser(e.user_id, { time: timeStr });
    await e.reply(`✅ 已成功将每日自动刷步时间设置为每天【${timeStr}】。`);
    return true;
  }

  // 4. 设置自动刷步数或范围
  async setAutoStepCount(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 您当前未绑定 Zepp Life 账号，请私聊发送【#zepp绑定】进行绑定。');
      return true;
    }

    const reg = /^#?刷步设置自动刷步(数|步数)\s*(.*)?$/i;
    const match = e.msg.match(reg);
    const rawParam = match && match[2] ? match[2].trim() : '';

    if (rawParam) {
      const res = validateStepParam(rawParam);
      if (!res.valid) {
        await e.reply(`❌ ${res.error}`);
        return true;
      }

      UserStore.saveUser(e.user_id, { step: res.value });
      if (res.value === 0) {
        await e.reply(`✅ 已成功清除自动刷步数，此后自动刷步将使用全局随机范围。`);
      } else if (typeof res.value === 'string') {
        await e.reply(`✅ 已成功将每日自动刷步数范围设置为：【${res.value}】步。`);
      } else {
        await e.reply(`✅ 已成功将每日自动刷步数固定为每天【${res.value}】步。`);
      }
      return true;
    } else {
      await e.reply('请输入需要设置的自动刷步数。支持固定步数(如 20000)或随机步数范围(如 15000-25000)，输入 0 代表使用全局随机范围：');
      this.setContext('setAutoStepCountGetParam');
      return true;
    }
  }

  async setAutoStepCountGetParam() {
    const e = this.e;
    const msg = e.msg ? e.msg.trim() : '';

    if (msg === '取消') {
      await e.reply('已取消自动刷步数设置。');
      this.finish('setAutoStepCountGetParam');
      return true;
    }

    const res = validateStepParam(msg);
    if (!res.valid) {
      await e.reply(`❌ ${res.error}\n\n请重新输入，或回复“取消”退出当前操作：`);
      this.setContext('setAutoStepCountGetParam');
      return true;
    }

    this.finish('setAutoStepCountGetParam');

    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 绑定失效，请重新绑定账号。');
      return true;
    }

    UserStore.saveUser(e.user_id, { step: res.value });
    if (res.value === 0) {
      await e.reply(`✅ 已成功清除自动刷步数，此后自动刷步将使用全局随机范围。`);
    } else if (typeof res.value === 'string') {
      await e.reply(`✅ 已成功将每日自动刷步数范围设置为：【${res.value}】步。`);
    } else {
      await e.reply(`✅ 已成功将每日自动刷步数固定为每天【${res.value}】步。`);
    }
    return true;
  }

  // 5. 设置自动推送群聊
  async setAutoPushGroups(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 您当前未绑定 Zepp Life 账号，请私聊发送【#zepp绑定】进行绑定。');
      return true;
    }

    const reg = /^#?刷步设置推送群\s*(.*)?$/i;
    const match = e.msg.match(reg);
    const rawParam = match && match[1] ? match[1].trim() : '';

    // 如果在群聊中发送且没有带参数，则将当前群加入或移出推送列表
    if (e.isGroup && !rawParam) {
      let pushGroups = user.pushGroups || [];
      const currentGroup = String(e.group_id);
      if (pushGroups.includes(currentGroup)) {
        pushGroups = pushGroups.filter(g => g !== currentGroup);
        UserStore.saveUser(e.user_id, { pushGroups });
        await e.reply(`✅ 已从您的自动刷步推送列表中移除当前群聊【${currentGroup}】。`);
      } else {
        pushGroups.push(currentGroup);
        UserStore.saveUser(e.user_id, { pushGroups });
        await e.reply(`✅ 已将当前群聊【${currentGroup}】添加到您的自动刷步推送列表中。`);
      }
      return true;
    }

    if (rawParam) {
      if (rawParam === '关闭' || rawParam === '清空' || rawParam === '0') {
        UserStore.saveUser(e.user_id, { pushGroups: [] });
        await e.reply(`✅ 已清空自动刷步推送群聊列表。`);
        return true;
      }

      // 解析逗号/空格分隔的群号
      const groups = rawParam.split(/[,，\s]+/).map(g => g.trim()).filter(g => /^\d+$/.test(g));
      if (groups.length === 0) {
        await e.reply(`❌ 格式错误，请输入有效的群号列表（多个群号用逗号隔开，或输入“关闭”清空列表）。`);
        return true;
      }

      UserStore.saveUser(e.user_id, { pushGroups: groups });
      await e.reply(`✅ 已成功将自动刷步推送群聊设置为：\n${groups.join('\n')}`);
      return true;
    } else {
      const currentList = user.pushGroups && user.pushGroups.length > 0 ? user.pushGroups.join(', ') : '暂无';
      await e.reply(`当前推送群聊：${currentList}\n\n请发送需要推送的群号列表（多个群号用逗号隔开，输入“关闭”清空列表，输入“取消”退出当前操作）：`);
      this.setContext('setAutoPushGroupsGetInput');
      return true;
    }
  }

  async setAutoPushGroupsGetInput() {
    const e = this.e;
    const msg = e.msg ? e.msg.trim() : '';

    if (msg === '取消') {
      await e.reply('已取消设置。');
      this.finish('setAutoPushGroupsGetInput');
      return true;
    }

    if (msg === '关闭' || msg === '清空' || msg === '0') {
      this.finish('setAutoPushGroupsGetInput');
      const user = UserStore.getUser(e.user_id);
      if (user) {
        UserStore.saveUser(e.user_id, { pushGroups: [] });
      }
      await e.reply(`✅ 已清空自动刷步推送群聊列表。`);
      return true;
    }

    const groups = msg.split(/[,，\s]+/).map(g => g.trim()).filter(g => /^\d+$/.test(g));
    if (groups.length === 0) {
      await e.reply(`❌ 格式错误。请输入有效的数字群号（多个用逗号隔开，或回复“取消”退出）：`);
      this.setContext('setAutoPushGroupsGetInput');
      return true;
    }

    this.finish('setAutoPushGroupsGetInput');
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 绑定失效，请重新绑定账号。');
      return true;
    }

    UserStore.saveUser(e.user_id, { pushGroups: groups });
    await e.reply(`✅ 已成功将自动刷步推送群聊设置为：\n${groups.join('\n')}`);
    return true;
  }

  // 6. 设置自动推送好友
  async setAutoPushFriends(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 您当前未绑定 Zepp Life 账号，请私聊发送【#zepp绑定】进行绑定。');
      return true;
    }

    const reg = /^#?刷步设置自动推送好友\s*(.*)?$/i;
    const match = e.msg.match(reg);
    const rawParam = match && match[1] ? match[1].trim() : '';

    if (rawParam) {
      if (rawParam === '关闭' || rawParam === '清空' || rawParam === '0') {
        UserStore.saveUser(e.user_id, { pushFriends: [] });
        await e.reply(`✅ 已清空自动刷步推送好友列表。`);
        return true;
      }

      // 解析逗号/空格分隔的 QQ 号
      const friends = rawParam.split(/[,，\s]+/).map(f => f.trim()).filter(f => /^\d+$/.test(f));
      if (friends.length === 0) {
        await e.reply(`❌ 格式错误，请输入有效的好友 QQ 号列表（多个 QQ 号用逗号隔开，或输入“关闭”清空列表）。`);
        return true;
      }

      UserStore.saveUser(e.user_id, { pushFriends: friends });
      await e.reply(`✅ 已成功将自动刷步推送好友设置为：\n${friends.join('\n')}`);
      return true;
    } else {
      const currentList = user.pushFriends && user.pushFriends.length > 0 ? user.pushFriends.join(', ') : '暂无';
      await e.reply(`当前推送好友：${currentList}\n\n请发送需要推送的好友 QQ 号列表（多个 QQ 用逗号隔开，输入“关闭”清空列表，输入“取消”退出当前操作）：`);
      this.setContext('setAutoPushFriendsGetInput');
      return true;
    }
  }

  async setAutoPushFriendsGetInput() {
    const e = this.e;
    const msg = e.msg ? e.msg.trim() : '';

    if (msg === '取消') {
      await e.reply('已取消设置。');
      this.finish('setAutoPushFriendsGetInput');
      return true;
    }

    if (msg === '关闭' || msg === '清空' || msg === '0') {
      this.finish('setAutoPushFriendsGetInput');
      const user = UserStore.getUser(e.user_id);
      if (user) {
        UserStore.saveUser(e.user_id, { pushFriends: [] });
      }
      await e.reply(`✅ 已清空自动刷步推送好友列表。`);
      return true;
    }

    const friends = msg.split(/[,，\s]+/).map(f => f.trim()).filter(f => /^\d+$/.test(f));
    if (friends.length === 0) {
      await e.reply(`❌ 格式错误。请输入有效的好友 QQ 号（多个用逗号隔开，或回复“取消”退出）：`);
      this.setContext('setAutoPushFriendsGetInput');
      return true;
    }

    this.finish('setAutoPushFriendsGetInput');
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 绑定失效，请重新绑定账号。');
      return true;
    }

    UserStore.saveUser(e.user_id, { pushFriends: friends });
    await e.reply(`✅ 已成功将自动刷步推送好友设置为：\n${friends.join('\n')}`);
    return true;
  }
}
