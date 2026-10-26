export default [
  {
    field: "minStep",
    label: "随机最小步数",
    component: "InputNumber",
    required: true,
    componentProps: {
      min: 1,
      max: 98800,
    },
    bottomHelpMessage: "随机生成步数的下限，默认 18000",
  },
  {
    field: "maxStep",
    label: "随机最大步数",
    component: "InputNumber",
    required: true,
    componentProps: {
      min: 1,
      max: 98800,
    },
    bottomHelpMessage: "随机生成步数的上限，默认 28000",
  },
  {
    field: "useProxy",
    label: "启用中转代理",
    component: "Switch",
    bottomHelpMessage: "若服务器机房 IP 遭遇 429 风控限流，请开启此项并通过下方配置中转反代（默认关闭）",
  },
  {
    field: "apiProxy",
    label: "中转代理地址",
    component: "Input",
    componentProps: {
      placeholder: "例如: https://siran002-zepp-proxy.hf.space",
    },
    bottomHelpMessage: "中转反代链接。推荐使用免费的 Hugging Face 部署的代理链接。",
  },
  {
    field: "dpi",
    label: "截图 DPI 比例",
    component: "InputNumber",
    required: true,
    componentProps: {
      min: 50,
      max: 300,
    },
    bottomHelpMessage: "控制所有生成图片的分辨率缩放比例，范围 50 至 300。100 为标准 1x，200 为 2x 高清（默认），300 为 3x 超清。",
  },
  {
    field: "autoCron",
    label: "自动刷步巡检频率",
    component: "Input",
    required: true,
    componentProps: {
      placeholder: "默认 0 * * * * ?（每分钟）",
    },
    bottomHelpMessage: "巡检任务的 cron 表达式（秒 分 时 日 月 周，按服务器本地时区），保存后立即生效，最高每分钟一次。每次巡检会为「已到设定时间且今日尚未自动刷步」的用户执行刷步，间隔越长实际执行越可能晚于设定时间。示例：0 */5 * * * ? 每 5 分钟；0 0 * * * ? 每小时整点。",
  }
];
