# TASK_QUEUE

## 待确认

- 2026-05-07：为桌面伴随程序整理 GitHub CI 与跨平台出包链路；目标是让 Windows / macOS runner 能稳定构建、测试、打包并上传产物；本轮先在独立 worktree 里核实现状、补测试与 workflow。

## 已完成

- 2026-07-11：继续修复人工测试中 Scratch 仍默认英文的问题；新增 macOS `AppleLanguages` 读取作为 Scratch 受控启动语言兜底，并在运行日志记录实际 `--lang` 启动参数，覆盖当前系统 `en-CN, zh-Hans-CN` 但 Electron fallback 为英文的场景。已通过 launcher 定向测试和 desktop-companion 143 项测试。
- 2026-07-11：继续修复 Scratch 受控启动仍显示英文的问题；macOS 当前全局语言为 `en-CN, zh-Hans-CN` 时，Electron 可能给到英文 locale，导致 Scratch 收到英文启动参数。现已补强语言解析：当 Electron fallback 是英文但系统首选语言中存在中文时，优先传 `zh-CN` / `zh-TW` 给 Scratch。已通过 launcher 定向测试和 desktop-companion 142 项测试。
- 2026-07-11：修复 Scratch 受控启动仍显示英文的问题；真实探针确认 Scratch Desktop 支持 `--lang=zh-CN`，根因是客户端优先取系统首选语言列表时可能拿到 `en-US`，现已改为优先使用 Electron 当前应用语言，再用系统语言列表兜底。已通过 launcher 定向测试和 desktop-companion 141 项测试。
- 2026-07-11：继续修复人工测试反馈；Scratch 受控启动会优先使用 Electron 系统首选语言并把中文 locale 映射到 `zh-CN` / `zh-TW`，避免每次打开回到英文；推荐积木补齐画笔扩展只读 scratch-blocks 定义，避免退回文字显示；共享 schema 对旧/临时 mock 缺失 `detectedIssues` 时默认补空数组，避免验证客户端启动失败。已通过 shared 11 项和 desktop-companion 141 项测试。
- 2026-07-11：修复人工测试反馈三项问题；新增或变更积木后推荐会在 3 秒静默窗口后刷新；推荐积木渲染失败时不再退化成普通积木文字；Scratch 受控启动只追加调试端口，不覆盖用户语言设置。已补自动刷新、推荐积木 fallback 和启动参数回归测试，并通过桌面端 137 项测试。
- 2026-07-11：重新运行当前客户端供人工测试；使用正常联调启动，不带 mock 环境变量；Electron 主进程和渲染进程已确认运行，启动日志无错误。
- 2026-07-11：修复 macOS 人工测试反馈；“下一步提示”改为直接面向学生说“你”，DeepSeek prompt 明确禁止第三人称称呼；推荐积木区域会把扁平返回的 1-3 个积木串成一组 Scratch workspace 展示，不再只渲染第一块。已补 CoachService 和 renderer 回归测试，并通过桌面端 135 项测试。
- 2026-07-11：运行当前 macOS 版本桌面伴随程序供人工用户测试；按现有文档使用正常联调启动，不带 mock 环境变量；修复后已重启到最新源码版进程。
- 2026-07-11：补齐导出规则文档口径；将双语 README 的旧 GitHub Actions artifacts 分发说明改为正式 GitHub Releases 只导出 4 个无 Key 包，并在架构风险点中明确正式导出矩阵固定为 Windows portable / setup、macOS zip / dmg。
- 2026-07-11：维护发布收尾文档；同步 README、路线图和中英文发布说明到最终口径：正式分发通过 GitHub Releases 自动发布 4 个无 Key 包，重复发布会先清空旧 Release assets，`with-key` 打包入口禁用且不得保留历史 asset，GitHub 自动生成的源码 zip/tar.gz 不属于本项目上传的 Release 资产。
- 2026-07-11：继续收口 `v0.1.0` GitHub Release 资产；远端页面仍残留旧 `with-key` Windows 产物，本轮将发布前清理改为逐个删除旧 Release asset，并在上传前校验不得残留 `with-key` 或额外资产；Release 仍只 staging 4 个无 Key 文件：Windows portable / setup、macOS zip / dmg。
- 2026-07-11：按发布安全要求收口桌面端产物矩阵；移除 `with-key` 打包变体、公开 npm 脚本、旧测试口径和可注入打包 Key 的环境变量，Windows bundle 只生成无 Key portable / installer；GitHub Release 重发同名版本前会通过 GitHub API 强制删除旧 Release，再只上传 4 个无 Key 安装文件：Windows portable、Windows installer、macOS zip、macOS dmg，避免任何预置 Key 版本进入发布链路或继续挂在 Release 页面。
- 2026-07-11：修复 GitHub Release 最后上传 asset 失败；`v0.1.0` 重新触发后 Windows / macOS 出包均已成功，失败点收敛到 `softprops/action-gh-release` 上传阶段。已将 Release assets staging 收口为 `.exe` / `.zip` / `.dmg` / `SHA256SUMS.txt` / `RELEASE-NOTES.md` 等可下载文件，避免把 `win-unpacked/` 目录内容直接交给 Release action。
- 2026-07-11：修复 `v0.1.0` 发布出包失败；定位到 `electron-builder` 配置中的 `publish: "never"` 被当作 publisher provider 解析，导致 Windows / macOS 打包步骤失败。已改为在程序化 `build()` 调用参数中禁用发布，保留 GitHub Release workflow 负责上传 Release assets；已完成桌面端全量测试和本地 macOS zip 出包验证。
- 2026-07-11：完成桌面伴随程序 GitHub Release 自动发布链路；`Desktop Release Artifacts` 保留 PR / main 的 Windows 与 macOS Actions artifact，同时支持 `v*` tag 或手动填写 `release_version` 创建正式 GitHub Release，并上传 Windows portable / installer 与 macOS zip / dmg 产物；已补 workflow 回归测试和中英文发布文档。
- 2026-07-11：完成一轮完整测试；根级自动化回归通过（shared 10 项、verification 33 项、desktop-companion 134 项），桌面端 UI 自动化通过并刷新 mock 截图；真实 Scratch bridge `cat-motion` 操作验证已成功捕获 `manual-project-mutation:cat-motion-ran` payload，确认 Scratch 操作后桥接数据会更新（脚本收尾清理阶段触发 120s 超时，但核心断言已输出成功）；打包 mac app 后完成真实桌面 E2E，覆盖受控启动 Scratch、加载猫鼠 `.sb3`、教学软件自动更新当前角色程序、自动提示模式文案、设置切换手动模式和重连注入日志。
- 2026-07-11：完成 6 个自学辅导切片完整验收与修复；code review 发现并修复空白作品旧提示/手动请求、无效结构关系、baseline 已存在推荐误判完成、手动模式加载项目后自动请求、DeepSeek 超长或携带 `fields`/`inputs` 推荐结构导致 fallback、Electron 路径和真实 E2E 退出弹窗残留问题。已完成根级自动化测试、桌面 UI 截图回归，以及真实 Scratch + DeepSeek live 点击/截图验收；live E2E 生成 10 张截图并确认结束后无残留 Scratch 自动化进程。
- 2026-07-11：按 TDD 完成自学辅导计划切片 6；本地配置文件写入时会在 POSIX 平台收紧为 `0o600`，修改旧配置也会修正权限，清除 Key 后会删除 `customAiApiKey` 字段；运行日志、DeepSeek 失败 warning、公开状态和设置页均不回显完整 Key；设置页明确明文本地保存风险，并保留默认自动模式、Flash 默认模型和 Pro 选项回归。已完成安全定向回归。
- 2026-07-11：按 TDD 完成自学辅导计划切片 5；学生主界面收口为一句总提示和一个只读推荐积木 workspace，结构化 `recommendation` 会按连接/嵌套关系整组渲染，最多显示 3 条简短原因且不强行补满；学生端隐藏模型名、生成时间、追问、示例、诊断和技术错误，同时保留旧扁平推荐的兼容展示。已完成 renderer 定向回归。
- 2026-07-11：按 TDD 完成自学辅导计划切片 4；新增可注入时钟的 `CoachingSession` 状态机，支持 3 秒静默窗口、15 秒自动请求间隔、单请求运行、请求期间最新状态追赶，并接入推荐 `following` / `completed` / `diverged` 判定。`SessionManager` 已改为通过状态机调度自动/主动请求，空白作品不触发自动请求，主动模式相同签名不重复请求，角色切换或偏离方向会隐藏旧提示并重新分析；已完成状态机单测、桌面端集成测试和根级全量回归。
- 2026-07-11：按 TDD 完成自学辅导计划切片 3；新增 `recommendation-matcher` 纯函数层，基于当前角色原始 block map 递归匹配结构化推荐，支持顺序连接、条件槽、`SUBSTACK` 和 `SUBSTACK2` 的结构匹配，并区分 `unchanged`、`following`、`completed`、`diverged`。判定逻辑忽略参数值和坐标变化，保持不依赖界面 XML 文本；已完成定向测试，后续会话状态机接入留给切片 4。
- 2026-07-11：按 TDD 完成自学辅导计划切片 2；`CoachService` 已迁移到 `summary + recommendation.root` 结构化 AI 积木推荐协议，DeepSeek prompt 改为直接给 1–3 个按顺序连接的具体积木，服务层严格解析共享 schema，过滤未知 opcode 和未加载扩展积木；保留旧 `recommendedBlocks` 扁平兼容输出，但不再近似替换、不再补满，全部无效时降级到本地基础提示。已完成 CoachService 定向测试和桌面端定向回归。
- 2026-07-10：按 TDD 完成自学辅导实施计划切片 1；新增 1–3 个节点的结构化积木推荐协议，支持 `next`、条件槽、`SUBSTACK` 和 `SUBSTACK2`，严格拒绝额外字段、超过 3 个节点和模型原始 XML；客户端新增递归 Scratch Blockly XML 生成入口，同时保留旧扁平协议供下一切片渐进迁移；共享包 10 项、验证工具 32 项、桌面端 95 项测试全部通过。
- 2026-07-10：完成单机直连自学辅导的 `grill-with-docs` 压力测试；产品边界、交互模式、结构化积木协议、会话状态机、安全约束和非目标均已确认，并形成设计文档、8 份 ADR、领域词典及分六个垂直切片的 TDD 实施计划；本轮未修改业务代码。
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
