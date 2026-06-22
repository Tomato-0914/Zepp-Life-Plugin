import ZeppConfig from "../../components/config.js";
import { UserStore } from "../../components/userStore.js";
import configSchema from "./config.js";
import usersSchema from "./users.js";
import lodash from "lodash";

export const schemas = [
  {
    label: "Zepp Life 刷步设置",
    component: "SOFT_GROUP_BEGIN",
  },
  ...configSchema,
  ...usersSchema
];

export function getConfigData() {
  const users = UserStore.getAllUsers().map(u => ({
    qq: String(u.qq || ''),
    username: u.username || '',
    password: u.password || '',
    autoStep: u.autoStep !== false,
    time: u.time || '06:00',
    lastStep: u.lastStep || 0,
    lastTime: u.lastTime || ''
  }));

  return {
    minStep: ZeppConfig.get('minStep') || 18000,
    maxStep: ZeppConfig.get('maxStep') || 28000,
    usersData: {
      users
    }
  };
}

export function setConfigData(data, { Result }) {
  try {
    // 1. 保存全局配置
    if (data.minStep !== undefined) {
      ZeppConfig.set('minStep', Number(data.minStep));
    }
    if (data.maxStep !== undefined) {
      ZeppConfig.set('maxStep', Number(data.maxStep));
    }

    // 2. 保存用户列表配置
    const users = lodash.get(data, 'usersData.users');
    if (users !== undefined && Array.isArray(users)) {
      const activeQQs = new Set(users.map(u => String(u.qq).trim()).filter(qq => qq));
      
      // 保存/更新提交的用户配置
      for (const u of users) {
        const qq = String(u.qq).trim();
        if (!qq) continue;
        UserStore.saveUser(qq, {
          username: u.username || '',
          password: u.password || '',
          autoStep: u.autoStep !== false,
          time: u.time || '06:00',
          lastStep: u.lastStep || 0,
          lastTime: u.lastTime || ''
        });
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
