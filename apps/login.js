import plugin from '../../../lib/plugins/plugin.js';
import { UserStore } from '../components/userStore.js';
import ZeppAPI from '../components/zepp.js';

let sessions = {};

export class ZeppLogin extends plugin {
  constructor() {
    super({
      name: 'Zepp-Life-账号绑定',
      dsc: '小米运动/Zepp Life 引导式绑定与解绑',
      event: 'message',
      priority: 999,
      rule: [
        {
          reg: /^#?(zepp|刷步)绑定$/i,
          fnc: 'bindAccount'
        },
        {
          reg: /^#?(zepp|刷步)解绑/i,
          fnc: 'unbindAccount'
        }
      ]
    });
  }

  // 1. 引导式绑定
  async bindAccount(e) {
    if (e.isGroup) {
      await e.reply('⚠️ 为了您的账号密码安全，请【私聊机器人】发送绑定指令！', false, { at: true });
      return true;
    }

    sessions[e.user_id] = {};
    await e.reply('请输入Zepp Life账号');

    // 设置下一个消息的上下文处理函数
    this.setContext('bindStep2_GetUsername');
    return true;
  }

  async bindStep2_GetUsername() {
    const e = this.e;
    const msg = e.msg ? e.msg.trim() : '';

    if (msg === '取消') {
      delete sessions[e.user_id];
      await e.reply('已取消绑定操作。');
      this.finish('bindStep2_GetUsername');
      return true;
    }

    if (!msg) {
      await e.reply('账号不能为空，请输入Zepp Life账号：');
      this.setContext('bindStep2_GetUsername');
      return true;
    }

    sessions[e.user_id].username = msg;
    await e.reply('请输入Zepp Life密码');

    this.finish('bindStep2_GetUsername');
    this.setContext('bindStep3_GetPassword');
    return true;
  }

  async bindStep3_GetPassword() {
    const e = this.e;
    const msg = e.msg ? e.msg.trim() : '';

    if (msg === '取消') {
      delete sessions[e.user_id];
      await e.reply('已取消绑定操作。');
      this.finish('bindStep3_GetPassword');
      return true;
    }

    if (!msg) {
      await e.reply('密码不能为空，请输入Zepp Life密码：');
      this.setContext('bindStep3_GetPassword');
      return true;
    }

    const { username } = sessions[e.user_id] || {};
    if (!username) {
      await e.reply('❎ 会话数据丢失，请重新发送 #绑定刷步 开始绑定。');
      this.finish('bindStep3_GetPassword');
      return true;
    }

    const password = msg;
    delete sessions[e.user_id];

    await e.reply('🔄 正在登录 Zepp Life ，请稍候...');

    try {
      const accessCode = await ZeppAPI.getAccessCode(username, password);
      const tokenInfo = await ZeppAPI.getToken(username, accessCode);

      // 保存绑定数据，并缓存 Token 避免首次刷步重复登录
      UserStore.saveUser(e.user_id, {
        username,
        password,
        autoStep: false,
        time: '06:00',
        appToken: tokenInfo.appToken,
        userId: tokenInfo.userId,
        tokenTime: Date.now(),
        deviceId: tokenInfo.deviceId
      });

      await e.reply('✅ 验证通过，账号绑定成功！');
    } catch (err) {
      logger.error('[Zepp-Life-Plugin] 账号引导式绑定失败:', err);
      await e.reply(`❎ 绑定失败，华米登录验证不通过。\n原因：${err.message}`);
    }

    this.finish('bindStep3_GetPassword');
    return true;
  }

  // 2. 引导式解绑与二次确认
  async unbindAccount(e) {
    const user = UserStore.getUser(e.user_id);
    if (!user) {
      await e.reply('❎ 您当前未绑定 Zepp Life 账号。');
      return true;
    }

    await e.reply('🔄 正在进行 Zepp Life解除登录，请发送“确认”确认解除，发送“取消”撤销当前操作。');
    this.setContext('unbindStep2_Confirm');
    return true;
  }

  async unbindStep2_Confirm() {
    const e = this.e;
    const msg = e.msg ? e.msg.trim() : '';

    if (msg === '取消') {
      await e.reply('已撤销解绑操作。');
      this.finish('unbindStep2_Confirm');
      return true;
    }

    if (msg === '确认') {
      await e.reply('🔄 此操作即将删除账户数据，请再次发送“确认删除”进行确认。发送“取消”撤销当前操作。');
      this.finish('unbindStep2_Confirm');
      this.setContext('unbindStep3_FinalConfirm');
      return true;
    }

    await e.reply('输入指令有误，请回复“确认”以继续，或“取消”退出当前操作。');
    this.setContext('unbindStep2_Confirm');
    return true;
  }

  async unbindStep3_FinalConfirm() {
    const e = this.e;
    const msg = e.msg ? e.msg.trim() : '';

    if (msg === '取消') {
      await e.reply('已撤销解绑操作。');
      this.finish('unbindStep3_FinalConfirm');
      return true;
    }

    if (msg === '确认删除') {
      UserStore.deleteUser(e.user_id);
      await e.reply('✅ Zepp Life账号解绑成功。');
      this.finish('unbindStep3_FinalConfirm');
      return true;
    }

    await e.reply('输入指令有误，请回复“确认删除”以确认解绑并删除，或“取消”退出当前操作。');
    this.setContext('unbindStep3_FinalConfirm');
    return true;
  }
}
