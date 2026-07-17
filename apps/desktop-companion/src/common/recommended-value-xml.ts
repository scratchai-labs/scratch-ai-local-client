import {
  buildElementXml,
  buildFieldXml,
  buildMenuShadowValueXml,
  buildNumberShadowValueXml,
  buildShadowFieldBlockXml,
  buildTextShadowValueXml,
  buildValueElementXml,
  normalizeString
} from "./scratch-xml-primitives";

const SCALAR_VARIABLE_TYPE = "";
const LIST_VARIABLE_TYPE = "list";

export function buildRecommendedVariableIdSuffix(variableName: string) {
  if (/[^\x00-\x7F]/.test(variableName)) {
    return Array.from(variableName)
      .map((char) => char.codePointAt(0)?.toString(36))
      .filter(Boolean)
      .join("-") || "score";
  }

  return variableName.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "score";
}

function buildRecommendedVariableAttributes(variableName: string) {
  const normalizedName = normalizeString(variableName) || "分数";
  const idSuffix = buildRecommendedVariableIdSuffix(normalizedName);
  return {
    id: `variable-${idSuffix}`,
    variabletype: SCALAR_VARIABLE_TYPE
  };
}

export function buildRecommendedVariableFieldXml(variableName: string) {
  return buildFieldXml("VARIABLE", variableName, buildRecommendedVariableAttributes(variableName));
}

function buildVariableReporterBlockXml(variableName: string) {
  return buildElementXml("block", "data_variable", buildRecommendedVariableFieldXml(variableName));
}

function buildAnswerReporterBlockXml() {
  return buildElementXml("block", "sensing_answer", "");
}

export function buildVariableReporterValueXml(inputName: string, variableName: string) {
  return buildValueElementXml(inputName, buildVariableReporterBlockXml(variableName));
}

type FormulaExpressionNode =
  | { kind: "number"; value: string }
  | { kind: "variable"; value: string }
  | { kind: "binary"; opcode: string; left: FormulaExpressionNode; right: FormulaExpressionNode };

