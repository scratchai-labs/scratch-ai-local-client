const CORE_EXTENSION_PREFIXES = new Set([
  "argument",
  "colour",
  "control",
  "data",
  "event",
  "looks",
  "math",
  "motion",
  "operator",
  "procedures",
  "sensing",
  "sound"
]);

const CORE_PROGRAM_AREA_MODULE_LABELS = {
  motion: "运动",
  looks: "外观",
  sound: "声音",
  event: "事件",
  control: "控制",
  sensing: "侦测",
  operator: "运算",
  data: "变量和列表",
  procedures: "自制积木",
  argument: "自制积木",
  colour: "颜色",
  math: "运算"
};

const EXTENSION_PROGRAM_AREA_MODULE_LABELS = {
  boost: "BOOST",
  ev3: "EV3",
  gdxfor: "Go Direct Force & Acceleration",
  makeymakey: "Makey Makey",
  mesh: "Mesh",
  microbit: "micro:bit",
  music: "音乐",
  pen: "画笔",
  text2speech: "文字转语音",
  translate: "翻译",
  videoSensing: "视频侦测",
  wedo2: "WeDo 2.0"
};

const OPCODE_DISPLAY_LABELS = {
  event_whenflagclicked: "当绿旗被点击",
  event_whenkeypressed: "当按下某个键",
  event_whenbroadcastreceived: "当接收到消息",
  event_whenbackdropswitchesto: "当背景切换到",
  event_broadcast: "广播消息",
  event_broadcastandwait: "广播消息并等待",
  motion_movesteps: "移动 10 步",
  motion_turnright: "右转 15 度",
  motion_turnleft: "左转 15 度",
  motion_gotoxy: "移到 x: y:",
  motion_goto: "移到...",
  motion_glidesecstoxy: "在 1 秒内滑行到 x: y:",
  motion_glideto: "滑行到...",
  motion_pointindirection: "面向 90 方向",
  motion_pointtowards: "面向...",
  motion_changexby: "将 x 增加",
  motion_setx: "将 x 设为",
  motion_changeyby: "将 y 增加",
  motion_sety: "将 y 设为",
  motion_ifonedgebounce: "碰到边缘就反弹",
  looks_say: "说",
  looks_sayforsecs: "说 2 秒",
  looks_think: "想",
  looks_thinkforsecs: "想 2 秒",
  looks_show: "显示",
  looks_hide: "隐藏",
  looks_switchcostumeto: "切换造型",
  looks_nextcostume: "下一个造型",
  looks_switchbackdropto: "切换背景",
  looks_changeeffectby: "将特效增加",
  looks_seteffectto: "将特效设为",
  looks_cleargraphiceffects: "清除图形特效",
  looks_changesizeby: "将大小增加",
  looks_setsizeto: "将大小设为",
  looks_gotofrontback: "移到最前面或最后面",
  looks_goforwardbackwardlayers: "前移或后移图层",
  sound_play: "播放声音",
  sound_playuntildone: "播放声音直到播完",
  sound_stopallsounds: "停止所有声音",
  sound_changeeffectby: "将声音特效增加",
  sound_seteffectto: "将声音特效设为",
  sound_cleareffects: "清除声音特效",
  sound_changevolumeby: "将音量增加",
  sound_setvolumeto: "将音量设为",
  control_wait: "等待",
  control_repeat: "重复执行",
  control_forever: "一直重复",
  control_if: "如果",
  control_if_else: "如果否则",
  control_repeat_until: "重复执行直到",
  control_stop: "停止",
  control_create_clone_of: "克隆",
  control_delete_this_clone: "删除此克隆体",
  sensing_touchingobject: "碰到对象？",
  sensing_keypressed: "按下某个键？",
  sensing_mousedown: "鼠标按下？",
  sensing_askandwait: "询问并等待",
  sensing_answer: "回答",
  sensing_distanceto: "到对象的距离",
  operator_equals: "=",
  operator_gt: ">",
  operator_lt: "<",
  operator_add: "+",
  operator_subtract: "-",
  operator_multiply: "×",
  operator_divide: "÷",
  operator_join: "连接",
  operator_letter_of: "第几个字母",
  operator_length: "长度",
  operator_contains: "包含",
  operator_mod: "取模",
  operator_round: "四舍五入",
  operator_mathop: "数学函数",
  data_setvariableto: "将变量设为",
  data_changevariableby: "将变量增加",
  data_showvariable: "显示变量",
  data_hidevariable: "隐藏变量",
  data_addtolist: "加入列表",
  data_deleteoflist: "删除列表第几项",
  data_deletealloflist: "删除列表全部内容",
  data_insertatlist: "插入列表",
  data_replaceitemoflist: "替换列表第几项",
  data_itemoflist: "列表第几项",
  data_itemnumoflist: "列表中项目序号",
  data_lengthoflist: "列表长度",
  data_listcontainsitem: "列表包含项目",
  data_showlist: "显示列表",
  data_hidelist: "隐藏列表",
  pen_clear: "清空",
  pen_penDown: "落笔",
  pen_penUp: "抬笔",
  pen_setPenColorToColor: "将画笔颜色设为",
  pen_changePenSizeBy: "将画笔粗细增加",
  procedures_definition: "定义自制积木",
  procedures_call: "调用自制积木",
  argument_reporter_string_number: "参数"
};

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueSortedStrings(values) {
  return Array.from(
    new Set(
      (values ?? [])
        .map(normalizeString)
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function normalizeExtensionId(prefix) {
  const normalized = normalizeString(String(prefix ?? "")).replace(/[^\w-]/g, "-");
  if (!normalized || CORE_EXTENSION_PREFIXES.has(normalized)) {
    return null;
  }
  return normalized;
}

function getOpcodePrefix(opcode) {
  if (typeof opcode !== "string") {
    return null;
  }
  const separatorIndex = opcode.indexOf("_");
  if (separatorIndex <= 0) {
    return null;
  }
  return opcode.slice(0, separatorIndex);
}

function getExtensionIdForOpcode(opcode) {
  const prefix = getOpcodePrefix(opcode);
  return prefix ? normalizeExtensionId(prefix) : null;
}

function getModuleIdForOpcode(opcode) {
  const prefix = getOpcodePrefix(opcode);
  if (!prefix) {
    return null;
  }
  if (prefix === "argument") {
    return "procedures";
  }
  if (prefix === "math") {
    return "operator";
  }
  if (prefix === "colour") {
    return "colour";
  }
  return CORE_EXTENSION_PREFIXES.has(prefix) ? prefix : normalizeExtensionId(prefix);
}

function getModuleLabelForId(moduleId) {
  if (!moduleId) {
    return null;
  }
  return (
    CORE_PROGRAM_AREA_MODULE_LABELS[moduleId] ??
    EXTENSION_PROGRAM_AREA_MODULE_LABELS[moduleId] ??
    moduleId
  );
}

function getFieldText(fields, key) {
  if (!fields || typeof fields !== "object") {
    return "";
  }

  const rawField = fields[key];
  if (Array.isArray(rawField)) {
    return normalizeString(String(rawField[0] ?? ""));
  }

  if (rawField && typeof rawField === "object") {
    if ("value" in rawField) {
      return normalizeString(String(rawField.value ?? ""));
    }
    if ("name" in rawField) {
      return normalizeString(String(rawField.name ?? ""));
    }
  }

  return normalizeString(String(rawField ?? ""));
}

function getLocalizedKeyName(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) {
    return "某个键";
  }
  if (normalized === "space") {
    return "空格键";
  }
  if (normalized === "any") {
    return "任意键";
  }
  if (normalized === "up arrow") {
    return "上箭头键";
  }
  if (normalized === "down arrow") {
    return "下箭头键";
  }
  if (normalized === "left arrow") {
    return "左箭头键";
  }
  if (normalized === "right arrow") {
    return "右箭头键";
  }

  return normalized.length === 1 ? `${normalized.toUpperCase()} 键` : `${normalized} 键`;
}

function getLocalizedLooksEffectName(value) {
  const normalized = normalizeString(value).toUpperCase();
  if (!normalized) {
    return "特效";
  }

  switch (normalized) {
    case "COLOR":
      return "颜色特效";
    case "FISHEYE":
      return "鱼眼特效";
    case "WHIRL":
      return "旋涡特效";
    case "PIXELATE":
      return "像素化特效";
    case "MOSAIC":
      return "马赛克特效";
    case "BRIGHTNESS":
      return "亮度特效";
    case "GHOST":
      return "虚像特效";
    default:
      return `${normalized.toLowerCase()} 特效`;
  }
}

function getDisplayLabelForOpcode(opcode, fields) {
  const normalizedOpcode = normalizeString(opcode);
  if (!normalizedOpcode) {
    return "未识别积木";
  }

  if (normalizedOpcode === "event_whenkeypressed") {
    return `当按下${getLocalizedKeyName(getFieldText(fields, "KEY_OPTION"))}`;
  }

  if (normalizedOpcode === "sensing_keypressed") {
    return `按下${getLocalizedKeyName(getFieldText(fields, "KEY_OPTION"))}？`;
  }

  if (normalizedOpcode === "event_whenbroadcastreceived") {
    const name = getFieldText(fields, "BROADCAST_OPTION");
    return name ? `当接收到${name}` : OPCODE_DISPLAY_LABELS[normalizedOpcode];
  }

  if (normalizedOpcode === "event_broadcast" || normalizedOpcode === "event_broadcastandwait") {
    const name = getFieldText(fields, "BROADCAST_OPTION");
    if (!name) {
      return OPCODE_DISPLAY_LABELS[normalizedOpcode];
    }
    return normalizedOpcode === "event_broadcastandwait" ? `广播${name}并等待` : `广播${name}`;
  }

  if (normalizedOpcode === "data_setvariableto" || normalizedOpcode === "data_changevariableby") {
    const variableName = getFieldText(fields, "VARIABLE");
    if (!variableName) {
      return OPCODE_DISPLAY_LABELS[normalizedOpcode];
    }
    return normalizedOpcode === "data_setvariableto" ? `将${variableName}设为` : `将${variableName}增加`;
  }

  if (normalizedOpcode === "looks_switchcostumeto") {
    const costumeName = getFieldText(fields, "COSTUME");
    return costumeName ? `切换造型到${costumeName}` : OPCODE_DISPLAY_LABELS[normalizedOpcode];
  }

  if (normalizedOpcode === "looks_switchbackdropto") {
    const backdropName = getFieldText(fields, "BACKDROP");
    return backdropName ? `切换背景到${backdropName}` : OPCODE_DISPLAY_LABELS[normalizedOpcode];
  }

  if (normalizedOpcode === "looks_changeeffectby") {
    return `将${getLocalizedLooksEffectName(getFieldText(fields, "EFFECT"))}增加`;
  }

  if (normalizedOpcode === "looks_seteffectto") {
    return `将${getLocalizedLooksEffectName(getFieldText(fields, "EFFECT"))}设为`;
  }

  if (normalizedOpcode === "sensing_touchingobject") {
    const objectName = getFieldText(fields, "TOUCHINGOBJECTMENU");
    return objectName ? `碰到${objectName}？` : OPCODE_DISPLAY_LABELS[normalizedOpcode];
  }

  if (normalizedOpcode === "motion_pointtowards") {
    const targetName = getFieldText(fields, "TOWARDS");
    return targetName ? `面向${targetName}` : OPCODE_DISPLAY_LABELS[normalizedOpcode];
  }

  const directLabel = OPCODE_DISPLAY_LABELS[normalizedOpcode];
  if (directLabel) {
    return directLabel;
  }

  const moduleLabel = getModuleLabelForId(getModuleIdForOpcode(normalizedOpcode));
  return moduleLabel ? `${moduleLabel}积木` : "其他积木";
}

function getUsedExtensionsFromBlocks(blocks) {
  if (!blocks || typeof blocks !== "object") {
    return [];
  }
  const used = new Set();
  for (const block of Object.values(blocks)) {
    const extensionId = getExtensionIdForOpcode(block?.opcode);
    if (extensionId) {
      used.add(extensionId);
    }
  }
  return uniqueSortedStrings(Array.from(used));
}

function getUsedExtensionsFromProject(project) {
  const used = new Set();
  for (const target of project?.targets ?? []) {
    for (const extensionId of getUsedExtensionsFromBlocks(target?.blocks)) {
      used.add(extensionId);
    }
  }
  for (const monitor of project?.monitors ?? []) {
    const extensionId = getExtensionIdForOpcode(monitor?.opcode);
    if (extensionId) {
      used.add(extensionId);
    }
  }
  for (const extensionId of project?.extensions ?? []) {
    const normalized = normalizeExtensionId(extensionId);
    if (normalized) {
      used.add(normalized);
    }
  }
  return uniqueSortedStrings(Array.from(used));
}

function shouldCountProgramAreaBlock(block) {
  return Boolean(block && typeof block.opcode === "string" && block.shadow !== true);
}

function summarizeProgramAreaModulesFromBlocks(blocks) {
  if (!blocks || typeof blocks !== "object") {
    return [];
  }
  const counts = new Map();
  for (const block of Object.values(blocks)) {
    if (!shouldCountProgramAreaBlock(block)) {
      continue;
    }
    const moduleId = getModuleIdForOpcode(block.opcode);
    if (!moduleId) {
      continue;
    }
    counts.set(moduleId, (counts.get(moduleId) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([id, blockCount]) => ({
      id,
      label: getModuleLabelForId(id) ?? id,
      blockCount
    }))
    .sort((left, right) => {
      if (right.blockCount !== left.blockCount) {
        return right.blockCount - left.blockCount;
      }
      return left.label.localeCompare(right.label, "zh-CN");
    });
}

function pickProjectTarget(project, currentTarget) {
  const targets = Array.isArray(project?.targets) ? project.targets : [];
  if (targets.length === 0) {
    return null;
  }

  const normalizedTarget = currentTarget && typeof currentTarget === "object" ? currentTarget : {};
  const candidateId = normalizeString(normalizedTarget.id);
  const candidateName = normalizeString(normalizedTarget.name);

  if (candidateId) {
    const byId = targets.find((target) => normalizeString(target?.id) === candidateId);
    if (byId) {
      return byId;
    }
  }

  if (candidateName) {
    const byName = targets.find((target) => normalizeString(target?.name) === candidateName);
    if (byName) {
      return byName;
    }
  }

  const firstSprite = targets.find((target) => target?.isStage === false);
  return firstSprite ?? targets[0];
}

function summarizeProgramAreaModulesFromTarget(target) {
  return summarizeProgramAreaModulesFromBlocks(target?.blocks);
}

function summarizeProgramAreaModulesFromProject(project, currentTarget) {
  const target = pickProjectTarget(project, currentTarget);
  return summarizeProgramAreaModulesFromTarget(target);
}

export {
  CORE_EXTENSION_PREFIXES,
  CORE_PROGRAM_AREA_MODULE_LABELS,
  EXTENSION_PROGRAM_AREA_MODULE_LABELS,
  getDisplayLabelForOpcode,
  getExtensionIdForOpcode,
  getModuleIdForOpcode,
  getModuleLabelForId,
  getUsedExtensionsFromBlocks,
  getUsedExtensionsFromProject,
  normalizeExtensionId,
  pickProjectTarget,
  summarizeProgramAreaModulesFromBlocks,
  summarizeProgramAreaModulesFromProject,
  summarizeProgramAreaModulesFromTarget,
  uniqueSortedStrings
};
