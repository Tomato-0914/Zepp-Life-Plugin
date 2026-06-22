import plugin from '../../../lib/plugins/plugin.js';
import ZeppConfig from '../components/config.js';
import { UserStore } from '../components/userStore.js';
import ZeppAPI from '../components/zepp.js';

export class ZeppApp extends plugin {
  constructor() {
    super({
      name: 'Zepp-Life-步数助手',
      dsc: '小米运动/Zepp Life 绑定与刷步数助手',
      event: 'message',
      priority: 1000,
      rule: [
        {
          reg: /^#?(我绑定|绑定步数)\s+(\S+)\s+(\S+)/i,
          fnc: 'bindAccount'
        },
        {
          reg: /^#?(我解绑|解绑步数)/i,
          fnc: 'unbindAccount'
        },
        {
          reg: /^#?(我的步数|查看步数)/i,
          fnc: 'viewStatus'
        },
        {
          reg: /^#?(刷步数|修改步数)(\s+\d+)?/i,
          fnc: 'manualStep'
        },
        {
          reg: /^#?自动刷步数\s*(开启|开启自动|开|关闭|关闭自动|关)?$/i,
          fnc: 'toggleAutoStep'
        }
      ]
    });

    // 每日自动刷步任务
    const autoEnabled = ZeppConfig.get('autoStep.enabled') !== false;
    if (autoEnabled) {
      const cron = ZeppConfig.get('autoStep.cron') || '0 30 20 * * ?';
      this.task = {
        name: 'Zepp-Life-自动刷步数任务',
        cron,
        fnc: () => this.autoChangeSteps()
      };
    }
  }

  // 1. 账号绑定
  async bindAccount(e) {
    if (e.isGroup) {
      await e.reply('⚠️ 为了您的账号密码安全，请【私聊机器人】发送绑定指令！', false, { at: true });
      return true;
    }

    const reg = /^#?(我绑定|绑定步数)\s+(\S+)\s+(\S+)/i;
    const match = e.msg.match(reg);
    if (!match) return false;

    const username = match[2].trim();
    const password = match[3].trim();

    await e.reply('🔄 正在登录 Zepp Life 进行验证，请稍候...');
    
    try {
      const accessCode = await ZeppAPI.getAccessCode(username, password);
      await ZeppAPI.getToken(username, accessCode);
      
      // 保存用户信息
      UserStore.saveUser(e.user_id, {
        username,
        password,
        autoStepEnabled: true
      });

      await e.reply('✅ 验证通过，账号绑定成功！\n已默认开启每日定时自动刷步。您也可以通过发送 【#我的步数】 查看当前绑定状态。');
    } catch (err) {
      logger.error('[Zepp-Life-Plugin] 账号绑定验证失败:', err);
      await e.reply(`❌ 绑定失败，华米登录验证不通过。\n原因：${err.message}`);
    }
    return true;
  }

  // 2. 解绑账号
  async unbindAccount(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 您当前未绑定 Zepp Life 账号。');
      return true;
    }

    UserStore.deleteUser(e.user_id);
    await e.reply('✅ 账号解绑成功。');
    return true;
  }

  // 3. 查看状态
  async viewStatus(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 您当前未绑定 Zepp Life 账号，请私聊发送【#绑定步数 账号 密码】进行绑定。');
      return true;
    }

    const maskUsername = user.username.length > 7
      ? user.username.substring(0, 3) + '****' + user.username.substring(user.username.length - 4)
      : user.username;

    await e.reply(`📋 Zepp Life 绑定状态：\n👤 账号：${maskUsername}\n⚙️ 自动刷步：${user.autoStepEnabled ? '开启' : '关闭'}\n👟 上次同步：${user.lastStep || '暂无'} 步 (${user.lastTime || '尚未同步'})`);
    return true;
  }

  // 4. 手动刷步数
  async manualStep(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❌ 您当前未绑定 Zepp Life 账号，请私聊发送【#绑定步数 账号 密码】进行绑定。');
      return true;
    }

    const reg = /^#?(刷步数|修改步数)(\s+(\d+))?/i;
    const match = e.msg.match(reg);
    let step = 0;

    if (match && match[3]) {
      step = parseInt(match[3]);
    } else {
      // 未指定步数，随机生成
      const minStep = ZeppConfig.get('autoStep.minStep') || 18000;
      const maxStep = ZeppConfig.get('autoStep.maxStep') || 28000;
      step = Math.floor(Math.random() * (maxStep - minStep + 1)) + minStep;
    }

    if (step <= 0 || step > 98000) {
      await e.reply('❌ 修改步数失败，请输入 1 到 98,000 之间的有效数字。');
      return true;
    }

    await e.reply(`🔄 正在同步修改步数为 ${step} 步，请稍候...`);

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

  // 5. 开启/关闭 自动刷步
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
      // 未带参数，反转状态
      auto = !user.autoStepEnabled;
    }

    UserStore.saveUser(e.user_id, { autoStepEnabled: auto });
    await e.reply(`✅ 每日自动刷步已设定为：【${auto ? '开启' : '关闭'}】。`);
    return true;
  }

  // 自动执行的主逻辑
  async autoChangeSteps() {
    logger.info('[Zepp-Life-Plugin] 开始执行每日定时自动刷步任务...');
    const users = UserStore.getAllUsers();
    const activeUsers = users.filter(u => u.autoStepEnabled !== false);
    
    if (activeUsers.length === 0) {
      logger.info('[Zepp-Life-Plugin] 自动刷步任务结束：无活跃绑定用户。');
      return;
    }

    const minStep = ZeppConfig.get('autoStep.minStep') || 18000;
    const maxStep = ZeppConfig.get('autoStep.maxStep') || 28000;

    for (const user of activeUsers) {
      const step = Math.floor(Math.random() * (maxStep - minStep + 1)) + minStep;
      logger.info(`[Zepp-Life-Plugin] 自动刷步：正在同步 QQ ${user.userId} -> ${step} 步`);

      const res = await ZeppAPI.run(user.username, user.password, step);
      if (res.success) {
        UserStore.saveUser(user.userId, {
          lastStep: step,
          lastTime: new Date().toLocaleString()
        });
        logger.info(`[Zepp-Life-Plugin] 自动刷步成功: QQ ${user.userId} -> ${step} 步`);
        
        try {
          if (typeof Bot !== 'undefined') {
            await Bot.pickUser(user.userId).sendMsg(`[Zepp-Life-Plugin] 每日自动刷步同步完成！\n步数：${step} 步\n时间：${new Date().toLocaleString()}`);
          }
        } catch (err) {
          logger.warn(`[Zepp-Life-Plugin] 自动刷步通知发送失败: ${err.message}`);
        }
      } else {
        logger.error(`[Zepp-Life-Plugin] 自动刷步失败: QQ ${user.userId} -> 错误: ${res.error}`);
        
        try {
          if (typeof Bot !== 'undefined') {
            await Bot.pickUser(user.userId).sendMsg(`[Zepp-Life-Plugin] 每日自动刷步同步失败！\n原因：${res.error}`);
          }
        } catch (err) {
          logger.warn(`[Zepp-Life-Plugin] 自动刷步失败通知发送失败: ${err.message}`);
        }
      }

      // 每次修改随机延迟 3 - 10 秒，避免请求太频繁触发风控
      const delay = Math.floor(Math.random() * 7000) + 3000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    logger.info('[Zepp-Life-Plugin] 每日定时自动刷步任务执行完毕。');
  }
}
