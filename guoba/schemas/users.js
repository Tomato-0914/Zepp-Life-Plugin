export default [
  {
    field: "usersData.users",
    label: "用户列表",
    bottomHelpMessage: "管理所有绑定的 Zepp Life 账号。您可以在此修改、新增或删除用户。保存后将自动更新本地 data 目录下的 {qq}.yaml 文件。",
    component: "GSubForm",
    componentProps: {
      multiple: true,
      schemas: [
        {
          field: "qq",
          label: "QQ号",
          required: true,
          component: "GSelectFriend",
          componentProps: {
            placeholder: "点击选择 QQ 号",
          },
        },
        {
          field: "username",
          label: "Zepp Life 账号",
          required: true,
          component: "Input",
          componentProps: {
            placeholder: "Zepp Life (原小米运动) 账号",
          },
        },
        {
          field: "password",
          label: "Zepp Life 密码",
          required: true,
          component: "InputPassword",
          componentProps: {
            placeholder: "Zepp Life 密码",
          },
        },
        {
          field: "autoStep",
          label: "是否自动刷步",
          component: "Switch",
        },
        {
          field: "time",
          label: "自动刷步时间",
          required: true,
          component: "Input",
          componentProps: {
            placeholder: "默认 06:00",
          },
          bottomHelpMessage: "每日自动执行步数的时间，格式为 HH:MM",
        },
        {
          field: "lastStep",
          label: "上次同步步数",
          component: "InputNumber",
          componentProps: {
            disabled: true,
          },
        },
        {
          field: "lastTime",
          label: "上次同步时间",
          component: "Input",
          componentProps: {
            disabled: true,
          },
        }
      ],
    },
  }
];
