import assert from "node:assert/strict";
import test from "node:test";

import { resolvePwaPushNotificationUi, type PwaPushNotificationUiInput } from "./push-notification-ui";

const baseInput: PwaPushNotificationUiInput = {
  inDashboard: true,
  isSettings: false,
  supported: true,
  configured: true,
  hasPublicKey: true,
  permission: "default",
  currentSubscribed: false,
  activeCount: 0,
  dismissed: false,
  loadState: "ready",
  notice: null
};

test("PWA push prompt can be enabled on dashboard when this device is eligible", () => {
  const ui = resolvePwaPushNotificationUi(baseInput);

  assert.equal(ui.shouldRender, true);
  assert.equal(ui.canEnable, true);
  assert.equal(ui.canSendTest, false);
  assert.equal(ui.canDisable, false);
  assert.equal(ui.showClose, true);
});

test("PWA push settings distinguishes other subscribed devices from the current device", () => {
  const ui = resolvePwaPushNotificationUi({
    ...baseInput,
    isSettings: true,
    activeCount: 2
  });

  assert.equal(ui.shouldRender, true);
  assert.equal(ui.canEnable, true);
  assert.equal(ui.canSendTest, false);
  assert.equal(ui.canDisable, false);
  assert.match(ui.title, /Thiết bị này chưa bật Web Push/);
  assert.match(ui.detail ?? "", /2 thiết bị khác/);
});

test("PWA push settings exposes test and disable only for the current subscribed device", () => {
  const ui = resolvePwaPushNotificationUi({
    ...baseInput,
    isSettings: true,
    permission: "granted",
    currentSubscribed: true,
    activeCount: 1
  });

  assert.equal(ui.shouldRender, true);
  assert.equal(ui.canEnable, false);
  assert.equal(ui.canSendTest, true);
  assert.equal(ui.canDisable, true);
  assert.equal(ui.tone, "success");
});

test("PWA push prompt stays hidden after dismissal outside settings unless a notice exists", () => {
  const dismissed = resolvePwaPushNotificationUi({
    ...baseInput,
    dismissed: true
  });
  const withNotice = resolvePwaPushNotificationUi({
    ...baseInput,
    dismissed: true,
    notice: { tone: "warning", text: "Không bật được thông báo." }
  });

  assert.equal(dismissed.shouldRender, false);
  assert.equal(withNotice.shouldRender, true);
  assert.equal(withNotice.title, "Không bật được thông báo.");
});

test("PWA push settings renders clear blockers for unsupported and development states", () => {
  const unsupported = resolvePwaPushNotificationUi({
    ...baseInput,
    isSettings: true,
    supported: false,
    permission: "unsupported"
  });
  const development = resolvePwaPushNotificationUi({
    ...baseInput,
    isSettings: true,
    loadState: "development"
  });

  assert.equal(unsupported.shouldRender, true);
  assert.equal(unsupported.canEnable, false);
  assert.match(unsupported.title, /chưa hỗ trợ/);
  assert.equal(development.shouldRender, true);
  assert.equal(development.canEnable, false);
  assert.match(development.title, /production/);
});
