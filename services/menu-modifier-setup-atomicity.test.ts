import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSql = readFileSync("supabase/migrations/20260620090000_menu_option_engine_metadata.sql", "utf8");
const menuServiceSource = readFileSync("services/menu-service.ts", "utf8");

function functionBody(source: string, name: string) {
  const match = new RegExp(`(?:export\\s+)?async function ${name}\\(`).exec(source);
  assert.ok(match?.index !== undefined, `${name} should exist`);

  const paramsStart = source.indexOf("(", match.index);
  let parenDepth = 0;
  let paramsEnd = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (parenDepth === 0) {
      paramsEnd = index;
      break;
    }
  }

  const bodyStart = paramsEnd >= 0 ? source.indexOf("{", paramsEnd) : -1;
  assert.ok(bodyStart > match.index, `${name} should have a body`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(bodyStart, index + 1);
  }

  throw new Error(`Could not parse body for ${name}`);
}

test("menu modifier setup replacement is available as one transactional RPC", () => {
  assert.match(migrationSql, /create or replace function public\.replace_menu_modifier_setup/i);
  assert.match(migrationSql, /security invoker/i);
  assert.match(migrationSql, /from public\.menu_items[\s\S]*for update/i);
  assert.match(migrationSql, /update public\.menu_modifier_groups[\s\S]*is_active = false/i);
  assert.match(migrationSql, /insert into public\.menu_modifier_groups/i);
  assert.match(migrationSql, /insert into public\.menu_modifier_options/i);
  assert.match(migrationSql, /pricing_mode/i);
  assert.match(migrationSql, /grant execute on function public\.replace_menu_modifier_setup[\s\S]*to authenticated, service_role/i);
});

test("menu service delegates copy and category apply to the atomic RPC before fallback", () => {
  const copyBody = functionBody(menuServiceSource, "copyMenuModifierSetup");
  const applyBody = functionBody(menuServiceSource, "applyMenuModifierSetupToCategory");

  assert.match(menuServiceSource, /supabase\.rpc\("replace_menu_modifier_setup"/);
  assert.match(copyBody, /replaceModifierGroupsForItemsRpc\(supabase, input\.restaurantId, input\.sourceItemId, \[input\.targetItemId\]\)/);
  assert.match(applyBody, /replaceModifierGroupsForItemsRpc\(supabase, input\.restaurantId, input\.sourceItemId, targetItemIds\)/);
  assert.match(copyBody, /if \(!usedRpc\)/);
  assert.match(applyBody, /if \(!usedRpc\)/);
});
