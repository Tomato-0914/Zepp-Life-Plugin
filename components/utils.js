import fs from 'fs';
import path from 'path';
import { getPluginRoot } from './config.js';

const PLUGIN_ROOT = getPluginRoot();

// 单次同步步数上限（微信运动单日上限）
export const MAX_STEP = 98800;

export const version = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8')).version;

const pad = (n) => String(n).padStart(2, '0');

// 获取北京时间（UTC+8），之后用 getHours/getDate 等方法读取即为北京时间
export function getChinaDate() {
  const now = new Date();
  return new Date(now.getTime() + (8 * 60 * 60 * 1000) + now.getTimezoneOffset() * 60 * 1000);
}

export function getTodayDateString() {
  const d = getChinaDate();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getTimeString() {
  const d = getChinaDate();
  return `${getTodayDateString()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function getCurrentHHMM() {
  const d = getChinaDate();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 将 "6:00"、"06：00" 等格式统一为 "06:00"，非法时间返回 null
 */
export function normalizeTime(str) {
  const match = String(str ?? '').trim().match(/^(\d{1,2})[:：](\d{1,2})$/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

export function validateStepParam(param) {
  const p = String(param ?? '').trim();
  if (p === '0') {
    return { valid: true, value: 0 };
  }

  // 检查是否为范围如 15000-25000
  const rangeMatch = p.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    if (min > MAX_STEP || max > MAX_STEP) {
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
    const val = parseInt(singleMatch[1], 10);
    if (val > MAX_STEP) {
      return { valid: false, error: '输入错误，步数数值需在 0 到 98,800 之间喵~' };
    }
    return { valid: true, value: val };
  }

  return { valid: false, error: '格式错误。请输入单个数字(如 20000)或步数范围(如 15000-25000)，输入 0 代表清除固定步数。' };
}

// 在 [min, max] 内取随机整数，上下限填反时自动交换
export function randomBetween(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function maskUsername(username) {
  const name = String(username || '');
  return name.length > 7
    ? name.substring(0, 3) + '****' + name.substring(name.length - 4)
    : name;
}

export function getPlgPath() {
  return `${process.cwd().replace(/\\/g, '/')}/plugins/${path.basename(PLUGIN_ROOT)}`;
}
