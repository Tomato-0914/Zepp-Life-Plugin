import plugin from '../../../lib/plugins/plugin.js';
import ZeppConfig from '../components/config.js';
import { UserStore } from '../components/userStore.js';
import ZeppAPI from '../components/zepp.js';

export class ZeppApp extends plugin {
  constructor() {
    super({
      name: 'Zepp-Life-步数助手',
      dsc: '小米运动/Zepp Life 刷步数与定时任务',
      event: 'message',
      priority: 1000,
      rule: [
        {
          reg: /^#?(我的步数|查看步数)/i,
          fnc: 'viewStatus'
        },
        {
          reg: /^#?(刷步数|修改步数)\s*(\d+)?/i,
          fnc: 'manualStep'
        },
        {
          reg: /^#?自动刷步数\s*(开启|开启自动|开|关闭|关闭自动|关)?$/i,
          fnc: 'toggleAutoStep'
        },
        {
          reg: /^#?自动刷步时间\s*(\d{1,2})[：:](\d{1,2})$/i,
          fnc: 'changeAutoTime'
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
      await e.reply('❌ 您当前未绑定 Zepp Life 账号，请私聊发送【#绑定刷步】进行绑定。');
      return true;
    }

    const maskUsername = user.username.length > 7
      ? user.username.substring(0, 3) + '****' + user.username.substring(user.username.length - 4)
      : user.username;

    const autoStatus = user.autoStep !== false 
      ? `开启 (每日 ${user.time || '06:00'})` 
      : '关闭';

    await e.reply(`📋 Zepp Life 绑定状态：\n👤 账号：${maskUsername}\n⚙️ 自动刷步：${autoStatus}\n👟 上次同步：${user.lastStep || '暂无'} 步 (${user.lastTime || '尚未同步'})\n\n💡 提示：您可以使用 【#自动刷步时间 07:30】 来修改自动刷步的时间。`);
    return true;
  }

  // 2. 手动刷步数
  async manualStep(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 您当前未绑定 Zepp Life 账号，请私聊发送【#绑定刷步】进行绑定。');
      return true;
    }

    const reg = /^#?(刷步数|修改步数)\s*(\d+)?$/i;
    const match = e.msg.match(reg);
    
    if (match && match[2]) {
      const step = parseInt(match[2]);
      if (step <= 0 || step > 98000) {
        await e.reply('❌ 修改步数失败，请输入 1 到 98,000 之间的有效数字。');
        return true;
      }
      await this.executeStepModification(e, user, step, `正在同步修改步数为 ${step} 步，请稍候...`);
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
    if (isNaN(step) || step <= 0 || step > 98000) {
      await e.reply('❌ 输入错误。请输入 1 到 98,000 之间的有效数字，或回复“取消”退出当前操作：');
      this.setContext('manualStepGetNumber');
      return true;
    }

    this.finish('manualStepGetNumber');

    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 绑定失效，请重新绑定账号。');
      return true;
    }

    await this.executeStepModification(e, user, step, `正在同步修改步数为 ${step} 步，请稍候...`);
    return true;
  }

  async executeStepModification(e, user, step, waitingMsg) {
    await e.reply(`🔄 ${waitingMsg}`);

    const res = await ZeppAPI.run(user.username, user.password, step);
    if (res.success) {
      UserStore.saveUser(e.user_id, {
        lastStep: step,
        lastTime: new Date().toLocaleString()
      });
      await e.reply(`✅ 步数修改成功！\n当前步数：${step}\n请打开微信运动或支付宝运动查看是否同步刷新喵~`);
    } else {
      await e.reply(`❌ 修改步数失败。\n原因：${res.error}`);
    }
    return true;
  }

  // 3. 开启/关闭自动刷步
  async toggleAutoStep(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 您当前未绑定 Zepp Life 账号。');
      return true;
    }

    const reg = /^#?自动刷步数\s*(开启|开启自动|开|关闭|关闭自动|关)?$/i;
    const match = e.msg.match(reg);
    let auto = true;

    if (match && match[1]) {
      const mode = match[1];
      if (['关闭', '关闭自动', '关'].includes(mode)) {
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
      await e.reply('❌ 您当前未绑定 Zepp Life 账号。');
      return true;
    }

    const reg = /^#?自动刷步时间\s*(\d{1,2})[：:](\d{1,2})$/i;
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

  // 定时轮询检查逻辑
  async autoStepCheck() {
    const date = new Date();
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
      const step = Math.floor(Math.random() * (maxStep - minStep + 1)) + minStep;
      logger.info(`[Zepp-Life-Plugin] 自动刷步：正在同步 QQ ${user.qq} -> ${step} 步`);

      const res = await ZeppAPI.run(user.username, user.password, step);
      if (res.success) {
        UserStore.saveUser(user.qq, {
          lastStep: step,
          lastTime: new Date().toLocaleString()
        });
        logger.info(`[Zepp-Life-Plugin] 自动刷步成功: QQ ${user.qq} -> ${step} 步`);
        
        try {
          if (typeof Bot !== 'undefined') {
            await Bot.pickUser(Number(user.qq)).sendMsg(`[Zepp-Life-Plugin] 每日自动刷步已执行成功！\n步数：${step} 步\n时间：${new Date().toLocaleString()}`);
          }
        } catch (err) {
          logger.warn(`[Zepp-Life-Plugin] 自动刷步成功通知发送失败: ${err.message}`);
        }
      } else {
        logger.error(`[Zepp-Life-Plugin] 自动刷步失败: QQ ${user.qq} -> 错误: ${res.error}`);
        
        try {
          if (typeof Bot !== 'undefined') {
            await Bot.pickUser(Number(user.qq)).sendMsg(`[Zepp-Life-Plugin] 每日自动刷步执行失败！\n原因：${res.error}`);
          }
        } catch (err) {
          logger.warn(`[Zepp-Life-Plugin] 自动刷步失败通知发送失败: ${err.message}`);
        }
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
      await e.reply('❌ 您当前未绑定 Zepp Life 账号，请私聊发送【#绑定刷步】进行绑定。');
      return true;
    }

    const minStep = ZeppConfig.get('minStep') || 18000;
    const maxStep = ZeppConfig.get('maxStep') || 28000;
    const step = Math.floor(Math.random() * (maxStep - minStep + 1)) + minStep;

    await e.reply(`🔄 正在同步随机步数为 ${step} 步，请稍候...`);

    const res = await ZeppAPI.run(user.username, user.password, step);
    if (res.success) {
      UserStore.saveUser(e.user_id, {
        lastStep: step,
        lastTime: new Date().toLocaleString()
      });
      await e.reply(`✅ 步数修改成功！\n当前步数：${step}\n请打开微信运动或支付宝运动查看是否同步刷新喵~`);
    } else {
      await e.reply(`❌ 修改步数失败。\n原因：${res.error}`);
    }
    return true;
  }
}
