"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";

type WaitlistFormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; leadId: string; redirectTo: string; selectedPlan: string }
  | { status: "error"; message: string };

function readFunnelValue(key: string) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) || "";
}

function searchParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

export function WaitlistLeadForm() {
  const [state, setState] = useState<WaitlistFormState>({ status: "idle" });
  const [variant, setVariant] = useState("direct");
  const [sessionId, setSessionId] = useState("");
  const [pilotGoal, setPilotGoal] = useState("qr-ordering");
  const selectedPlan = useMemo(() => (pilotGoal === "qr-ordering" ? "pro" : "premium"), [pilotGoal]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVariant(readFunnelValue("logivn_funnel_variant") || searchParam("variant") || "direct");
      setSessionId(readFunnelValue("logivn_funnel_session"));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    setState({ status: "submitting" });

    try {
      const response = await fetch("/api/marketing/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          selectedPlan,
          source: payload.source || "waitlist",
          variant,
          sessionId,
          pagePath: "/waitlist",
          utmSource: searchParam("utm_source"),
          utmMedium: searchParam("utm_medium"),
          utmCampaign: searchParam("utm_campaign"),
          utmContent: searchParam("utm_content")
        })
      });
      const result = (await response.json()) as { ok?: boolean; error?: string; data?: { leadId: string; redirectTo: string; selectedPlan: string } };

      if (!response.ok || !result.ok || !result.data) {
        setState({ status: "error", message: result.error || "Chưa gửi được waitlist. Vui lòng thử lại." });
        return;
      }

      setState({
        status: "success",
        leadId: result.data.leadId,
        redirectTo: result.data.redirectTo,
        selectedPlan: result.data.selectedPlan
      });
    } catch {
      setState({ status: "error", message: "Kết nối chưa ổn. Vui lòng thử lại sau ít phút." });
    }
  }

  return (
    <form className="waitlist-form" id="waitlist-form" onSubmit={onSubmit}>
      <input type="hidden" name="source" value="waitlist" />
      <input type="hidden" name="variant" value={variant} />

      <label>
        Tên quán
        <input name="restaurantName" type="text" placeholder="Ví dụ: Nhà Mộc Coffee" autoComplete="organization" />
      </label>

      <label>
        Email hoặc số điện thoại
        <input name="contact" type="text" placeholder="owner@quan.vn hoặc 09..." autoComplete="email" required />
      </label>

      <label>
        Mô hình quán
        <select name="businessType" defaultValue="cafe">
          <option value="cafe">Cafe độc lập</option>
          <option value="milk-tea">Trà sữa</option>
          <option value="restaurant">Nhà hàng phục vụ tại bàn</option>
          <option value="small-eatery">Quán ăn nhỏ</option>
          <option value="chain">Chuỗi F&amp;B nhỏ</option>
        </select>
      </label>

      <fieldset>
        <legend>Mục tiêu pilot</legend>
        <label>
          <input type="radio" name="pilotGoal" value="qr-ordering" checked={pilotGoal === "qr-ordering"} onChange={(event) => setPilotGoal(event.target.value)} />
          <span>QR ordering và order tại bàn</span>
        </label>
        <label>
          <input type="radio" name="pilotGoal" value="ai-operations" checked={pilotGoal === "ai-operations"} onChange={(event) => setPilotGoal(event.target.value)} />
          <span>AI, báo cáo và vận hành sâu hơn</span>
        </label>
        <label>
          <input type="radio" name="pilotGoal" value="staff-inventory" checked={pilotGoal === "staff-inventory"} onChange={(event) => setPilotGoal(event.target.value)} />
          <span>Nhân viên, bàn và tồn kho</span>
        </label>
      </fieldset>

      {state.status === "error" ? <p className="waitlist-form-message is-error">{state.message}</p> : null}
      {state.status === "success" ? (
        <div className="waitlist-form-success" role="status">
          <strong>Đã ghi nhận waitlist.</strong>
          <span>LogiVN đã lưu lead pilot và gợi ý gói {state.selectedPlan.toUpperCase()} cho bước tiếp theo.</span>
          <Link href={state.redirectTo}>
            Tiếp tục tạo tài khoản
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : null}

      <button type="submit" disabled={state.status === "submitting"}>
        {state.status === "submitting" ? "Đang gửi..." : variant === "pilot" ? "Nhận lộ trình pilot" : "Gửi waitlist & tiếp tục"}
        <ArrowRight size={16} />
      </button>
      <p>
        Muốn đi nhanh hơn? <Link href="/dashboard/register?plan=pro&source=waitlist_fast">Tạo quán Pro ngay</Link>
      </p>
    </form>
  );
}
