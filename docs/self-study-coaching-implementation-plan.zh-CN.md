# 单机直连自学辅导实现差距与 TDD 计划

本文把已确认的 [单机直连自学辅导设计](./self-study-coaching-design.zh-CN.md)转换为可执行的工程计划。当前阶段只完成差距分析、模块边界和测试顺序，不修改业务代码。

## 实现目标

- 学生自由创作，客户端根据当前作品给出一句短提示和 1–3 个有顺序、可嵌套的关键积木
- 推荐只读，不向 Scratch 自动插入或修改任何内容
- 同时支持自动辅导和主动求助
- 自动模式有 3 秒静默窗口、15 秒最短请求间隔、单请求运行和最新状态追赶
- 学生跟随推荐时保持提示稳定，完成整组后刷新，偏离方向后立即适应
- DeepSeek 只返回受约束 JSON，客户端验证后生成 Scratch Blockly XML
- AI 不可用时使用本地基础提示，学生端不显示技术错误

## 当前实现差距

### 协议与类型

- 已完成：共享协议新增 `summary + recommendation.root`，可表达 `next`、条件槽、`SUBSTACK` 和 `SUBSTACK2`
- 已完成：协议限制递归结构总节点数最多 3 个，并拒绝额外字段和模型原始 XML
- 仍待完成：学生端渲染层尚未直接消费结构化 `recommendation`
- 仍待完成：旧 `recommendedBlocks` 扁平字段仍作为兼容输出保留，等待后续 UI 切片迁移

### CoachService

- 已完成：DeepSeek prompt 改为只允许 `summary + recommendation`，并要求按顺序返回具体积木结构
- 已完成：服务层严格解析结构化协议，过滤未知 opcode 和当前未加载扩展 opcode
- 已完成：返回 1 个或 2 个有效积木时保持原数量，不再强制补满
- 已完成：无效 opcode 不做近似替换；全部无效或畸形响应时降级到本地基础提示
- 仍待完成：本地降级仍沿用旧文案结构，后续学生端文案切片再收口
- 仍待完成：请求上下文不包含上一轮推荐及推荐后的作品变化

### 会话与调度

- `apps/desktop-companion/src/main/session-manager.ts` 请求开始时会清空旧提示
- 已完成：会话状态机新增 3 秒静默窗口、15 秒自动限频、单请求运行和最新状态追赶
- 已完成：主动模式同一签名不会重复请求
- 已完成：新增推荐结构的部分完成、整组完成和偏离方向判定纯函数层
- 已完成：新增按会话身份维护的短期辅导上下文
- 已完成：角色切换、作品切换和退出时会清空或失效旧上下文
- 已完成：空白作品不会进入自动请求

### 渲染与学生文案

- `apps/desktop-companion/src/renderer/renderer-view.ts` 把推荐积木渲染为互相独立的卡片
- 当前推荐 XML 生成入口一次只处理一个积木，不能生成连接或嵌套结构
- 学生端仍显示模型来源、生成时间、额外下一步文字和示例
- `aiError` 可能直接展示 DeepSeek 原始错误
- 缺少“保留旧提示并准备下一步”和“旧提示已失效、只显示加载状态”的区分

### 设置与安全

- Flash 默认模型和 Pro 设置选项已经存在，需要保留回归测试
- Key 明文 JSON 符合已确认决策
- `apps/desktop-companion/src/main/scratch-config-store.ts` 写文件时没有显式限制为当前用户读写
- 需要验证日志、状态和设置页不会回显完整 Key

## 目标模块边界

### 共享协议

修改：

- `packages/shared/src/schemas.js`
- `packages/shared/src/index.d.ts`
- `apps/desktop-companion/src/common/types.ts`

职责：

- 定义学生端最小响应协议
- 对递归结构做 schema 校验
- 限制可出现的字段和字符串长度
- 保证结构至少 1 个、最多 3 个积木

建议的核心类型：

```ts
interface RecommendedBlockNode {
  opcode: string;
  category: string;
  label: string;
  reason: string;
  next?: RecommendedBlockNode;
  condition?: RecommendedBlockNode;
  substack?: RecommendedBlockNode;
  substack2?: RecommendedBlockNode;
}

interface CoachResponse {
  summary: string;
  recommendation: {
    root: RecommendedBlockNode;
  };
}
```

约束：

- `root` 是唯一顶层入口，不允许多个互不连接的候选
- `next` 表示顺序连接
- `condition` 表示条件槽中的布尔积木
- `substack`、`substack2` 表示控制积木内部脚本
- 递归遍历后的节点总数不超过 3
- 每个节点只保留展示和验证必需字段，不接受 `example`、追问或诊断列表

