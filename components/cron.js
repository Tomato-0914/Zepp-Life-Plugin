import ZeppConfig from './config.js';

// 默认每分钟巡检一次
export const DEFAULT_AUTO_CRON = '0 * * * * ?';

// node-schedule 由 Yunzai 本体提供；缺失时退回 Yunzai 内置定时任务（修改 cron 需重启生效）
export let schedule = null;
try {
  schedule = (await import('node-schedule')).default;
} catch (err) {
  logger.warn('[Zepp-Life-Plugin] 未找到 node-schedule，自动刷步巡检 cron 修改后需重启生效');
}

const NUM_FIELD = /^[\d*?,/\-LW#]+$/;
// 月、周字段允许使用 JAN、MON 等英文缩写
const NAME_FIELD = /^[\dA-Za-z*?,/\-LW#]+$/;

export function getAutoCron() {
  const cron = String(ZeppConfig.get('autoCron') ?? '').trim();
  return cron && !validateCron(cron) ? cron : DEFAULT_AUTO_CRON;
}

/**
 * 校验巡检 cron 表达式，合法返回 null，否则返回错误原因
 * 注意：node-schedule 遇到非法 cron 会尝试按日期解析成一次性任务，因此需先按字段校验
 */
export function validateCron(cron) {
  const fields = String(cron ?? '').trim().split(/\s+/);
  if (fields.length < 5 || fields.length > 6) {
    return 'cron 表达式应为 5 段（分 时 日 月 周）或 6 段（秒 分 时 日 月 周）';
  }
  if (!fields.every((f, i) => (i >= fields.length - 2 ? NAME_FIELD : NUM_FIELD).test(f))) {
    return 'cron 表达式包含非法字符';
  }
  if (fields.length === 6 && !/^\d+$/.test(fields[0])) {
    return '巡检频率不能高于每分钟一次，6 段格式的秒字段请填写固定数字（如 0）';
  }
  if (schedule) {
    const job = schedule.scheduleJob(fields.join(' '), () => {});
    if (!job) return 'cron 表达式无法解析';
    job.cancel();
  }
  return null;
}
