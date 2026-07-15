# 使用 Strict Tool Calls 表达推荐积木结构

DeepSeek 推荐积木使用 Beta Strict Function Calling，不再使用 `response_format: json_object` 作为主协议。作品已完成时模型调用完成工具；仍需完善时调用推荐工具，并返回最多五个扁平节点。每个节点显式携带 `id`、`parentId`、`relation`、opcode 和显示参数，客户端再把节点图编译成 `next / condition / substack / substack2` 推荐树。

当前 DeepSeek 模型对递归或 `$ref` 型 Strict Schema 的实际兼容性不稳定，因此协议不依赖递归 Schema，而使用无引用的扁平节点数组。客户端必须复核唯一根节点、父节点存在性、节点数量、连接位置、terminal/cap block、布尔条件、扩展可用性和环路；任何错误均放弃该轮 DeepSeek 推荐并使用本地结构化推荐。

客户端仍然自行生成 Blockly XML，不直接加载 AI 原始 XML，也不执行模型生成的脚本。这样既利用 Strict 保证工具参数的基础字段和类型，又由本地 Scratch 能力规则承担最终连接合法性和渲染安全边界。
