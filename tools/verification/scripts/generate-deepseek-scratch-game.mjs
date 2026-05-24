import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const desktopDir = path.join(os.homedir(), "Desktop");
const workspaceDir = process.cwd();
const templateDir = path.join(workspaceDir, "tmp-sb3-inspect");
const buildDir = path.join(workspaceDir, "tmp-deepseek-game-build");
const outputPath = path.join(desktopDir, "DeepSeek-小猫接苹果.sb3");

const ids = {
  score: "var_score_global",
  lives: "var_lives_global",
  start: "broadcast_start",
  win: "broadcast_win",
  lose: "broadcast_lose"
};

function blockId(prefix, index) {
  return `${prefix}_${index}`;
}

function numberShadow(value) {
  return [4, String(value)];
}

function textShadow(value) {
  return [10, String(value)];
}

function valueInput(value) {
  if (typeof value === "number") {
    return [1, numberShadow(value)];
  }
  return [1, textShadow(value)];
}

function nestedReporterInput(block, fallback = 0) {
  return [3, block, numberShadow(fallback)];
}

function nestedTextReporterInput(block, fallback = "") {
  return [3, block, textShadow(fallback)];
}

function booleanInput(block) {
  return [2, block];
}

function substackInput(block) {
  return [2, block];
}

function broadcastInput(name, id) {
  return [1, [11, name, id]];
}

function createTargetBase({ isStage, name }) {
  return {
    isStage,
    name,
    variables: {},
    lists: {},
    broadcasts: {},
    blocks: {},
    comments: {},
    currentCostume: 0,
    costumes: [],
    sounds: [],
    volume: 100
  };
}

function addBlock(target, id, block) {
  target.blocks[id] = {
    shadow: false,
    topLevel: false,
    ...block
  };
  return id;
}

function addMenuBlock(target, id, opcode, parent, fields) {
  target.blocks[id] = {
    opcode,
    next: null,
    parent,
    inputs: {},
    fields,
    shadow: true,
    topLevel: false
  };
  return id;
}

async function clearDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

function md5(content) {
  return crypto.createHash("md5").update(content).digest("hex");
}

async function writeAsset(buildPath, content, extension) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const assetId = md5(buffer);
  const fileName = `${assetId}.${extension}`;
  await fs.writeFile(path.join(buildPath, fileName), buffer);
  return {
    assetId,
    md5ext: fileName,
    dataFormat: extension
  };
}

function createBackdropSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
  <defs>
    <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#9be7ff"/>
      <stop offset="100%" stop-color="#e8fbff"/>
    </linearGradient>
  </defs>
  <rect width="480" height="360" fill="url(#sky)"/>
  <circle cx="410" cy="72" r="34" fill="#fff3b0"/>
  <rect x="0" y="268" width="480" height="92" fill="#9ad06a"/>
  <rect x="0" y="286" width="480" height="74" fill="#7eb24e"/>
  <text x="240" y="58" text-anchor="middle" font-size="28" font-family="Microsoft YaHei, Segoe UI, sans-serif" fill="#18424b">小猫接苹果</text>
  <text x="240" y="88" text-anchor="middle" font-size="14" font-family="Microsoft YaHei, Segoe UI, sans-serif" fill="#24545e">左右键移动，接苹果加分，碰幽灵掉生命</text>
</svg>`;
}

function createAppleSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
  <ellipse cx="30" cy="42" rx="18" ry="20" fill="#f04c4c"/>
  <ellipse cx="49" cy="42" rx="18" ry="20" fill="#db3232"/>
  <path d="M39 14 C41 4, 50 2, 56 8 C49 9, 43 14, 39 21 Z" fill="#6a4a2b"/>
  <path d="M43 16 C57 8, 67 18, 62 28 C56 25, 47 21, 43 16 Z" fill="#55aa55"/>
  <ellipse cx="28" cy="34" rx="4" ry="8" fill="#ffb3b3" opacity="0.55"/>
</svg>`;
}

function createGhostSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="92" height="92" viewBox="0 0 92 92">
  <path d="M20 76 L20 39 C20 24, 31 14, 46 14 C61 14, 72 24, 72 39 L72 76 L62 68 L54 76 L46 68 L38 76 L30 68 Z" fill="#8b7dff"/>
  <circle cx="37" cy="39" r="7" fill="#ffffff"/>
  <circle cx="55" cy="39" r="7" fill="#ffffff"/>
  <circle cx="39" cy="41" r="3" fill="#173b63"/>
  <circle cx="57" cy="41" r="3" fill="#173b63"/>
  <path d="M34 57 Q46 66 58 57" stroke="#4f3ca8" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;
}

function createSignSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" viewBox="0 0 220 140">
  <rect x="14" y="12" width="192" height="96" rx="18" fill="#fff7d6" stroke="#c69a45" stroke-width="6"/>
  <rect x="102" y="108" width="16" height="20" rx="4" fill="#8e6237"/>
  <rect x="82" y="126" width="56" height="8" rx="4" fill="#8e6237"/>
  <text x="110" y="52" text-anchor="middle" font-size="18" font-family="Microsoft YaHei, Segoe UI, sans-serif" fill="#6e4f28">准备开始</text>
  <text x="110" y="78" text-anchor="middle" font-size="12" font-family="Microsoft YaHei, Segoe UI, sans-serif" fill="#6e4f28">绿色旗子开始游戏</text>
