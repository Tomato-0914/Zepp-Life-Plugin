import plugin from '../../../lib/plugins/plugin.js';
import puppeteer from '../../../lib/puppeteer/puppeteer.js';
import path from 'path';
import ZeppConfig, { getPluginRoot } from '../components/config.js';
import { UserStore } from '../components/userStore.js';
import ZeppAPI from '../components/zepp.js';
import {
  MAX_STEP,
  version,
  getTodayDateString,
  getTimeString,
  getCurrentHHMM,
  normalizeTime,
  randomBetween,
  maskUsername,
  getPlgPath
} from '../components/utils.js';

const PLUGIN_ROOT = getPluginRoot();

const STATUS_REG = /^#?(我的刷步|我的步数|查看步数)$/i;
const MANUAL_STEP_REG = /^#?(刷步|修改步数)\s*(\d+)?$/i;
const RANDOM_STEP_REG = /^#?随机刷步$/i;

const STATUS_TEXT = { success: '成功', error: '失败', skip: '跳过' };

function getGlobalRandomStep() {
  const minStep = Number(ZeppConfig.get('minStep')) || 18000;
  const maxStep = Number(ZeppConfig.get('maxStep')) || 28000;
  return Math.min(randomBetween(minStep, maxStep), MAX_STEP);
}

// 刷步结果需要写回的数据：成功时记录步数；只要拿到了新 Token（即使刷步失败）也一并缓存，避免下次重复登录触发 429
function buildSaveData(res, step) {
  const saveData = {};
  if (res.success) {
    saveData.lastStep = step;
    saveData.lastTime = getTimeString();
  }
  if (res.newToken) {
    saveData.appToken = res.newToken.appToken;
    saveData.userId = res.newToken.userId;
    saveData.tokenTime = res.newToken.tokenTime;
    saveData.deviceId = res.newToken.deviceId;
  }
  return saveData;
}

function renderImage(name, tplName, data) {
  return puppeteer.screenshot(name, {
    tplFile: path.join(PLUGIN_ROOT, 'resources', 'html', tplName),
    type: 'jpeg',
    quality: 90,
    version,
    plgPath: getPlgPath(),
    scale: ZeppConfig.getDpiScale(),
    ...data
  });
}

/**
 * 推送自动刷步结果
 * @param {object} user
 * @param {{ status: 'success'|'error'|'skip', step?: number, reason?: string }} result
 */
