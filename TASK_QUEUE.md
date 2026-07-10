# TASK_QUEUE

## 待确认

- 2026-07-10：通过 `grill-with-docs` 压力测试单机直连版的自学辅导边界；已确认不建设自有教学服务器，学生使用自己的 DeepSeek API Key 直连 DeepSeek，当前版本不开放其他服务商或自定义接口地址，默认使用 Flash 模型，Pro 仅在设置页供家长切换；Key 保留明文 JSON 与手工编辑能力，但文件仅当前系统用户可读写，设置页和日志不输出完整 Key，并明确安全风险；同时保留主动求助模式与自动辅导模式，保存有效 Key 后默认自动辅导，并在设置页向家长说明持续 API 调用与费用风险；主动模式下作品与当前角色未变化时不重复请求，继续显示现有推荐；仅在当前辅导会话内保留上一轮提示及后续作品变化，切换作品或退出客户端即清除且不落盘，主界面不提供历史推荐列表；自动辅导采用 3 秒静默窗口、15 秒最短自动请求间隔、单请求运行与最新状态追赶，学生按推荐方向推进时保持提示稳定，完成整组后再生成下一轮，偏离方向时重新分析，主动点击不受自动间隔限制；学生端只展示一句简短总提示、由 1–3 个积木组成的小型连接结构和每块一句原因，不强行补满，不展示追问、长篇分析、额外示例、完成反馈或完整作品脚本，第一版不提供语音朗读；生成下一轮时旧提示仍有效则保留并显示准备状态，角色或方向变化后旧提示立即隐藏，失败时展示基础提示；完成判定只用于内部触发下一轮，检查积木类型与结构关系但不要求参数值一致；角色切换时旧提示立即失效并针对新角色重新分析，辅导会话继续；DeepSeek 只返回受约束 JSON，客户端验证 opcode 与结构关系后自行生成 XML，不加载模型原始 XML；推荐项必须同时属于官方白名单与当前可用工具箱，未知或不可用积木直接丢弃且不做近似替换，过滤后为零时改用本地规则独立生成基础提示；采用作品驱动、适应式与只读辅导，不提供聊天窗口、文字目标输入或自动积木写入；完全空白的作品不触发 AI，出现第一个有效积木后才开始辅导；学生偏离推荐后立即以新作品重新判断，不要求回退；保留内部辅导诊断但不向学生展示错误或警告列表；作品摘要保留当前角色完整脚本和其他角色少量摘要，不发送媒体资源或原始项目文件；AI 不可用时继续显示本地基础提示，学生端隐藏技术错误；继续压力测试实现边界。
- 2026-05-07：为桌面伴随程序整理 GitHub CI 与跨平台出包链路；目标是让 Windows / macOS runner 能稳定构建、测试、打包并上传产物；本轮先在独立 worktree 里核实现状、补测试与 workflow。

## 已完成

