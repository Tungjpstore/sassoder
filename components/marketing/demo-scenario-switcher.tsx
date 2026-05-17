"use client";

import { useState } from "react";
import { Check, Clock3, Sparkles } from "lucide-react";

const scenarios = [
  {
    id: "rush",
    label: "Giờ cao điểm",
    title: "19h12, quán bắt đầu đông bàn",
    metric: "+34% order",
    events: ["Bàn 08 gọi thêm topping", "Bàn 12 chờ xác nhận", "AI gợi ý mở thêm nhân sự nhận món"]
  },
  {
    id: "payment",
    label: "Đối soát",
    title: "Khách thanh toán VietQR sau khi ăn",
    metric: "2 hóa đơn",
    events: ["Hóa đơn #1048 chờ VietQR", "Bàn 04 đã thanh toán", "Nhân viên thấy trạng thái ngay trên dashboard"]
  },
  {
    id: "inventory",
    label: "Tồn kho",
    title: "Món bán chạy kéo nguyên liệu xuống nhanh",
    metric: "2 cảnh báo",
    events: ["Sữa tươi còn 18%", "Syrup đào sắp hết cuối tuần", "AI đề xuất kiểm tra định mức combo"]
  }
];

export function DemoScenarioSwitcher() {
  const [activeId, setActiveId] = useState(scenarios[0].id);
  const active = scenarios.find((scenario) => scenario.id === activeId) || scenarios[0];

  return (
    <div className="demo-scenario" aria-label="Mô phỏng nhanh các tình huống vận hành LogiVN">
      <div className="demo-scenario-tabs" role="tablist" aria-label="Chọn tình huống demo">
        {scenarios.map((scenario) => (
          <button
            type="button"
            role="tab"
            aria-selected={scenario.id === activeId}
            className={scenario.id === activeId ? "is-active" : ""}
            key={scenario.id}
            onClick={() => setActiveId(scenario.id)}
          >
            {scenario.label}
          </button>
        ))}
      </div>

      <article className="demo-scenario-panel">
        <div>
          <span>
            <Clock3 size={15} />
            Live simulation
          </span>
          <h3>{active.title}</h3>
        </div>
        <strong>{active.metric}</strong>
        <div className="demo-scenario-events">
          {active.events.map((event) => (
            <p key={event}>
              {event.includes("AI") ? <Sparkles size={15} /> : <Check size={15} />}
              {event}
            </p>
          ))}
        </div>
      </article>
    </div>
  );
}
