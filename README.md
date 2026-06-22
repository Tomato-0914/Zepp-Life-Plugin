# Zepp-Life-Plugin

基于 **TRSS-Yunzai + LLBot(llonebot)** 的 **Zepp Life (原小米运动)** 每日自动与手动刷步数插件。支持个人与群聊绑定、自动随机步数任务以及锅巴面板快捷管理。

---

## 主要功能

1. **多账号独立管理**：每个绑定用户的配置各自存储于独立的 `{qq}.yaml` 配置文件中。
2. **随机安全防风控**：支持设定每日自动刷步时间的随机步数范围上限与下限，每次自动刷步在多用户间加入随机间隔延时。
3. **固定自动刷步数**：除了全局随机步数外，用户还可以单独为自己设置每日自动任务同步时的固定刷步数。
4. **引导式交互会话**：通过微信/QQ私聊发起绑定或解绑，Bot将智能引导输入账密，并在解绑时提供双重安全确认。
5. **步数一致性校验**：微信运动/支付宝运动不支持单日步数倒退。本插件在同步时会自动判断今日已同步步数，防止同步更小的步数产生同步失败。单次最大同步步数上限为 98,800。
6. **锅巴管理面板支持**：模块化设计 Guoba 面板结构，无需修改文件即可在网页端统一管理全局随机范围与用户绑定列表。
7. **图片版精美帮助**：基于 Puppeteer 高清渲染的暗黑玻璃质感图片版命令帮助。

---

## 安装说明

在您的 Yunzai 机器人根目录下克隆本插件：

```bash
git clone https://github.com/Tomato-0914/Zepp-Life-Plugin.git ./plugins/Zepp-Life-Plugin
```
```bash
pnpm install --filter=Zepp-Life-Plugin
```

---

## 常用命令一览

| 指令类别 | 命令示例 | 权限 | 功能描述 |
| :--- | :--- | :---: | :--- |
| **账号绑定** | `#zepp绑定` 或 `#刷步绑定` | 用户 | 发起私聊引导会话，输入账号与密码以进行绑定校验 |
| **账号解绑** | `#zepp解绑` 或 `#刷步解绑` | 用户 | 二次安全确认后，彻底清除本地的绑定配置与数据 |
| **查看状态** | `#我的步数` 或 `#查看步数` | 用户 | 查看当前绑定的账号、步数上限、自动状态、固定步数与上次同步步数 |
| **手动修改** | `#刷步 [步数]` 或 `#修改步数 [步数]` | 用户 | 修改指定步数。若未带数字参数，将引导提示输入步数 |
| **随机修改** | `#随机刷步` | 用户 | 根据全局配置中设定的最小/最大随机步数随机修改今日步数 |
| **自动任务** | `#自动刷步 [开启/关闭]` | 用户 | 开启或关闭本人的每日定时自动刷步任务（不带参数则切换开关） |
| **设置时间** | `#设置自动刷步时间 [时:分]` | 用户 | 设置本人每日自动刷步任务的执行时间（例如：`#设置自动刷步时间 07:30`） |
| 设置步数 | #设置自动刷步数 [步数/范围] | 用户 | 设置每日自动刷步的固定步数或范围（例如：`#设置自动刷步数 30000` 或 `#设置自动刷步数 15000-25000`，填 0 恢复随机） |
| **推送群聊** | `#设置自动推送群 [群号/关闭]` | 用户 | 配置自动推送的群聊（在群聊内发送可快捷加/退当前群；留空进入私聊引导） |
| **推送好友** | `#设置自动推送好友 [QQ号/关闭]` | 用户 | 配置自动推送的好友（留空进入私聊引导，输入 QQ 号列表设置） |
| **图片帮助** | `#zepp帮助` 或 `#刷步帮助` | 用户 | 获取基于 Puppeteer 高清渲染的图片版命令指南卡片 |
| **插件更新** | `#刷步更新` 或 `#zepp更新` | 主人 | 自动拉取 Git 代码，补全依赖，并安全重启 Bot 进程 |