function tokenizeFormulaExpression(value: string) {
  const normalized = value
    .replaceAll("（", "(")
    .replaceAll("）", ")")
    .replaceAll("＋", "+")
    .replaceAll("－", "-")
    .replaceAll("＊", "*")
    .replaceAll("／", "/")
    .replaceAll("×", "*")
    .replaceAll("÷", "/");
  const tokens: string[] = [];
  let index = 0;

  while (index < normalized.length) {
    const char = normalized[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const previous = tokens[tokens.length - 1];
    const canStartSignedNumber = !previous || ["(", "+", "-", "*", "/", "%"].includes(previous);
    const numberMatch = normalized
      .slice(index)
      .match(canStartSignedNumber ? /^-?\d+(?:\.\d+)?/ : /^\d+(?:\.\d+)?/);
    if (numberMatch) {
      tokens.push(numberMatch[0]);
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = normalized
      .slice(index)
      .match(/^[A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*/);
    if (identifierMatch) {
      tokens.push(identifierMatch[0]);
      index += identifierMatch[0].length;
      continue;
    }

    if ("()+-*/%".includes(char)) {
      tokens.push(char);
      index += 1;
      continue;
    }

    return [];
  }

  return tokens;
}

function operatorTokenToOpcode(operator: string) {
  switch (operator) {
    case "+":
      return "operator_add";
    case "-":
      return "operator_subtract";
    case "*":
      return "operator_multiply";
    case "/":
      return "operator_divide";
    case "%":
      return "operator_mod";
    default:
      return null;
  }
}

function parseFormulaExpression(value: string): FormulaExpressionNode | null {
  const tokens = tokenizeFormulaExpression(value);
  let index = 0;

  const parsePrimary = (): FormulaExpressionNode | null => {
    const token = tokens[index];
    if (!token) {
      return null;
    }

    if (token === "(") {
      index += 1;
      const expression = parseAdditive();
      if (tokens[index] !== ")") {
        return null;
      }
      index += 1;
      return expression;
    }

    if (/^-?\d+(?:\.\d+)?$/.test(token)) {
      index += 1;
      return { kind: "number", value: token };
    }

    if (/^[A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff]*$/.test(token)) {
      index += 1;
      return { kind: "variable", value: normalizeRecommendedVariableToken(token) ?? token };
    }

    return null;
  };

  const parseMultiplicative = (): FormulaExpressionNode | null => {
    let node = parsePrimary();
    while (node && (tokens[index] === "*" || tokens[index] === "/" || tokens[index] === "%")) {
      const opcode = operatorTokenToOpcode(tokens[index]);
      index += 1;
      const right = parsePrimary();
      if (!opcode || !right) {
        return null;
      }
      node = { kind: "binary", opcode, left: node, right };
    }
    return node;
  };

  const parseAdditive = (): FormulaExpressionNode | null => {
    let node = parseMultiplicative();
    while (node && (tokens[index] === "+" || tokens[index] === "-")) {
      const opcode = operatorTokenToOpcode(tokens[index]);
      index += 1;
      const right = parseMultiplicative();
      if (!opcode || !right) {
        return null;
      }
      node = { kind: "binary", opcode, left: node, right };
    }
    return node;
  };

  const expression = parseAdditive();
  return expression && index === tokens.length ? expression : null;
}

function buildFormulaExpressionElementXml(expression: FormulaExpressionNode): string {
  if (expression.kind === "number") {
    return buildShadowFieldBlockXml("math_number", "NUM", expression.value);
  }

  if (expression.kind === "variable") {
    if (expression.value === "answer" || expression.value === "sensing_answer") {
      return buildAnswerReporterBlockXml();
    }
    if (expression.value === "sensing_distanceto") {
      return buildElementXml(
        "block",
        "sensing_distanceto",
        buildMenuShadowValueXml("DISTANCETOMENU", "sensing_distancetomenu", "DISTANCETOMENU", "鼠标指针")
      );
    }
    return buildVariableReporterBlockXml(expression.value);
  }

  return buildElementXml(
    "block",
    expression.opcode,
    `${buildValueElementXml("NUM1", buildFormulaExpressionElementXml(expression.left))}${buildValueElementXml(
      "NUM2",
      buildFormulaExpressionElementXml(expression.right)
    )}`
  );
}

export function buildFormulaExpressionValueXml(inputName: string, value: string) {
  const expression = parseFormulaExpression(value);
  return expression ? buildValueElementXml(inputName, buildFormulaExpressionElementXml(expression)) : null;
}

function splitRecommendedFunctionArgs(value: string) {
  const args: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of value) {
    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      current += char;
      continue;
    }
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function parseRecommendedFunctionCall(value: string, functionName: string) {
  const match = value.trim().match(new RegExp(`^${functionName}\\((.*)\\)$`, "i"));
  return match?.[1] ? splitRecommendedFunctionArgs(match[1]) : null;
}

export function buildStringOperandValueXml(inputName: string, value: string) {
  if (value.startsWith("text:")) {
    return buildTextShadowValueXml(inputName, value.slice("text:".length));
  }
  return buildFormulaExpressionValueXml(inputName, value) ?? buildTextShadowValueXml(inputName, value);
}

function buildSpecialExpressionElementXml(value: string): string | null {
  const letterArgs = parseRecommendedFunctionCall(value, "letter");
  if (letterArgs?.[0]) {
    return buildElementXml(
      "block",
      "operator_letter_of",
      `${buildFormulaOrNumberValueXml("LETTER", letterArgs[1] || "1", "1")}${buildStringOperandValueXml(
        "STRING",
        letterArgs[0]
      )}`
    );
  }

  const lengthArgs = parseRecommendedFunctionCall(value, "length");
  if (lengthArgs?.[0]) {
    return buildElementXml("block", "operator_length", buildStringOperandValueXml("STRING", lengthArgs[0]));
  }

  const listLengthArgs = parseRecommendedFunctionCall(value, "listlength");
  if (listLengthArgs?.[0]) {
    return buildElementXml("block", "data_lengthoflist", buildRecommendedListFieldXml("LIST", listLengthArgs[0]));
  }

  const roundArgs = parseRecommendedFunctionCall(value, "round");
  if (roundArgs?.[0]) {
    return buildElementXml("block", "operator_round", buildFormulaOrNumberValueXml("NUM", roundArgs[0], "3.6"));
  }

  const joinArgs = parseRecommendedFunctionCall(value, "join");
  if (joinArgs?.[0] && joinArgs[1]) {
    return buildElementXml(
      "block",
      "operator_join",
      `${buildStringOperandValueXml("STRING1", joinArgs[0])}${buildStringOperandValueXml("STRING2", joinArgs[1])}`
    );
  }

  return null;
}

export function buildSpecialExpressionValueXml(inputName: string, value: string) {
  const elementXml = buildSpecialExpressionElementXml(value);
  return elementXml ? buildValueElementXml(inputName, elementXml) : null;
}

export function normalizeRecommendedVariableToken(token: string | undefined) {
  const rawToken = normalizeString(token);
  const normalized = rawToken.toLowerCase();
  if (!normalized) {
    return null;
  }
  if (/^(sum|累加和|总和|合计|和)$/.test(normalized)) {
    return "sum";
  }
  if (/^(i|计数器|计数)$/.test(normalized)) {
    return "i";
  }
  if (/^(n|上限|次数)$/.test(normalized)) {
    return "n";
  }
  if (/^(result|结果|结果变量|计算结果)$/.test(normalized)) {
    return "result";
  }
  if (/^(number|数字|输入的数)$/.test(normalized)) {
    return "number";
  }
  return /^[a-z_][a-z0-9_]*$/i.test(rawToken) ? rawToken : null;
}

export function buildFormulaOrTextValueXml(inputName: string, value: string) {
  return buildSpecialExpressionValueXml(inputName, value) ??
    buildFormulaExpressionValueXml(inputName, value) ??
    buildTextShadowValueXml(inputName, value);
}

export function buildFormulaOrNumberValueXml(inputName: string, value: string, fallback: string) {
  return buildSpecialExpressionValueXml(inputName, value) ??
    buildFormulaExpressionValueXml(inputName, value) ??
    buildNumberShadowValueXml(inputName, fallback);
}

export function buildRecommendedListFieldXml(name = "LIST", value = "清单") {
  return buildFieldXml(name, value, {
    id: `list-${buildRecommendedVariableIdSuffix(value)}`,
    variabletype: LIST_VARIABLE_TYPE
  });
}
