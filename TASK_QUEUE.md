# TASK_QUEUE

## 待确认

- 2026-07-13：运行桌面伴随程序供人工查看效果；按正常联调启动，不带 mock 环境变量，待用户确认界面效果。
- 2026-07-12：打开桌面伴随程序供真实人工测试；按正常联调启动，不带 mock 环境变量，确认应用可用后由用户执行真实测试。
- 2026-05-07：为桌面伴随程序整理 GitHub CI 与跨平台出包链路；目标是让 Windows / macOS runner 能稳定构建、测试、打包并上传产物；本轮先在独立 worktree 里核实现状、补测试与 workflow。

## 已完成

- 2026-07-16：完成最终文档收口。`docs/architecture.zh-CN.md` 已补齐推荐积木 XML 编译、params 输入槽、`recommended-block-capabilities.ts` 能力表和 `dist/recommended-block-capabilities.js` 构建入口；`docs/maintenance.zh-CN.md` 已补齐白名单/能力表/params 输入槽/推荐渲染合同变更时的文档更新和验证检查口径。
- 2026-07-16：追加完成组合积木输入槽渲染验证。新增 XML 单测与真实 Electron 合同 case，覆盖 `重复执行` 次数槽填 `n + 2`、`(rounds + bonus) * 2`、`round(number)`、`listlength(购物清单)`，以及 substack 内变量累加公式、移动步数公式、`repeat until` 取余条件、`if/else` 算式比较和变量赋值复合公式。修复 `repeatTimes` 对特殊 reporter 函数的解析，让数字槽先尝试 `round / length / listlength` 等 reporter，再退到普通公式和默认数字；`test:recommendation-render-contract` 通过 5 个组合输入槽变体，0 fallback / 0 degraded。
- 2026-07-16：完成推荐积木“笨办法”穷举渲染验证。`test:recommendation-render-contract` 已从少量结构样例扩展为真实 Electron + scratch-blocks 批量矩阵：94 个单积木、71 个结构化 root、4908 个合法 `next / condition / substack / substack2` 关系 pair、5 个多关系组合、12 个 params 协议变体、仅 reporter 变量名可见性和 3 个 terminal 非法 next 全部逐项断言，运行结果 0 fallback / 0 degraded。补出 `recommended-block-capabilities.js` 构建入口，确保验证脚本复用同一份能力规则。
- 2026-07-16：修复 C49 四舍五入/取余数推荐显示缺口。根因是 DeepSeek 可能返回 `operator_round number` / `operator_mod number 5` 这类运算占位参数，或只在中文 reason 里描述“四舍五入/余数”，渲染层会退成文本/变量 reporter。现推荐 XML 可从占位参数和自然语言推断生成真实 `operator_round` 与 `operator_mod` 积木，50 目标 C49 新增 XML opcode displayCheck 守门。真实复测产物 `multi-goal-render-completeness-50-20260716-c49-round-mod-fix-v3/`：C49 good，`renderOk=true`、`semanticOk=true`、weak 0；全仓测试通过（shared 14、verification 37、desktop-companion 248），94 个推荐 opcode 渲染合同通过。
- 2026-07-16：完成 50 目标推荐语义质量收口。针对原 15 个 weak 目标及复跑暴露的能量/克隆、C46 停止全部、C50 文本拼接说出变量等弱项，补充定向 fallback、DeepSeek 结构替换守门、Strict 参数 `x/y`、坐标/角度/取余/字符串函数/列表长度等 XML 参数渲染，并修正 C33 `苹果` 合法列表项误判。真实验收产物 `multi-goal-render-completeness-50-20260716-final-v3/`：50/50 good，`ok=true`、`renderOk=true`、`semanticOk=true`、weak 0、渲染失败 0、步骤 102；全仓测试通过（shared 14、verification 37、desktop-companion 247），94 个推荐 opcode 渲染合同通过。
- 2026-07-16：完成 50 个不同本课目标推荐积木真实渲染守门。新增 `render-completeness-50` 目标套件、根级 `npm run verify:render-completeness-50` 命令与 DOM 渲染完整性审计；自动逐目标输入、启动真实 Companion + Scratch，检查推荐 XML、Blockly SVG、非 shadow 可见积木、fallback/degraded 状态和变量文字。真实 DeepSeek 验收产物 `multi-goal-render-completeness-50-20260716-v2/` 共 102 步、203 张截图，50/50 目标 `renderOk=true`、渲染失败 0、变量可见性失败 0、推荐 workspace 50 个、非 shadow 积木 204 个；语义评分仍有 15 个 weak 目标，已保留在报告中作为后续推荐质量优化项。全仓测试通过（shared 14、verification 37、desktop-companion 241），94 个推荐 opcode 真实渲染合同通过。
- 2026-07-16：完成第三组 10 个真实场景目标稳定性验收，覆盖商品总价、BMI、成绩等级、问答计分、购物清单、广播开场、造型动画、音量渐强、距离提示和密码验证。新增 `real-world-stability` 目标套件与 seed 配置；Strict 参数协议补入 `list` / `broadcast`，推荐 XML 支持列表名、广播名、字符串常量、距离鼠标 reporter、音量增量与文本变量赋值；本地定向 fallback 在 DeepSeek 严格输出不可用或明显偏题时保持最多 5 节点且结构合法。最终真实 Electron + Scratch 3 + DeepSeek 产物 `multi-goal-10-verification-20260716-real-world-final/` 共 42 步、83 张截图，`FINAL_AUDIT.md` 对公式嵌套、列表/广播声明、条件阈值、循环/等待参数和 Blockly 可见文字逐项审计，10/10 good、关键参数缺失 0、渲染异常 0、变量文字缺失 0。全仓测试通过（shared 14、verification 36、desktop-companion 241），94 个推荐 opcode、合法结构、变量可见性与 terminal 合同通过。
- 2026-07-16：完成第二组 10 目标推荐相关性优化。Strict 参数协议新增 `key`，并对 `MESSAGE` 等常见大小写偏差按允许参数名归一化；事件/侦测按键积木可渲染具体方向键，移动步数可使用 `speed` reporter；正式推荐白名单补入 `event_whenthisspriteclicked`，当前覆盖 94 个 opcode。新增独立 `known-variable-goal-fallback.ts`，为温度换算、长方形面积、点击计分和变量速度提供最多 5 节点、结构合法、复用现有变量的定向 fallback；对结构合法但明显偏题的 DeepSeek 点击/变量目标也会替换为定向提示。真实定向复测产物 `multi-goal-10-verification-20260716-math-optimized/`、`...-click-optimized/`、`...-speed-optimized/` 均为 good；合并报告 `multi-goal-10-verification-20260716-variable-suite/OPTIMIZED_AUDIT.md` 达到 10/10 good、55/55 变量文字可见、空圆形 0。全仓测试通过（shared 14、verification 35、desktop-companion 236），94 个推荐 opcode、合法结构、变量可见性和 terminal 合同通过。
- 2026-07-16：完成第二组 10 个不同目标的变量名可见性真实验收，覆盖偶数求和、温度换算、长方形面积、10 秒倒计时、奇偶判断、1 到 8 累乘、点击计分、生命值、变量速度和变量六边形。新增 `--goal-suite=variable-visibility`、独立 seed/case 配置和自动审计：逐个比较推荐 XML 中每个 `VARIABLE` field 的出现次数与同一 Blockly workspace 的实际可见文字次数，少一次即判空圆形失败。真实产物 `multi-goal-10-verification-20260716-variable-suite/` 共 41 步、81 张教练/Scratch 截图、29 个推荐渲染状态；审计 `VARIABLE_VISIBILITY_AUDIT.md` 统计 65 次变量字段、65 次可见文字、缺失 0 次，10/10 目标变量显示通过。目标相关性方面 7/10 命中预设变量；V3 面积、V7 点击计分、V9 变量速度因 DeepSeek Strict 结构被拒绝后进入通用 fallback，变量文字仍完整，但推荐不够贴题，已在报告中单独标明。全仓测试通过（shared 14、verification 35、desktop-companion 231），93 个推荐 opcode、合法结构、变量名可见性与 terminal 合同通过。
- 2026-07-16：修复推荐积木变量 reporter 只显示空圆形、不显示变量名的问题。根因是推荐 XML 虽有 `<field name="VARIABLE">n</field>`，但没有 workspace 顶层 `<variables>` 声明；当变量只作为 reporter 被引用、没有同名变量赋值块帮忙建立模型时，scratch-blocks 无法解析名称。现从生成后的推荐积木 XML 收集所有标量变量字段，去重后自动补 `<variables>`，单积木与结构化推荐共用。新增“仅 reporter 引用的 n 必须声明”回归测试，并把真实 Electron 渲染合同强化为必须出现变量文字。真实无 Key fallback 复测产物 `multi-goal-10-verification-20260716-variable-name/`：修复前截图 OCR 为“重复执行（空）次”，修复后为“重复执行 n 次”，DOM 文本也包含 n。全仓测试通过（shared 14、verification 34、desktop-companion 231），93 个推荐 opcode、4 个合法结构、变量名可见性及 terminal 规则合同通过。
- 2026-07-16：完成 10 个真实目标“填写本课目标 → 按推荐编程 → 检查推荐积木渲染”验收，覆盖小游戏、算法、复杂数学、交互数学和图形绘制。首轮 `multi-goal-10-verification-20260716/` 生成 43 步、85 张教练/Scratch 截图并暴露 3 个真实问题：平方公式把 `operator_multiply` 当变量、五边形 fallback 的通用 15 度标签覆盖 72 度、鸡兔同笼 fallback 把 reporter 作为 next 导致公式积木被渲染器移除。已改为忽略运算 opcode 占位并从语义推断公式、优先使用 reason/example 中的目标角度、用 `params.value` 生成完整鸡兔公式；验证脚本新增 `--case-ids` 支持定向复测。修复后 `multi-goal-10-verification-20260716-postfix/FINAL_RENDER_AUDIT.md` 汇总 10/10 目标、29 个实质推荐状态全部生成非空 XML/Blockly 文本且关键参数通过；追加两轮真实编程验算，求和输出 5050、输入 7 求平方输出 49；根级测试通过（shared 14、verification 34、desktop-companion 230），93 个推荐 opcode 与合法结构真实 Electron 渲染合同通过。
- 2026-07-15：修复推荐积木仍出现空输入槽的问题。截图根因不是显示区域裁剪，而是 XML 生成层对 `data_setvariableto` 的 VALUE 输入使用了不适配的 `math_number` shadow，且 DeepSeek 返回 `sensing_askandwait -> data_setvariableto` 时可能漏掉 `params.value`，导致“存储头数/脚数”没有接上“回答” reporter。现变量赋值默认值改用 Scratch 原生 text shadow；顺序链路中“询问并等待”后紧接“将变量设为”会自动填入 `sensing_answer`；prompt 同步要求模型显式返回 `params.value="sensing_answer"`。补截图场景回归，`desktop-companion` 219 项测试通过。
- 2026-07-15：泛化推荐变量命名策略；没有在客户端做 `heads/feet/rabbits` 到中文的本地映射，而是升级 DeepSeek 输出约束：`params.variable` / `messageVariable` / 公式变量 token 优先复用项目已有变量名；若是新建变量，则按本课目标和题目语言生成学生可读短变量名，并要求同一含义在公式和后续积木中完全一致。同步去掉推荐协议里的英文变量示例，避免模型默认模仿 `rabbits/feet/heads`；补 prompt 回归测试，`desktop-companion` 218 项测试通过。
- 2026-07-15：继续修复鸡兔同笼推荐公式中文变量不渲染问题。补充发现：`头数` / `脚数` / `兔子数量` 这类中文变量虽已能被公式 parser 识别，但变量 id 都退化成 `variable--`，Blockly 可能因 id 冲突导致变量 reporter 显示异常；现改为对非 ASCII 变量名生成稳定码点 id，三类变量互不冲突，并补中文变量公式回归测试。`desktop-companion` 218 项测试通过。
- 2026-07-15：修复鸡兔同笼推荐公式里的变量积木不渲染问题。根因为 DeepSeek 可能返回 `（feet - 2 × heads）÷ 2` 这类全角括号/数学符号公式，客户端公式 tokenizer 只归一化 `×/÷`，遇到全角括号会退回文本输入，导致 `feet/heads` 不显示为变量 reporter。现已归一化全角括号与全角四则运算符，并补回归测试；`desktop-companion` 217 项测试通过。
- 2026-07-15：按用户要求杀掉当前运行的 AI 教练和 Scratch，并重新打开 AI 教练供人工测试；正常源码联调启动，不带 mock 环境变量，运行日志 `/tmp/scratch-ai-companion-dev-20260715-retest.log`。
- 2026-07-15：完成“必要时超过 3 个积木”的推荐协议放宽。结构化推荐、共享 schema、renderer 展示与 DeepSeek prompt 均调整为最多 5 个节点，同时保留简单本地 fallback 最多 3 个，避免基础提示变啰嗦；补齐 5 节点协议、DeepSeek 超长结构裁剪、renderer 5 条展示与 camelCase 变量名渲染回归。真实复杂目标验证产物 `complex-render-verification-20260715-v5/`：overall pass=true，5 个 good、0 warning、0 fail；猜数字链路完整渲染 `询问 -> 将 guess 设为 answer -> if guess = secretNumber -> 说猜对了`，XML 保留 `sensing_answer` 与 `secretNumber`。根级 `npm test` 通过（shared 14、verification 34、desktop-companion 216）。
- 2026-07-15：完成复杂目标推荐积木渲染专项测试。新增 `tools/verification/scripts/verify-complex-recommendation-rendering.mjs`，用真实 DeepSeek 覆盖三个成绩平均分+等级判断、猜数字输入+条件、10 秒倒计时、接苹果计分、画五角星 5 个更复杂目标。首轮暴露两类真实问题：模型遗漏嵌套 `condition.reason` 会降级 fallback，`sensing_touchingobject` 目标默认成“边缘”，以及 `sensing_answer` 字符串被当成普通变量；现已补 prompt 要求、reason 兜底、碰撞对象参数渲染和回答 reporter 渲染。最终产物 `complex-render-verification-20260715-v3/`：overall pass=true，4 个 good、1 个 warning、0 fail；warning 为猜数字目标中模型返回 5 个节点，受 3 积木协议上限裁剪后只显示“询问 + 保存回答 + 空 if”，属于协议容量限制而非 XML 渲染错误。`desktop-companion` 215 项测试通过。
- 2026-07-15：完成推荐积木 `params` 协议真实效果专项测试。先用真实 DeepSeek 验证发现模型已理解 params，但会把 `params.value/messageVariable` 返回为嵌套积木对象、把 `repeatTimes/changeBy` 返回为数字，导致严格 schema 降级 fallback；现已强化 prompt 的字符串要求，并在服务层对真实 AST-ish params 做受控归一化（公式对象转字符串、数字转字符串、非变量 messageVariable 转 message），保持外部协议仍为 string-only。新增真实验证脚本 `tools/verification/scripts/verify-recommendation-params-protocol.mjs` 与回归用例；最终产物 `protocol-params-verification-20260715-v2/`：鸡兔同笼与 1 到 100 求和均走 DeepSeek，overall pass=true，params adoption=2/2，Scratch XML 含公式 reporter / `100` / `sum` / `i`；根级 `npm test` 通过（shared 14、verification 34、desktop-companion 213）。
- 2026-07-15：调研是否应把推荐积木结构告知 DeepSeek：结论是不应塞完整 Scratch 原始 schema，也不应继续让客户端从中文 reason 推断字段；应升级为“小型推荐参数 DSL”，在 prompt 中提供当前项目变量、脚本证据和常用 opcode 的 fields/inputs 填槽指南，让 DeepSeek 返回受控 typed params，客户端按白名单校验后生成 Blockly XML，并保留旧 reason 推断作为兼容 fallback。
- 2026-07-15：调研多轮推荐积木错位的责任边界：核对协议/schema、真实 DeepSeek timeline、XML 渲染链路和最新回归保护，结论为模型按当前协议只返回 opcode/category/label/reason，字段/输入值不能由模型直接携带；多数错位来自客户端 `scratch-block-xml.ts` 对自然语言到 Scratch 字段/输入的泛化推断遗漏，少数来自 DeepSeek 语义不够精确，需要服务层过滤/补充。
- 2026-07-15：修复截图反馈的推荐积木空内容问题：`s 增加` 现在能显示 `i` reporter，`说` 积木能显示真实累加变量 reporter，且主进程会按学生现有变量（如 `s`）补充“说话内容要放入 s 变量”，不再硬写 `sum`；已补自然语言关系/输出变量泛化回归，根级 `npm run test` 通过（shared 12、verification 34、desktop-companion 210）。
- 2026-07-15：按用户要求打开桌面伴随程序供人工查看最新 10 目标泛化修复效果；已正常源码联调启动，不带 mock 环境变量，运行日志 `/tmp/scratch-ai-companion-dev-20260715.log`，Electron 进程已启动并激活到前台。
- 2026-07-15：完成 10 个不同本课目标真实截图验收与泛化修复，覆盖接苹果/躲避陨石小游戏、1 到 100 求和、鸡兔同笼、三个数平均数、5 的阶乘、输入数字平方、正方形/三角形/五边形绘制。首次 10 目标压测发现阶乘推荐里 `product = product * i` 被渲染成错误变量/默认值，且 fallback 会退回 `sum/n` 求和模板；现已泛化推荐积木 XML 推断，支持任意英文变量赋值、二元公式（加减乘除）、变量 reporter、图形循环次数与转角，并新增阶乘 product fallback、绘图任务 fallback/过滤，避免画图 follow 漂移到“碰到边缘就反弹”。最终真实验收产物 `multi-goal-10-verification-20260715-v3/`：10/10 目标 `good`，显示校验全 pass，求和运行输出 `5050`，平方输入 `7` 输出 `49`；根级 `npm run test` 通过（shared 12、verification 34、desktop-companion 208）。
- 2026-07-15：完成计算题推荐显示泛化修复并重启源码版供查看。根因定位为推荐积木 XML 渲染层只用 opcode 默认模板补输入槽：`control_repeat` 固定 `10`，`data_changevariableby` 对“把 i 加到 sum 中”等等价说法无法解析，导致 DeepSeek/归一化文案里有 `100` 和 `i` 也会显示成默认值。现新增通用文本语义推断：识别 `重复执行 100 次`、`1 到 100`、`1+2+...+100`、`重复 n 次`，并识别 `sum 增加 i` / `i 加到 sum` 的目标变量和增量变量。已补回归测试，确认 XML 输出为 `重复执行 100 次` 且 `sum` 增加 `i` 变量 reporter；根级 `npm run test` 通过（shared 12、verification 34、desktop-companion 203）。
- 2026-07-14：完成“按 DeepSeek 推荐编程后，点击绿旗运行结果是否正确”的修复与验收：推荐积木渲染会把“说出 sum/result”显示为变量 reporter，不再填文本“结果”；平方题会把 `result` 设为 `number * number`；平方程序完成后返回完成总结，不再漂移到求和。`verify-multi-goal-deepseek-coaching.mjs` 新增真实运行验算，点击绿旗读取角色气泡：`1+2+...+100` 输出 `5050`，输入 `7` 求平方输出 `49`。产物 `runtime-output-verification-20260714-v2/`，5 个目标均为 `good`，计算类运行输出均 pass。
- 2026-07-14：完成多目标真实输入/点击分屏重录：上一版录屏中 Scratch 覆盖 AI 助教窗口，本轮录制时用窗口整理器每秒保持 Scratch 左侧、AI 助教右侧，同屏可见。产物 `multi-goal-split-recording-20260714-234145/`：分屏原始 4K 录屏 `split-screen-recording.mov`（3:31，561MB）、压缩版 `split-screen-recording-1080p.mp4`（3:31，3.7MB）、预览帧、43 张截图与 REPORT。抽帧已确认左右分屏有效；5 个目标均评级 `good`，`1+100` 目标 DeepSeek 3 次、fallback 0、无漂移。
- 2026-07-14：完成多目标真实输入与点击录屏验证：用源码版伴随程序真实打开 Scratch、输入 5 个本课目标并各跟做 1 步推荐，目标覆盖接苹果小游戏、`1+100` 重复执行求和、画正方形、自我介绍动画、输入数字求平方。产物 `multi-goal-recording-20260714-232354/`：原始 4K 录屏 `live-screen-recording.mov`（3:09，563MB）、压缩版 `live-screen-recording-1080p.mp4`（3:09，2.7MB）、预览帧、43 张截图、summary/timeline/REPORT。5 个 case 均评级 `good`；`1+100` 目标 3 次均走 DeepSeek、fallback 0、无漂移，推荐积木截图确认显示 `sum` 和 `i` 而不是“分数”。已清理自动化 user-data 缓存，并把 `multi-goal-recording-*` 加入 `.gitignore` 避免误提交大视频。
- 2026-07-14：修复“本课目标”输入 `1+100求和` 时焦点被打断、输入字偏大，以及 `1+100 求和` 推荐积木文案与实际积木不一致的问题。根因是目标输入保存/AI 加载同步时会禁用输入框导致浏览器主动移走焦点；推荐变量积木只保留 opcode，XML 渲染层用默认“分数/0”兜底，导致“初始化累加和为0、计数器为1”等文案和展示积木不匹配。现输入框保存期间保持可编辑且字体收小；变量类推荐会从 label/reason/example 推断 `sum=0`、`i=1`、`sum 增加 i`、`i 增加 1` 等默认字段。已补 renderer layout 与 scratch-block XML 回归测试，并通过根级 `npm run test`（shared 12、verification 34、desktop-companion 197）。源码 UI 冒烟因当前已有人工测试伴随程序实例占用 Electron 单实例锁，新增实例未开放 9344 调试端口，未强制杀进程。
- 2026-07-14：完成 5 种本课目标真实点击联调与 UI 收口：主界面“操作”按钮和“本课目标”输入拆成清晰多行布局，输入框实测 614x36，不再挤在按钮行；修复 `desktop-companion:save-lesson-goal` 主进程 IPC 缺失 handler 导致目标未保存的问题，确保 DeepSeek 能收到学生填写的目标。新增 `verify-multi-goal-deepseek-coaching.mjs`，用打包版教练真实点击打开 Scratch、真实输入目标并跟随提示测试小游戏、算法、绘图、动画、交互数学 5 类目标，产物 `multi-goal-deepseek-screenshots-v4/`（22 步/43 图），5 类均为 `good`，均走 DeepSeek（每类 3 次）、fallback 0、无漂移。已通过定向回归、根级 `npm run test` 全量测试、macOS `.app`/`.zip` 打包与手工 DMG 校验。
- 2026-07-14：完成 1+100/1到100 重复执行求和路径收口：主界面“本课目标”独立成完整输入行，避免按钮区拥挤；用户说明补充本课目标填写口径并同步 MD/HTML/PDF；CoachService 对固定上限求和目标过滤 `sensing_askandwait`，避免 100 已知时又询问 n；真实启动打包版教练，再点击打开 Scratch，输入目标并跑 5 阶段求和联调，产物 `sum-1-plus-100-screenshots-v2/`（33 步/62 图），未再出现 heads/鸡兔污染。已通过全量测试（shared 12、verification 34、desktop-companion 193）、源码 UI 冒烟、macOS `.app`/`.zip` 出包与手工 DMG 校验。
- 2026-07-14：使用说明补充三点口径：1）建议自己申请 DeepSeek Key，效果更好；2）当前为测试版；3）有问题随时联系。已同步文首提示、准备项、Key 章节、速查卡、文末与安装包说明。
- 2026-07-14：将用户使用说明改写为小白友好版：去除开发/架构等专业表述，改为安装、首次使用、按钮说明、添加 Key、学生老师用法、常见问题与速查；同步更新 PDF/HTML 及桌面课程资料目录。
- 2026-07-14：下载 GitHub Releases 最新 4 个安装包（v0.2.0）到桌面「淮河课程Word文稿/Scratch AI教练-安装包-v0.2.0」；并在使用文档显著位置标注“软件持续开发更新中，有问题欢迎随时沟通交流”，同步更新 MD/PDF/HTML。
- 2026-07-14：补充使用文档中的 DeepSeek API Key 添加步骤：平台获取 Key、设置页粘贴/测试/保存、生效确认、更换清除、常见问题与机房批量配置；已同步重生成 MD/PDF/HTML，并更新桌面「淮河课程Word文稿」中的《Scratch AI教练-使用说明》。
- 2026-07-14：撰写 Scratch AI 教练最终用户使用文档（Markdown + PDF）。基于 README / SOP / 架构 / 桌面端界面能力整理下载安装、首次连接、主界面、DeepSeek 设置、师生日常用法、FAQ、日志反馈与限制说明；产出 `docs/user-guide.zh-CN.md` 与 `docs/user-guide.zh-CN.pdf`，并在 `docs/README.zh-CN.md` 加入入口。
- 2026-07-13：修复简单项目没有推荐积木的问题；根因是 DeepSeek 返回 summary-only 时客户端无条件按“完整项目”接受，导致简单“绿旗+动作”项目推荐区为空。现仅当本地快照也有事件、控制、规则/反馈等完整度证据时才接受空推荐；否则保留为 DeepSeek 请求成功但补本地结构化推荐积木。已补回归测试，并通过 desktop-companion 186 项全量测试。
- 2026-07-12：修复 DeepSeek 仅依据积木类别误判项目完整的问题；向模型发送舞台与全部角色的完整脚本连接、字段、输入、条件分支、变量、广播及玩家输入证据，并要求从绿旗开始核对真实可达路径，避免把 Mouse1 的鼠标控制错误说成控制 Cat 2。已通过全仓测试（共享包 12 项、verification 34 项、desktop-companion 185 项）。
- 2026-07-12：修复 DeepSeek 正常返回项目判断却显示“本地基础提示”的问题；运行日志确认模型响应额外包含 `nextStep: null`，严格协议解析因此失败并降级。现会优先提取规定的 `summary` 与 `recommendation` 字段，兼容模型附带的空旧字段，并兼容完整作品返回 `recommendation: null`。已补 2 项回归测试并通过全仓测试（共享包 12 项、verification 34 项、desktop-companion 185 项）。
- 2026-07-12：强化 DeepSeek 对最新完整项目的复评：继续由 DeepSeek 判断作品是否完整，同时发送舞台与全部角色每条脚本的中文积木序列和官方 opcode，要求只依据当前快照逐个核对，不沿用旧结论，也不根据角色名或游戏题材脑补不存在的功能。已通过全仓测试（共享包 12 项、verification 34 项、desktop-companion 183 项）。
- 2026-07-12：调整“下一步提示”为适度紧凑的两层布局，避免横向过度压缩导致提示文字拥挤。
- 2026-07-12：修复删除角色脚本后仍显示旧程序的问题，并进一步压缩“操作”和“下一步提示”模块高度，减少页面与程序列表双重滚动。
- 2026-07-12：修正当前角色程序展示：保留“当前角色程序”标题，将脚本卡片标签改为当前角色名；多脚本在原区域内纵向单列排列并滚动。
- 2026-07-12：修复 DeepSeek 重复推荐当前角色已存在事件帽子积木的问题；提示词明确只返回需要新增的部分，响应归一化时会移除已存在的绿旗/按键/广播/背景切换帽子根节点并保留其后续有效结构，动作与控制积木仍可按上下文重复使用。已补真实重复文案场景回归测试，并通过 desktop-companion 175 项全量测试。
- 2026-07-12：完成手动提示重复旧积木文案排查；运行日志确认请求真实走 DeepSeek（非 fallback），三段文案不在本地固定文案中，分别来自 DeepSeek 的 summary 与 recommendation 节点 reason。客户端目前只校验 opcode 白名单和结构可渲染性，没有过滤“当前角色已经存在的积木”，因此模型把已用的事件积木作为推荐上下文返回后仍会展示。
- 2026-07-12：修复自动推荐在拖动/拼接积木时立即消失及静止后重复请求；编辑过程继续保留当前推荐，最终积木状态静默约 2 秒后只请求 1 次新推荐，并忽略相同快照的 heartbeat。已补 CoachingSession / SessionManager 回归测试，并通过 desktop-companion 174 项全量测试。
- 2026-07-12：修复桌面伴随程序 DeepSeek 可用但偶发仍显示“本地基础提示”、且重复点击“生成下一步提示”无反应；对照运行日志确认一部分请求已成功走 `deepseek-v4-flash`，另一部分则因模型返回结构里显式 `next: null` 被严格 schema 误判并降级到 fallback。现已放宽结构化推荐 schema，允许关系尾节点显式为 `null`；同时取消手动请求对相同快照的去重，保证点击“生成下一步提示”会再次真实发起请求。已补 CoachService / CoachingSession 回归测试，并通过 `desktop-companion` 171 项全量测试。
- 2026-07-12：为桌面伴随程序 DeepSeek 设置页增加“测试 Key 可用性”；已按官方文档接入 `GET /user/balance` 校验接口，并保留 `GET /models` 可作为后续补充校验参考；设置页现在支持直接测试临时输入或已保存的 Key，可区分“Key 无效 / 余额不足或账号暂不可用 / 可正常调用”，同时补充主进程校验器、IPC、设置页按钮与回归测试，并通过 `desktop-companion` 170 项全量测试。
- 2026-07-12：调整桌面伴随程序 DeepSeek 使用策略；保存 DeepSeek Key 后会自动把提示触发方式切到 `manual`，避免每 3 秒自动刷新；无 Key 时最多只给 1 次本地 fallback，之后改为明确提醒用户去“DeepSeek 设置”补 Key，不再持续伪装成正常 AI 提示；同时更新主界面和设置页文案，纠正“没 Key 也会一直正常给基础提示”的误导口径。已补 `SessionManager` 回归测试，并通过 `desktop-companion` 164 项全量测试。
- 2026-07-12：修复桌面伴随程序“第一条推荐后后续改积木不再刷新”的自动提示回归；`CoachingSession` 的完成态去重签名现在包含当前角色真实 block 结构，而不只依赖可见脚本文本/XML，避免真实 `projectData` 已变化却被误判为同一状态；同时保留已排队的 `recommendation-completed` 刷新，不再被 Scratch 编辑过程中的瞬时 `following` 快照错误取消。已补 2 组 `CoachingSession` 回归测试，并通过 `desktop-companion` 163 项全量测试。
- 2026-07-12：修复桌面伴随程序 AI 提示可观测性与 fallback 推荐误导；主界面“下一步提示”区域新增当前提示来源文案，明确区分 `DeepSeek` 与 `本地基础提示`；同时收窄 fallback 的“已会运动但未用侦测”分支，不再把 `碰到边缘就反弹` 错包进 `如果...那么`，而是直接推荐单块 `碰到边缘就反弹`，并避免已存在该积木时重复推荐。已补 CoachService、SessionManager、renderer 回归测试，并通过 `desktop-companion` 161 项全量测试。
- 2026-07-12：维护桌面伴随程序文档口径；同步 README、开发交接、架构说明与维护约定到“推荐积木双端结构净化 + 当前角色程序/推荐积木复杂结构稳定渲染 + desktop-companion 160 项全量测试通过”的最新状态，并纠正旧文档中“坏 opcode 自动映射”为当前真实行为“未支持 opcode 直接丢弃、非法结构关系渲染前净化”。
- 2026-07-12：为桌面伴随程序补“推荐积木结构渲染前校验”；新增共享 `recommended-structure` 净化层，在主进程接收 AI 结构化推荐后先剔除非法 `root / next / condition / substack` 关系，renderer 在真正生成 Scratch XML 前再净化一次；同时把旧扁平 `recommendedBlocks` 线性链路改成只串联可渲染节点，跳过帽子块 / reporter 等非法 next，避免未来 AI/旧状态把复杂推荐再次打回文字版。已补 3 组回归测试，并通过 `desktop-companion` 构建、定向回归和 160 项全量测试。
- 2026-07-12：继续修复桌面伴随程序“推荐积木”在复杂提示下退回文字版的问题；确认根因是 fallback 推荐结构不合法，导致 `scratch-blocks` 在复杂提示分支下无法渲染。现已把相关 fallback 分支收口为可渲染的合法结构，并补齐 `CoachService` / `SessionManager` 回归测试，验证“已有循环后推荐侦测”等复杂提示会继续输出结构化积木而不是退回文字。已通过 `desktop-companion` 构建、2 组定向测试和 157 项全量测试。
- 2026-07-12：修复人工测试反馈：主界面“当前角色程序”只显示文字、没有实时渲染 Scratch 积木，且“推荐积木”上方灰色文字被固定高度容器裁剪。现已将只读 workspace 渲染成功判定延后到积木搬入视野并完成尺寸计算之后，避免过早误判失败回退文字；同时让渲染失败兜底文字自动展开，不再被 inline workspace 高度裁剪。已补回归测试，并通过 desktop-companion 构建、20 项定向渲染回归和 153 项 desktop-companion 全量测试。
- 2026-07-12：继续修复人工测试反馈：Scratch 里已有积木且 bridge payload 已包含脚本/XML，但桌面端“当前角色程序”和推荐积木仍没有显示彩色积木。根因收敛到只读 `scratch-blocks` 渲染层对官方 `workspaceUpdate` XML 兼容不足；现已在渲染前把官方 XHTML namespace 规范化为 Blockly XML namespace，并在加载后检测空 workspace / 缺少 `.blocklyBlock` 时转入明确失败兜底，避免静默空白。已通过 27 项定向回归、desktop-companion 构建和桌面 UI 真渲染验证，验证结果显示当前脚本与推荐区均渲染出可见 Scratch blocks。
- 2026-07-12：排查人工测试反馈：Scratch 中已有三个积木，但桌面端“当前角色程序”仍为空，且“推荐积木”停留在“Scratch 积木正在刷新，请稍等一下”。已通过 CDP 证明 Scratch VM 当前角色有 3 个真实积木、官方 workspace XML 长度 1379，且桥接脚本实际 POST 的 payload 包含 3 个模块和 1 条 workspace XML；本轮补充桥接 payload 数量日志，并将只读积木渲染失败兜底从误导性的“正在刷新”改为可读文字版，便于区分“没拿到数据”和“拿到但渲染失败”。已通过桌面端定向构建和 22 项回归，并重启到最新源码版供复测。
- 2026-07-12：修复当前角色程序与推荐积木只出现容器/刷新文案、未显示真实 Scratch 积木的问题；只读 ScratchBlocks 渲染现在会把官方 `workspaceUpdate` XML 中可能很大的顶层坐标平移回容器内，避免积木被渲染到可视区域外；UI 验证 fixture 补充真实 `currentTargetScriptXmlList` 与结构化推荐，并断言 SVG 中存在可见 `.blocklyBlock`，覆盖当前脚本和推荐积木都必须直接显示编程模块。已通过桌面端定向测试、桌面 UI 真渲染验证和根级全量测试。
- 2026-07-12：修复语言读取改动后当前角色程序一直显示“积木正在刷新”的回归；对照官方 Scratch VM/GUI 确认角色程序应优先使用 `workspaceUpdate` 的官方 Blockly XML，桥接层现监听并上报 `currentTargetWorkspaceXmlList`，状态层优先使用官方 XML、再回退本地 `projectData -> XML` 生成；同时把只读 `scratch-blocks` 语言从 `zh-CN` 归一化为语言包支持的 `zh-cn`，避免渲染器因未识别 locale 保持旧状态。DeepSeek 仍按结构化 `summary + recommendation.root` JSON 协议返回，客户端自行生成可渲染积木 XML。已通过定向 36 项和根级全量测试（shared 11 项、verification 34 项、desktop-companion 148 项）。
- 2026-07-12：拉取官方 Scratch 源码到上级目录 `/Users/tesths/Desktop/scratch-ai-split/official-scratch` 用于对照排查；已覆盖 `scratch-desktop`、`scratch-gui`、`scratch-vm`、`scratch-blocks`、`scratch-l10n`、`scratch-render`、`scratch-storage`，确认可读取 `scratch-vm/src/virtual-machine.js`、`scratch-gui/src/containers/blocks.jsx`、`scratch-blocks/src/xml.ts`、`scratch-blocks/msg/scratch_msgs.js`、`scratch-desktop/src/main/index.js`、`scratch-render/src/RenderWebGL.js`、`scratch-storage/src/ScratchStorage.ts` 等关键源码。
- 2026-07-12：维护 Scratch 语言恢复与推荐积木渲染相关文档；同步 README、开发状态、架构与维护说明，补充受控启动沿用 Scratch 上次语言、桥接层语言来源、只读 ScratchBlocks 语言初始化和排障日志口径。本轮为文档收尾，不引入代码行为变更。
- 2026-07-12：按官方 Scratch 源码修复语言持久化与只读积木语言初始化；Scratch GUI 语言切换会更新 Redux locale 与 `document.documentElement.lang`，桥接脚本现同时读取 Redux、DOM lang 和 VM locale，并监听 `lang` 变化立即上报；推荐积木只读 workspace 不再硬编码简体，而是按当前文档语言初始化 `ScratchMsgs`。已通过 desktop-companion 144 项全量测试，并完成真实验证：切到繁体后配置写入 `lastScratchLocale: zh-tw`，关闭 Scratch 后再次启动日志包含 `--lang=zh-TW`。
- 2026-07-11：修正 Scratch 语言启动语义；目标不是完全移除 `--lang`，而是读取 Scratch 界面中上次实际选择的语言并沿用，避免系统语言、固定中文或固定英文覆盖用户偏好。桥接脚本会记录 Scratch Redux 当前 locale，本地配置持久化后，下次受控启动仅用该 locale 生成 `--lang`。
- 2026-07-11：继续修复人工测试反馈；撤掉 Scratch 受控启动的 `--lang` 强制参数，避免覆盖用户在 Scratch 内选择的语言；同时让本地 fallback 推荐变成结构化推荐，学生按推荐加完积木后能刷新到下一组推荐。已通过定向测试和 desktop-companion 138 项全量测试。
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

