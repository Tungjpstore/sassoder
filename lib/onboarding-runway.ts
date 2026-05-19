export type OnboardingRunwayInput = {
  hasRestaurantInfo: boolean;
  hasPlan: boolean;
  tableCount: number;
  initialMenuItemName?: string | null;
  confirmedMenuItemCount: number;
};

export type OnboardingRunwayTask = {
  id: "profile" | "plan" | "tables" | "menu" | "launch";
  label: string;
  done: boolean;
  targetStep: number;
};

export function buildOnboardingRunway(input: OnboardingRunwayInput) {
  const hasTables = Number.isFinite(input.tableCount) && input.tableCount > 0;
  const hasMenu = input.confirmedMenuItemCount > 0 || Boolean(input.initialMenuItemName?.trim());
  const tasks: OnboardingRunwayTask[] = [
    { id: "profile", label: "Thông tin quán", done: input.hasRestaurantInfo, targetStep: 0 },
    { id: "plan", label: "Gói dịch vụ", done: input.hasPlan, targetStep: 1 },
    { id: "tables", label: "Bàn & QR", done: hasTables, targetStep: 3 },
    { id: "menu", label: "Menu khởi tạo", done: hasMenu, targetStep: 4 },
    { id: "launch", label: "Sẵn sàng tạo quán", done: input.hasRestaurantInfo && input.hasPlan && hasTables && hasMenu, targetStep: 4 }
  ];
  const doneCount = tasks.filter((task) => task.done).length;

  return {
    tasks,
    doneCount,
    progress: Math.round((doneCount / tasks.length) * 100),
    canLaunch: tasks.at(-1)?.done === true
  };
}
export function formatDraftSavedLabel(savedAt: unknown, now = Date.now()) {
  const timestamp = typeof savedAt === "number" ? savedAt : Number(savedAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Chưa lưu nháp";
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (elapsedSeconds < 5) return "Đã lưu vừa xong";
  if (elapsedSeconds < 60) return `Đã lưu ${elapsedSeconds}s trước`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `Đã lưu ${elapsedMinutes} phút trước`;
  return "Đã lưu nháp";
}