示例：

```json
{
  "summary": "让角色碰到边缘时给出反馈。",
  "recommendation": {
    "root": {
      "opcode": "control_if",
      "category": "控制",
      "label": "如果...那么",
      "reason": "先让角色会判断。",
      "condition": {
        "opcode": "sensing_touchingobject",
        "category": "侦测",
        "label": "碰到...？",
        "reason": "检查角色是否碰到目标。"
      },
      "substack": {
        "opcode": "looks_sayforsecs",
        "category": "外观",
        "label": "说 2 秒",
        "reason": "让判断结果容易看见。"
      }
    }
  }
}
```

### 推荐结构领域层

新增：

- `apps/desktop-companion/src/common/recommendation-structure.ts`
- `apps/desktop-companion/test/recommendation-structure.test.mjs`

职责：

- 遍历、计数和规范化推荐树
- 验证关系是否适用于对应积木
- 计算稳定的推荐签名
- 按官方白名单和当前工具箱/扩展过滤节点
- 无效父节点导致其依赖关系失效时，丢弃对应分支
- 不执行近似替换，不为补满数量新增积木

可用性规则：

1. opcode 必须在官方推荐白名单中
2. 核心积木所属模块必须存在于当前工具箱类别
3. 扩展积木对应扩展必须已加载
4. 过滤后若没有有效根节点，整组推荐无效并触发本地基础提示

### XML 生成层

修改：

- `apps/desktop-companion/src/common/scratch-block-xml.ts`
- `apps/desktop-companion/test/scratch-block-xml.test.mjs`

职责：

- 只接收已经验证的推荐树
- 递归生成 `next`、条件 value 和 statement 子堆栈
- 使用客户端维护的字段与默认参数模板
- 永远不解析或加载 AI 返回的 XML

新增入口建议：

```ts
buildRecommendedStructureXml(recommendation)
```

旧的单积木 `buildRecommendedBlockXml` 可以保留为底层模板函数，避免重复维护 opcode 默认字段。

### 完成判定层

新增：

- `apps/desktop-companion/src/common/recommendation-matcher.ts`
- `apps/desktop-companion/test/recommendation-matcher.test.mjs`

职责：

- 从当前角色原始 block map 中查找推荐结构
- 比较 opcode、`next`、条件输入和子堆栈关系
- 忽略数字、文字、菜单、变量名等参数值
- 区分 `unchanged`、`following`、`completed`、`diverged`

判定规则：

- `following`：推荐结构的匹配进度增加，但整组未完成
- `completed`：全部推荐节点及结构关系已出现在相关脚本中
- `diverged`：当前角色出现结构性变化，但没有推进当前推荐
- `unchanged`：没有结构性变化，或只有参数值、坐标等非结构变化
- 散落积木、无关脚本或错误嵌套不算完成

### 辅导会话状态机

新增：

- `apps/desktop-companion/src/main/coaching-session.ts`
- `apps/desktop-companion/test/coaching-session.test.mjs`

修改：

- `apps/desktop-companion/src/main/session-manager.ts`
- `apps/desktop-companion/test/session-manager.test.mjs`

职责拆分：

- `CoachingSession` 维护当前作品、当前角色、上一轮提示、提示生成基线、最新作品状态和请求时间
- `CoachingSession` 负责纯状态转换和定时决策
- `SessionManager` 继续负责 Scratch 连接、DeepSeek 调用、状态发布和日志
- 时钟、定时器和请求函数通过依赖注入，测试不依赖真实等待

建议的内部事件：

- `projectConnected`
- `projectChanged`
- `targetChanged`
- `manualRequested`
- `requestStarted`
- `requestSucceeded`
- `requestFailed`
- `clientStopped`

建议的请求原因：

- `first-valid-block`
- `manual`
- `recommendation-completed`
- `direction-changed`
- `mode-enabled`

### CoachService

修改：

- `apps/desktop-companion/src/main/coach-service.ts`
- `apps/desktop-companion/test/coach-service.test.mjs`

职责：

- 生成严格的 DeepSeek system/user prompt
- 请求 JSON object
- 使用共享 schema 严格解析
- 应用推荐结构有效性过滤
- 过滤后为空时生成独立的本地基础提示
- 返回学生可展示的通用降级状态，不把原始错误写入学生状态

请求上下文增加：

- 上一轮推荐摘要与结构签名
- 上一轮生成时的当前角色结构摘要
- 推荐之后当前角色新增或变化的结构摘要
- 当前角色完整脚本
- 其他角色少量脚本摘要
- 当前工具箱类别与已加载扩展