- 2026-07-12：修复过滤已有事件帽子后偶发回退本地基础提示；根因是帽子后的首个节点可能是不能独立显示的侦测/运算值积木，而后续仍有可渲染积木。现会沿 next 链继续寻找首个可渲染的新积木结构，避免丢弃整次 DeepSeek 返回；已补回归测试并通过 desktop-companion 176 项测试。

- 2026-07-12：发布桌面伴随程序 v0.2.0；版本包含 DeepSeek Key 测试、提示来源展示、推荐积木渲染与刷新稳定性、Scratch 语言恢复等改进。发布流程通过 v0.2.0 tag 自动构建 Windows portable/setup 与 macOS zip/dmg，并创建 GitHub Release。

## 2026-07-12 当前角色程序与整体项目建议优化

- 状态：已完成
- 问题：单个角色脚本较多时，“当前角色程序”区域持续拉高且不易浏览；区域标题未直接显示角色名；DeepSeek 提示需要基于全部角色/舞台脚本判断项目完整度；“下一步提示”区域内容和高度偏大。
- 预期：
  1. 多脚本区域保持稳定高度并可滚动浏览，不挤压整页布局。
  2. 程序面板标题直接显示当前角色名（例如 `Cat 2 的程序`）。
  3. DeepSeek 明确完整阅读舞台和全部角色脚本，做项目级判断；若作品已完整，不强制返回推荐积木，改为简短说明玩法/使用方式。
  4. 压缩下一步提示文案、间距与推荐原因展示高度。
