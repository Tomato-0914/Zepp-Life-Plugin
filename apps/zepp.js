import plugin from '../../../lib/plugins/plugin.js';
import ZeppConfig from '../components/config.js';
import { UserStore } from '../components/userStore.js';
import ZeppAPI from '../components/zepp.js';
import fs from 'fs';
import path from 'path';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import { getPluginRoot } from '../components/config.js';

const PLUGIN_ROOT = getPluginRoot();
const packageJson = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8'));
const version = packageJson.version;

const getTodayDateString = () => {
  const d = new Date(new Date().getTime() + (8 * 60 * 60 * 1000) + new Date().getTimezoneOffset() * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getTimeString = () => {
  const d = new Date(new Date().getTime() + (8 * 60 * 60 * 1000) + new Date().getTimezoneOffset() * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

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

async function sendNotification(user, msg) {
  if (typeof Bot === 'undefined') return;

  // Determine status and extract details
  const isError = /失败/.test(msg);
  const isSkip = /跳过/.test(msg);
  const statusClass = isSkip ? 'skip' : (isError ? 'error' : 'success');
  const statusText = isSkip ? '跳过' : (isError ? '失败' : '成功');
  const stepMatch = msg.match(/步数：?(\d+)/) || msg.match(/步数[:]*\s*(\d+)/);
  const step = stepMatch ? `${stepMatch[1]} 步` : '暂无';
  const timeMatch = msg.match(/时间：?([\d- :]+)/);
  const time = timeMatch ? timeMatch[1] : '暂无';
  const errorBlock = (isError || isSkip) ? `<div class="error-msg">${msg}</div>` : '';

  // Load template and replace placeholders
  const reportPath = path.join(PLUGIN_ROOT, 'resources', 'html', 'report.html');
  let html = fs.readFileSync(reportPath, 'utf8');
  html = html.replace(/{{statusClass}}/g, statusClass)
    .replace(/{{statusText}}/g, statusText)
    .replace(/{{username}}/g, user.username || '')
    .replace(/{{step}}/g, step)
    .replace(/{{time}}/g, time)
    .replace(/{{errorBlock}}/g, errorBlock);

  // Write temporary html for screenshot
  const tempDir = path.join(PLUGIN_ROOT, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempFile = path.join(tempDir, `report_${Date.now()}.html`);
  fs.writeFileSync(tempFile, html, 'utf8');

  const pluginName = path.basename(PLUGIN_ROOT);
  const plgPath = `${process.cwd().replace(/\\\\/g, '/')}/plugins/${pluginName}`;

  try {
    const img = await puppeteer.screenshot('zepp-life-report', {
      tplFile: tempFile,
      type: 'jpeg',
      quality: 90,
      version: version,
      plgPath: plgPath,
    });
    if (img) {
      // Send image to all targets
      // 1. QQ本人
      try { await Bot.pickUser(Number(user.qq)).sendMsg(img); } catch (_) { }
      // 2. 群聊
      if (Array.isArray(user.pushGroups)) {
        for (const group of user.pushGroups) {
          try { await Bot.pickGroup(Number(group)).sendMsg(img); } catch (_) { }
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      // 3. 好友
      if (Array.isArray(user.pushFriends)) {
        for (const friend of user.pushFriends) {
          if (Number(friend) === Number(user.qq)) continue;
          try { await Bot.pickUser(Number(friend)).sendMsg(img); } catch (_) { }
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  } catch (e) {
    logger.warn(`[Zepp-Life-Plugin] 生成通知图片失败: ${e.message}`);
    // fallback to text
    try { await Bot.pickUser(Number(user.qq)).sendMsg(msg); } catch (_) { }
  } finally {
    // cleanup
    try { fs.unlinkSync(tempFile); } catch (_) { }
  }
}

async function modifyStepBase(e, user, step, isRandom = false) {
  if (step > 98800) {
    await e.reply('❎ 修改步数失败，单次修改步数不能超过 98,800 步喵~');
    return true;
  }

  const todayStr = getTodayDateString();
  if (user.lastTime && user.lastTime.startsWith(todayStr)) {
    if (step <= user.lastStep) {
      await e.reply(`❎ 修改步数失败。\n提示：今日已同步步数为 ${user.lastStep} 步，新修改的步数不能小于或等于今日已同步的步数喵~`);
      return true;
    }
  }

  const msgType = isRandom ? '随机步数' : '修改步数';
  await e.reply(`🔄 正在同步${msgType}为 ${step} 步，请稍候...`);

  // 传入缓存 Token 避免每次重复登录触发 429 限流
  const cachedToken = { appToken: user.appToken, userId: user.userId, tokenTime: user.tokenTime };
  const res = await ZeppAPI.run(user.username, user.password, step, cachedToken);
  if (res.success) {
    const nowTimeStr = getTimeString();
    const saveData = { lastStep: step, lastTime: nowTimeStr };
    // 如有新 Token（重新登录），一并保存
    if (res.newToken) {
      saveData.appToken = res.newToken.appToken;
      saveData.userId = res.newToken.userId;
      saveData.tokenTime = res.newToken.tokenTime;
    }
    UserStore.saveUser(e.user_id, saveData);
    await e.reply(`✅ 步数修改成功！\n当前步数：${step}\n请打开微信运动或支付宝运动查看是否同步刷新喵~`);
  } else {
    await e.reply(`❎ 修改步数失败。\n原因：${res.error}`);
  }
  return true;
}

export class ZeppApp extends plugin {
  constructor() {
    super({
      name: 'Zepp-Life-步数助手',
      dsc: '小米运动/Zepp Life 刷步数与定时任务',
      event: 'message',
      priority: 1000,
      rule: [
        {
          reg: /^#?我的刷步/i,
          fnc: 'viewStatus'
        },
        {
          reg: /^#?(刷步|修改步数)\s*(\d+)?/i,
          fnc: 'manualStep'
        },
        {
          reg: /^#?随机刷步$/i,
          fnc: 'randomStep'
        }
      ]
    });

    // 每分钟执行一次的定时任务，检查是否有用户到达设定的自动刷步时间
    this.task = {
      name: 'Zepp-Life-自动刷步巡检任务',
      cron: '0 * * * * ?',
      fnc: () => this.autoStepCheck()
    };
  }

  // 1. 查看状态
  async viewStatus(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 您当前未绑定 Zepp Life 账号，请私聊发送【#zepp绑定】进行绑定。');
      return true;
    }

    const maskUsername = user.username.length > 7
      ? user.username.substring(0, 3) + '****' + user.username.substring(user.username.length - 4)
      : user.username;

    const autoStatus = user.autoStep !== false
      ? `开启 (每日 ${user.time || '06:00'})`
      : '关闭';

    let customStepText = '随机生成';
    const userStepStr = String(user.step || '0').trim();
    if (userStepStr && userStepStr !== '0') {
      if (userStepStr.includes('-')) {
        customStepText = `范围为 ${userStepStr} 步`;
      } else {
        customStepText = `固定为 ${userStepStr} 步`;
      }
    }

    const pushGroupsText = user.pushGroups && user.pushGroups.length > 0 ? user.pushGroups.join(', ') : '无';
    const pushFriendsText = user.pushFriends && user.pushFriends.length > 0 ? user.pushFriends.join(', ') : '无';

    const lastStep = `${user.lastStep || '暂无'} 步 (${user.lastTime || '尚未同步'})`;

    // Load template and replace placeholders
    const statusPath = path.join(PLUGIN_ROOT, 'resources', 'html', 'status.html');
    let html = fs.readFileSync(statusPath, 'utf8');
    html = html.replace(/{{username}}/g, maskUsername)
      .replace(/{{autoStatus}}/g, autoStatus)
      .replace(/{{customStepText}}/g, customStepText)
      .replace(/{{pushGroupsText}}/g, pushGroupsText)
      .replace(/{{pushFriendsText}}/g, pushFriendsText)
      .replace(/{{lastStep}}/g, lastStep)
      .replace(/{{qq}}/g, String(e.user_id));

    // Write temporary html for screenshot
    const tempDir = path.join(PLUGIN_ROOT, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `status_${Date.now()}.html`);
    fs.writeFileSync(tempFile, html, 'utf8');

    const pluginName = path.basename(PLUGIN_ROOT);
    const plgPath = `${process.cwd().replace(/\\\\/g, '/')}/plugins/${pluginName}`;

    try {
      const img = await puppeteer.screenshot('zepp-life-status', {
        tplFile: tempFile,
        type: 'jpeg',
        quality: 90,
        version: version,
        plgPath: plgPath,
      });
      if (img) {
        await e.reply(img);
      } else {
        await e.reply('❎ 生成状态图片失败喵~');
      }
    } catch (err) {
      logger.error(`[Zepp-Life-Plugin] 生成绑定状态图片失败: ${err.message}`);
      // fallback to text
      await e.reply(`📋 Zepp Life 绑定状态：\n👤 账号：${maskUsername}\n⚙️ 自动刷步：${autoStatus}\n👟 自动步数：${customStepText}\n📢 推送群聊：${pushGroupsText}\n📢 推送好友：${pushFriendsText}\n👟 上次同步：${lastStep}\n\n💡 提示：您可以使用 【#刷步设置】配置推送与自动任务。`);
    } finally {
      // cleanup
      try { fs.unlinkSync(tempFile); } catch (_) { }
    }
    return true;
  }

  // 2. 手动刷步数
  async manualStep(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 您当前未绑定 Zepp Life 账号，请私聊发送【#zepp绑定】进行绑定。');
      return true;
    }

    const reg = /^#?(刷步|修改步数)\s*(\d+)?/i;
    const match = e.msg.match(reg);

    if (match && match[2]) {
      const step = parseInt(match[2]);
      await modifyStepBase(e, user, step, false);
      return true;
    } else {
      await e.reply('请输入步数...');
      this.setContext('manualStepGetNumber');
      return true;
    }
  }

  async manualStepGetNumber() {
    const e = this.e;
    const msg = e.msg ? e.msg.trim() : '';

    if (msg === '取消') {
      await e.reply('已取消修改步数。');
      this.finish('manualStepGetNumber');
      return true;
    }

    const step = parseInt(msg);
    if (isNaN(step) || step <= 0) {
      await e.reply('❎ 输入错误。请输入大于 0 的有效数字，或回复“取消”退出当前操作：');
      this.setContext('manualStepGetNumber');
      return true;
    }

    this.finish('manualStepGetNumber');

    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 绑定失效，请重新绑定账号。');
      return true;
    }

    await modifyStepBase(e, user, step, false);
    return true;
  }

  // 3. 开启/关闭自动刷步
  async toggleAutoStep(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 您当前未绑定 Zepp Life 账号。');
      return true;
    }

    const reg = /^#?自动刷步\s*(开启|关闭|)?$/i;
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

  // 4. 修改自动刷步时间
  async changeAutoTime(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 您当前未绑定 Zepp Life 账号。');
      return true;
    }

    const reg = /^#?设置自动刷步时间\s*(\d{1,2})[：:](\d{1,2})$/i;
    const match = e.msg.match(reg);
    if (!match) return false;

    let hour = parseInt(match[1]);
    let minute = parseInt(match[2]);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      await e.reply('❎ 时间格式错误，小时范围为 0-23，分钟范围为 0-59。');
      return true;
    }

    const pad = (num) => String(num).padStart(2, '0');
    const timeStr = `${pad(hour)}:${pad(minute)}`;

    UserStore.saveUser(e.user_id, { time: timeStr });
    await e.reply(`✅ 已成功将每日自动刷步时间设置为每天【${timeStr}】。`);
    return true;
  }

  // 5. 设置自动刷步数或范围
  async setAutoStepCount(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 您当前未绑定 Zepp Life 账号，请私聊发送【#zepp绑定】进行绑定。');
      return true;
    }

    const reg = /^#?设置自动刷步(数|步数)\s*(.*)?$/i;
    const match = e.msg.match(reg);
    const rawParam = match && match[2] ? match[2].trim() : '';

    if (rawParam) {
      const res = validateStepParam(rawParam);
      if (!res.valid) {
        await e.reply(`❎ ${res.error}`);
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
      await e.reply(`❎ ${res.error}\n\n请重新输入，或回复“取消”退出当前操作：`);
      this.setContext('setAutoStepCountGetParam');
      return true;
    }

    this.finish('setAutoStepCountGetParam');

    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 绑定失效，请重新绑定账号。');
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

  // 6. 设置自动推送群聊
  async setAutoPushGroups(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 您当前未绑定 Zepp Life 账号，请私聊发送【#zepp绑定】进行绑定。');
      return true;
    }

    const reg = /^#?设置自动推送群\s*(.*)?$/i;
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
        await e.reply(`❎ 格式错误，请输入有效的群号列表（多个群号用逗号隔开，或输入“关闭”清空列表）。`);
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
      await e.reply(`❎ 格式错误。请输入有效的数字群号（多个用逗号隔开，或回复“取消”退出）：`);
      this.setContext('setAutoPushGroupsGetInput');
      return true;
    }

    this.finish('setAutoPushGroupsGetInput');
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 绑定失效，请重新绑定账号。');
      return true;
    }

    UserStore.saveUser(e.user_id, { pushGroups: groups });
    await e.reply(`✅ 已成功将自动刷步推送群聊设置为：\n${groups.join('\n')}`);
    return true;
  }

  // 7. 设置自动推送好友
  async setAutoPushFriends(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 您当前未绑定 Zepp Life 账号，请私聊发送【#zepp绑定】进行绑定。');
      return true;
    }

    const reg = /^#?设置自动推送好友\s*(.*)?$/i;
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
        await e.reply(`❎ 格式错误，请输入有效的好友 QQ 号列表（多个 QQ 号用逗号隔开，或输入“关闭”清空列表）。`);
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
      await e.reply(`❎ 格式错误。请输入有效的好友 QQ 号（多个用逗号隔开，或回复“取消”退出）：`);
      this.setContext('setAutoPushFriendsGetInput');
      return true;
    }

    this.finish('setAutoPushFriendsGetInput');
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 绑定失效，请重新绑定账号。');
      return true;
    }

    UserStore.saveUser(e.user_id, { pushFriends: friends });
    await e.reply(`✅ 已成功将自动刷步推送好友设置为：\n${friends.join('\n')}`);
    return true;
  }

  // 定时轮询检查逻辑
  async autoStepCheck() {
    const date = new Date(new Date().getTime() + (8 * 60 * 60 * 1000) + new Date().getTimezoneOffset() * 60 * 1000);
    const pad = (num) => String(num).padStart(2, '0');
    const currentTimeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    const users = UserStore.getAllUsers();
    // 匹配开启了自动刷步且设定的时间与当前分钟吻合的用户
    const matchedUsers = users.filter(u => u.autoStep !== false && (u.time || '06:00') === currentTimeStr);

    if (matchedUsers.length === 0) return;

    logger.info(`[Zepp-Life-Plugin] 检测到有 ${matchedUsers.length} 个用户的自动刷步时间为 ${currentTimeStr}，开始执行任务...`);

    const minStep = ZeppConfig.get('minStep') || 18000;
    const maxStep = ZeppConfig.get('maxStep') || 28000;

    for (const user of matchedUsers) {
      let step = 0;
      const userStep = String(user.step || '0').trim();
      if (userStep && userStep !== '0') {
        if (userStep.includes('-')) {
          const parts = userStep.split('-');
          const uMin = parseInt(parts[0]);
          const uMax = parseInt(parts[1]);
          if (!isNaN(uMin) && !isNaN(uMax) && uMin <= uMax) {
            step = Math.floor(Math.random() * (uMax - uMin + 1)) + uMin;
          }
        } else {
          const fixedStep = parseInt(userStep);
          if (!isNaN(fixedStep) && fixedStep > 0) {
            step = fixedStep;
          }
        }
      }

      if (step <= 0) {
        step = Math.floor(Math.random() * (maxStep - minStep + 1)) + minStep;
      }

      if (step > 98800) step = 98800;

      // 如果当日已刷过步数且大于要刷的步数，为防止同步倒退失败
      const todayStr = getTodayDateString();
      if (user.lastTime && user.lastTime.startsWith(todayStr)) {
        if (step <= user.lastStep) {
          const hasCustomStep = userStep && userStep !== '0';
          const isFixed = hasCustomStep && !userStep.includes('-');
          if (isFixed) {
            // 用户固定了步数，但小于或等于今日已刷步数，由于接口无法倒退，直接跳过此用户
            logger.info(`[Zepp-Life-Plugin] 自动刷步跳过: QQ ${user.qq} 的固定步数 ${step} 小于或等于今日已刷步数 ${user.lastStep}`);
            await sendNotification(user, `[Zepp-Life-Plugin] 每日自动刷步已跳过！\n👤 账号：${user.username}\n👟 步数：${step} 步\n❎ 原因：设定固定步数 ${step} 小于或等于今日已刷步数 ${user.lastStep}\n⏰ 时间：${getTimeString()}`);
            continue;
          } else {
            // 随机步数或范围情况，自动生成一个略大的数以保证同步成功
            step = user.lastStep + Math.floor(Math.random() * 900) + 100;
            if (step > 98800) step = 98800;
          }
        }
      }

      logger.info(`[Zepp-Life-Plugin] 自动刷步：正在同步 QQ ${user.qq} -> ${step} 步`);

      // 传入缓存 Token 避免每次重复登录触发 429 限流
      const cachedToken = { appToken: user.appToken, userId: user.userId, tokenTime: user.tokenTime };
      const res = await ZeppAPI.run(user.username, user.password, step, cachedToken);
      if (res.success) {
        const saveData = { lastStep: step, lastTime: getTimeString() };
        // 如有新 Token（重新登录），一并保存
        if (res.newToken) {
          saveData.appToken = res.newToken.appToken;
          saveData.userId = res.newToken.userId;
          saveData.tokenTime = res.newToken.tokenTime;
        }
        UserStore.saveUser(user.qq, saveData);
        logger.info(`[Zepp-Life-Plugin] 自动刷步成功: QQ ${user.qq} -> ${step} 步`);
        await sendNotification(user, `[Zepp-Life-Plugin] 每日自动刷步已执行成功！\n👤 账号：${user.username}\n👟 步数：${step} 步\n⏰ 时间：${getTimeString()}`);
      } else {
        logger.error(`[Zepp-Life-Plugin] 自动刷步失败: QQ ${user.qq} -> 错误: ${res.error}`);
        await sendNotification(user, `[Zepp-Life-Plugin] 每日自动刷步执行失败！\n👤 账号：${user.username}\n❎ 原因：${res.error}\n⏰ 时间：${getTimeString()}`);
      }

      // 每个用户之间随机延迟 3 - 10 秒防风控
      const delay = Math.floor(Math.random() * 7000) + 3000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export class ZeppRandomStep extends plugin {
  constructor() {
    super({
      name: 'Zepp-Life-随机刷步',
      dsc: '小米运动/Zepp Life 随机刷步',
      event: 'message',
      priority: 1000,
      rule: [
        {
          reg: /^#?随机刷步$/i,
          fnc: 'randomStep'
        }
      ]
    });
  }

  async randomStep(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 您当前未绑定 Zepp Life 账号，请私聊发送【#zepp绑定】进行绑定。');
      return true;
    }

    const minStep = ZeppConfig.get('minStep') || 18000;
    const maxStep = ZeppConfig.get('maxStep') || 28000;
    const step = Math.floor(Math.random() * (maxStep - minStep + 1)) + minStep;

    await modifyStepBase(e, user, step, true);
    return true;
  }
}