async function sendNotification(user, { status, step, reason = '' }) {
  if (typeof Bot === 'undefined') return;

  const masked = maskUsername(user.username);
  // 原因文本中可能包含完整账号，统一脱敏
  const safeReason = user.username ? String(reason).split(user.username).join(masked) : String(reason);
  const statusText = STATUS_TEXT[status];
  const stepText = step ? `${step} 步` : '暂无';
  const time = getTimeString();

  let msg = null;
  try {
    msg = await renderImage('zepp-life-report', 'report.html', {
      statusClass: status,
      statusText,
      username: masked,
      step: stepText,
      time,
      reason: safeReason
    });
  } catch (err) {
    logger.warn(`[Zepp-Life-Plugin] 生成通知图片失败: ${err.message}`);
  }
  if (!msg) {
    // 图片生成失败时降级为文本
    msg = `[Zepp-Life-Plugin] 每日自动刷步${statusText}！\n👤 账号：${masked}\n👟 步数：${stepText}` +
      (safeReason ? `\n❎ 原因：${safeReason}` : '') +
      `\n⏰ 时间：${time}`;
  }

  // 1. QQ本人
  try { await Bot.pickUser(Number(user.qq)).sendMsg(msg); } catch (_) { }
  // 2. 群聊
  if (Array.isArray(user.pushGroups)) {
    for (const group of user.pushGroups) {
      try { await Bot.pickGroup(Number(group)).sendMsg(msg); } catch (_) { }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  // 3. 好友
  if (Array.isArray(user.pushFriends)) {
    for (const friend of user.pushFriends) {
      if (Number(friend) === Number(user.qq)) continue;
      try { await Bot.pickUser(Number(friend)).sendMsg(msg); } catch (_) { }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function modifyStepBase(e, user, step, isRandom = false) {
  if (!Number.isInteger(step) || step <= 0) {
    await e.reply('❎ 修改步数失败，步数必须为大于 0 的整数喵~');
    return true;
  }
  if (step > MAX_STEP) {
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
  const cachedToken = { appToken: user.appToken, userId: user.userId, tokenTime: user.tokenTime, deviceId: user.deviceId };
  const res = await ZeppAPI.run(user.username, user.password, step, cachedToken);
  const saveData = buildSaveData(res, step);
  if (Object.keys(saveData).length > 0) {
    UserStore.saveUser(e.user_id, saveData);
  }

  if (res.success) {
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
          reg: STATUS_REG,
          fnc: 'viewStatus'
        },
        {
          reg: MANUAL_STEP_REG,
          fnc: 'manualStep'
        },
        {
          reg: RANDOM_STEP_REG,
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

    const masked = maskUsername(user.username);

    const autoStatus = user.autoStep === true
      ? `开启 (每日 ${normalizeTime(user.time) || user.time || '06:00'})`
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

    const lastStep = user.lastStep && user.lastTime
      ? `${user.lastStep} 步 (${user.lastTime})`
      : '尚未同步';

    try {
      const img = await renderImage('zepp-life-status', 'status.html', {
        username: masked,
        autoStatus,
        customStepText,
        pushGroupsText,
        pushFriendsText,
        lastStep,
        qq: String(e.user_id)
      });
      if (img) {
        await e.reply(img);
        return true;
      }
    } catch (err) {
      logger.error(`[Zepp-Life-Plugin] 生成绑定状态图片失败: ${err.message}`);
    }

    // fallback to text
    await e.reply(`📋 Zepp Life 绑定状态：\n👤 账号：${masked}\n⚙️ 自动刷步：${autoStatus}\n👟 自动步数：${customStepText}\n📢 推送群聊：${pushGroupsText}\n📢 推送好友：${pushFriendsText}\n👟 上次同步：${lastStep}\n\n💡 提示：您可以使用 【#刷步设置】配置推送与自动任务。`);
    return true;
  }

  // 2. 手动刷步数
  async manualStep(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 您当前未绑定 Zepp Life 账号，请私聊发送【#zepp绑定】进行绑定。');
      return true;
    }

    const match = e.msg.match(MANUAL_STEP_REG);

    if (match && match[2]) {
      const step = parseInt(match[2], 10);
      await modifyStepBase(e, user, step, false);
      return true;
    } else {
      await e.reply('请输入步数，或回复“取消”退出当前操作：');
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

    const step = /^\d+$/.test(msg) ? parseInt(msg, 10) : NaN;
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

  // 3. 随机刷步
  async randomStep(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 您当前未绑定 Zepp Life 账号，请私聊发送【#zepp绑定】进行绑定。');
      return true;
    }

    await modifyStepBase(e, user, getGlobalRandomStep(), true);
    return true;
  }

  // 定时轮询检查逻辑
  async autoStepCheck() {
    const currentTimeStr = getCurrentHHMM();

    const users = UserStore.getAllUsers();
    // 匹配开启了自动刷步且设定的时间与当前分钟吻合的用户
    const matchedUsers = users.filter(u => u.autoStep === true && normalizeTime(u.time || '06:00') === currentTimeStr);

    if (matchedUsers.length === 0) return;

    logger.info(`[Zepp-Life-Plugin] 检测到有 ${matchedUsers.length} 个用户的自动刷步时间为 ${currentTimeStr}，开始执行任务...`);

    for (const user of matchedUsers) {
      // 单个用户出错不影响其余用户
      try {
        await this.autoStepForUser(user);
      } catch (err) {
        logger.error(`[Zepp-Life-Plugin] 自动刷步异常: QQ ${user.qq} ->`, err);
      }

      // 每个用户之间随机延迟 3 - 10 秒防风控
      const delay = Math.floor(Math.random() * 7000) + 3000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  async autoStepForUser(user) {
    let step = 0;
    const userStep = String(user.step || '0').trim();
    const hasCustomStep = userStep !== '' && userStep !== '0';
    if (hasCustomStep) {
      if (userStep.includes('-')) {
        const parts = userStep.split('-');
        const uMin = parseInt(parts[0], 10);
        const uMax = parseInt(parts[1], 10);
        if (!isNaN(uMin) && !isNaN(uMax)) {
          step = randomBetween(uMin, uMax);
        }
      } else {
        const fixedStep = parseInt(userStep, 10);
        if (!isNaN(fixedStep) && fixedStep > 0) {
          step = fixedStep;
        }
      }
    }

    if (step <= 0) {
      step = getGlobalRandomStep();
    }

    if (step > MAX_STEP) step = MAX_STEP;

    // 如果当日已刷过步数且大于要刷的步数，为防止同步倒退失败
    const todayStr = getTodayDateString();
    if (user.lastTime && user.lastTime.startsWith(todayStr) && step <= user.lastStep) {
      const isFixed = hasCustomStep && !userStep.includes('-');
      if (isFixed || user.lastStep >= MAX_STEP) {
        // 固定步数（或今日已达上限）无法倒退，直接跳过此用户
        logger.info(`[Zepp-Life-Plugin] 自动刷步跳过: QQ ${user.qq} 的步数 ${step} 小于或等于今日已刷步数 ${user.lastStep}`);
        await sendNotification(user, {
          status: 'skip',
          step,
          reason: `设定步数 ${step} 小于或等于今日已刷步数 ${user.lastStep}`
        });
        return;
      }
      // 随机步数或范围情况，自动生成一个略大的数以保证同步成功
      step = Math.min(user.lastStep + Math.floor(Math.random() * 900) + 100, MAX_STEP);
    }

    logger.info(`[Zepp-Life-Plugin] 自动刷步：正在同步 QQ ${user.qq} -> ${step} 步`);

    // 传入缓存 Token 避免每次重复登录触发 429 限流
    const cachedToken = { appToken: user.appToken, userId: user.userId, tokenTime: user.tokenTime, deviceId: user.deviceId };
    const res = await ZeppAPI.run(user.username, user.password, step, cachedToken);
    const saveData = buildSaveData(res, step);
    if (Object.keys(saveData).length > 0) {
      UserStore.saveUser(user.qq, saveData);
    }

    if (res.success) {
      logger.info(`[Zepp-Life-Plugin] 自动刷步成功: QQ ${user.qq} -> ${step} 步`);
      await sendNotification(user, { status: 'success', step });
    } else {
      logger.error(`[Zepp-Life-Plugin] 自动刷步失败: QQ ${user.qq} -> 错误: ${res.error}`);
      await sendNotification(user, { status: 'error', reason: res.error });
    }
  }
}