- 2026-05-24：完成从原始 workspace 拆出独立本地客户端仓；保留 `desktop-companion + shared + verification` 主线，继续采用 DeepSeek API 直连模式；同步收口 README、架构文档、仓库元数据，并完成独立 git 初始化与测试验证。
- 2026-05-07：修复 Windows CI 在 `npm run package:win:bundle` 阶段因 `electron-builder` 隐式触发 GitHub publish 而失败的问题；在桌面端共用 builder base config 中显式设置 `publish: "never"`，避免 GitHub Actions 因缺少 `GH_TOKEN` 在 NSIS 安装包收尾时报错；已按 TDD 先补回归测试，再完成修复，并通过 `desktop-companion` 全量测试。
- 2026-05-07：按开源项目标准整理仓库：补齐 AGPL-3.0 许可证、双语 README 与贡献治理文档，完善 GitHub issue/PR 模板，统一发布、路线图与项目结构说明；同时为 macOS 打包链路补上 zip 目标，并让 `Desktop Release Artifacts` workflow 明确产出 macOS `zip + dmg`、Windows `portable + installer` 对外口径。已补仓库开源基线测试、macOS zip 打包测试，并通过根级 `npm run test`。
- 2026-05-07：确认当前产品与文档主口径：只做本地基础版，定位为更通用的 `Scratch AI 教练桌面工具`，默认交互为“自动刷新”，仅保留 Windows / macOS 版本；不再继续推进“服务器版 + 单机版并存”方案。
- 2026-05-07：维护桌面端 CI / 出包 / Release 文档口径：明确 `CI` 只做构建和测试、不上传产物；`Desktop Release Artifacts` 会把 `installers/**` 作为 GitHub Actions artifact 上传，Windows / macOS 对应 artifact 名称分别为 `scratch-desktop-companion-windows` 和 `scratch-desktop-companion-macos`，默认保留 7 天；同时注明当前仓库还没有自动发布 GitHub Releases，避免把 Actions artifact 和 Release asset 混淆。
- 2026-05-07：将 GitHub Actions Windows runner 从 `windows-2025` 调整为 `windows-2022`：在保留 `actions/checkout` / `actions/setup-node` 的 Node 24 runtime 升级基础上，把 `CI` 与 `Desktop Release Artifacts` 的 Windows job 改回稳定的 `windows-2022`，避开 `windows-2025` 重定向 notice；同步将 workflow 回归测试口径改到 `windows-2022`。已按 TDD 先让 workflow 测试失败，再完成修复，并通过根级 `npm run test`。
- 2026-05-07：收口 GitHub Actions runtime 弃用告警：为 `CI` 与 `Desktop Release Artifacts` workflow 升级 `actions/checkout`、`actions/setup-node` 到 Node 24 runtime 的最新 major，并将产物上传同步升级；同时把 Windows runner 从 `windows-latest` 明确钉到 GA 的 `windows-2025`，避免继续依赖 `latest` alias 漂移，但不切到 GitHub 标记为 Beta 的 `windows-2025-vs2026`。已补 workflow 回归测试，并完成根级 `npm run test`。
- 2026-05-07：修复 GitHub Actions `Desktop Release Artifacts` 的 Windows bundle 出包入口：定位到 `package-win-bundle.mjs` 在 import 阶段就错误读取不存在的 `src/deepseek.config.json`，导致 `npm run package:win:bundle` 直接失败；现已改为显式 `main()` 入口、使用真实的 `src/main/deepseek.config.json`，并将 bundle 子脚本统一改成 `--skip-installers-copy` 后由 bundle 脚本自己收口 root `installers/` 中的 exe / `win-unpacked`。已新增定向回归测试，并完成 `desktop-companion` 全量测试与根级 `npm run test`。
- 2026-05-07：修复 GitHub Actions Windows runner 上 `@scratch-ai/desktop-companion` 的 7 个测试回归：定位到两类跨平台测试脆弱点，一是 `electron-builder-config.test.mjs` 使用 `URL.pathname` 组本地路径，Windows 下会把 `C:` 盘符变成非法伪路径；二是 symlink / macOS 缓存目录相关测试默认假设 POSIX 分隔符和相对 symlink 能力。现已改为 `fileURLToPath(...)`、按当前平台路径规则断言，并为相对 symlink 用例先做能力探测后再执行或跳过；已完成 `desktop-companion` 全量单测与根级 `npm run test`。
- 2026-05-07：修复 GitHub Actions 非 macOS runner 上的 `tools/verification` DMG 探测回归：定位到 `probeMacDmgSupport` 在 `/private/tmp` 不存在时会先于 mock `hdiutil` 调用抛出 `mkdtempSync ENOENT`；为缺失临时目录补回退到宿主 `os.tmpdir()` 的兜底，并新增回归测试覆盖缺失临时目录场景；已完成 `verification` 全量测试与根级 `npm run test`。
- 2026-05-07：维护桌面伴随程序启动与环境文档：将 `npm start` / `npm run dev` 固定到仓库本地 Electron，新增脚本回归测试，并把 npm workspace 依赖位置、全局旧版 Electron 误用风险、以及 `Node.js v22.16.0` 下 npm 兼容性 warning 的排障结论同步到 README 与开发交接文档；已完成源码启动验证与 desktop-companion 全量单测。
- 2026-05-07：修复桌面伴随程序“推荐积木”补位逻辑：当 DeepSeek 仅返回 1-2 条时，服务层会按 opcode 去重并用现有 fallback 推荐自动补满 3 步；已补定向单测并完成 desktop-companion 全量单测。
- 2026-05-07：桌面伴随程序将“推荐积木”统一收敛为 3 步：新增共享上限常量，把 DeepSeek/fallback 推荐积木都裁到 3 条，并同步将主界面展示上限从 4 调到 3。已完成桌面端定向单测与 desktop-companion 全量单测。
- 2026-05-07：为真实联调脚本 `verify-desktop-companion-real-e2e.mjs` 补充“自动刷新 / 手动点击”提示触发方式的 E2E 校验：新增设置窗口快照 helper 与测试，验证默认 `auto`、切换并保存 `manual`、配置文件落盘，以及真实 Scratch 重连后主窗口文案切到手动模式。已完成 verification 单测与真实 E2E 冒烟。
- 2026-05-07：桌面伴随程序新增“下一步提示触发方式”设置，默认自动刷新，可切回手动点击；自动模式下连接成功后与后续积木状态变化会自动请求 DeepSeek，并在请求进行中追上最新积木状态；同时将只读积木缩放继续下调到 `0.64`，并同步更新文档。已完成 shared 单测、verification 单测、desktop-companion 全量单测。
- 2026-05-07：同步桌面伴随程序文档到最新积木渲染口径：补充只读积木缩放继续下调、推荐积木 opcode 白名单、坏 opcode 自动降级，以及 93 个官方 opcode 的 Electron 真渲染 sweep 验证结果；已更新 README、开发交接文档和架构说明。
- 2026-05-07：继续收口桌面伴随程序积木显示：再次下调只读积木缩放比例；把推荐积木支持范围整理为白名单并补齐一批常用官方 opcode 模板；当 AI 返回不受支持或编造的 opcode 时自动映射到安全可渲染积木；已完成桌面端单测、shared 单测，以及 93 个 opcode 的 Electron 真渲染 sweep（0 fallback）。
- 2026-05-07：继续收口桌面伴随程序积木显示：进一步缩小只读积木尺寸，修复 `将颜色特效增加 25` 等推荐积木默认 XML 缺字段/数值的问题；补齐一批常用核心积木与画笔积木模板，增加效果类中文标签与 AI opcode 约束，并完成单测、workspace 测试和 CDP 真渲染抽检。
- 2026-05-07：修复桌面伴随程序积木渲染缺陷：将 `scratch-blocks` 图标资源改为本地 `media` 路径，统一下调只读积木缩放比例，并为推荐积木/脚本渲染失败补回退文案；已完成单测与 CDP 渲染验证。
- 2026-05-07：运行桌面伴随程序供本轮人工测试；按现有文档使用正常联调启动，不带 mock 环境变量。
- 2026-05-06：完善桌面伴随程序文档与界面说明文案；补充 `scratch-blocks` 原版积木渲染实现方案、代码增量、关键文件、验收口径与风险点，并完成回归测试和提交。
- 2026-05-06：将桌面伴随程序中的“当前角色程序 / 推荐积木”切换为官方 `scratch-blocks` 只读渲染；新增 Blockly XML 生成层、`currentTargetScriptXmlList` 状态字段、官方 workspace 宿主与 media 资源复制，并完成单测与截图回归。
- 2026-05-06：将桌面伴随程序中的“当前角色程序 / 推荐积木”升级为接近 Scratch 原版的彩色积木展示；新增结构化积木状态字段，保留原有文本链路给提示与兼容层使用，并补齐渲染与样式测试。
- 2026-05-06：补充桌面伴随程序启动与联调文档：明确正常启动不得带 mock 环境变量，并区分真实联调与 UI 演示入口；同时修复 `当前角色程序` 对 `重复执行 / 一直重复 / 如果` 等控制积木子堆栈的漏读问题。
- 2026-05-06：修正桌面伴随程序首页双列区块：将“当前角色程序 / 推荐积木”固定为同一行左右等宽显示，不再随窗口尺寸切成上下；右侧继续保留 4 条推荐积木展示。
- 2026-05-06：调整桌面伴随程序首页布局：将“当前角色程序”和“推荐积木”改为同一行左右布局，右侧推荐积木改为最多展示 4 块，并按桌面端现有风格抬高该区块展示密度。
- 2026-05-06：补充现场排障文档：明确当前只支持“伴随程序受控启动 + CDP 注入”，不支持附着到手工打开的 Scratch；同步复核 macOS 下本机 Scratch 的 CDP 与 bridge 验证链路可用。
- 2026-05-06：继续收口 DeepSeek 设置页展示：移除重复的“当前状态”面板，不再展示默认配置文件、来源和提示词设置；将 API Key 区放到首位，并同步调整验证脚本口径。
- 2026-05-06：收口 DeepSeek 设置页：取消运行时 env / 程序自带 key 回退，仅保留本地保存的 DeepSeek API Key；新增 Flash / Pro 模型选择；补回并本地存储可编辑提示词；同步更新设置页与文档口径。
- 2026-05-06：同步文档到最新本地版 UI 口径：补充主界面显示的已选 Scratch 路径、简化状态展示，并明确模块字段不再作为主界面展示内容。
- 2026-05-06：收口主界面信息冲突：移除“识别到的模块”展示，避免与“当前角色程序”形成重复或冲突认知；模块字段继续保留给 AI 提示和兼容层使用。
- 2026-05-06：补回主界面可见的 Scratch 软件路径展示：在操作区恢复“已选 Scratch”路径行，选择软件后可直接确认当前使用的可执行文件。
- 2026-05-06：完成本地版状态区再次收口：将状态并入操作区域，仅保留状态 / 当前角色 / 同步时间，并把连接成功文案收短为“已连接”；同时复现并确认当前 macOS 下伴随程序主链路可正常完成 CDP 注入与 bridge 连接。
- 2026-05-06：完成本地版桌面端交互与布局收口：取消窗口置顶，统一顶部状态与 DeepSeek 设置控件样式，操作区四按钮横排、状态信息下移，移除当前建议/继续追问/风险提示，并去掉按钮等待态转圈。
- 2026-05-06：同步文档到本地基础版口径：移除教师 sb3 / 参考作品 / 课堂流描述，统一为本机 Scratch + 当前作品 + DeepSeek API Key。
- 2026-05-06：完成本地基础版收敛：保留 Windows/macOS 本机 Scratch + 本地 AI 提示链路，移除教师 sb3/课堂参考流，首页改为桌面工具型布局，设置页收敛为本地 DeepSeek API Key 配置。
- 2026-05-05：完成 workspace 收口与目录重构；移出 `apps/server` 主线，将 `Windows-Test` 迁移为 `tools/verification`，统一根锁文件、忽略规则、清理脚本与 CI，保证项目在新电脑上 clone 后可继续做 Windows / macOS 开发、测试与出包。