- 验证：已补 renderer/coach prompt/共享协议回归测试；共享包、verification、desktop-companion 全量测试通过。自动 UI 脚本因本机 Electron 调试端口未启动（`fetch failed`）未生成截图，已保留既有运行实例供人工查看。
- 完成：程序面板按当前角色动态显示标题，多脚本列表和超宽脚本均可滚动；DeepSeek 接收全部角色/舞台全部脚本并支持“完整作品仅说明用法”；下一步提示区已压缩。

## 2026-07-14 多轮真实点击联调（跟 AI 提示搭积木）

- 状态：已完成（部分跟随步骤因复杂积木应用失败，但三轮主路径已覆盖）
- 需求：真实启动 Scratch + 桌面伴随程序，按 AI 教练返回提示逐步搭积木；覆盖不同复杂度程序；每一步在当前文件夹截图。
- 做法：新增 `tools/verification/scripts/verify-progressive-click-coaching.mjs`，真实打开伴随程序/Scratch，按 AI 推荐积木逐步搭建。
- 覆盖：
  1. Round A 简单：仅绿旗 -> 跟随移动/循环
  2. Round B 中等：绿旗+forever+移动+反弹
  3. Round C 复杂：加载 Cat and a Mouse 完整作品
- 产物：`progressive-click-screenshots/`（截图 + timeline.json + summary.json + REPORT.md）
- 观察：简单/中等场景 DeepSeek 能给出合理下一步；部分轮次 DeepSeek 返回 JSON 结构非法（next=null）会回退本地 heuristic；侦测/变量类推荐在自动“对着做”时仍不稳定。

