import ZeppConfig from "../../components/config.js";
import { UserStore } from "../../components/userStore.js";
import configSchema from "./config.js";
import usersSchema from "./users.js";
import lodash from "lodash";
import { normalizeTime, validateStepParam } from "../../components/utils.js";

export const schemas = [
  ...configSchema,
  ...usersSchema
];

export function getConfigData() {
  const users = UserStore.getAllUsers().map(u => ({
    qq: String(u.qq || ''),
    username: u.username || '',
    password: u.password || '',
    autoStep: u.autoStep === true,
    time: u.time || '06:00',
    step: u.step || 0,
    pushGroups: u.pushGroups || [],
    pushFriends: u.pushFriends || [],
    lastStep: u.lastStep || 0,
    lastTime: u.lastTime || ''
  }));

  return {
    minStep: ZeppConfig.get('minStep') || 18000,
    maxStep: ZeppConfig.get('maxStep') || 28000,
    useProxy: ZeppConfig.get('useProxy') === true,
    apiProxy: ZeppConfig.get('apiProxy') || '',
    dpi: ZeppConfig.get('dpi') !== undefined ? ZeppConfig.get('dpi') : 200,
    usersData: {
      users
    }
  };
}

export function setConfigData(data, { Result }) {
  try {
    // 1. 先校验所有数据，任一项不合法则整体拒绝保存
    if (data.minStep !== undefined && data.maxStep !== undefined && Number(data.minStep) > Number(data.maxStep)) {
      return Result.error({}, "保存失败：随机最小步数不能大于随机最大步数");
    }

    const users = lodash.get(data, 'usersData.users');
    const normalizedUsers = [];
    if (Array.isArray(users)) {
      for (const u of users) {
        const qq = String(u.qq ?? '').trim();
        if (!qq) continue;

        const time = normalizeTime(u.time || '06:00');
        if (!time) {
          return Result.error({}, `保存失败：QQ ${qq} 的自动刷步时间「${u.time}」格式错误，应为 HH:MM（如 06:00）`);
        }

        let step = 0;
        const rawStep = String(u.step ?? '').trim();
        if (rawStep) {
          const res = validateStepParam(rawStep);
          if (!res.valid) {
            return Result.error({}, `保存失败：QQ ${qq} 的自动刷步步数「${rawStep}」无效。${res.error}`);
          }
          step = res.value;
        }

        normalizedUsers.push({
          qq,
          username: String(u.username || '').trim(),
          password: u.password || '',
          autoStep: u.autoStep === true,
          time,
          step,
          pushGroups: Array.isArray(u.pushGroups) ? u.pushGroups.map(String) : [],
          pushFriends: Array.isArray(u.pushFriends) ? u.pushFriends.map(String) : []
        });
      }
    }

    // 2. 保存全局配置
    if (data.minStep !== undefined) {
      ZeppConfig.set('minStep', Number(data.minStep));
    }
    if (data.maxStep !== undefined) {
      ZeppConfig.set('maxStep', Number(data.maxStep));
    }
    if (data.useProxy !== undefined) {
      ZeppConfig.set('useProxy', Boolean(data.useProxy));
    }
    if (data.apiProxy !== undefined) {
      ZeppConfig.set('apiProxy', String(data.apiProxy).trim());
    }
    if (data.dpi !== undefined) {
      ZeppConfig.set('dpi', Number(data.dpi));
    }

    // 3. 保存用户列表配置
    if (Array.isArray(users)) {
      const activeQQs = new Set(normalizedUsers.map(u => u.qq));

      for (const { qq, ...saveData } of normalizedUsers) {
        const existing = UserStore.getUser(qq);
        if (existing) {
          // 更换了账号或密码：清除 Token 缓存，强制用新账密重新登录，避免步数刷到旧账号
          if (existing.username !== saveData.username || existing.password !== saveData.password) {
            Object.assign(saveData, { appToken: '', userId: '', tokenTime: 0 });
          }
          // 更换了账号：清除旧账号的当日同步记录
          if (existing.username !== saveData.username) {
            Object.assign(saveData, { lastStep: 0, lastTime: '' });
          }
        }
        // lastStep / lastTime 为只读字段，不使用面板提交的旧值覆盖，避免冲掉面板打开期间自动刷步写入的最新记录
        UserStore.saveUser(qq, saveData);
      }

      // 删除在锅巴列表里被移除的用户
      const allUsers = UserStore.getAllUsers();
      for (const u of allUsers) {
        if (!activeQQs.has(String(u.qq))) {
          UserStore.deleteUser(u.qq);
        }
      }
    }

    return Result.ok({}, "保存成功辣~ (*´･ω･)з");
  } catch (e) {
    logger.error("[Zepp-Life-Plugin] 锅巴面板保存异常：", e);
    return Result.error({}, `保存失败：${e.message}`);
  }
}
