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
  }
];
