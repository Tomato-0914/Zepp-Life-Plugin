export default [
  {
    label: "自动刷步数上下限设置",
    component: "SOFT_GROUP_BEGIN",
  },
  {
    field: "minStep",
    label: "随机最小步数",
    component: "InputNumber",
    required: true,
    componentProps: {
      min: 1,
      max: 98000,
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
      max: 98000,
    },
    bottomHelpMessage: "随机生成步数的上限，默认 28000",
  }
];