## 2026-07-14 多项目学生模拟联调（运动 + 鸡兔同笼 + 复杂游戏）

- 状态：已完成
- 需求：模拟学生打开软件、写程序、按 DeepSeek 提示对着做；覆盖运动以外的鸡兔同笼等逻辑题。
- 做法：新增 `tools/verification/scripts/verify-student-sim-multi-project.mjs`，真实启动伴随程序/Scratch，覆盖 4 个项目种子并逐步截图。
- 覆盖：
  1. P1 运动基础（绿旗起步）
  2. P2 鸡兔同笼起步（heads=35/feet=94）
  3. P3 鸡兔同笼半成品（rabbits 待计算）
  4. P4 复杂游戏 Cat and a Mouse
- 产物：`student-sim-multi-project-screenshots/`（37 张截图 + timeline/summary/REPORT）
- 观察：四类项目 DeepSeek 均能返回可理解提示；运动提示最稳；鸡兔同笼能导向询问/变量/减法运算，但公式完整性不稳定；复杂游戏能识别“碰奶酪加分”，自动对着做侦测链仍易失败。

## 2026-07-14 本课目标改为自由输入 + 点击联调
- 状态：已完成
- 需求：不要下拉选择，改为可选手动输入目标；不输入也能用；并做一轮完整点击输入测试验证效果。
- 实现：主界面 `lesson-goal-input` 文本框，失焦/回车/防抖保存；空目标走自动识别。
- 联调：`tools/verification/scripts/verify-lesson-goal-input-path.mjs`，产物 `lesson-goal-input-screenshots/`（36步/70图）。
- 结果对比旧鸡兔路径：输入目标后 DeepSeek 多次给出完整公式 `rabbits=(feet-2*heads)/2`、`chickens=heads-rabbits`，并持续要求说出来；未见运动漂移，未见“改算总头脚”反转。
- 修改：renderer/index.html、renderer.ts、验证脚本、gitignore。