---

## 解决 429 报错（接口限流风控）

如果您的 Yunzai 机器人部署在云服务器（VPS，如腾讯云、阿里云等机房）上，登录绑定时大概率会遇到华米防火墙的风控，报错：`登录请求被华米服务器限流（429 Too Many Requests）`。

这是因为机房 IP 被华米服务器风控导致的，解决办法是利用 **Hugging Face Spaces** 免费搭建一个专属的中转代理服务，操作极其简单且完全免费。

### Hugging Face 代理服务创建步骤

1. **注册并创建空间**：
   * 登录 [Hugging Face](https://huggingface.co/)（如无账号，使用邮箱免费注册一个）。
   * 进入 [Hugging Face Spaces](https://huggingface.co/spaces)，点击右上角 **`New Space`**（新建空间）。
   * 填写基本信息：
     * **Space name**：自定义名字（例如 `zepp-proxy`）
     * **Select the Space SDK**：选择 **`Gradio`** (Python/FastAPI 环境)
     * **Space hardware**：选择默认的 **`CPU basic (Free)`** (完全免费)
     * **Choose visibility**：选择 **`Public`** (公开，确保机器人无需 Token 即可连接)
     * 点击底部 **`Create Space`** 创建。

2. **创建代码文件并写入代理逻辑**：
   * 空间创建完毕后，点击顶部的 **`Files`** 选项卡。
   * 点击右上角的 **`+ 贡献`**（或 **`+ Add file`**） -> 选择 **`Create a new file`** (创建新文件)。
   * 文件名输入 **`app.py`**。
   * 将以下代码完整粘贴进编辑器中：

     ```python
     import requests
     from fastapi import FastAPI, Request, Response

     app = FastAPI()

     @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
     async def proxy(request: Request, path: str):
         target = request.query_params.get("target")
         if not target:
             return Response("Zepp Proxy is running! Please use /?target=URL", status_code=200)
         
         headers = dict(request.headers)
         headers.pop("host", None)
         headers.pop("x-forwarded-for", None)
         headers.pop("x-forwarded-proto", None)
         headers.pop("x-forwarded-port", None)
         
         method = request.method
         body = await request.body()
         
         try:
             resp = requests.request(
                 method=method,
                 url=target,
                 headers=headers,
                 data=body,
                 allow_redirects=False,
                 timeout=15
             )
             
             exclude_headers = ['content-encoding', 'transfer-encoding', 'connection', 'keep-alive', 'content-length']
             resp_headers = {k: v for k, v in resp.headers.items() if k.lower() not in exclude_headers}
             
             return Response(content=resp.content, status_code=resp.status_code, headers=resp_headers)
         except Exception as e:
             return Response(f"Proxy error: {str(e)}", status_code=500)

     if __name__ == "__main__":
         import uvicorn
         uvicorn.run(app, host="0.0.0.0", port=7860)
     ```

   * 下拉页面，点击底部的 **`Commit changes to main`** 按钮保存提交。

3. **等待部署并获取代理链接**：
   * 提交后，回到 **`App`** 选项卡，等待 10~20 秒，当顶部状态由 `Building` 变为绿色的 **`Running`** 时即代表成功。
   * 记下你的专属代理链接，格式为：`https://你的用户名-空间名称.hf.space`。

4. **配置机器人插件**：
   * 在你的机器人上，可以通过**锅巴面板**（Guoba Panel）或者直接编辑配置文件 **`config/config/config.yaml`**。
   * 开启“启用中转代理”开关（配置文件中为 `useProxy: true`）。
   * 填写“中转代理地址”为刚才生成的链接（配置文件中为 `apiProxy: "https://你的用户名-空间名称.hf.space"`）。
   * 保存并重载插件，即可成功避开机房 IP 限制！

---

## 致谢

|致谢|名称|
|-|-|
|Antigravity|核心编辑|