不发送：

- 媒体资源
- 完整 `.sb3`
- 原始项目 JSON
- 完整历史推荐列表

### 学生端渲染

修改：

- `apps/desktop-companion/src/renderer/renderer-view.ts`
- `apps/desktop-companion/src/renderer/renderer.ts`
- `apps/desktop-companion/src/renderer/index.html`
- `apps/desktop-companion/test/renderer-view.test.mjs`
- 必要时补充 `apps/desktop-companion/test/renderer-layout.test.mjs`

职责：

- 只显示一句 `summary`
- 以一个只读 Scratch workspace 渲染整组连接结构
- 每个积木旁显示一句原因
- 不显示模型名、生成时间、追问、诊断、示例或第二段下一步
- 空白作品显示固定起步文案
- AI 降级时只显示“AI 暂时不可用，已使用基础提示”

加载状态：

- 推荐已完成：保留旧结构，显示“正在准备下一步”
- 角色切换或方向偏离：立即隐藏旧结构，只显示简洁加载状态
- 请求失败：显示新的本地基础提示

### 设置与 Key 权限

修改：

- `apps/desktop-companion/src/main/scratch-config-store.ts`
- 新增 `apps/desktop-companion/test/scratch-config-store.test.mjs`
- 视现有文案测试需要修改设置页测试

职责：

- 创建或重写配置文件后显式设置为仅当前用户可读写
- POSIX 目标权限为 `0o600`
- Windows 继续依赖用户配置目录 ACL，不尝试使用无效的 POSIX 权限语义
- 不改变明文 JSON 和手工编辑能力
- 不在日志、渲染状态或异常消息中输出完整 Key

## TDD 垂直切片

### 切片 1：结构化协议与 XML

先写失败测试：

- schema 接受 1–3 个递归节点
- schema 拒绝第 4 个节点、未知关系和额外字段
- `next` 能生成 Blockly `<next>`
- `condition` 能生成对应 `<value>`
- `substack`、`substack2` 能生成对应 `<statement>`
- AI 提供 XML 字符串时协议拒绝

再实现：

- 共享 schema 和 TypeScript 类型
- 推荐树遍历/计数 helper
- 结构 XML 生成

完成标准：

- 协议层无法表达聊天、追问或自由 XML
- XML 完全由客户端模板生成

### 切片 2：CoachService 严格解析与降级

状态：已完成。

先写失败测试：

- system prompt 明确要求按顺序返回具体积木结构
- 返回 1 个或 2 个有效积木时保持原数量
- 未知 opcode 直接丢弃，不做近似替换
- 当前工具箱不可用的 opcode 直接丢弃
- 部分无效时保留剩余有效结构
- 全部无效时使用独立本地基础提示
- 空白作品不会生成“绿旗、移动、说话”起步组合
- 响应不再包含追问、诊断、示例或重复下一步
- 请求上下文只包含短期辅导上下文和压缩作品摘要

再实现：

- 新提示词和严格解析
- 白名单与工具箱交集过滤
- 1–3 个本地基础提示生成器
- 内部错误只写日志

完成标准：

- DeepSeek 返回畸形内容时学生仍能获得安全的基础提示
- 服务层不再补满、不再近似替换

### 切片 3：推荐完成与方向判定

状态：已完成。已新增纯函数 matcher，完成结构匹配和变化分类；尚未接入会话状态机，接入留给切片 4。

先写失败测试：

- 顺序连接正确时完成
- 顺序错误时不完成
- 条件槽正确时完成
- 条件积木散落时不完成
- 子堆栈正确时完成
- 子堆栈位于无关控制积木时不完成
- 参数值不同仍完成
- 新增推荐前缀时为 `following`
- 新增无关结构时为 `diverged`
- 只有参数或坐标变化时为 `unchanged`

再实现：

- 原始 block map 结构读取
- 递归匹配和匹配进度
- 结构签名与变化分类

完成标准：

- 完成判定不依赖界面 XML 文本
- 判定逻辑是纯函数，可用固定 project fixture 验证

### 切片 4：自动/主动会话状态机

状态：已完成。已新增 `CoachingSession` 纯状态机并接入 `SessionManager`；自动模式使用 3 秒静默窗口和 15 秒最短间隔，主动模式绕过自动限频但会避免同一签名重复请求。

先写失败测试：

