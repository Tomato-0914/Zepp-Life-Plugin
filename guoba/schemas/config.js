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
  }
];