</svg>`;
}

function makeStage(backdrop) {
  const stage = createTargetBase({ isStage: true, name: "Stage" });
  stage.variables[ids.score] = ["分数", 0];
  stage.variables[ids.lives] = ["生命", 3];
  stage.broadcasts[ids.start] = "开始";
  stage.broadcasts[ids.win] = "胜利";
  stage.broadcasts[ids.lose] = "失败";
  stage.costumes.push({
    ...backdrop,
    name: "草地",
    rotationCenterX: 240,
    rotationCenterY: 180
  });
  stage.layerOrder = 0;
  stage.tempo = 60;
  stage.videoTransparency = 50;
  stage.videoState = "on";
  stage.textToSpeechLanguage = null;

  const flag = blockId("stage_flag", 1);
  const setScore = blockId("stage_set_score", 1);
  const setLives = blockId("stage_set_lives", 1);
  const showScore = blockId("stage_show_score", 1);
  const showLives = blockId("stage_show_lives", 1);
  const broadcastStart = blockId("stage_broadcast_start", 1);
  const waitUntil = blockId("stage_wait_until", 1);
  const orBlock = blockId("stage_or", 1);
  const scoreGt = blockId("stage_score_gt", 1);
  const livesLt = blockId("stage_lives_lt", 1);
  const scoreReporter = blockId("stage_score_var", 1);
  const livesReporter = blockId("stage_lives_var", 1);
  const ifElse = blockId("stage_if_else", 1);
  const scoreGtWin = blockId("stage_score_gt_win", 1);
  const scoreReporterWin = blockId("stage_score_var_win", 1);
  const broadcastWin = blockId("stage_broadcast_win", 1);
  const broadcastLose = blockId("stage_broadcast_lose", 1);
  const stopAll = blockId("stage_stop_all", 1);

  addBlock(stage, flag, {
    opcode: "event_whenflagclicked",
    next: setScore,
    parent: null,
    inputs: {},
    fields: {},
    topLevel: true,
    x: 24,
    y: 36
  });
  addBlock(stage, setScore, {
    opcode: "data_setvariableto",
    next: setLives,
    parent: flag,
    inputs: {
      VALUE: valueInput(0)
    },
    fields: {
      VARIABLE: ["分数", ids.score]
    }
  });
  addBlock(stage, setLives, {
    opcode: "data_setvariableto",
    next: showScore,
    parent: setScore,
    inputs: {
      VALUE: valueInput(3)
    },
    fields: {
      VARIABLE: ["生命", ids.lives]
    }
  });
  addBlock(stage, showScore, {
    opcode: "data_showvariable",
    next: showLives,
    parent: setLives,
    inputs: {},
    fields: {
      VARIABLE: ["分数", ids.score]
    }
  });
  addBlock(stage, showLives, {
    opcode: "data_showvariable",
    next: broadcastStart,
    parent: showScore,
    inputs: {},
    fields: {
      VARIABLE: ["生命", ids.lives]
    }
  });
  addBlock(stage, broadcastStart, {
    opcode: "event_broadcast",
    next: waitUntil,
    parent: showLives,
    inputs: {
      BROADCAST_INPUT: broadcastInput("开始", ids.start)
    },
    fields: {}
  });
  addBlock(stage, waitUntil, {
    opcode: "control_wait_until",
    next: ifElse,
    parent: broadcastStart,
    inputs: {
      CONDITION: booleanInput(orBlock)
    },
    fields: {}
  });
  addBlock(stage, orBlock, {
    opcode: "operator_or",
    next: null,
    parent: waitUntil,
    inputs: {
      OPERAND1: booleanInput(scoreGt),
      OPERAND2: booleanInput(livesLt)
    },
    fields: {}
  });
  addBlock(stage, scoreGt, {
    opcode: "operator_gt",
    next: null,
    parent: orBlock,
    inputs: {
      OPERAND1: nestedReporterInput(scoreReporter),
      OPERAND2: valueInput(9)
    },
    fields: {}
  });
  addBlock(stage, scoreReporter, {
    opcode: "data_variable",
    next: null,
    parent: scoreGt,
    inputs: {},
    fields: {
      VARIABLE: ["分数", ids.score]
    }
  });
  addBlock(stage, livesLt, {
    opcode: "operator_lt",
    next: null,
    parent: orBlock,
    inputs: {
      OPERAND1: nestedReporterInput(livesReporter),
      OPERAND2: valueInput(1)
    },
    fields: {}
  });
  addBlock(stage, livesReporter, {
    opcode: "data_variable",
    next: null,
    parent: livesLt,
    inputs: {},
    fields: {
      VARIABLE: ["生命", ids.lives]
    }
  });
  addBlock(stage, ifElse, {
    opcode: "control_if_else",
    next: stopAll,
    parent: waitUntil,
    inputs: {
      CONDITION: booleanInput(scoreGtWin),
      SUBSTACK: substackInput(broadcastWin),
      SUBSTACK2: substackInput(broadcastLose)
    },
    fields: {}
  });
  addBlock(stage, scoreGtWin, {
    opcode: "operator_gt",
    next: null,
    parent: ifElse,
    inputs: {
      OPERAND1: nestedReporterInput(scoreReporterWin),
      OPERAND2: valueInput(9)
    },
    fields: {}
  });
  addBlock(stage, scoreReporterWin, {
    opcode: "data_variable",
    next: null,
    parent: scoreGtWin,
    inputs: {},
    fields: {
      VARIABLE: ["分数", ids.score]
    }
  });
  addBlock(stage, broadcastWin, {
    opcode: "event_broadcast",
    next: null,
    parent: ifElse,
    inputs: {
      BROADCAST_INPUT: broadcastInput("胜利", ids.win)
    },
    fields: {}
  });
  addBlock(stage, broadcastLose, {
    opcode: "event_broadcast",
    next: null,
    parent: ifElse,
    inputs: {
      BROADCAST_INPUT: broadcastInput("失败", ids.lose)
    },
    fields: {}
  });
  addBlock(stage, stopAll, {
    opcode: "control_stop",
    next: null,
    parent: ifElse,
    inputs: {},
    fields: {
      STOP_OPTION: ["all", null]
    }
  });

  return stage;
}

function makeCat(costumes) {
  const sprite = createTargetBase({ isStage: false, name: "猫" });
  sprite.costumes.push(
    {
      ...costumes[0],
      name: "猫1",
      bitmapResolution: 1,
      rotationCenterX: 48,
      rotationCenterY: 50
    },
    {
      ...costumes[1],
      name: "猫2",
      bitmapResolution: 1,
      rotationCenterX: 46,
      rotationCenterY: 53
    }
  );
  sprite.layerOrder = 1;
  sprite.visible = true;
  sprite.x = 0;
  sprite.y = -132;
  sprite.size = 95;
  sprite.direction = 90;
  sprite.draggable = false;
  sprite.rotationStyle = "left-right";

  const flag = blockId("cat_flag", 1);
  const goTo = blockId("cat_goto", 1);
  const setStyle = blockId("cat_style", 1);
  const show = blockId("cat_show", 1);

  const receiveStart = blockId("cat_receive_start", 1);
  const forever = blockId("cat_forever", 1);
  const ifLeft = blockId("cat_if_left", 1);
  const keyLeft = blockId("cat_key_left", 1);
  const leftMenu = blockId("cat_key_left_menu", 1);
  const changeLeft = blockId("cat_change_left", 1);
  const ifRight = blockId("cat_if_right", 1);
  const keyRight = blockId("cat_key_right", 1);
  const rightMenu = blockId("cat_key_right_menu", 1);
  const changeRight = blockId("cat_change_right", 1);
  const bounce = blockId("cat_bounce", 1);

  addBlock(sprite, flag, {
    opcode: "event_whenflagclicked",
    next: goTo,
    parent: null,
    inputs: {},
    fields: {},
    topLevel: true,
    x: 24,
    y: 36
  });
  addBlock(sprite, goTo, {
    opcode: "motion_gotoxy",
    next: setStyle,
    parent: flag,
    inputs: {
      X: valueInput(0),
      Y: valueInput(-132)
    },
    fields: {}
  });
  addBlock(sprite, setStyle, {
    opcode: "motion_setrotationstyle",
    next: show,
    parent: goTo,
    inputs: {},
    fields: {
      STYLE: ["left-right", null]
    }
  });
  addBlock(sprite, show, {
    opcode: "looks_show",
    next: null,
    parent: setStyle,
    inputs: {},
    fields: {}
  });

  addBlock(sprite, receiveStart, {
    opcode: "event_whenbroadcastreceived",
    next: forever,
    parent: null,
    inputs: {},
    fields: {
      BROADCAST_OPTION: ["开始", ids.start]
    },
    topLevel: true,
    x: 24,
    y: 212
  });
  addBlock(sprite, forever, {
    opcode: "control_forever",
    next: null,
    parent: receiveStart,
    inputs: {
      SUBSTACK: substackInput(ifLeft)
    },
    fields: {}
  });
  addBlock(sprite, ifLeft, {
    opcode: "control_if",
    next: ifRight,
    parent: forever,
    inputs: {
      CONDITION: booleanInput(keyLeft),
      SUBSTACK: substackInput(changeLeft)
    },
    fields: {}
  });
  addBlock(sprite, keyLeft, {
    opcode: "sensing_keypressed",
    next: null,
    parent: ifLeft,
    inputs: {
      KEY_OPTION: [1, leftMenu]
    },
    fields: {}
  });
  addMenuBlock(sprite, leftMenu, "sensing_keyoptions", keyLeft, {
    KEY_OPTION: ["left arrow", null]
  });
  addBlock(sprite, changeLeft, {
    opcode: "motion_changexby",
    next: null,
    parent: ifLeft,
    inputs: {
      DX: valueInput(-12)
    },
    fields: {}
  });
  addBlock(sprite, ifRight, {
    opcode: "control_if",
    next: bounce,
    parent: forever,
    inputs: {
      CONDITION: booleanInput(keyRight),
      SUBSTACK: substackInput(changeRight)
    },
    fields: {}
  });
  addBlock(sprite, keyRight, {
    opcode: "sensing_keypressed",
    next: null,
    parent: ifRight,
    inputs: {
      KEY_OPTION: [1, rightMenu]
    },
    fields: {}
  });
  addMenuBlock(sprite, rightMenu, "sensing_keyoptions", keyRight, {
    KEY_OPTION: ["right arrow", null]
  });
  addBlock(sprite, changeRight, {
    opcode: "motion_changexby",
    next: null,
    parent: ifRight,
    inputs: {
      DX: valueInput(12)
    },
    fields: {}
  });
  addBlock(sprite, bounce, {
    opcode: "motion_ifonedgebounce",
    next: null,
    parent: forever,
    inputs: {},
    fields: {}
  });

  return sprite;
}

function makeFallingSprite({
  name,
  role,
  costume,
  layerOrder,
  yStep,
  variableName,
  variableId,
  changeBy,
  targetName
}) {
  const sprite = createTargetBase({ isStage: false, name });
  sprite.costumes.push({
    ...costume,
    name,
    bitmapResolution: 1,
    rotationCenterX: 40,
    rotationCenterY: 40
  });
  sprite.layerOrder = layerOrder;
  sprite.visible = true;
  sprite.x = 0;
  sprite.y = 120;
  sprite.size = 85;
  sprite.direction = 90;
  sprite.draggable = false;
  sprite.rotationStyle = "all around";

  const flag = blockId(`${name}_flag`, 1);
  const hide = blockId(`${name}_hide`, 1);
  const receiveStart = blockId(`${name}_receive_start`, 1);
  const show = blockId(`${name}_show`, 1);
  const startGoto = blockId(`${name}_start_goto`, 1);
  const startRandom = blockId(`${name}_start_random`, 1);
  const forever = blockId(`${name}_forever`, 1);
  const changeY = blockId(`${name}_change_y`, 1);
  const ifTouch = blockId(`${name}_if_touch`, 1);
  const touch = blockId(`${name}_touch`, 1);
  const touchMenu = blockId(`${name}_touch_menu`, 1);
  const changeVar = blockId(`${name}_change_var`, 1);
  const resetAfterTouch = blockId(`${name}_reset_touch`, 1);
  const resetRandomTouch = blockId(`${name}_reset_random_touch`, 1);
  const ifLow = blockId(`${name}_if_low`, 1);
  const yLt = blockId(`${name}_y_lt`, 1);
  const yPos = blockId(`${name}_y_pos`, 1);
  const resetAfterLow = blockId(`${name}_reset_low`, 1);
  const resetRandomLow = blockId(`${name}_reset_random_low`, 1);

  addBlock(sprite, flag, {
    opcode: "event_whenflagclicked",
    next: hide,
    parent: null,
    inputs: {},
    fields: {},
    topLevel: true,
    x: 28,
    y: 36
  });
  addBlock(sprite, hide, {
    opcode: "looks_hide",
    next: null,
    parent: flag,
    inputs: {},
    fields: {}
  });

  addBlock(sprite, receiveStart, {
    opcode: "event_whenbroadcastreceived",
    next: show,
    parent: null,
    inputs: {},
    fields: {
      BROADCAST_OPTION: ["开始", ids.start]
    },
    topLevel: true,
    x: 28,
    y: 186
  });
  addBlock(sprite, show, {
    opcode: "looks_show",
    next: startGoto,
    parent: receiveStart,
    inputs: {},
    fields: {}
  });
  addBlock(sprite, startGoto, {
    opcode: "motion_gotoxy",
    next: forever,
    parent: show,
    inputs: {
      X: nestedReporterInput(startRandom),
      Y: valueInput(156)
    },
    fields: {}
  });
  addBlock(sprite, startRandom, {
    opcode: "operator_random",
    next: null,
    parent: startGoto,
    inputs: {
      FROM: valueInput(-210),
      TO: valueInput(210)
    },
    fields: {}
  });
  addBlock(sprite, forever, {
    opcode: "control_forever",
    next: null,
    parent: startGoto,
    inputs: {
      SUBSTACK: substackInput(changeY)
    },
    fields: {}
  });
  addBlock(sprite, changeY, {
    opcode: "motion_changeyby",
    next: ifTouch,
    parent: forever,
    inputs: {
      DY: valueInput(yStep)
    },
    fields: {}
  });
  addBlock(sprite, ifTouch, {
    opcode: "control_if",
    next: ifLow,
    parent: forever,
    inputs: {
      CONDITION: booleanInput(touch),
      SUBSTACK: substackInput(changeVar)
    },
    fields: {}
  });
  addBlock(sprite, touch, {
    opcode: "sensing_touchingobject",
    next: null,
    parent: ifTouch,
    inputs: {
      TOUCHINGOBJECTMENU: [1, touchMenu]
    },
    fields: {}
  });
  addMenuBlock(sprite, touchMenu, "sensing_touchingobjectmenu", touch, {
    TOUCHINGOBJECTMENU: [targetName, null]
  });
  addBlock(sprite, changeVar, {
    opcode: "data_changevariableby",
    next: resetAfterTouch,
    parent: ifTouch,
    inputs: {
      VALUE: valueInput(changeBy)
    },
    fields: {
      VARIABLE: [variableName, variableId]
    }
  });
  addBlock(sprite, resetAfterTouch, {
    opcode: "motion_gotoxy",
    next: null,
    parent: ifTouch,
    inputs: {
      X: nestedReporterInput(resetRandomTouch),
      Y: valueInput(156)
    },
    fields: {}
  });
  addBlock(sprite, resetRandomTouch, {
    opcode: "operator_random",
    next: null,
    parent: resetAfterTouch,
    inputs: {
      FROM: valueInput(-210),
      TO: valueInput(210)
    },
    fields: {}
  });
  addBlock(sprite, ifLow, {
    opcode: "control_if",
    next: null,
    parent: forever,
    inputs: {
      CONDITION: booleanInput(yLt),
      SUBSTACK: substackInput(resetAfterLow)
    },
    fields: {}
  });
  addBlock(sprite, yLt, {
    opcode: "operator_lt",
    next: null,
    parent: ifLow,
    inputs: {
      OPERAND1: nestedReporterInput(yPos),
      OPERAND2: valueInput(-170)
    },
    fields: {}
  });
  addBlock(sprite, yPos, {
    opcode: "motion_yposition",
    next: null,
    parent: yLt,
    inputs: {},
    fields: {}
  });
  addBlock(sprite, resetAfterLow, {
    opcode: "motion_gotoxy",
    next: null,
    parent: ifLow,
    inputs: {
      X: nestedReporterInput(resetRandomLow),
      Y: valueInput(156)
    },
    fields: {}
  });
  addBlock(sprite, resetRandomLow, {
    opcode: "operator_random",
    next: null,
    parent: resetAfterLow,
    inputs: {
      FROM: valueInput(-210),
      TO: valueInput(210)
    },
    fields: {}
  });

  sprite.role = role;
  return sprite;
}

function makeSign(costume) {
  const sprite = createTargetBase({ isStage: false, name: "提示牌" });
  sprite.costumes.push({
    ...costume,
    name: "提示牌",
    bitmapResolution: 1,
    rotationCenterX: 110,
    rotationCenterY: 70
  });
  sprite.layerOrder = 4;
  sprite.visible = true;
  sprite.x = 0;
  sprite.y = 68;
  sprite.size = 100;
  sprite.direction = 90;
  sprite.draggable = false;
  sprite.rotationStyle = "all around";

  const flag = blockId("sign_flag", 1);
  const goTo = blockId("sign_goto", 1);
  const hide = blockId("sign_hide", 1);

  const startReceive = blockId("sign_receive_start", 1);
  const startShow = blockId("sign_start_show", 1);
  const startSay = blockId("sign_start_say", 1);
  const startHide = blockId("sign_start_hide", 1);

  const winReceive = blockId("sign_receive_win", 1);
  const winShow = blockId("sign_win_show", 1);
  const winSay = blockId("sign_win_say", 1);

  const loseReceive = blockId("sign_receive_lose", 1);
  const loseShow = blockId("sign_lose_show", 1);
  const loseSay = blockId("sign_lose_say", 1);

  addBlock(sprite, flag, {
    opcode: "event_whenflagclicked",
    next: goTo,
    parent: null,
    inputs: {},
    fields: {},
    topLevel: true,
    x: 28,
    y: 28
  });
  addBlock(sprite, goTo, {
    opcode: "motion_gotoxy",
    next: hide,
    parent: flag,
    inputs: {
      X: valueInput(0),
      Y: valueInput(68)
    },
    fields: {}
  });
  addBlock(sprite, hide, {
    opcode: "looks_hide",
    next: null,
    parent: goTo,
    inputs: {},
    fields: {}
  });

  addBlock(sprite, startReceive, {
    opcode: "event_whenbroadcastreceived",
    next: startShow,
    parent: null,
    inputs: {},
    fields: {
      BROADCAST_OPTION: ["开始", ids.start]
    },
    topLevel: true,
    x: 28,
    y: 188
  });
  addBlock(sprite, startShow, {
    opcode: "looks_show",
    next: startSay,
    parent: startReceive,
    inputs: {},
    fields: {}
  });
  addBlock(sprite, startSay, {
    opcode: "looks_sayforsecs",
    next: startHide,
    parent: startShow,
    inputs: {
      MESSAGE: valueInput("左右键移动，接苹果，躲幽灵！"),
      SECS: valueInput(2)
    },
    fields: {}
  });
  addBlock(sprite, startHide, {
    opcode: "looks_hide",
    next: null,
    parent: startSay,
    inputs: {},
    fields: {}
  });

  addBlock(sprite, winReceive, {
    opcode: "event_whenbroadcastreceived",
    next: winShow,
    parent: null,
    inputs: {},
    fields: {
      BROADCAST_OPTION: ["胜利", ids.win]
    },
    topLevel: true,
    x: 28,
    y: 348
  });
  addBlock(sprite, winShow, {
    opcode: "looks_show",
    next: winSay,
    parent: winReceive,
    inputs: {},
    fields: {}
  });
  addBlock(sprite, winSay, {
    opcode: "looks_sayforsecs",
    next: null,
    parent: winShow,
    inputs: {
      MESSAGE: valueInput("你赢了！已经接到 10 个苹果！"),
      SECS: valueInput(3)
    },
    fields: {}
  });

  addBlock(sprite, loseReceive, {
    opcode: "event_whenbroadcastreceived",
    next: loseShow,
    parent: null,
    inputs: {},
    fields: {
      BROADCAST_OPTION: ["失败", ids.lose]
    },
    topLevel: true,
    x: 28,
    y: 498
  });
  addBlock(sprite, loseShow, {
    opcode: "looks_show",
    next: loseSay,
    parent: loseReceive,
    inputs: {},
    fields: {}
  });
  addBlock(sprite, loseSay, {
    opcode: "looks_sayforsecs",
    next: null,
    parent: loseShow,
    inputs: {
      MESSAGE: valueInput("生命用完了，再试一次！"),
      SECS: valueInput(3)
    },
    fields: {}
  });

  return sprite;
}

async function buildProject() {
  await clearDir(buildDir);

  const cat1 = await fs.readFile(path.join(templateDir, "bcf454acf82e4504149f7ffe07081dbc.svg"));
  const cat2 = await fs.readFile(path.join(templateDir, "0fb9be3e8397c983338cb71dc84d0b25.svg"));

  const backdrop = await writeAsset(buildDir, createBackdropSvg(), "svg");
  const appleCostume = await writeAsset(buildDir, createAppleSvg(), "svg");
  const ghostCostume = await writeAsset(buildDir, createGhostSvg(), "svg");
  const signCostume = await writeAsset(buildDir, createSignSvg(), "svg");
  const catCostume1 = await writeAsset(buildDir, cat1, "svg");
  const catCostume2 = await writeAsset(buildDir, cat2, "svg");

  const project = {
    targets: [
      makeStage(backdrop),
      makeCat([catCostume1, catCostume2]),
      makeFallingSprite({
        name: "苹果",
        role: "可收集物",
        costume: appleCostume,
        layerOrder: 2,
        yStep: -6,
        variableName: "分数",
        variableId: ids.score,
        changeBy: 1,
        targetName: "猫"
      }),
      makeFallingSprite({
        name: "幽灵",
        role: "敌人",
        costume: ghostCostume,
        layerOrder: 3,
        yStep: -8,
        variableName: "生命",
        variableId: ids.lives,
        changeBy: -1,
        targetName: "猫"
      }),
      makeSign(signCostume)
    ],
    monitors: [],
    extensions: [],
    meta: {
      semver: "3.0.0",
      vm: "0.2.0-prerelease.20220222132735",
      agent: "OpenAI Codex generator for Scratch Desktop"
    }
  };

  await fs.writeFile(path.join(buildDir, "project.json"), JSON.stringify(project), "utf8");
}

async function main() {
  await buildProject();
  console.log(JSON.stringify({ buildDir, outputPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