## 2026-07-14 本课目标输入（稳定传 goal）
- 状态：已完成
- 需求：给自动刷新和手动提示都带上稳定的“本课目标”，降低数学题任务反转/运动漂移。
- 实现：
  1. 主界面新增“本课目标”下拉：自动识别 / 鸡兔同笼 / 1到n求和 / 自由创作。
  2. 目标写入本地配置 `lessonGoal`，状态同步到 UI。
  3. 自动刷新与手动生成都会 `resolveLessonGoal` 后传给 CoachService。
- 测试：desktop-companion 全量 191 项通过（含 lesson goal 持久化与复用）。
- 修改：shared schema、config/session/main/preload/renderer、index.html

## 2026-07-14 数学题辅导漂移修复（意图识别 + fallback）
- 状态：已完成
- 问题：联调显示鸡兔同笼易“任务反转”，1到n累加易“运动漂移”；本地 fallback 也会推循环+右转/条件判断。
- 方案：
  1. CoachService 增加任务意图识别（math-chicken-rabbit / math-sum / math-generic / game）。
  2. DeepSeek system/user prompt 增加数学题硬约束：禁止反转、禁止无关运动。
  3. 数学题专用 fallback：推公式/累加/说出口，而不是 motion。
  4. 归一化过滤：数学题下剔除 motion/造型类推荐，并提升后续有效积木。