- 空白作品不请求，出现第一个有效积木后才请求
- 自动变化后等待完整 3 秒静默窗口
- 3 秒内连续变化只处理最新状态
- 两次自动请求至少间隔 15 秒
- 同时最多一个请求运行
- 请求期间变化只追赶最新状态
- `following` 保持旧提示且不请求
- `completed` 保留旧提示，3 秒后请求下一轮
- `diverged` 立即隐藏旧提示，3 秒后请求
- 角色切换立即隐藏旧提示并重新分析
- 主动点击不受 15 秒自动间隔限制
- 主动模式相同签名不重复请求
- 切换作品或退出时清空内存上下文

再实现：

- 可注入时钟的 `CoachingSession`
- `SessionManager` 接入请求原因和状态转换
- 作品/角色会话身份与短期上下文

完成标准：

- 所有时间相关测试使用 fake clock，不使用真实 `setTimeout` 等待
- 自动模式不会因高频积木变化产生请求风暴

### 切片 5：学生端收口

先写失败测试：

- 页面只显示一句总提示
- 推荐以一个连接/嵌套 workspace 渲染
- 最多显示 3 个积木原因，不强制补满
- 不出现模型名、生成时间、追问、示例、诊断或技术错误
- 完成后的加载保留旧推荐
- 偏离和角色切换后的加载隐藏旧推荐
- 空白作品显示固定起步文案
- fallback 只显示通用提示

再实现：

- 合并推荐 workspace
- 原因列表与积木结构按遍历顺序对应
- 收口状态文案和 DOM

完成标准：

- 低年级学生不需要输入文字
- 主界面不存在聊天或完成反馈概念

### 切片 6：设置、安全与回归

先写失败测试：

- 首次配置默认模式为自动
- Flash 仍为默认模型，Pro 只能在设置页选择
- 保存配置后 POSIX 权限为 `0o600`
- 修改已有配置后权限仍收紧
- 清除 Key 后配置中不存在对应字段
- 日志和学生状态不包含完整 Key

再实现：

- 配置文件权限收紧
- 家长费用提示和模式说明文案校准
- 错误脱敏

完成标准：

- 保留明文 JSON 与手工编辑能力
- 安全文档明确说明本地明文风险

## 测试范围

### 单元测试

- 推荐协议 schema
- 推荐树遍历、计数、过滤和签名
- XML 递归生成
- 推荐结构匹配
- 会话状态机与 fake clock
- CoachService prompt、解析、过滤和 fallback
- 配置文件权限与 Key 脱敏

### 组件测试

- `renderer-view` 的 DOM 输出
- Scratch workspace 接收一棵完整推荐树
- 加载、空白、DeepSeek 成功和 fallback 状态
- 设置页模型、模式和费用提示

### 集成测试

- `SessionManager` 接收 bridge payload 后的会话决策
- 单请求运行与最新状态追赶
- 主动/自动模式切换
- 角色切换和作品切换

### 必要真机验证

- macOS 和 Windows 各验证一次真实 Scratch 连接
- 连续拖动积木时不会连续请求
- 按推荐结构完成后刷新下一轮
- 改做另一方向时旧提示立即消失并适应
- 断网或错误 Key 时展示本地基础提示
- 推荐结构在官方 `scratch-blocks` 中无渲染 fallback

## 建议提交顺序

每个切片完成后单独提交，避免协议、状态机和界面同时大改：

1. `feat: 定义结构化积木推荐协议`
2. `feat: 严格校验并过滤 AI 积木推荐`
3. `feat: 识别推荐完成与创作方向变化`
4. `feat: 实现自学辅导会话状态机`
5. `improve: 收口低年级学生提示界面`
6. `fix: 收紧本地 AI 配置文件权限`
7. `docs: 同步自学辅导实现与验收说明`

每次提交前至少执行对应定向测试。切片 4、5、6 完成后执行：

```bash
npm --workspace @scratch-ai/desktop-companion test
npm test
```

## 最终验收

- 空白作品零 AI 请求
- 有效作品只显示一句提示和 1–3 个结构化积木
- 推荐数量不补满，未知积木不替换
- 推荐 XML 只由客户端生成
- 跟随推荐不刷新，整组完成后刷新
- 偏离方向和切换角色后旧提示立即失效
- 自动模式满足 3 秒静默和 15 秒限频
- 主动模式相同作品不重复请求
- AI 错误不暴露给学生
- 退出或切换作品后无辅导历史落盘
- 客户端不修改 Scratch 作品
- 配置文件权限和 Key 脱敏符合设计

## 非目标

- 不建设服务器、账号、班级或教师端
- 不支持其他 AI Provider 或自定义接口地址
- 不提供聊天、文字目标输入或追问
- 不提供语音朗读
- 不提供推荐历史、完成反馈、评分或奖励
- 不自动插入、拖放或连接积木
- 不发送媒体资源、完整 `.sb3` 或原始项目 JSON
