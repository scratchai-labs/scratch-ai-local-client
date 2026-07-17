export function escapeXml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildFieldXml(name: string, value: unknown, attributes: Record<string, string> = {}) {
  const serializedAttributes = Object.entries(attributes)
    .map(([attributeName, attributeValue]) => ` ${attributeName}="${escapeXml(attributeValue)}"`)
    .join("");
  return `<field name="${escapeXml(name)}"${serializedAttributes}>${escapeXml(value)}</field>`;
}

export function buildElementXml(
  tagName: string,
  blockType: string,
  body: string,
  attributes: Record<string, string> = {}
) {
  const serializedAttributes = Object.entries(attributes)
    .map(([attributeName, attributeValue]) => ` ${attributeName}="${escapeXml(attributeValue)}"`)
    .join("");
  return `<${tagName} type="${escapeXml(blockType)}"${serializedAttributes}>${body}</${tagName}>`;
}

export function buildValueShadowXml(
  inputName: string,
  shadowType: string,
  fieldName: string,
  fieldValue: unknown,
  fieldAttributes: Record<string, string> = {}
) {
  return `<value name="${escapeXml(inputName)}">${buildElementXml(
    "shadow",
    shadowType,
    buildFieldXml(fieldName, fieldValue, fieldAttributes)
  )}</value>`;
}

export function buildValueElementXml(inputName: string, elementXml: string) {
  return `<value name="${escapeXml(inputName)}">${elementXml}</value>`;
}

export function buildShadowFieldBlockXml(
  blockType: string,
  fieldName: string,
  fieldValue: unknown,
  fieldAttributes: Record<string, string> = {}
) {
  return buildElementXml("shadow", blockType, buildFieldXml(fieldName, fieldValue, fieldAttributes));
}

export function buildTextShadowValueXml(inputName: string, text: string) {
  return buildValueShadowXml(inputName, "text", "TEXT", text);
}

export function buildNumberShadowValueXml(inputName: string, value: string) {
  return buildValueShadowXml(inputName, "math_number", "NUM", value);
}

export function buildMenuShadowValueXml(
  inputName: string,
  menuBlockType: string,
  fieldName: string,
  fieldValue: string,
  fieldAttributes: Record<string, string> = {}
) {
  return buildValueElementXml(
    inputName,
    buildShadowFieldBlockXml(menuBlockType, fieldName, fieldValue, fieldAttributes)
  );
}
