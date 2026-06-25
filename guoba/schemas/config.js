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
  }
];
