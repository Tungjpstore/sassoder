export type PwaPushPermission = "default" | "denied" | "granted" | "unsupported";
export type PwaPushLoadState = "idle" | "loading" | "ready" | "error" | "development";

export type PwaPushNotice = {
  tone: "success" | "warning";
  text: string;
};

export type PwaPushNotificationUiInput = {
  inDashboard: boolean;
  isSettings: boolean;
  supported: boolean;
  configured: boolean;
  hasPublicKey: boolean;
  permission: PwaPushPermission;
  currentSubscribed: boolean;
  activeCount: number;
  dismissed: boolean;
  loadState: PwaPushLoadState;
  notice: PwaPushNotice | null;
};

export type PwaPushNotificationUiModel = {
  shouldRender: boolean;
  tone: "success" | "warning" | "neutral";
  title: string;
  detail: string | null;
  canEnable: boolean;
  canSendTest: boolean;
  canDisable: boolean;
  showClose: boolean;
};

export function resolvePwaPushNotificationUi(input: PwaPushNotificationUiInput): PwaPushNotificationUiModel {
  const canUseWebPush = input.supported && input.configured && input.hasPublicKey && input.loadState === "ready";
  const canEnable =
    input.inDashboard &&
    canUseWebPush &&
    input.permission !== "denied" &&
    input.permission !== "unsupported" &&
    !input.currentSubscribed &&
    (input.isSettings || !input.dismissed);
  const canUseCurrentDeviceTools = input.currentSubscribed && input.isSettings;
  const status = resolveStatus(input);
  const shouldRender = input.inDashboard && (Boolean(input.notice) || input.isSettings || canEnable);

  return {
    shouldRender,
    tone: input.notice?.tone ?? status.tone,
    title: input.notice?.text ?? status.title,
    detail: status.detail,
    canEnable,
    canSendTest: canUseCurrentDeviceTools,
    canDisable: canUseCurrentDeviceTools,
    showClose: !input.isSettings || Boolean(input.notice)
  };
}

function resolveStatus(input: PwaPushNotificationUiInput): Pick<PwaPushNotificationUiModel, "tone" | "title" | "detail"> {
  if (!input.supported) {
    return {
      tone: "warning",
      title: "Trình duyệt này chưa hỗ trợ thông báo đẩy PWA.",
      detail: "Mở bằng Chrome, Edge hoặc Safari có hỗ trợ push; iPhone cần cài PWA ra màn hình chính."
    };
  }

  if (input.loadState === "development") {
    return {
      tone: "warning",
      title: "Web Push chỉ kiểm tra đầy đủ trên bản production.",
      detail: "Hãy dùng domain HTTPS thật để đăng ký và gửi thử thông báo hệ điều hành."
    };
  }

  if (input.loadState === "idle" || input.loadState === "loading") {
    return {
      tone: "neutral",
      title: "Đang kiểm tra Web Push trên thiết bị này.",
      detail: null
    };
  }

  if (input.loadState === "error") {
    return {
      tone: "warning",
      title: "Chưa kiểm tra được Web Push.",
      detail: "Tải lại trang settings rồi thử bật lại thông báo trên thiết bị này."
    };
  }

  if (!input.configured || !input.hasPublicKey) {
    return {
      tone: "warning",
      title: "Web Push chưa cấu hình VAPID trên production.",
      detail: "Cần có public/private key trước khi thiết bị có thể đăng ký endpoint."
    };
  }

  if (input.permission === "denied") {
    return {
      tone: "warning",
      title: "Trình duyệt đang chặn quyền thông báo cho LogiVN.",
      detail: "Mở Site settings của domain này và cho phép Notifications, sau đó quay lại bật Web Push."
    };
  }

  if (input.currentSubscribed) {
    return {
      tone: "success",
      title: "Thiết bị này đang nhận thông báo PWA.",
      detail: input.activeCount > 1 ? `Tài khoản này có ${input.activeCount} thiết bị đang nhận thông báo.` : "Đơn mới, thanh toán chờ xác nhận và yêu cầu phục vụ sẽ báo như app."
    };
  }

  if (input.activeCount > 0) {
    return {
      tone: "neutral",
      title: "Thiết bị này chưa bật Web Push.",
      detail: `Tài khoản có ${input.activeCount} thiết bị khác đang nhận; bật thêm máy này để nhận thông báo như app.`
    };
  }

  return {
    tone: "neutral",
    title: "Bật thông báo vận hành trên thiết bị này.",
    detail: "Đơn mới, thanh toán chờ xác nhận và yêu cầu phục vụ sẽ báo như app."
  };
}
