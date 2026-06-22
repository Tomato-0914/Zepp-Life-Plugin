import path from 'path';
import fs from 'fs';
import ZeppConfig, { getPluginRoot } from './components/config.js';

export function supportGuoba() {
  return {
    pluginInfo: {
      name: "Zepp-Life-Plugin",
      title: "Zepp-Life-Plugin",
      author: "Antigravity",
      authorLink: "https://github.com/Tomato-0914/Zepp-Life-Plugin",
      link: "https://github.com/Tomato-0914/Zepp-Life-Plugin",
      isV3: true,
      isV2: false,
      description: "绑定小米运动/Zepp Life账号实现每日自动/手动刷步数",
      icon: "material-symbols:directions-run",
      iconColor: "#4caf50",
    },
    configInfo: {
      schemas: [
        {
          label: "自动刷步设置",
          component: "SOFT_GROUP_BEGIN",
        },
        {
          field: "autoStep.enabled",
          label: "开启自动刷步",
          component: "Switch",
          bottomHelpMessage: "是否全局开启每日定时自动修改步数任务",
        },
        {
          field: "autoStep.cron",
          label: "自动刷步Cron时间",
          component: "Input",
          required: true,
          componentProps: {
            placeholder: "例如 0 30 20 * * ?",
          },
          bottomHelpMessage: "Cron 表达式。例如 0 30 20 * * ? 代表每日 20:30 执行",
        },
        {
          field: "autoStep.minStep",
          label: "随机最小步数",
          component: "InputNumber",
          required: true,
          componentProps: {
            min: 1,
            max: 98000,
          },
          bottomHelpMessage: "随机生成步数的下限",
        },
        {
          field: "autoStep.maxStep",
          label: "随机最大步数",
          component: "InputNumber",
          required: true,
          componentProps: {
            min: 1,
            max: 98000,
          },
          bottomHelpMessage: "随机生成步数的上限",
        }
      ],
      getConfigData() {
        return {
          autoStep: {
            enabled: ZeppConfig.get('autoStep.enabled') !== false,
            cron: ZeppConfig.get('autoStep.cron') || '0 30 20 * * ?',
            minStep: ZeppConfig.get('autoStep.minStep') || 18000,
            maxStep: ZeppConfig.get('autoStep.maxStep') || 28000,
          }
        };
      },
      setConfigData(data, { Result }) {
        try {
          ZeppConfig.set('autoStep.enabled', data.autoStep.enabled);
          ZeppConfig.set('autoStep.cron', data.autoStep.cron);
          ZeppConfig.set('autoStep.minStep', data.autoStep.minStep);
          ZeppConfig.set('autoStep.maxStep', data.autoStep.maxStep);
          return Result.ok({}, "保存成功辣~ (*´･ω･)з");
        } catch (e) {
          logger.error("[Zepp-Life-Plugin] 锅巴面板保存异常：", e);
          return Result.error({}, `保存失败：${e.message}`);
        }
      }
    }
  };
}