- 测试：desktop-companion coach-service 30 项全绿（含 4 项新增）。
- 修改：`apps/desktop-companion/src/main/coach-service.ts`、`apps/desktop-companion/test/coach-service.test.mjs`

## 2026-07-14 数学题 1到n累加路径加压
- 状态：已完成
- 需求：新开一轮数学题学生模拟，覆盖“循环+累加器”而非鸡兔公式；观察 DeepSeek 能否引导学生补全 1..n 求和。
- 脚本：`tools/verification/scripts/verify-sum-1-to-n-path.mjs`
- 产物：`sum-1-to-n-screenshots/`（35 步 / 69 张截图 / summary+timeline+REPORT）
- 阶段：A-start(n=10) → B-vars(n/sum/i) → C-loop(空循环) → D-near(i自增缺sum) → E-output(缺说出口)
- 观察：
  1. DeepSeek 命中约 14 次，本地 fallback 约 7 次（C/D/E 种子后与部分 follow 易降级）。
  2. 最好信号：A 阶段明确“重复执行累加 / sum 增加 i”；D/E 也出现“sum 每次增加 i，同时 i 增加 1”。
  3. 主要失败模式是“运动漂移”：一旦脚本被 apply 混入旋转/造型/移动，提示会滑向动画游戏（反弹、走几步），偏离数学求和。
  4. 空循环阶段（C）与接近完成阶段（E）都不稳定：常见 fallback 条件判断，或忽略“说出口 sum”。
  5. 与鸡兔同笼对比：循环/累加语义可被 DeepSeek 讲对，但易被运动类积木上下文带偏；公式题则是任务反转。
  6. 自动 apply 仅为学生模拟近似；结论以提示文本与 opcode 为准。

