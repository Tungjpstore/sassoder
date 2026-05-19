export type ActivationReadinessItem = {
  key: string;
  label: string;
  group: string;
  status: "done" | "missing" | "warning";
  priority: "critical" | "high" | "medium" | "low";
  action: string;
  route: string;
  weight: number;
};

export type ActivationReadiness = {
  score: number;
  completedCount: number;
  totalCount: number;
  criticalMissing: ActivationReadinessItem[];
  nextActions: ActivationReadinessItem[];
  items: ActivationReadinessItem[];
};

export type ActivationRunwayTask = {
  key: string;
  label: string;
  action: string;
  route: string;
  status: "done" | "missing" | "warning" | "future";
  priority: "critical" | "high" | "medium" | "low";
  badge: string;
};

export type ActivationLaunchStep = {
  key: "qr-test" | "order-receive" | "payment-close";
  label: string;
  action: string;
  route: string;
  done: boolean;
};

export type ActivationRunway = {
  stage: "launch" | "configure" | "sell" | "scale";
  title: string;
  description: string;
  primaryAction: ActivationRunwayTask;
  secondaryActions: ActivationRunwayTask[];
  futureActions: ActivationRunwayTask[];
  visibleTasks: ActivationRunwayTask[];
  launchSteps: ActivationLaunchStep[];
  launchReady: boolean;
  progressLabel: string;
  riskLabel: string;
};

function badgeFor(item: Pick<ActivationRunwayTask, "status" | "priority">) {
  if (item.status === "done") return "Xong";
  if (item.status === "future") return "Sắp mở";
  if (item.priority === "critical") return "Bắt buộc";
  if (item.priority === "high") return "Nên làm";
  return "Tối ưu";
}

function taskFromReadinessItem(item: ActivationReadinessItem): ActivationRunwayTask {
  return {
    key: item.key,
    label: item.label,
    action: item.action,
    route: item.route,
    status: item.status,
    priority: item.priority,
    badge: badgeFor(item)
  };
}

function futureTask(input: Omit<ActivationRunwayTask, "status" | "badge">): ActivationRunwayTask {
  return {
    ...input,
    status: "future",
    badge: "Sắp mở"
  };
}

export function buildActivationRunway(readiness: ActivationReadiness): ActivationRunway {
  const activeTasks = readiness.nextActions.map(taskFromReadinessItem);
  const firstMissingTask = activeTasks[0] ?? {
    key: "open-orders",
    label: "Nhận đơn thử",
    action: "Mở bảng đơn để chạy thử một bill từ QR đến thanh toán.",
    route: "/dashboard/orders",
    status: "warning",
    priority: "medium",
    badge: "Thử ca"
  } satisfies ActivationRunwayTask;
  const criticalCount = readiness.criticalMissing.length;
  const stage =
    readiness.score < 45 || criticalCount >= 3
      ? "launch"
      : readiness.score < 75 || criticalCount > 0
        ? "configure"
        : readiness.score < 92
          ? "sell"
          : "scale";
  const futureActions = [
    futureTask({
      key: "invite-staff",
      label: "Mời nhân viên vào ca",
      action: "Chuẩn bị role, PIN và quyền để nhân viên có thể nhận đơn, bếp và thanh toán theo ca.",
      route: "/dashboard/staff",
      priority: "medium"
    }),
    futureTask({
      key: "multi-branch",
      label: "Mở chi nhánh tiếp theo",
      action: "Khi quán có thêm điểm bán, LogiVN sẽ tách bàn, đơn, kho và báo cáo theo chi nhánh.",
      route: "/dashboard/settings?section=branches",
      priority: "low"
    })
  ];
  const copy = {
    launch: {
      title: "Quán đã khởi tạo, cần khóa vài mục bắt buộc",
      description: "Ưu tiên menu, bàn QR và VietQR trước. Làm xong các mục này là có thể chạy đơn thử tự tin hơn.",
      riskLabel: `${criticalCount} mục bắt buộc`
    },
    configure: {
      title: "Sắp sẵn sàng bán thật",
      description: "Các phần cốt lõi đã có. Hoàn tất những cấu hình còn thiếu để giảm lỗi khi nhân viên và khách dùng thật.",
      riskLabel: criticalCount > 0 ? `${criticalCount} mục bắt buộc` : "Còn vài tối ưu"
    },
    sell: {
      title: "Có thể bắt đầu nhận đơn thử",
      description: "Nền tảng vận hành đã đủ tốt. Chạy một đơn QR, kiểm tra bếp, thanh toán và trang gọi món công khai.",
      riskLabel: "Sẵn sàng thử ca"
    },
    scale: {
      title: "Checklist cơ bản đã vững",
      description: "Bước tiếp theo là mời nhân viên, chuẩn hóa phân quyền và chuẩn bị mở rộng chi nhánh khi cần.",
      riskLabel: "Sẵn sàng mở rộng"
    }
  } satisfies Record<ActivationRunway["stage"], { title: string; description: string; riskLabel: string }>;
  const visibleTasks = [...activeTasks, ...futureActions].slice(0, 6);
  const hasMenu = readiness.items.some((item) => item.key === "menu-items" && item.status === "done");
  const hasTables = readiness.items.some((item) => item.key === "tables" && item.status === "done");
  const hasPayments = readiness.items.some((item) => item.key === "payments-vietqr" && item.status === "done");
  const launchSteps: ActivationLaunchStep[] = [
    {
      key: "qr-test",
      label: "Scan thử QR bàn",
      action: "Mở trang gọi món như khách, kiểm tra menu và nút đặt món.",
      route: "/dashboard/tables",
      done: hasTables && hasMenu
    },
    {
      key: "order-receive",
      label: "Nhận một đơn thử",
      action: "Tạo đơn mẫu rồi xem đơn đi vào bảng đơn và bếp.",
      route: "/dashboard/orders",
      done: hasTables && hasMenu
    },
    {
      key: "payment-close",
      label: "Đóng bill và đối soát",
      action: "Kiểm tra luồng VietQR hoặc tiền mặt trước khi bán thật.",
      route: "/dashboard/payments",
      done: hasPayments
    }
  ];

  return {
    stage,
    title: copy[stage].title,
    description: copy[stage].description,
    primaryAction: firstMissingTask,
    secondaryActions: activeTasks.slice(1, 3),
    futureActions,
    visibleTasks,
    launchSteps,
    launchReady: launchSteps.every((step) => step.done),
    progressLabel: `${readiness.completedCount}/${readiness.totalCount} mục`,
    riskLabel: copy[stage].riskLabel
  };
}