## 2026-07-15 升级推荐积木协议
- 状态：已完成
- 需求：查看现有文档与实现进度，梳理“推荐积木协议”升级依据、影响范围与下一步改造路径。
- 实现：推荐节点新增受约束 `params`，DeepSeek 可表达变量名、公式、说话变量、循环次数等显示默认值；客户端继续校验 JSON、自行生成 XML，不接受 AI 原始 XML。
- 验证：shared 14 项通过；desktop-companion 212 项通过，覆盖 `params` schema、服务层透传和鸡兔同笼嵌套公式 XML 渲染。


## 2026-07-14 鸡兔同笼完整公式路径加压
- 状态：已完成
- 需求：专门压测鸡兔同笼从半成品到完整公式（算兔/算鸡/验算/说出口），观察 DeepSeek 是否能逐步带到可运行答案。
- 脚本：`tools/verification/scripts/verify-chicken-rabbit-formula-path.mjs`
- 产物：`chicken-rabbit-formula-screenshots/`（35 步 / 69 张截图 / summary+timeline+REPORT）
- 阶段：A-start → B-partial → C-ask → D-near → E-output；真实 Companion + Scratch 3 + DeepSeek Key。
- 观察：
  1. DeepSeek 命中 18 次，本地 fallback 1 次（C-ask-follow-1 误落到循环/运动提示）。
  2. 能稳定导向：询问输入、变量赋值、减法算鸡、说出口（looks_say / looks_sayforsecs）。
  3. 未出现完整经典公式推荐：`rabbits=(feet-2*heads)/2`，全程无 `operator_multiply` / `operator_divide`。
  4. 高频“任务反转”：当脚本里已有鸡/兔变量后，常建议“算总头数/总脚数”，而非继续完善求兔公式。
  5. 最好的公式句在 C-ask-follow-2：`鸡的数量 = 头的总数 - 兔子的数量`（部分正确，仍缺求兔公式）。
  6. 自动 apply 推荐积木仅为学生模拟近似；结论以提示文本与 opcode 为准。

## 2026-07-15 DeepSeek 推荐积木渲染失败根因排查
- 状态：已完成
- 需求：彻底解决 DeepSeek 返回代码在推荐积木区域偶发渲染不出编程积木块的问题；调研是否需要对照 Scratch/Blockly 原生积木实现。
- 初始方向：追踪 DeepSeek 推荐协议 → 客户端归一化/校验 → XML 生成 → 推荐区渲染链路，定位不可渲染 opcode/field/input/variable/shadow 组合。
- 结论：继续坚持 DeepSeek 只返回受约束 JSON，客户端按 Scratch 官方 block definition 生成 Blockly XML；已对照 `scratch-blocks/src/blocks/{looks,control,motion}.ts` 确认秒数输入名分别为 `SECS` / `DURATION`。
- 修复：推荐区主结构 XML 渲染失败时，自动重试根积木 fallback XML，避免整张推荐卡退成纯文字；补齐 `params.secs` 协议、schema、类型、提示词和 XML 生成，秒数只写入可解析数字。
- 验证：先补失败用例复现 schema/XML 缺口；随后 `npm run test` 通过（shared 14、verification 34、desktop 221）。

## 2026-07-15 DeepSeek Strict 推荐协议与渲染闭环
- 状态：已完成
- 需求：将推荐积木从 JSON Mode 升级为 Strict Tool Calls，确保 DeepSeek 返回的 Scratch 连接结构在进入 XML/Renderer 前合法；Strict 不可用时直接使用本地推荐。
- 实施范围：
  1. 建立统一的积木形状/关系能力定义，禁止 terminal/cap block 携带 `next`。
  2. 使用 DeepSeek Beta Strict Function Calling，强制解析 `tool_calls[].function.arguments`，不回退普通 JSON 推荐。
  3. 增加结构编译诊断与真实 `scratch-blocks` 渲染合同测试，覆盖当前 93 个 opcode 和非法关系。
- 完成：切换 Beta Strict Tool Calls，使用扁平 `id / parentId / relation` 节点协议并由本地编译器校验连接；修复 terminal next；新增 93 opcode 真实渲染合同和真实 DeepSeek 兼容性探针。
- 验证：desktop-companion 228 项通过；真实 Renderer 合同覆盖 93 个单积木、4 类合法结构和 3 类 terminal 非法 next；DeepSeek V4 Flash / Pro 实际 Strict 请求均返回循环 + 移动 + 反弹并成功生成 XML。
- 文档收尾：已同步桌面端 README、验证工具说明和维护清单，明确 Beta Strict endpoint、扁平节点协议、本地拒绝策略及两条专项验证命令。
